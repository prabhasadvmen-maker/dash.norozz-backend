import '../models/user.model.js';
import { Booking } from '../models/booking.model.js';
import { City } from '../models/city.model.js';
import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import {
  cityPaymentsService,
  PAID_AMOUNT,
  TXN_DATE,
  EARNED_STATUSES,
  ESCROW_STATUSES,
  AWAITING_SETTLEMENT_STATUSES,
} from './cityPayments.service.js';

const IST = 'Asia/Kolkata';
const DAY_MS = 24 * 60 * 60 * 1000;
const EXPORT_LIMIT = 20000;
export const EXPORT_TYPES = ['cities', 'partners', 'gst', 'bookings'];

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
const delta = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : a > 0 ? 100 : 0);

// Same convention as invoices (payment.service.js): customer prices are GST-inclusive
const gstRate = () => {
  const r = Number(process.env.GST_RATE);
  return Number.isFinite(r) && r >= 0 ? r : 18;
};
const gstOf = (gross, rate) => round(gross - gross / (1 + rate / 100));

const sumIf = (cond, value) => ({ $sum: { $cond: [cond, value, 0] } });
const inList = (list) => ({ $in: ['$financialStatus', list] });

export class SuperAdminReportsService {
  /** Platform-wide filter (optionally one city): payment landed in [from, to). */
  baseMatch(from, to, city) {
    const and = [
      { paymentStatus: { $in: ['paid', 'refunded'] } },
      { $expr: { $and: [{ $gte: [TXN_DATE, from] }, { $lt: [TXN_DATE, to] }] } },
    ];
    if (city) and.unshift(cityPaymentsService.cityMatch(city));
    return { $and: and };
  }

  cleanCity(query) {
    const c = String(query.city || '').trim();
    return c && c.toLowerCase() !== 'all' ? c : '';
  }

  totalsStage() {
    return {
      $group: {
        _id: null,
        transactions: { $sum: 1 },
        gmv: { $sum: PAID_AMOUNT },
        escrowHeld: sumIf(inList(ESCROW_STATUSES), PAID_AMOUNT),
        platformRevenue: sumIf(inList(EARNED_STATUSES), '$financialSnapshot.norozzGrossRevenue'),
        partnerEarnings: sumIf(inList(EARNED_STATUSES), '$financialSnapshot.partnerNetEarning'),
        pendingPayout: sumIf(inList(AWAITING_SETTLEMENT_STATUSES), '$financialSnapshot.partnerNetEarning'),
        settledPayout: sumIf({ $eq: ['$financialStatus', 'SETTLED'] }, '$financialSnapshot.partnerNetEarning'),
        refunds: { $sum: { $ifNull: ['$refundAmount', 0] } },
        discounts: { $sum: { $ifNull: ['$financialSnapshot.discountAmount', 0] } },
        completed: sumIf({ $eq: ['$status', 'Completed'] }, 1),
        cancelled: sumIf({ $in: ['$status', ['Cancelled', 'Refunded']] }, 1),
      },
    };
  }

