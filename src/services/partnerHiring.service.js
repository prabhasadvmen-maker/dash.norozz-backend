import crypto from 'crypto';
import { Otp } from '../models/otp.model.js';
import {
  PartnerHiring,
  HIRING_CATEGORIES,
  HIRING_WORK_TYPES,
  HIRING_ID_TYPES,
  HIRING_REVIEW_STATUSES,
} from '../models/partnerHiring.model.js';
import { notificationService } from './notificationService.js';
import { paymentGatewayService } from './paymentGateway.service.js';
import { r2StorageService } from './r2Storage.service.js';
import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

const REGISTRATION_FEE = 499;
const OTP_TTL_MS = 10 * 60 * 1000;
const VERIFIED_TTL_MS = 60 * 60 * 1000; // a verified OTP stays usable for 1 hour
const OTP_COOLDOWN_MS = 45 * 1000;
const OTP_MAX_PER_HOUR = 5;
const OTP_MAX_ATTEMPTS = 5;
const OTP_TYPE = { email: 'hiringEmail', mobile: 'hiringMobile' };

const bad = (msg, errors) => new ApiError(HTTP_STATUS.BAD_REQUEST, msg, errors);

const normalizeValue = (channel, value) => {
  const v = String(value || '').trim();
  if (channel === 'email') {
    if (!/^\S+@\S+\.\S+$/.test(v)) throw bad('Enter a valid email address');
    return v.toLowerCase();
  }
  const digits = v.replace(/\D/g, '').slice(-10);
  if (!/^[6-9]\d{9}$/.test(digits)) throw bad('Enter a valid 10-digit mobile number');
  return digits;
};

const parseJson = (raw, fallback) => {
  if (typeof raw !== 'string') return raw ?? fallback;
  try {
    return JSON.parse(raw || 'null') ?? fallback;
  } catch {
    throw bad('Malformed form data');
  }
};

const parseAddress = (raw, label) => {
  const a = parseJson(raw, {});
  const out = {
    house: String(a.house || '').trim(),
    street: String(a.street || '').trim(),
    city: String(a.city || '').trim(),
    state: String(a.state || '').trim(),
    pin: String(a.pin || '').trim(),
  };
  if (!out.house || !out.street || !out.city || !out.state) throw bad(`${label} is incomplete`);
  if (!/^\d{6}$/.test(out.pin)) throw bad(`${label}: enter a valid 6-digit PIN code`);
  return out;
};

const uploadDoc = async (file, folder) => {
  if (!file) return undefined;
  const res = await r2StorageService.uploadFile(file.buffer, file.originalname, file.mimetype, folder);
  return { url: res.url, key: res.key, name: file.originalname, mimeType: file.mimetype };
};

const generateReceiptNo = () => {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `NRZ-${ymd}-${crypto.randomInt(100000, 999999)}`;
};

