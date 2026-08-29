import { BaseController } from './base.controller.js';
import { cityAdminService } from '../services/cityAdmin.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export class CityAdminController extends BaseController {

  getDashboard = asyncHandler(async (req, res) => {
    const assignedCity = req.user.assignedCity || 'Delhi NCR';
    const stats = await cityAdminService.getDashboardStats(assignedCity);
    return this.sendSuccess(res, stats, `Dashboard stats for city '${assignedCity}' retrieved successfully`);
  });

  getPartners = asyncHandler(async (req, res) => {
    const assignedCity = req.user.assignedCity || 'Delhi NCR';
    const partners = await cityAdminService.getCityPartners(assignedCity);
    return this.sendSuccess(res, partners, `Partners in '${assignedCity}' retrieved successfully`);
  });

  approvePartner = asyncHandler(async (req, res) => {
    const assignedCity = req.user.assignedCity || 'Delhi NCR';
    const result = await cityAdminService.approvePartner(req.params.id, assignedCity);
    return this.sendSuccess(res, result, result.message);
  });

  rejectPartner = asyncHandler(async (req, res) => {
    const assignedCity = req.user.assignedCity || 'Delhi NCR';
    const { reason } = req.body;
    const result = await cityAdminService.rejectPartner(req.params.id, reason, assignedCity);
    return this.sendSuccess(res, result, result.message);
  });

  updateDocumentStatus = asyncHandler(async (req, res) => {
    const assignedCity = req.user.assignedCity || 'Delhi NCR';
    const { docKey, status, rejectionReason } = req.body;
    const result = await cityAdminService.updateDocumentStatus(req.params.id, docKey, status, rejectionReason, assignedCity);
    return this.sendSuccess(res, result, result.message);
  });

  verifyKyc = asyncHandler(async (req, res) => {
    const assignedCity = req.user.assignedCity || 'Delhi NCR';
    const result = await cityAdminService.verifyKyc(req.params.id, assignedCity);
    return this.sendSuccess(res, result, result.message);
  });

  suspendPartner = asyncHandler(async (req, res) => {
    const assignedCity = req.user.assignedCity || 'Delhi NCR';
    const result = await cityAdminService.suspendPartner(req.params.id, assignedCity);
    return this.sendSuccess(res, result, result.message);
  });

  activatePartner = asyncHandler(async (req, res) => {
    const assignedCity = req.user.assignedCity || 'Delhi NCR';
    const result = await cityAdminService.activatePartner(req.params.id, assignedCity);
    return this.sendSuccess(res, result, result.message);
  });

  getBookings = asyncHandler(async (req, res) => {
    const assignedCity = req.user.assignedCity || 'Delhi NCR';
    const bookings = await cityAdminService.getCityBookings(assignedCity);
    return this.sendSuccess(res, bookings, `Bookings in '${assignedCity}' retrieved successfully`);
  });

  assignBooking = asyncHandler(async (req, res) => {
    const assignedCity = req.user.assignedCity || 'Delhi NCR';
    const { partnerId } = req.body;
    const result = await cityAdminService.assignBooking(req.params.id, partnerId, assignedCity);
    return this.sendSuccess(res, result, result.message);
  });

  cancelBooking = asyncHandler(async (req, res) => {
    const assignedCity = req.user.assignedCity || 'Delhi NCR';
    const { reason } = req.body;
    const result = await cityAdminService.cancelBooking(req.params.id, reason, assignedCity);
    return this.sendSuccess(res, result, result.message);
  });

  getRevenue = asyncHandler(async (req, res) => {
    const assignedCity = req.user.assignedCity || 'Delhi NCR';
    const revenue = await cityAdminService.getCityRevenue(assignedCity);
    return this.sendSuccess(res, revenue, `Revenue for city '${assignedCity}' retrieved successfully`);
  });
}

export const cityAdminController = new CityAdminController();
