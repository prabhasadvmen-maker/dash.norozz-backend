import mongoose from 'mongoose';
import { City } from '../models/city.model.js';
import { isWithinOperatingRadius } from './distance.util.js';

const norm = (v) => String(v || '').trim().toLowerCase();

const idOf = (v) => (v && v._id ? String(v._id) : String(v || ''));

const hasCoords = (c) => {
  if (!c) return false;
  const lat = Number(c.lat ?? c.latitude);
  const lng = Number(c.lng ?? c.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat !== 0 || lng !== 0;
};

/**
 * Resolves the city name of a partner. `assignedCity` may be a populated City doc, a name string or an ObjectId.
 */
export const getPartnerCityName = (partner) => {
  const ac = partner?.assignedCity;
  if (ac && typeof ac === 'object' && ac.name) return ac.name;
  if (typeof ac === 'string' && ac && !/^[0-9a-fA-F]{24}$/.test(ac)) return ac;
  return partner?.city || '';
};

/**
 * Replaces `assignedCity` on lean partner docs with `{ _id, name }`. Legacy docs may hold a plain city name
 * ("Greater Noida") instead of an ObjectId, which makes Mongoose `.populate('assignedCity')` throw a CastError,
 * so cities are resolved manually and name strings are passed through untouched.
 */
export const resolvePartnerCities = async (partners) => {
  const list = Array.isArray(partners) ? partners : [partners];
  const ids = [
    ...new Set(
      list
        .map((p) => p?.assignedCity)
        .filter((v) => v && typeof v !== 'string' && mongoose.isValidObjectId(v))
        .map(String)
    ),
  ];
  const cities = ids.length ? await City.find({ _id: { $in: ids } }).select('name').lean() : [];
  const byId = new Map(cities.map((c) => [String(c._id), c]));
  for (const p of list) {
    const ac = p?.assignedCity;
    if (ac && typeof ac !== 'string' && byId.has(String(ac))) p.assignedCity = byId.get(String(ac));
  }
  return partners;
};

const sameCity = (a, b) => {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
};

/**
 * Single source of truth for "can this partner serve this booking?".
 * Used by realtime dispatch, the partner pending list and auto-assignment.
 *
 * Rules:
 *  - approved KYC + active account
 *  - not previously cancelled this booking
 *  - category match (partner.category / partner.categories)
 *  - offeredServices (if the partner restricted them) must contain the service
 *  - location: if both sides have GPS -> inside partner's radius; otherwise -> the city must match
 */
export const isPartnerEligibleForBooking = (partner, booking, { requireOnline = false } = {}) => {
  if (!partner || partner.role !== 'partner') return false;
  if (partner.status !== 'active' || partner.kycStatus !== 'approved') return false;
  if (requireOnline && !partner.isOnline) return false;

  const excluded = (booking.cancelledByPartners || []).map(idOf);
  if (excluded.includes(String(partner._id))) return false;

  const bookingCategoryId = idOf(booking.category);
  if (bookingCategoryId) {
    const partnerCatId = idOf(partner.category);
    const partnerCats = Array.isArray(partner.categories) ? partner.categories.map(idOf) : [];
    const partnerHasCategory = Boolean(partnerCatId) || partnerCats.length > 0;
    if (!partnerHasCategory) return false;
    if (partnerCatId !== bookingCategoryId && !partnerCats.includes(bookingCategoryId)) return false;
  }

  const serviceId = idOf(booking.service);
  if (serviceId && Array.isArray(partner.offeredServices) && partner.offeredServices.length > 0) {
    if (!partner.offeredServices.map(idOf).includes(serviceId)) return false;
  }

  const partnerCoords = partner.locationCoordinates;
  const bookingCoords = booking.address?.locationCoordinates || booking.locationCoordinates;
  if (hasCoords(partnerCoords) && hasCoords(bookingCoords)) {
    const radius = partner.serviceRadius || partner.workRadius || 8;
    return isWithinOperatingRadius(partnerCoords, bookingCoords, radius).isWithinRadius;
  }

  const bookingCity = booking.city || booking.address?.city;
  return sameCity(getPartnerCityName(partner), bookingCity);
};
