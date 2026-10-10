import mongoose from 'mongoose';

/**
 * Generic Base Repository Class implementing Mongoose Repository Pattern
 */
export class BaseRepository {
  constructor(model) {
    this.model = model;
  }

  async create(data) {
    return await this.model.create(data);
  }

  async findById(id, select = '') {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    return await this.model.findById(id).select(select);
  }

  async findOne(filter = {}, select = '') {
    return await this.model.findOne(filter).select(select);
  }

  async find(filter = {}, select = '', sort = { createdAt: -1 }) {
    return await this.model.find(filter).select(select).sort(sort);
  }

  async updateById(id, updateData, options = { new: true, runValidators: true }) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    return await this.model.findByIdAndUpdate(id, updateData, options);
  }

  async deleteById(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    return await this.model.findByIdAndDelete(id);
  }

  async count(filter = {}) {
    return await this.model.countDocuments(filter);
  }

  async paginate(filter = {}, page = 1, limit = 10, select = '') {
    const skip = (page - 1) * limit;
    const items = await this.model.find(filter).select(select).skip(skip).limit(limit).sort({ createdAt: -1 });
    const total = await this.model.countDocuments(filter);
    return {
      items,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }
}
