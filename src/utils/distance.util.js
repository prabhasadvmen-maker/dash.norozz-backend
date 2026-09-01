/**
 * Calculate distance in Kilometers between two Geographic Coordinates (Latitude/Longitude)
 * using the Haversine Formula (synchronous, instant fallback).
 *
 * @param {Number} lat1 Latitude of point 1
 * @param {Number} lon1 Longitude of point 1
 * @param {Number} lat2 Latitude of point 2
 * @param {Number} lon2 Longitude of point 2
 * @returns {Number|null} Distance in KM (rounded to 2 decimals), or null if invalid coordinates
 */
export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (
    lat1 === null || lat1 === undefined ||
    lon1 === null || lon1 === undefined ||
    lat2 === null || lat2 === undefined ||
    lon2 === null || lon2 === undefined
  ) {
    return null;
  }

  const nLat1 = Number(lat1);
  const nLon1 = Number(lon1);
  const nLat2 = Number(lat2);
  const nLon2 = Number(lon2);

  if (isNaN(nLat1) || isNaN(nLon1) || isNaN(nLat2) || isNaN(nLon2)) return null;
  if (nLat1 === 0 && nLon1 === 0) return null;
  if (nLat2 === 0 && nLon2 === 0) return null;

  const R = 6371; // Earth radius in km
  const dLat = (nLat2 - nLat1) * (Math.PI / 180);
  const dLon = (nLon2 - nLon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(nLat1 * (Math.PI / 180)) * Math.cos(nLat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance * 100) / 100;
}

/**
 * Geoapify Driving Distance API (Async Road Distance in KM & ETA minutes)
 */
export async function getGeoapifyRoadDistanceKm(lat1, lon1, lat2, lon2) {
  const straightDistance = calculateDistanceKm(lat1, lon1, lat2, lon2);
  if (straightDistance === null) return { distanceKm: null, durationMins: null };

  const apiKey = process.env.GEOAPIFY_API_KEY || '2ecb147800e2472eab47bbfeaf5d010a';
  const url = `https://api.geoapify.com/v1/routing?waypoints=${lat1},${lon1}|${lat2},${lon2}&mode=drive&apiKey=${apiKey}`;

  try {
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const feature = data.features?.[0];
      if (feature?.properties) {
        const meters = feature.properties.distance || 0;
        const seconds = feature.properties.time || 0;
        return {
          distanceKm: Math.round((meters / 1000) * 100) / 100,
          durationMins: Math.ceil(seconds / 60),
          isRoadDistance: true,
        };
      }
    }
  } catch (err) {
    console.warn('⚠️ Geoapify Road Distance fallback to Haversine:', err.message);
  }

  // Fallback to Haversine with estimated driving speed (approx 30 km/h)
  const estMins = Math.ceil((straightDistance / 30) * 60);
  return {
    distanceKm: straightDistance,
    durationMins: Math.max(estMins, 2),
    isRoadDistance: false,
  };
}

/**
 * Verify if a target booking coordinate is within a partner's operating radius (in KM)
 *
 * @param {Object} partnerCoordinates { lat, lng } or location.coordinates [lng, lat]
 * @param {Object} bookingCoordinates { lat, lng }
 * @param {Number} serviceRadiusKm Partner's operating radius in KM (default: 8 km)
 * @returns {Object} { isWithinRadius: boolean, distanceKm: number|null }
 */
export function isWithinOperatingRadius(partnerCoordinates, bookingCoordinates, serviceRadiusKm = 8) {
  let partnerLat = partnerCoordinates?.lat;
  let partnerLng = partnerCoordinates?.lng;

  // Support GeoJSON Point coordinates array [lng, lat]
  if ((!partnerLat || !partnerLng) && Array.isArray(partnerCoordinates?.coordinates)) {
    partnerLng = partnerCoordinates.coordinates[0];
    partnerLat = partnerCoordinates.coordinates[1];
  }

  const bookingLat = bookingCoordinates?.lat;
  const bookingLng = bookingCoordinates?.lng;

  const distanceKm = calculateDistanceKm(partnerLat, partnerLng, bookingLat, bookingLng);

  if (distanceKm === null) {
    // If coordinates are missing on either side, default to true for flexibility
    return { isWithinRadius: true, distanceKm: null };
  }

  const maxAllowedRadius = Number(serviceRadiusKm) || 8;
  const isWithinRadius = distanceKm <= maxAllowedRadius;

  return { isWithinRadius, distanceKm };
}
