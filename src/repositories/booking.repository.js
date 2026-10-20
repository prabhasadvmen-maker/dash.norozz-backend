import { BaseRepository } from './base.repository.js';
import { Booking } from '../models/booking.model.js';

export class BookingRepository extends BaseRepository {
  constructor() {
    super(Booking);
  }

  async findRecent(limit = 10) {
    return await this.model
      .find()
      .populate('customer', 'name email phone')
      .populate('partner', 'name agencyName phone')
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  async findByCity(city) {
    return await this.model
      .find({ city })
      .populate('customer', 'name email phone')
      .populate('partner', 'name agencyName phone')
      .sort({ createdAt: -1 });
  }

  async getGrossRevenue() {
    const result = await this.model.aggregate([
      { $match: { status: 'Completed' } },
      { $group: { _id: null, totalRevenue: { $sum: { $ifNull: ['$financialSnapshot.customerPayable', '$amount'] } } } },
    ]);
    return result[0]?.totalRevenue || 0;
  }
}

export const bookingRepository = new BookingRepository();
