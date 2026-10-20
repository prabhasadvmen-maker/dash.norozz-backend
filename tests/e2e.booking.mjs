/**
 * End-to-end regression test for the NOROZZ booking lifecycle.
 *
 *   customer -> booking -> payment -> dispatch -> partner claim -> OTP -> extras -> completion -> settlement
 *   + cancellations/refunds, access control, concurrency (double-spend / double-claim) and realtime sockets.
 *
 * Runs against a THROWAWAY database. Never point TEST_MONGODB_URI at production.
 *
 *   TEST_MONGODB_URI=mongodb://127.0.0.1:27999/norozz_e2e node tests/e2e.booking.mjs
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const MONGO = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27999/norozz_e2e';
if (/mongodb\.net|atlas/i.test(MONGO)) throw new Error('Refusing to run the e2e test against a hosted database');

// Environment must be fixed BEFORE the app is imported (dotenv never overrides values that are already set)
Object.assign(process.env, {
  NODE_ENV: 'development',
  MONGODB_URI: MONGO,
  ACCESS_TOKEN_SECRET: 'e2e_access_secret',
  REFRESH_TOKEN_SECRET: 'e2e_refresh_secret',
  ACCESS_TOKEN_EXPIRY: '1h',
  RAZORPAY_KEY_ID: '',
  RAZORPAY_KEY_SECRET: '',
  BREVO_API_KEY: '',
  EMAIL_ENABLED: 'false',
  USE_BREVO: 'false',
  APITXT_API_KEY: '',
  TWILIO_ACCOUNT_SID: '',
  TWILIO_AUTH_TOKEN: '',
  TWILIO_PHONE_NUMBER: '',
  ZOOP_API_KEY: '',
  ZOOP_APP_ID: '',
});

const { default: mongoose } = await import('mongoose');
const { default: app } = await import('../src/app.js');
const { initSockets } = await import('../src/sockets/index.js');
const { bookingService } = await import('../src/services/booking.service.js');
const { User } = await import('../src/models/user.model.js');
const { City } = await import('../src/models/city.model.js');
const { Category } = await import('../src/models/category.model.js');
const { Service } = await import('../src/models/service.model.js');
const { SubCategory } = await import('../src/models/subCategory.model.js');
const { ServicePackage } = await import('../src/models/servicePackage.model.js');
const { Booking } = await import('../src/models/booking.model.js');
const { Coupon } = await import('../src/models/coupon.model.js');
const { SystemSettings } = await import('../src/models/systemSettings.model.js');
const { LedgerEntry } = await import('../src/models/ledgerEntry.model.js');
const { PlatformAccount } = await import('../src/models/platformAccount.model.js');
const { Review } = await import('../src/models/review.model.js');

await mongoose.connect(MONGO, { serverSelectionTimeoutMS: 5000 });
await mongoose.connection.dropDatabase();

const server = http.createServer(app);
initSockets(server);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/api`;

// ─────────────────────────── helpers ───────────────────────────
const results = [];
const test = async (name, fn) => {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✅ ${name}`);
  } catch (err) {
    results.push({ name, ok: false, err });
    console.log(`  ❌ ${name}\n     ${err.message.split('\n').join('\n     ')}`);
  }
};

const api = async (method, url, token, body) => {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = {};
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json, data: json.data };
};

const tok = (u) => u.generateAccessToken();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fresh = (id) => User.findById(id);

// ─────────────────────────── fixtures ───────────────────────────
await SystemSettings.create({ key: 'global_settings', customerPlatformFeePercent: 5, partnerPlatformFeePercent: 10, partnerCancellationPenaltyAmount: 100, maxDailyFreeCancellations: 3 });
const city = await City.create({ name: 'Testville', state: 'TS' });
const category = await Category.create({ name: 'Plumbing', slug: 'plumbing' });
const otherCategory = await Category.create({ name: 'Painting', slug: 'painting' });
const subCategory = await SubCategory.create({ category: category._id, name: 'Taps', slug: 'taps' });
const service = await Service.create({ category: category._id, subCategory: subCategory._id, name: 'Tap Repair', slug: 'tap-repair', price: 1000, finalPrice: 1000, duration: '45 mins', status: 'active' });
const extraService = await Service.create({ category: category._id, subCategory: subCategory._id, name: 'Pipe Cleaning', slug: 'pipe-cleaning', price: 200, finalPrice: 200, status: 'active' });
const pkg = await ServicePackage.create({ service: service._id, title: 'Standard', slug: 'standard', price: 1000, finalPrice: 1000, status: 'active' });

const mkUser = (extra) => User.create({ password: 'Passw0rd!x', isPhoneVerified: true, ...extra });
const customer = await mkUser({ name: 'Cust One', role: 'customer', phone: '+919000000001', email: 'c1@e2e.test', city: 'Testville' });
const customer2 = await mkUser({ name: 'Cust Two', role: 'customer', phone: '+919000000002', email: 'c2@e2e.test', city: 'Testville' });
const partnerBase = { role: 'partner', status: 'active', kycStatus: 'approved', isOnline: true, isAvailable: true, city: 'Testville', category: category._id, categories: [category._id], offeredServices: [service._id, extraService._id], bankDetails: { accountNumber: '1234567890', bankName: 'TestBank', ifscCode: 'TEST0000001' } };
const partner1 = await mkUser({ ...partnerBase, name: 'Partner One', phone: '+919100000001', email: 'p1@e2e.test' });
const partner2 = await mkUser({ ...partnerBase, name: 'Partner Two', phone: '+919100000002', email: 'p2@e2e.test' });
const partnerOtherCat = await mkUser({ ...partnerBase, name: 'Partner Painter', phone: '+919100000003', email: 'p3@e2e.test', category: otherCategory._id, categories: [otherCategory._id], offeredServices: [] });
const partnerOtherCity = await mkUser({ ...partnerBase, name: 'Partner Faraway', phone: '+919100000004', email: 'p4@e2e.test', city: 'Elsewhere' });
const partnerPending = await mkUser({ ...partnerBase, name: 'Partner Pending KYC', phone: '+919100000005', email: 'p5@e2e.test', kycStatus: 'pending' });
const admin = await mkUser({ name: 'City Admin', role: 'cityAdmin', email: 'ca@e2e.test', phone: '+919200000001', assignedCity: city._id, city: 'Testville' });
const superAdmin = await mkUser({ name: 'Super', role: 'superadmin', email: 'sa@e2e.test', phone: '+919200000002' });
await Coupon.create({ code: 'SAVE100', title: 'Save 100', discountType: 'fixed', discountValue: 100, usageLimitPerUser: 1 });

const T = { c1: tok(customer), c2: tok(customer2), p1: tok(partner1), p2: tok(partner2), p3: tok(partnerOtherCat), p4: tok(partnerOtherCity), p5: tok(partnerPending), admin: tok(admin), sa: tok(superAdmin) };

const bookingBody = (over = {}) => ({
  category: String(category._id), service: String(service._id), packageId: String(pkg._id),
  addressLine: '12 Test Street', city: 'Testville', pincode: '110001',
  locationCoordinates: { lat: 26.85, lng: 80.95 }, bookingDate: new Date().toISOString(),
  timeSlot: '10:00 AM - 11:00 AM', paymentMethod: 'Wallet', ...over,
});

const topUpWallet = async (user, token, amount) => {
  const order = await api('POST', '/payments/create-order', token, { type: 'wallet_recharge', amount });
  assert.equal(order.status, 201, JSON.stringify(order.body));
  const v = await api('POST', '/payments/verify', token, { transactionId: order.data.transactionId, paymentId: 'pay_test', signature: 'x' });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  return order.data.transactionId;
};

console.log('\n▶ Wallet & payment integrity');

await test('direct wallet top-up endpoints no longer print money', async () => {
  const a = await api('POST', '/customer/wallet/add-money', T.c1, { amount: 5000 });
  assert.equal(a.status, 400);
  const b = await api('POST', '/partner/wallet/add-money', T.p1, { amount: 5000 });
  assert.equal(b.status, 400);
  assert.equal((await fresh(customer._id)).walletBalance, 0);
});

let rechargeTxn;
await test('gateway wallet recharge credits once and is idempotent', async () => {
  rechargeTxn = await topUpWallet(customer, T.c1, 3000);
  assert.equal((await fresh(customer._id)).walletBalance, 3000);
  const again = await api('POST', '/payments/verify', T.c1, { transactionId: rechargeTxn, paymentId: 'pay_test', signature: 'x' });
  assert.equal(again.status, 200);
  assert.equal((await fresh(customer._id)).walletBalance, 3000, 'replayed verify must not credit twice');
});

await test('another user cannot verify someone else payment', async () => {
  const r = await api('POST', '/payments/verify', T.c2, { transactionId: rechargeTxn, paymentId: 'x', signature: 'x' });
  assert.equal(r.status, 404);
});

await test('recharge amount is bounded', async () => {
  assert.equal((await api('POST', '/payments/create-order', T.c1, { type: 'wallet_recharge', amount: 5 })).status, 400);
  assert.equal((await api('POST', '/payments/create-order', T.c1, { type: 'wallet_recharge', amount: 99999999 })).status, 400);
});

console.log('\n▶ Booking creation & pricing');

let b1;
await test('wallet booking: server price, escrow held, wallet debited, OTP present', async () => {
  const r = await api('POST', '/bookings', T.c1, bookingBody({ amount: 1, discountAmount: 999 })); // client-sent money must be ignored
  assert.equal(r.status, 201, JSON.stringify(r.body));
  b1 = r.data;
  assert.equal(b1.amount, 1050, 'amount = 1000 + 5% fee, ignoring client amount/discount');
  assert.equal(b1.paymentStatus, 'paid');
  assert.equal(b1.financialStatus, 'AMOUNT_HELD');
  assert.match(b1.completionOtp, /^\d{4}$/);
  const c = await fresh(customer._id);
  assert.equal(c.walletBalance, 3000 - 1050);
  assert.equal(c.heldBalance, 1050);
});

await test('insufficient wallet leaves NO phantom booking and NO money movement', async () => {
  const before = await Booking.countDocuments({ customer: customer2._id });
  const r = await api('POST', '/bookings', T.c2, bookingBody());
  assert.equal(r.status, 400);
  assert.match(r.body.message, /Insufficient/i);
  assert.equal(await Booking.countDocuments({ customer: customer2._id }), before);
  assert.equal((await fresh(customer2._id)).walletBalance, 0);
});

await test('wallet double-spend race: two parallel bookings, balance for one', async () => {
  await topUpWallet(customer2, T.c2, 1100);
  const [x, y] = await Promise.all([api('POST', '/bookings', T.c2, bookingBody()), api('POST', '/bookings', T.c2, bookingBody())]);
  const codes = [x.status, y.status].sort();
  assert.deepEqual(codes, [201, 400], `statuses ${codes}`);
  const c = await fresh(customer2._id);
  assert.equal(c.walletBalance, 50);
  assert.equal(await Booking.countDocuments({ customer: customer2._id }), 1, 'only the paid booking may exist');
});

await test('coupon discount is computed on the server and usage is limited', async () => {
  await topUpWallet(customer, T.c1, 2000);
  const r = await api('POST', '/bookings', T.c1, bookingBody({ couponCode: 'SAVE100', discountAmount: 5000 }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.data.amount, 950, '1000 + 50 fee - 100 coupon');
  const second = await api('POST', '/bookings', T.c1, bookingBody({ couponCode: 'SAVE100' }));
  assert.equal(second.status, 400, 'per-user coupon limit enforced');
  await api('PATCH', `/bookings/${r.data._id}/cancel`, T.c1, { reason: 'test cleanup' });
});

await test('past booking date and missing city are rejected', async () => {
  const past = await api('POST', '/bookings', T.c1, bookingBody({ bookingDate: '2020-01-01T10:00:00Z' }));
  assert.equal(past.status, 400);
  const noCity = await api('POST', '/bookings', T.c1, bookingBody({ city: '' }));
  // customer profile city is used as fallback; with it set this is allowed, so clear it for the check
  await User.updateOne({ _id: customer._id }, { $set: { city: '' } });
  const noCity2 = await api('POST', '/bookings', T.c1, bookingBody({ city: '' }));
  await User.updateOne({ _id: customer._id }, { $set: { city: 'Testville' } });
  assert.equal(noCity2.status, 400);
  if (noCity.data?._id) await api('PATCH', `/bookings/${noCity.data._id}/cancel`, T.c1, {});
});

console.log('\n▶ Dispatch eligibility & data privacy');

await test('only eligible partners see the open job; others (category/city/KYC) do not', async () => {
  const p1 = await api('GET', '/partner/bookings/pending', T.p1);
  assert.equal(p1.status, 200);
  assert.ok(p1.data.some((b) => b._id === b1._id), 'eligible partner sees the job');
  assert.ok(p1.data.every((b) => b.completionOtp === undefined), 'OTP never leaks to partners');
  assert.ok(!(await api('GET', '/partner/bookings/pending', T.p3)).data.some((b) => b._id === b1._id), 'wrong category');
  assert.ok(!(await api('GET', '/partner/bookings/pending', T.p4)).data.some((b) => b._id === b1._id), 'wrong city');
  assert.equal((await api('GET', '/partner/bookings/pending', T.p5)).status, 403, 'KYC-pending partner is locked');
});

await test('open offer hides customer contact details from partners', async () => {
  const d = await api('GET', `/partner/bookings/${b1._id}`, T.p1);
  assert.equal(d.status, 200);
  assert.equal(d.data.customer.phone, undefined);
  assert.equal(d.data.completionOtp, undefined);
});

await test('booking access control (IDOR)', async () => {
  assert.equal((await api('GET', `/bookings/${b1._id}`, T.c2)).status, 403, 'other customer');
  assert.equal((await api('GET', `/bookings/${b1._id}`, T.p2)).status, 403, 'unrelated partner');
  const own = await api('GET', `/bookings/${b1._id}`, T.c1);
  assert.equal(own.status, 200);
  assert.match(own.data.completionOtp, /^\d{4}$/, 'owner sees OTP');
  assert.equal((await api('PATCH', `/bookings/${b1._id}/cancel`, T.c2, {})).status, 403, 'other customer cannot cancel');
  assert.equal((await api('PATCH', `/bookings/${b1._id}/assign`, T.c1, { partnerId: String(partner1._id) })).status, 403, 'customer cannot assign');
  assert.equal((await api('POST', `/bookings/${b1._id}/pay`, T.c2, {})).status, 403);
  assert.equal((await api('POST', `/payments/x/refund`, T.c1, {})).status, 403, 'customer cannot refund');
  assert.equal((await api('GET', '/wallet/admin/financial-summary', T.c1)).status, 403);
  assert.equal((await api('GET', '/admin/admin/financial-summary', T.p1)).status, 403);
});

console.log('\n▶ Claim, OTP, extras, completion');

await test('claim race: two partners, exactly one wins', async () => {
  const [x, y] = await Promise.all([api('POST', `/partner/bookings/${b1._id}/accept-job`, T.p1), api('POST', `/partner/bookings/${b1._id}/accept-job`, T.p2)]);
  const codes = [x.status, y.status].sort();
  assert.deepEqual(codes, [200, 409], `statuses ${codes}`);
  const b = await Booking.findById(b1._id);
  assert.equal(b.status, 'Accepted');
  b1.winner = String(b.partner) === String(partner1._id) ? 'p1' : 'p2';
});

await test('claim ignores ineligible partner', async () => {
  const other = await api('POST', '/bookings', T.c1, bookingBody());
  assert.equal(other.status, 201, JSON.stringify(other.body));
  assert.equal((await api('POST', `/partner/bookings/${other.data._id}/accept-job`, T.p3)).status, 403);
  assert.equal((await api('POST', `/partner/bookings/${other.data._id}/accept-job`, T.p4)).status, 403);
  await api('PATCH', `/bookings/${other.data._id}/cancel`, T.c1, {});
});

const W = b1.winner === 'p1' ? { tok: T.p1, user: partner1 } : { tok: T.p2, user: partner2 };
const LOSER = b1.winner === 'p1' ? T.p2 : T.p1;

await test('state machine: no OTP bypass, no skipping, no outsiders', async () => {
  assert.equal((await api('PATCH', `/bookings/${b1._id}/start`, W.tok)).status, 400, 'start without OTP');
  assert.equal((await api('PATCH', `/bookings/${b1._id}/complete`, W.tok)).status, 400, 'complete before start');
  assert.equal((await api('POST', `/partner/bookings/${b1._id}/verify-otp`, W.tok, { otp: '2847' })).status, 409, 'OTP before on-the-way');
  assert.equal((await api('PATCH', `/bookings/${b1._id}/on-the-way`, LOSER)).status, 403, 'other partner');
  assert.equal((await api('PATCH', `/bookings/${b1._id}/on-the-way`, W.tok)).status, 200);
  const stored = (await Booking.findById(b1._id).select('+completionOtp')).completionOtp;
  const wrong = stored === '2847' ? '1111' : '2847';
  const bad = await api('POST', `/partner/bookings/${b1._id}/verify-otp`, W.tok, { otp: wrong });
  assert.equal(bad.status, 400, 'the old hard-coded master OTP must not work');
  assert.equal((await Booking.findById(b1._id)).status, 'On The Way');
});

await test('OTP brute force is locked after 5 failures, correct OTP then still blocked', async () => {
  const stored = (await Booking.findById(b1._id).select('+completionOtp')).completionOtp;
  const wrong = stored === '0000' ? '0001' : '0000';
  for (let i = 0; i < 5; i++) await api('POST', `/partner/bookings/${b1._id}/verify-otp`, W.tok, { otp: wrong });
  const r = await api('POST', `/partner/bookings/${b1._id}/verify-otp`, W.tok, { otp: stored });
  assert.equal(r.status, 429);
  await Booking.updateOne({ _id: b1._id }, { $set: { otpFailedAttempts: 0 } }); // support unlock
});

await test('correct customer OTP starts the service', async () => {
  const otp = (await api('GET', `/bookings/${b1._id}`, T.c1)).data.completionOtp;
  const ok = await api('POST', `/partner/bookings/${b1._id}/verify-otp`, W.tok, { otp });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const b = await Booking.findById(b1._id);
  assert.equal(b.status, 'Started');
  assert.equal(b.otpVerified, true);
});

await test('customer cannot cancel after the service started', async () => {
  const r = await api('PATCH', `/bookings/${b1._id}/cancel`, T.c1, { reason: 'x' });
  assert.equal(r.status, 400);
});

await test('extra services: trusted DB price, ownership, duplicate guard', async () => {
  const forged = await api('POST', `/partner/bookings/${b1._id}/add-extra-service`, W.tok, { serviceId: String(extraService._id), price: 1 });
  assert.equal(forged.status, 200, JSON.stringify(forged.body));
  assert.equal(forged.data.addedItem.price, 200, 'client price ignored');
  const dup = await api('POST', `/partner/bookings/${b1._id}/add-extra-service`, W.tok, { serviceId: String(extraService._id) });
  assert.equal(dup.status, 400);
  assert.equal((await api('POST', `/partner/bookings/${b1._id}/add-extra-service`, LOSER, { serviceId: String(extraService._id) })).status, 403);
  const payable = await api('GET', `/partner/bookings/${b1._id}/payable-amount`, W.tok);
  assert.equal(payable.data.extraServicesPrice, 200);
  assert.equal(payable.data.payableAmount, 210, '200 + 5% fee');
});

await test('cannot complete while extras are unpaid; then settle exactly once', async () => {
  assert.equal((await api('PATCH', `/bookings/${b1._id}/complete`, W.tok)).status, 400, 'unpaid extras block completion');
  assert.equal((await api('POST', `/partner/bookings/${b1._id}/verify-extra-payment`, W.tok, { paymentMethod: 'cash' })).status, 200);

  const walletBefore = (await fresh(W.user._id)).walletBalance;
  const revenueBefore = (await PlatformAccount.findOne()).grossRevenue;
  const [x, y] = await Promise.all([api('PATCH', `/bookings/${b1._id}/complete`, W.tok), api('PATCH', `/bookings/${b1._id}/complete`, W.tok)]);
  assert.ok([x.status, y.status].includes(200), 'one completion succeeds');
  const b = await Booking.findById(b1._id);
  assert.equal(b.status, 'Completed');
  assert.equal(b.financialStatus, 'SETTLED');
  assert.equal(b.paymentMethod, 'Wallet', 'base payment method is not overwritten by the extras cash flag');

  // base: 1000 -> commission 10% = 100 -> partner net 900 credited.
  // extras: 200 -> fee 10 + commission 20 = 30 owed to platform, taken from partner wallet (collected on site)
  const p = await fresh(W.user._id);
  assert.equal(p.walletBalance - walletBefore, 900 - 30, 'partner wallet +900 earnings -30 platform dues, applied ONCE');
  const c = await fresh(customer._id);
  assert.equal(c.heldBalance, 0, 'escrow released');
  const acc = await PlatformAccount.findOne();
  assert.equal(acc.grossRevenue - revenueBefore, 150 + 30, 'platform revenue = (50 fee + 100 comm) + (10 + 20)');
  assert.equal(await LedgerEntry.countDocuments({ idempotencyKey: `SETTLE-PARTNER-${b.bookingId}` }), 1);
});

await test('completed booking cannot be cancelled/refunded/re-completed', async () => {
  assert.equal((await api('PATCH', `/bookings/${b1._id}/cancel`, T.c1, {})).status, 400);
  const before = (await fresh(W.user._id)).walletBalance;
  const again = await api('PATCH', `/bookings/${b1._id}/complete`, W.tok);
  assert.equal(again.status, 400);
  assert.equal((await fresh(W.user._id)).walletBalance, before);
});

await test('rating goes through the review system, once, updates partner stats', async () => {
  const r = await api('POST', `/bookings/${b1._id}/rate`, T.c1, { rating: 4, reviewComment: 'Good work' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const dup = await api('POST', `/bookings/${b1._id}/rate`, T.c1, { rating: 1, reviewComment: 'again' });
  assert.equal(dup.status, 409);
  assert.equal(await Review.countDocuments({ orderId: b1._id }), 1);
  const p = await fresh(W.user._id);
  assert.equal(p.totalRatings, 1);
  assert.equal(p.averageRating, 4);
  assert.equal((await api('POST', `/bookings/${b1._id}/rate`, T.c2, { rating: 5 })).status, 403);
});

await test('public partner profile: only related customers, no private fields, real data', async () => {
  const ok = await api('GET', `/bookings/partner-profile/${W.user._id}`, T.c1);
  assert.equal(ok.status, 200);
  assert.equal(ok.data.bankDetails, undefined);
  assert.equal(ok.data.walletBalance, undefined);
  assert.equal(ok.data.phone, undefined);
  assert.equal(ok.data.completedBookingsCount, 1);
  assert.equal(ok.data.reviews.length, 1);
  assert.equal((await api('GET', `/bookings/partner-profile/${W.user._id}`, T.c2)).status, 403);
});

console.log('\n▶ Cancellation, refunds, partner cancel');

await test('customer cancels a paid, unaccepted booking: package refunded, platform fee kept', async () => {
  await topUpWallet(customer, T.c1, 2000);
  const before = (await fresh(customer._id)).walletBalance;
  const r = await api('POST', '/bookings', T.c1, bookingBody());
  assert.equal(r.status, 201);
  const cancel = await api('PATCH', `/bookings/${r.data._id}/cancel`, T.c1, { reason: 'changed my mind' });
  assert.equal(cancel.status, 200, JSON.stringify(cancel.body));
  assert.equal(cancel.data.refundAmount, 1000);
  const c = await fresh(customer._id);
  assert.equal(c.walletBalance, before - 50, 'only the ₹50 platform fee is lost');
  assert.equal(c.heldBalance, 0);
  assert.equal((await api('PATCH', `/bookings/${r.data._id}/cancel`, T.c1, {})).status, 400, 'double cancel blocked');
  const bb = await Booking.findById(r.data._id);
  assert.equal(bb.status, 'Refunded');
  // a cancelled booking can no longer be claimed or completed
  assert.equal((await api('POST', `/partner/bookings/${r.data._id}/accept-job`, T.p1)).status, 409);
});

await test('cancelled-after-claim booking can never be completed (no double payout)', async () => {
  const r = await api('POST', '/bookings', T.c1, bookingBody());
  await api('POST', `/partner/bookings/${r.data._id}/accept-job`, T.p1);
  const cancel = await api('PATCH', `/bookings/${r.data._id}/cancel`, T.c1, { reason: 'x' });
  assert.equal(cancel.status, 200);
  const before = (await fresh(partner1._id)).walletBalance;
  assert.equal((await api('PATCH', `/bookings/${r.data._id}/complete`, T.p1)).status, 400);
  assert.equal((await fresh(partner1._id)).walletBalance, before);
});

await test('partner cancel re-opens the job with a NEW otp, penalty applied, never re-offered to same partner', async () => {
  const r = await api('POST', '/bookings', T.c1, bookingBody());
  const oldOtp = (await Booking.findById(r.data._id).select('+completionOtp')).completionOtp;
  await api('POST', `/partner/bookings/${r.data._id}/accept-job`, T.p1);
  const bal = (await fresh(partner1._id)).walletBalance;
  const c = await api('POST', `/partner/bookings/${r.data._id}/cancel`, T.p1, { reason: 'Emergency' });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  const b = await Booking.findById(r.data._id).select('+completionOtp');
  assert.equal(b.status, 'Pending');
  assert.equal(b.partner, null);
  assert.notEqual(b.completionOtp, oldOtp, 'OTP regenerated for the next partner');
  assert.equal((await fresh(partner1._id)).walletBalance, bal - 100, 'penalty debited');
  assert.equal((await api('GET', '/partner/bookings/pending', T.p1)).data.some((x) => x._id === r.data._id), false);
  assert.equal((await api('GET', '/partner/bookings/pending', T.p2)).data.some((x) => x._id === r.data._id), true);
  await api('PATCH', `/bookings/${r.data._id}/cancel`, T.c1, {});
});

await test('4th partner cancellation today suspends the account instead of crashing', async () => {
  await User.updateOne({ _id: partner2._id }, { $set: { walletBalance: 1000 } });
  let last;
  for (let i = 0; i < 5; i++) {
    const r = await api('POST', '/bookings', T.c1, bookingBody());
    if (r.status !== 201) { await topUpWallet(customer, T.c1, 3000); i--; continue; }
    const claim = await api('POST', `/partner/bookings/${r.data._id}/accept-job`, T.p2);
    if (claim.status !== 200) break;
    last = await api('POST', `/partner/bookings/${r.data._id}/cancel`, T.p2, { reason: 'x' });
    assert.equal(last.status, 200, JSON.stringify(last.body));
    await api('PATCH', `/bookings/${r.data._id}/cancel`, T.c1, {});
  }
  assert.equal(last.data.isSuspended, true);
  assert.equal((await fresh(partner2._id)).status, 'suspended');
});

console.log('\n▶ Online (gateway) payment flow');

await test('online booking is invisible to partners until payment is verified', async () => {
  const r = await api('POST', '/bookings', T.c1, bookingBody({ paymentMethod: 'UPI' }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.data.requiresPayment, true);
  assert.equal(r.data.paymentStatus, 'pending');
  const open = await api('GET', '/partner/bookings/pending', T.p1);
  assert.equal(open.data.some((x) => x._id === r.data._id), false, 'unpaid job is not offered');
  assert.equal((await api('POST', `/partner/bookings/${r.data._id}/accept-job`, T.p1)).status, 409, 'unpaid job cannot be claimed');

  const order = await api('POST', '/payments/create-order', T.c1, { type: 'booking_payment', bookingId: r.data._id, amount: 1 });
  assert.equal(order.status, 201, JSON.stringify(order.body));
  assert.equal(order.data.amountRupees, 1050, 'order amount comes from the booking, not the client');
  assert.equal((await api('POST', '/payments/create-order', T.c2, { type: 'booking_payment', bookingId: r.data._id })).status, 404, "cannot pay for someone else's booking");

  const v = await api('POST', '/payments/verify', T.c1, { transactionId: order.data.transactionId, paymentId: 'pay_1', signature: 'sig' });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  const b = await Booking.findById(r.data._id);
  assert.equal(b.paymentStatus, 'paid');
  assert.equal(b.financialStatus, 'AMOUNT_HELD');
  assert.equal(b.prepaidAmount, 1050);
  const open2 = await api('GET', '/partner/bookings/pending', T.p1);
  assert.equal(open2.data.some((x) => x._id === r.data._id), true, 'offered after payment');
  const held = (await fresh(customer._id)).heldBalance;
  await api('POST', '/payments/verify', T.c1, { transactionId: order.data.transactionId, paymentId: 'pay_1', signature: 'sig' }); // replay
  assert.equal((await fresh(customer._id)).heldBalance, held, 'replay does not hold escrow twice');
  await api('PATCH', `/bookings/${r.data._id}/cancel`, T.c1, {});
});

await test('live gateway mode rejects forged signatures', async () => {
  process.env.RAZORPAY_KEY_ID = 'rzp_test_x';
  process.env.RAZORPAY_KEY_SECRET = 'secret_x';
  const { paymentGatewayService } = await import('../src/services/paymentGateway.service.js');
  assert.equal(paymentGatewayService.mode(), 'live');
  assert.equal(paymentGatewayService.verifySignature({ orderId: 'order_1', paymentId: 'pay_1', signature: 'forged' }), false);
  const crypto = await import('node:crypto');
  const good = crypto.createHmac('sha256', 'secret_x').update('order_1|pay_1').digest('hex');
  assert.equal(paymentGatewayService.verifySignature({ orderId: 'order_1', paymentId: 'pay_1', signature: good }), true);
  process.env.RAZORPAY_KEY_ID = '';
  process.env.RAZORPAY_KEY_SECRET = '';
});

await test('production without gateway keys fails closed', async () => {
  process.env.NODE_ENV = 'production';
  const { paymentGatewayService } = await import('../src/services/paymentGateway.service.js');
  assert.equal(paymentGatewayService.mode(), 'disabled');
  assert.throws(() => paymentGatewayService.assertGatewayAvailable(), /unavailable/i);
  process.env.NODE_ENV = 'development';
});

console.log('\n▶ Partner wallet, withdrawal, profile hardening');

await test('withdrawal is atomic: parallel requests cannot exceed the balance', async () => {
  await User.updateOne({ _id: partner1._id }, { $set: { walletBalance: 1000, availableBalance: 1000, withdrawableBalance: 1000, withdrawalPending: 0 } });
  const [x, y, z] = await Promise.all([1, 2, 3].map(() => api('POST', '/partner/wallet/withdraw', T.p1, { amount: 600 })));
  const ok = [x, y, z].filter((r) => r.status === 200).length;
  assert.equal(ok, 1, 'only one 600 withdrawal fits in 1000');
  const p = await fresh(partner1._id);
  assert.equal(p.walletBalance, 400);
  assert.equal(p.withdrawalPending, 600);
  const w = await api('GET', '/partner/wallet', T.p1);
  assert.equal(w.data.walletBalance, 400, 'wallet screen no longer auto-refills the balance');
  assert.equal((await api('GET', '/partner/wallet', T.p1)).data.walletBalance, 400);
});

await test('partner cannot escalate privileges / forge KYC / mint money through profile update', async () => {
  const r = await api('PUT', '/partner/profile', T.p1, { name: 'Renamed', kycStatus: 'approved', status: 'active', role: 'superadmin', walletBalance: 999999, lifetimeEarnings: 999999, averageRating: 5, bankDetails: { accountNumber: '999', isVerified: true } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const p = await fresh(partner1._id);
  assert.equal(p.name, 'Renamed');
  assert.equal(p.role, 'partner');
  assert.equal(p.walletBalance, 400);
  assert.equal(p.lifetimeEarnings < 999999, true);
  assert.equal(p.bankDetails.isVerified, false, 'bank verification is not client controlled');
  const pending = await User.findById(partnerPending._id);
  const r2 = await api('PUT', '/partner/profile', tok(pending), { kycStatus: 'approved' });
  assert.equal((await fresh(partnerPending._id)).kycStatus, 'pending');
  void r2;
});

await test('customer wallet screen has no magic resets; settings expose only public values', async () => {
  const w = await api('GET', '/customer/wallet', T.c1);
  assert.equal(w.status, 200);
  const s = await api('GET', '/customer/system-settings', T.c1);
  assert.equal(s.data.customerPlatformFeePercent, 5);
  assert.equal(s.data.partnerPlatformFeePercent, undefined);
  assert.equal(s.data.partnerCancellationPenaltyAmount, undefined);
});

await test('customer booking filters use real statuses', async () => {
  const done = await api('GET', '/customer/bookings/completed', T.c1);
  assert.ok(done.data.length >= 1);
  const cancelled = await api('GET', '/customer/bookings/cancelled', T.c1);
  assert.ok(cancelled.data.length >= 1);
});

await test('admin financial summary has real (non-demo) numbers', async () => {
  const f = await api('GET', '/admin/admin/financial-summary', T.sa);
  assert.equal(f.status, 200, JSON.stringify(f.body));
  assert.equal(f.data.overview.grossPlatformRevenue, (await PlatformAccount.findOne()).grossRevenue);
  assert.notEqual(f.data.overview.grossBookingValue, 100000);
});

await test('admin refund endpoint works only for admins and pays the wallet', async () => {
  await topUpWallet(customer, T.c1, 1500);
  const r = await api('POST', '/bookings', T.c1, bookingBody());
  const { Payment } = await import('../src/models/payment.model.js');
  const pay = await Payment.findOne({ booking: r.data._id, type: 'booking_payment' });
  const before = (await fresh(customer._id)).walletBalance;
  assert.equal((await api('POST', `/payments/${pay._id}/refund`, T.c1, {})).status, 403);
  const ref = await api('POST', `/payments/${pay._id}/refund`, T.admin, { reason: 'goodwill' });
  assert.equal(ref.status, 200, JSON.stringify(ref.body));
  assert.equal((await fresh(customer._id)).walletBalance, before + 1050, 'admin refund returns the full amount incl. fee');
  assert.equal((await api('POST', `/payments/${pay._id}/refund`, T.admin, {})).status, 400, 'no double refund');
});

console.log('\n▶ Background dispatch sweep');

await test('sweep: abandons unpaid, re-opens un-accepted assignment, auto-assigns, refunds when nobody serves', async () => {
  // unpaid booking older than 30 min is abandoned
  const unpaid = await api('POST', '/bookings', T.c1, bookingBody({ paymentMethod: 'UPI' }));
  await Booking.collection.updateOne({ _id: new mongoose.Types.ObjectId(unpaid.data._id) }, { $set: { createdAt: new Date(Date.now() - 40 * 60000) } });

  // paid + waiting > 60s, partners online -> auto-assigned to an eligible partner
  await User.updateOne({ _id: partner2._id }, { $set: { status: 'active' } });
  const waiting = await api('POST', '/bookings', T.c1, bookingBody());
  await Booking.collection.updateOne({ _id: new mongoose.Types.ObjectId(waiting.data._id) }, { $set: { createdAt: new Date(Date.now() - 2 * 60000) } });

  await bookingService.runDispatchSweep();
  assert.equal((await Booking.findById(unpaid.data._id)).status, 'Cancelled');
  const w = await Booking.findById(waiting.data._id);
  assert.equal(w.status, 'Assigned', 'auto-assigned');
  assert.ok([String(partner1._id)].includes(String(w.partner)), 'only an eligible, active partner is chosen');

  // partner never accepts -> job re-opens, partner excluded
  await Booking.updateOne({ _id: w._id }, { $set: { assignedAt: new Date(Date.now() - 20 * 60000) } });
  await bookingService.runDispatchSweep();
  const reopened = await Booking.findById(w._id);
  assert.equal(reopened.status, 'Pending');
  assert.equal(reopened.partner, null);
  assert.equal(reopened.cancelledByPartners.map(String).includes(String(partner1._id)), true);

  // nobody can serve it for 45+ min -> full refund
  await Booking.collection.updateOne({ _id: w._id }, { $set: { createdAt: new Date(Date.now() - 50 * 60000), autoAssignAttemptedAt: null } });
  const before = (await fresh(customer._id)).walletBalance;
  await bookingService.runDispatchSweep();
  const refunded = await Booking.findById(w._id);
  assert.equal(refunded.status, 'Refunded');
  assert.equal(refunded.refundAmount, 1050, 'system cancellation refunds the platform fee too');
  assert.equal((await fresh(customer._id)).walletBalance, before + 1050);
});

console.log('\n▶ Realtime sockets');

const ioClientPath = pathToFileURL(path.resolve('../norozz/node_modules/socket.io-client/build/esm/index.js')).href;
let ioClient;
try { ioClient = (await import(ioClientPath)).io; } catch { /* optional */ }

