import { Router } from 'express';
import { pushNotificationController } from '../controllers/pushNotification.controller.js';
import { verifyJWT } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';
import { ROLES } from '../constants/roles.constant.js';
import { upload } from '../middleware/upload.middleware.js';

const router = Router();

// Public — any logged-in user can save their token
router.post('/save-token', verifyJWT, pushNotificationController.saveToken);

// Super Admin only — send notifications & view subscribers
router.post('/send', verifyJWT, authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN), pushNotificationController.sendNotification);
router.get('/summary', verifyJWT, authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN), pushNotificationController.getSummary);
router.get('/history', verifyJWT, authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN), pushNotificationController.getHistory);
router.get('/subscriber-count', verifyJWT, authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN), pushNotificationController.getSubscriberCount);
router.get('/subscribers', verifyJWT, authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN), pushNotificationController.getSubscribers);
router.post('/upload-image', verifyJWT, authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN), upload.single('image'), pushNotificationController.uploadImage);

export default router;
