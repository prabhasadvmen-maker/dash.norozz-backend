import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);

const Booking = mongoose.model('Booking', new mongoose.Schema({}, { strict: false }), 'bookings');
const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users');

// Find the partner
const partner = await User.findOne({ phone: '+918830448351', role: 'partner' }).lean();
if (!partner) { console.log('❌ Partner not found'); process.exit(); }

// Assign booking to partner
const result = await Booking.findOneAndUpdate(
  { bookingId: 'UC-70612', status: { $in: ['Pending', 'pending'] } },
  { $set: { partner: partner._id, status: 'Assigned' } },
  { new: true }
).lean();

if (result) {
  console.log(`✅ Booking UC-70612 assigned to: ${partner.name} (${partner.phone})`);
  console.log(`   Status: ${result.status}`);
} else {
  console.log('❌ Booking not found or already assigned');
}

await mongoose.disconnect();