if (ioClient) {
  const url = `http://127.0.0.1:${server.address().port}`;
  const connect = (token) => new Promise((resolve) => {
    const s = ioClient(url, { auth: token ? { token } : {}, transports: ['websocket'], reconnection: false });
    s.on('connect', () => resolve({ s, ok: true }));
    s.on('connect_error', (e) => resolve({ s, ok: false, err: e.message }));
  });
  const once = (s, ev, ms = 4000) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error(`timeout waiting for ${ev}`)), ms); s.once(ev, (d) => { clearTimeout(t); res(d); }); });

  await test('socket without / with bad token is rejected', async () => {
    assert.equal((await connect(null)).ok, false);
    assert.equal((await connect('garbage')).ok, false);
  });

  await test('partner socket receives only offers it is eligible for, claims via socket, customer is notified', async () => {
    await User.updateOne({ _id: partner1._id }, { $set: { isOnline: true, status: 'active' } });
    await User.updateOne({ _id: partner3Safe()._id }, { $set: { isOnline: true } }).catch(() => {});
    const p1 = await connect(T.p1);
    const p3 = await connect(T.p3);
    const cu = await connect(T.c1);
    assert.ok(p1.ok && p3.ok && cu.ok);
    p1.s.emit('join_partner', { online: true });
    p3.s.emit('join_partner', { online: true });
    await once(p1.s, 'partner_connected');
    let p3Got = false;
    p3.s.on('new_job_offer', () => { p3Got = true; });
    const offerP = once(p1.s, 'new_job_offer');
    const assignedP = once(cu.s, 'partner_assigned');
    const r = await api('POST', '/bookings', T.c1, bookingBody());
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const offer = await offerP;
    assert.equal(String(offer.bookingId), r.data._id);
    assert.equal(offer.customerPhone, undefined, 'offer does not leak the customer phone');
    await sleep(300);
    assert.equal(p3Got, false, 'ineligible partner (other category) gets no offer');

    // a forged partnerId in the payload is ignored: identity is the token
    p1.s.emit('claim_job', { bookingId: r.data._id, partnerId: String(partner2._id) });
    const res = await once(p1.s, 'claim_result');
    assert.equal(res.success, true, JSON.stringify(res));
    assert.equal(String((await Booking.findById(r.data._id)).partner), String(partner1._id));
    await assignedP;
    [p1.s, p3.s, cu.s].forEach((x) => x.close());
  });

  await test('chat: only participants can join/read/send; outsiders receive nothing', async () => {
    const bk = await Booking.findOne({ partner: partner1._id, status: 'Accepted' });
    assert.ok(bk, 'accepted booking exists from previous test');
    const id = String(bk._id);
    const cust = await connect(T.c1);
    const part = await connect(T.p1);
    const outsider = await connect(T.c2);
    const joins = [once(cust.s, 'chat_room_joined'), once(part.s, 'chat_room_joined'), once(outsider.s, 'chat_room_joined')];
    cust.s.emit('join_chat_room', { bookingId: id });
    part.s.emit('join_chat_room', { bookingId: id });
    outsider.s.emit('join_chat_room', { bookingId: id });
    const [cj, pj, oj] = await Promise.all(joins);
    assert.equal(oj.success, false);
    assert.equal(cj.success && pj.success, true);

    let leaked = false;
    outsider.s.on('new_chat_message', () => { leaked = true; });
    outsider.s.on('new_chat_notification', () => { leaked = true; });
    const got = once(part.s, 'new_chat_message');
    cust.s.emit('send_chat_message', { bookingId: id, senderId: String(partner2._id), senderName: 'Spoofed', senderRole: 'partner', message: 'hello' });
    const m = await got;
    assert.equal(m.sender, String(customer._id), 'sender identity comes from the token');
    assert.equal(m.senderRole, 'customer');
    await sleep(300);
    assert.equal(leaked, false);

    // chat history REST
    assert.equal((await api('GET', `/chat/${id}`, T.c2)).status, 403);
    assert.equal((await api('GET', `/chat/${id}`, T.c1)).status, 200);
    [cust.s, part.s, outsider.s].forEach((x) => x.close());
  });
} else {
  console.log('  ⚠️ socket.io-client not found in ../norozz/node_modules - socket tests skipped');
}

function partner3Safe() { return partnerOtherCat; }

// ─────────────────────────── summary ───────────────────────────
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? `, ${failed.length} FAILED` : ''}`);
server.close();
await mongoose.disconnect();
process.exit(failed.length ? 1 : 0);
