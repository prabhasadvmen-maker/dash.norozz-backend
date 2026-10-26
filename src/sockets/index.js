import { Server } from 'socket.io';
import { userRepository } from '../repositories/user.repository.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import { ChatMessage } from '../models/chat.model.js';
import { User } from '../models/user.model.js';
import { ROLES } from '../constants/roles.constant.js';
import { verifyAccessToken } from '../helpers/jwt.helper.js';
import { isPartnerEligibleForBooking, resolvePartnerCities } from '../utils/partnerEligibility.js';

let io = null;

// partnerId -> Set of socketIds
const partnerSocketsMap = new Map();

const ADMIN_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.CITY_ADMIN];
const MAX_CHAT_LENGTH = 1000;
const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v || ''));

const getAllowedOrigins = () =>
  [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'https://norozz.in',
    'https://www.norozz.in',
    'https://api.norozz.in',
    ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()) : []),
  ].filter(Boolean);

/**
 * Returns the booking if (and only if) the given user may participate in its realtime channels.
 */
const getAccessibleBooking = async (user, bookingId) => {
  if (!user || !isObjectId(bookingId)) return null;
  const booking = await bookingRepository.model.findById(bookingId).select('customer partner status bookingId');
  if (!booking) return null;
  const uid = String(user._id);
  if (String(booking.customer) === uid) return { booking, role: 'customer' };
  if (booking.partner && String(booking.partner) === uid) return { booking, role: 'partner' };
  if (ADMIN_ROLES.includes(user.role)) return { booking, role: 'admin' };
  return null;
};

/**
 * Initialize Socket.io Server
 */
