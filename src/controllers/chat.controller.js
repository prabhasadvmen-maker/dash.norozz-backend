import { BaseController } from './base.controller.js';
import { ChatMessage } from '../models/chat.model.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export class ChatController extends BaseController {
  getBookingMessages = asyncHandler(async (req, res) => {
    const { bookingId } = req.params;
    const bookingStr = String(bookingId).trim();

    const bookingAliases = [bookingStr];

    try {
      const isObjectId = Boolean(bookingStr.match(/^[0-9a-fA-F]{24}$/));
      const bookingDoc = await bookingRepository.model.findOne({
        $or: [
          ...(isObjectId ? [{ _id: bookingStr }] : []),
          { bookingId: bookingStr },
          { bookingNumber: bookingStr },
        ],
      }).select('_id bookingId bookingNumber');

      if (bookingDoc) {
        if (bookingDoc._id) bookingAliases.push(bookingDoc._id.toString());
        if (bookingDoc.bookingId) bookingAliases.push(bookingDoc.bookingId);
        if (bookingDoc.bookingNumber) bookingAliases.push(bookingDoc.bookingNumber);
      }
    } catch (e) {
      console.warn('Booking alias resolution warning:', e);
    }

    const uniqueAliases = Array.from(new Set(bookingAliases));

    const messages = await ChatMessage.find({
      $or: [
        { booking: { $in: uniqueAliases } },
        { bookingRef: { $in: uniqueAliases } },
      ],
    })
      .sort({ createdAt: 1 })
      .lean();

    return this.sendSuccess(res, messages, 'Chat history retrieved successfully');
  });
}

export const chatController = new ChatController();
