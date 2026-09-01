import { Router } from 'express';
import { locationController } from '../controllers/location.controller.js';

const router = Router();

router.get('/reverse-geocode', (req, res, next) => locationController.reverseGeocode(req, res, next));
router.get('/search', (req, res, next) => locationController.searchAddress(req, res, next));
router.post('/route', (req, res, next) => locationController.getDrivingRoute(req, res, next));

export default router;