export const initSockets = (httpServer) => {
  const allowedOrigins = getAllowedOrigins();

  io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => {
        if (!origin || process.env.NODE_ENV !== 'production' || allowedOrigins.includes(origin)) return cb(null, true);
        return cb(new Error('Origin not allowed by CORS'));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    maxHttpBufferSize: 1e6,
  });

  // ─── Authentication: every socket must present a valid access token ───────────────
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) return next(new Error('Unauthorized: token missing'));

      const decoded = verifyAccessToken(token);
      const user = await User.findById(decoded.id).select('name role status kycStatus');
      if (!user || user.status === 'deleted') return next(new Error('Unauthorized: invalid user'));

      socket.user = user;
      return next();
    } catch {
      return next(new Error('Unauthorized: invalid or expired token'));
    }
  });

  console.log('⚡ Socket.io Real-Time Dispatcher Server Initialized');

  io.on('connection', (socket) => {
    const authUser = socket.user;
    const authUserId = String(authUser._id);

    // Every authenticated socket is placed in its own private room
    socket.join(`user_${authUserId}`);
    if (authUser.role === ROLES.CUSTOMER) socket.join(`customer_${authUserId}`);

    // 1. PARTNER JOIN ROOM (identity comes from the verified token, never from the client payload)
    socket.on('join_partner', async (data) => {
      try {
        if (authUser.role !== ROLES.PARTNER) return;

        const partner = await userRepository.findById(authUserId);
        if (!partner || partner.status !== 'active' || partner.kycStatus !== 'approved') {
          return socket.emit('partner_connected', {
            success: false,
            message: `Account is ${partner?.status || 'inactive'}. Please contact City Admin to activate your account.`,
            partnerId: authUserId,
            status: partner?.status || 'disabled',
          });
        }

        socket.partnerId = authUserId;
        socket.join(`partner_${authUserId}`);
        socket.join('all_online_partners');

        if (!partnerSocketsMap.has(authUserId)) partnerSocketsMap.set(authUserId, new Set());
        partnerSocketsMap.get(authUserId).add(socket.id);

        // The client reports the partner's own online/offline toggle; a plain connect never forces them online.
        const presence = { lastSeenAt: new Date() };
        if (typeof data?.online === 'boolean') presence.isOnline = data.online;
        await userRepository.model.findByIdAndUpdate(authUserId, presence);

        socket.emit('partner_connected', {
          success: true,
          message: 'Connected to real-time job dispatch network',
          partnerId: authUserId,
        });
      } catch (err) {
        console.error('Error in join_partner socket handler:', err);
      }
    });

    // 1a. CUSTOMER / USER JOIN ROOM
    socket.on('join_user', () => {
      socket.emit('user_connected', { success: true, userId: authUserId });
    });

    // 1b. JOIN BOOKING CHAT ROOM (participants only)
    socket.on('join_chat_room', async (data) => {
      try {
        const { bookingId } = data || {};
        const access = await getAccessibleBooking(authUser, bookingId);
        if (!access) return socket.emit('chat_room_joined', { success: false, bookingId, message: 'Not allowed' });

        const chatRoom = `chat_booking_${bookingId}`;
        socket.join(chatRoom);
        socket.emit('chat_room_joined', { success: true, bookingId, room: chatRoom });
      } catch (err) {
        console.error('Error in join_chat_room socket handler:', err);
      }
    });

    // 1c. SEND REAL-TIME CHAT MESSAGE (sender identity from the token)
    socket.on('send_chat_message', async (data) => {
      try {
        const { bookingId, message } = data || {};
        const trimmedMsg = String(message || '').trim().slice(0, MAX_CHAT_LENGTH);
        if (!bookingId || !trimmedMsg) return;

        const access = await getAccessibleBooking(authUser, bookingId);
        if (!access || access.role === 'admin') return;
        const { booking, role } = access;

        const chatMsg = await ChatMessage.create({
          booking: String(bookingId),
          bookingRef: String(bookingId),
          sender: authUserId,
          senderName: authUser.name || 'User',
          senderRole: role,
          message: trimmedMsg,
          timestamp: new Date(),
        });

        const msgPayload = {
          _id: chatMsg._id,
          booking: String(bookingId),
          sender: authUserId,
          senderName: authUser.name || 'User',
          senderRole: role,
          message: trimmedMsg,
          timestamp: chatMsg.timestamp,
        };

        // Only the two participants ever receive the message
        const rooms = [`chat_booking_${bookingId}`, `user_${String(booking.customer)}`];
        if (booking.partner) rooms.push(`user_${String(booking.partner)}`);
        io.to(rooms).emit('new_chat_message', msgPayload);
        io.to(rooms.slice(1)).emit('new_chat_notification', msgPayload);
      } catch (err) {
        console.error('Error in send_chat_message socket handler:', err);
      }
    });

    // 2. ATOMIC FIRST-COME, FIRST-SERVED JOB CLAIM (shared logic with the REST endpoint)
    socket.on('claim_job', async (data) => {
      try {
        const { bookingId } = data || {};
        if (!isObjectId(bookingId)) {
          return socket.emit('claim_result', { success: false, message: 'Invalid claim data' });
        }
        const { bookingService } = await import('../services/booking.service.js');
        const partner = await userRepository.findById(authUserId);
        const result = await bookingService.claimJobOffer(bookingId, partner);
        socket.emit('claim_result', { success: true, message: result.message, booking: result.booking });
      } catch (err) {
        socket.emit('claim_result', {
          success: false,
          message: err?.statusCode ? err.message : 'Server error claiming job request.',
          bookingId: data?.bookingId,
        });
      }
    });

    // 2b. LIVE PARTNER LOCATION -> customer (only the assigned partner, only while travelling to the job)
    const lastLocationAt = new Map();
    socket.on('partner_location', async (data) => {
      try {
        if (authUser.role !== ROLES.PARTNER) return;
        const { bookingId } = data || {};
        const lat = Number(data?.lat);
        const lng = Number(data?.lng);
        if (!isObjectId(bookingId) || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;

        const now = Date.now();
        if (now - (lastLocationAt.get(bookingId) || 0) < 3000) return; // throttle
        lastLocationAt.set(bookingId, now);

        const booking = await bookingRepository.model.findOne({
          _id: bookingId,
          partner: authUserId,
          status: { $in: ['Accepted', 'On The Way'] },
        }).select('customer');
        if (!booking) return;

        io.to(`user_${String(booking.customer)}`).emit('partner_location_update', { bookingId, lat, lng, at: new Date() });
        await userRepository.model.findByIdAndUpdate(authUserId, { 'locationCoordinates.lat': lat, 'locationCoordinates.lng': lng });
      } catch (err) {
        console.error('Error in partner_location handler:', err.message);
      }
    });

    // 3. WEBRTC VOICE CALL SIGNALING (participants of the booking only)
    const voiceRoom = async (data) => {
      const roomKey = data?.conversationId || data?.bookingId;
      const access = await getAccessibleBooking(authUser, roomKey);
      if (!access) return null;
      return { roomKey, ...access };
    };

    socket.on('voice:call:initiate', async (data, ack) => {
      try {
        const ctx = await voiceRoom(data);
        if (!ctx) return typeof ack === 'function' && ack({ success: false, error: 'Not allowed' });

        const incomingPayload = {
          conversationId: ctx.roomKey,
          bookingId: ctx.roomKey,
          fromSocketId: socket.id,
          callerName: authUser.name || 'Norozz User',
          callerRole: ctx.role,
          startedAt: new Date(),
        };

        const { booking } = ctx;
        const other = ctx.role === 'customer' ? booking.partner : booking.customer;
        if (other) io.to(`user_${String(other)}`).emit('voice:call:incoming', incomingPayload);
        socket.to(`chat_booking_${ctx.roomKey}`).emit('voice:call:incoming', incomingPayload);

        if (typeof ack === 'function') ack({ success: true, message: 'Call ringing...' });
      } catch (err) {
        if (typeof ack === 'function') ack({ success: false, error: err.message });
      }
    });

    const relayVoiceEvent = (eventName, buildPayload) => {
      socket.on(eventName, async (data, ack) => {
        try {
          const ctx = await voiceRoom(data);
          if (!ctx) return typeof ack === 'function' && ack({ success: false });
          const payload = buildPayload(ctx, data);
          const room = `chat_booking_${ctx.roomKey}`;
          const suffix = eventName.replace('voice:call:', '');
          const outName = { accept: 'accepted', reject: 'rejected', end: 'ended' }[suffix];
          socket.to(room).emit(`voice:call:${outName}`, payload);
          socket.to(room).emit(`voice:call:${outName}:${ctx.roomKey}`, payload);
          if (typeof ack === 'function') ack({ success: true });
        } catch (err) {
          console.error(`Error in ${eventName}:`, err);
        }
      });
    };

    relayVoiceEvent('voice:call:accept', (ctx) => ({
      conversationId: ctx.roomKey,
      bookingId: ctx.roomKey,
      acceptedBySocketId: socket.id,
      acceptedAt: new Date(),
    }));
    relayVoiceEvent('voice:call:reject', (ctx, d) => ({
      conversationId: ctx.roomKey,
      bookingId: ctx.roomKey,
      reason: String(d?.reason || 'User busy').slice(0, 100),
    }));
    relayVoiceEvent('voice:call:end', (ctx) => ({
      conversationId: ctx.roomKey,
      bookingId: ctx.roomKey,
      endedBySocketId: socket.id,
      endedAt: new Date(),
    }));

    const relaySignal = (eventName) => {
      socket.on(eventName, async (data) => {
        try {
          const ctx = await voiceRoom(data);
          if (!ctx) return;
          socket.to(`chat_booking_${ctx.roomKey}`).emit(eventName, {
            conversationId: ctx.roomKey,
            bookingId: ctx.roomKey,
            senderSocketId: socket.id,
            ...(data?.signal ? { signal: data.signal } : {}),
          });
        } catch (err) {
          console.error(`Error in ${eventName} relay:`, err);
        }
      });
    };
    relaySignal('voice:signal');
    relaySignal('voice:signal:ready');

    // 4. DISCONNECT HANDLER
    socket.on('disconnect', async () => {
      if (socket.partnerId && partnerSocketsMap.has(socket.partnerId)) {
        const socketSet = partnerSocketsMap.get(socket.partnerId);
        socketSet.delete(socket.id);
        if (socketSet.size === 0) {
          partnerSocketsMap.delete(socket.partnerId);
          try {
            await userRepository.model.findByIdAndUpdate(socket.partnerId, { isOnline: false, lastSeenAt: new Date() });
          } catch (e) {
            console.warn('Failed to mark partner offline on disconnect:', e.message);
          }
        }
      }
    });
  });

  return io;
};

