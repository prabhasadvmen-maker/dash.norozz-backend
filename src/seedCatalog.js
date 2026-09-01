import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Category } from './models/category.model.js';
import { SubCategory } from './models/subCategory.model.js';
import { Service } from './models/service.model.js';
import { ServicePackage } from './models/servicePackage.model.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable is missing. Aborting seedCatalog.');
  process.exit(1);
}

const catalogData = [
  {
    name: 'Cleaning & Pest Control',
    icon: 'Sparkles',
    description: 'Deep home cleaning, bathroom, kitchen, sofa shampooing, and 100% pest elimination services.',
    image: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=800&q=80',
    seoTitle: 'Professional Deep Home Cleaning & Pest Control | NOROZZ',
    seoDescription: 'Book deep bathroom cleaning, kitchen degreasing, sofa shampooing, and guaranteed pest control.',
    seoKeywords: ['cleaning', 'pest control', 'home cleaning', 'sofa cleaning', 'bathroom cleaning'],
    subCategories: [
      {
        name: 'Bathroom & Kitchen Cleaning',
        icon: 'Sparkles',
        description: 'Stain removal, tile scrub, tap shine, WC sanitation, and chimney degreasing.',
        image: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80',
        services: [
          {
            name: 'Deep Bathroom Cleaning',
            description: 'Comprehensive scrub of tiles, shower glass, WC, washbasin, taps, and exhaust fan.',
            duration: '60 mins',
            price: 499,
            discount: 50,
            thumbnail: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80',
            tags: ['bathroom', 'deep cleaning', 'sanitization'],
            packages: [
              { title: 'Standard (1 Bathroom)', price: 449, description: 'Single bathroom deep cleaning' },
              { title: 'Combo (2 Bathrooms)', price: 799, description: 'Two bathrooms deep cleaning', isPopular: true },
            ],
          },
          {
            name: 'Kitchen Deep Cleaning',
            description: 'Degreasing of chimney exterior, stove burners, tile backsplash, countertops, and cabinets.',
            duration: '120 mins',
            price: 1299,
            discount: 150,
            thumbnail: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=800&q=80',
            tags: ['kitchen', 'degreasing', 'chimney cleaning'],
            packages: [
              { title: 'Without Cabinet Interior', price: 1149, description: 'Kitchen surface & exterior degreasing' },
              { title: 'Full Kitchen + Cabinets Inside', price: 1499, description: 'Complete deep cleaning including cabinet interiors', isPopular: true },
            ],
          },
        ],
      },
      {
        name: 'Full Home Cleaning',
        icon: 'Home',
        description: 'Deep dusting, floor scrubbing, balcony wash, window cleaning for entire residence.',
        image: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=800&q=80',
        services: [
          {
            name: 'Full Home Deep Cleaning (2 BHK)',
            description: 'Complete deep cleaning of 2 Bedrooms, Living Room, Kitchen, 2 Bathrooms, and Balcony.',
            duration: '180 mins',
            price: 2999,
            discount: 300,
            thumbnail: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=800&q=80',
            tags: ['2bhk', 'full home', 'deep clean'],
            packages: [
              { title: 'Furnished 2BHK Deep Clean', price: 2699, description: 'Furniture vacuuming + full home deep clean', isPopular: true },
            ],
          },
          {
            name: 'Full Home Deep Cleaning (3 BHK)',
            description: 'Intensive deep sanitation, dust removal, and floor polishing for 3 BHK flat/villa.',
            duration: '240 mins',
            price: 3899,
            discount: 400,
            thumbnail: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
            tags: ['3bhk', 'full home', 'premium cleaning'],
            packages: [
              { title: 'Furnished 3BHK Deep Clean', price: 3499, description: 'Complete 3BHK deep cleaning package', isPopular: true },
            ],
          },
        ],
      },
      {
        name: 'Sofa & Fabric Care',
        icon: 'Armchair',
        description: 'Shampooing, wet extraction, and stain removal for sofas, mattresses & carpets.',
        image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=80',
        services: [
          {
            name: 'Sofa Cleaning (5 Seater)',
            description: 'High-suction vacuuming, organic shampoo application, and deep stain extraction.',
            duration: '90 mins',
            price: 799,
            discount: 100,
            thumbnail: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=80',
            tags: ['sofa', 'shampooing', 'fabric care'],
            packages: [
              { title: '5-Seater Fabric Sofa', price: 699, description: 'Shampoo & extraction for 5 seats', isPopular: true },
              { title: '7-Seater Fabric Sofa', price: 999, description: 'Shampoo & extraction for 7 seats' },
            ],
          },
        ],
      },
      {
        name: 'Pest Control Services',
        icon: 'Bug',
        description: 'Odorless gel & spray treatment for cockroaches, ants, termites, and bed bugs.',
        image: 'https://images.unsplash.com/photo-1615811361523-6bd03d7748e7?auto=format&fit=crop&w=800&q=80',
        services: [
          {
            name: 'Cockroach & Ant Control',
            description: 'Advanced odorless gel baiting in kitchen & bathrooms + spray for wall corners. 90-day warranty.',
            duration: '45 mins',
            price: 899,
            discount: 100,
            thumbnail: 'https://images.unsplash.com/photo-1615811361523-6bd03d7748e7?auto=format&fit=crop&w=800&q=80',
            tags: ['cockroach', 'pest control', 'ant control'],
            packages: [
              { title: '1-Time Treatment (90 Days Warranty)', price: 799, description: 'Single service with 90 days protection', isPopular: true },
              { title: 'Annual Maintenance (3 Services/Year)', price: 1999, description: 'Year-long protection with 3 scheduled visits' },
            ],
          },
        ],
      },
    ],
  },
  {
    name: 'AC & Appliance Repair',
    icon: 'Wrench',
    description: 'Expert servicing, gas charging, jet wash, and repair for ACs, washing machines, and fridges.',
    image: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=80',
    seoTitle: 'AC Repair & Appliance Service at Home | NOROZZ',
    seoDescription: 'Book doorstep AC servicing, gas charging, washing machine and refrigerator repair technicians.',
    seoKeywords: ['ac repair', 'ac service', 'washing machine repair', 'appliance repair'],
    subCategories: [
      {
        name: 'AC Repair & Servicing',
        icon: 'Wrench',
        description: 'Foam jet washing, cooling check, gas refilling, and PCB board circuit repairs.',
        image: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=80',
        services: [
          {
            name: 'Foam Jet AC Service (Split/Window)',
            description: '2X deeper cleaning of cooling coils & blower using anti-bacterial foam & high pressure jet wash.',
            duration: '45 mins',
            price: 599,
            discount: 100,
            thumbnail: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=80',
            tags: ['ac service', 'foam jet', 'split ac'],
            packages: [
              { title: 'Split AC Foam Jet Wash', price: 499, description: 'Complete indoor unit foam jet wash + outdoor cleaning', isPopular: true },
              { title: 'Window AC Foam Jet Wash', price: 399, description: 'Deep cleaning for window AC unit' },
            ],
          },
          {
            name: 'AC Gas Refill & Leak Fix',
            description: 'Complete gas charging (R32/R410/R22), leak identification, copper pipe brazing & pressure check.',
            duration: '90 mins',
            price: 2499,
            discount: 300,
            thumbnail: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=80',
            tags: ['ac gas refill', 'leak repair', 'cooling fix'],
            packages: [
              { title: 'Complete Gas Charging (R32 / R410)', price: 2199, description: '100% full gas refilling with 30-day warranty', isPopular: true },
            ],
          },
        ],
      },
      {
        name: 'Washing Machine Repair',
        icon: 'RefreshCw',
        description: 'Diagnosis and repair of spin tub, drain pump, motor noise, or water leakage.',
        image: 'https://images.unsplash.com/photo-1582735689369-4fe89db7114c?auto=format&fit=crop&w=800&q=80',
        services: [
          {
            name: 'Washing Machine Inspection & Repair',
            description: 'Expert technician visit for front load, top load, or semi-automatic washing machine problems.',
            duration: '30 mins',
            price: 299,
            discount: 50,
            thumbnail: 'https://images.unsplash.com/photo-1582735689369-4fe89db7114c?auto=format&fit=crop&w=800&q=80',
            tags: ['washing machine', 'appliance repair'],
            packages: [
              { title: 'Inspection & Minor Fix', price: 249, description: 'Diagnosis + labor included for minor fixes', isPopular: true },
            ],
          },
        ],
      },
      {
        name: 'Refrigerator Repair',
        icon: 'Box',
        description: 'Compressor relay fix, cooling coil repair, thermostat replacement, and gas charging.',
        image: 'https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?auto=format&fit=crop&w=800&q=80',
        services: [
          {
            name: 'Single/Double Door Refrigerator Repair',
            description: 'Fixing no-cooling, excessive frost buildup, water leakage, or compressor startup issues.',
            duration: '45 mins',
            price: 399,
            discount: 50,
            thumbnail: 'https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?auto=format&fit=crop&w=800&q=80',
            tags: ['refrigerator', 'fridge repair'],
            packages: [
              { title: 'Fridge Checkup & Repair Visit', price: 349, description: 'Detailed fault diagnosis & consultation', isPopular: true },
            ],
          },
        ],
      },
    ],
  },
  {
    name: 'Plumbing, Electrical & Carpentry',
    icon: 'Zap',
    description: 'Certified electricians, plumbers, and carpenters for instant home fixes and installations.',
    image: 'https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&w=800&q=80',
    seoTitle: 'Doorstep Electrician, Plumber & Carpenter Services | NOROZZ',
    seoDescription: 'Instant booking for verified electricians, plumbers, and carpenters near you.',
    seoKeywords: ['electrician', 'plumber', 'carpenter', 'handyman', 'ro repair'],
    subCategories: [
      {
        name: 'Electrical Services',
        icon: 'Zap',
        description: 'Fix short-circuits, install ceiling fans, decorative lights, MCBs, and heavy switchboard sockets.',
        image: 'https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&w=800&q=80',
        services: [
          {
            name: 'Switch, Socket & Fuse Repair',
            description: 'Replacement or repair of damaged 6A/16A electrical sockets, switches, or MCB trippers.',
            duration: '30 mins',
            price: 149,
            discount: 20,
            thumbnail: 'https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&w=800&q=80',
            tags: ['electrician', 'switch repair', 'wiring'],
            packages: [
              { title: 'Single Switch/Socket Fix', price: 129, description: 'Fix or replacement of 1 unit', isPopular: true },
              { title: '3 Units Combo', price: 299, description: 'Fix or replacement of up to 3 units' },
            ],
          },
          {
            name: 'Fan & Light Fixture Installation',
            description: 'Safe mounting and connection of ceiling fans, exhaust fans, wall lights, or chandeliers.',
            duration: '30 mins',
            price: 199,
            discount: 30,
            thumbnail: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=800&q=80',
            tags: ['fan installation', 'lighting', 'electrician'],
            packages: [
              { title: 'Ceiling Fan Installation', price: 169, description: 'Assembly & mounting of 1 ceiling fan', isPopular: true },
            ],
          },
        ],
      },
      {
        name: 'Plumbing Solutions',
        icon: 'Droplet',
        description: 'Stop tap drips, unclog drains, fix jet spray leaks, install RO purifiers and water pumps.',
        image: 'https://images.unsplash.com/photo-1505798577917-a65157d3320a?auto=format&fit=crop&w=800&q=80',
        services: [
          {
            name: 'Tap & Shower Leakage Fix',
            description: 'Quick repair or replacement of leaking tap spindles, shower mixers, or health faucets.',
            duration: '30 mins',
            price: 199,
            discount: 30,
            thumbnail: 'https://images.unsplash.com/photo-1505798577917-a65157d3320a?auto=format&fit=crop&w=800&q=80',
            tags: ['plumber', 'tap leak', 'shower fix'],
            packages: [
              { title: 'Single Tap/Jet Repair', price: 169, description: 'Fix 1 leaking faucet or jet spray', isPopular: true },
            ],
          },
          {
            name: 'Water Purifier (RO) Service',
            description: 'Sediment & carbon filter replacement, membrane check, TDS adjustment, and sanitizer flush.',
            duration: '45 mins',
            price: 499,
            discount: 50,
            thumbnail: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=800&q=80',
            tags: ['ro service', 'water purifier', 'filter replacement'],
            packages: [
              { title: 'Standard RO Servicing', price: 449, description: 'Filter cleaning & complete system health check', isPopular: true },
              { title: 'All Filters Replacement Pack', price: 1299, description: 'Sediment, Carbon, and RO Membrane replacement' },
            ],
          },
        ],
      },
      {
        name: 'Carpentry & Furniture Repair',
        icon: 'Tool',
        description: 'Door lock fitting, cabinet hinge alignment, bed assembly, and customized wooden furniture repair.',
        image: 'https://images.unsplash.com/photo-1538688525198-9b88f6f53126?auto=format&fit=crop&w=800&q=80',
        services: [
          {
            name: 'Door Lock Installation & Repair',
            description: 'Installing mortise locks, cylindrical handles, latch locks, or repairing stuck doors.',
            duration: '45 mins',
            price: 299,
            discount: 50,
            thumbnail: 'https://images.unsplash.com/photo-1538688525198-9b88f6f53126?auto=format&fit=crop&w=800&q=80',
            tags: ['carpenter', 'lock repair', 'door fitting'],
            packages: [
              { title: 'Lock Installation/Repair', price: 249, description: 'Labor for 1 door lock installation or fix', isPopular: true },
            ],
          },
        ],
      },
    ],
  },
  {
    name: 'Salon & Beauty for Women',
    icon: 'Sparkles',
    description: 'At-home professional salon experiences: facials, Rica waxing, manicures, pedicures & hair care.',
    image: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=800&q=80',
    seoTitle: 'At-Home Salon for Women | NOROZZ',
    seoDescription: 'Hygienic salon services at home: facials, waxing, manicures, and pedicures by verified beauticians.',
    seoKeywords: ['salon at home', 'women salon', 'waxing', 'facial', 'manicure'],
    subCategories: [
      {
        name: 'Facial & Skincare',
        icon: 'Sparkles',
        description: 'Dermatologically tested glow facials, skin tightening, anti-tan cleanup & herbal treatments.',
        image: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=800&q=80',
        services: [
          {
            name: 'O3+ Glow Facial & De-Tan',
            description: 'Premium O3+ glow facial with deep pore cleansing, skin polishing, and anti-tan face mask.',
            duration: '60 mins',
            price: 1199,
            discount: 200,
            thumbnail: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=800&q=80',
            tags: ['facial', 'o3+', 'skin glow', 'detan'],
            packages: [
              { title: 'O3+ Brightening Facial', price: 999, description: '60-min glow facial treatment', isPopular: true },
            ],
          },
        ],
      },
      {
        name: 'Waxing & Threading',
        icon: 'Scissors',
        description: 'Painless Rica wax, honey wax, and eyebrow threading with disposable kits.',
        image: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=800&q=80',
        services: [
          {
            name: 'Full Body Rica Waxing',
            description: 'Lipo-soluble Rica wax for smooth hair removal on full arms, full legs, and underarms.',
            duration: '75 mins',
            price: 1499,
            discount: 200,
            thumbnail: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=800&q=80',
            tags: ['waxing', 'rica wax', 'full body'],
            packages: [
              { title: 'Rica Full Arms + Full Legs + Underarms', price: 1299, description: 'Complete Rica waxing combo package', isPopular: true },
            ],
          },
        ],
      },
    ],
  },
  {
    name: "Men's Salon & Grooming",
    icon: 'Scissors',
    description: 'Hygienic haircuts, beard grooming, facial cleansers, and head massages delivered to your doorstep.',
    image: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=800&q=80',
    seoTitle: "Men's Salon & Haircut at Home | NOROZZ",
    seoDescription: "Book professional men's haircut, beard styling, and head massages at home.",
    seoKeywords: ['mens salon', 'haircut at home', 'beard trim', 'grooming'],
    subCategories: [
      {
        name: 'Haircare & Styling',
        icon: 'Scissors',
        description: 'Modern hair styling, face-shape customized cuts, hair coloring, and relaxing head massages.',
        image: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=800&q=80',
        services: [
          {
            name: "Men's Haircut & Head Massage",
            description: 'Stylish haircut by top barbers + 10 min therapeutic scalp massage with ayurvedic oil.',
            duration: '45 mins',
            price: 299,
            discount: 50,
            thumbnail: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=800&q=80',
            tags: ['haircut', 'mens salon', 'head massage'],
            packages: [
              { title: 'Haircut + 10 min Massage', price: 249, description: 'Haircut with neck & head massage', isPopular: true },
            ],
          },
        ],
      },
      {
        name: 'Beard Styling & Shave',
        icon: 'UserCheck',
        description: 'Sharp razor beard edging, beard trimming, conditioning oil, and hot towel shaves.',
        image: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=800&q=80',
        services: [
          {
            name: 'Beard Trim & Hot Towel Shave',
            description: 'Precision beard shaping with razor lining followed by hot towel steam & balm application.',
            duration: '30 mins',
            price: 199,
            discount: 30,
            thumbnail: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=800&q=80',
            tags: ['beard trim', 'shave', 'grooming'],
            packages: [
              { title: 'Beard Styling & Steam', price: 169, description: 'Precision styling + hot towel treatment', isPopular: true },
            ],
          },
        ],
      },
    ],
  },
  {
    name: 'Home Painting & Decor',
    icon: 'Paintbrush',
    description: 'Wall painting, waterproof dampness treatment, stencil designs, and false ceiling solutions.',
    image: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=800&q=80',
    seoTitle: 'House Wall Painting & Waterproofing Services | NOROZZ',
    seoDescription: 'Book Asian Paints verified painters for interior wall painting, damp proofing, and stencil design.',
    seoKeywords: ['painting', 'wall painting', 'waterproofing', 'asian paints'],
    subCategories: [
      {
        name: 'Wall Painting & Waterproofing',
        icon: 'Paintbrush',
        description: 'Premium acrylic emulsion paint coating with laser wall levelling & masking tape protection.',
        image: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=800&q=80',
        services: [
          {
            name: '1 Room Accent Wall Painting',
            description: 'Application of 2 coats Asian Paints Royale / Berger Silk on room accent walls.',
            duration: '1 day',
            price: 2499,
            discount: 300,
            thumbnail: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=800&q=80',
            tags: ['wall painting', 'home decor', 'asian paints'],
            packages: [
              { title: 'Single Wall Premium Finish', price: 2199, description: '2 coats premium interior emulsion', isPopular: true },
            ],
          },
        ],
      },
    ],
  },
];

