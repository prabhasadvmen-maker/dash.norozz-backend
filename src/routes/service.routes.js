import { Router } from 'express';
import { serviceController } from '../controllers/service.controller.js';
import {
  createServiceRules,
  updateServiceRules,
  updateServiceStatusRules,
} from '../validators/service.validator.js';
import { validate } from '../validators/index.js';
import { verifyJWT } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';
import { ROLES } from '../constants/roles.constant.js';

import { upload } from '../middleware/upload.middleware.js';

const router = Router();

const parseMultipartJson = (req, res, next) => {
  if (req.body) {
    const arrayFields = ['gallery', 'videos', 'cities', 'tags', 'seoKeywords', 'features', 'whatsIncluded', 'faqs'];
    arrayFields.forEach((field) => {
      if (req.body[field] && typeof req.body[field] === 'string') {
        try {
          req.body[field] = JSON.parse(req.body[field]);
        } catch (e) {
          // If comma separated string, turn to array
          if (req.body[field].includes(',')) {
            req.body[field] = req.body[field].split(',').map(s => s.trim()).filter(Boolean);
          } else if (req.body[field].trim()) {
            req.body[field] = [req.body[field].trim()];
          } else {
            req.body[field] = [];
          }
        }
      }
    });
  }
  next();
};

// =====================================
// CUSTOMER & PUBLIC ROUTES (Active Services Only)
// =====================================
router.get('/', serviceController.getPublicServices);
router.get('/slug/:slug', serviceController.getServiceBySlug);

// =====================================
// SUPER ADMIN MANAGEMENT ROUTES (Protected)
// =====================================
router.get('/admin/all', verifyJWT, authorizeRoles(ROLES.SUPER_ADMIN), serviceController.getAdminServices);
router.post('/', verifyJWT, authorizeRoles(ROLES.SUPER_ADMIN), upload.any(), parseMultipartJson, createServiceRules, validate, serviceController.createService);
router.put('/:id', verifyJWT, authorizeRoles(ROLES.SUPER_ADMIN), upload.any(), parseMultipartJson, updateServiceRules, validate, serviceController.updateService);
router.delete('/:id', verifyJWT, authorizeRoles(ROLES.SUPER_ADMIN), serviceController.deleteService);
router.patch('/:id/restore', verifyJWT, authorizeRoles(ROLES.SUPER_ADMIN), serviceController.restoreService);
router.patch('/:id/status', verifyJWT, authorizeRoles(ROLES.SUPER_ADMIN), updateServiceStatusRules, validate, serviceController.updateStatus);

export default router;