/**
 * Realtime helpers used by services
 */
export const emitToUser = (userId, event, payload) => {
  if (!io || !userId) return;
  io.to(`user_${String(userId._id || userId)}`).emit(event, payload);
};

export const emitToAllPartners = (event, payload) => {
  if (!io) return;
  io.to('all_online_partners').emit(event, payload);
};

/**
 * Tell both parties of a booking that its state changed (frontends refetch / merge on this event).
 */
export const notifyBookingUpdate = (booking, extra = {}) => {
  if (!io || !booking) return;
  const payload = {
    bookingId: String(booking._id),
    bookingNumber: booking.bookingId,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    ...extra,
  };
  const customerId = booking.customer?._id || booking.customer;
  const partnerId = booking.partner?._id || booking.partner;
  if (customerId) io.to(`user_${String(customerId)}`).emit('booking_updated', payload);
  if (partnerId) io.to(`user_${String(partnerId)}`).emit('booking_updated', payload);
};

/**
 * Broadcast real-time job offer to eligible online partners
 * (category + services + GPS radius / city, via the shared eligibility rules)
 */
export const dispatchNewJobOffer = async (booking) => {
  if (!io) {
    console.warn('Socket.io server not initialized yet. Skipping real-time dispatch broadcast.');
    return [];
  }

  try {
    const categoryObj = typeof booking.category === 'object' && booking.category?.name ? booking.category : null;
    const categoryId = booking.category?._id ? String(booking.category._id) : String(booking.category || '');
    const categoryName = categoryObj?.name || 'Home Services';

    const serviceObj = typeof booking.service === 'object' && booking.service?.name ? booking.service : null;
    const serviceId = booking.service?._id ? String(booking.service._id) : String(booking.service || '');
    const serviceName = serviceObj?.name || booking.packageName || 'Service Request';

    const bookingCity = booking.city || booking.address?.city || '';
    const addressLine = booking.address?.addressLine || `${bookingCity} Operational Area`;

    const partners = await userRepository.model
      .find({ role: ROLES.PARTNER, status: 'active', kycStatus: 'approved', isOnline: true })
      .lean();
    await resolvePartnerCities(partners);

    const eligiblePartners = partners.filter((p) => isPartnerEligibleForBooking(p, booking, { requireOnline: true }));

    const offerPayload = {
      bookingId: booking._id,
      bookingNumber: booking.bookingId || `UC-${booking._id.toString().slice(-5).toUpperCase()}`,
      serviceTitle: booking.packageName || serviceName,
      serviceId,
      categoryName,
      categoryId,
      customerName: booking.customer?.name || 'Customer',
      address: `${booking.address?.title ? booking.address.title + ': ' : ''}${addressLine}, ${bookingCity}`,
      city: bookingCity,
      amount: booking.amount,
      // partner-facing money breakdown only (no customer payment details)
      financialSnapshot: booking.financialSnapshot,
      timeSlot: booking.timeSlot,
      createdAt: new Date(),
      expirySeconds: 60,
    };

    eligiblePartners.forEach((partner) => {
      io.to(`partner_${partner._id}`).emit('new_job_offer', offerPayload);
    });

    console.log(`📢 Dispatched booking [${offerPayload.bookingNumber}] to ${eligiblePartners.length} eligible online partners`);
    return eligiblePartners.map((p) => String(p._id));
  } catch (err) {
    console.error('Error in dispatchNewJobOffer helper:', err);
    return [];
  }
};

export const getIO = () => {
  if (!io) throw new Error('Socket.io has not been initialized yet!');
  return io;
};

export const getSocketServer = () => io;
