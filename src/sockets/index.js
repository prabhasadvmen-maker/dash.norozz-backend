import { Server } from 'socket.io';
import { userRepository } from '../repositories/user.repository.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import { ChatMessage } from '../models/chat.model.js';
import { ROLES } from '../constants/roles.constant.js';
import { isWithinOperatingRadius } from '../utils/distance.util.js';

let io = null;

// Store partner sockets: partnerId -> Set of socketIds
const partnerSocketsMap = new Map();

/**
 * Initialize Socket.io Server
 * @param {Object} httpServer Node.js HTTP Server instance
 */
export const initSockets = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
    },
    transports: ['websocket', 'polling'],
  });

  console.log('⚡ Socket.io Real-Time Dispatcher Server Initialized');

  io.on('connection', (socket) => {
    console.log(`🔌 Client connected to Socket.io: ${socket.id}`);

    // 1. PARTNER JOIN ROOM
    socket.on('join_partner', async (data) => {
      try {
        const { partnerId, category, city } = data || {};
        if (!partnerId) return;

        socket.partnerId = partnerId;
        socket.partnerCategory = category || '';
        socket.partnerCity = city || 'Delhi NCR';

        // Join individual partner room
        const partnerRoom = `partner_${partnerId}`;
        socket.join(partnerRoom);

        // Join Category & City Room (e.g. category_Beauty & Salon_Jaunpur)
        const catStr = typeof category === 'object' ? (category?.name || category?._id || '') : String(category || '');
        const cityStr = String(city || 'Jaunpur').trim();
        if (catStr && catStr.trim()) {
          const categoryRoom = `category_${catStr.trim()}_${cityStr}`;
          socket.join(categoryRoom);
          console.log(`👤 Partner ${partnerId} joined category room: [${categoryRoom}]`);
        }

        // Join All Online Partners Room
        socket.join('all_online_partners');

        // Track partner socket ID
        if (!partnerSocketsMap.has(partnerId)) {
          partnerSocketsMap.set(partnerId, new Set());
        }
        partnerSocketsMap.get(partnerId).add(socket.id);

        socket.emit('partner_connected', {
          success: true,
          message: 'Connected to real-time job dispatch network',
          partnerId,
        });
      } catch (err) {
        console.error('Error in join_partner socket handler:', err);
      }
    });

    // 1a. CUSTOMER / USER JOIN ROOM
    socket.on('join_user', async (data) => {
      try {
        const { userId } = data || {};
        if (!userId) return;

        socket.userId = userId;
        const userRoom = `user_${userId}`;
        const customerRoom = `customer_${userId}`;
        socket.join(userRoom);
        socket.join(customerRoom);

        console.log(`👤 Customer/User ${userId} joined socket room: [${userRoom}] & [${customerRoom}]`);
        socket.emit('user_connected', { success: true, userId });
      } catch (err) {
        console.error('Error in join_user socket handler:', err);
      }
    });

    // 1b. JOIN BOOKING CHAT ROOM
    socket.on('join_chat_room', (data) => {
      try {
        const { bookingId } = data || {};
        if (!bookingId) return;

        const chatRoom = `chat_booking_${bookingId}`;
        socket.join(chatRoom);
        console.log(`💬 Socket ${socket.id} joined chat room: [${chatRoom}]`);

        socket.emit('chat_room_joined', { success: true, bookingId, room: chatRoom });
      } catch (err) {
        console.error('Error in join_chat_room socket handler:', err);
      }
    });

    // 1c. SEND REAL-TIME CHAT MESSAGE
    socket.on('send_chat_message', async (data) => {
      try {
        const { bookingId, senderId, senderName, senderRole, message } = data || {};
        if (!bookingId || !senderId || !message) return;

        const trimmedMsg = String(message).trim();
        if (!trimmedMsg) return;

        // Save message to MongoDB
        const chatMsg = await ChatMessage.create({
          booking: String(bookingId),
          bookingRef: String(bookingId),
          sender: String(senderId),
          senderName: senderName || 'User',
          senderRole: senderRole || 'customer',
          message: trimmedMsg,
          timestamp: new Date(),
        });

        const chatRoom = `chat_booking_${bookingId}`;
        console.log(`💬 Broadcasting chat msg in [${chatRoom}] from ${senderName} (${senderRole}): ${trimmedMsg}`);

        const msgPayload = {
          _id: chatMsg._id,
          booking: String(bookingId),
          sender: String(senderId),
          senderName: senderName || 'User',
          senderRole: senderRole || 'customer',
          message: trimmedMsg,
          timestamp: chatMsg.timestamp,
        };

        // Broadcast to all sockets in the chat room
        io.to(chatRoom).emit('new_chat_message', msgPayload);

        // Target customer & partner user rooms directly so background socket listeners receive the message
        try {
          const bookingObj = await bookingRepository.model.findById(bookingId).select('customer partner');
          if (bookingObj) {
            if (bookingObj.customer) {
              const custIdStr = bookingObj.customer.toString();
              io.to(`user_${custIdStr}`).to(`customer_${custIdStr}`).emit('new_chat_message', msgPayload);
            }
            if (bookingObj.partner) {
              const partnerIdStr = bookingObj.partner.toString();
              io.to(`partner_${partnerIdStr}`).to(`user_${partnerIdStr}`).emit('new_chat_message', msgPayload);
            }
          }
        } catch (e) {
          console.warn('Could not fetch booking customer/partner for direct room emit:', e);
        }

        // Also broadcast global chat notification event for sound & toast alerts across app
        io.emit('new_chat_notification', msgPayload);
      } catch (err) {
        console.error('Error in send_chat_message socket handler:', err);
      }
    });

    // 2. ATOMIC FIRST-COME, FIRST-SERVED JOB CLAIM VIA SOCKET
    socket.on('claim_job', async (data) => {
      try {
        const { bookingId, partnerId } = data || {};
        if (!bookingId || !partnerId) {
          return socket.emit('claim_result', { success: false, message: 'Invalid claim data' });
        }

        const partner = await userRepository.findById(partnerId);
        if (!partner || partner.role !== ROLES.PARTNER || partner.kycStatus !== 'approved' || !partner.isOnline) {
          return socket.emit('claim_result', {
            success: false,
            message: 'Only online approved partners can claim booking requests.',
          });
        }

        // Atomic Mongoose lock: only update if status is still Pending
        const updatedBooking = await bookingRepository.model.findOneAndUpdate(
          {
            _id: bookingId,
            status: { $in: ['Pending', 'pending'] },
          },
          {
            $set: {
              partner: partner._id,
              status: 'Accepted',
            },
          },
          { new: true }
        ).populate('customer', 'name phone email')
         .populate('service', 'name price duration')
         .populate('category', 'name');

        if (!updatedBooking) {
          // Job was already claimed by another partner or cancelled
          return socket.emit('claim_result', {
            success: false,
            message: '⚡ Job already claimed by another technician!',
            bookingId,
          });
        }

        // SUCCESS: First partner claimed the job!
        console.log(`🎉 Job [${bookingId}] successfully claimed by Partner [${partner.name}]`);

        // Notify claiming partner
        socket.emit('claim_result', {
          success: true,
          message: '🎉 Congratulations! Booking successfully assigned to you.',
          booking: updatedBooking,
        });

        // Broadcast to all other partners to dismiss incoming job offer
        const categoryName = typeof updatedBooking.category === 'object' ? (updatedBooking.category?.name || '') : String(updatedBooking.category || partner.category || '');
        const rawPartnerCity = partner.assignedCity?.name || (typeof partner.assignedCity === 'string' ? partner.assignedCity : null) || partner.city || 'Jaunpur';
        const bookingCity = String(updatedBooking.city || rawPartnerCity || 'Jaunpur').trim();
        const categoryRoom = `category_${String(categoryName).trim()}_${bookingCity}`;

        io.to(categoryRoom).to('all_online_partners').emit('job_claimed', {
          bookingId,
          claimedByPartnerId: partner._id,
          claimedByPartnerName: partner.name,
          message: `Booking ${updatedBooking.bookingId || bookingId} claimed by another technician.`,
        });

        // Notify customer socket if online
        io.to(`customer_${updatedBooking.customer?._id}`).emit('partner_assigned', {
          booking: updatedBooking,
          partner: {
            id: partner._id,
            name: partner.name,
            phone: partner.phone,
            category: partner.category,
          },
        });
      } catch (err) {
        console.error('Error handling claim_job socket event:', err);
        socket.emit('claim_result', { success: false, message: 'Server error claiming job request.' });
      }
    });

    // 3. WEBRTC VOICE CALL SIGNALING HANDLERS
    socket.on('voice:call:initiate', (data, ack) => {
      try {
        const { conversationId, bookingId, targetUserId, callerName, callerRole } = data || {};
        const roomKey = conversationId || bookingId;
        if (!roomKey) return;

        console.log(`📞 Voice call initiated for [${roomKey}] by ${callerName} (${callerRole})`);

        const incomingPayload = {
          conversationId: roomKey,
          bookingId: roomKey,
          fromSocketId: socket.id,
          callerName: callerName || 'Norozz User',
          callerRole: callerRole || 'customer',
          startedAt: new Date()
        };

        if (targetUserId) {
          io.to(`user_${targetUserId}`).to(`customer_${targetUserId}`).to(`partner_${targetUserId}`).emit('voice:call:incoming', incomingPayload);
        }

        // Also broadcast to chat room
        socket.to(`chat_booking_${roomKey}`).emit('voice:call:incoming', incomingPayload);

        if (typeof ack === 'function') ack({ success: true, message: 'Call ringing...' });
      } catch (err) {
        console.error('Error in voice:call:initiate:', err);
        if (typeof ack === 'function') ack({ success: false, error: err.message });
      }
    });

    socket.on('voice:call:accept', (data, ack) => {
      try {
        const { conversationId, bookingId, calleeName } = data || {};
        const roomKey = conversationId || bookingId;

        console.log(`✅ Voice call accepted for [${roomKey}] by ${calleeName || 'callee'}`);

        const acceptedPayload = {
          conversationId: roomKey,
          bookingId: roomKey,
          acceptedBySocketId: socket.id,
          acceptedAt: new Date()
        };

        socket.to(`chat_booking_${roomKey}`).emit('voice:call:accepted', acceptedPayload);
        io.emit(`voice:call:accepted:${roomKey}`, acceptedPayload);

        if (typeof ack === 'function') ack({ success: true });
      } catch (err) {
        console.error('Error in voice:call:accept:', err);
      }
    });

    socket.on('voice:call:reject', (data, ack) => {
      try {
        const { conversationId, bookingId, reason } = data || {};
        const roomKey = conversationId || bookingId;

        console.log(`❌ Voice call rejected for [${roomKey}]`);

        const rejectedPayload = {
          conversationId: roomKey,
          bookingId: roomKey,
          reason: reason || 'User busy'
        };

        socket.to(`chat_booking_${roomKey}`).emit('voice:call:rejected', rejectedPayload);
        io.emit(`voice:call:rejected:${roomKey}`, rejectedPayload);

        if (typeof ack === 'function') ack({ success: true });
      } catch (err) {
        console.error('Error in voice:call:reject:', err);
      }
    });

    socket.on('voice:call:end', (data, ack) => {
      try {
        const { conversationId, bookingId } = data || {};
        const roomKey = conversationId || bookingId;

        console.log(`📴 Voice call ended for [${roomKey}]`);

        const endedPayload = {
          conversationId: roomKey,
          bookingId: roomKey,
          endedBySocketId: socket.id,
          endedAt: new Date()
        };

        socket.to(`chat_booking_${roomKey}`).emit('voice:call:ended', endedPayload);
        io.emit(`voice:call:ended:${roomKey}`, endedPayload);

        if (typeof ack === 'function') ack({ success: true });
      } catch (err) {
        console.error('Error in voice:call:end:', err);
      }
    });

    socket.on('voice:signal', (data) => {
      try {
        const { conversationId, bookingId, signal } = data || {};
        const roomKey = conversationId || bookingId;
        if (!roomKey || !signal) return;

        socket.to(`chat_booking_${roomKey}`).emit('voice:signal', {
          conversationId: roomKey,
          bookingId: roomKey,
          senderSocketId: socket.id,
          signal
        });
      } catch (err) {
        console.error('Error in voice:signal relay:', err);
      }
    });

    // 4. DISCONNECT HANDLER
    socket.on('disconnect', () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);
      if (socket.partnerId && partnerSocketsMap.has(socket.partnerId)) {
        const socketSet = partnerSocketsMap.get(socket.partnerId);
        socketSet.delete(socket.id);
        if (socketSet.size === 0) {
          partnerSocketsMap.delete(socket.partnerId);
        }
      }
    });
  });

  return io;
};

