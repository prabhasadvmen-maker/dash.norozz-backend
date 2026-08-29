import { BaseController } from './base.controller.js';
import { servicePackageService } from '../services/servicePackage.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export class ServicePackageController extends BaseController {

  createPackage = asyncHandler(async (req, res) => {
    const { serviceId } = req.params;
    const created = await servicePackageService.createPackage(serviceId, req.body, req.user?._id);
    return this.sendCreated(res, created, 'Service Package created successfully');
  });

  getPackagesByService = asyncHandler(async (req, res) => {
    const { serviceId } = req.params;
    const isAdmin = req.user?.role === 'SUPER_ADMIN' || req.user?.role === 'ADMIN' || req.user?.role === 'CITY_ADMIN';
    const packages = await servicePackageService.getPackagesForService(serviceId, isAdmin);
    return this.sendSuccess(res, packages, 'Service Packages retrieved successfully');
  });

  getPackageById = asyncHandler(async (req, res) => {
    const pkg = await servicePackageService.getPackageById(req.params.id);
    return this.sendSuccess(res, pkg, 'Package details retrieved successfully');
  });

  updatePackage = asyncHandler(async (req, res) => {
    const updated = await servicePackageService.updatePackage(req.params.id, req.body, req.user?._id);
    return this.sendSuccess(res, updated, 'Service Package updated successfully');
  });

  deletePackage = asyncHandler(async (req, res) => {
    const result = await servicePackageService.deletePackage(req.params.id);
    return this.sendSuccess(res, result, result.message);
  });

  updateStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    const result = await servicePackageService.updateStatus(req.params.id, status);
    return this.sendSuccess(res, result, result.message);
  });

  togglePopular = asyncHandler(async (req, res) => {
    const result = await servicePackageService.togglePopular(req.params.id);
    return this.sendSuccess(res, result, result.message);
  });

  toggleRecommended = asyncHandler(async (req, res) => {
    const result = await servicePackageService.toggleRecommended(req.params.id);
    return this.sendSuccess(res, result, result.message);
  });
}

export const servicePackageController = new ServicePackageController();
