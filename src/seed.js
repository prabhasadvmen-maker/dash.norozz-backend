import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from './models/user.model.js';
import { City } from './models/city.model.js';
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

    // 2. City Admins Seeding with proper City ObjectId assignment
    const cityAdmins = [
      { name: 'Bengaluru City Operations Manager', email: 'bengaluru.admin@norozz.com', cityName: 'Bengaluru' },
      { name: 'Mumbai City Operations Manager', email: 'mumbai.admin@norozz.com', cityName: 'Mumbai' },
      { name: 'Hyderabad City Operations Manager', email: 'hyderabad.admin@norozz.com', cityName: 'Hyderabad' },
      { name: 'Pune City Operations Manager', email: 'pune.admin@norozz.com', cityName: 'Pune' },
      { name: 'Jaipur City Operations Manager', email: 'jaipur.admin@norozz.com', cityName: 'Jaipur' },
    ];

    for (const adminData of cityAdmins) {
      // Find the City by name to get its ObjectId
      const city = await City.findOne({ name: adminData.cityName });
      if (!city) {
        console.warn(`⚠️ City '${adminData.cityName}' not found in database. Skipping City Admin: ${adminData.email}`);
        continue;
      }

      let cityAdminUser = await User.findOne({ email: adminData.email });
      if (!cityAdminUser) {
        await User.create({
          name: adminData.name,
          email: adminData.email,
          password: 'CityAdminPass123!',
          role: ROLES.CITY_ADMIN,
          city: adminData.cityName,
          assignedCity: city._id,
          status: 'active',
          isEmailVerified: true,
          isPhoneVerified: true,
        });
        console.log(`✅ City Admin created: ${adminData.email} / CityAdminPass123! (City: ${adminData.cityName})`);
      } else {
        cityAdminUser.password = 'CityAdminPass123!';
        cityAdminUser.role = ROLES.CITY_ADMIN;
        cityAdminUser.assignedCity = city._id;
        cityAdminUser.city = adminData.cityName;
        cityAdminUser.status = 'active';
        await cityAdminUser.save({ validateBeforeSave: false });
        console.log(`✅ City Admin updated: ${adminData.email} / CityAdminPass123! (City: ${adminData.cityName})`);
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
