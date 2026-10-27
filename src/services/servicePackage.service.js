import { servicePackageRepository } from '../repositories/servicePackage.repository.js';
import { serviceRepository } from '../repositories/service.repository.js';
import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

export class ServicePackageService {

  slugify(text) {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9 -]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  async generateUniqueSlug(text, serviceId, currentId = null) {
    let baseSlug = this.slugify(text);
    if (!baseSlug) baseSlug = 'package';
    let slug = baseSlug;
    let counter = 1;

    while (true) {
      const existing = await servicePackageRepository.findBySlugAndService(slug, serviceId, currentId);
      if (!existing) return slug;
      slug = `${baseSlug}-${counter++}`;
    }
  }

  // 1. CREATE PACKAGE FOR SERVICE
  async createPackage(serviceId, packageData, createdById = null) {
    const parentService = await serviceRepository.findById(serviceId);
    if (!parentService || parentService.status === 'deleted') {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Parent Service record not found or deleted');
    }

    const title = packageData.title ? packageData.title.trim() : 'Standard Package';
    const slug = await this.generateUniqueSlug(title, serviceId);

    const price = Number(packageData.price) || 0;
    if (price < 0) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Package price cannot be negative');
    }

    const discountType = ['none', 'fixed', 'percentage'].includes(packageData.discountType)
      ? packageData.discountType
      : 'none';
    const discountValue = Number(packageData.discountValue) || 0;

    if (discountType === 'percentage' && discountValue > 100) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Percentage discount cannot exceed 100%');
    }
    if (discountType === 'fixed' && discountValue > price) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Fixed discount cannot exceed base price');
    }

    // Single Recommendation per Service rule
    if (packageData.isRecommended) {
      await servicePackageRepository.model.updateMany(
        { service: serviceId },
        { isRecommended: false }
      );
    }

    const createdPackage = await servicePackageRepository.create({
      service: serviceId,
      title,
      slug,
      description: packageData.description || '',
      price,
      discountType,
      discountValue,
      duration: packageData.duration || '45 mins',
      features: Array.isArray(packageData.features) ? packageData.features : [],
      isPopular: Boolean(packageData.isPopular),
      isRecommended: Boolean(packageData.isRecommended),
      status: packageData.status || 'active',
      sortOrder: Number(packageData.sortOrder) || 0,
      createdBy: createdById,
      updatedBy: createdById,
    });

    return createdPackage;
  }

  // 2. GET PACKAGES FOR SERVICE
  async getPackagesForService(serviceId, isAdmin = false) {
    const parentService = await serviceRepository.findById(serviceId);
    if (!parentService || parentService.status === 'deleted') {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Service not found');
    }

    if (isAdmin) {
      return await servicePackageRepository.findAllByService(serviceId);
    }
    return await servicePackageRepository.findActiveByService(serviceId);
  }

  // 3. GET SINGLE PACKAGE BY ID
  async getPackageById(packageId) {
    const pkg = await servicePackageRepository.findById(packageId);
    if (!pkg || pkg.status === 'deleted') {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Package not found');
    }
    return pkg;
  }

  // 4. UPDATE PACKAGE
  async updatePackage(packageId, updateData, updatedById = null) {
    const pkg = await servicePackageRepository.findById(packageId);
    if (!pkg || pkg.status === 'deleted') {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Package not found');
    }

    if (updateData.title && updateData.title !== pkg.title) {
      updateData.slug = await this.generateUniqueSlug(updateData.title, pkg.service, packageId);
    }

    const price = updateData.price !== undefined ? Number(updateData.price) : pkg.price;
    const discountType = updateData.discountType || pkg.discountType;
    const discountValue = updateData.discountValue !== undefined ? Number(updateData.discountValue) : pkg.discountValue;

    if (discountType === 'percentage' && discountValue > 100) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Percentage discount cannot exceed 100%');
    }
    if (discountType === 'fixed' && discountValue > price) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Fixed discount cannot exceed base price');
    }

    if (updateData.isRecommended) {
      await servicePackageRepository.model.updateMany(
        { service: pkg.service, _id: { $ne: packageId } },
        { isRecommended: false }
      );
    }

    // findByIdAndUpdate skips the model's pre-validate hook, so recompute finalPrice here
    let finalPrice = price;
    if (discountType === 'fixed') finalPrice = Math.max(0, price - discountValue);
    else if (discountType === 'percentage') finalPrice = Math.max(0, Math.round(price * (1 - Math.min(100, Math.max(0, discountValue)) / 100)));

    const updated = await servicePackageRepository.updateById(packageId, {
      ...updateData,
      finalPrice,
      updatedBy: updatedById,
    });

    return updated;
  }

  // 5. SOFT DELETE PACKAGE
  async deletePackage(packageId) {
    const pkg = await servicePackageRepository.findById(packageId);
    if (!pkg || pkg.status === 'deleted') {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Package not found');
    }

    pkg.status = 'deleted';
    await pkg.save();

    return { message: `Package '${pkg.title}' soft deleted successfully` };
  }

  // 6. UPDATE STATUS (ACTIVE / INACTIVE)
  async updateStatus(packageId, status) {
    const pkg = await servicePackageRepository.findById(packageId);
    if (!pkg || pkg.status === 'deleted') {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Package not found');
    }

    pkg.status = status;
    await pkg.save();

    return { message: `Package status updated to '${status.toUpperCase()}'`, package: pkg };
  }

  // 7. TOGGLE POPULAR
  async togglePopular(packageId) {
    const pkg = await servicePackageRepository.findById(packageId);
    if (!pkg || pkg.status === 'deleted') {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Package not found');
    }

    pkg.isPopular = !pkg.isPopular;
    await pkg.save();

    return { message: `Package popular flag set to ${pkg.isPopular}`, package: pkg };
  }

  // 8. TOGGLE RECOMMENDED
  async toggleRecommended(packageId) {
    const pkg = await servicePackageRepository.findById(packageId);
    if (!pkg || pkg.status === 'deleted') {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Package not found');
    }

    const nextState = !pkg.isRecommended;
    if (nextState) {
      await servicePackageRepository.model.updateMany(
        { service: pkg.service },
        { isRecommended: false }
      );
    }

    pkg.isRecommended = nextState;
    await pkg.save();

    return { message: `Package recommended flag set to ${pkg.isRecommended}`, package: pkg };
  }
}

export const servicePackageService = new ServicePackageService();
