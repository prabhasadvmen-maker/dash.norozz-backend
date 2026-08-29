import { financialEngineService } from '../services/financialEngine.service.js';
import { CommissionRule } from '../models/commissionRule.model.js';
import { LedgerEntry } from '../models/ledgerEntry.model.js';
import { User } from '../models/user.model.js';
import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

export class FinancialController {
  // 1. Get Commission Rules (Admin / Public)
  async getCommissionRules(req, res, next) {
    try {
      const rules = await CommissionRule.find().populate('category', 'name slug').sort({ createdAt: -1 });
      res.status(HTTP_STATUS.OK).json({ success: true, data: rules });
    } catch (error) {
      next(error);
    }
  }

  // 2. Create Commission Rule (Admin only)
  async createCommissionRule(req, res, next) {
    try {
      const rule = await CommissionRule.create(req.body);
      res.status(HTTP_STATUS.CREATED).json({ success: true, message: 'Commission rule created successfully', data: rule });
    } catch (error) {
      next(error);
    }
  }

  // 3. Update Commission Rule (Admin only)
  async updateCommissionRule(req, res, next) {
    try {
      const { id } = req.params;
      const updated = await CommissionRule.findByIdAndUpdate(id, req.body, { new: true });
      if (!updated) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Commission rule not found');
      res.status(HTTP_STATUS.OK).json({ success: true, message: 'Commission rule updated successfully', data: updated });
    } catch (error) {
      next(error);
    }
  }

  // 4. Get Customer Wallet Details
  async getCustomerWallet(req, res, next) {
    try {
      const user = await User.findById(req.user._id);
      const ledgerEntries = await LedgerEntry.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: {
          availableBalance: user.availableBalance || user.walletBalance || 0,
          heldBalance: user.heldBalance || 0,
          pendingBalance: user.pendingBalance || 0,
          lifetimeSpent: user.lifetimeSpent || 0,
          transactions: ledgerEntries,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // 5. Get Partner Wallet Details
  async getPartnerWallet(req, res, next) {
    try {
      const user = await User.findById(req.user._id);
      const ledgerEntries = await LedgerEntry.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: {
          availableBalance: user.availableBalance || user.walletBalance || 0,
          withdrawableBalance: user.withdrawableBalance || user.walletBalance || 0,
          pendingBalance: user.pendingBalance || 0,
          withdrawalPending: user.withdrawalPending || 0,
          lifetimeEarnings: user.lifetimeEarnings || 0,
          totalCommissionPaid: user.totalCommissionPaid || 0,
          bankDetails: user.bankDetails || {},
          transactions: ledgerEntries,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // 6. Request Partner Bank Withdrawal
  async requestPartnerWithdrawal(req, res, next) {
    try {
      const { amount } = req.body;
      const result = await financialEngineService.processPartnerWithdrawal(req.user._id, amount);
      res.status(HTTP_STATUS.OK).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  // 7. Get Master Admin Financial Summary
  async getAdminFinancialSummary(req, res, next) {
    try {
      const data = await financialEngineService.getFinancialOverview();
      res.status(HTTP_STATUS.OK).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // 8. Get Immutable Double-Entry Ledger Transactions List (Admin only)
  async getLedgerTransactions(req, res, next) {
    try {
      const { page = 1, limit = 50, type, accountType } = req.query;
      const filter = {};
      if (type) filter.type = type;
      if (accountType) filter.accountType = accountType;

      const transactions = await LedgerEntry.find(filter)
        .populate('userId', 'name email phone role')
        .populate('orderId', 'bookingId amount status')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit));

      const total = await LedgerEntry.countDocuments(filter);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: {
          transactions,
          pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / limit) },
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const financialController = new FinancialController();