  async getOverview(query = {}) {
    const { range, from, to, prevFrom, prevTo } = cityPaymentsService.resolveRange(query);
    const city = this.cleanCity(query);
    const rate = gstRate();
    const match = { $match: this.baseMatch(from, to, city) };

    const [current, previous, daily, byCity, byPartner, methods, cityList, customers] = await Promise.all([
      Booking.aggregate([match, this.totalsStage()]),
      Booking.aggregate([{ $match: this.baseMatch(prevFrom, prevTo, city) }, this.totalsStage()]),
      Booking.aggregate([
        match,
        { $addFields: { day: { $dateToString: { format: '%Y-%m-%d', date: TXN_DATE, timezone: IST } } } },
        {
          $group: {
            _id: '$day',
            gmv: { $sum: PAID_AMOUNT },
            platformRevenue: sumIf(inList(EARNED_STATUSES), '$financialSnapshot.norozzGrossRevenue'),
            bookings: { $sum: 1 },
          },
        },
      ]),
      Booking.aggregate([
        match,
        {
          $group: {
            _id: { $toLower: { $trim: { input: { $ifNull: ['$city', 'Unknown'] } } } },
            name: { $first: { $trim: { input: { $ifNull: ['$city', 'Unknown'] } } } },
            bookings: { $sum: 1 },
            completed: sumIf({ $eq: ['$status', 'Completed'] }, 1),
            gmv: { $sum: PAID_AMOUNT },
            platformRevenue: sumIf(inList(EARNED_STATUSES), '$financialSnapshot.norozzGrossRevenue'),
            partnerEarnings: sumIf(inList(EARNED_STATUSES), '$financialSnapshot.partnerNetEarning'),
            refunds: { $sum: { $ifNull: ['$refundAmount', 0] } },
          },
        },
        { $sort: { gmv: -1 } },
        { $limit: 100 },
      ]),
      Booking.aggregate([
        match,
        { $match: { partner: { $ne: null }, financialStatus: { $in: EARNED_STATUSES } } },
        {
          $group: {
            _id: '$partner',
            jobs: { $sum: 1 },
            earnings: { $sum: '$financialSnapshot.partnerNetEarning' },
            pending: sumIf(inList(AWAITING_SETTLEMENT_STATUSES), '$financialSnapshot.partnerNetEarning'),
            settled: sumIf({ $eq: ['$financialStatus', 'SETTLED'] }, '$financialSnapshot.partnerNetEarning'),
          },
        },
        { $sort: { earnings: -1 } },
        { $limit: 100 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u', pipeline: [{ $project: { name: 1, agencyName: 1, phone: 1 } }] } },
        { $project: { jobs: 1, earnings: 1, pending: 1, settled: 1, name: { $ifNull: [{ $arrayElemAt: ['$u.name', 0] }, { $arrayElemAt: ['$u.agencyName', 0] }] }, phone: { $arrayElemAt: ['$u.phone', 0] } } },
      ]),
      Booking.aggregate([
        match,
        { $group: { _id: { $ifNull: ['$paymentMethod', 'Unknown'] }, amount: { $sum: PAID_AMOUNT }, count: { $sum: 1 } } },
        { $sort: { amount: -1 } },
      ]),
      City.find({}).select('name').sort({ name: 1 }).lean(),
      Booking.aggregate([match, { $group: { _id: '$customer' } }, { $count: 'n' }]),
    ]);

    const c = current[0] || {};
    const p = previous[0] || {};
    const totals = (x) => ({
      transactions: x.transactions || 0,
      gmv: round(x.gmv),
      platformRevenue: round(x.platformRevenue),
      partnerEarnings: round(x.partnerEarnings),
      pendingPayout: round(x.pendingPayout),
      settledPayout: round(x.settledPayout),
      escrowHeld: round(x.escrowHeld),
      refunds: round(x.refunds),
      discounts: round(x.discounts),
      completed: x.completed || 0,
      cancelled: x.cancelled || 0,
    });
    const cur = totals(c);
    const prev = totals(p);
    const gstCollected = gstOf(cur.gmv - cur.refunds, rate);

    // Continuous IST day series so gaps render as zero days
    const dailyMap = new Map(daily.map((d) => [d._id, d]));
    const series = [];
    for (let ts = from.getTime(); ts < to.getTime(); ts += DAY_MS) {
      const key = new Date(ts + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const d = dailyMap.get(key);
      const gmv = round(d?.gmv);
      series.push({ date: key, gmv, platformRevenue: round(d?.platformRevenue), bookings: d?.bookings || 0, gst: gstOf(gmv, rate) });
    }

    return {
      range,
      city: city || null,
      from,
      to: new Date(to.getTime() - 1),
      gst: { rate, inclusive: true },
      kpis: {
        ...cur,
        gstCollected,
        activeCustomers: customers[0]?.n || 0,
        takeRatePct: cur.gmv > 0 ? round((cur.platformRevenue / cur.gmv) * 100) : 0,
        avgOrderValue: cur.transactions > 0 ? round(cur.gmv / cur.transactions) : 0,
        gmvChangePct: delta(cur.gmv, prev.gmv),
        revenueChangePct: delta(cur.platformRevenue, prev.platformRevenue),
        bookingsChangePct: delta(cur.transactions, prev.transactions),
        payoutChangePct: delta(cur.partnerEarnings, prev.partnerEarnings),
      },
      daily: series,
      cities: byCity.map((r) => ({
        city: r.name,
        bookings: r.bookings,
        completed: r.completed,
        gmv: round(r.gmv),
        platformRevenue: round(r.platformRevenue),
        partnerEarnings: round(r.partnerEarnings),
        refunds: round(r.refunds),
        gst: gstOf(r.gmv - r.refunds, rate),
      })),
      partners: byPartner.map((r) => ({
        partnerId: r._id,
        name: r.name || 'Partner',
        phone: r.phone || '',
        jobs: r.jobs,
        earnings: round(r.earnings),
        pending: round(r.pending),
        settled: round(r.settled),
      })),
      paymentMethods: methods.map((m) => ({ method: m._id, amount: round(m.amount), count: m.count })),
      availableCities: cityList.map((x) => x.name),
    };
  }

  /** CSV statements for finance / CA. type = cities | partners | gst | bookings */
  async exportCsv(query = {}) {
    const type = String(query.type || 'cities');
    if (!EXPORT_TYPES.includes(type)) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, `Unknown export type. Use one of: ${EXPORT_TYPES.join(', ')}`);
    }
    const { from, to } = cityPaymentsService.resolveRange(query);
    const city = this.cleanCity(query);
    const rate = gstRate();

    if (type === 'cities' || type === 'partners') {
      const o = await this.getOverview(query);
      if (type === 'cities') {
        return this.toCsv(
          ['City', 'Paid Bookings', 'Completed', 'GMV (INR)', 'Platform Revenue (INR)', 'Partner Earnings (INR)', 'Refunds (INR)', `GST Included @${rate}% (INR)`],
          o.cities.map((r) => [r.city, r.bookings, r.completed, r.gmv, r.platformRevenue, r.partnerEarnings, r.refunds, r.gst])
        );
      }
      return this.toCsv(
        ['Partner', 'Phone', 'Jobs', 'Total Earnings (INR)', 'Pending Payout (INR)', 'Settled (INR)'],
        o.partners.map((r) => [r.name, r.phone, r.jobs, r.earnings, r.pending, r.settled])
      );
    }

    const rows = await Booking.find(this.baseMatch(from, to, city))
      .select('bookingId packageName status city paymentStatus paymentMethod paymentConfirmedAt createdAt amount refundAmount financialStatus financialSnapshot')
      .populate('customer', 'name')
      .populate('partner', 'name agencyName')
      .sort({ createdAt: -1 })
      .limit(EXPORT_LIMIT)
      .lean();
    const paid = (b) => (b.financialSnapshot?.customerPayable > 0 ? b.financialSnapshot.customerPayable : b.amount) || 0;
    const when = (b) => new Date(b.paymentConfirmedAt || b.createdAt).toISOString();

    if (type === 'gst') {
      return this.toCsv(
        ['Booking ID', 'Payment Date', 'City', 'Status', 'Gross Paid (INR)', 'Refund (INR)', 'Net Amount (INR)', `Taxable Value (INR)`, `GST @${rate}% (INR)`],
        rows.map((b) => {
          const net = round(paid(b) - (b.refundAmount || 0));
          const gst = gstOf(net, rate);
          return [b.bookingId, when(b), b.city, b.status, round(paid(b)), round(b.refundAmount), net, round(net - gst), gst];
        })
      );
    }

    return this.toCsv(
      ['Booking ID', 'Payment Date', 'City', 'Service', 'Customer', 'Partner', 'Status', 'Financial Status', 'Method', 'Paid (INR)', 'Platform Revenue (INR)', 'Partner Net (INR)', 'Refund (INR)'],
      rows.map((b) => [
        b.bookingId, when(b), b.city, b.packageName, b.customer?.name, b.partner?.name || b.partner?.agencyName,
        b.status, b.financialStatus, b.paymentMethod, round(paid(b)),
        round(b.financialSnapshot?.norozzGrossRevenue), round(b.financialSnapshot?.partnerNetEarning), round(b.refundAmount),
      ])
    );
  }

  // Quoted CSV; leading = + - @ neutralised to block spreadsheet formula injection (numbers pass through untouched)
  toCsv(header, rows) {
    const cell = (v) => {
      if (typeof v === 'number') return String(v);
      const s = String(v ?? '');
      const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  }
}

export const superAdminReportsService = new SuperAdminReportsService();
