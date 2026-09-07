import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { legalPolicyService } from '../services/legalPolicy.service.js';

class LegalPolicyController {
  // Public or Admin GET single policy
  getPolicy = asyncHandler(async (req, res) => {
    const { targetApp, type } = req.params;
    const policy = await legalPolicyService.getPolicy(targetApp, type);
    return res.status(200).json(new ApiResponse(200, policy, 'Legal policy retrieved successfully'));
  });

  // Admin GET all policies
  getAllPolicies = asyncHandler(async (req, res) => {
    const policies = await legalPolicyService.getAllPolicies();
    return res.status(200).json(new ApiResponse(200, policies, 'All legal policies retrieved successfully'));
  });

  // Super Admin Save/Update policy
  savePolicy = asyncHandler(async (req, res) => {
    const { targetApp, type } = req.params;
    const { title, content, version, isPublished } = req.body;
    const updatedBy = req.user?.email || req.user?.name || 'Super Admin HQ';

    const policy = await legalPolicyService.upsertPolicy(targetApp, type, {
      title,
      content,
      version,
      isPublished,
      updatedBy,
    });

    return res.status(200).json(new ApiResponse(200, policy, 'Legal policy updated successfully'));
  });
}

export const legalPolicyController = new LegalPolicyController();