export async function seedCatalogData() {
  try {
    console.log('🌱 Starting Catalog Data Seeding (Categories, SubCategories, Services)...');

    let catSort = 1;
    for (const cat of catalogData) {
      // Find or Create Category
      let category = await Category.findOne({ name: cat.name });
      if (!category) {
        category = await Category.create({
          name: cat.name,
          icon: cat.icon,
          description: cat.description,
          image: cat.image,
          seoTitle: cat.seoTitle,
          seoDescription: cat.seoDescription,
          seoKeywords: cat.seoKeywords,
          sortOrder: catSort++,
          status: 'active',
        });
        console.log(`  📁 Created Category: ${category.name}`);
      } else {
        console.log(`  📁 Category exists: ${category.name}`);
      }

      let subSort = 1;
      for (const sub of cat.subCategories) {
        // Find or Create SubCategory
        let subCategory = await SubCategory.findOne({ name: sub.name, category: category._id });
        if (!subCategory) {
          subCategory = await SubCategory.create({
            name: sub.name,
            category: category._id,
            icon: sub.icon,
            description: sub.description,
            image: sub.image,
            sortOrder: subSort++,
            status: 'active',
          });
          console.log(`    📂 Created SubCategory: ${subCategory.name}`);
        } else {
          console.log(`    📂 SubCategory exists: ${subCategory.name}`);
        }

        let srvSort = 1;
        for (const srv of sub.services) {
          // Find or Create Service
          let service = await Service.findOne({ name: srv.name, subCategory: subCategory._id });
          if (!service) {
            const finalP = Math.max(0, srv.price - (srv.discount || 0));
            service = await Service.create({
              category: category._id,
              subCategory: subCategory._id,
              name: srv.name,
              description: srv.description,
              duration: srv.duration,
              price: srv.price,
              discount: srv.discount || 0,
              finalPrice: finalP,
              thumbnail: srv.thumbnail,
              gallery: [srv.thumbnail],
              cities: ['Delhi NCR', 'Bengaluru', 'Mumbai', 'Hyderabad', 'Pune', 'Jaipur', 'Nizamabad'],
              tags: srv.tags || [],
              sortOrder: srvSort++,
              status: 'active',
            });
            console.log(`      🛠️ Created Service: ${service.name} (Price: ₹${service.finalPrice})`);
          } else {
            console.log(`      🛠️ Service exists: ${service.name}`);
          }

          // Seed dedicated ServicePackage documents linked to parent service (Single Source of Truth)
          if (Array.isArray(srv.packages) && srv.packages.length > 0) {
            let pkgOrder = 0;
            for (const pkg of srv.packages) {
              let existingPkg = await ServicePackage.findOne({
                service: service._id,
                title: pkg.title,
              });

              if (!existingPkg) {
                const slugName = (pkg.title || 'package')
                  .toLowerCase()
                  .trim()
                  .replace(/[^a-z0-9 -]/g, '')
                  .replace(/\s+/g, '-')
                  .replace(/-+/g, '-');

                await ServicePackage.create({
                  service: service._id,
                  title: pkg.title,
                  slug: `${slugName}-${pkgOrder + 1}`,
                  description: pkg.description || service.description || '',
                  price: pkg.price || service.price || 499,
                  discountType: 'none',
                  discountValue: 0,
                  finalPrice: pkg.price || service.price || 499,
                  duration: service.duration || '45 mins',
                  features: Array.isArray(pkg.features) ? pkg.features : [],
                  isPopular: Boolean(pkg.isPopular),
                  isRecommended: pkgOrder === 0,
                  sortOrder: pkgOrder++,
                  status: 'active',
                });
                console.log(`        📦 Created Service Package: ${pkg.title} (₹${pkg.price})`);
              }
            }
          }
        }
      }
    }

    console.log('✨ Catalog Seeding Completed Successfully!');
  } catch (error) {
    console.error('❌ Catalog Seeding Error:', error);
    throw error;
  }
}

// Execute standalone if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      await mongoose.connect(MONGODB_URI);
      console.log('Connected to MongoDB for Catalog Seeding...');
      await seedCatalogData();
      process.exit(0);
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  })();
}
