import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

export class LocationService {
  getApiKey() {
    return process.env.GEOAPIFY_API_KEY || '2ecb147800e2472eab47bbfeaf5d010a';
  }

  /**
   * Reverse Geocode (Lat/Lng -> Address & City details)
   */
  async reverseGeocode({ lat, lng }) {
    if (lat === undefined || lng === undefined) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Latitude (lat) and Longitude (lng) are required');
    }

    const apiKey = this.getApiKey();
    const url = `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}&apiKey=${apiKey}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new ApiError(HTTP_STATUS.BAD_GATEWAY, `Geoapify API returned HTTP ${response.status}`);
      }

      const data = await response.json();
      const feature = data.features?.[0];
      if (!feature) {
        return {
          formatted: `${lat}, ${lng}`,
          city: 'Unknown City',
          state: '',
          country: 'India',
        };
      }

      const props = feature.properties || {};
      const isPincode = (str) => /^\d{5,6}$/.test(String(str || '').trim());

      let name = props.name || props.address_line1 || '';
      if (isPincode(name)) name = '';

      let street = props.street || props.suburb || props.district || props.county || '';
      if (isPincode(street)) street = '';

      let city = props.city || props.county || props.state_district || 'Azamgarh';
      if (isPincode(city)) city = 'Azamgarh';

      let state = props.state || props.state_code || 'UP';

      // Build clean full address without standalone pincode or country
      const addressParts = [];
      if (name) addressParts.push(name);
      if (street && street !== name) addressParts.push(street);
      if (city && city !== street && city !== name) addressParts.push(city);
      if (state && state !== city) addressParts.push(state);

      // Clean formatted address
      let cleanFormatted = addressParts.length > 0 ? addressParts.join(', ') : (props.formatted || `${city}, ${state}`);
      cleanFormatted = cleanFormatted.replace(/,?\s*\d{5,6}/g, '').replace(/,?\s*India$/i, '').trim();
      if (!cleanFormatted || cleanFormatted === 'UP' || cleanFormatted === 'India') {
        cleanFormatted = `${city}, ${state}`;
      }

      const addressLine1 = name || street || `${city} Premises`;
      const addressLine2 = street && street !== city ? street : city;

      return {
        formatted: cleanFormatted,
        addressLine1,
        addressLine2,
        city,
        state,
        postcode: props.postcode || '',
        country: props.country || 'India',
        lat: Number(props.lat || lat),
        lng: Number(props.lon || lng),
        placeId: props.place_id || null,
      };
    } catch (error) {
      console.error('❌ Geoapify Reverse Geocode Error:', error.message);
      if (error instanceof ApiError) throw error;
      throw new ApiError(HTTP_STATUS.SERVICE_UNAVAILABLE, `Location service error: ${error.message}`);
    }
  }

  /**
   * Forward Search (Query string -> Address suggestions)
   */
  async searchAddress({ query }) {
    if (!query || typeof query !== 'string' || !query.trim()) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Search query parameter is required');
    }

    const apiKey = this.getApiKey();
    const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(query.trim())}&filter=countrycode:in&apiKey=${apiKey}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new ApiError(HTTP_STATUS.BAD_GATEWAY, `Geoapify API returned HTTP ${response.status}`);
      }

      const data = await response.json();
      const features = data.features || [];

      const results = features.map((f) => {
        const p = f.properties || {};
        return {
          formatted: p.formatted || p.address_line1,
          city: p.city || p.county || p.state_district || '',
          state: p.state || '',
          postcode: p.postcode || '',
          lat: p.lat,
          lng: p.lon,
          placeId: p.place_id,
        };
      });

      return { results };
    } catch (error) {
      console.error('❌ Geoapify Search Error:', error.message);
      if (error instanceof ApiError) throw error;
      throw new ApiError(HTTP_STATUS.SERVICE_UNAVAILABLE, `Location search error: ${error.message}`);
    }
  }

  /**
   * Driving Route & Distance Calculation between two points
   * @param {Object} params
   * @param {Object} params.origin { lat, lng }
   * @param {Object} params.destination { lat, lng }
   */
  async getDrivingRoute({ origin, destination }) {
    const oLat = origin?.lat;
    const oLng = origin?.lng;
    const dLat = destination?.lat;
    const dLng = destination?.lng;

    if (oLat === undefined || oLng === undefined || dLat === undefined || dLng === undefined) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Origin and Destination coordinates are required');
    }

    const apiKey = this.getApiKey();
    const url = `https://api.geoapify.com/v1/routing?waypoints=${oLat},${oLng}|${dLat},${dLng}&mode=drive&apiKey=${apiKey}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new ApiError(HTTP_STATUS.BAD_GATEWAY, `Geoapify Routing API returned HTTP ${response.status}`);
      }

      const data = await response.json();
      const feature = data.features?.[0];

      if (!feature) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Route not found between specified locations');
      }

      const props = feature.properties || {};
      const geometry = feature.geometry || {};

      const distanceMeters = props.distance || 0;
      const durationSeconds = props.time || 0;

      const distanceKm = Math.round((distanceMeters / 1000) * 100) / 100;
      const durationMins = Math.ceil(durationSeconds / 60);

      // Convert GeoJSON [lon, lat] coordinates to Leaflet/Map [lat, lon] coordinates
      const coordinates = Array.isArray(geometry.coordinates)
        ? geometry.coordinates.flatMap((subPath) =>
            Array.isArray(subPath[0])
              ? subPath.map(([lon, lat]) => [lat, lon])
              : [[subPath[1], subPath[0]]]
          )
        : [];

      return {
        distanceKm,
        distanceMeters,
        durationMins,
        durationSeconds,
        coordinates,
        origin: { lat: oLat, lng: oLng },
        destination: { lat: dLat, lng: dLng },
      };
    } catch (error) {
      console.error('❌ Geoapify Routing Error:', error.message);
      if (error instanceof ApiError) throw error;
      throw new ApiError(HTTP_STATUS.SERVICE_UNAVAILABLE, `Routing error: ${error.message}`);
    }
  }
}

export const locationService = new LocationService();
