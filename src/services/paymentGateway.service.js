import crypto from 'crypto';
import axios from 'axios';
import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

/**
 * Razorpay gateway wrapper.
 *
 * Modes:
 *  - live      : RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET configured -> real orders + HMAC signature verification
 *  - simulated : no keys AND NODE_ENV !== 'production' -> local development only, no money moves
 *  - disabled  : no keys AND NODE_ENV === 'production' -> online payments are refused (fail closed)
 */
const keyId = () => process.env.RAZORPAY_KEY_ID || '';
const keySecret = () => process.env.RAZORPAY_KEY_SECRET || '';

export const getGatewayMode = () => {
  if (keyId() && keySecret()) return 'live';
  if (process.env.NODE_ENV === 'production') return 'disabled';
  return 'simulated';
};

export const assertGatewayAvailable = () => {
  if (getGatewayMode() === 'disabled') {
    throw new ApiError(
      HTTP_STATUS.SERVICE_UNAVAILABLE || 503,
      'Online payments are temporarily unavailable. Please use your NOROZZ Wallet or try again later.'
    );
  }
};

export const paymentGatewayService = {
  mode: getGatewayMode,
  assertGatewayAvailable,

  /**
   * Creates a gateway order. Amount is in rupees; Razorpay needs paise.
   */
  async createOrder({ amountRupees, receipt, notes = {} }) {
    assertGatewayAvailable();
    const mode = getGatewayMode();

    if (mode === 'simulated') {
      return {
        mode,
        orderId: `order_sim_${crypto.randomBytes(6).toString('hex')}`,
        keyId: 'rzp_test_simulated',
      };
    }

    try {
      const res = await axios.post(
        'https://api.razorpay.com/v1/orders',
        {
          amount: Math.round(Number(amountRupees) * 100),
          currency: 'INR',
          receipt: String(receipt).slice(0, 40),
          notes,
        },
        { auth: { username: keyId(), password: keySecret() }, timeout: 15000 }
      );
      return { mode, orderId: res.data.id, keyId: keyId() };
    } catch (err) {
      console.error('Razorpay order creation failed:', err.response?.data || err.message);
      throw new ApiError(HTTP_STATUS.BAD_GATEWAY || 502, 'Could not initiate payment with the gateway. Please try again.');
    }
  },

  /**
   * Verifies the checkout signature. In simulated mode (dev only) any call is accepted.
   */
  verifySignature({ orderId, paymentId, signature }) {
    assertGatewayAvailable();
    if (getGatewayMode() === 'simulated') return true;

    if (!orderId || !paymentId || !signature) return false;
    const expected = crypto.createHmac('sha256', keySecret()).update(`${orderId}|${paymentId}`).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(String(signature));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  },
};
