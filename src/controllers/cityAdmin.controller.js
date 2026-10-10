import { BaseController } from './base.controller.js';
import { cityAdminService } from '../services/cityAdmin.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { City } from '../models/city.model.js';
import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

export class CityAdminController extends BaseController {

  async _resolveCity(user) {
    let raw = user.assignedCity;
    // Already a populated object with name
    if (raw && typeof raw === 'object' && raw.name) return raw.name;
    
    // If raw is an unpopulated ObjectId object, convert it to a string
    if (raw && typeof raw === 'object' && raw.toString) {
      raw = raw.toString();
    }

    // ObjectId — look up in City collection
    if (raw) {
      if (typeof raw === 'string' && raw.match(/^[0-9a-fA-F]{24}$/)) {
        try {
          const city = await City.findById(raw).lean();
          if (city?.name) return city.name;
        } catch {
          // ignore
        }
      } else if (typeof raw === 'string') {
        return raw; // raw is already a city name string
      }
    }
    // Fallback to user.city string
    if (user.city && typeof user.city === 'string') return user.city;
    return null;
  }

  getDashboard = asyncHandler(async (req, res) => {
    const assignedCity = await this._resolveCity(req.user);
    if (!assignedCity) {
      return this.sendSuccess(res, {
        assignedCity: null,
        totalBookings: 0, pendingBookings: 0, completedBookings: 0,
        cityRevenueGmv: 0, cityCommission: 0,
        metrics: { todaysOrders: 0, pendingOrders: 0, completedOrders: 0, cityRevenue: 0, activePartners: 0, pendingKycPartners: 0, cityCustomers: 0 }
      }, 'No city assigned. Showing empty stats.');
    }
    const stats = await cityAdminService.getDashboardStats(assignedCity);
    return this.sendSuccess(res, stats, `Dashboard stats for city '${assignedCity}' retrieved successfully`);
  });

  getPartners = asyncHandler(async (req, res) => {
    const assignedCity = await this._resolveCity(req.user);
    if (!assignedCity) return this.sendSuccess(res, [], 'No city assigned. Showing empty list.');
    const partners = await cityAdminService.getCityPartners(assignedCity);
    return this.sendSuccess(res, partners, `Partners in '${assignedCity}' retrieved successfully`);
  });

  getCustomers = asyncHandler(async (req, res) => {
    const assignedCity = await this._resolveCity(req.user);
    if (!assignedCity) return this.sendSuccess(res, [], 'No city assigned. Showing empty list.');
    const customers = await cityAdminService.getCityCustomers(assignedCity);
    return this.sendSuccess(res, customers, `Customers in '${assignedCity}' retrieved successfully`);
  });

  approvePartner = asyncHandler(async (req, res) => {
    const assignedCity = await this._resolveCity(req.user);
    const result = await cityAdminService.approvePartner(req.params.id, assignedCity);
    return this.sendSuccess(res, result, result.message);
  });

  rejectPartner = asyncHandler(async (req, res) => {
    const assignedCity = await this._resolveCity(req.user);
    const { reason } = req.body;
    const result = await cityAdminService.rejectPartner(req.params.id, reason, assignedCity);
    return this.sendSuccess(res, result, result.message);
  });

  updateDocumentStatus = asyncHandler(async (req, res) => {
    const assignedCity = await this._resolveCity(req.user);
    const { docKey, status, rejectionReason } = req.body;
    const result = await cityAdminService.updateDocumentStatus(req.params.id, docKey, status, rejectionReason, assignedCity);
    return this.sendSuccess(res, result, result.message);
  });

  verifyKyc = asyncHandler(async (req, res) => {
    const assignedCity = await this._resolveCity(req.user);
    const result = await cityAdminService.verifyKyc(req.params.id, assignedCity);
    return this.sendSuccess(res, result, result.message);
  });

  suspendPartner = asyncHandler(async (req, res) => {
    const assignedCity = await this._resolveCity(req.user);
    const result = await cityAdminService.suspendPartner(req.params.id, assignedCity);
    return this.sendSuccess(res, result, result.message);
  });

  activatePartner = asyncHandler(async (req, res) => {
    const assignedCity = await this._resolveCity(req.user);
    const result = await cityAdminService.activatePartner(req.params.id, assignedCity);
    return this.sendSuccess(res, result, result.message);
  });

  getBookings = asyncHandler(async (req, res) => {
    const assignedCity = await this._resolveCity(req.user);
    if (!assignedCity) return this.sendSuccess(res, [], 'No city assigned. Showing empty bookings list.');
    const bookings = await cityAdminService.getCityBookings(assignedCity);
    return this.sendSuccess(res, bookings, `Bookings in '${assignedCity}' retrieved successfully`);
  });

  assignBooking = asyncHandler(async (req, res) => {
    const assignedCity = await this._resolveCity(req.user);
    const { partnerId } = req.body;
    const result = await cityAdminService.assignBooking(req.params.id, partnerId, assignedCity);
    return this.sendSuccess(res, result, result.message);
  });

  cancelBooking = asyncHandler(async (req, res) => {
    const assignedCity = await this._resolveCity(req.user);
    const { reason } = req.body;
    const result = await cityAdminService.cancelBooking(req.params.id, reason, assignedCity);
    return this.sendSuccess(res, result, result.message);
  });

  getRevenue = asyncHandler(async (req, res) => {
    const assignedCity = await this._resolveCity(req.user);
    if (!assignedCity) return this.sendSuccess(res, {
      assignedCity: null, grossCityGMV: 0, platformCut: 0, partnerPayouts: 0, period: 'N/A'
    }, 'No city assigned. Showing 0 revenue.');
    const revenue = await cityAdminService.getCityRevenue(assignedCity);
    return this.sendSuccess(res, revenue, `Revenue for city '${assignedCity}' retrieved successfully`);
  });

  getTickets = asyncHandler(async (req, res) => {
    const assignedCity = await this._resolveCity(req.user);
    if (!assignedCity) return this.sendSuccess(res, [], 'No city assigned. Showing empty tickets list.');
    const tickets = await cityAdminService.getCityTickets(assignedCity, req.query);
    return this.sendSuccess(res, tickets, `Support tickets for '${assignedCity}' retrieved successfully`);
  });

  updateTicketStatus = asyncHandler(async (req, res) => {
    const ticket = await cityAdminService.updateCityTicketStatus(req.params.id, req.body);
    return this.sendSuccess(res, ticket, 'Ticket status updated successfully');
  });
}

export const cityAdminController = new CityAdminController();
