import { BaseController } from './base.controller.js';
import { serviceService } from '../services/service.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export class ServiceController extends BaseController {

  createService = asyncHandler(async (req, res) => {
    const service = await serviceService.createService(req.body, req.user._id, req.files);
    return this.sendCreated(res, service, 'Service created successfully');
  });

  updateService = asyncHandler(async (req, res) => {
    const updated = await serviceService.updateService(req.params.id, req.body, req.user._id, req.files);
    return this.sendSuccess(res, updated, 'Service updated successfully');
  });

  deleteService = asyncHandler(async (req, res) => {
    const result = await serviceService.deleteService(req.params.id);
    return this.sendSuccess(res, result, result.message);
  });

  restoreService = asyncHandler(async (req, res) => {
    const result = await serviceService.restoreService(req.params.id);
    return this.sendSuccess(res, result, result.message);
  });

  updateStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    const result = await serviceService.updateStatus(req.params.id, status);
    return this.sendSuccess(res, result, result.message);
  });

  getAdminServices = asyncHandler(async (req, res) => {
    const result = await serviceService.getServicesForAdmin(req.query);
    return this.sendSuccess(res, result, 'Admin service directory retrieved successfully');
  });

  getPublicServices = asyncHandler(async (req, res) => {
    const services = await serviceService.getActiveServicesForPublic(req.query);
    return this.sendSuccess(res, services, 'Active services retrieved successfully');
  });

  getServiceBySlug = asyncHandler(async (req, res) => {
    const service = await serviceService.getServiceBySlug(req.params.slug);
    return this.sendSuccess(res, service, 'Service details retrieved successfully');
  });
}

export const serviceController = new ServiceController();
