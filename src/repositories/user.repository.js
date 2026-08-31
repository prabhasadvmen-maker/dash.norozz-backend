import { BaseRepository } from './base.repository.js';
import { User } from '../models/user.model.js';
import { normalizePhoneNumber, getBase10PhoneNumber } from '../utils/phone.util.js';

/**
 * User Repository extending BaseRepository
 */
export class UserRepository extends BaseRepository {
  constructor() {
    super(User);
  }

  async findByEmail(email, selectWithPassword = false) {
    const query = this.model.findOne({ email });
    if (selectWithPassword) {
      query.select('+password');
    }
    return await query;
  }

  async findByPhone(phone, selectWithPassword = false) {
    if (!phone) return null;
    const clean = phone.trim();
    const base10 = getBase10PhoneNumber(clean);
    const normalized = normalizePhoneNumber(clean);

    const searchConditions = [
      { phone: normalized },
      { phone: clean },
    ];
    if (base10) {
      searchConditions.push(
        { phone: base10 },
        { phone: `+91${base10}` },
        { phone: `91${base10}` },
        { phone: `0${base10}` },
        { phone: new RegExp(`${base10}$`) }
      );
    }

    const query = this.model.findOne({ $or: searchConditions });
    if (selectWithPassword) {
      query.select('+password');
    }
    const user = await query;

    // Self-healing: Automatically normalize legacy stored phone number format to canonical +91
    if (user && user.phone && user.phone !== normalized) {
      user.phone = normalized;
      await user.save({ validateBeforeSave: false }).catch(() => {});
    }

    return user;
  }

  async findByEmailOrPhone(identifier, selectWithPassword = false) {
    if (!identifier) return null;
    const clean = identifier.trim();
    if (clean.includes('@')) {
      return await this.findByEmail(clean.toLowerCase(), selectWithPassword);
    }
    return await this.findByPhone(clean, selectWithPassword);
  }

  async updateRefreshToken(userId, refreshToken) {
    return await this.model.findByIdAndUpdate(userId, { refreshToken }, { new: true });
  }

  async findByRole(role) {
    return await this.model.find({ role }).sort({ createdAt: -1 });
  }

  async findByCity(assignedCity) {
    return await this.model.find({ assignedCity }).sort({ createdAt: -1 });
  }
}

export const userRepository = new UserRepository();
