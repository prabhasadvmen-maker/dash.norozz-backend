import { Router } from 'express';
import { autoAssignmentController } from '../controllers/autoAssignment.controller.js';
import { verifyJWT } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';
import { ROLES } from '../constants/roles.constant.js';

const router = Router();

// Protect ALL Dispatch endpoints with JWT
router.use(verifyJWT);

router.post('/auto-assign/:bookingId', authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.CITY_ADMIN), autoAssignmentController.autoAssign);
router.patch('/partner-availability', authorizeRoles(ROLES.PARTNER), autoAssignmentController.toggleAvailability);

export default router;
