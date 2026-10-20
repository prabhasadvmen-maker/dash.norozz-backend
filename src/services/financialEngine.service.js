import crypto from 'crypto';
import { LedgerEntry } from '../models/ledgerEntry.model.js';
import { PlatformAccount } from '../models/platformAccount.model.js';
import { Booking } from '../models/booking.model.js';
import { User } from '../models/user.model.js';
import { WalletTransaction } from '../models/walletTransaction.model.js';
import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

const rid = () => crypto.randomBytes(4).toString('hex').toUpperCase();
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

// Partner balances are mirrored across three fields; always move them together.
const partnerWalletInc = (delta) => ({ walletBalance: delta, availableBalance: delta, withdrawableBalance: delta });
const customerWalletInc = (delta) => ({ walletBalance: delta, availableBalance: delta });

export class FinancialEngineService {
  generateTxnId(prefix = 'LEDGER') {
    return `${prefix}-${Date.now()}-${rid()}`;
  }

  async getOrCreatePlatformAccount() {
    return PlatformAccount.findOneAndUpdate(
      { accountName: 'Norozz Main Revenue Account' },
      { $setOnInsert: { accountName: 'Norozz Main Revenue Account' } },
      { new: true, upsert: true }
    );
  }

  /**
   * Exactly-once money movement.
   * 1) Insert the ledger row first (unique idempotencyKey). If it already exists, the movement was already applied -> skip.
   * 2) Run the atomic mutation. If it throws, remove the row so the operation can be retried.
   */
  async applyOnce(entry, mutate) {
    let ledger;
    try {
      ledger = await LedgerEntry.create({
        transactionId: entry.transactionId || this.generateTxnId(entry.accountType),
        orderId: entry.orderId || null,
        userId: entry.userId || null,
        accountType: entry.accountType,
        type: entry.type,
        direction: entry.direction,
        amount: round2(entry.amount),
        currency: 'INR',
        referenceType: entry.referenceType || 'Booking',
        referenceId: String(entry.referenceId || ''),
        status: 'Pending',
        idempotencyKey: entry.idempotencyKey,
        metadata: entry.metadata || {},
      });
    } catch (err) {
      if (err.code === 11000) return { applied: false };
      throw err;
    }

    try {
      const result = (await mutate()) || {};
      ledger.balanceBefore = result.balanceBefore ?? 0;
      ledger.balanceAfter = result.balanceAfter ?? 0;
      ledger.status = 'Success';
      await ledger.save();
      return { applied: true, result };
    } catch (err) {
      await LedgerEntry.deleteOne({ _id: ledger._id }).catch(() => {});
      throw err;
    }
  }

  async logWalletTxn({ party, userId, type, category, title, amount, status = 'Completed', paymentMethod, prefix = 'TXN' }) {
    return WalletTransaction.create({
      transactionId: `${prefix}-${Date.now()}-${rid()}`,
      ...(party === 'partner' ? { partnerId: userId } : { user: userId }),
      type,
      category,
      title,
      amount: round2(amount),
      status,
      ...(paymentMethod ? { paymentMethod } : {}),
    });
  }

  /**
   * Credit a (customer|partner) wallet with money that has been verified elsewhere (gateway recharge, refund, bonus ...).
   */
  async creditWallet({ party = 'customer', userId, amount, category, title, idempotencyKey, referenceType = 'Wallet', referenceId = '', orderId = null, paymentMethod, ledgerType = 'CUSTOMER_WALLET_CREDIT', extraInc = {} }) {
    const amt = round2(amount);
    if (!(amt > 0)) throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid credit amount');

    const out = await this.applyOnce(
      {
        orderId,
        userId,
        accountType: party === 'partner' ? 'PARTNER_WALLET' : 'CUSTOMER_WALLET',
        type: ledgerType,
        direction: 'CREDIT',
        amount: amt,
        referenceType,
        referenceId,
        idempotencyKey,
      },
      async () => {
        const inc = party === 'partner' ? partnerWalletInc(amt) : customerWalletInc(amt);
        const user = await User.findByIdAndUpdate(userId, { $inc: { ...inc, ...extraInc } }, { new: true });
        if (!user) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'User not found');
        return { balanceBefore: round2(user.walletBalance - amt), balanceAfter: user.walletBalance };
      }
    );

