import { BaseRepository } from './base.repository.js';
import { ServicePackage } from '../models/servicePackage.model.js';

export class ServicePackageRepository extends BaseRepository {
  constructor() {
    super(ServicePackage);
  }

  async findActiveByService(serviceId) {
    return await this.model
      .find({ service: serviceId, status: 'active' })
      .sort({ sortOrder: 1, createdAt: 1 });
  }

  async findAllByService(serviceId) {
    return await this.model
      .find({ service: serviceId, status: { $ne: 'deleted' } })
      .sort({ sortOrder: 1, createdAt: 1 });
  }

  async findBySlugAndService(slug, serviceId, excludeId = null) {
    const query = { slug, service: serviceId, status: { $ne: 'deleted' } };
    if (excludeId) query._id = { $ne: excludeId };
    return await this.model.findOne(query);
  }
}

export const servicePackageRepository = new ServicePackageRepository();
