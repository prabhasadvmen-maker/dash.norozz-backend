import { bookingRepository } from '../repositories/booking.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { ROLES } from '../constants/roles.constant.js';

export class AutoAssignmentService {

  /**
   * Automatic Partner Selection & Dispatch Algorithm
   * Conditions:
   * 1. Partner Role == 'partner'
   * 2. Partner Status == 'active'
   * 3. Partner KYC Status == 'approved'
   * 4. Partner Online (isOnline == true)
   * 5. Partner Available (isAvailable == true)
   * 6. Partner belongs to same City (assignedCity / city == booking.city)
   */
  async autoAssignPartner(bookingId) {
    const booking = await bookingRepository.findById(bookingId);
    if (!booking) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Booking record not found');
    }

    const bookingCity = booking.city || 'Delhi NCR';

    // Try online partners first, fallback to any active approved partner in city
    let candidatePartners = await userRepository.find({
      role: ROLES.PARTNER,
      status: 'active',
      kycStatus: 'approved',
      isOnline: true,
      isAvailable: true,
      $or: [{ assignedCity: bookingCity }, { city: bookingCity }],
    });

    // Fallback: no online partners → try any active approved partner in city
    if (!candidatePartners || candidatePartners.length === 0) {
      console.log(`⚠️ No online partners in [${bookingCity}] — trying any active approved partner...`);
      candidatePartners = await userRepository.find({
        role: ROLES.PARTNER,
        status: 'active',
        kycStatus: 'approved',
        $or: [{ assignedCity: bookingCity }, { city: bookingCity }],
      });
    }

    // Last resort: ignore city filter
    if (!candidatePartners || candidatePartners.length === 0) {
      console.log(`⚠️ No partners in city [${bookingCity}] — trying any active approved partner nationwide...`);
      candidatePartners = await userRepository.find({
        role: ROLES.PARTNER,
        status: 'active',
        kycStatus: 'approved',
      });
    }

    if (candidatePartners && candidatePartners.length > 0) {
      // Pick first available approved online partner
      const selectedPartner = candidatePartners[0];

      booking.partner = selectedPartner._id;
      booking.status = 'Assigned';
      await booking.save();

      return {
        success: true,
        status: 'Assigned',
        message: `Successfully auto-assigned approved partner '${selectedPartner.name}'`,
        partner: {
          _id: selectedPartner._id,
          name: selectedPartner.name,
          agencyName: selectedPartner.agencyName,
          phone: selectedPartner.phone,
          city: selectedPartner.city,
          kycStatus: selectedPartner.kycStatus,
        },
        booking,
      };
    }

    // IF NO CANDIDATE PARTNER FOUND -> RETURN WAITING STATUS
    booking.status = 'Pending';
    await booking.save();

    return {
      success: false,
      status: 'Waiting',
      message: 'No online approved partner found in your city at this moment. Booking queued in waiting status.',
      booking,
    };
  }

  // Toggle Partner Online / Available Status
  async togglePartnerAvailability(partnerId, updateData) {
    const partner = await userRepository.findById(partnerId);
    if (!partner || partner.role !== ROLES.PARTNER) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid partner user account');
    }

    if (updateData.isOnline !== undefined) partner.isOnline = updateData.isOnline;
    if (updateData.isAvailable !== undefined) partner.isAvailable = updateData.isAvailable;
    await partner.save();

    return {
      message: 'Partner availability updated successfully',
      isOnline: partner.isOnline,
      isAvailable: partner.isAvailable,
    };
  }
}

export const autoAssignmentService = new AutoAssignmentService();
