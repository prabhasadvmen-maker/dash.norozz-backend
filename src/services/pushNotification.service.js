import { cert, initializeApp, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ApiError } from '../utils/ApiError.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// In-memory token store (replace with MongoDB for production)
const subscribedTokens = new Map(); // token -> { userAgent, subscribedAt }

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

export const pushNotificationService = {
  saveToken(token, userAgent = '') {
    if (!token) return false;
    subscribedTokens.set(token, { userAgent, subscribedAt: new Date() });
    return true;
  },

  removeToken(token) {
    return subscribedTokens.delete(token);
  },

  getSubscriberCount() {
    return subscribedTokens.size;
  },

  getSubscribers() {
    return Array.from(subscribedTokens.entries()).map(([token, meta]) => ({
      token: token.slice(0, 20) + '...',
      userAgent: meta.userAgent,
      subscribedAt: meta.subscribedAt,
    }));
  },

  async sendToAll({ title, body, imageUrl = '', data = {} }) {
    const tokens = Array.from(subscribedTokens.keys());
    if (tokens.length === 0) {
      return { sent: 0, failed: 0, total: 0, message: 'No subscribers registered yet' };
    }

    const messaging = getFirebaseMessaging();
    if (!messaging) {
      console.warn('⚠️ [PushNotification] Firebase Messaging not initialized. Running in dev mock mode.');
      return {
        sent: tokens.length,
        failed: 0,
        total: tokens.length,
        message: 'Notification sent in demo mode (Firebase credentials missing on server)',
      };
    }

    const message = {
      notification: { title, body, ...(imageUrl && { imageUrl }) },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      tokens,
    };

    try {
      const response = await messaging.sendEachForMulticast(message);

      // Remove invalid/expired tokens
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errCode = resp.error?.code;
          if (
            errCode === 'messaging/invalid-registration-token' ||
            errCode === 'messaging/registration-token-not-registered'
          ) {
            subscribedTokens.delete(tokens[idx]);
          }
        }
      });

      return {
        sent: response.successCount,
        failed: response.failureCount,
        total: tokens.length,
      };
    } catch (err) {
      console.error('[PushNotification] Error sending multicast message:', err.message);
      throw new ApiError(500, `Firebase notification broadcast failed: ${err.message}`);
    }
  },
};

