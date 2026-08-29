import { Router } from 'express';
import { servicePackageController } from '../controllers/servicePackage.controller.js';
import { verifyJWT } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';
import { ROLES } from '../constants/roles.constant.js';

const router = Router();

// Public / Customer Endpoints
router.get('/service/:serviceId', servicePackageController.getPackagesByService);
router.get('/:id', servicePackageController.getPackageById);

// Protected Super Admin Endpoints
router.post('/service/:serviceId', verifyJWT, authorizeRoles(ROLES.SUPER_ADMIN), servicePackageController.createPackage);
router.put('/:id', verifyJWT, authorizeRoles(ROLES.SUPER_ADMIN), servicePackageController.updatePackage);
router.delete('/:id', verifyJWT, authorizeRoles(ROLES.SUPER_ADMIN), servicePackageController.deletePackage);
router.patch('/:id/status', verifyJWT, authorizeRoles(ROLES.SUPER_ADMIN), servicePackageController.updateStatus);
router.patch('/:id/popular', verifyJWT, authorizeRoles(ROLES.SUPER_ADMIN), servicePackageController.togglePopular);
router.patch('/:id/recommended', verifyJWT, authorizeRoles(ROLES.SUPER_ADMIN), servicePackageController.toggleRecommended);

export default router;