/**
 * Helper: Broadcast real-time job offer to eligible partners
 * Filters by Category, Online status, and Work Radius / Location
 * @param {Object} booking Populated Mongoose booking object
 */
export const dispatchNewJobOffer = async (booking) => {
  if (!io) {
    console.warn('Socket.io server not initialized yet. Skipping real-time dispatch broadcast.');
    return;
  }

  try {
    const categoryObj = typeof booking.category === 'object' ? booking.category : null;
    const categoryId = categoryObj?._id ? String(categoryObj._id) : String(booking.category || '');
    const categoryName = categoryObj?.name || 'Home Services';

    const serviceObj = typeof booking.service === 'object' ? booking.service : null;
    const serviceId = serviceObj?._id ? String(serviceObj._id) : String(booking.service || '');
    const serviceName = serviceObj?.name || booking.packageName || 'Service Request';

    const bookingCity = booking.city || booking.address?.city || 'Jaunpur';
    const addressLine = booking.address?.addressLine || `${bookingCity} Operational Area`;

    // Fetch all active online partners
    const partners = await userRepository.find({
      role: ROLES.PARTNER,
      status: 'active',
    });

    // Filter partners based on offeredServices, Category, and Work Area City
    const eligiblePartners = partners.filter((partner) => {
      // 1. Category check
      const partnerCatId = partner.category?._id ? String(partner.category._id) : String(partner.category || '');
      const partnerCats = Array.isArray(partner.categories) ? partner.categories.map((c) => String(c._id || c)) : [];
      const isCatMatch = partnerCatId === categoryId || partnerCats.includes(categoryId) || !categoryId;

      if (!isCatMatch) return false;

      // 2. Offered Services check: If partner selected specific offeredServices, verify serviceId is present
      if (Array.isArray(partner.offeredServices) && partner.offeredServices.length > 0 && serviceId) {
        const pServices = partner.offeredServices.map((s) => String(s._id || s));
        const isSvcMatch = pServices.includes(serviceId);
        if (!isSvcMatch) return false;
      }

      // 3. Geographic Operating Radius Match (locationCoordinates distance <= serviceRadius KM)
      const partnerCoords = partner.locationCoordinates || partner.location;
      const bookingCoords = booking.address?.locationCoordinates || booking.locationCoordinates;
      const partnerRadius = partner.serviceRadius || partner.workRadius || partner.operatingRadius || 8;

      const { isWithinRadius, distanceKm } = isWithinOperatingRadius(partnerCoords, bookingCoords, partnerRadius);
      if (!isWithinRadius) {
        console.log(`⛔ Skipping partner [${partner.name}] for booking [${booking.bookingId || booking._id}]: Distance ${distanceKm}km exceeds ${partnerRadius}km operating radius`);
        return false;
      }

      return true;
    });

    console.log(`📢 Real-time Dispatching Booking [${booking.bookingId || booking._id}] for Service [${serviceName}] to ${eligiblePartners.length} matching partners!`);

    const offerPayload = {
      bookingId: booking._id,
      bookingNumber: booking.bookingId || `UC-${booking._id.toString().slice(-5).toUpperCase()}`,
      serviceTitle: booking.packageName || serviceName,
      serviceId,
      categoryName,
      categoryId,
      customerName: booking.customer?.name || 'Customer',
      customerPhone: booking.customer?.phone || '',
      address: `${booking.address?.title ? booking.address.title + ': ' : ''}${addressLine}, ${bookingCity}`,
      city: bookingCity,
      amount: booking.amount || serviceObj?.finalPrice || 599,
      financialSnapshot: booking.financialSnapshot,
      timeSlot: booking.timeSlot || 'Immediate / 10:30 AM',
      createdAt: new Date(),
      expirySeconds: 60,
    };

    // 1. Emit directly to each matching partner's individual room
    eligiblePartners.forEach((partner) => {
      const partnerRoom = `partner_${partner._id}`;
      io.to(partnerRoom).emit('new_job_offer', offerPayload);
      console.log(`📡 Emitted new_job_offer to room [${partnerRoom}] (${partner.name})`);
    });

    // 2. Broadcast to Category & City Room and Category ID Room
    const categoryNameRoom = `category_${(categoryName || '').trim()}_${bookingCity.trim()}`;
    const categoryIdRoom = `category_${categoryId}_${bookingCity.trim()}`;
    
    io.to(categoryNameRoom).to(categoryIdRoom).to('all_online_partners').emit('new_job_offer', offerPayload);

    return offerPayload;
  } catch (err) {
    console.error('Error in dispatchNewJobOffer helper:', err);
  }
};

/**
 * Get Socket.io server instance
 */
export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io has not been initialized yet!');
  }
  return io;
};
