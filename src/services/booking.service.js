import crypto from 'crypto';
import mongoose from 'mongoose';
import { Booking } from '../models/booking.model.js';
import { Coupon } from '../models/coupon.model.js';
import { StarterPack } from '../models/starterPack.model.js';
import { Review } from '../models/review.model.js';
import { SystemSettings } from '../models/systemSettings.model.js';
import { WalletTransaction } from '../models/walletTransaction.model.js';
import { User } from '../models/user.model.js';
import { notificationService } from './notificationService.js';
import { categoryRepository } from '../repositories/category.repository.js';
import { serviceRepository } from '../repositories/service.repository.js';
import { servicePackageRepository } from '../repositories/servicePackage.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { ROLES } from '../constants/roles.constant.js';
import { dispatchNewJobOffer, notifyBookingUpdate, emitToUser, emitToAllPartners } from '../sockets/index.js';
import { isPartnerEligibleForBooking, resolvePartnerCities } from '../utils/partnerEligibility.js';
import { financialCalculatorService } from './financialCalculator.service.js';
import { financialEngineService } from './financialEngine.service.js';
import { getGatewayMode } from './paymentGateway.service.js';

const ADMIN_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.CITY_ADMIN];
const ACTIVE_STATUSES = ['Pending', 'Assigned', 'Accepted', 'On The Way', 'Started'];
const CANCELLABLE_STATUSES = ['Pending', 'Assigned', 'Accepted', 'On The Way'];
const MAX_OTP_ATTEMPTS = 5;
const UNPAID_BOOKING_TTL_MS = 30 * 60 * 1000;
const NO_PARTNER_TTL_MS = 45 * 60 * 1000;
const ASSIGNED_ACCEPT_TTL_MS = 10 * 60 * 1000;
const AUTO_ASSIGN_DELAY_MS = 60 * 1000;
const AUTO_ASSIGN_RETRY_MS = 2 * 60 * 1000;
const MAX_REASSIGNMENTS = 3;