    if (out.applied) {
      await this.logWalletTxn({ party, userId, type: 'Credit', category, title, amount: amt, paymentMethod }).catch((e) =>
        console.warn('Wallet txn log warning:', e.message)
      );
    }
    return out;
  }

  /**
   * Atomically debit a wallet. Fails (no change) if the balance is not sufficient.
   */
  async debitWalletStrict({ party = 'customer', userId, amount, category, title, idempotencyKey, referenceType = 'Booking', referenceId = '', orderId = null, paymentMethod, ledgerType = 'CUSTOMER_WALLET_DEBIT', extraInc = {} }) {
    const amt = round2(amount);
    if (!(amt > 0)) throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid debit amount');

    const out = await this.applyOnce(
      {
        orderId,
        userId,
        accountType: party === 'partner' ? 'PARTNER_WALLET' : 'CUSTOMER_WALLET',
        type: ledgerType,
        direction: 'DEBIT',
        amount: amt,
        referenceType,
        referenceId,
        idempotencyKey,
      },
      async () => {
        const inc = party === 'partner' ? partnerWalletInc(-amt) : customerWalletInc(-amt);
        const user = await User.findOneAndUpdate(
          { _id: userId, walletBalance: { $gte: amt } },
          { $inc: { ...inc, ...extraInc } },
          { new: true }
        );
        if (!user) {
          const current = await User.findById(userId).select('walletBalance');
          throw new ApiError(
            HTTP_STATUS.BAD_REQUEST,
            `Insufficient NOROZZ Wallet balance! Your available balance is ₹${current?.walletBalance || 0}, but required amount is ₹${amt}.`
          );
        }
        return { balanceBefore: round2(user.walletBalance + amt), balanceAfter: user.walletBalance };
      }
    );

    if (out.applied) {
      await this.logWalletTxn({ party, userId, type: 'Debit', category, title, amount: amt, paymentMethod }).catch((e) =>
        console.warn('Wallet txn log warning:', e.message)
      );
    }
    return out;
  }

  /**
   * Payment confirmed (wallet debited or gateway signature verified) -> funds held in escrow.
   * Atomic + idempotent: only the first caller flips the booking out of PAYMENT_PENDING.
   */
  async holdCustomerPayment(bookingId, paymentMethod = 'UPI') {
    const pending = await Booking.findById(bookingId);
    if (!pending) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Booking not found');

    const payable = round2(pending.financialSnapshot?.customerPayable ?? pending.amount ?? 0);

    const held = await Booking.findOneAndUpdate(
      { _id: bookingId, financialStatus: 'PAYMENT_PENDING' },
      {
        $set: {
          financialStatus: 'AMOUNT_HELD',
          paymentStatus: 'paid',
          paymentMethod,
          prepaidAmount: payable,
          paymentConfirmedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!held) {
      // Already held / settled / cancelled: idempotent no-op
      return { booking: await Booking.findById(bookingId), alreadyProcessed: true };
    }

    await this.applyOnce(
      {
        orderId: held._id,
        userId: held.customer,
        accountType: 'ESCROW_HOLD',
        type: 'CUSTOMER_PAYMENT',
        direction: 'CREDIT',
        amount: payable,
        referenceType: 'Booking',
        referenceId: held.bookingId,
        idempotencyKey: `HOLD-${held.bookingId}`,
        metadata: { paymentMethod },
      },
      async () => {
        const customer = await User.findByIdAndUpdate(held.customer, { $inc: { heldBalance: payable } }, { new: true });
        return { balanceBefore: round2((customer?.heldBalance || 0) - payable), balanceAfter: customer?.heldBalance || 0 };
      }
    );

    return { booking: held, alreadyProcessed: false };
  }

  /**
   * Service completed -> release escrow, pay partner, collect platform revenue. Runs exactly once per booking.
   *
   *  Base service  : paid by customer up-front (held). Partner receives partnerNetEarning in wallet.
   *  Extra services: collected by the partner directly on site. Partner wallet is debited the platform dues on them.
   */
  async settleBooking(bookingId) {
    const booking = await Booking.findById(bookingId);
    if (!booking) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Booking not found');

    if (booking.financialStatus === 'SETTLED') {
      return { message: 'Booking already settled', booking, alreadySettled: true };
    }

    // Only the caller that moves HELD -> SETTLEMENT_PENDING (or resumes a failed settlement) proceeds
    const locked = await Booking.findOneAndUpdate(
      { _id: bookingId, financialStatus: { $in: ['AMOUNT_HELD', 'SETTLEMENT_PENDING'] } },
      { $set: { financialStatus: 'SETTLEMENT_PENDING' } },
      { new: true }
    );
    if (!locked) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Payment for this booking has not been confirmed, so it cannot be settled.');
    }

    const snapshot = locked.financialSnapshot || {};
    const base = locked.baseFinancialSnapshot || snapshot;
    const ref = locked.bookingId;

    const prepaid = round2(locked.prepaidAmount || base.customerPayable || locked.amount || 0);
    const partnerNet = round2(base.partnerNetEarning || 0);
    const baseCommission = round2(base.partnerCommission || 0);
    const baseFee = round2(base.customerPlatformFee || 0);
    const baseNorozz = round2(base.norozzGrossRevenue || 0);

    // Extras (collected by partner on site)
    const extrasFee = Math.max(0, round2((snapshot.customerPlatformFee || 0) - baseFee));
    const extrasCommission = Math.max(0, round2((snapshot.partnerCommission || 0) - baseCommission));
    const extrasDues = round2(extrasFee + extrasCommission);
    const extrasGross = round2(locked.extraServices?.reduce((s, i) => s + Number(i.price || 0), 0) || 0);
    const extrasPartnerNet = Math.max(0, round2(extrasGross - extrasCommission));

    // 1. Customer: release escrow
    if (locked.customer) {
      await this.applyOnce(
        {
          orderId: locked._id,
          userId: locked.customer,
          accountType: 'CUSTOMER_WALLET',
          type: 'CUSTOMER_WALLET_DEBIT',
          direction: 'DEBIT',
          amount: prepaid,
          referenceType: 'Booking',
          referenceId: ref,
          idempotencyKey: `SETTLE-CUST-${ref}`,
          metadata: { note: 'Escrow released on service completion' },
        },
        async () => {
          const c = await User.findByIdAndUpdate(
            locked.customer,
            { $inc: { heldBalance: -prepaid, lifetimeSpent: prepaid + extrasGross + extrasFee } },
            { new: true }
          );
          return { balanceBefore: round2((c?.heldBalance || 0) + prepaid), balanceAfter: c?.heldBalance || 0 };
        }
      );
    }

    // 2. Partner: credit net earning for the prepaid base service
    if (locked.partner) {
      const credit = await this.applyOnce(
        {
          orderId: locked._id,
          userId: locked.partner,
          accountType: 'PARTNER_WALLET',
          type: 'PARTNER_EARNING',
          direction: 'CREDIT',
          amount: partnerNet,
          referenceType: 'Booking',
          referenceId: ref,
          idempotencyKey: `SETTLE-PARTNER-${ref}`,
          metadata: { partnerCommission: baseCommission, serviceValue: base.servicePrice || 0 },
        },
        async () => {
          const p = await User.findByIdAndUpdate(
            locked.partner,
            { $inc: { ...partnerWalletInc(partnerNet), lifetimeEarnings: partnerNet + extrasPartnerNet, totalCommissionPaid: baseCommission + extrasCommission } },
            { new: true }
          );
          return { balanceBefore: round2((p?.walletBalance || 0) - partnerNet), balanceAfter: p?.walletBalance || 0 };
        }
      );
      if (credit.applied) {
        await this.logWalletTxn({
          party: 'partner',
          userId: locked.partner,
          type: 'Credit',
          category: 'Job Earnings',
          title: `Job Net Earnings Credited (Job #${ref})`,
          amount: partnerNet,
        }).catch((e) => console.warn('Wallet txn log warning:', e.message));
      }

      // 2b. Partner: platform dues on extras the partner collected directly
      if (extrasDues > 0) {
        const dues = await this.applyOnce(
          {
            orderId: locked._id,
            userId: locked.partner,
            accountType: 'PARTNER_WALLET',
            type: 'PARTNER_COMMISSION',
            direction: 'DEBIT',
            amount: extrasDues,
            referenceType: 'Booking',
            referenceId: ref,
            idempotencyKey: `SETTLE-PARTNER-EXTRAS-${ref}`,
            metadata: { extrasFee, extrasCommission, collectedOnSite: extrasGross + extrasFee },
          },
          async () => {
            const p = await User.findByIdAndUpdate(locked.partner, { $inc: partnerWalletInc(-extrasDues) }, { new: true });
            return { balanceBefore: round2((p?.walletBalance || 0) + extrasDues), balanceAfter: p?.walletBalance || 0 };
          }
        );
        if (dues.applied) {
          await this.logWalletTxn({
            party: 'partner',
            userId: locked.partner,
            type: 'Debit',
            category: 'Service Booking',
            title: `Platform fee on extra services collected on site (Job #${ref})`,
            amount: extrasDues,
          }).catch((e) => console.warn('Wallet txn log warning:', e.message));
        }
      }
    }

    // 3. Platform revenue
    const revenue = round2(baseNorozz + extrasDues);
    await this.applyOnce(
      {
        orderId: locked._id,
        userId: null,
        accountType: 'NOROZZ_REVENUE',
        type: 'NOROZZ_REVENUE',
        direction: 'CREDIT',
        amount: Math.max(0, revenue),
        referenceType: 'Booking',
        referenceId: ref,
        idempotencyKey: `SETTLE-NOROZZ-${ref}`,
        metadata: { customerPlatformFee: baseFee + extrasFee, partnerCommission: baseCommission + extrasCommission, netRevenue: revenue },
      },
      async () => {
        const acc = await PlatformAccount.findOneAndUpdate(
          { accountName: 'Norozz Main Revenue Account' },
          {
            $inc: {
              grossCustomerFees: baseFee + extrasFee,
              grossPartnerCommissions: baseCommission + extrasCommission,
              grossRevenue: revenue,
              netPlatformRevenue: revenue,
            },
          },
          { new: true, upsert: true }
        );
        return { balanceBefore: round2((acc.grossRevenue || 0) - revenue), balanceAfter: acc.grossRevenue };
      }
    );

    const settled = await Booking.findByIdAndUpdate(
      bookingId,
      { $set: { financialStatus: 'SETTLED' } },
      { new: true }
    );

    return {
      message: 'Booking financial settlement executed successfully!',
      financialStatus: 'SETTLED',
      breakdown: {
        customerPayable: prepaid + extrasGross + extrasFee,
        partnerNetEarning: partnerNet + extrasPartnerNet,
        partnerCommission: baseCommission + extrasCommission,
        customerPlatformFee: baseFee + extrasFee,
        norozzGrossRevenue: revenue,
      },
      booking: settled,
    };
  }

  /**
   * Refund a held (escrowed) booking payment back to the customer wallet.
   * `refundPlatformFee=false` keeps the platform fee as revenue (customer-initiated cancellation).
   */
  async refundHeldPayment(booking, { refundPlatformFee = false, reason = 'Booking cancelled' } = {}) {
    const prepaid = round2(booking.prepaidAmount || booking.financialSnapshot?.customerPayable || booking.amount || 0);
    const fee = round2((booking.baseFinancialSnapshot || booking.financialSnapshot)?.customerPlatformFee || 0);
    const refund = round2(Math.max(0, refundPlatformFee ? prepaid : prepaid - fee));
    const retained = round2(prepaid - refund);
    const ref = booking.bookingId;

    // Release escrow
    await this.applyOnce(
      {
        orderId: booking._id,
        userId: booking.customer,
        accountType: 'ESCROW_HOLD',
        type: 'REFUND',
        direction: 'DEBIT',
        amount: prepaid,
        referenceType: 'Booking',
        referenceId: ref,
        idempotencyKey: `REFUND-ESCROW-${ref}`,
        metadata: { reason },
      },
      async () => {
        const c = await User.findByIdAndUpdate(booking.customer, { $inc: { heldBalance: -prepaid } }, { new: true });
        return { balanceBefore: round2((c?.heldBalance || 0) + prepaid), balanceAfter: c?.heldBalance || 0 };
      }
    );

    if (refund > 0) {
      await this.creditWallet({
        party: 'customer',
        userId: booking.customer,
        amount: refund,
        category: 'Refund',
        title: `Refund for Cancelled Service (${booking.packageName || 'Service Package'})`,
        idempotencyKey: `REFUND-WALLET-${ref}`,
        referenceType: 'Booking',
        referenceId: ref,
        orderId: booking._id,
        paymentMethod: 'NOROZZ Wallet',
        ledgerType: 'REFUND',
      });
    }

    if (retained > 0) {
      await this.applyOnce(
        {
          orderId: booking._id,
          userId: null,
          accountType: 'NOROZZ_REVENUE',
          type: 'CANCELLATION_CHARGE',
          direction: 'CREDIT',
          amount: retained,
          referenceType: 'Booking',
          referenceId: ref,
          idempotencyKey: `REFUND-RETAINED-${ref}`,
          metadata: { reason: 'Non-refundable platform fee retained' },
        },
        async () => {
          const acc = await PlatformAccount.findOneAndUpdate(
            { accountName: 'Norozz Main Revenue Account' },
            { $inc: { grossCustomerFees: retained, grossRevenue: retained, netPlatformRevenue: retained } },
            { new: true, upsert: true }
          );
          return { balanceBefore: round2((acc.grossRevenue || 0) - retained), balanceAfter: acc.grossRevenue };
        }
      );
    }

    await PlatformAccount.findOneAndUpdate(
      { accountName: 'Norozz Main Revenue Account' },
      { $inc: { totalRefundsAdjusted: refund } },
      { upsert: true }
    );

    return { refund, retained };
  }

  /**
   * Partner withdrawal REQUEST. Funds move wallet -> withdrawalPending atomically and the request is recorded as Pending.
   * Actual bank payout is executed by finance/admin (or a payout provider) and is not simulated here.
   */
  async processPartnerWithdrawal(partnerId, amount) {
    const numAmount = round2(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Please enter a valid withdrawal amount');
    }

    const partner = await User.findById(partnerId).select('bankDetails kycStatus status role');
    if (!partner || partner.role !== 'partner') throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Partner not found');
    if (partner.kycStatus !== 'approved' || partner.status !== 'active') {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Withdrawals are available only for active, KYC-approved partners.');
    }
    const bank = partner.bankDetails || {};
    if (!bank.accountNumber && !bank.upiId) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Please add your bank account or UPI ID before requesting a withdrawal.');
    }

    const txnId = `TXN-WTH-${Date.now()}-${rid()}`;

    const out = await this.applyOnce(
      {
        userId: partnerId,
        accountType: 'PARTNER_WALLET',
        type: 'WITHDRAWAL',
        direction: 'DEBIT',
        amount: numAmount,
        referenceType: 'Withdrawal',
        referenceId: txnId,
        idempotencyKey: `WITHDRAW-${txnId}`,
        metadata: { bankName: bank.bankName || '', upiId: bank.upiId || '' },
      },
      async () => {
        const p = await User.findOneAndUpdate(
          { _id: partnerId, walletBalance: { $gte: numAmount } },
          { $inc: { ...partnerWalletInc(-numAmount), withdrawalPending: numAmount } },
          { new: true }
        );
        if (!p) {
          const cur = await User.findById(partnerId).select('walletBalance');
          throw new ApiError(
            HTTP_STATUS.BAD_REQUEST,
            `Insufficient wallet balance. Available: ₹${Number(cur?.walletBalance || 0).toLocaleString('en-IN')}`
          );
        }
        return { balanceBefore: round2(p.walletBalance + numAmount), balanceAfter: p.walletBalance };
      }
    );

    await WalletTransaction.create({
      transactionId: txnId,
      partnerId,
      type: 'Debit',
      category: 'Bank Withdrawal',
      title: `Withdrawal request to ${bank.bankName || bank.upiId || 'your bank account'}`,
      amount: numAmount,
      status: 'Pending',
    });

    const updated = await User.findById(partnerId).select('walletBalance withdrawableBalance availableBalance');
    return {
      message: `Withdrawal request of ₹${numAmount.toLocaleString('en-IN')} submitted. It will be transferred to your account after processing.`,
      walletBalance: updated.walletBalance,
      withdrawableBalance: updated.withdrawableBalance,
      availableBalance: updated.availableBalance,
      transactionId: txnId,
      status: 'Pending',
      applied: out.applied,
    };
  }

  async getFinancialOverview() {
    const platformAccount = await this.getOrCreatePlatformAccount();
    const ledgerCount = await LedgerEntry.countDocuments();
    const settledBookingsCount = await Booking.countDocuments({ financialStatus: 'SETTLED' });

    const [gbv] = await Booking.aggregate([
      { $match: { financialStatus: 'SETTLED' } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$prepaidAmount', '$amount'] } } } },
    ]);

    const customerAgg = await User.aggregate([
      { $match: { role: 'customer' } },
      { $group: { _id: null, totalAvailable: { $sum: '$walletBalance' }, totalHeld: { $sum: '$heldBalance' } } },
    ]);
    const partnerAgg = await User.aggregate([
      { $match: { role: 'partner' } },
      { $group: { _id: null, totalWithdrawable: { $sum: '$walletBalance' }, totalEarned: { $sum: '$lifetimeEarnings' }, totalPending: { $sum: '$withdrawalPending' } } },
    ]);

    const grossCustomerFees = platformAccount.grossCustomerFees || 0;
    const grossPartnerCommissions = platformAccount.grossPartnerCommissions || 0;
    const grossRevenue = platformAccount.grossRevenue || 0;
    const refunds = platformAccount.totalRefundsAdjusted || 0;
    const gatewayFees = platformAccount.totalGatewayFees || 0;
    const partnerTotalEarned = partnerAgg[0]?.totalEarned || 0;

    return {
      overview: {
        grossBookingValue: gbv?.total || 0,
        customerPlatformFees: grossCustomerFees,
        partnerCommissions: grossPartnerCommissions,
        grossPlatformRevenue: grossRevenue,
        refunds,
        gatewayFees,
        netPlatformRevenue: (platformAccount.netPlatformRevenue || 0) - gatewayFees,
      },
      partnerMetrics: {
        partnerGrossEarnings: partnerTotalEarned + grossPartnerCommissions,
        partnerCommissionsPaid: grossPartnerCommissions,
        partnerNetEarnings: partnerTotalEarned,
        pendingPartnerPayout: partnerAgg[0]?.totalPending || 0,
        partnerWalletLiability: partnerAgg[0]?.totalWithdrawable || 0,
      },
      customerMetrics: {
        customerWalletLiability: customerAgg[0]?.totalAvailable || 0,
        customerHeldEscrow: customerAgg[0]?.totalHeld || 0,
        customerRefunds: refunds,
      },
      ledgerInfo: {
        totalLedgerEntries: ledgerCount,
        settledBookingsCount,
      },
    };
  }
}

export const financialEngineService = new FinancialEngineService();
