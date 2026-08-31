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
}

export const otpRepository = new OtpRepository();
