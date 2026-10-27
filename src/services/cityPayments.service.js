import '../models/user.model.js';
import { Booking } from '../models/booking.model.js';
import { Payment } from '../models/payment.model.js';
import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export const ESCROW_STATUSES = ['AMOUNT_HELD', 'SERVICE_IN_PROGRESS'];
export const AWAITING_SETTLEMENT_STATUSES = ['SERVICE_COMPLETED', 'SETTLEMENT_PENDING'];
export const EARNED_STATUSES = [...AWAITING_SETTLEMENT_STATUSES, 'SETTLED'];
const REFUND_STATUSES = ['REFUND_PENDING', 'REFUNDED'];

export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Amount the customer actually paid for a booking
export const PAID_AMOUNT = {
  $cond: [{ $gt: ['$financialSnapshot.customerPayable', 0] }, '$financialSnapshot.customerPayable', '$amount'],
};
// The moment money entered the platform
export const TXN_DATE = { $ifNull: ['$paymentConfirmedAt', '$createdAt'] };

export class CityPaymentsService {
  /** Resolves ?range=today|7d|30d|90d|month|custom&from&to into [from, to) plus the equally long previous window. */
  resolveRange(query = {}) {
    const now = new Date();
    const today = startOfDay(now);
    const tomorrow = new Date(today.getTime() + DAY_MS);
    let from;
    let to = tomorrow;
    let range = query.range || '30d';

    switch (range) {
      case 'today':
        from = today;
        break;
      case '7d':
        from = new Date(tomorrow.getTime() - 7 * DAY_MS);
        break;
      case '90d':
        from = new Date(tomorrow.getTime() - 90 * DAY_MS);
        break;
      case 'month':
        from = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'custom': {
        const f = new Date(query.from);
        const t = new Date(query.to);
        if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime())) {
          throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Custom range needs valid from and to dates');
        }
        from = startOfDay(f);
        to = new Date(startOfDay(t).getTime() + DAY_MS);
        if (to <= from) throw new ApiError(HTTP_STATUS.BAD_REQUEST, "'to' date must be on or after 'from' date");
        if ((to - from) / DAY_MS > MAX_RANGE_DAYS) {
          throw new ApiError(HTTP_STATUS.BAD_REQUEST, `Date range cannot exceed ${MAX_RANGE_DAYS} days`);
        }
        break;
      }
      default:
        range = '30d';
        from = new Date(tomorrow.getTime() - 30 * DAY_MS);
    }
    const span = to - from;
    return { range, from, to, prevFrom: new Date(from.getTime() - span), prevTo: from };
  }

  cityMatch(assignedCity) {
    const re = new RegExp(`^\\s*${escapeRegex(String(assignedCity).trim())}\\s*$`, 'i');
    return { $or: [{ city: re }, { 'address.city': re }] };
  }

  /** Bookings whose customer payment landed in the window (paid, or paid then refunded). */
  baseMatch(assignedCity, from, to) {
    return {
      $and: [
        this.cityMatch(assignedCity),
        { paymentStatus: { $in: ['paid', 'refunded'] } },
        { $expr: { $and: [{ $gte: [TXN_DATE, from] }, { $lt: [TXN_DATE, to] }] } },
      ],
    };
  }

  totalsStage() {
    const sumIf = (cond, value) => ({ $sum: { $cond: [cond, value, 0] } });
    const inList = (list) => ({ $in: ['$financialStatus', list] });
    return {
      $group: {
        _id: null,
        transactions: { $sum: 1 },
        gmv: { $sum: PAID_AMOUNT },
        escrowHeld: sumIf(inList(ESCROW_STATUSES), PAID_AMOUNT),
        escrowCount: sumIf(inList(ESCROW_STATUSES), 1),
        platformRevenue: sumIf(inList(EARNED_STATUSES), '$financialSnapshot.norozzGrossRevenue'),
        partnerEarnings: sumIf(inList(EARNED_STATUSES), '$financialSnapshot.partnerNetEarning'),
        pendingPayout: sumIf(inList(AWAITING_SETTLEMENT_STATUSES), '$financialSnapshot.partnerNetEarning'),
        pendingPayoutCount: sumIf(inList(AWAITING_SETTLEMENT_STATUSES), 1),
        settledPayout: sumIf({ $eq: ['$financialStatus', 'SETTLED'] }, '$financialSnapshot.partnerNetEarning'),
        refunds: { $sum: { $ifNull: ['$refundAmount', 0] } },
        refundCount: sumIf({ $gt: [{ $ifNull: ['$refundAmount', 0] }, 0] }, 1),
        discounts: { $sum: { $ifNull: ['$financialSnapshot.discountAmount', 0] } },
      },
    };
  }

  async getOverview(assignedCity, query = {}) {
    const { range, from, to, prevFrom, prevTo } = this.resolveRange(query);
    const match = { $match: this.baseMatch(assignedCity, from, to) };

    const [current, previous, daily, methods, topPartners] = await Promise.all([
      Booking.aggregate([match, this.totalsStage()]),
      Booking.aggregate([{ $match: this.baseMatch(assignedCity, prevFrom, prevTo) }, this.totalsStage()]),
      Booking.aggregate([
        match,
        { $addFields: { day: { $dateToString: { format: '%Y-%m-%d', date: TXN_DATE, timezone: 'Asia/Kolkata' } } } },
        {
          $group: {
            _id: '$day',
            gmv: { $sum: PAID_AMOUNT },
            platformRevenue: {
              $sum: { $cond: [{ $in: ['$financialStatus', EARNED_STATUSES] }, '$financialSnapshot.norozzGrossRevenue', 0] },
            },
            bookings: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Booking.aggregate([
        match,
        { $group: { _id: { $ifNull: ['$paymentMethod', 'Unknown'] }, amount: { $sum: PAID_AMOUNT }, count: { $sum: 1 } } },
        { $sort: { amount: -1 } },
      ]),
      Booking.aggregate([
        match,
        { $match: { partner: { $ne: null }, financialStatus: { $in: EARNED_STATUSES } } },
        { $group: { _id: '$partner', earnings: { $sum: '$financialSnapshot.partnerNetEarning' }, jobs: { $sum: 1 } } },
        { $sort: { earnings: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'p',
            pipeline: [{ $project: { name: 1, agencyName: 1 } }],
          },
        },
        {
          $project: {
            earnings: 1,
            jobs: 1,
            name: { $ifNull: [{ $arrayElemAt: ['$p.name', 0] }, { $arrayElemAt: ['$p.agencyName', 0] }] },
          },
        },
      ]),
    ]);

    const c = current[0] || {};
    const p = previous[0] || {};
    const pct = (now, before) => (before > 0 ? round(((now - before) / before) * 100) : now > 0 ? 100 : 0);

    return {
      assignedCity,
      range,
      from,
      to: new Date(to.getTime() - 1),
      summary: {
        gmv: round(c.gmv),
        gmvChangePct: pct(c.gmv || 0, p.gmv || 0),
        transactions: c.transactions || 0,
        transactionsChangePct: pct(c.transactions || 0, p.transactions || 0),
        platformRevenue: round(c.platformRevenue),
        platformRevenueChangePct: pct(c.platformRevenue || 0, p.platformRevenue || 0),
        partnerEarnings: round(c.partnerEarnings),
        escrowHeld: round(c.escrowHeld),
        escrowCount: c.escrowCount || 0,
        pendingPayout: round(c.pendingPayout),
        pendingPayoutCount: c.pendingPayoutCount || 0,
        settledPayout: round(c.settledPayout),
        refunds: round(c.refunds),
        refundCount: c.refundCount || 0,
        discounts: round(c.discounts),
        avgOrderValue: c.transactions ? round(c.gmv / c.transactions) : 0,
      },
      daily: this.fillDays(daily, from, to),
      paymentMethods: methods.map((m) => ({ method: m._id, amount: round(m.amount), count: m.count })),
      topPartners: topPartners.map((t) => ({
        partnerId: t._id,
        name: t.name || 'Partner',
        earnings: round(t.earnings),
        jobs: t.jobs,
      })),
    };
  }

  // Zero-fill missing days so the chart axis is continuous
  fillDays(rows, from, to) {
    const byDay = new Map(rows.map((r) => [r._id, r]));
    const out = [];
    for (let t = from.getTime(); t < to.getTime(); t += DAY_MS) {
      const key = new Date(t + IST_OFFSET_MS).toISOString().slice(0, 10);
      const r = byDay.get(key);
      out.push({ date: key, gmv: round(r?.gmv), platformRevenue: round(r?.platformRevenue), bookings: r?.bookings || 0 });
    }
    return out;
  }

  transactionFilter(assignedCity, query, from, to) {
    const and = [this.baseMatch(assignedCity, from, to)];
    const { status, method, search } = query;

    if (status === 'escrow') and.push({ financialStatus: { $in: ESCROW_STATUSES } });
    else if (status === 'awaiting_payout') and.push({ financialStatus: { $in: AWAITING_SETTLEMENT_STATUSES } });
    else if (status === 'settled') and.push({ financialStatus: 'SETTLED' });
    else if (status === 'refunded') {
      and.push({ $or: [{ financialStatus: { $in: REFUND_STATUSES } }, { refundAmount: { $gt: 0 } }] });
    } else if (status === 'cancelled') and.push({ status: 'Cancelled' });

    if (method) and.push({ paymentMethod: String(method) });
    if (search) {
      const re = new RegExp(escapeRegex(String(search).trim().slice(0, 60)), 'i');
      and.push({ $or: [{ bookingId: re }, { packageName: re }] });
    }
    return { $and: and };
  }

  async getTransactions(assignedCity, query = {}) {
    const { from, to } = this.resolveRange(query);
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 15));
    const filter = this.transactionFilter(assignedCity, query, from, to);

    const [rows, total] = await Promise.all([
      Booking.aggregate([
        { $match: filter },
        { $addFields: { txnDate: TXN_DATE } },
        { $sort: { txnDate: -1, _id: -1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
        {
          $lookup: {
            from: 'users',
            localField: 'customer',
            foreignField: '_id',
            as: 'cust',
            pipeline: [{ $project: { name: 1 } }],
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: 'partner',
            foreignField: '_id',
            as: 'part',
            pipeline: [{ $project: { name: 1, agencyName: 1 } }],
          },
        },
        {
          $lookup: {
            from: 'payments',
            localField: '_id',
            foreignField: 'booking',
            as: 'pay',
            pipeline: [{ $match: { type: 'booking_payment', status: 'Success' } }, { $project: { transactionId: 1 } }, { $limit: 1 }],
          },
        },
        {
          $project: {
            transactionId: { $arrayElemAt: ['$pay.transactionId', 0] },
            bookingId: 1,
            packageName: 1,
            status: 1,
            financialStatus: 1,
            paymentMethod: 1,
            refundAmount: { $ifNull: ['$refundAmount', 0] },
            txnDate: 1,
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

  async exportCsv(assignedCity, query = {}) {
    const { from, to } = this.resolveRange(query);
    const filter = this.transactionFilter(assignedCity, query, from, to);
    const rows = await Booking.find(filter)
      .select('bookingId packageName status financialStatus paymentMethod refundAmount paymentConfirmedAt createdAt amount financialSnapshot')
      .populate('customer', 'name')
      .populate('partner', 'name agencyName')
      .sort({ createdAt: -1 })
      .limit(10000)
      .lean();

    const payments = await Payment.find({ booking: { $in: rows.map((b) => b._id) }, type: 'booking_payment', status: 'Success' })
      .select('booking transactionId')
      .lean();
    const txnByBooking = new Map(payments.map((p) => [String(p.booking), p.transactionId]));

    // Spreadsheet formula injection guard: neutralise cells starting with = + - @
    const cell = (v) => {
      const s = String(v ?? '');
      const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const header = ['Date', 'Booking ID', 'Service', 'Customer', 'Partner', 'Method', 'Txn ID', 'Amount', 'Platform Revenue', 'Partner Earning', 'Refund', 'Booking Status', 'Settlement Status'];
    const lines = rows.map((b) =>
      [
        new Date(b.paymentConfirmedAt || b.createdAt).toISOString(),
        b.bookingId,
        b.packageName,
        b.customer?.name,
        b.partner?.name || b.partner?.agencyName,
        b.paymentMethod,
        txnByBooking.get(String(b._id)),
        b.financialSnapshot?.customerPayable || b.amount,
        b.financialSnapshot?.norozzGrossRevenue || 0,
        b.financialSnapshot?.partnerNetEarning || 0,
        b.refundAmount || 0,
        b.status,
        b.financialStatus,
      ]
        .map(cell)
        .join(',')
    );
    return [header.map(cell).join(','), ...lines].join('\r\n');
  }
}

export const cityPaymentsService = new CityPaymentsService();
