import { StarterPack } from '../models/starterPack.model.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Helper to get or create default Starter Pack
const getOrCreateDefaultStarterPack = async () => {
  let pack = await StarterPack.findOne().populate('applicableCategory').populate('applicableService');
  if (!pack) {
    pack = await StarterPack.create({
      badge: 'STARTER PACK',
      subBadge: '✦ ONE TIME OFFER ✦',
      title: '2 VISITS FOR ₹398 ₹139',
      originalPrice: 398,
      offerPrice: 139,
      ticketOriginalPrice: 199,
      ticketOfferPrice: 70,
      perVisitPriceText: 'Only ₹70 per visit',
      visitCount: 2,
      visitDurationMinutes: 60,
      validityDays: 15,
      bannerColor: '#ec4899',
      isActive: true,
      targetAudience: 'NEW_USERS_ONLY',
    });
  }
  return pack;
};

export const starterPackController = {
  // Super Admin: Get Starter Pack Configuration
  getStarterPackAdmin: asyncHandler(async (req, res) => {
    const pack = await getOrCreateDefaultStarterPack();
    return res.status(200).json(
      new ApiResponse(200, pack, 'Starter Pack configuration retrieved successfully')
    );
  }),

  // Super Admin: Update Starter Pack Configuration
  updateStarterPackAdmin: asyncHandler(async (req, res) => {
    let pack = await StarterPack.findOne();
    if (!pack) {
      pack = new StarterPack(req.body);
    } else {
      Object.assign(pack, req.body);
    }

    await pack.save();
    const updatedPack = await StarterPack.findById(pack._id).populate('applicableCategory').populate('applicableService');

    return res.status(200).json(
      new ApiResponse(200, updatedPack, 'Starter Pack updated successfully')
    );
  }),

  // Customer: Get Active Starter Pack Offer
  getStarterPackPublic: asyncHandler(async (req, res) => {
    const pack = await StarterPack.findOne({ isActive: true }).populate('applicableCategory').populate('applicableService');
    if (!pack) {
      return res.status(200).json(
        new ApiResponse(200, null, 'No active Starter Pack found')
      );
    }

    // Check eligibility if user is logged in
    const userId = req.user?._id;
    let isEligible = true;
    if (userId && pack.targetAudience === 'NEW_USERS_ONLY') {
      const alreadyClaimed = pack.claimedUsers?.some(
        (c) => String(c.userId) === String(userId)
      );
      if (alreadyClaimed) {
        isEligible = false;
      }
    }

    return res.status(200).json(
      new ApiResponse(200, { ...pack.toObject(), isEligible }, 'Active Starter Pack fetched successfully')
    );
  }),

  // Customer: Claim Starter Pack Offer
  claimStarterPack: asyncHandler(async (req, res) => {
    const userId = req.user?._id;
    const { bookingId } = req.body;

    const pack = await StarterPack.findOne({ isActive: true });
    if (!pack) {
      throw new ApiError(404, 'Starter Pack offer not available');
    }

    if (userId) {
      const alreadyClaimed = pack.claimedUsers?.some(
        (c) => String(c.userId) === String(userId)
      );
      if (alreadyClaimed) {
        throw new ApiError(400, 'Starter Pack offer already claimed by this user');
      }

      pack.claimedUsers.push({
        userId,
        bookingId: bookingId || null,
        claimedAt: new Date(),
      });
      await pack.save();
    }

    return res.status(200).json(
      new ApiResponse(200, pack, 'Starter Pack offer claimed successfully!')
    );
  }),
};
