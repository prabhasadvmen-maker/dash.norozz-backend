import crypto from 'crypto';
import { Payment } from '../models/payment.model.js';
import { Booking } from '../models/booking.model.js';
import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { ROLES } from '../constants/roles.constant.js';
import { financialEngineService } from './financialEngine.service.js';
import { paymentGatewayService } from './paymentGateway.service.js';

const ADMIN_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.CITY_ADMIN];
const MIN_RECHARGE = 10;
const MAX_RECHARGE = 50000;
const rid = () => crypto.randomBytes(4).toString('hex').toUpperCase();

export class PaymentService {
  generateTxnId() {
    return `TXN-${Date.now()}-${rid()}`;
  }

  generateInvoiceNo() {
    return `INV-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}${crypto.randomInt(10, 100)}`;
  }

  /**
   * 1. Create a gateway order.
   *    - booking_payment : the amount is ALWAYS taken from the booking in the database
   *    - wallet_recharge : client amount, bounded
   */
  async createGatewayOrder(user, amount, type = 'booking_payment', bookingId = null) {
    let payable;
    let booking = null;

    if (type === 'booking_payment') {
      if (!bookingId) throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'bookingId is required for a booking payment');
      booking = await Booking.findById(bookingId);
      if (!booking || String(booking.customer) !== String(user._id)) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Booking not found');
      }
      if (booking.financialStatus !== 'PAYMENT_PENDING' || booking.status !== 'Pending') {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'This booking is not awaiting payment.');
      }
      payable = Number(booking.amount);
      if (!(payable > 0)) throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Nothing to pay for this booking.');
    } else if (type === 'wallet_recharge') {
      payable = Number(amount);
      if (!Number.isFinite(payable) || payable < MIN_RECHARGE) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, `Minimum amount to add is ₹${MIN_RECHARGE}.`);
      }
      if (payable > MAX_RECHARGE) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, `Maximum limit per transaction is ₹${MAX_RECHARGE.toLocaleString('en-IN')}.`);
      }
    } else {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid payment type');
    }

    const transactionId = this.generateTxnId();
    const order = await paymentGatewayService.createOrder({
      amountRupees: payable,
      receipt: transactionId,
      notes: { type, bookingId: bookingId ? String(bookingId) : '', userId: String(user._id) },
    });

    const payment = await Payment.create({
      transactionId,
      orderId: order.orderId,
      user: user._id,
      booking: booking ? booking._id : null,
      type,
      amount: payable,
      currency: 'INR',
      paymentMethod: 'Razorpay',
      status: 'Pending',
    });

    return {
      mode: order.mode,
      keyId: order.keyId,
      orderId: order.orderId,
      transactionId,
      amount: Math.round(payable * 100), // paise, for the checkout SDK
      amountRupees: payable,
      currency: 'INR',
      user: { name: user.name, email: user.email, phone: user.phone },
      paymentId: payment._id,
    };
  }

  /**
   * 2. Verify the gateway payment and apply its effect (confirm booking / credit wallet). Idempotent.
   */
  async verifyBookingPayment(user, transactionId, paymentId = '', signature = '') {
    const payment = await Payment.findOne({ transactionId, user: user._id });
    if (!payment) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Payment transaction record not found');

    if (payment.status === 'Success') {
      return { message: 'Payment already verified', payment, alreadyProcessed: true };
    }
    if (payment.status !== 'Pending') {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, `Payment is ${payment.status.toLowerCase()} and cannot be verified.`);
    }

    const valid = paymentGatewayService.verifySignature({ orderId: payment.orderId, paymentId, signature });
    if (!valid) {
      await Payment.updateOne({ _id: payment._id, status: 'Pending' }, { $set: { status: 'Failed', gatewayResponse: { verified: false, at: new Date() } } });
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid payment signature. If money was deducted it will be refunded automatically.');
    }

    // Only the first verifier wins -> no double credit
    const locked = await Payment.findOneAndUpdate(
      { _id: payment._id, status: 'Pending' },
      {
        $set: {
          status: 'Success',
          paymentId: paymentId || `pay_sim_${rid()}`,
          invoiceNumber: this.generateInvoiceNo(),
          gatewayResponse: { verified: true, timestamp: new Date() },
        },
      },
      { new: true }
    );
    if (!locked) return { message: 'Payment already verified', payment: await Payment.findById(payment._id), alreadyProcessed: true };

    if (locked.type === 'booking_payment' && locked.booking) {
      const { bookingService } = await import('./booking.service.js');
      await bookingService.confirmBookingPayment(locked.booking, locked.paymentMethod || 'Online');
    } else if (locked.type === 'wallet_recharge') {
      await financialEngineService.creditWallet({
        party: user.role === ROLES.PARTNER ? 'partner' : 'customer',
        userId: user._id,
        amount: locked.amount,
        category: 'Added to Wallet',
        title: 'Added to wallet via online payment',
        idempotencyKey: `RECHARGE-${locked.transactionId}`,
        referenceType: 'Payment',
        referenceId: locked.transactionId,
        paymentMethod: 'Online',
      });
    }

    return { message: 'Payment verified and transaction successful', payment: locked };
  }

  /**
   * 3. Pay for a booking from the NOROZZ wallet. The amount is the booking's amount, never a client value.
   */
  async processWalletPayment(user, bookingId) {
    const booking = await Booking.findById(bookingId);
    if (!booking || String(booking.customer) !== String(user._id)) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Booking not found');
    }
    if (booking.financialStatus !== 'PAYMENT_PENDING' || booking.status !== 'Pending') {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'This booking is not awaiting payment.');
    }

    const amount = Number(booking.amount);
    const transactionId = this.generateTxnId();

    // Atomic debit (fails with no change when the balance is insufficient)
    await financialEngineService.debitWalletStrict({
      party: 'customer',
      userId: user._id,
      amount,
      category: 'Service Booking',
      title: `Service Payment (${booking.packageName || 'Home Service'})`,
      idempotencyKey: `WALLET-PAY-${booking.bookingId}`,
      referenceType: 'Booking',
      referenceId: booking.bookingId,
      orderId: booking._id,
      paymentMethod: 'NOROZZ Wallet',
    });

    const payment = await Payment.create({
      transactionId,
      user: user._id,
      booking: booking._id,
      type: 'booking_payment',
      amount,
      currency: 'INR',
      paymentMethod: 'Wallet',
      status: 'Success',
      invoiceNumber: this.generateInvoiceNo(),
    });

    const { bookingService } = await import('./booking.service.js');
    await bookingService.confirmBookingPayment(booking._id, 'Wallet');

    const fresh = await Booking.findById(booking._id);
    return {
      message: `🎉 ₹${amount} paid successfully via NOROZZ Wallet!`,
      walletBalance: (await (await import('../models/user.model.js')).User.findById(user._id).select('walletBalance')).walletBalance,
      payment,
      booking: fresh,
    };
  }

  /**
   * 4. Admin refund of a successful booking payment to the customer's wallet.
   */
  async processRefund(adminUser, paymentIdOrTxnId, reason = 'Refund by admin') {
    if (!adminUser || !ADMIN_ROLES.includes(adminUser.role)) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Only admins can issue refunds.');
    }
    const isId = /^[0-9a-fA-F]{24}$/.test(String(paymentIdOrTxnId));
    const payment = await Payment.findOne(isId ? { $or: [{ _id: paymentIdOrTxnId }, { transactionId: paymentIdOrTxnId }] } : { transactionId: paymentIdOrTxnId });
    if (!payment) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Payment record not found');
    if (payment.type !== 'booking_payment' || payment.status !== 'Success') {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Only successful booking payments can be refunded.');
    }

    const locked = await Payment.findOneAndUpdate({ _id: payment._id, status: 'Success' }, { $set: { status: 'Refunded' } }, { new: true });
    if (!locked) throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Payment has already been refunded');

    try {
      const booking = locked.booking ? await Booking.findById(locked.booking) : null;
      if (booking) {
        if (booking.financialStatus === 'SETTLED' || booking.financialStatus === 'SETTLEMENT_PENDING') {
          throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'This booking is already settled with the partner. Use the dispute process instead.');
        }
        if (booking.financialStatus === 'AMOUNT_HELD') {
          const { bookingService } = await import('./booking.service.js');
          await bookingService.cancelBooking(booking._id, adminUser, reason);
        }
      } else {
        await financialEngineService.creditWallet({
          userId: locked.user,
          amount: locked.amount,
          category: 'Refund',
          title: 'Payment refund',
          idempotencyKey: `ADMIN-REFUND-${locked.transactionId}`,
          referenceType: 'Payment',
          referenceId: locked.transactionId,
          ledgerType: 'REFUND',
        });
      }
    } catch (err) {
      await Payment.updateOne({ _id: locked._id }, { $set: { status: 'Success' } });
      throw err;
    }

    const refundLog = await Payment.create({
      transactionId: this.generateTxnId(),
      user: locked.user,
      booking: locked.booking,
      type: 'refund',
      amount: locked.amount,
      currency: locked.currency,
      paymentMethod: 'Wallet',
      status: 'Refunded',
      invoiceNumber: this.generateInvoiceNo(),
      gatewayResponse: { reason, by: String(adminUser._id) },
    });

    return { message: `Refund processed to customer wallet`, payment: locked, refundLog };
  }

  // 5. TRANSACTION HISTORY (own transactions only)
  async getTransactionHistory(userId, type = null) {
    const filter = { user: userId };
    if (type && type !== 'all') filter.type = type;
    return Payment.find(filter).sort({ createdAt: -1 }).limit(200);
  }

  // 6. INVOICE (owner or admin). Prices are GST-inclusive.
  async generateInvoice(paymentId, user) {
    if (!/^[0-9a-fA-F]{24}$/.test(String(paymentId))) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Payment transaction not found for invoice');
    const payment = await Payment.findById(paymentId)
      .populate('user', 'name email phone address city')
      .populate('booking');
    if (!payment) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Payment transaction not found for invoice');
    if (String(payment.user?._id) !== String(user._id) && !ADMIN_ROLES.includes(user.role)) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, 'You do not have access to this invoice');
    }

    const gstRate = Number(process.env.GST_RATE || 18);
    const grandTotal = payment.amount;
    const subTotal = Math.round((grandTotal / (1 + gstRate / 100)) * 100) / 100;
    const gstAmount = Math.round((grandTotal - subTotal) * 100) / 100;

    return {
      invoiceNumber: payment.invoiceNumber || this.generateInvoiceNo(),
      invoiceDate: payment.createdAt,
      platform: {
        name: process.env.COMPANY_NAME || 'NOROZZ',
        gstin: process.env.COMPANY_GSTIN || '',
        address: process.env.COMPANY_ADDRESS || '',
        supportEmail: process.env.SUPPORT_EMAIL || '',
      },
      customer: {
        name: payment.user?.name || 'Customer',
        email: payment.user?.email || '',
        phone: payment.user?.phone || '',
        city: payment.user?.city || '',
      },
      transaction: {
        transactionId: payment.transactionId,
        paymentId: payment.paymentId,
        paymentMethod: payment.paymentMethod,
        status: payment.status,
      },
      items: [{ description: payment.booking?.packageName || 'Home Service Package', qty: 1, rate: subTotal, amount: subTotal }],
      tax: { gstRate: `${gstRate}%`, gstAmount, inclusive: true },
      subTotal,
      grandTotal,
    };
  }
}

export const paymentService = new PaymentService();
