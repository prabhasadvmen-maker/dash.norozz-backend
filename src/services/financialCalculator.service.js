import { CommissionRule } from '../models/commissionRule.model.js';

export class FinancialCalculatorService {
  /**
   * Find applicable active CommissionRule for a category or global default
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

    if (!rule) {
      // Fallback default rule (5% Customer Fee, 5% Partner Commission)
      rule = {
        _id: null,
        name: 'Default 5% Revenue Policy',
        customerFeeType: 'percentage',
        customerFeeValue: 5,
        customerFeeFixed: 0,
        partnerCommissionType: 'percentage',
        partnerCommissionValue: 5,
        partnerCommissionFixed: 0,
      };
    }

    return rule;
  }

  /**
   * Calculate full financial breakdown and snapshot
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

    const customerPayable = baseValue + customerPlatformFee - (discountBearBy === 'NOROZZ' ? discountAmount : 0);
    const partnerGrossEarning = baseValue;
    const partnerNetEarning = Math.max(0, partnerGrossEarning - partnerCommission);
    const norozzGrossRevenue = customerPlatformFee + partnerCommission;

    return {
      servicePrice: Number(servicePrice),
      extraServicesPrice: Number(extraServicesPrice),
      customerPlatformFee,
      partnerCommission,
      discountAmount: Number(discountAmount),
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
