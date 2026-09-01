import { Router } from 'express';
import { translationController } from '../controllers/translation.controller.js';

const router = Router();

// Public / Authenticated Translation Endpoints
router.post('/translate', (req, res, next) => translationController.translateText(req, res, next));
router.post('/translate-batch', (req, res, next) => translationController.translateBatch(req, res, next));
router.get('/languages', (req, res, next) => translationController.getSupportedLanguages(req, res, next));

export default router;
