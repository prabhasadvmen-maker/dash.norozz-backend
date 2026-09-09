import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from './models/user.model.js';
import { ROLES } from './constants/roles.constant.js';
import { seedCatalogData } from './seedCatalog.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable is missing. Aborting seed.');
  process.exit(1);
}

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB for seeding...');

    // 1. Super Admin
    const superAdminEmail = 'superadmin@norozz.com';
    let superAdmin = await User.findOne({ email: superAdminEmail });
    if (!superAdmin) {
      superAdmin = await User.create({ assignedCity: null,
        name: 'Super Admin',
        email: superAdminEmail,
        password: 'SuperAdminPass123!',
        role: ROLES.SUPER_ADMIN,
        status: 'active',
        isEmailVerified: true,
        isPhoneVerified: true,
      });
      console.log('✅ Super Admin created: superadmin@norozz.com / SuperAdminPass123!');
    } else {
      superAdmin.password = 'SuperAdminPass123!';
      superAdmin.assignedCity = null;
      await superAdmin.save({ validateBeforeSave: false });
      console.log('✅ Super Admin password updated to: SuperAdminPass123!');
    }


    // 2. City Admins Seeding
    const cityAdmins = [
      { name: 'Delhi City Operations Manager', email: 'delhi.admin@norozz.com', city: 'Delhi NCR', assignedCity: 'Delhi NCR' },
      { name: 'Bengaluru City Operations Manager', email: 'bengaluru.admin@norozz.com', city: 'Bengaluru', assignedCity: 'Bengaluru' },
      { name: 'Mumbai City Operations Manager', email: 'mumbai.admin@norozz.com', city: 'Mumbai', assignedCity: 'Mumbai' },
      { name: 'Hyderabad City Operations Manager', email: 'hyderabad.admin@norozz.com', city: 'Hyderabad', assignedCity: 'Hyderabad' },
      { name: 'Pune City Operations Manager', email: 'pune.admin@norozz.com', city: 'Pune', assignedCity: 'Pune' },
      { name: 'Jaipur City Operations Manager', email: 'jaipur.admin@norozz.com', city: 'Jaipur', assignedCity: 'Jaipur' },
    ];

    for (const adminData of cityAdmins) {
      let cityAdminUser = await User.findOne({ email: adminData.email });
      if (!cityAdminUser) {
        await User.create({
          name: adminData.name,
          email: adminData.email,
          password: 'CityAdminPass123!',
          role: ROLES.CITY_ADMIN,
          city: adminData.city,
          assignedCity: null,
          status: 'active',
          isEmailVerified: true,
          isPhoneVerified: true,
        });
        console.log(`✅ City Admin created: ${adminData.email} / CityAdminPass123! (${adminData.assignedCity})`);
      } else {
        cityAdminUser.password = 'CityAdminPass123!';
        cityAdminUser.role = ROLES.CITY_ADMIN;
        cityAdminUser.assignedCity = null;
        cityAdminUser.city = adminData.city;
        cityAdminUser.status = 'active';
        await cityAdminUser.save({ validateBeforeSave: false });
        console.log(`✅ City Admin updated: ${adminData.email} / CityAdminPass123! (${adminData.assignedCity})`);
      }
    }

    console.log('🎉 Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seed();