const isObjectId = (v) => mongoose.Types.ObjectId.isValid(v) && String(v).length === 24;
const sid = (v) => String(v?._id || v || '');
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const validCoord = (c) => {
  const lat = Number(c?.lat);
  const lng = Number(c?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
};

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export class BookingService {
  // ─────────────────────────────── helpers ───────────────────────────────
  async generateUniqueBookingId() {
    for (let i = 0; i < 8; i++) {
      const id = `UC-${crypto.randomInt(100000, 10000000)}`;
      const exists = await Booking.exists({ bookingId: id });
      if (!exists) return id;
    }
    return `UC-${Date.now().toString().slice(-9)}`;
  }

  assertPartnerOwns(booking, partnerUser) {
    if (!booking || !partnerUser || String(booking.partner) !== String(partnerUser._id)) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, 'You are not assigned to this booking');
    }
  }

  assertParticipant(booking, user) {
    const uid = String(user?._id);
    const ok =
      String(booking.customer?._id || booking.customer) === uid ||
      (booking.partner && String(booking.partner?._id || booking.partner) === uid) ||
      ADMIN_ROLES.includes(user?.role);
    if (!ok) throw new ApiError(HTTP_STATUS.FORBIDDEN, 'You do not have access to this booking');
  }

  async loadBooking(bookingId, select = '') {
    if (!isObjectId(bookingId)) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Booking not found');
    const q = Booking.findById(bookingId);
    if (select) q.select(select);
    const booking = await q;
    if (!booking) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Booking not found');
    return booking;
  }

  async sendCompletionOtp(booking) {
    try {
      const full = await Booking.findById(booking._id).select('+completionOtp customer');
      if (!full) {
        console.error('sendCompletionOtp: Booking not found for id', booking._id);
        return;
      }
      if (!full.completionOtp) {
        console.error('sendCompletionOtp: completionOtp missing for booking', booking._id);
        return;
      }
      const customer = await userRepository.findById(full.customer);
      if (!customer) {
        console.error('sendCompletionOtp: Customer not found for booking', booking._id);
        return;
      }
      const contact = customer.phone || customer.email;
      if (!contact) {
        console.error('sendCompletionOtp: Customer has no phone or email, bookingId:', booking._id);
        return;
      }
      console.log(`📲 Sending completion OTP to customer contact: ${contact}`);
      await notificationService.dispatchOtp(contact, full.completionOtp);
      console.log(`✅ Completion OTP sent successfully for booking: ${booking._id}`);
    } catch (err) {
      console.error('Completion OTP dispatch error (non-blocking):', err.message);
    }
  }

  /**
   * Validates a coupon on the server and returns the discount. Never trusts a client-sent discount.
   */
  async priceCoupon({ code, customerId, categoryId, amount }) {
    const cleanCode = String(code).trim().toUpperCase();
    const coupon = await Coupon.findOne({ code: cleanCode, isActive: true });
    if (!coupon) throw new ApiError(HTTP_STATUS.BAD_REQUEST, `Coupon code '${cleanCode}' is invalid or expired.`);

    const now = new Date();
    if (coupon.validFrom && now < new Date(coupon.validFrom)) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, `Coupon '${cleanCode}' is not active yet.`);
    }
    if (coupon.validUntil && now > new Date(coupon.validUntil)) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, `Coupon '${cleanCode}' has expired.`);
    }
    if (coupon.applicableCategory && String(coupon.applicableCategory) !== String(categoryId)) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, `Coupon '${cleanCode}' is not valid for this service category.`);
    }
    const used = (coupon.usedBy || []).filter((u) => String(u.customerId) === String(customerId)).length;
    if (used >= (coupon.usageLimitPerUser || 1)) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, `You have already used the coupon code '${cleanCode}'.`);
    }
    if (amount < (coupon.minBookingAmount || 0)) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, `Coupon '${cleanCode}' is valid only on bookings above ₹${coupon.minBookingAmount}.`);
    }

    let discount;
    if (coupon.discountType === 'percentage') {
      const calc = Math.round((amount * coupon.discountValue) / 100);
      discount = coupon.maxDiscountAmount ? Math.min(calc, coupon.maxDiscountAmount) : calc;
    } else {
      discount = Math.min(coupon.discountValue, amount);
    }
    return { code: cleanCode, discount: Math.max(0, Math.min(discount, amount)) };
  }

  async priceStarterPack({ customerId, categoryId, serviceId }) {
    const pack = await StarterPack.findOne({ isActive: true });
    if (!pack) throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Starter Pack offer is not available.');
    if (pack.applicableCategory && String(pack.applicableCategory) !== String(categoryId)) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Starter Pack is not valid for this category.');
    }
    if (pack.applicableService && String(pack.applicableService) !== String(serviceId)) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Starter Pack is not valid for this service.');
    }
    const claimed = (pack.claimedUsers || []).some((c) => String(c.userId) === String(customerId));
    if (claimed) throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Starter Pack offer already claimed.');
    return { pack, price: Number(pack.offerPrice) };
  }

  // ─────────────────────────── 1. CREATE BOOKING ───────────────────────────
  async createBooking(customerUser, bookingData) {
    if (customerUser.role !== ROLES.CUSTOMER) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Only customers can create bookings.');
    }

    const category = await categoryRepository.findById(bookingData.category);
    if (!category || category.status === 'deleted') {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Selected category not found');
    }
    const service = await serviceRepository.findById(bookingData.service);
    if (!service || service.status === 'deleted') {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Selected service not found');
    }

    // Package + authoritative server-side price
    let selectedPackage = null;
    const requestedPackageId = bookingData.packageId || bookingData.package;
    if (requestedPackageId) {
      selectedPackage = await servicePackageRepository.findById(requestedPackageId);
      if (!selectedPackage || selectedPackage.status !== 'active') {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Selected package is invalid or currently unavailable');
      }
      if (String(selectedPackage.service) !== String(service._id)) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Selected package does not belong to this service');
      }
    } else {
      const activePackages = await servicePackageRepository.findActiveByService(service._id);
      if (activePackages.length === 1) selectedPackage = activePackages[0];
      else if (activePackages.length > 1) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Please select a specific service package to proceed with booking');
      } else if (!service.finalPrice && !service.price) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'This service currently has no active packages configured');
      }
    }

    const basePrice = Number(selectedPackage ? selectedPackage.finalPrice : service.finalPrice || service.price);
    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'This service does not have a valid price configured');
    }

    // Starter pack (server decides the price) or coupon (server decides the discount)
    let servicePrice = basePrice;
    let starterPackApplied = false;
    if (bookingData.useStarterPack) {
      const { price } = await this.priceStarterPack({ customerId: customerUser._id, categoryId: category._id, serviceId: service._id });
      servicePrice = price;
      starterPackApplied = true;
    }

    let discountAmount = 0;
    let couponCode = '';
    const rawCoupon = bookingData.couponCode || bookingData.promoCode || bookingData.appliedCouponCode;
    if (rawCoupon && !starterPackApplied) {
      const priced = await this.priceCoupon({ code: rawCoupon, customerId: customerUser._id, categoryId: category._id, amount: servicePrice });
      discountAmount = priced.discount;
      couponCode = priced.code;
    }

    // Location / schedule
    const city = String(bookingData.city || bookingData.address?.city || customerUser.city || '').trim();
    const addressLine = String(bookingData.addressLine || bookingData.address?.addressLine || '').trim();
    if (!city) throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'City is required for the service address');
    if (!addressLine) throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Address Line is required');

    const bookingDate = bookingData.bookingDate ? new Date(bookingData.bookingDate) : new Date();
    if (Number.isNaN(bookingDate.getTime())) throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid booking date');
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    if (bookingDate < startOfToday) throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Booking date cannot be in the past');

    const coords = validCoord(bookingData.locationCoordinates || bookingData.address?.locationCoordinates) ||
      validCoord({ lat: bookingData.lat ?? bookingData.latitude, lng: bookingData.lng ?? bookingData.longitude });

    const financialSnapshot = await financialCalculatorService.calculateBreakdown({
      servicePrice,
      extraServicesPrice: 0,
      categoryId: category._id,
      discountAmount,
      discountBearBy: 'NOROZZ',
    });

    const packageSnapshot = selectedPackage
      ? {
          packageId: selectedPackage._id,
          title: selectedPackage.title,
          price: selectedPackage.price,
          discountType: selectedPackage.discountType,
          discountValue: selectedPackage.discountValue,
          finalPrice: selectedPackage.finalPrice,
          duration: selectedPackage.duration,
          features: selectedPackage.features || [],
        }
      : {
          packageId: null,
          title: service.name,
          price: basePrice,
          discountType: 'none',
          discountValue: 0,
          finalPrice: basePrice,
          duration: service.duration || '45 mins',
          features: [],
        };

    const rawMethod = String(bookingData.paymentMethod || 'UPI');
    const isWalletMethod = rawMethod.toLowerCase().includes('wallet');

    // The booking is created UNPAID; it only becomes visible to partners once payment is confirmed.
    let booking;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        booking = await Booking.create({
          bookingId: await this.generateUniqueBookingId(),
          customer: customerUser._id,
          category: category._id,
          service: service._id,
          package: selectedPackage ? selectedPackage._id : null,
          packageId: selectedPackage ? selectedPackage._id : null,
          packageName: selectedPackage ? selectedPackage.title : service.name,
          packageSnapshot,
          address: {
            title: bookingData.addressTitle || bookingData.address?.title || 'Home',
            addressLine,
            city,
            state: bookingData.state || bookingData.address?.state || '',
            pincode: bookingData.pincode || bookingData.address?.pincode || '',
            locationCoordinates: coords || { lat: null, lng: null },
          },
          city,
          bookingDate,
          timeSlot: String(bookingData.timeSlot || '').trim() || '10:00 AM - 11:00 AM',
          amount: financialSnapshot.customerPayable,
          paymentMethod: isWalletMethod ? 'Wallet' : rawMethod,
          paymentStatus: 'pending',
          financialStatus: 'PAYMENT_PENDING',
          financialSnapshot,
          baseFinancialSnapshot: financialSnapshot,
          couponCode,
          starterPackApplied,
          status: 'Pending',
        });
        break;
      } catch (err) {
        if (err.code === 11000 && attempt < 2) continue;
        throw err;
      }
    }

    // Fully discounted booking: nothing to collect
    if (booking.amount === 0) {
      const confirmed = await this.confirmBookingPayment(booking._id, 'Coupon');
      return this.populateForResponse(confirmed._id, { requiresPayment: false });
    }

    if (isWalletMethod) {
      try {
        const { paymentService } = await import('./payment.service.js');
        await paymentService.processWalletPayment(customerUser, booking._id);
      } catch (err) {
        // No money left the wallet -> remove the unpaid booking so nothing phantom stays behind
        await Booking.deleteOne({ _id: booking._id, financialStatus: 'PAYMENT_PENDING' });
        throw err;
      }
      return this.populateForResponse(booking._id, { requiresPayment: false });
    }

    return this.populateForResponse(booking._id, { requiresPayment: true, gatewayMode: getGatewayMode() });
  }

  async populateForResponse(bookingId, extra = {}) {
    const doc = await Booking.findById(bookingId)
      .select('+completionOtp')
      .populate([
        { path: 'category', select: 'name slug image' },
        { path: 'service', select: 'name slug price finalPrice duration' },
        { path: 'customer', select: 'name email phone' },
      ]);
    const obj = doc.toObject();
    return { ...obj, ...extra };
  }

  /**
   * Called exactly when payment is confirmed (wallet debit, verified gateway payment or fully discounted).
   * Holds the funds, records coupon / starter-pack usage and dispatches the job to partners.
   */
  async confirmBookingPayment(bookingId, paymentMethod = 'UPI') {
    const { booking, alreadyProcessed } = await financialEngineService.holdCustomerPayment(bookingId, paymentMethod);
    if (!booking) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Booking not found');
    if (alreadyProcessed) return booking;

    if (booking.couponCode) {
      await Coupon.updateOne(
        { code: booking.couponCode, 'usedBy.bookingId': { $ne: booking._id } },
        { $push: { usedBy: { customerId: booking.customer, usedAt: new Date(), bookingId: booking._id } } }
      ).catch((e) => console.warn('Coupon usage record warning:', e.message));
    }
    if (booking.starterPackApplied) {
      await StarterPack.updateOne(
        { isActive: true, 'claimedUsers.userId': { $ne: booking.customer } },
        { $push: { claimedUsers: { userId: booking.customer, bookingId: booking._id, claimedAt: new Date() } } }
      ).catch((e) => console.warn('Starter pack claim record warning:', e.message));
    }

    const populated = await Booking.findById(booking._id).populate([
      { path: 'category', select: 'name slug image' },
      { path: 'service', select: 'name slug price finalPrice duration' },
      { path: 'customer', select: 'name email phone' },
    ]);
    dispatchNewJobOffer(populated).catch((err) => console.error('Socket dispatch error:', err));
    notifyBookingUpdate(populated);
    return booking;
  }

  /**
   * Dev-only manual payment confirmation. In live mode the gateway verify endpoint is the only way to pay.
   */
  async processPayment(bookingId, user, paymentMethod = 'UPI') {
    if (getGatewayMode() !== 'simulated') {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Direct payment confirmation is disabled. Please complete the payment through the payment gateway.');
    }
    const booking = await this.loadBooking(bookingId);
    if (String(booking.customer) !== String(user._id)) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, 'You can only pay for your own bookings');
    }
    const confirmed = await this.confirmBookingPayment(bookingId, paymentMethod);
    return { message: 'Payment processed (test mode) & funds held in escrow', paymentStatus: 'paid', financialStatus: 'AMOUNT_HELD', booking: confirmed };
  }

  // ───────────────────── 2. PARTNER CLAIMS AN OPEN JOB ─────────────────────
  async claimJobOffer(bookingId, partnerUser) {
    if (!partnerUser || partnerUser.role !== ROLES.PARTNER) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Only registered service partners can claim job offers.');
    }
    if (partnerUser.status !== 'active') {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Your account is disabled/suspended. Please contact City Admin to reactivate your account.');
    }
    if (partnerUser.kycStatus !== 'approved') {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Your KYC account is under verification. Only approved partners can claim jobs.');
    }
    if (!isObjectId(bookingId)) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Booking not found');

    const candidate = await Booking.findById(bookingId);
    if (!candidate) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Booking not found');

    const partnerDoc = await User.findById(partnerUser._id).lean();
    await resolvePartnerCities(partnerDoc);
    if (!isPartnerEligibleForBooking(partnerDoc, candidate)) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, 'This job is outside your service category, offered services or work area.');
    }

    // Atomic first-come-first-served lock. Only PAID, unclaimed, pending bookings can be claimed.
    const updated = await Booking.findOneAndUpdate(
      {
        _id: bookingId,
        status: 'Pending',
        partner: null,
        paymentStatus: 'paid',
        financialStatus: 'AMOUNT_HELD',
        cancelledByPartners: { $ne: partnerUser._id },
      },
      { $set: { partner: partnerUser._id, status: 'Accepted', assignedAt: new Date() } },
      { new: true }
    )
      .populate('customer', 'name email phone')
      .populate('service', 'name price finalPrice duration')
      .populate('category', 'name');

    if (!updated) {
      throw new ApiError(HTTP_STATUS.CONFLICT, 'Job already claimed by another technician!');
    }

    this.sendCompletionOtp(updated);

    emitToAllPartners('job_claimed', {
      bookingId: String(updated._id),
      claimedByPartnerId: String(partnerUser._id),
      message: `Booking ${updated.bookingId} claimed by another technician.`,
    });
    emitToUser(updated.customer?._id, 'partner_assigned', {
      bookingId: String(updated._id),
      booking: updated,
      partner: { id: partnerUser._id, name: partnerUser.name, phone: partnerUser.phone },
    });
    notifyBookingUpdate(updated);

    return { message: '🎉 Congratulations! You successfully claimed this booking.', status: 'Accepted', booking: updated };
  }

  // ───────────────────── 3. ADMIN / DISPATCH ASSIGNMENT ─────────────────────
  async assignPartner(bookingId, partnerId, actor) {
    if (!actor || !ADMIN_ROLES.includes(actor.role)) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Only admins can assign partners.');
    }
    const partner = await userRepository.findById(partnerId);
    if (!partner || partner.role !== ROLES.PARTNER) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Selected user is not a valid Partner');
    }
    if (partner.status !== 'active' || partner.kycStatus !== 'approved') {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Partner must be active and KYC-approved to receive bookings.');
    }

    const booking = await Booking.findOneAndUpdate(
      {
        _id: bookingId,
        status: { $in: ['Pending', 'Assigned'] },
        paymentStatus: 'paid',
        financialStatus: 'AMOUNT_HELD',
      },
      { $set: { partner: partner._id, status: 'Assigned', assignedAt: new Date() } },
      { new: true }
    );
    if (!booking) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Booking is not available for assignment (must be paid and not yet accepted/started).');
    }

    emitToUser(partner._id, 'job_assigned', { bookingId: String(booking._id), bookingNumber: booking.bookingId });
    notifyBookingUpdate(booking);
    return { message: `Booking assigned to partner '${partner.name}'`, status: 'Assigned', booking };
  }

  // ───────────── 4. PARTNER ACCEPTS AN ASSIGNED JOB (Assigned -> Accepted) ─────────────
  async acceptBooking(bookingId, partnerUser) {
    const booking = await Booking.findOneAndUpdate(
      { _id: bookingId, partner: partnerUser._id, status: 'Assigned' },
      { $set: { status: 'Accepted' } },
      { new: true }
    );
    if (!booking) {
      const existing = await Booking.findById(bookingId).select('partner status');
      if (!existing || String(existing.partner) !== String(partnerUser._id)) {
        throw new ApiError(HTTP_STATUS.FORBIDDEN, 'You are not assigned to this booking');
      }
      throw new ApiError(HTTP_STATUS.CONFLICT, `Booking cannot be accepted from status '${existing.status}'`);
    }
    this.sendCompletionOtp(booking);
    notifyBookingUpdate(booking);
    return { message: 'Job accepted successfully', status: 'Accepted', booking };
  }

  // ───────────── 5. ON THE WAY (Accepted -> On The Way) ─────────────
  async onTheWayBooking(bookingId, partnerUser) {
    const booking = await Booking.findOneAndUpdate(
      { _id: bookingId, partner: partnerUser._id, status: 'Accepted' },
      { $set: { status: 'On The Way' } },
      { new: true }
    );
    if (!booking) {
      const existing = await Booking.findById(bookingId).select('partner status');
      if (!existing || String(existing.partner) !== String(partnerUser._id)) {
        throw new ApiError(HTTP_STATUS.FORBIDDEN, 'You are not assigned to this booking');
      }
      if (existing.status === 'On The Way') return { message: 'Partner status already ON THE WAY', status: 'On The Way', booking: existing };
      throw new ApiError(HTTP_STATUS.CONFLICT, `Cannot start journey from status '${existing.status}'`);
    }
    notifyBookingUpdate(booking);
    return { message: 'Partner status updated to ON THE WAY', status: 'On The Way', booking };
  }

  // ───────────── 6. VERIFY CUSTOMER OTP & START JOB (On The Way -> Started) ─────────────
  async verifyCompletionOtp(bookingId, partnerUser, otp) {
    const booking = await this.loadBooking(bookingId, '+completionOtp');
    this.assertPartnerOwns(booking, partnerUser);

    if (booking.status === 'Started' && booking.otpVerified) {
      return { message: 'OTP already verified.', status: 'Started', otpVerified: true };
    }
    if (booking.status !== 'On The Way') {
      throw new ApiError(HTTP_STATUS.CONFLICT, `OTP can be verified only after you are on the way (current status: '${booking.status}').`);
    }
    if ((booking.otpFailedAttempts || 0) >= MAX_OTP_ATTEMPTS) {
      throw new ApiError(HTTP_STATUS.TOO_MANY_REQUESTS, 'Too many incorrect OTP attempts. Please contact support to continue this job.');
    }

    const inputOtp = String(otp || '').trim();
    if (!/^\d{4}$/.test(inputOtp) || !safeEqual(inputOtp, booking.completionOtp)) {
      await Booking.updateOne({ _id: booking._id }, { $inc: { otpFailedAttempts: 1 } });
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid 4-digit OTP. Please ask customer for correct completion code.');
    }

    const started = await Booking.findOneAndUpdate(
      { _id: booking._id, partner: partnerUser._id, status: 'On The Way' },
      { $set: { otpVerified: true, status: 'Started', startedAt: new Date() } },
      { new: true }
    );
    if (!started) throw new ApiError(HTTP_STATUS.CONFLICT, 'Booking state changed. Please refresh.');

    notifyBookingUpdate(started);
    return { message: 'OTP verified successfully! Service timer active.', status: 'Started', otpVerified: true, booking: started };
  }

  // 6b. Legacy "start" endpoint: only valid once the customer OTP has been verified
  async startBooking(bookingId, partnerUser) {
    const booking = await this.loadBooking(bookingId);
    this.assertPartnerOwns(booking, partnerUser);
    if (booking.status === 'Started' && booking.otpVerified) {
      return { message: 'Service already started', status: 'Started', booking };
    }
    throw new ApiError(
      HTTP_STATUS.BAD_REQUEST,
      'Customer OTP verification is required to start the service. Please verify the OTP shared by the customer.'
    );
  }

  // ───────────── packages ─────────────
  async getServicePackages(serviceId) {
    const service = await serviceRepository.findById(serviceId);
    if (!service) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Service not found');

    const packages = await servicePackageRepository.model
      .find({ service: serviceId, status: 'active' })
      .sort({ sortOrder: 1, createdAt: 1 });

    if (packages.length === 0) {
      return [
        {
          _id: service._id,
          service: service._id,
          title: 'Standard Execution Package',
          price: service.price || 0,
          finalPrice: service.finalPrice || service.price || 0,
          duration: service.duration || '45 mins',
          features: ['Standard Service Execution', 'Sanitization & Cleanup', 'Quality Audit'],
          isFallback: true,
        },
      ];
    }
    return packages;
  }

  // ───────────── 6d. EXTRA SERVICES (partner, only while the job is running) ─────────────
  async addExtraService(bookingId, partnerUser, payload = {}) {
    const booking = await this.loadBooking(bookingId);
    this.assertPartnerOwns(booking, partnerUser);
    if (booking.status !== 'Started') {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Extra services can only be added while the service is in progress.');
    }

    const { serviceId, packageId, name } = payload;
    let targetService = null;
    let targetPackage = null;

    if (serviceId && isObjectId(serviceId)) targetService = await serviceRepository.findById(serviceId);
    if (!targetService && name) {
      targetService = await serviceRepository.model.findOne({ name: { $regex: new RegExp(`^${escapeRegex(String(name).trim())}$`, 'i') } });
    }
    if (!targetService || targetService.status === 'deleted') {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Valid service not found');
    }

    const partnerDoc = await User.findById(partnerUser._id).select('offeredServices');
    if (Array.isArray(partnerDoc?.offeredServices) && partnerDoc.offeredServices.length > 0) {
      const ids = partnerDoc.offeredServices.map((s) => String(s._id || s));
      if (!ids.includes(String(targetService._id))) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, `Service '${targetService.name}' is not part of your authorized offered services.`);
      }
    }

    if (packageId && isObjectId(packageId)) {
      targetPackage = await servicePackageRepository.findById(packageId);
      if (!targetPackage || targetPackage.status !== 'active' || String(targetPackage.service) !== String(targetService._id)) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Selected package does not belong to this service.');
      }
    }

    // Price always comes from the database, never from the client
    const trustedPrice = Number(targetPackage ? targetPackage.finalPrice ?? targetPackage.price : targetService.finalPrice ?? targetService.price);
    if (!Number.isFinite(trustedPrice) || trustedPrice <= 0) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'This service does not have a valid price configured.');
    }

    const combinedItemName = `${targetService.name}${targetPackage ? ` - ${targetPackage.title}` : ''}`;
    const isDuplicate = (booking.extraServices || []).some((item) =>
      targetPackage && item.packageId
        ? String(item.packageId) === String(targetPackage._id) && item.paymentStatus !== 'PAID'
        : String(item.serviceId) === String(targetService._id) && item.paymentStatus !== 'PAID'
    );
    if (isDuplicate) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, `Extra service '${combinedItemName}' is already added to this booking.`);
    }

    booking.extraServices.push({
      serviceId: targetService._id,
      packageId: targetPackage ? targetPackage._id : null,
      serviceName: targetService.name,
      packageName: targetPackage ? targetPackage.title : 'Standard Package',
      name: combinedItemName,
      price: trustedPrice,
      paymentStatus: 'UNPAID',
      addedAt: new Date(),
    });

    const base = booking.baseFinancialSnapshot || booking.financialSnapshot || {};
    const totalExtraPrice = booking.extraServices.reduce((sum, item) => sum + Number(item.price || 0), 0);
    booking.financialSnapshot = await financialCalculatorService.calculateBreakdown({
      servicePrice: base.servicePrice || 0,
      extraServicesPrice: totalExtraPrice,
      categoryId: booking.category,
      discountAmount: base.discountAmount || 0,
      discountBearBy: base.discountBearBy || 'NOROZZ',
    });
    if (!booking.baseFinancialSnapshot) booking.baseFinancialSnapshot = base;
    await booking.save();

    notifyBookingUpdate(booking);
    return {
      message: `Added extra service '${combinedItemName}' (+₹${trustedPrice})`,
      addedItem: booking.extraServices[booking.extraServices.length - 1],
      financialSnapshot: booking.financialSnapshot,
      booking,
    };
  }

  async calculatePayableAmount(bookingId, user) {
    const booking = await this.loadBooking(bookingId);
    this.assertParticipant(booking, user);

    const extraServices = booking.extraServices || [];
    const unpaidItems = extraServices.filter((item) => item.paymentStatus === 'UNPAID');
    const extraServicesPrice = unpaidItems.reduce((sum, item) => sum + Number(item.price || 0), 0);

    const extraBreakdown = await financialCalculatorService.calculateBreakdown({
      servicePrice: 0,
      extraServicesPrice,
      categoryId: booking.category,
      discountAmount: 0,
      discountBearBy: 'NOROZZ',
    });

    const paidItems = extraServices.filter((item) => item.paymentStatus === 'PAID');
    const payableAmount = extraServicesPrice > 0 ? extraBreakdown.customerPayable : 0;

    return {
      bookingId: booking._id,
      bookingNumber: booking.bookingId,
      originalPaidAmount: booking.prepaidAmount || booking.amount,
      extraServicesPrice,
      customerPlatformFee: extraBreakdown.customerPlatformFee,
      partnerCommission: extraBreakdown.partnerCommission,
      payableAmount,
      unpaidItemsCount: unpaidItems.length,
      unpaidItems,
      paidItems,
      allAlreadyPaid: payableAmount === 0,
    };
  }

  // 6f. Partner confirms the on-site collection of the extra services
  async verifyExtraPayment(bookingId, partnerUser, { paymentMethod = 'UPI', paymentTxnId } = {}) {
    const booking = await this.loadBooking(bookingId);
    this.assertPartnerOwns(booking, partnerUser);
    if (booking.status !== 'Started') {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Extra payment can only be confirmed while the service is in progress.');
    }

    const txnId = String(paymentTxnId || `PAY-EXT-${Date.now()}-${crypto.randomInt(1000, 10000)}`).slice(0, 60);
    const now = new Date();
    booking.extraServices.forEach((item) => {
      if (item.paymentStatus !== 'PAID') {
        item.paymentStatus = 'PAID';
        item.paymentTxnId = txnId;
        item.paidAt = now;
      }
    });
    booking.extraPaymentMethod = String(paymentMethod || 'UPI').toLowerCase();
    await booking.save();

    return { message: 'Extra payment verified successfully!', payableAmount: 0, paymentTxnId: txnId, booking };
  }

  // ───────────── 7. COMPLETE JOB & SETTLE ─────────────
  async completeBooking(bookingId, partnerUser) {
    const booking = await this.loadBooking(bookingId);
    this.assertPartnerOwns(booking, partnerUser);

    // Resume a settlement that failed half-way on a previous attempt
    const resuming = booking.status === 'Completed' && ['AMOUNT_HELD', 'SETTLEMENT_PENDING'].includes(booking.financialStatus);

    if (!resuming) {
      if (booking.status !== 'Started' || !booking.otpVerified) {
        throw new ApiError(
          HTTP_STATUS.BAD_REQUEST,
          booking.status === 'Completed'
            ? 'This booking is already completed.'
            : 'Service must be started with customer OTP verification before it can be completed.'
        );
      }
      if ((booking.extraServices || []).some((i) => i.paymentStatus !== 'PAID')) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Please collect and confirm payment for the extra services before completing the job.');
      }
      const done = await Booking.findOneAndUpdate(
        { _id: booking._id, partner: partnerUser._id, status: 'Started', otpVerified: true },
        { $set: { status: 'Completed', completedAt: new Date() } },
        { new: true }
      );
      if (!done) throw new ApiError(HTTP_STATUS.CONFLICT, 'Booking state changed. Please refresh.');
    }

    const settlementResult = await financialEngineService.settleBooking(bookingId);

    // Referral bonus: credited once, on the referred partner's first completed job
    await this.creditReferralBonusIfDue(partnerUser._id).catch((e) => console.error('Referral bonus notice:', e.message));

    const final = await Booking.findById(bookingId);
    notifyBookingUpdate(final);
    return {
      message: 'Service completed & financial settlement executed successfully!',
      status: 'Completed',
      financialStatus: final.financialStatus,
      settlement: settlementResult.breakdown,
      booking: final,
    };
  }

  async creditReferralBonusIfDue(partnerId) {
    const p = await User.findById(partnerId).select('referredByPartner referralBonusStatus name');
    if (!p?.referredByPartner || p.referralBonusStatus === 'credited') return;

    // Claim the bonus atomically so concurrent completions can't pay it twice
    const claimed = await User.findOneAndUpdate(
      { _id: partnerId, referralBonusStatus: { $ne: 'credited' } },
      { $set: { referralBonusStatus: 'credited' } }
    );
    if (!claimed) return;

    const settings = await SystemSettings.findOne({ key: 'global_settings' });
    const bonusAmt = settings?.referralBonusAmount ?? 500;
    try {
      await financialEngineService.creditWallet({
        party: 'partner',
        userId: p.referredByPartner,
        amount: bonusAmt,
        category: 'Referral Bonus',
        title: `Referral Bonus for inviting ${p.name || 'Service Technician'}`,
        idempotencyKey: `REFERRAL-${partnerId}`,
        referenceType: 'Referral',
        referenceId: String(partnerId),
        ledgerType: 'ADMIN_ADJUSTMENT',
        extraInc: { referralEarnings: bonusAmt },
      });
    } catch (err) {
      await User.updateOne({ _id: partnerId }, { $set: { referralBonusStatus: 'pending' } });
      throw err;
    }
  }

  // ───────────── 8. RATING (single source of truth: the review system) ─────────────
  async rateBooking(bookingId, customerUser, rating, reviewComment) {
    const { reviewService } = await import('./review.service.js');
    const booking = await this.loadBooking(bookingId);
    if (String(booking.customer) !== String(customerUser._id)) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, 'You can only rate your own bookings');
    }
    const result = await reviewService.createReview(customerUser, { orderId: bookingId, rating, comment: reviewComment || '' });
    const fresh = await Booking.findById(bookingId);
    return { message: 'Thank you for your rating & feedback!', rating: Number(rating), reviewComment: reviewComment || '', review: result.review, booking: fresh };
  }

  // ───────────── 9. CANCEL & REFUND ─────────────
  async cancelBooking(bookingId, user, reason) {
    const booking = await this.loadBooking(bookingId);
    const isAdmin = ADMIN_ROLES.includes(user.role);
    const isOwner = String(booking.customer) === String(user._id);
    if (!isOwner && !isAdmin) throw new ApiError(HTTP_STATUS.FORBIDDEN, 'You can only cancel your own bookings');

    if (booking.status === 'Completed') {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Completed bookings cannot be cancelled');
    }
    if (['Cancelled', 'Refunded'].includes(booking.status)) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'This booking is already cancelled');
    }
    if (booking.otpVerified || booking.status === 'Started') {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Service has already started (OTP verified). Bookings cannot be cancelled after service initiation!');
    }

    const wasPaid = booking.financialStatus === 'AMOUNT_HELD';
    const cancelledBy = isAdmin ? 'admin' : 'customer';
    const cleanReason = String(reason || '').trim().slice(0, 500) || (isAdmin ? 'Cancelled by admin' : 'Customer Cancellation');

    const cancelled = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        status: { $in: CANCELLABLE_STATUSES },
        otpVerified: { $ne: true },
        financialStatus: booking.financialStatus,
      },
      {
        $set: {
          status: wasPaid ? 'Refunded' : 'Cancelled',
          paymentStatus: wasPaid ? 'refunded' : booking.paymentStatus,
          financialStatus: wasPaid ? 'REFUNDED' : 'CANCELLED',
          cancellationReason: cleanReason,
          cancelledBy,
          cancelledAt: new Date(),
        },
      },
      { new: true }
    );
    if (!cancelled) throw new ApiError(HTTP_STATUS.CONFLICT, 'Booking state changed. Please refresh and try again.');

    let refundAmount = 0;
    if (wasPaid) {
      // Customer cancellations keep the non-refundable platform fee; admin cancellations refund everything.
      const { refund } = await financialEngineService.refundHeldPayment(cancelled, {
        refundPlatformFee: isAdmin,
        reason: cleanReason,
      });
      refundAmount = refund;
      cancelled.refundAmount = refund;
      await Booking.updateOne({ _id: cancelled._id }, { $set: { refundAmount: refund } });
    }

    notifyBookingUpdate(cancelled, { message: 'This booking was cancelled.' });
    if (cancelled.partner) emitToUser(cancelled.partner, 'booking_cancelled', { bookingId: String(cancelled._id), bookingNumber: cancelled.bookingId });
    emitToAllPartners('job_claimed', { bookingId: String(cancelled._id), message: 'This booking is no longer available.' });

    return {
      message: wasPaid
        ? `Booking cancelled successfully. ₹${refundAmount} refunded to your wallet.`
        : 'Booking cancelled successfully.',
      status: cancelled.status,
      paymentStatus: cancelled.paymentStatus,
      refundAmount,
      booking: cancelled,
    };
  }

  // ───────────── queries ─────────────
  async getCustomerBookings(customerId) {
    return Booking.find({ customer: customerId })
      .select('+completionOtp')
      .populate('category', 'name slug image')
      .populate('service', 'name slug price finalPrice duration')
      .populate('partner', 'name agencyName phone profileImage')
      .sort({ createdAt: -1 });
  }

  async getBookingById(bookingId, user) {
    if (!isObjectId(bookingId)) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Booking not found');
    const canSeeOtp = async () => {
      const b = await Booking.findById(bookingId).select('customer');
      return b && (String(b.customer) === String(user._id) || ADMIN_ROLES.includes(user.role));
    };

    const q = Booking.findById(bookingId)
      .populate('category', 'name slug image')
      .populate('service', 'name slug price finalPrice duration')
      .populate('customer', 'name email phone')
      .populate('partner', 'name agencyName phone profileImage locationCoordinates');
    if (await canSeeOtp()) q.select('+completionOtp');

    const booking = await q;
    if (!booking) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Booking not found');
    this.assertParticipant(booking, user);
    return booking;
  }

  // Public (customer-safe) partner profile: only for partners that served/are serving this customer
  async getPartnerPublicProfile(partnerId, user) {
    if (!isObjectId(partnerId)) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Partner profile not found');

    if (!ADMIN_ROLES.includes(user.role)) {
      const related = await Booking.exists({ customer: user._id, partner: partnerId });
      if (!related) throw new ApiError(HTTP_STATUS.FORBIDDEN, 'You can view profiles of your assigned partners only.');
    }

    const partner = await User.findOne({ _id: partnerId, role: ROLES.PARTNER })
      .select('name agencyName profileImage experience averageRating totalRatings city category categories certifications kycStatus createdAt')
      .populate('category categories', 'name');
    if (!partner) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Partner profile not found');

    const [completedCount, totalJobsCount, reviewDocs] = await Promise.all([
      Booking.countDocuments({ partner: partnerId, status: 'Completed' }),
      Booking.countDocuments({ partner: partnerId, status: { $nin: ['Cancelled', 'Refunded'] } }),
      Review.find({ revieweeId: partnerId, reviewerRole: 'CUSTOMER', status: 'PUBLISHED', isDeleted: false })
        .populate('reviewerId', 'name')
        .sort({ createdAt: -1 })
        .limit(10),
    ]);

    const profile = partner.toObject();
    profile.completedBookingsCount = completedCount;
    profile.totalJobsCount = totalJobsCount;
    profile.rating = partner.totalRatings > 0 ? partner.averageRating : null;
    profile.reviewsCount = partner.totalRatings || 0;
    profile.reviews = reviewDocs.map((r) => ({
      id: r._id,
      customerName: (r.reviewerId?.name || 'Customer').split(' ')[0],
      rating: r.rating,
      comment: r.comment,
      date: r.createdAt,
    }));
    profile.verifiedBadges = partner.kycStatus === 'approved' ? ['KYC Approved Partner'] : [];
    return profile;
  }

  // ───────────── background dispatch sweep (called by cron) ─────────────
  async runDispatchSweep() {
    const now = Date.now();
    const { autoAssignmentService } = await import('./autoAssignment.service.js');

    // 1. Unpaid bookings are abandoned after 30 minutes
    await Booking.updateMany(
      { status: 'Pending', financialStatus: 'PAYMENT_PENDING', createdAt: { $lt: new Date(now - UNPAID_BOOKING_TTL_MS) } },
      { $set: { status: 'Cancelled', financialStatus: 'CANCELLED', cancelledBy: 'system', cancellationReason: 'Payment not completed', cancelledAt: new Date() } }
    );

    // 2. Partner was assigned but never accepted -> re-open the job
    const stale = await Booking.find({
      status: 'Assigned',
      assignedAt: { $lt: new Date(now - ASSIGNED_ACCEPT_TTL_MS) },
    }).limit(50);
    for (const b of stale) {
      const reopened = await Booking.findOneAndUpdate(
        { _id: b._id, status: 'Assigned', partner: b.partner },
        {
          $set: { status: 'Pending', partner: null, assignedAt: null, autoAssignAttemptedAt: null },
          $addToSet: { cancelledByPartners: b.partner },
          $inc: { reassignCount: 1 },
        },
        { new: true }
      );
      if (reopened) notifyBookingUpdate(reopened);
    }

    // 3. Paid & unassigned: auto-assign (first after 60s, then retry every 2 minutes)
    const waiting = await Booking.find({
      status: 'Pending',
      partner: null,
      paymentStatus: 'paid',
      financialStatus: 'AMOUNT_HELD',
      createdAt: { $lt: new Date(now - AUTO_ASSIGN_DELAY_MS) },
      $or: [{ autoAssignAttemptedAt: null }, { autoAssignAttemptedAt: { $lt: new Date(now - AUTO_ASSIGN_RETRY_MS) } }],
    }).limit(50);

    for (const b of waiting) {
      // Give up if nobody can serve it for too long, or it bounced between too many partners: refund in full
      const tooOld = now - new Date(b.createdAt).getTime() > NO_PARTNER_TTL_MS;
      if (tooOld || b.reassignCount >= MAX_REASSIGNMENTS) {
        await this.systemCancelWithFullRefund(b, 'No service partner available for your booking');
        continue;
      }
      const marked = await Booking.findOneAndUpdate(
        { _id: b._id, status: 'Pending', partner: null, autoAssignAttemptedAt: b.autoAssignAttemptedAt },
        { $set: { autoAssignAttemptedAt: new Date() } }
      );
      if (!marked) continue; // another instance took it
      try {
        const result = await autoAssignmentService.autoAssignPartner(b._id);
        if (!result.success) {
          const populated = await Booking.findById(b._id).populate([
            { path: 'category', select: 'name' },
            { path: 'service', select: 'name' },
            { path: 'customer', select: 'name' },
          ]);
          dispatchNewJobOffer(populated).catch(() => {});
        }
      } catch (err) {
        console.warn('Auto-assignment sweep error:', err.message);
      }
    }
  }

  async systemCancelWithFullRefund(booking, reason) {
    const cancelled = await Booking.findOneAndUpdate(
      { _id: booking._id, status: 'Pending', partner: null, financialStatus: 'AMOUNT_HELD' },
      {
        $set: {
          status: 'Refunded',
          paymentStatus: 'refunded',
          financialStatus: 'REFUNDED',
          cancelledBy: 'system',
          cancellationReason: reason,
          cancelledAt: new Date(),
        },
      },
      { new: true }
    );
    if (!cancelled) return;
    const { refund } = await financialEngineService.refundHeldPayment(cancelled, { refundPlatformFee: true, reason });
    await Booking.updateOne({ _id: cancelled._id }, { $set: { refundAmount: refund } });
    notifyBookingUpdate(cancelled, { message: reason });
  }
}

export const bookingService = new BookingService();
export { ACTIVE_STATUSES, CANCELLABLE_STATUSES };
