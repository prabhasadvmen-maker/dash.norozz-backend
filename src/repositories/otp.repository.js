import { BaseRepository } from './base.repository.js';
import { Otp } from '../models/otp.model.js';
import { normalizePhoneNumber, getBase10PhoneNumber } from '../utils/phone.util.js';

export class OtpRepository extends BaseRepository {
  constructor() {
    super(Otp);
  }

  async create(data) {
    if (data.emailOrPhone) {
      data.emailOrPhone = normalizePhoneNumber(data.emailOrPhone);
    }
    return await super.create(data);
  }

  async findLatestValidOtp(emailOrPhone, type = 'resetPassword') {
    if (!emailOrPhone) return null;
    const clean = emailOrPhone.trim();
    if (clean.includes('@')) {
      return await this.model
        .findOne({
          emailOrPhone: clean.toLowerCase(),
          type,
          isVerified: false,
          expiresAt: { $gt: new Date() },
        })
        .sort({ createdAt: -1 });
    }

    const base10 = getBase10PhoneNumber(clean);
    const normalized = normalizePhoneNumber(clean);

    const searchTargets = [normalized, clean];
    if (base10) {
      searchTargets.push(base10, `+91${base10}`, `91${base10}`, `0${base10}`);
    }

    return await this.model
      .findOne({
        emailOrPhone: { $in: searchTargets },
        type,
        isVerified: false,
        expiresAt: { $gt: new Date() },
      })
      .sort({ createdAt: -1 });
  }

  async markAsVerified(id) {
    return await this.model.findByIdAndUpdate(id, { isVerified: true }, { new: true });
  }

  /**
   * Build all possible phone variants to match against DB
   * (DB stores normalized form but we query with all variants to be safe)
   */
  _buildSearchTargets(emailOrPhone) {
    const clean = emailOrPhone.trim();
    if (clean.includes('@')) return [clean.toLowerCase()];
    const base10 = getBase10PhoneNumber(clean);
    const normalized = normalizePhoneNumber(clean);
    const targets = [normalized, clean];
    if (base10) targets.push(base10, `+91${base10}`, `91${base10}`, `0${base10}`);
    return [...new Set(targets)];
  }

  async findRecentOtp(emailOrPhone, type, cooldownSeconds = 60) {
    const since = new Date(Date.now() - cooldownSeconds * 1000);
    const targets = this._buildSearchTargets(emailOrPhone);
    return await this.model.findOne({
      emailOrPhone: { $in: targets },
      type,
      createdAt: { $gt: since },
    }).sort({ createdAt: -1 });
  }

  /**
   * Returns count of OTPs sent to a number/email within the given window.
   * Used to enforce per-number OTP rate limit (max 3 per 10 min in production).
   */
  async countRecentOtps(emailOrPhone, type, windowMs) {
    const since = new Date(Date.now() - windowMs);
    const targets = this._buildSearchTargets(emailOrPhone);
    return await this.model.countDocuments({
      emailOrPhone: { $in: targets },
      type,
      createdAt: { $gt: since },
    });
  }
}

export const otpRepository = new OtpRepository();
