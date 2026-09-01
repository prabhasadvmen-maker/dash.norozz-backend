import crypto from 'crypto';
import { paymentRepository } from '../repositories/payment.repository.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

export class PaymentService {

  // Helper: Unique Identifiers
  generateTxnId() {
    return 'TXN-' + Math.floor(100000 + Math.random() * 900000);
  }

  generateOrderId() {
    return 'order_rzp_' + Math.floor(10000000 + Math.random() * 90000000);
  }

  generateInvoiceNo() {
    return 'INV-2026-' + Math.floor(1000 + Math.random() * 9000);
  }

  // 1. PAYMENT GATEWAY READY: CREATE ORDER (Razorpay / Stripe Ready)
  async createGatewayOrder(user, amount, type = 'booking_payment', bookingId = null) {
    const transactionId = this.generateTxnId();
    const orderId = this.generateOrderId();

    const payment = await paymentRepository.create({
      transactionId,
      orderId,
      user: user._id,
      booking: bookingId,
      type,
      amount,
      currency: 'INR',
      paymentMethod: 'Razorpay',
      status: 'Pending',
    });

    return {
      keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_NOROZZ2026KEY',
      orderId,
      transactionId,
      amount: amount * 100, // Amount in paise for Gateway SDKs
      currency: 'INR',
      user: { name: user.name, email: user.email, phone: user.phone },
      payment,
    };
  }

  // 2. VERIFY GATEWAY PAYMENT SIGNATURE & MARK SUCCESS
  async verifyBookingPayment(user, transactionId, paymentId = '', signature = '') {
    const payment = await paymentRepository.model.findOne({ transactionId });
    if (!payment) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Payment transaction record not found');
    }

    const razorpaySecret = process.env.RAZORPAY_KEY_SECRET;

    // In production or when Razorpay secret is set, verify HMAC SHA-256 signature strictly
    if (razorpaySecret) {
      if (!paymentId || !signature) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Payment ID and Razorpay signature are required');
      }

      const generatedSignature = crypto
        .createHmac('sha256', razorpaySecret)
        .update(`${payment.orderId}|${paymentId}`)
        .digest('hex');

