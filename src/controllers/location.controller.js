import { locationService } from '../services/location.service.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

export class LocationController {
  async reverseGeocode(req, res, next) {
    try {
      const { lat, lng, latitude, longitude } = req.query || {};
      const targetLat = lat || latitude;
      const targetLng = lng || longitude;

      const result = await locationService.reverseGeocode({
        lat: Number(targetLat),
        lng: Number(targetLng),
      });

      return res.status(HTTP_STATUS.OK).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async searchAddress(req, res, next) {
    try {
      const { query, text, q } = req.query || {};
      const searchStr = query || text || q;

      const result = await locationService.searchAddress({
        query: searchStr,
      });

      return res.status(HTTP_STATUS.OK).json({
        success: true,
        data: result.results,
      });
    } catch (error) {
      next(error);
    }
  }

  async getDrivingRoute(req, res, next) {
    try {
      const { origin, destination, originLat, originLng, destLat, destLng } = req.body || {};

      const orig = origin || { lat: Number(originLat), lng: Number(originLng) };
      const dest = destination || { lat: Number(destLat), lng: Number(destLng) };

      const result = await locationService.getDrivingRoute({
        origin: orig,
        destination: dest,
      });

      return res.status(HTTP_STATUS.OK).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const locationController = new LocationController();
