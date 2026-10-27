import '../models/user.model.js';
import '../models/category.model.js';
import { Booking } from '../models/booking.model.js';
import { cityPaymentsService } from './cityPayments.service.js';

// Service-level targets the report is measured against. Returned to the client so the UI never hard-codes them.
export const SLA_TARGETS = {
  dispatchMinutes: 15, // booking placed -> partner assigned
  completionRatePct: 90, // completed / (completed + cancelled)
  minRating: 4.2,
  maxCancellationRatePct: 10,
};

const round = (n, d = 1) => {
  const f = 10 ** d;
  return Math.round((Number(n) || 0) * f) / f;
};
const pct = (part, whole) => (whole > 0 ? round((part / whole) * 100) : 0);
const MIN_MS = 60 * 1000;
const IST = 'Asia/Kolkata';

// Bookings the customer never paid for and that timed out are abandoned carts, not demand
const PLACED = {
  $not: [{ $and: [{ $eq: ['$status', 'Cancelled'] }, { $in: ['$paymentStatus', ['pending', 'failed']] }] }],
};

const minutesBetween = (later, earlier) => ({ $divide: [{ $subtract: [later, earlier] }, MIN_MS] });

export class CityReportsService {
  /** Base filter: this city, created in [from, to), real demand only. */
  baseMatch(assignedCity, from, to) {
    return {
      $and: [
        cityPaymentsService.cityMatch(assignedCity),
        { createdAt: { $gte: from, $lt: to } },
        { $expr: PLACED },
      ],
    };
  }