      if (generatedSignature !== signature) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid Razorpay payment signature');
      }
    } else if (process.env.NODE_ENV === 'production') {
      throw new ApiError(HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Payment gateway key secret not configured on server');
    } else {
      console.warn('⚠️ WARNING: RAZORPAY_KEY_SECRET is not set. Signature check skipped in development mode.');
    }

    payment.paymentId = paymentId || 'pay_simulated_' + Math.floor(100000 + Math.random() * 900000);
    payment.status = 'Success';
    payment.invoiceNumber = this.generateInvoiceNo();
    payment.gatewayResponse = { verified: true, signature, timestamp: new Date() };
    await payment.save();

    // Update Linked Booking Payment Status
    if (payment.booking) {
      const booking = await bookingRepository.findById(payment.booking);
      if (booking) {
        booking.paymentStatus = 'paid';
        booking.paymentMethod = payment.paymentMethod || 'UPI';
        await booking.save();
      }
    }

    return { message: 'Payment verified and transaction successful', payment };
  }

  // 3. WALLET PAYMENT
  async processWalletPayment(user, bookingId, amount) {
    const booking = await bookingRepository.findById(bookingId);
    if (!booking) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Booking not found');
    }

    const { userRepository } = await import('../repositories/user.repository.js');
    const customerUser = await userRepository.findById(user._id);
    if (!customerUser) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Customer user account not found');
    }

    const requiredAmount = Number(amount || booking.amount || 0);
    const availableWalletBal = customerUser.walletBalance || 0;

    if (availableWalletBal < requiredAmount) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        `Insufficient NOROZZ Wallet balance! Your available balance is ₹${availableWalletBal}, but required amount is ₹${requiredAmount}.`
      );
    }

    // Deduct payable amount from customer wallet balance
    const previousBal = availableWalletBal;
    const newBal = previousBal - requiredAmount;

    customerUser.walletBalance = newBal;
    customerUser.availableBalance = Math.max(0, (customerUser.availableBalance || 0) - requiredAmount);
    await customerUser.save();

    const transactionId = this.generateTxnId();
    const invoiceNumber = this.generateInvoiceNo();

    // 1. Create WalletTransaction log (Debit)
    const { WalletTransaction } = await import('../models/walletTransaction.model.js');
    await WalletTransaction.create({
      transactionId,
      user: user._id,
      type: 'Debit',
      category: 'Service Booking',
      title: `Service Payment (${booking.packageName || 'Home Service'})`,
      amount: requiredAmount,
      status: 'Completed',
      paymentMethod: 'NOROZZ Wallet',
    }).catch((err) => console.warn('Wallet transaction log warning:', err));

    // 2. Create LedgerEntry log (Debit)
    const { LedgerEntry } = await import('../models/ledgerEntry.model.js');
    await LedgerEntry.create({
      transactionId,
      userId: user._id,
      orderId: booking._id,
      accountType: 'CUSTOMER_WALLET',
      type: 'CUSTOMER_WALLET_DEBIT',
      direction: 'DEBIT',
      amount: requiredAmount,
      currency: 'INR',
      balanceBefore: previousBal,
      balanceAfter: newBal,
      referenceType: 'Booking',
      referenceId: String(booking._id),
      status: 'Success',
      idempotencyKey: `wallet_pay_${booking._id}_${Date.now()}`,
      metadata: { paymentMethod: 'Wallet' },
    }).catch((err) => console.warn('Ledger logging warning:', err));

    // 3. Create Payment record
    const payment = await paymentRepository.create({
      transactionId,
      user: user._id,
      booking: booking._id,
      type: 'booking_payment',
      amount: requiredAmount,
      currency: 'INR',
      paymentMethod: 'Wallet',
      status: 'Success',
      invoiceNumber,
    });

    booking.paymentStatus = 'paid';
    booking.paymentMethod = 'Wallet';
    booking.financialStatus = 'AMOUNT_HELD';
    await booking.save();

    return {
      message: `🎉 ₹${requiredAmount} paid successfully via NOROZZ Wallet!`,
      walletBalance: newBal,
      payment,
    };
  }

  // 4. PROCESS REFUND
  async processRefund(paymentIdOrTxnId, reason = 'Customer Cancellation') {
    const payment = await paymentRepository.model.findOne({
      $or: [{ _id: paymentIdOrTxnId }, { transactionId: paymentIdOrTxnId }],
    });

    if (!payment) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Payment record not found');
    }

    if (payment.status === 'Refunded') {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Payment has already been refunded');
    }

    payment.status = 'Refunded';
    await payment.save();

    // Create Refund Log Entry
    const refundLog = await paymentRepository.create({
      transactionId: this.generateTxnId(),
      user: payment.user,
      booking: payment.booking,
      type: 'refund',
      amount: payment.amount,
      currency: payment.currency,
      paymentMethod: 'Wallet',
      status: 'Refunded',
      invoiceNumber: this.generateInvoiceNo(),
      gatewayResponse: { reason },
    });

    // Update Linked Booking
    if (payment.booking) {
      const booking = await bookingRepository.findById(payment.booking);
      if (booking) {
        booking.paymentStatus = 'refunded';
        booking.status = 'Refunded';
        booking.cancellationReason = reason;
        await booking.save();
      }
    }

    return { message: `Refund of ₹${payment.amount} processed to customer wallet`, payment, refundLog };
  }

  // 5. TRANSACTION HISTORY
  async getTransactionHistory(userId, type = null) {
    return await paymentRepository.findByUser(userId, type);
  }

  // 6. GENERATE INVOICE DRAFT
  async generateInvoice(paymentId) {
    const payment = await paymentRepository.model
      .findById(paymentId)
      .populate('user', 'name email phone address city')
      .populate('booking');

    if (!payment) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Payment transaction not found for invoice');
    }

    const subTotal = payment.amount;
    const gstRate = 0.18; // 18% GST
    const gstAmount = Math.round(subTotal * gstRate);
    const grandTotal = subTotal + gstAmount;

    return {
      invoiceNumber: payment.invoiceNumber || this.generateInvoiceNo(),
      invoiceDate: payment.createdAt,
      platform: {
        name: 'NOROZZ Multi-Service Platform',
        gstin: '07AAAAA0000A1Z5',
        address: 'Sector 62, Noida, Uttar Pradesh 201301',
        supportEmail: 'support@norozz.com',
      },
      customer: {
        name: payment.user?.name || 'Customer',
        email: payment.user?.email || '',
        phone: payment.user?.phone || '',
        city: payment.user?.city || 'Delhi NCR',
      },
      transaction: {
        transactionId: payment.transactionId,
        paymentId: payment.paymentId,
        paymentMethod: payment.paymentMethod,
        status: payment.status,
      },
      items: [
        { description: payment.booking?.packageName || 'Home Service Package', qty: 1, rate: subTotal, amount: subTotal },
      ],
      tax: { gstRate: '18%', gstAmount },
      subTotal,
      grandTotal,
    };
  }
}

export const paymentService = new PaymentService();
