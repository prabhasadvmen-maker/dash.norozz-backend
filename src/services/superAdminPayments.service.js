import '../models/user.model.js';
import { Booking } from '../models/booking.model.js';
import { cityPaymentsService, escapeRegex, PAID_AMOUNT, TXN_DATE, ESCROW_STATUSES, AWAITING_SETTLEMENT_STATUSES, REFUND_STATUSES } from './cityPayments.service.js';
import { superAdminReportsService } from './superAdminReports.service.js';
import { financialEngineService } from './financialEngine.service.js';

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const TXN_STATUS_FILTERS = ['escrow', 'awaiting_payout', 'settled', 'refunded', 'cancelled'];

export class SuperAdminPaymentsService {
  /** All-time, ledger-backed platform position (what Norozz earned, and what it owes). */
  async getLedgerSummary() {
    const f = await financialEngineService.getFinancialOverview();
    return {
      platform: {
        customerFees: round(f.overview.customerPlatformFees),
        partnerCommissions: round(f.overview.partnerCommissions),
        grossRevenue: round(f.overview.grossPlatformRevenue),
        refunds: round(f.overview.refunds),
        gatewayFees: round(f.overview.gatewayFees),
        netRevenue: round(f.overview.netPlatformRevenue),
        grossBookingValue: round(f.overview.grossBookingValue),
      },
      liabilities: {
        partnerWallets: round(f.partnerMetrics.partnerWalletLiability),
        pendingWithdrawals: round(f.partnerMetrics.pendingPartnerPayout),
        customerWallets: round(f.customerMetrics.customerWalletLiability),
        customerHeld: round(f.customerMetrics.customerHeldEscrow),
      },
      ledgerEntries: f.ledgerInfo.totalLedgerEntries,
      settledBookings: f.ledgerInfo.settledBookingsCount,
    };
  }

  transactionFilter(query, from, to) {
    const and = [superAdminReportsService.baseMatch(from, to, superAdminReportsService.cleanCity(query))];
    const { status, method, search } = query;

    if (status === 'escrow') and.push({ financialStatus: { $in: ESCROW_STATUSES } });
    else if (status === 'awaiting_payout') and.push({ financialStatus: { $in: AWAITING_SETTLEMENT_STATUSES } });
    else if (status === 'settled') and.push({ financialStatus: 'SETTLED' });
    else if (status === 'refunded') and.push({ $or: [{ financialStatus: { $in: REFUND_STATUSES } }, { refundAmount: { $gt: 0 } }] });
    else if (status === 'cancelled') and.push({ status: 'Cancelled' });

    if (method) and.push({ paymentMethod: String(method) });
    if (search) {
      const re = new RegExp(escapeRegex(String(search).trim().slice(0, 60)), 'i');
      and.push({ $or: [{ bookingId: re }, { packageName: re }] });
    }
    return { $and: and };
  }

  async getTransactions(query = {}) {
    const { from, to } = cityPaymentsService.resolveRange(query);
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 15));
    const filter = this.transactionFilter(query, from, to);
    const user = (as, local) => ({ $lookup: { from: 'users', localField: local, foreignField: '_id', as, pipeline: [{ $project: { name: 1, agencyName: 1 } }] } });

    const [rows, total] = await Promise.all([
      Booking.aggregate([
        { $match: filter },
        { $addFields: { txnDate: TXN_DATE } },
        { $sort: { txnDate: -1, _id: -1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
        user('cust', 'customer'),
        user('part', 'partner'),
        {
          $project: {
            bookingId: 1,
            packageName: 1,
            city: 1,
            status: 1,
            financialStatus: 1,
            paymentMethod: 1,
            txnDate: 1,
            refundAmount: { $ifNull: ['$refundAmount', 0] },
            amount: PAID_AMOUNT,
            platformRevenue: { $ifNull: ['$financialSnapshot.norozzGrossRevenue', 0] },
            partnerEarning: { $ifNull: ['$financialSnapshot.partnerNetEarning', 0] },
            customer: { $arrayElemAt: ['$cust.name', 0] },
            partner: { $ifNull: [{ $arrayElemAt: ['$part.name', 0] }, { $arrayElemAt: ['$part.agencyName', 0] }] },
          },
        },
      ]),
      Booking.countDocuments(filter),
    ]);

    return { items: rows, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }
}

export const superAdminPaymentsService = new SuperAdminPaymentsService();
