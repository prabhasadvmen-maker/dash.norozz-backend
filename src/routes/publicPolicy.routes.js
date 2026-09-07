import { Router } from 'express';
import { legalPolicyController } from '../controllers/legalPolicy.controller.js';

const router = Router();

// Publicly readable legal policies for Customer App and Partner App
router.get('/policies/all', legalPolicyController.getAllPolicies);
router.get('/policies/:targetApp/:type', legalPolicyController.getPolicy);

export default router;
