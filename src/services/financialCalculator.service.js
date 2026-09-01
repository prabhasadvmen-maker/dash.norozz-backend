import { CommissionRule } from '../models/commissionRule.model.js';
import { SystemSettings } from '../models/systemSettings.model.js';

export class FinancialCalculatorService {
  /**
   * Find applicable active CommissionRule for a category or fetch global SystemSettings rates set by SuperAdmin
   */
  async getActiveRuleForCategory(categoryId = null) {
    let rule = null;

    if (categoryId) {
      rule = await CommissionRule.findOne({
        category: categoryId,
        isActive: true,
      }).sort({ createdAt: -1 });
    }

    if (!rule) {
      rule = await CommissionRule.findOne({
        category: null,
        isActive: true,
      }).sort({ createdAt: -1 });
    }

    // Fetch live SuperAdmin Global Settings from MongoDB
    let settings = await SystemSettings.findOne({ key: 'global_settings' });
    const custFeePercent = (settings && typeof settings.customerPlatformFeePercent === 'number') ? settings.customerPlatformFeePercent : 5;
    const partCommissionPercent = (settings && typeof settings.partnerPlatformFeePercent === 'number') ? settings.partnerPlatformFeePercent : 10;

    if (!rule) {
      rule = {
        _id: null,
        name: `Dynamic System Policy (${custFeePercent}% Cust / ${partCommissionPercent}% Partner)`,
        customerFeeType: 'percentage',
        customerFeeValue: custFeePercent,
        customerFeeFixed: 0,
        partnerCommissionType: 'percentage',
        partnerCommissionValue: partCommissionPercent,
        partnerCommissionFixed: 0,
      };
    }

    return rule;
  }

  /**
   * Calculate full financial breakdown and snapshot using dynamic rates
   */
  async calculateBreakdown({
    servicePrice = 0,
    extraServicesPrice = 0,
    categoryId = null,
    discountAmount = 0,
    discountBearBy = 'CUSTOMER',
  }) {
    const rule = await this.getActiveRuleForCategory(categoryId);

    const baseValue = Number(servicePrice) + Number(extraServicesPrice);

    // Calculate Customer Platform Fee
    let customerPlatformFee = 0;
    if (rule.customerFeeType === 'percentage') {
      customerPlatformFee = Math.round(baseValue * (rule.customerFeeValue / 100));
    } else if (rule.customerFeeType === 'fixed') {
      customerPlatformFee = rule.customerFeeFixed || rule.customerFeeValue || 0;
    } else if (rule.customerFeeType === 'percentage_plus_fixed') {
      customerPlatformFee = Math.round(baseValue * (rule.customerFeeValue / 100)) + (rule.customerFeeFixed || 0);
    }

    // Calculate Partner Commission
    let partnerCommission = 0;
    if (rule.partnerCommissionType === 'percentage') {
      partnerCommission = Math.round(baseValue * (rule.partnerCommissionValue / 100));
    } else if (rule.partnerCommissionType === 'fixed') {
      partnerCommission = rule.partnerCommissionFixed || rule.partnerCommissionValue || 0;
    } else if (rule.partnerCommissionType === 'percentage_plus_fixed') {
      partnerCommission = Math.round(baseValue * (rule.partnerCommissionValue / 100)) + (rule.partnerCommissionFixed || 0);
    }

    const discVal = Number(discountAmount || 0);
    const customerPayable = Math.max(0, baseValue + customerPlatformFee - discVal);
    const partnerGrossEarning = baseValue;
    const partnerNetEarning = Math.max(0, partnerGrossEarning - partnerCommission);
    const norozzGrossRevenue = customerPlatformFee + partnerCommission;

    return {
      servicePrice: Number(servicePrice),
      extraServicesPrice: Number(extraServicesPrice),
      customerPlatformFee,
      partnerCommission,
      discountAmount: discVal,
      discountBearBy,
      customerPayable,
      partnerGrossEarning,
      partnerNetEarning,
      norozzGrossRevenue,
      commissionRuleId: rule._id,
      appliedAt: new Date(),
    };
  }
}

export const financialCalculatorService = new FinancialCalculatorService();
