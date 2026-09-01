import 'dotenv/config';
import mongoose from 'mongoose';

import { Category } from '../models/category.model.js';
import { SubCategory } from '../models/subCategory.model.js';
import { Service } from '../models/service.model.js';
import { ServicePackage } from '../models/servicePackage.model.js';

const MONGO_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;

if (!MONGO_URI) {
  throw new Error('MONGODB_URI/DATABASE_URL is missing in .env');
}

/*
 * NOROZZ ENRICHED MASTER CATALOGUE
 *
 * Source structure: NOROZZ Partner Service Catalogue PDF.
 * This seed adds launch-ready descriptions, images, SEO fields and prices.
 *
 * IMPORTANT:
 * - The PDF names package options but does NOT provide prices.
 * - Prices below are NOROZZ launch-price estimates for Delhi NCR,
 *   benchmarked against current market/service-platform pricing.
 * - Replace them with your final commercial prices before production.
 * - Images use remote demo URLs; for production, upload assets to
 *   Cloudflare R2 and replace these URLs.
 *
 * The PDF has an internal count mismatch: the listed tables contain
 * 10 categories, 20 sub-categories, 41 services and 123 package options,
 * while its final note says 40/120. This seed preserves every listed row.
 */

const catalogue = [
  {
    "name": "Home Cleaning & Housekeeping",
    "description": "Household cleaning and housekeeping services delivered by trained professionals.",
    "image": "https://loremflickr.com/1200/800/home-cleaning-housekeeping?lock=1",
    "icon": "Sparkles",
    "seoTitle": "Home Cleaning & Housekeeping | NOROZZ",
    "seoDescription": "Household cleaning and housekeeping services delivered by trained professionals.",
    "seoKeywords": [
      "home cleaning & housekeeping",
      "norozz",
      "delhi ncr",
      "home services"
    ],
    "subCategories": [
      {
        "name": "Cleaning Services",
        "description": "Routine and deep cleaning services for kitchens, bathrooms and complete homes.",
        "image": "https://loremflickr.com/1200/800/home%20cleaning%20housekeeping%2CCleaning-Services?lock=101",
        "icon": "Sparkles",
        "services": [
          {
            "name": "Home Cleaning",
            "description": "Complete home cleaning covering living areas, bedrooms and common surfaces.",
            "duration": "45 mins",
            "price": 799,
            "discount": 0,
            "finalPrice": 799,
            "thumbnail": "https://loremflickr.com/1200/800/Home%20Cleaning?lock=1011",
            "gallery": [
              "https://loremflickr.com/1200/800/Home%20Cleaning?lock=10102",
              "https://loremflickr.com/1200/800/Home%20Cleaning%20and%20Housekeeping?lock=10103"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "home-cleaning",
              "cleaning-services",
              "home-cleaning-housekeeping"
            ],
            "seoTitle": "Home Cleaning in Delhi NCR | NOROZZ",
            "seoDescription": "Complete home cleaning covering living areas, bedrooms and common surfaces.",
            "seoKeywords": [
              "home cleaning",
              "cleaning services",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Basic Home Cleaning",
                "price": 799,
                "description": "Essential home cleaning service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Standard Home Cleaning",
                "price": 1299,
                "description": "Recommended home cleaning package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Deep Home Cleaning",
                "price": 1999,
                "description": "Comprehensive home cleaning package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          },
          {
            "name": "Kitchen Cleaning",
            "description": "Degreasing and detailed cleaning of kitchen surfaces, cabinets and work areas.",
            "duration": "45 mins",
            "price": 499,
            "discount": 0,
            "finalPrice": 499,
            "thumbnail": "https://loremflickr.com/1200/800/Kitchen%20Cleaning?lock=1012",
            "gallery": [
              "https://loremflickr.com/1200/800/Kitchen%20Cleaning?lock=10104",
              "https://loremflickr.com/1200/800/Home%20Cleaning%20and%20Housekeeping?lock=10105"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "kitchen-cleaning",
              "cleaning-services",
              "home-cleaning-housekeeping"
            ],
            "seoTitle": "Kitchen Cleaning in Delhi NCR | NOROZZ",
            "seoDescription": "Degreasing and detailed cleaning of kitchen surfaces, cabinets and work areas.",
            "seoKeywords": [
              "kitchen cleaning",
              "cleaning services",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Kitchen Basic Clean",
                "price": 499,
                "description": "Essential kitchen cleaning service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Kitchen Deep Clean",
                "price": 799,
                "description": "Recommended kitchen cleaning package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Kitchen Premium Clean",
                "price": 1199,
                "description": "Comprehensive kitchen cleaning package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          },
          {
            "name": "Bathroom Cleaning",
            "description": "Detailed bathroom cleaning with stain, tile and hygiene-focused treatment.",
            "duration": "45 mins",
            "price": 399,
            "discount": 0,
            "finalPrice": 399,
            "thumbnail": "https://loremflickr.com/1200/800/Bathroom%20Cleaning?lock=1013",
            "gallery": [
              "https://loremflickr.com/1200/800/Bathroom%20Cleaning?lock=10106",
              "https://loremflickr.com/1200/800/Home%20Cleaning%20and%20Housekeeping?lock=10107"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "bathroom-cleaning",
              "cleaning-services",
              "home-cleaning-housekeeping"
            ],
            "seoTitle": "Bathroom Cleaning in Delhi NCR | NOROZZ",
            "seoDescription": "Detailed bathroom cleaning with stain, tile and hygiene-focused treatment.",
            "seoKeywords": [
              "bathroom cleaning",
              "cleaning services",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Bathroom Basic Clean",
                "price": 399,
                "description": "Essential bathroom cleaning service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Bathroom Deep Clean",
                "price": 599,
                "description": "Recommended bathroom cleaning package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Bathroom Sanitization",
                "price": 899,
                "description": "Comprehensive bathroom cleaning package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          }
        ]
      },
      {
        "name": "Housekeeping Services",
        "description": "Room and floor cleaning services for everyday housekeeping needs.",
        "image": "https://loremflickr.com/1200/800/home%20cleaning%20housekeeping%2CHousekeeping-Services?lock=102",
        "icon": "House",
        "services": [
          {
            "name": "Room Cleaning",
            "description": "Professional cleaning for bedrooms and living spaces with dust and surface care.",
            "duration": "45 mins",
            "price": 399,
            "discount": 0,
            "finalPrice": 399,
            "thumbnail": "https://loremflickr.com/1200/800/Room%20Cleaning?lock=1021",
            "gallery": [
              "https://loremflickr.com/1200/800/Room%20Cleaning?lock=10202",
              "https://loremflickr.com/1200/800/Home%20Cleaning%20and%20Housekeeping?lock=10203"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "room-cleaning",
              "housekeeping-services",
              "home-cleaning-housekeeping"
            ],
            "seoTitle": "Room Cleaning in Delhi NCR | NOROZZ",
            "seoDescription": "Professional cleaning for bedrooms and living spaces with dust and surface care.",
            "seoKeywords": [
              "room cleaning",
              "housekeeping services",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Single Room Clean",
                "price": 399,
                "description": "Essential room cleaning service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Full Room Deep Clean",
                "price": 699,
                "description": "Recommended room cleaning package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Premium Room Care",
                "price": 999,
                "description": "Comprehensive room cleaning package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          },
          {
            "name": "Floor Cleaning",
            "description": "Floor cleaning using suitable manual or machine-assisted methods.",
            "duration": "45 mins",
            "price": 599,
            "discount": 0,
            "finalPrice": 599,
            "thumbnail": "https://loremflickr.com/1200/800/Floor%20Cleaning?lock=1022",
            "gallery": [
              "https://loremflickr.com/1200/800/Floor%20Cleaning?lock=10204",
              "https://loremflickr.com/1200/800/Home%20Cleaning%20and%20Housekeeping?lock=10205"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "floor-cleaning",
              "housekeeping-services",
              "home-cleaning-housekeeping"
            ],
            "seoTitle": "Floor Cleaning in Delhi NCR | NOROZZ",
            "seoDescription": "Floor cleaning using suitable manual or machine-assisted methods.",
            "seoKeywords": [
              "floor cleaning",
              "housekeeping services",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Basic Floor Cleaning",
                "price": 599,
                "description": "Essential floor cleaning service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Machine Floor Cleaning",
                "price": 999,
                "description": "Recommended floor cleaning package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Premium Floor Treatment",
                "price": 1499,
                "description": "Comprehensive floor cleaning package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "name": "Sofa, Carpet & Fabric Care",
    "description": "Professional sofa, carpet, mattress and upholstery cleaning and fabric care.",
    "image": "https://loremflickr.com/1200/800/sofa-carpet-upholstery-cleaning?lock=2",
    "icon": "Armchair",
    "seoTitle": "Sofa, Carpet & Fabric Care | NOROZZ",
    "seoDescription": "Professional sofa, carpet, mattress and upholstery cleaning and fabric care.",
    "seoKeywords": [
      "sofa, carpet & fabric care",
      "norozz",
      "delhi ncr",
      "home services"
    ],
    "subCategories": [
      {
        "name": "Sofa & Upholstery",
        "description": "Cleaning and protection for sofas, chairs and upholstered furniture.",
        "image": "https://loremflickr.com/1200/800/sofa%20carpet%20upholstery%20cleaning%2CSofa-%20-Upholstery?lock=201",
        "icon": "Armchair",
        "services": [
          {
            "name": "Sofa Cleaning",
            "description": "Deep cleaning for sofa upholstery to remove dust, stains and everyday buildup.",
            "duration": "45 mins",
            "price": 499,
            "discount": 0,
            "finalPrice": 499,
            "thumbnail": "https://loremflickr.com/1200/800/Sofa%20Cleaning?lock=2011",
            "gallery": [
              "https://loremflickr.com/1200/800/Sofa%20Cleaning?lock=20102",
              "https://loremflickr.com/1200/800/Sofa%2C%20Carpet%20and%20Fabric%20Care?lock=20103"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "sofa-cleaning",
              "sofa-upholstery",
              "sofa-carpet-fabric-care"
            ],
            "seoTitle": "Sofa Cleaning in Delhi NCR | NOROZZ",
            "seoDescription": "Deep cleaning for sofa upholstery to remove dust, stains and everyday buildup.",
            "seoKeywords": [
              "sofa cleaning",
              "sofa & upholstery",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Basic Sofa Clean",
                "price": 499,
                "description": "Essential sofa cleaning service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Deep Sofa Clean",
                "price": 799,
                "description": "Recommended sofa cleaning package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Premium Sofa Treatment",
                "price": 1199,
                "description": "Comprehensive sofa cleaning package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          },
          {
            "name": "Chair Cleaning",
            "description": "Professional cleaning and fabric care for household and office chairs.",
            "duration": "45 mins",
            "price": 299,
            "discount": 0,
            "finalPrice": 299,
            "thumbnail": "https://loremflickr.com/1200/800/Chair%20Cleaning?lock=2012",
            "gallery": [
              "https://loremflickr.com/1200/800/Chair%20Cleaning?lock=20104",
              "https://loremflickr.com/1200/800/Sofa%2C%20Carpet%20and%20Fabric%20Care?lock=20105"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "chair-cleaning",
              "sofa-upholstery",
              "sofa-carpet-fabric-care"
            ],
            "seoTitle": "Chair Cleaning in Delhi NCR | NOROZZ",
            "seoDescription": "Professional cleaning and fabric care for household and office chairs.",
            "seoKeywords": [
              "chair cleaning",
              "sofa & upholstery",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Basic Chair Clean",
                "price": 299,
                "description": "Essential chair cleaning service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Deep Chair Clean",
                "price": 499,
                "description": "Recommended chair cleaning package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Fabric Protection Package",
                "price": 799,
                "description": "Comprehensive chair cleaning package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          }
        ]
      },
      {
        "name": "Carpet & Mattress",
        "description": "Deep cleaning and sanitization for carpets and mattresses.",
        "image": "https://loremflickr.com/1200/800/sofa%20carpet%20upholstery%20cleaning%2CCarpet-%20-Mattress?lock=202",
        "icon": "Layers",
        "services": [
          {
            "name": "Carpet Cleaning",
            "description": "Deep carpet cleaning to lift dirt, dust and common stains.",
            "duration": "45 mins",
            "price": 499,
            "discount": 0,
            "finalPrice": 499,
            "thumbnail": "https://loremflickr.com/1200/800/Carpet%20Cleaning?lock=2021",
            "gallery": [
              "https://loremflickr.com/1200/800/Carpet%20Cleaning?lock=20202",
              "https://loremflickr.com/1200/800/Sofa%2C%20Carpet%20and%20Fabric%20Care?lock=20203"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "carpet-cleaning",
              "carpet-mattress",
              "sofa-carpet-fabric-care"
            ],
            "seoTitle": "Carpet Cleaning in Delhi NCR | NOROZZ",
            "seoDescription": "Deep carpet cleaning to lift dirt, dust and common stains.",
            "seoKeywords": [
              "carpet cleaning",
              "carpet & mattress",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Basic Carpet Clean",
                "price": 499,
                "description": "Essential carpet cleaning service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Deep Carpet Wash",
                "price": 799,
                "description": "Recommended carpet cleaning package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Premium Carpet Treatment",
                "price": 1299,
                "description": "Comprehensive carpet cleaning package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          },
          {
            "name": "Mattress Cleaning",
            "description": "Mattress cleaning and sanitization focused on dust, stains and freshness.",
            "duration": "45 mins",
            "price": 499,
            "discount": 0,
            "finalPrice": 499,
            "thumbnail": "https://loremflickr.com/1200/800/Mattress%20Cleaning?lock=2022",
            "gallery": [
              "https://loremflickr.com/1200/800/Mattress%20Cleaning?lock=20204",
              "https://loremflickr.com/1200/800/Sofa%2C%20Carpet%20and%20Fabric%20Care?lock=20205"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "mattress-cleaning",
              "carpet-mattress",
              "sofa-carpet-fabric-care"
            ],
            "seoTitle": "Mattress Cleaning in Delhi NCR | NOROZZ",
            "seoDescription": "Mattress cleaning and sanitization focused on dust, stains and freshness.",
            "seoKeywords": [
              "mattress cleaning",
              "carpet & mattress",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Single Mattress Clean",
                "price": 499,
                "description": "Essential mattress cleaning service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Deep Mattress Clean",
                "price": 799,
                "description": "Recommended mattress cleaning package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Sanitization Package",
                "price": 1199,
                "description": "Comprehensive mattress cleaning package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "name": "Electrical Services",
    "description": "Electrical repair, installation, wiring and power backup services.",
    "image": "https://loremflickr.com/1200/800/electrician-electrical-repair?lock=3",
    "icon": "Zap",
    "seoTitle": "Electrical Services | NOROZZ",
    "seoDescription": "Electrical repair, installation, wiring and power backup services.",
    "seoKeywords": [
      "electrical services",
      "norozz",
      "delhi ncr",
      "home services"
    ],
    "subCategories": [
      {
        "name": "Electrical Repair",
        "description": "Diagnosis and repair for switches, sockets and household wiring.",
        "image": "https://loremflickr.com/1200/800/electrician%20electrical%20repair%2CElectrical-Repair?lock=301",
        "icon": "Zap",
        "services": [
          {
            "name": "Switch & Socket",
            "description": "Repair and replacement support for common household switches and sockets.",
            "duration": "45 mins",
            "price": 249,
            "discount": 0,
            "finalPrice": 249,
            "thumbnail": "https://loremflickr.com/1200/800/Switch%20and%20Socket?lock=3011",
            "gallery": [
              "https://loremflickr.com/1200/800/Switch%20and%20Socket?lock=30102",
              "https://loremflickr.com/1200/800/Electrical%20Services?lock=30103"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "switch-socket",
              "electrical-repair",
              "electrical-services"
            ],
            "seoTitle": "Switch & Socket in Delhi NCR | NOROZZ",
            "seoDescription": "Repair and replacement support for common household switches and sockets.",
            "seoKeywords": [
              "switch & socket",
              "electrical repair",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Switch Replacement",
                "price": 249,
                "description": "Essential switch & socket service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Socket Replacement",
                "price": 399,
                "description": "Recommended switch & socket package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Full Switchboard Package",
                "price": 699,
                "description": "Comprehensive switch & socket package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          },
          {
            "name": "Wiring & Repair",
            "description": "Diagnosis and repair of minor to complete household wiring issues.",
            "duration": "45 mins",
            "price": 499,
            "discount": 0,
            "finalPrice": 499,
            "thumbnail": "https://loremflickr.com/1200/800/Wiring%20and%20Repair?lock=3012",
            "gallery": [
              "https://loremflickr.com/1200/800/Wiring%20and%20Repair?lock=30104",
              "https://loremflickr.com/1200/800/Electrical%20Services?lock=30105"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "wiring-repair",
              "electrical-repair",
              "electrical-services"
            ],
            "seoTitle": "Wiring & Repair in Delhi NCR | NOROZZ",
            "seoDescription": "Diagnosis and repair of minor to complete household wiring issues.",
            "seoKeywords": [
              "wiring & repair",
              "electrical repair",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Minor Wiring Repair",
                "price": 499,
                "description": "Essential wiring & repair service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Room Wiring Service",
                "price": 999,
                "description": "Recommended wiring & repair package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Complete Wiring Package",
                "price": 1999,
                "description": "Comprehensive wiring & repair package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          }
        ]
      },
      {
        "name": "Electrical Installation",
        "description": "Safe installation of fans, lights and inverter power systems.",
        "image": "https://loremflickr.com/1200/800/electrician%20electrical%20repair%2CElectrical-Installation?lock=302",
        "icon": "Lightbulb",
        "services": [
          {
            "name": "Fan & Light",
            "description": "Installation support for ceiling fans, lights and common fixtures.",
            "duration": "45 mins",
            "price": 249,
            "discount": 0,
            "finalPrice": 249,
            "thumbnail": "https://loremflickr.com/1200/800/Fan%20and%20Light?lock=3021",
            "gallery": [
              "https://loremflickr.com/1200/800/Fan%20and%20Light?lock=30202",
              "https://loremflickr.com/1200/800/Electrical%20Services?lock=30203"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "fan-light",
              "electrical-installation",
              "electrical-services"
            ],
            "seoTitle": "Fan & Light in Delhi NCR | NOROZZ",
            "seoDescription": "Installation support for ceiling fans, lights and common fixtures.",
            "seoKeywords": [
              "fan & light",
              "electrical installation",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Fan Installation",
                "price": 249,
                "description": "Essential fan & light service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Light Installation",
                "price": 399,
                "description": "Recommended fan & light package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Fan + Light Combo",
                "price": 699,
                "description": "Comprehensive fan & light package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          },
          {
            "name": "Power Backup",
            "description": "Inverter and battery installation, checking and service support.",
            "duration": "45 mins",
            "price": 399,
            "discount": 0,
            "finalPrice": 399,
            "thumbnail": "https://loremflickr.com/1200/800/Power%20Backup?lock=3022",
            "gallery": [
              "https://loremflickr.com/1200/800/Power%20Backup?lock=30204",
              "https://loremflickr.com/1200/800/Electrical%20Services?lock=30205"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "power-backup",
              "electrical-installation",
              "electrical-services"
            ],
            "seoTitle": "Power Backup in Delhi NCR | NOROZZ",
            "seoDescription": "Inverter and battery installation, checking and service support.",
            "seoKeywords": [
              "power backup",
              "electrical installation",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Inverter Installation",
                "price": 399,
                "description": "Essential power backup service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Battery Check & Service",
                "price": 699,
                "description": "Recommended power backup package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Inverter + Battery Package",
                "price": 1199,
                "description": "Comprehensive power backup package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "name": "Plumbing & Water Services",
    "description": "Plumbing repairs, leakage solutions, water tank and water line services.",
    "image": "https://loremflickr.com/1200/800/plumber-plumbing-water?lock=4",
    "icon": "Wrench",
    "seoTitle": "Plumbing & Water Services | NOROZZ",
    "seoDescription": "Plumbing repairs, leakage solutions, water tank and water line services.",
    "seoKeywords": [
      "plumbing & water services",
      "norozz",
      "delhi ncr",
      "home services"
    ],
    "subCategories": [
      {
        "name": "Plumbing Repair",
        "description": "Tap, faucet and leakage repair by trained plumbing professionals.",
        "image": "https://loremflickr.com/1200/800/plumber%20plumbing%20water%2CPlumbing-Repair?lock=401",
        "icon": "Wrench",
        "services": [
          {
            "name": "Tap & Faucet",
            "description": "Repair, replacement and installation support for taps and faucets.",
            "duration": "45 mins",
            "price": 249,
            "discount": 0,
            "finalPrice": 249,
            "thumbnail": "https://loremflickr.com/1200/800/Tap%20and%20Faucet?lock=4011",
            "gallery": [
              "https://loremflickr.com/1200/800/Tap%20and%20Faucet?lock=40102",
              "https://loremflickr.com/1200/800/Plumbing%20and%20Water%20Services?lock=40103"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "tap-faucet",
              "plumbing-repair",
              "plumbing-water-services"
            ],
            "seoTitle": "Tap & Faucet in Delhi NCR | NOROZZ",
            "seoDescription": "Repair, replacement and installation support for taps and faucets.",
            "seoKeywords": [
              "tap & faucet",
              "plumbing repair",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Tap Repair",
                "price": 249,
                "description": "Essential tap & faucet service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Tap Replacement",
                "price": 449,
                "description": "Recommended tap & faucet package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Premium Faucet Installation",
                "price": 799,
                "description": "Comprehensive tap & faucet package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          },
          {
            "name": "Leakage Repair",
            "description": "Diagnosis and repair of common pipe and fixture leakage problems.",
            "duration": "45 mins",
            "price": 299,
            "discount": 0,
            "finalPrice": 299,
            "thumbnail": "https://loremflickr.com/1200/800/Leakage%20Repair?lock=4012",
            "gallery": [
              "https://loremflickr.com/1200/800/Leakage%20Repair?lock=40104",
              "https://loremflickr.com/1200/800/Plumbing%20and%20Water%20Services?lock=40105"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "leakage-repair",
              "plumbing-repair",
              "plumbing-water-services"
            ],
            "seoTitle": "Leakage Repair in Delhi NCR | NOROZZ",
            "seoDescription": "Diagnosis and repair of common pipe and fixture leakage problems.",
            "seoKeywords": [
              "leakage repair",
              "plumbing repair",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Minor Leakage Repair",
                "price": 299,
                "description": "Essential leakage repair service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Pipe Leakage Repair",
                "price": 599,
                "description": "Recommended leakage repair package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Complete Leakage Package",
                "price": 999,
                "description": "Comprehensive leakage repair package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          }
        ]
      },
      {
        "name": "Water Systems",
        "description": "Water tank cleaning and water line installation or replacement.",
        "image": "https://loremflickr.com/1200/800/plumber%20plumbing%20water%2CWater-Systems?lock=402",
        "icon": "Droplets",
        "services": [
          {
            "name": "Water Tank",
            "description": "Water tank cleaning, deep cleaning and sanitization service.",
            "duration": "45 mins",
            "price": 699,
            "discount": 0,
            "finalPrice": 699,
            "thumbnail": "https://loremflickr.com/1200/800/Water%20Tank?lock=4021",
            "gallery": [
              "https://loremflickr.com/1200/800/Water%20Tank?lock=40202",
              "https://loremflickr.com/1200/800/Plumbing%20and%20Water%20Services?lock=40203"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "water-tank",
              "water-systems",
              "plumbing-water-services"
            ],
            "seoTitle": "Water Tank in Delhi NCR | NOROZZ",
            "seoDescription": "Water tank cleaning, deep cleaning and sanitization service.",
            "seoKeywords": [
              "water tank",
              "water systems",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Tank Cleaning",
                "price": 699,
                "description": "Essential water tank service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Tank Deep Cleaning",
                "price": 1099,
                "description": "Recommended water tank package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Tank Sanitization Package",
                "price": 1599,
                "description": "Comprehensive water tank package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          },
          {
            "name": "Water Lines",
            "description": "Installation and replacement support for household water lines and pipes.",
            "duration": "45 mins",
            "price": 499,
            "discount": 0,
            "finalPrice": 499,
            "thumbnail": "https://loremflickr.com/1200/800/Water%20Lines?lock=4022",
            "gallery": [
              "https://loremflickr.com/1200/800/Water%20Lines?lock=40204",
              "https://loremflickr.com/1200/800/Plumbing%20and%20Water%20Services?lock=40205"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "water-lines",
              "water-systems",
              "plumbing-water-services"
            ],
            "seoTitle": "Water Lines in Delhi NCR | NOROZZ",
            "seoDescription": "Installation and replacement support for household water lines and pipes.",
            "seoKeywords": [
              "water lines",
              "water systems",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Pipe Installation",
                "price": 499,
                "description": "Essential water lines service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Pipe Replacement",
                "price": 999,
                "description": "Recommended water lines package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Complete Water Line Package",
                "price": 1999,
                "description": "Comprehensive water lines package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "name": "AC & Appliance Services",
    "description": "Air-conditioner servicing and repair plus essential home appliance care.",
    "image": "https://loremflickr.com/1200/800/air-conditioner-home-appliance?lock=5",
    "icon": "AirVent",
    "seoTitle": "AC & Appliance Services | NOROZZ",
    "seoDescription": "Air-conditioner servicing and repair plus essential home appliance care.",
    "seoKeywords": [
      "ac & appliance services",
      "norozz",
      "delhi ncr",
      "home services"
    ],
    "subCategories": [
      {
        "name": "Air Conditioning",
        "description": "AC servicing, inspection, repair and gas-check support.",
        "image": "https://loremflickr.com/1200/800/air%20conditioner%20home%20appliance%2CAir-Conditioning?lock=501",
        "icon": "Snowflake",
        "services": [
          {
            "name": "AC Service",
            "description": "Routine and deep AC cleaning/service for better cooling and hygiene.",
            "duration": "45 mins",
            "price": 499,
            "discount": 0,
            "finalPrice": 499,
            "thumbnail": "https://loremflickr.com/1200/800/AC%20Service?lock=5011",
            "gallery": [
              "https://loremflickr.com/1200/800/AC%20Service?lock=50102",
              "https://loremflickr.com/1200/800/AC%20and%20Appliance%20Services?lock=50103"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "ac-service",
              "air-conditioning",
              "ac-appliance-services"
            ],
            "seoTitle": "AC Service in Delhi NCR | NOROZZ",
            "seoDescription": "Routine and deep AC cleaning/service for better cooling and hygiene.",
            "seoKeywords": [
              "ac service",
              "air conditioning",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Basic AC Service",
                "price": 499,
                "description": "Essential ac service service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Deep AC Service",
                "price": 699,
                "description": "Recommended ac service package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Premium AC Care",
                "price": 999,
                "description": "Comprehensive ac service package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          },
          {
            "name": "AC Repair",
            "description": "AC inspection and repair support with optional gas-check service.",
            "duration": "45 mins",
            "price": 299,
            "discount": 0,
            "finalPrice": 299,
            "thumbnail": "https://loremflickr.com/1200/800/AC%20Repair?lock=5012",
            "gallery": [
              "https://loremflickr.com/1200/800/AC%20Repair?lock=50104",
              "https://loremflickr.com/1200/800/AC%20and%20Appliance%20Services?lock=50105"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "ac-repair",
              "air-conditioning",
              "ac-appliance-services"
            ],
            "seoTitle": "AC Repair in Delhi NCR | NOROZZ",
            "seoDescription": "AC inspection and repair support with optional gas-check service.",
            "seoKeywords": [
              "ac repair",
              "air conditioning",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "AC Inspection",
                "price": 299,
                "description": "Essential ac repair service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "AC Repair",
                "price": 799,
                "description": "Recommended ac repair package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "AC Repair + Gas Check Package",
                "price": 1499,
                "description": "Comprehensive ac repair package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          }
        ]
      },
      {
        "name": "Home Appliances",
        "description": "Inspection and repair support for refrigerators and washing machines.",
        "image": "https://loremflickr.com/1200/800/air%20conditioner%20home%20appliance%2CHome-Appliances?lock=502",
        "icon": "Refrigerator",
        "services": [
          {
            "name": "Refrigerator",
            "description": "Inspection, diagnosis and repair support for household refrigerators.",
            "duration": "45 mins",
            "price": 299,
            "discount": 0,
            "finalPrice": 299,
            "thumbnail": "https://loremflickr.com/1200/800/Refrigerator?lock=5021",
            "gallery": [
              "https://loremflickr.com/1200/800/Refrigerator?lock=50202",
              "https://loremflickr.com/1200/800/AC%20and%20Appliance%20Services?lock=50203"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "refrigerator",
              "home-appliances",
              "ac-appliance-services"
            ],
            "seoTitle": "Refrigerator in Delhi NCR | NOROZZ",
            "seoDescription": "Inspection, diagnosis and repair support for household refrigerators.",
            "seoKeywords": [
              "refrigerator",
              "home appliances",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Inspection & Diagnosis",
                "price": 299,
                "description": "Essential refrigerator service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Repair Service",
                "price": 799,
                "description": "Recommended refrigerator package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Annual Refrigerator Care",
                "price": 1499,
                "description": "Comprehensive refrigerator package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          },
          {
            "name": "Washing Machine",
            "description": "Inspection, diagnosis and repair support for washing machines.",
            "duration": "45 mins",
            "price": 299,
            "discount": 0,
            "finalPrice": 299,
            "thumbnail": "https://loremflickr.com/1200/800/Washing%20Machine?lock=5022",
            "gallery": [
              "https://loremflickr.com/1200/800/Washing%20Machine?lock=50204",
              "https://loremflickr.com/1200/800/AC%20and%20Appliance%20Services?lock=50205"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "washing-machine",
              "home-appliances",
              "ac-appliance-services"
            ],
            "seoTitle": "Washing Machine in Delhi NCR | NOROZZ",
            "seoDescription": "Inspection, diagnosis and repair support for washing machines.",
            "seoKeywords": [
              "washing machine",
              "home appliances",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Inspection & Diagnosis",
                "price": 299,
                "description": "Essential washing machine service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Repair Service",
                "price": 799,
                "description": "Recommended washing machine package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Annual Washing Machine Care",
                "price": 1499,
                "description": "Comprehensive washing machine package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "name": "Carpentry, Painting & Interior",
    "description": "Furniture, carpentry, wall painting and wallpaper services for homes and offices.",
    "image": "https://loremflickr.com/1200/800/carpentry-painting-interior?lock=6",
    "icon": "Hammer",
    "seoTitle": "Carpentry, Painting & Interior | NOROZZ",
    "seoDescription": "Furniture, carpentry, wall painting and wallpaper services for homes and offices.",
    "seoKeywords": [
      "carpentry, painting & interior",
      "norozz",
      "delhi ncr",
      "home services"
    ],
    "subCategories": [
      {
        "name": "Carpentry",
        "description": "Furniture repair and assembly services for homes and offices.",
        "image": "https://loremflickr.com/1200/800/carpentry%20painting%20interior%2CCarpentry?lock=601",
        "icon": "Hammer",
        "services": [
          {
            "name": "Furniture Repair",
            "description": "Repair and restoration support for common household furniture.",
            "duration": "45 mins",
            "price": 399,
            "discount": 0,
            "finalPrice": 399,
            "thumbnail": "https://loremflickr.com/1200/800/Furniture%20Repair?lock=6011",
            "gallery": [
              "https://loremflickr.com/1200/800/Furniture%20Repair?lock=60102",
              "https://loremflickr.com/1200/800/Carpentry%2C%20Painting%20and%20Interior?lock=60103"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "furniture-repair",
              "carpentry",
              "carpentry-painting-interior"
            ],
            "seoTitle": "Furniture Repair in Delhi NCR | NOROZZ",
            "seoDescription": "Repair and restoration support for common household furniture.",
            "seoKeywords": [
              "furniture repair",
              "carpentry",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Minor Furniture Repair",
                "price": 399,
                "description": "Essential furniture repair service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Furniture Restoration",
                "price": 799,
                "description": "Recommended furniture repair package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Premium Furniture Care",
                "price": 1499,
                "description": "Comprehensive furniture repair package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          },
          {
            "name": "Furniture Assembly",
            "description": "Professional assembly for small, large and complete-home furniture setups.",
            "duration": "45 mins",
            "price": 499,
            "discount": 0,
            "finalPrice": 499,
            "thumbnail": "https://loremflickr.com/1200/800/Furniture%20Assembly?lock=6012",
            "gallery": [
              "https://loremflickr.com/1200/800/Furniture%20Assembly?lock=60104",
              "https://loremflickr.com/1200/800/Carpentry%2C%20Painting%20and%20Interior?lock=60105"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "furniture-assembly",
              "carpentry",
              "carpentry-painting-interior"
            ],
            "seoTitle": "Furniture Assembly in Delhi NCR | NOROZZ",
            "seoDescription": "Professional assembly for small, large and complete-home furniture setups.",
            "seoKeywords": [
              "furniture assembly",
              "carpentry",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Basic Assembly",
                "price": 499,
                "description": "Essential furniture assembly service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Large Furniture Assembly",
                "price": 999,
                "description": "Recommended furniture assembly package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Complete Home Assembly",
                "price": 1799,
                "description": "Comprehensive furniture assembly package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          }
        ]
      },
      {
        "name": "Painting & Interior",
        "description": "Wall painting and wallpaper installation or removal.",
        "image": "https://loremflickr.com/1200/800/carpentry%20painting%20interior%2CPainting-%20-Interior?lock=602",
        "icon": "Paintbrush",
        "services": [
          {
            "name": "Wall Painting",
            "description": "Professional interior wall painting for rooms and complete homes.",
            "duration": "45 mins",
            "price": 2499,
            "discount": 0,
            "finalPrice": 2499,
            "thumbnail": "https://loremflickr.com/1200/800/Wall%20Painting?lock=6021",
            "gallery": [
              "https://loremflickr.com/1200/800/Wall%20Painting?lock=60202",
              "https://loremflickr.com/1200/800/Carpentry%2C%20Painting%20and%20Interior?lock=60203"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "wall-painting",
              "painting-interior",
              "carpentry-painting-interior"
            ],
            "seoTitle": "Wall Painting in Delhi NCR | NOROZZ",
            "seoDescription": "Professional interior wall painting for rooms and complete homes.",
            "seoKeywords": [
              "wall painting",
              "painting & interior",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Single Room Painting",
                "price": 2499,
                "description": "Essential wall painting service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Full Home Painting",
                "price": 4999,
                "description": "Recommended wall painting package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Premium Interior Painting",
                "price": 7999,
                "description": "Comprehensive wall painting package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          },
          {
            "name": "Wallpaper",
            "description": "Wallpaper installation, removal and combined wall-finish support.",
            "duration": "45 mins",
            "price": 999,
            "discount": 0,
            "finalPrice": 999,
            "thumbnail": "https://loremflickr.com/1200/800/Wallpaper?lock=6022",
            "gallery": [
              "https://loremflickr.com/1200/800/Wallpaper?lock=60204",
              "https://loremflickr.com/1200/800/Carpentry%2C%20Painting%20and%20Interior?lock=60205"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "wallpaper",
              "painting-interior",
              "carpentry-painting-interior"
            ],
            "seoTitle": "Wallpaper in Delhi NCR | NOROZZ",
            "seoDescription": "Wallpaper installation, removal and combined wall-finish support.",
            "seoKeywords": [
              "wallpaper",
              "painting & interior",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Wallpaper Installation",
                "price": 999,
                "description": "Essential wallpaper service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Wallpaper Removal",
                "price": 1999,
                "description": "Recommended wallpaper package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Wallpaper + Installation Package",
                "price": 3499,
                "description": "Comprehensive wallpaper package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "name": "Vehicle & Driver Services",
    "description": "Car and bike care, on-demand drivers and roadside assistance.",
    "image": "https://loremflickr.com/1200/800/car-wash-driver-roadside?lock=7",
    "icon": "Car",
    "seoTitle": "Vehicle & Driver Services | NOROZZ",
    "seoDescription": "Car and bike care, on-demand drivers and roadside assistance.",
    "seoKeywords": [
      "vehicle & driver services",
      "norozz",
      "delhi ncr",
      "home services"
    ],
    "subCategories": [
      {
        "name": "Vehicle Care",
        "description": "Professional car and bike washing and detailing.",
        "image": "https://loremflickr.com/1200/800/car%20wash%20driver%20roadside%2CVehicle-Care?lock=701",
        "icon": "CarFront",
        "services": [
          {
            "name": "Car Wash",
            "description": "Exterior car cleaning with optional premium wash and detailing.",
            "duration": "45 mins",
            "price": 399,
            "discount": 0,
            "finalPrice": 399,
            "thumbnail": "https://loremflickr.com/1200/800/Car%20Wash?lock=7011",
            "gallery": [
              "https://loremflickr.com/1200/800/Car%20Wash?lock=70102",
              "https://loremflickr.com/1200/800/Vehicle%20and%20Driver%20Services?lock=70103"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "car-wash",
              "vehicle-care",
              "vehicle-driver-services"
            ],
            "seoTitle": "Car Wash in Delhi NCR | NOROZZ",
            "seoDescription": "Exterior car cleaning with optional premium wash and detailing.",
            "seoKeywords": [
              "car wash",
              "vehicle care",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Basic Car Wash",
                "price": 399,
                "description": "Essential car wash service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Premium Car Wash",
                "price": 699,
                "description": "Recommended car wash package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Full Detailing Package",
                "price": 1199,
                "description": "Comprehensive car wash package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          },
          {
            "name": "Bike Wash",
            "description": "Professional bike cleaning with premium wash and detailing options.",
            "duration": "45 mins",
            "price": 249,
            "discount": 0,
            "finalPrice": 249,
            "thumbnail": "https://loremflickr.com/1200/800/Bike%20Wash?lock=7012",
            "gallery": [
              "https://loremflickr.com/1200/800/Bike%20Wash?lock=70104",
              "https://loremflickr.com/1200/800/Vehicle%20and%20Driver%20Services?lock=70105"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "bike-wash",
              "vehicle-care",
              "vehicle-driver-services"
            ],
            "seoTitle": "Bike Wash in Delhi NCR | NOROZZ",
            "seoDescription": "Professional bike cleaning with premium wash and detailing options.",
            "seoKeywords": [
              "bike wash",
              "vehicle care",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Basic Bike Wash",
                "price": 249,
                "description": "Essential bike wash service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Premium Bike Wash",
                "price": 399,
                "description": "Recommended bike wash package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Bike Detailing Package",
                "price": 699,
                "description": "Comprehensive bike wash package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          }
        ]
      },
      {
        "name": "Driver & Roadside",
        "description": "On-demand drivers and emergency roadside assistance.",
        "image": "https://loremflickr.com/1200/800/car%20wash%20driver%20roadside%2CDriver-%20-Roadside?lock=702",
        "icon": "BadgeAlert",
        "services": [
          {
            "name": "Driver on Demand",
            "description": "Book a trained driver by the hour, day or month.",
            "duration": "45 mins",
            "price": 299,
            "discount": 0,
            "finalPrice": 299,
            "thumbnail": "https://loremflickr.com/1200/800/Driver%20on%20Demand?lock=7021",
            "gallery": [
              "https://loremflickr.com/1200/800/Driver%20on%20Demand?lock=70202",
              "https://loremflickr.com/1200/800/Vehicle%20and%20Driver%20Services?lock=70203"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "driver-on-demand",
              "driver-roadside",
              "vehicle-driver-services"
            ],
            "seoTitle": "Driver on Demand in Delhi NCR | NOROZZ",
            "seoDescription": "Book a trained driver by the hour, day or month.",
            "seoKeywords": [
              "driver on demand",
              "driver & roadside",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Hourly Driver",
                "price": 299,
                "description": "Essential driver on demand service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Full-Day Driver",
                "price": 1499,
                "description": "Recommended driver on demand package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Monthly Driver Package",
                "price": 7999,
                "description": "Comprehensive driver on demand package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          },
          {
            "name": "Roadside Assistance",
            "description": "Emergency support for battery, tyre/puncture and roadside situations.",
            "duration": "45 mins",
            "price": 299,
            "discount": 0,
            "finalPrice": 299,
            "thumbnail": "https://loremflickr.com/1200/800/Roadside%20Assistance?lock=7022",
            "gallery": [
              "https://loremflickr.com/1200/800/Roadside%20Assistance?lock=70204",
              "https://loremflickr.com/1200/800/Vehicle%20and%20Driver%20Services?lock=70205"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "roadside-assistance",
              "driver-roadside",
              "vehicle-driver-services"
            ],
            "seoTitle": "Roadside Assistance in Delhi NCR | NOROZZ",
            "seoDescription": "Emergency support for battery, tyre/puncture and roadside situations.",
            "seoKeywords": [
              "roadside assistance",
              "driver & roadside",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Battery Jump Start",
                "price": 299,
                "description": "Essential roadside assistance service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Tyre/Puncture Assistance",
                "price": 599,
                "description": "Recommended roadside assistance package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Emergency Roadside Package",
                "price": 999,
                "description": "Comprehensive roadside assistance package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "name": "Personal Care & Wellness",
    "description": "At-home salon, makeup, massage and fitness services.",
    "image": "https://loremflickr.com/1200/800/salon-wellness-fitness?lock=8",
    "icon": "HeartPulse",
    "seoTitle": "Personal Care & Wellness | NOROZZ",
    "seoDescription": "At-home salon, makeup, massage and fitness services.",
    "seoKeywords": [
      "personal care & wellness",
      "norozz",
      "delhi ncr",
      "home services"
    ],
    "subCategories": [
      {
        "name": "Beauty at Home",
        "description": "Salon and makeup services delivered at home.",
        "image": "https://loremflickr.com/1200/800/salon%20wellness%20fitness%2CBeauty-at-Home?lock=801",
        "icon": "Scissors",
        "services": [
          {
            "name": "Salon Services",
            "description": "At-home salon services for routine grooming and personal care.",
            "duration": "45 mins",
            "price": 599,
            "discount": 0,
            "finalPrice": 599,
            "thumbnail": "https://loremflickr.com/1200/800/Salon%20Services?lock=8011",
            "gallery": [
              "https://loremflickr.com/1200/800/Salon%20Services?lock=80102",
              "https://loremflickr.com/1200/800/Personal%20Care%20and%20Wellness?lock=80103"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "salon-services",
              "beauty-at-home",
              "personal-care-wellness"
            ],
            "seoTitle": "Salon Services in Delhi NCR | NOROZZ",
            "seoDescription": "At-home salon services for routine grooming and personal care.",
            "seoKeywords": [
              "salon services",
              "beauty at home",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Basic Salon Visit",
                "price": 599,
                "description": "Essential salon services service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Standard Salon Package",
                "price": 999,
                "description": "Recommended salon services package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Premium Salon Package",
                "price": 1599,
                "description": "Comprehensive salon services package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          },
          {
            "name": "Makeup",
            "description": "Party, event and bridal makeup services delivered at home.",
            "duration": "45 mins",
            "price": 999,
            "discount": 0,
            "finalPrice": 999,
            "thumbnail": "https://loremflickr.com/1200/800/Makeup?lock=8012",
            "gallery": [
              "https://loremflickr.com/1200/800/Makeup?lock=80104",
              "https://loremflickr.com/1200/800/Personal%20Care%20and%20Wellness?lock=80105"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "makeup",
              "beauty-at-home",
              "personal-care-wellness"
            ],
            "seoTitle": "Makeup in Delhi NCR | NOROZZ",
            "seoDescription": "Party, event and bridal makeup services delivered at home.",
            "seoKeywords": [
              "makeup",
              "beauty at home",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Party Makeup",
                "price": 999,
                "description": "Essential makeup service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Event Makeup",
                "price": 2499,
                "description": "Recommended makeup package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Bridal Makeup Package",
                "price": 4999,
                "description": "Comprehensive makeup package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          }
        ]
      },
      {
        "name": "Wellness",
        "description": "Relaxation massage and personal fitness support.",
        "image": "https://loremflickr.com/1200/800/salon%20wellness%20fitness%2CWellness?lock=802",
        "icon": "HeartPulse",
        "services": [
          {
            "name": "Massage",
            "description": "Relaxation and full-body wellness massage sessions at home.",
            "duration": "45 mins",
            "price": 699,
            "discount": 0,
            "finalPrice": 699,
            "thumbnail": "https://loremflickr.com/1200/800/Massage?lock=8021",
            "gallery": [
              "https://loremflickr.com/1200/800/Massage?lock=80202",
              "https://loremflickr.com/1200/800/Personal%20Care%20and%20Wellness?lock=80203"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "massage",
              "wellness",
              "personal-care-wellness"
            ],
            "seoTitle": "Massage in Delhi NCR | NOROZZ",
            "seoDescription": "Relaxation and full-body wellness massage sessions at home.",
            "seoKeywords": [
              "massage",
              "wellness",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Relaxation Massage",
                "price": 699,
                "description": "Essential massage service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Full Body Massage",
                "price": 999,
                "description": "Recommended massage package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Premium Wellness Package",
                "price": 1499,
                "description": "Comprehensive massage package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          },
          {
            "name": "Fitness",
            "description": "Personal training sessions, monthly plans and trainer packages.",
            "duration": "45 mins",
            "price": 499,
            "discount": 0,
            "finalPrice": 499,
            "thumbnail": "https://loremflickr.com/1200/800/Fitness?lock=8022",
            "gallery": [
              "https://loremflickr.com/1200/800/Fitness?lock=80204",
              "https://loremflickr.com/1200/800/Personal%20Care%20and%20Wellness?lock=80205"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "fitness",
              "wellness",
              "personal-care-wellness"
            ],
            "seoTitle": "Fitness in Delhi NCR | NOROZZ",
            "seoDescription": "Personal training sessions, monthly plans and trainer packages.",
            "seoKeywords": [
              "fitness",
              "wellness",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Single Training Session",
                "price": 499,
                "description": "Essential fitness service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Monthly Training",
                "price": 1999,
                "description": "Recommended fitness package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Personal Trainer Package",
                "price": 4999,
                "description": "Comprehensive fitness package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "name": "Family, Pet & Care Services",
    "description": "Babysitting, elder care, pet grooming and pet support services.",
    "image": "https://loremflickr.com/1200/800/family-care-pet-care?lock=9",
    "icon": "HeartHandshake",
    "seoTitle": "Family, Pet & Care Services | NOROZZ",
    "seoDescription": "Babysitting, elder care, pet grooming and pet support services.",
    "seoKeywords": [
      "family, pet & care services",
      "norozz",
      "delhi ncr",
      "home services"
    ],
    "subCategories": [
      {
        "name": "Family Care",
        "description": "Reliable babysitting and elder-care support.",
        "image": "https://loremflickr.com/1200/800/family%20care%20pet%20care%2CFamily-Care?lock=901",
        "icon": "UsersRound",
        "services": [
          {
            "name": "Babysitting",
            "description": "Hourly, full-day and monthly childcare support options.",
            "duration": "45 mins",
            "price": 399,
            "discount": 0,
            "finalPrice": 399,
            "thumbnail": "https://loremflickr.com/1200/800/Babysitting?lock=9011",
            "gallery": [
              "https://loremflickr.com/1200/800/Babysitting?lock=90102",
              "https://loremflickr.com/1200/800/Family%2C%20Pet%20and%20Care%20Services?lock=90103"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "babysitting",
              "family-care",
              "family-pet-care-services"
            ],
            "seoTitle": "Babysitting in Delhi NCR | NOROZZ",
            "seoDescription": "Hourly, full-day and monthly childcare support options.",
            "seoKeywords": [
              "babysitting",
              "family care",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Hourly Babysitting",
                "price": 399,
                "description": "Essential babysitting service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Full-Day Babysitting",
                "price": 999,
                "description": "Recommended babysitting package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Monthly Nanny Package",
                "price": 2499,
                "description": "Comprehensive babysitting package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          },
          {
            "name": "Elder Care",
            "description": "Hourly, full-day and monthly elder-care assistance options.",
            "duration": "45 mins",
            "price": 499,
            "discount": 0,
            "finalPrice": 499,
            "thumbnail": "https://loremflickr.com/1200/800/Elder%20Care?lock=9012",
            "gallery": [
              "https://loremflickr.com/1200/800/Elder%20Care?lock=90104",
              "https://loremflickr.com/1200/800/Family%2C%20Pet%20and%20Care%20Services?lock=90105"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "elder-care",
              "family-care",
              "family-pet-care-services"
            ],
            "seoTitle": "Elder Care in Delhi NCR | NOROZZ",
            "seoDescription": "Hourly, full-day and monthly elder-care assistance options.",
            "seoKeywords": [
              "elder care",
              "family care",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Hourly Elder Care",
                "price": 499,
                "description": "Essential elder care service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Full-Day Care",
                "price": 1199,
                "description": "Recommended elder care package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Monthly Elder Care Package",
                "price": 2999,
                "description": "Comprehensive elder care package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          }
        ]
      },
      {
        "name": "Pet Care",
        "description": "Pet grooming, walking and sitting services.",
        "image": "https://loremflickr.com/1200/800/family%20care%20pet%20care%2CPet-Care?lock=902",
        "icon": "PawPrint",
        "services": [
          {
            "name": "Pet Grooming",
            "description": "At-home pet grooming and spa-care services.",
            "duration": "45 mins",
            "price": 499,
            "discount": 0,
            "finalPrice": 499,
            "thumbnail": "https://loremflickr.com/1200/800/Pet%20Grooming?lock=9021",
            "gallery": [
              "https://loremflickr.com/1200/800/Pet%20Grooming?lock=90202",
              "https://loremflickr.com/1200/800/Family%2C%20Pet%20and%20Care%20Services?lock=90203"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "pet-grooming",
              "pet-care",
              "family-pet-care-services"
            ],
            "seoTitle": "Pet Grooming in Delhi NCR | NOROZZ",
            "seoDescription": "At-home pet grooming and spa-care services.",
            "seoKeywords": [
              "pet grooming",
              "pet care",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Basic Grooming",
                "price": 499,
                "description": "Essential pet grooming service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Full Grooming",
                "price": 799,
                "description": "Recommended pet grooming package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Premium Pet Spa Package",
                "price": 1299,
                "description": "Comprehensive pet grooming package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          },
          {
            "name": "Pet Support",
            "description": "Dog walking, pet sitting and recurring pet-care support.",
            "duration": "45 mins",
            "price": 299,
            "discount": 0,
            "finalPrice": 299,
            "thumbnail": "https://loremflickr.com/1200/800/Pet%20Support?lock=9022",
            "gallery": [
              "https://loremflickr.com/1200/800/Pet%20Support?lock=90204",
              "https://loremflickr.com/1200/800/Family%2C%20Pet%20and%20Care%20Services?lock=90205"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "pet-support",
              "pet-care",
              "family-pet-care-services"
            ],
            "seoTitle": "Pet Support in Delhi NCR | NOROZZ",
            "seoDescription": "Dog walking, pet sitting and recurring pet-care support.",
            "seoKeywords": [
              "pet support",
              "pet care",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Dog Walking",
                "price": 299,
                "description": "Essential pet support service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Pet Sitting",
                "price": 699,
                "description": "Recommended pet support package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Monthly Pet Care Package",
                "price": 1999,
                "description": "Comprehensive pet support package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "name": "Delivery, Events & Professional Services",
    "description": "Courier, shifting, photography and event support services.",
    "image": "https://loremflickr.com/1200/800/courier-photography-events?lock=10",
    "icon": "BriefcaseBusiness",
    "seoTitle": "Delivery, Events & Professional Services | NOROZZ",
    "seoDescription": "Courier, shifting, photography and event support services.",
    "seoKeywords": [
      "delivery, events & professional services",
      "norozz",
      "delhi ncr",
      "home services"
    ],
    "subCategories": [
      {
        "name": "Delivery & Logistics",
        "description": "Local courier and residential or office shifting services.",
        "image": "https://loremflickr.com/1200/800/courier%20photography%20events%2CDelivery-%20-Logistics?lock=1001",
        "icon": "Truck",
        "services": [
          {
            "name": "Courier",
            "description": "Local and same-day courier support for personal and business deliveries.",
            "duration": "45 mins",
            "price": 199,
            "discount": 0,
            "finalPrice": 199,
            "thumbnail": "https://loremflickr.com/1200/800/Courier?lock=10011",
            "gallery": [
              "https://loremflickr.com/1200/800/Courier?lock=100102",
              "https://loremflickr.com/1200/800/Delivery%2C%20Events%20and%20Professional%20Services?lock=100103"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "courier",
              "delivery-logistics",
              "delivery-events-professional-services"
            ],
            "seoTitle": "Courier in Delhi NCR | NOROZZ",
            "seoDescription": "Local and same-day courier support for personal and business deliveries.",
            "seoKeywords": [
              "courier",
              "delivery & logistics",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Local Courier",
                "price": 199,
                "description": "Essential courier service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Same-Day Courier",
                "price": 399,
                "description": "Recommended courier package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Business Courier Package",
                "price": 799,
                "description": "Comprehensive courier package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          },
          {
            "name": "Shifting",
            "description": "Local, office and complete relocation assistance.",
            "duration": "45 mins",
            "price": 1999,
            "discount": 0,
            "finalPrice": 1999,
            "thumbnail": "https://loremflickr.com/1200/800/Shifting?lock=10012",
            "gallery": [
              "https://loremflickr.com/1200/800/Shifting?lock=100104",
              "https://loremflickr.com/1200/800/Delivery%2C%20Events%20and%20Professional%20Services?lock=100105"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "shifting",
              "delivery-logistics",
              "delivery-events-professional-services"
            ],
            "seoTitle": "Shifting in Delhi NCR | NOROZZ",
            "seoDescription": "Local, office and complete relocation assistance.",
            "seoKeywords": [
              "shifting",
              "delivery & logistics",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Local Shifting",
                "price": 1999,
                "description": "Essential shifting service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Office Shifting",
                "price": 4999,
                "description": "Recommended shifting package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Complete Relocation Package",
                "price": 9999,
                "description": "Comprehensive shifting package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          }
        ]
      },
      {
        "name": "Events & Professional",
        "description": "Photography and event setup/management support.",
        "image": "https://loremflickr.com/1200/800/courier%20photography%20events%2CEvents-%20-Professional?lock=1002",
        "icon": "Camera",
        "services": [
          {
            "name": "Photography",
            "description": "Professional photography for personal, event and premium coverage needs.",
            "duration": "45 mins",
            "price": 1999,
            "discount": 0,
            "finalPrice": 1999,
            "thumbnail": "https://loremflickr.com/1200/800/Photography?lock=10021",
            "gallery": [
              "https://loremflickr.com/1200/800/Photography?lock=100202",
              "https://loremflickr.com/1200/800/Delivery%2C%20Events%20and%20Professional%20Services?lock=100203"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "photography",
              "events-professional",
              "delivery-events-professional-services"
            ],
            "seoTitle": "Photography in Delhi NCR | NOROZZ",
            "seoDescription": "Professional photography for personal, event and premium coverage needs.",
            "seoKeywords": [
              "photography",
              "events & professional",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Basic Photography",
                "price": 1999,
                "description": "Essential photography service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Event Photography",
                "price": 4999,
                "description": "Recommended photography package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Premium Photography Package",
                "price": 9999,
                "description": "Comprehensive photography package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          },
          {
            "name": "Event Services",
            "description": "Event setup and management support for small to premium events.",
            "duration": "45 mins",
            "price": 2999,
            "discount": 0,
            "finalPrice": 2999,
            "thumbnail": "https://loremflickr.com/1200/800/Event%20Services?lock=10022",
            "gallery": [
              "https://loremflickr.com/1200/800/Event%20Services?lock=100204",
              "https://loremflickr.com/1200/800/Delivery%2C%20Events%20and%20Professional%20Services?lock=100205"
            ],
            "cities": [
              "Delhi NCR"
            ],
            "tags": [
              "event-services",
              "events-professional",
              "delivery-events-professional-services"
            ],
            "seoTitle": "Event Services in Delhi NCR | NOROZZ",
            "seoDescription": "Event setup and management support for small to premium events.",
            "seoKeywords": [
              "event services",
              "events & professional",
              "Delhi NCR",
              "NOROZZ"
            ],
            "packages": [
              {
                "title": "Basic Event Setup",
                "price": 2999,
                "description": "Essential event services service for routine needs.",
                "features": [
                  "Essential service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Service completion update"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "45 mins"
              },
              {
                "title": "Standard Event Package",
                "price": 6999,
                "description": "Recommended event services package with broader coverage.",
                "features": [
                  "Extended service coverage",
                  "Trained professional",
                  "Standard tools & materials",
                  "Quality check",
                  "Most popular"
                ],
                "isPopular": true,
                "isRecommended": true,
                "duration": "60 mins"
              },
              {
                "title": "Premium Event Management Package",
                "price": 14999,
                "description": "Comprehensive event services package with maximum coverage and premium care.",
                "features": [
                  "Maximum service coverage",
                  "Senior/experienced professional",
                  "Premium treatment where applicable",
                  "Quality check",
                  "Priority support"
                ],
                "isPopular": false,
                "isRecommended": false,
                "duration": "90 mins"
              }
            ]
          }
        ]
      }
    ]
  }
];

function slugify(value) {
  return value
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function assertCatalogue() {
  const categories = catalogue.length;
  const subCategories = catalogue.reduce((n, c) => n + c.subCategories.length, 0);
  const services = catalogue.reduce(
    (n, c) => n + c.subCategories.reduce((m, sc) => m + sc.services.length, 0),
    0
  );
  const packages = catalogue.reduce(
    (n, c) =>
      n +
      c.subCategories.reduce(
        (m, sc) => m + sc.services.reduce((x, s) => x + s.packages.length, 0),
        0
      ),
    0
  );

  if (categories !== 10 || subCategories !== 20 || services !== 41 || packages !== 123) {
    throw new Error(
      `Catalogue count mismatch: ${categories} categories, ${subCategories} sub-categories, ${services} services, ${packages} packages`
    );
  }

  console.log(
    `Catalogue verified: ${categories} categories / ${subCategories} sub-categories / ${services} services / ${packages} packages`
  );
}

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('MongoDB connected');

  assertCatalogue();

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      let categoryCount = 0;
      let subCategoryCount = 0;
      let serviceCount = 0;
      let packageCount = 0;

      for (let ci = 0; ci < catalogue.length; ci++) {
        const categoryData = catalogue[ci];
        const categorySlug = slugify(categoryData.name);

        const category = await Category.findOneAndUpdate(
          { slug: categorySlug },
          {
            $set: {
              name: categoryData.name,
              description: categoryData.description,
              image: categoryData.image,
              icon: categoryData.icon,
              status: 'active',
              sortOrder: ci + 1,
              seoTitle: categoryData.seoTitle,
              seoDescription: categoryData.seoDescription,
              seoKeywords: categoryData.seoKeywords,
            },
            $setOnInsert: { slug: categorySlug },
          },
          { new: true, upsert: true, setDefaultsOnInsert: true, session }
        );

        categoryCount++;

        for (let sci = 0; sci < categoryData.subCategories.length; sci++) {
          const subData = categoryData.subCategories[sci];
          const subSlug = slugify(`${categoryData.name}-${subData.name}`);

          const subCategory = await SubCategory.findOneAndUpdate(
            { slug: subSlug },
            {
              $set: {
                name: subData.name,
                category: category._id,
                description: subData.description,
                image: subData.image,
                icon: subData.icon,
                status: 'active',
                sortOrder: sci + 1,
              },
              $setOnInsert: { slug: subSlug },
            },
            { new: true, upsert: true, setDefaultsOnInsert: true, session }
          );

          subCategoryCount++;

          for (let svi = 0; svi < subData.services.length; svi++) {
            const serviceData = subData.services[svi];
            const serviceSlug = slugify(
              `${categoryData.name}-${subData.name}-${serviceData.name}`
            );

            const service = await Service.findOneAndUpdate(
              { slug: serviceSlug },
              {
                $set: {
                  category: category._id,
                  subCategory: subCategory._id,
                  name: serviceData.name,
                  description: serviceData.description,
                  duration: serviceData.duration,
                  price: serviceData.price,
                  discount: serviceData.discount,
                  finalPrice: serviceData.finalPrice,
                  // Package data is stored ONLY in ServicePackage.
                  thumbnail: serviceData.thumbnail,
                  gallery: serviceData.gallery,
                  status: 'active',
                  cities: serviceData.cities,
                  tags: serviceData.tags,
                  seoTitle: serviceData.seoTitle,
                  seoDescription: serviceData.seoDescription,
                  seoKeywords: serviceData.seoKeywords,
                  sortOrder: svi + 1,
                },
                $setOnInsert: { slug: serviceSlug },
              },
              { new: true, upsert: true, setDefaultsOnInsert: true, session }
            );

            serviceCount++;

            for (let pi = 0; pi < serviceData.packages.length; pi++) {
              const packageData = serviceData.packages[pi];
              const packageSlug = slugify(`${serviceSlug}-${packageData.title}`);

              await ServicePackage.findOneAndUpdate(
                { service: service._id, slug: packageSlug },
                {
                  $set: {
                    service: service._id,
                    title: packageData.title,
                    description: packageData.description,
                    price: packageData.price,
                    discountType: 'none',
                    discountValue: 0,
                    finalPrice: packageData.price,
                    duration: packageData.duration,
                    features: packageData.features,
                    isPopular: packageData.isPopular,
                    isRecommended: packageData.isRecommended,
                    status: 'active',
                    sortOrder: pi + 1,
                  },
                  $setOnInsert: { slug: packageSlug },
                },
                { new: true, upsert: true, setDefaultsOnInsert: true, session }
              );

              packageCount++;
            }
          }
        }
      }

      console.log('----------------------------------------');
      console.log(`Categories processed    : ${categoryCount}`);
      console.log(`SubCategories processed : ${subCategoryCount}`);
      console.log(`Services processed      : ${serviceCount}`);
      console.log(`Packages processed      : ${packageCount}`);
      console.log('----------------------------------------');
    });

    console.log('NOROZZ enriched catalogue seed completed successfully.');
  } finally {
    await session.endSession();
    await mongoose.disconnect();
    console.log('MongoDB disconnected');
  }
}

seed().catch(async (error) => {
  console.error('NOROZZ catalogue seed failed:', error);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
