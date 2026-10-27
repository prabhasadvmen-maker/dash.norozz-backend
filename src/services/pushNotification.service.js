import { cert, initializeApp, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ApiError } from '../utils/ApiError.js';
import { PushToken } from '../models/pushToken.model.js';
import { PushBroadcast } from '../models/pushBroadcast.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let messagingInstance = null;

function loadServiceAccount() {
  // 1. Try process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const envPath = path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    if (fs.existsSync(envPath)) {
      try {
        const raw = fs.readFileSync(envPath, 'utf8');
        return JSON.parse(raw);
      } catch (err) {
        console.error('[Firebase] Failed to parse file at FIREBASE_SERVICE_ACCOUNT_PATH:', err.message);
      }
    }
  }

  // 2. Try JSON env variable string
  const jsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (jsonEnv) {
    try {
      return JSON.parse(jsonEnv);
    } catch (err) {
      console.error('[Firebase] Failed to parse FIREBASE_SERVICE_ACCOUNT env JSON:', err.message);
    }
  }

  // 3. Fallback candidate file locations
  const candidatePaths = [
    path.resolve(process.cwd(), 'norozz-firebase-adminsdk-fbsvc-d0e7486310.json'),
    path.resolve(process.cwd(), 'firebase-service-account.json'),
    path.resolve(__dirname, '../../norozz-firebase-adminsdk-fbsvc-d0e7486310.json'),
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      try {
        const raw = fs.readFileSync(candidate, 'utf8');
        return JSON.parse(raw);
      } catch (err) {
        console.error(`[Firebase] Failed to parse JSON file at ${candidate}:`, err.message);
      }
    }
  }

  return null;
}

function getFirebaseMessaging() {
  if (messagingInstance) return messagingInstance;

  try {
    if (getApps().length === 0) {
      const serviceAccount = loadServiceAccount();
      if (!serviceAccount) {
        console.warn('⚠️ [Firebase] Service Account key not found. Firebase Push Notifications are unconfigured.');
        return null;
      }

      initializeApp({ credential: cert(serviceAccount) });
      console.log('✅ [Firebase] Initialized successfully');
    }

    messagingInstance = getMessaging();
    return messagingInstance;
  } catch (err) {
    console.error('❌ [Firebase] Initialization error:', err.message);
    return null;
  }
}

// FCM accepts at most 500 tokens per multicast call
const FCM_BATCH = 500;
const AUDIENCE_ROLE = { customers: 'customer', partners: 'partner' };
const DEAD_TOKEN_CODES = new Set(['messaging/invalid-registration-token', 'messaging/registration-token-not-registered']);
// Real FCM web tokens are ~150+ characters; anything much shorter is a placeholder from an old client build
const MIN_TOKEN_LENGTH = 100;

const audienceFilter = (audience) => (AUDIENCE_ROLE[audience] ? { role: AUDIENCE_ROLE[audience] } : {});

export const pushNotificationService = {
  /** Register (or re-assign, on a shared device) a real FCM token. Idempotent. */
  async saveToken({ token, userId = null, role = '', userAgent = '' }) {
    if (!token || typeof token !== 'string' || token.length < MIN_TOKEN_LENGTH) return false;
    await PushToken.findOneAndUpdate(
      { token },
      { $set: { user: userId, role, userAgent: String(userAgent).slice(0, 300), lastSeenAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return true;
  },

  async removeToken(token) {
    const res = await PushToken.deleteOne({ token });
    return res.deletedCount > 0;
  },

  /** Subscriber counts per audience, plus whether the server can actually reach Firebase. */
  async getSummary() {
    const rows = await PushToken.aggregate([{ $group: { _id: '$role', n: { $sum: 1 } } }]);
    const byRole = Object.fromEntries(rows.map((r) => [r._id || 'unknown', r.n]));
    return {
      total: rows.reduce((sum, r) => sum + r.n, 0),
      customers: byRole.customer || 0,
      partners: byRole.partner || 0,
      firebaseConfigured: Boolean(getFirebaseMessaging()),
    };
  },

  async getSubscriberCount() {
    return PushToken.countDocuments();
  },

  async getSubscribers() {
    const rows = await PushToken.find().sort({ lastSeenAt: -1 }).limit(200).lean();
    return rows.map((r) => ({ token: `${r.token.slice(0, 20)}...`, role: r.role, userAgent: r.userAgent, subscribedAt: r.createdAt }));
  },

  async getHistory(limit = 15) {
    return PushBroadcast.find().sort({ createdAt: -1 }).limit(Math.min(50, Math.max(1, Number(limit) || 15))).lean();
  },

  async sendToAll({ title, body, imageUrl = '', link = '', audience = 'all', sentBy = null, sentByName = '' }) {
    // Drop placeholder tokens saved by old client builds before they cause failures
    await PushToken.deleteMany({ $expr: { $lt: [{ $strLenCP: '$token' }, MIN_TOKEN_LENGTH] } });
    const tokens = (await PushToken.find(audienceFilter(audience)).select('token').lean()).map((t) => t.token);
    const record = { title, body, imageUrl, link, audience, total: tokens.length, sentBy, sentByName };

    if (tokens.length === 0) {
      return { sent: 0, failed: 0, total: 0, delivered: false, message: 'No subscribers have turned on notifications for this audience yet.' };
    }

    const messaging = getFirebaseMessaging();
    if (!messaging) {
      // Never report a send that did not happen
      await PushBroadcast.create({ ...record, sent: 0, failed: 0, delivered: false });
      return { sent: 0, failed: 0, total: tokens.length, delivered: false, message: 'Push service is not configured on the server (Firebase credentials are missing). Nothing was sent.' };
    }

    const data = link ? { link: String(link) } : {};
    let sent = 0;
    let failed = 0;
    const dead = [];
    const reasons = new Map();

    try {
      for (let i = 0; i < tokens.length; i += FCM_BATCH) {
        const batch = tokens.slice(i, i + FCM_BATCH);
        const response = await messaging.sendEachForMulticast({
          notification: { title, body, ...(imageUrl && { imageUrl }) },
          data,
          tokens: batch,
        });
        sent += response.successCount;
        failed += response.failureCount;
        response.responses.forEach((resp, idx) => {
          if (resp.success) return;
          const code = resp.error?.code || 'unknown';
          reasons.set(code, (reasons.get(code) || 0) + 1);
          // "invalid-argument" on one token while others in the same call succeeded means that token itself is malformed
          const badToken = DEAD_TOKEN_CODES.has(code) || (code === 'messaging/invalid-argument' && response.successCount > 0);
          if (badToken) dead.push(batch[idx]);
        });
      }
    } catch (err) {
      console.error('[PushNotification] Error sending multicast message:', err.message);
      throw new ApiError(500, `Firebase notification broadcast failed: ${err.message}`);
    }

    // Drop tokens Firebase says no longer exist so the count stays honest
    if (dead.length) await PushToken.deleteMany({ token: { $in: dead } });
    const failureReasons = [...reasons.entries()].map(([code, count]) => ({ code, count }));
    await PushBroadcast.create({ ...record, sent, failed, delivered: sent > 0, failureReasons });

    return { sent, failed, total: tokens.length, delivered: sent > 0, removedStale: dead.length, failureReasons };
  },
};