  async getOverview(assignedCity, query = {}) {
    const { range, from, to, prevFrom, prevTo } = cityPaymentsService.resolveRange(query);
    const match = { $match: this.baseMatch(assignedCity, from, to) };

    const totalsGroup = {
      $group: {
        _id: null,
        placed: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $in: ['$status', ['Cancelled', 'Refunded']] }, 1, 0] } },
        active: { $sum: { $cond: [{ $in: ['$status', ['Assigned', 'Accepted', 'On The Way', 'Started']] }, 1, 0] } },
        unassigned: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'Pending'] }, { $eq: ['$partner', null] }] }, 1, 0] } },
        assignedCount: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$assignedAt', null] }, null] }, 1, 0] } },
        dispatchMinSum: {
          $sum: { $cond: [{ $ne: [{ $ifNull: ['$assignedAt', null] }, null] }, minutesBetween('$assignedAt', '$createdAt'), 0] },
        },
        dispatchWithinSla: {
          $sum: {
            $cond: [
              { $and: [{ $ne: [{ $ifNull: ['$assignedAt', null] }, null] }, { $lte: [minutesBetween('$assignedAt', '$createdAt'), SLA_TARGETS.dispatchMinutes] }] },
              1,
              0,
            ],
          },
        },
        durationCount: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'Completed'] }, { $ne: [{ $ifNull: ['$startedAt', null] }, null] }, { $ne: [{ $ifNull: ['$completedAt', null] }, null] }] }, 1, 0] } },
        durationMinSum: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$status', 'Completed'] }, { $ne: [{ $ifNull: ['$startedAt', null] }, null] }, { $ne: [{ $ifNull: ['$completedAt', null] }, null] }] },
              minutesBetween('$completedAt', '$startedAt'),
              0,
            ],
          },
        },
        ratingCount: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$rating', 0] }, 0] }, 1, 0] } },
        ratingSum: { $sum: { $ifNull: ['$rating', 0] } },
        reassigned: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$reassignCount', 0] }, 0] }, 1, 0] } },
      },
    };

    const [totalsRes, prevRes, daily, hourly, byCategory, cancelBy, cancelReasons, partnerStats, rejections] = await Promise.all([
      Booking.aggregate([match, totalsGroup]),
      Booking.aggregate([{ $match: this.baseMatch(assignedCity, prevFrom, prevTo) }, totalsGroup]),
      Booking.aggregate([
        match,
        { $addFields: { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: IST } } } },
        {
          $group: {
            _id: '$day',
            placed: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $in: ['$status', ['Cancelled', 'Refunded']] }, 1, 0] } },
          },
        },
      ]),
      Booking.aggregate([
        match,
        { $group: { _id: { $hour: { date: '$createdAt', timezone: IST } }, count: { $sum: 1 } } },
      ]),
      Booking.aggregate([
        match,
        {
          $group: {
            _id: '$category',
            placed: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $in: ['$status', ['Cancelled', 'Refunded']] }, 1, 0] } },
            revenue: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, { $ifNull: ['$financialSnapshot.customerPayable', '$amount'] }, 0] } },
            ratingCount: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$rating', 0] }, 0] }, 1, 0] } },
            ratingSum: { $sum: { $ifNull: ['$rating', 0] } },
          },
        },
        { $sort: { placed: -1 } },
        { $limit: 8 },
        { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'c', pipeline: [{ $project: { name: 1 } }] } },
        { $project: { placed: 1, completed: 1, cancelled: 1, revenue: 1, ratingCount: 1, ratingSum: 1, name: { $arrayElemAt: ['$c.name', 0] } } },
      ]),
      Booking.aggregate([
        match,
        { $match: { status: { $in: ['Cancelled', 'Refunded'] } } },
        { $group: { _id: { $cond: [{ $in: ['$cancelledBy', ['customer', 'partner', 'admin', 'system']] }, '$cancelledBy', 'unknown'] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Booking.aggregate([
        match,
        { $match: { status: { $in: ['Cancelled', 'Refunded'] } } },
        { $group: { _id: { $toLower: { $trim: { input: { $ifNull: ['$cancellationReason', ''] } } } }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 6 },
      ]),
      Booking.aggregate([
        match,
        { $match: { partner: { $ne: null } } },
        {
          $group: {
            _id: '$partner',
            jobs: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $in: ['$status', ['Cancelled', 'Refunded']] }, 1, 0] } },
            ratingCount: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$rating', 0] }, 0] }, 1, 0] } },
            ratingSum: { $sum: { $ifNull: ['$rating', 0] } },
            durationCount: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'Completed'] }, { $ne: [{ $ifNull: ['$startedAt', null] }, null] }, { $ne: [{ $ifNull: ['$completedAt', null] }, null] }] }, 1, 0] } },
            durationMinSum: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ['$status', 'Completed'] }, { $ne: [{ $ifNull: ['$startedAt', null] }, null] }, { $ne: [{ $ifNull: ['$completedAt', null] }, null] }] },
                  minutesBetween('$completedAt', '$startedAt'),
                  0,
                ],
              },
            },
          },
        },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u', pipeline: [{ $project: { name: 1, agencyName: 1 } }] } },
        { $project: { jobs: 1, completed: 1, cancelled: 1, ratingCount: 1, ratingSum: 1, durationCount: 1, durationMinSum: 1, name: { $ifNull: [{ $arrayElemAt: ['$u.name', 0] }, { $arrayElemAt: ['$u.agencyName', 0] }] } } },
      ]),
      // partner turned the job down after it was offered / assigned
      Booking.aggregate([
        match,
        { $unwind: '$cancelledByPartners' },
        { $group: { _id: '$cancelledByPartners', rejections: { $sum: 1 } } },
      ]),
    ]);

    const t = totalsRes[0] || {};
    const p = prevRes[0] || {};
    const shape = (x) => {
      const closed = (x.completed || 0) + (x.cancelled || 0);
      return {
        placed: x.placed || 0,
        completed: x.completed || 0,
        cancelled: x.cancelled || 0,
        completionRate: pct(x.completed || 0, closed),
        cancellationRate: pct(x.cancelled || 0, x.placed || 0),
        avgRating: x.ratingCount ? round(x.ratingSum / x.ratingCount, 2) : null,
      };
    };
    const cur = shape(t);
    const prev = shape(p);
    const delta = (a, b) => (b > 0 ? round(((a - b) / b) * 100) : a > 0 ? 100 : 0);

    const rejectionMap = new Map(rejections.map((r) => [String(r._id), r.rejections]));
    const partners = partnerStats
      .map((s) => {
        const closed = s.completed + s.cancelled;
        const rejects = rejectionMap.get(String(s._id)) || 0;
        const completionRate = pct(s.completed, closed);
        const avgRating = s.ratingCount ? round(s.ratingSum / s.ratingCount, 2) : null;
        const offers = s.jobs + rejects;
        const acceptanceRate = pct(s.jobs, offers);
        // Transparent weighting: 50% completion, 30% rating (5★ = 100), 20% acceptance. Unrated partners use completion as the rating proxy.
        const ratingScore = avgRating ? (avgRating / 5) * 100 : completionRate;
        const score = round(0.5 * completionRate + 0.3 * ratingScore + 0.2 * acceptanceRate, 0);
        return {
          partnerId: s._id,
          name: s.name || 'Partner',
          jobs: s.jobs,
          completed: s.completed,
          cancelled: s.cancelled,
          rejections: rejects,
          completionRate,
          acceptanceRate,
          avgRating,
          avgServiceMinutes: s.durationCount ? round(s.durationMinSum / s.durationCount, 0) : null,
          score,
        };
      })
      .sort((a, b) => b.score - a.score || b.jobs - a.jobs);

    const dailyMap = new Map(daily.map((d) => [d._id, d]));
    const dailySeries = [];
    for (let ts = from.getTime(); ts < to.getTime(); ts += 24 * 60 * 60 * 1000) {
      const key = new Date(ts + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const d = dailyMap.get(key);
      dailySeries.push({ date: key, placed: d?.placed || 0, completed: d?.completed || 0, cancelled: d?.cancelled || 0 });
    }

    const hourMap = new Map(hourly.map((h) => [h._id, h.count]));
    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: hourMap.get(h) || 0 }));

    return {
      assignedCity,
      range,
      from,
      to: new Date(to.getTime() - 1),
      targets: SLA_TARGETS,
      kpis: {
        ...cur,
        placedChangePct: delta(cur.placed, prev.placed),
        completedChangePct: delta(cur.completed, prev.completed),
        active: t.active || 0,
        unassigned: t.unassigned || 0,
        avgDispatchMinutes: t.assignedCount ? round(t.dispatchMinSum / t.assignedCount) : null,
        dispatchWithinSlaPct: pct(t.dispatchWithinSla || 0, t.assignedCount || 0),
        avgServiceMinutes: t.durationCount ? round(t.durationMinSum / t.durationCount, 0) : null,
        ratedBookings: t.ratingCount || 0,
        reassignedBookings: t.reassigned || 0,
      },
      daily: dailySeries,
      hours,
      categories: this.mergeCategories(byCategory),
      cancellations: {
        total: cur.cancelled,
        byActor: cancelBy.map((c) => ({ actor: c._id, count: c.count })),
        topReasons: cancelReasons.map((r) => ({ reason: r._id || 'No reason given', count: r.count })),
      },
      partners,
    };
  }

  // Categories that were deleted show up as nameless groups: fold them into one "Other" row
  mergeCategories(rows) {
    const merged = new Map();
    for (const c of rows) {
      const name = c.name || 'Other';
      const m = merged.get(name) || { name, placed: 0, completed: 0, cancelled: 0, revenue: 0, ratingCount: 0, ratingSum: 0 };
      m.placed += c.placed;
      m.completed += c.completed;
      m.cancelled += c.cancelled;
      m.revenue += c.revenue;
      m.ratingCount += c.ratingCount;
      m.ratingSum += c.ratingSum;
      merged.set(name, m);
    }
    return [...merged.values()]
      .sort((a, b) => b.placed - a.placed)
      .map((c) => ({
        name: c.name,
        placed: c.placed,
        completed: c.completed,
        cancelled: c.cancelled,
        revenue: round(c.revenue, 0),
        completionRate: pct(c.completed, c.completed + c.cancelled),
        avgRating: c.ratingCount ? round(c.ratingSum / c.ratingCount, 2) : null,
      }));
  }

  /** CSV of every booking in the window (city scoped), for audits and spreadsheets. */
  async exportCsv(assignedCity, query = {}) {
    const { from, to } = cityPaymentsService.resolveRange(query);
    const rows = await Booking.find(this.baseMatch(assignedCity, from, to))
      .select('bookingId packageName status createdAt assignedAt startedAt completedAt cancelledAt cancelledBy cancellationReason rating reassignCount amount financialSnapshot')
      .populate('customer', 'name')
      .populate('partner', 'name agencyName')
      .populate('category', 'name')
      .sort({ createdAt: -1 })
      .limit(10000)
      .lean();

    const cell = (v) => {
      const s = String(v ?? '');
      const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const iso = (d) => (d ? new Date(d).toISOString() : '');
    const mins = (a, b) => (a && b ? round((new Date(a) - new Date(b)) / MIN_MS) : '');
    const header = ['Booking ID', 'Category', 'Service', 'Customer', 'Partner', 'Status', 'Placed At', 'Assigned At', 'Dispatch Minutes', 'Started At', 'Completed At', 'Service Minutes', 'Cancelled At', 'Cancelled By', 'Cancellation Reason', 'Rating', 'Reassignments', 'Amount'];
    const lines = rows.map((b) =>
      [
        b.bookingId,
        b.category?.name,
        b.packageName,
        b.customer?.name,
        b.partner?.name || b.partner?.agencyName,
        b.status,
        iso(b.createdAt),
        iso(b.assignedAt),
        mins(b.assignedAt, b.createdAt),
        iso(b.startedAt),
        iso(b.completedAt),
        mins(b.completedAt, b.startedAt),
        iso(b.cancelledAt),
        b.cancelledBy,
        b.cancellationReason,
        b.rating,
        b.reassignCount || 0,
        b.financialSnapshot?.customerPayable || b.amount,
      ]
        .map(cell)
        .join(',')
    );
    return [header.map(cell).join(','), ...lines].join('\r\n');
  }
}

export const cityReportsService = new CityReportsService();
