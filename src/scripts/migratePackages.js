import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Service } from '../models/service.model.js';
import { ServicePackage } from '../models/servicePackage.model.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/norozz';

async function runMigration() {
  console.log('🚀 Starting Idempotent Service Package Migration Script...');
  console.log(`Connecting to MongoDB at: ${MONGODB_URI}`);

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB successfully.');

    const services = await Service.find({});
    console.log(`Found total ${services.length} services in database.`);

    let totalServicesAnalyzed = services.length;
    let packagesCreatedCount = 0;
    let skippedServicesCount = 0;
    let failedServicesCount = 0;

    for (const service of services) {
      try {
        // Idempotency check: see if packages already exist for this service
        const existingCount = await ServicePackage.countDocuments({ service: service._id, status: { $ne: 'deleted' } });
        if (existingCount > 0) {
          skippedServicesCount++;
          continue; // Already migrated, skip!
        }

        // Case 1: Migrate existing embedded packages array if present
        if (Array.isArray(service.packages) && service.packages.length > 0) {
          for (let i = 0; i < service.packages.length; i++) {
            const item = service.packages[i];
            const basePrice = Number(item.price) || Number(service.price) || 999;
            const title = item.title ? item.title.trim() : `Package ${i + 1}`;
            const slug = title.toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/\s+/g, '-');

            await ServicePackage.create({
              service: service._id,
              title,
              slug: `${slug}-${i + 1}`,
              description: item.description || service.description || '',
              price: basePrice,
              discountType: 'none',
              discountValue: 0,
              finalPrice: basePrice,
              duration: service.duration || '45 mins',
              features: Array.isArray(item.features) ? item.features : [],
              isPopular: Boolean(item.isPopular),
              isRecommended: i === 0,
              sortOrder: i,
              status: 'active',
            });
            packagesCreatedCount++;
          }
        } else {
          // Case 2: Migrate top-level price/duration into a default "Standard Package"
          const basePrice = Number(service.price) || Number(service.finalPrice) || 599;
          const discountAmt = Number(service.discount) || 0;
          const finalPrice = Number(service.finalPrice) || Math.max(0, basePrice - discountAmt);
          const slugName = (service.name || 'standard-package').toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/\s+/g, '-');

          await ServicePackage.create({
            service: service._id,
            title: `${service.name} (Standard Package)`,
            slug: `${slugName}-standard`,
            description: service.description || '',
            price: basePrice,
            discountType: discountAmt > 0 ? 'fixed' : 'none',
            discountValue: discountAmt,
            finalPrice: finalPrice,
            duration: service.duration || '45 mins',
            features: [
              'Complete 30-day post-service warranty',
              'Background-verified certified technician',
              'High-pressure equipment & health inspection'
            ],
            isPopular: true,
            isRecommended: true,
            sortOrder: 0,
            status: 'active',
          });
          packagesCreatedCount++;
        }
      } catch (err) {
        console.error(`❌ Error migrating service '${service.name}' (${service._id}):`, err);
        failedServicesCount++;
      }
    }

    console.log('\n==================================================');
    console.log('📊 MIGRATION COMPLETED REPORT:');
    console.log(`- Total Services Analyzed : ${totalServicesAnalyzed}`);
    console.log(`- Packages Created        : ${packagesCreatedCount}`);
    console.log(`- Skipped Services (Idempotent): ${skippedServicesCount}`);
    console.log(`- Failed Services         : ${failedServicesCount}`);
    console.log('==================================================\n');

  } catch (err) {
    console.error('❌ Critical Migration Failed:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB.');
  }
}

runMigration();
