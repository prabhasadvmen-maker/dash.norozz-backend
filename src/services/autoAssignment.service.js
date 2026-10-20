import { Booking } from '../models/booking.model.js';
import { User } from '../models/user.model.js';
import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { ROLES } from '../constants/roles.constant.js';
import { isPartnerEligibleForBooking } from '../utils/partnerEligibility.js';
import { emitToUser, notifyBookingUpdate } from '../sockets/index.js';

const ACTIVE_JOB_STATUSES = ['Assigned', 'Accepted', 'On The Way', 'Started'];

export class AutoAssignmentService {
  /**
   * Picks the least-busy eligible partner (active + KYC approved + online + available + category/service/area match)
   * and assigns the booking to them. The partner still has to accept it.
   * Only PAID, unassigned, pending bookings are assignable.
   */
  async autoAssignPartner(bookingId) {
    const booking = await Booking.findById(bookingId);
    if (!booking) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Booking record not found');

    if (booking.status !== 'Pending' || booking.partner || booking.paymentStatus !== 'paid') {
      return { success: false, status: booking.status, message: 'Booking is not eligible for auto-assignment.', booking };
    }

    const candidates = (
      await User.find({
        role: ROLES.PARTNER,
        status: 'active',
        kycStatus: 'approved',
        isOnline: true,
        isAvailable: { $ne: false },
      }).populate('assignedCity', 'name')
    ).filter((p) => isPartnerEligibleForBooking(p, booking, { requireOnline: true }));

    if (candidates.length === 0) {
      return {
        success: false,
        status: 'Waiting',
        message: 'No online approved partner found for this booking at the moment. It stays queued.',
        booking,
      };
    }

    // Prefer the partner with the fewest active jobs
    const load = await Booking.aggregate([
      { $match: { partner: { $in: candidates.map((c) => c._id) }, status: { $in: ACTIVE_JOB_STATUSES } } },
      { $group: { _id: '$partner', n: { $sum: 1 } } },
    ]);
    const loadMap = new Map(load.map((l) => [String(l._id), l.n]));
    candidates.sort((a, b) => (loadMap.get(String(a._id)) || 0) - (loadMap.get(String(b._id)) || 0));
    const selected = candidates[0];

    const assigned = await Booking.findOneAndUpdate(
      { _id: bookingId, status: 'Pending', partner: null, paymentStatus: 'paid' },
      { $set: { partner: selected._id, status: 'Assigned', assignedAt: new Date() } },
      { new: true }
    );
    if (!assigned) {
      return { success: false, status: 'Pending', message: 'Booking was claimed by another partner in the meantime.', booking };
    }

    emitToUser(selected._id, 'job_assigned', { bookingId: String(assigned._id), bookingNumber: assigned.bookingId });
    notifyBookingUpdate(assigned);

    return {
      success: true,
      status: 'Assigned',
      message: `Successfully auto-assigned approved partner '${selected.name}'`,
      partner: {
        _id: selected._id,
        name: selected.name,
        agencyName: selected.agencyName,
        city: selected.city,
        kycStatus: selected.kycStatus,
      },
      booking: assigned,
    };
  }

  // Toggle the logged-in partner's own Online / Available flag
  async togglePartnerAvailability(partnerId, updateData = {}) {
    const partner = await User.findById(partnerId);
    if (!partner || partner.role !== ROLES.PARTNER) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid partner user account');
    }
    if (partner.status !== 'active' && (updateData.isOnline || updateData.isAvailable)) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Your account is not active. You cannot go online.');
    }

    const update = {};
    if (updateData.isOnline !== undefined) update.isOnline = Boolean(updateData.isOnline);
    if (updateData.isAvailable !== undefined) update.isAvailable = Boolean(updateData.isAvailable);
    const updated = await User.findByIdAndUpdate(partnerId, { $set: update }, { new: true });

    return {
      message: 'Partner availability updated successfully',
      isOnline: updated.isOnline,
      isAvailable: updated.isAvailable,
    };
  }
}

export const autoAssignmentService = new AutoAssignmentService();
