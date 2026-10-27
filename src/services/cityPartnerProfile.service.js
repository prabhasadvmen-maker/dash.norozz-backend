import mongoose from 'mongoose';
import { User } from '../models/user.model.js';
import { Booking } from '../models/booking.model.js';
import { Category } from '../models/category.model.js';
import { Service } from '../models/service.model.js';
import { KycAuditLog } from '../models/kycAuditLog.model.js';
import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { ROLES } from '../constants/roles.constant.js';
import { cityAdminService } from './cityAdmin.service.js';

const EARNED_STATUSES = ['SERVICE_COMPLETED', 'SETTLEMENT_PENDING', 'SETTLED'];
const REQUIRED_DOCS = ['aadhaarFront', 'aadhaarBack', 'panDoc', 'passportPhoto', 'bankPassbookDoc'];

const round = (n, d = 2) => {
  const f = 10 ** d;
  return Math.round((Number(n) || 0) * f) / f;
};

/** "123456789012" -> "•••• •••• 9012". Only the last 4 digits ever leave the server. */
const maskTail = (value, groups = 4) => {
  const s = String(value || '').replace(/\s+/g, '');
  if (!s) return '';
  const tail = s.slice(-4);
  const hidden = '•'.repeat(Math.max(0, s.length - 4));
  return (hidden + tail).replace(new RegExp(`(.{${groups}})(?=.)`, 'g'), '$1 ');
};

const maskPan = (pan) => {
  const s = String(pan || '').toUpperCase();
  if (s.length < 5) return s ? '•'.repeat(s.length) : '';
  return `${s.slice(0, 2)}${'•'.repeat(s.length - 4)}${s.slice(-2)}`;
};

// "Dhruva (6aa24faac13afa6c831c4095)" -> "Dhruva": some onboarding flows appended the category id to the agency name
export const cleanAgencyName = (name) => String(name || '').replace(/\s*\([0-9a-f]{24}\)\s*$/i, '').trim();

export class CityPartnerProfileService {
  async getProfile(partnerId, assignedCity) {
    if (!mongoose.isValidObjectId(partnerId)) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Partner not found');

    const partner = await User.findOne({ _id: partnerId, role: ROLES.PARTNER })
      .select('-password -refreshToken -refreshTokens -otp -otpExpiry')
      .lean();
    if (!partner) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Partner not found');

    const cityMap = await cityAdminService.getCityNameMap();
    if (!cityAdminService.matchesCity(partner, assignedCity, cityMap)) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Partner not found in your assigned city jurisdiction');
    }

    const categoryIds = [partner.category, ...(partner.categories || [])].filter((c) => c && mongoose.isValidObjectId(c)).map(String);
    const serviceIds = (partner.offeredServices || []).filter((s) => mongoose.isValidObjectId(s));