const receiptOf = (app) => ({
  applicationId: app._id,
  receiptNumber: app.receiptNumber,
  name: app.fullName,
  mobile: app.mobile,
  email: app.email,
  serviceCategory: app.serviceCategory,
  paymentMethod: app.paymentMethod,
  paymentStatus: app.paymentStatus,
  amount: app.registrationFee,
  paidAt: app.paidAt,
});

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const partnerHiringService = {
  async sendOtp(channel, rawValue) {
    const value = normalizeValue(channel, rawValue);
    const type = OTP_TYPE[channel];

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await Otp.find({ emailOrPhone: value, type, createdAt: { $gt: hourAgo } }).sort({ createdAt: -1 });
    if (recent.length >= OTP_MAX_PER_HOUR) {
      throw new ApiError(429, 'OTP limit reached. Please try again after some time.');
    }
    if (recent[0] && Date.now() - recent[0].createdAt.getTime() < OTP_COOLDOWN_MS) {
      throw new ApiError(429, 'OTP already sent. Please wait a few seconds before retrying.');
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    await Otp.create({ emailOrPhone: value, otp, type, expiresAt: new Date(Date.now() + OTP_TTL_MS) });

    if (process.env.NODE_ENV !== 'production') console.log(`[partner-hiring] DEV OTP for ${value}: ${otp}`);
    const sent =
      channel === 'email'
        ? await notificationService.sendEmailOtp(value, otp)
        : await notificationService.sendSmsOtp(`+91${value}`, otp);
    if (!sent) throw new ApiError(502, 'Could not send OTP. Please try again.');

    return { channel, expiresInSeconds: OTP_TTL_MS / 1000 };
  },

  async verifyOtp(channel, rawValue, otp) {
    const value = normalizeValue(channel, rawValue);
    const record = await Otp.findOne({
      emailOrPhone: value,
      type: OTP_TYPE[channel],
      isVerified: false,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });
    if (!record) throw bad('OTP expired or not requested. Please request a new OTP.');
    if (record.attempts >= OTP_MAX_ATTEMPTS) throw bad('Too many wrong attempts. Please request a new OTP.');

    if (record.otp !== String(otp)) {
      record.attempts += 1;
      await record.save();
      throw bad('Incorrect OTP');
    }
    record.isVerified = true;
    record.expiresAt = new Date(Date.now() + VERIFIED_TTL_MS);
    await record.save();
    return { channel, verified: true };
  },

  async isVerified(channel, value) {
    const rec = await Otp.exists({
      emailOrPhone: value,
      type: OTP_TYPE[channel],
      isVerified: true,
      expiresAt: { $gt: new Date() },
    });
    return !!rec;
  },

  async submitApplication(body, files, ip) {
    const fullName = String(body.fullName || '').trim();
    if (!fullName) throw bad('Full name is required');
    const email = normalizeValue('email', body.email);
    const mobile = normalizeValue('mobile', body.mobile);

    if (!(await this.isVerified('mobile', mobile))) throw bad('Please verify your mobile number with OTP');
    if (!(await this.isVerified('email', email))) throw bad('Please verify your email address with OTP');

    const dob = new Date(body.dob);
    if (Number.isNaN(dob.getTime())) throw bad('Valid date of birth is required');
    if ((Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000) < 18) throw bad('Applicant must be at least 18 years old');
    if (!['Male', 'Female', 'Other'].includes(body.gender)) throw bad('Select a valid gender');

    const currentAddress = parseAddress(body.currentAddress, 'Current address');
    const sameAddress = String(body.permanentSameAsCurrent) === 'true';
    const permanentAddress = sameAddress ? currentAddress : parseAddress(body.permanentAddress, 'Permanent address');

    if (!HIRING_CATEGORIES.includes(body.serviceCategory)) throw bad('Select a valid service category');
    if (!HIRING_WORK_TYPES.includes(body.preferredWorkType)) throw bad('Select a valid preferred work type');
    if (!HIRING_ID_TYPES.includes(body.identityProofType)) throw bad('Select a valid identity proof type');
    const experienceYears = Number(body.experienceYears);
    if (!Number.isFinite(experienceYears) || experienceYears < 0 || experienceYears > 60) throw bad('Enter valid work experience');
    const skills = parseJson(body.skills, []).map((s) => String(s).trim()).filter(Boolean);
    if (!skills.length) throw bad('Select at least one skill');

    const isDriver = body.serviceCategory === 'Driver Care';
    if (!files.profilePhoto?.[0]) throw bad('Profile photo is required');
    if (!files.identityProof?.[0]) throw bad('Identity proof is required');
    if (!files.addressProof?.[0]) throw bad('Address proof is required');
    if (isDriver && !files.drivingLicence?.[0]) throw bad('Driving licence is required for Driver Care');

    const consented = ['acceptTerms', 'acceptPrivacy', 'acceptRefund'].every((k) => String(body[k]) === 'true');
    if (!consented) throw bad('Please accept all consent declarations');

    const existing = await PartnerHiring.exists({ $or: [{ mobile }, { email }], paymentStatus: 'Paid' });
    if (existing) throw new ApiError(409, 'An application with this mobile or email is already registered.');

    const folder = 'partner_hiring';
    const [profilePhoto, identityProof, addressProof, drivingLicence] = await Promise.all([
      uploadDoc(files.profilePhoto[0], `${folder}/photos`),
      uploadDoc(files.identityProof[0], `${folder}/identity`),
      uploadDoc(files.addressProof[0], `${folder}/address`),
      isDriver ? uploadDoc(files.drivingLicence[0], `${folder}/licence`) : undefined,
    ]);

    const application = await PartnerHiring.create({
      fullName, mobile, email, dob, gender: body.gender,
      isMobileVerified: true, isEmailVerified: true,
      profilePhoto, currentAddress, permanentSameAsCurrent: sameAddress, permanentAddress,
      serviceCategory: body.serviceCategory, experienceYears, skills, preferredWorkType: body.preferredWorkType,
      identityProofType: body.identityProofType, identityProof, addressProof, drivingLicence,
      consent: { termsAccepted: true, privacyAccepted: true, refundPolicyAccepted: true, acceptedAt: new Date(), ip },
      registrationFee: REGISTRATION_FEE,
      paymentMethod: String(body.paymentMethod || '').trim(),
    });

    const order = await paymentGatewayService.createOrder({
      amountRupees: REGISTRATION_FEE,
      receipt: `hire_${application._id}`,
      notes: { applicationId: String(application._id), type: 'partner_hiring_fee' },
    });
    application.paymentOrderId = order.orderId;
    await application.save();

    return {
      applicationId: application._id,
      payment: { mode: order.mode, orderId: order.orderId, keyId: order.keyId, amount: REGISTRATION_FEE * 100, currency: 'INR' },
    };
  },

  async verifyPayment(applicationId, { orderId, paymentId, signature }) {
    const application = await PartnerHiring.findById(applicationId);
    if (!application || application.paymentOrderId !== orderId) throw new ApiError(404, 'Application not found');
    if (application.paymentStatus === 'Paid') return receiptOf(application);

    const valid = paymentGatewayService.verifySignature({ orderId, paymentId, signature });
    if (!valid) {
      await PartnerHiring.updateOne({ _id: application._id, paymentStatus: 'Pending' }, { $set: { paymentStatus: 'Failed' } });
      throw bad('Invalid payment signature. If money was deducted it will be refunded automatically.');
    }

    const paid = await PartnerHiring.findOneAndUpdate(
      { _id: application._id, paymentStatus: { $ne: 'Paid' } },
      {
        $set: {
          paymentStatus: 'Paid',
          paymentId: paymentId || `pay_sim_${crypto.randomBytes(6).toString('hex')}`,
          paidAt: new Date(),
          receiptNumber: generateReceiptNo(),
        },
      },
      { new: true }
    );
    return receiptOf(paid || (await PartnerHiring.findById(applicationId)));
  },

  // ---------- Super Admin ----------
  async adminList({ status, category, payment, search, page = 1, limit = 20 }) {
    const q = {};
    if (payment !== 'all') q.paymentStatus = ['Pending', 'Paid', 'Failed'].includes(payment) ? payment : 'Paid';
    if (HIRING_REVIEW_STATUSES.includes(status)) q.reviewStatus = status;
    if (HIRING_CATEGORIES.includes(category)) q.serviceCategory = category;
    if (search && String(search).trim()) {
      const rx = new RegExp(escapeRegex(String(search).trim()), 'i');
      q.$or = [{ fullName: rx }, { mobile: rx }, { email: rx }, { receiptNumber: rx }];
    }
    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(100, Math.max(1, Number(limit) || 20));
    const [items, total] = await Promise.all([
      PartnerHiring.find(q).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l).lean(),
      PartnerHiring.countDocuments(q),
    ]);
    return { items, total, page: p, pages: Math.ceil(total / l) || 1 };
  },

  async adminStats() {
    const paid = { paymentStatus: 'Paid' };
    const [total, pending, underReview, approved, rejected] = await Promise.all([
      PartnerHiring.countDocuments(paid),
      PartnerHiring.countDocuments({ ...paid, reviewStatus: 'Pending' }),
      PartnerHiring.countDocuments({ ...paid, reviewStatus: 'Under Review' }),
      PartnerHiring.countDocuments({ ...paid, reviewStatus: 'Approved' }),
      PartnerHiring.countDocuments({ ...paid, reviewStatus: 'Rejected' }),
    ]);
    return { total, pending, underReview, approved, rejected };
  },

  async adminGet(id) {
    const app = await PartnerHiring.findById(id).lean();
    if (!app) throw new ApiError(404, 'Application not found');
    return app;
  },

  async adminReview(id, { status, remarks }, adminId) {
    if (!HIRING_REVIEW_STATUSES.includes(status)) throw bad('Invalid review status');
    if (status === 'Rejected' && !String(remarks || '').trim()) throw bad('Remarks are required when rejecting an application');
    const app = await PartnerHiring.findOneAndUpdate(
      { _id: id, paymentStatus: 'Paid' },
      { $set: { reviewStatus: status, reviewRemarks: String(remarks || '').trim(), reviewedBy: adminId, reviewedAt: new Date() } },
      { new: true }
    ).lean();
    if (!app) throw new ApiError(404, 'Application not found');
    return app;
  },
};