    const [categories, services, statsRows, audit] = await Promise.all([
      categoryIds.length ? Category.find({ _id: { $in: categoryIds } }).select('name').lean() : [],
      serviceIds.length ? Service.find({ _id: { $in: serviceIds } }).select('name category').lean() : [],
      Booking.aggregate([
        { $match: { partner: partner._id } },
        {
          $group: {
            _id: null,
            jobs: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $in: ['$status', ['Cancelled', 'Refunded']] }, 1, 0] } },
            active: { $sum: { $cond: [{ $in: ['$status', ['Assigned', 'Accepted', 'On The Way', 'Started']] }, 1, 0] } },
            ratingCount: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$rating', 0] }, 0] }, 1, 0] } },
            ratingSum: { $sum: { $ifNull: ['$rating', 0] } },
            earnings: { $sum: { $cond: [{ $in: ['$financialStatus', EARNED_STATUSES] }, { $ifNull: ['$financialSnapshot.partnerNetEarning', 0] }, 0] } },
            commission: { $sum: { $cond: [{ $in: ['$financialStatus', EARNED_STATUSES] }, { $ifNull: ['$financialSnapshot.norozzGrossRevenue', 0] }, 0] } },
            lastJobAt: { $max: '$createdAt' },
          },
        },
      ]),
      KycAuditLog.find({ partnerId: partner._id }).sort({ createdAt: -1 }).limit(12).select('action status reason actorRole createdAt').lean(),
    ]);

    const st = statsRows[0] || {};
    const categoryNameById = new Map(categories.map((c) => [String(c._id), c.name]));
    const kyc = partner.kyc || {};
    const docs = partner.documents || {};
    const statuses = docs.statuses || {};

    const documentsUploaded = REQUIRED_DOCS.filter((k) => docs[k]).length;
    const documentsApproved = REQUIRED_DOCS.filter((k) => statuses[k] === 'approved').length;
    const documentsRejected = REQUIRED_DOCS.filter((k) => statuses[k] === 'rejected').length;

    const bank = partner.bankDetails || {};
    const city = partner.assignedCity && typeof partner.assignedCity === 'object' ? partner.assignedCity.name : partner.assignedCity;

    return {
      _id: partner._id,
      userId: partner.userId || '',
      name: partner.name,
      email: partner.email || '',
      phone: partner.phone || '',
      gender: partner.gender || '',
      dob: partner.dob || '',
      profileImage: partner.profileImage || '',
      agencyName: cleanAgencyName(partner.agencyName),
      status: partner.status,
      kycStatus: partner.kycStatus || 'pending',
      isOnline: !!partner.isOnline,
      createdAt: partner.createdAt,
      lastLogin: partner.lastLogin || null,
      city: partner.city || (typeof city === 'string' ? city : '') || assignedCity,
      address: partner.address || {},
      experience: partner.experience || '',
      workRadius: partner.workRadius || null,
      localities: partner.localities || [],
      certifications: partner.certifications || [],
      categories: [...new Set(categoryIds)].map((id) => categoryNameById.get(id)).filter(Boolean),
      services: services.map((s) => ({ _id: s._id, name: s.name, category: categoryNameById.get(String(s.category)) || '' })),
      documents: { ...docs, statuses, rejectionReasons: docs.rejectionReasons || {} },
      documentProgress: { required: REQUIRED_DOCS.length, uploaded: documentsUploaded, approved: documentsApproved, rejected: documentsRejected },
      kyc: {
        overallStatus: kyc.overallStatus || 'PENDING',
        approvalStatus: kyc.approvalStatus || 'PENDING_ADMIN_REVIEW',
        manualOverride: !!kyc.manualOverride,
        overrideReason: kyc.overrideReason || '',
        rejectionReason: kyc.rejectionReason || '',
        adminReviewedAt: kyc.adminReviewedAt || null,
        checks: {
          mobile: kyc.mobile?.status || 'PENDING',
          pan: kyc.pan?.status || 'PENDING',
          aadhaar: kyc.aadhaar?.status || kyc.digilocker?.status || 'PENDING',
          drivingLicense: kyc.drivingLicense?.status || 'PENDING',
          bankAccount: kyc.bankAccount?.status || 'PENDING',
          faceMatch: kyc.faceMatch?.status || 'PENDING',
          faceLiveness: kyc.faceLiveness?.status || 'PENDING',
        },
        faceMatchScore: kyc.faceMatch?.score ?? null,
      },
      identity: {
        aadhaarMasked: maskTail(kyc.aadhaar?.referenceId),
        panMasked: maskPan(kyc.pan?.panNumber),
      },
      bank: {
        accountHolderName: bank.accountHolderName || '',
        bankName: bank.bankName || '',
        accountMasked: maskTail(bank.accountNumber),
        ifscCode: bank.ifscCode || '',
        upiId: bank.upiId || '',
        isVerified: !!bank.isVerified || kyc.bankAccount?.status === 'VERIFIED',
      },
      onboarding: {
        feePaid: !!partner.isOnboardingFeePaid,
        feeAmount: partner.onboardingFeeAmount || 0,
        paymentStatus: partner.onboardingPaymentStatus || '',
        paidAt: partner.onboardingPaymentDate || null,
      },
      wallet: {
        balance: round(partner.walletBalance),
        available: round(partner.availableBalance),
        held: round(partner.heldBalance),
        pending: round(partner.pendingBalance),
        withdrawable: round(partner.withdrawableBalance),
        securityDeposit: round(partner.securityDeposit),
      },
      stats: {
        jobs: st.jobs || 0,
        completed: st.completed || 0,
        cancelled: st.cancelled || 0,
        active: st.active || 0,
        completionRate: st.completed + st.cancelled > 0 ? round((st.completed / (st.completed + st.cancelled)) * 100, 1) : null,
        avgRating: st.ratingCount ? round(st.ratingSum / st.ratingCount) : null,
        ratingCount: st.ratingCount || 0,
        earnings: round(st.earnings),
        commission: round(st.commission),
        lastJobAt: st.lastJobAt || null,
      },
      audit: audit.map((a) => ({ action: a.action, status: a.status, reason: a.reason, actorRole: a.actorRole, at: a.createdAt })),
    };
  }
}

export const cityPartnerProfileService = new CityPartnerProfileService();
