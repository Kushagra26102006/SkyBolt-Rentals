import { VehicleModel } from '../models/vehicle.model.js';
import { HubModel } from '../models/hub.model.js';
import { VehicleCategory } from '../types/vehicle.types.js';
import { seedHubs } from './hub.seed.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';

export const INITIAL_VEHICLES_SEED = [
  {
    vehicleCode: 'SKY-VHC-001',
    registrationNumber: 'PB-10-HA-1001',
    brand: 'Honda',
    model: 'Activa 5G',
    name: 'Honda Activa 5G',
    year: 2022,
    category: 'SCOOTER' as VehicleCategory,
    status: 'ACTIVE' as const,
    specifications: {
      seats: 2,
      transmission: 'AUTOMATIC' as const,
      fuelType: 'PETROL' as const,
      engineCC: 109,
      mileage: '55 kmpl'
    },
    rental: {
      baseRate: 300,
      currency: 'INR',
      deposit: 1000
    },
    location: {
      name: 'Ludhiana',
      city: 'Ludhiana'
    },
    images: [
      {
        url: 'assets/images/honda-activa.png',
        altText: 'Honda Activa 5G Scooter',
        isPrimary: true
      }
    ],
    features: ['Single-channel ABS', 'Underseat Storage', 'Combi-Brake System', 'LED Headlamp'],
    description:
      'Reliable city scooty with 109cc HET engine, smooth acceleration, comfortable dual seating, and spacious underseat storage. Perfect for daily urban commutes.',
    rating: {
      average: 4.7,
      count: 142
    }
  },
  {
    vehicleCode: 'SKY-VHC-002',
    registrationNumber: 'NY-02-OL-2002',
    brand: 'Ola',
    model: 'S1 Pro Gen 2',
    name: 'Ola S1 Pro Gen 2',
    year: 2023,
    category: 'SCOOTER' as VehicleCategory,
    status: 'ACTIVE' as const,
    specifications: {
      seats: 2,
      transmission: 'AUTOMATIC' as const,
      fuelType: 'ELECTRIC' as const,
      mileage: '195 km range'
    },
    rental: {
      baseRate: 300,
      currency: 'INR',
      deposit: 1000
    },
    location: {
      name: 'New York Hub',
      city: 'New York'
    },
    images: [
      {
        url: 'assets/images/ola-s1-pro.webp',
        altText: 'Ola S1 Pro Gen 2 Electric Scooter',
        isPrimary: true
      }
    ],
    features: ['Touchscreen Display', 'Bluetooth Audio', 'Fast Charging', 'Cruise Control', 'Reverse Mode'],
    description:
      'Next-generation high-speed electric scooter boasting 195 km battery range, 120 km/h top speed, touchscreen navigation, and built-in Bluetooth speakers.',
    rating: {
      average: 4.9,
      count: 210
    }
  },
  {
    vehicleCode: 'SKY-VHC-003',
    registrationNumber: 'CA-03-BG-3003',
    brand: 'BGauss',
    model: 'RUV 350',
    name: 'BGauss RUV 350',
    year: 2024,
    category: 'SCOOTER' as VehicleCategory,
    status: 'ACTIVE' as const,
    specifications: {
      seats: 2,
      transmission: 'AUTOMATIC' as const,
      fuelType: 'ELECTRIC' as const,
      mileage: '145 km range'
    },
    rental: {
      baseRate: 400,
      currency: 'INR',
      deposit: 1500
    },
    location: {
      name: 'San Francisco Hub',
      city: 'San Francisco'
    },
    images: [
      {
        url: 'assets/images/bgauss-scooter.webp',
        altText: 'BGauss RUV 350 Electric Scooter',
        isPrimary: true
      }
    ],
    features: ['16-inch Alloy Wheels', 'Metal Body Frame', 'IP67 Battery', 'Digital Cluster'],
    description:
      'Heavy-duty urban electric scooter equipped with 16-inch alloy wheels, 145 km range, fast charging capability, and ultra-durable metal body chassis.',
    rating: {
      average: 4.6,
      count: 88
    }
  },
  {
    vehicleCode: 'SKY-VHC-004',
    registrationNumber: 'IL-04-BJ-4004',
    brand: 'Bajaj',
    model: 'Chetak EV Premium',
    name: 'Bajaj Chetak EV Premium',
    year: 2023,
    category: 'SCOOTER' as VehicleCategory,
    status: 'ACTIVE' as const,
    specifications: {
      seats: 2,
      transmission: 'AUTOMATIC' as const,
      fuelType: 'ELECTRIC' as const,
      mileage: '127 km range'
    },
    rental: {
      baseRate: 400,
      currency: 'INR',
      deposit: 1500
    },
    location: {
      name: 'Chicago Downtown',
      city: 'Chicago'
    },
    images: [
      {
        url: 'assets/images/chetak-scooter.webp',
        altText: 'Bajaj Chetak EV Premium',
        isPrimary: true
      }
    ],
    features: ['Steel Body Panels', 'Sequential LED Indicators', 'Reverse Gear', 'Mobile App Connectivity'],
    description:
      'Premium iconic electric scooter crafted with seamless steel bodywork, IP67 waterproof battery pack, smart app connectivity, and sequential LED indicators.',
    rating: {
      average: 4.8,
      count: 115
    }
  },
  {
    vehicleCode: 'SKY-VHC-005',
    registrationNumber: 'NY-05-TM-5005',
    brand: 'TrailMaster',
    model: 'Mountain Trail Bike',
    name: 'Mountain Trail Bike',
    year: 2023,
    category: 'BIKE' as VehicleCategory,
    status: 'ACTIVE' as const,
    specifications: {
      seats: 1,
      transmission: 'MANUAL' as const,
      fuelType: 'MANUAL' as const,
      mileage: 'N/A (Pedal)'
    },
    rental: {
      baseRate: 500,
      currency: 'INR',
      deposit: 1000
    },
    location: {
      name: 'New York Hub',
      city: 'New York'
    },
    images: [
      {
        url: 'assets/images/mountain-bike.webp',
        altText: 'Mountain Trail Bike',
        isPrimary: true
      }
    ],
    features: ['21-speed Shimano Gears', 'Dual Mechanical Disc Brakes', 'Front Suspension', 'Alloy Frame'],
    description:
      'Lightweight aluminum alloy mountain bike with 21-speed Shimano derailleur, dual mechanical disc brakes, and front suspension forks for off-road trails.',
    rating: {
      average: 4.9,
      count: 84
    }
  },
  {
    vehicleCode: 'SKY-VHC-006',
    registrationNumber: 'CA-06-YM-6006',
    brand: 'Yamaha',
    model: 'FZ-v3 Sport',
    name: 'Yamaha FZ-v3 Sport',
    year: 2023,
    category: 'BIKE' as VehicleCategory,
    status: 'ACTIVE' as const,
    specifications: {
      seats: 2,
      transmission: 'MANUAL' as const,
      fuelType: 'PETROL' as const,
      engineCC: 149,
      mileage: '48 kmpl'
    },
    rental: {
      baseRate: 600,
      currency: 'INR',
      deposit: 2000
    },
    location: {
      name: 'San Francisco Hub',
      city: 'San Francisco'
    },
    images: [
      {
        url: 'assets/images/yamaha-bike.jpg',
        altText: 'Yamaha FZ-v3 Sport Motorcycle',
        isPrimary: true
      }
    ],
    features: ['Monocross Suspension', 'Single-channel ABS', 'Negative LCD Instrument Cluster', 'Fuel Injection'],
    description:
      'Dynamic naked streetfighter with 149cc Fuel Injected Blue Core engine, single-channel ABS, LED headlight, and muscular fuel tank styling for sport performance.',
    rating: {
      average: 4.8,
      count: 156
    }
  },
  {
    vehicleCode: 'SKY-VHC-007',
    registrationNumber: 'NY-07-HD-7007',
    brand: 'Harley-Davidson',
    model: 'X440 Roadster',
    name: 'Harley-Davidson X440',
    year: 2024,
    category: 'BIKE' as VehicleCategory,
    status: 'ACTIVE' as const,
    specifications: {
      seats: 2,
      transmission: 'MANUAL' as const,
      fuelType: 'PETROL' as const,
      engineCC: 440,
      mileage: '35 kmpl'
    },
    rental: {
      baseRate: 700,
      currency: 'INR',
      deposit: 3000
    },
    location: {
      name: 'New York Hub',
      city: 'New York'
    },
    images: [
      {
        url: 'assets/images/harley-x440.png',
        altText: 'Harley-Davidson X440 Roadster',
        isPrimary: true
      }
    ],
    features: ['Dual-channel ABS', 'KYB USD Front Forks', 'TFT Display with Turn-by-turn Nav', 'Slipper Clutch'],
    description:
      'Thumping 440cc single-cylinder modern roadster with distinct Harley exhaust note, inverted front forks, dual-channel ABS, and comfortable upright posture.',
    rating: {
      average: 4.9,
      count: 198
    }
  },
  {
    vehicleCode: 'SKY-VHC-008',
    registrationNumber: 'CA-08-RE-8008',
    brand: 'Royal Enfield',
    model: 'Hunter 350 Metro',
    name: 'Royal Enfield Hunter 350',
    year: 2023,
    category: 'BIKE' as VehicleCategory,
    status: 'ACTIVE' as const,
    specifications: {
      seats: 2,
      transmission: 'MANUAL' as const,
      fuelType: 'PETROL' as const,
      engineCC: 349,
      mileage: '36 kmpl'
    },
    rental: {
      baseRate: 650,
      currency: 'INR',
      deposit: 2500
    },
    location: {
      name: 'Los Angeles Station',
      city: 'Los Angeles'
    },
    images: [
      {
        url: 'assets/images/hunter-350.webp',
        altText: 'Royal Enfield Hunter 350 Motorcycle',
        isPrimary: true
      }
    ],
    features: ['J-series Engine', 'Dual-channel ABS', 'Tubeless Tyres with Alloy Wheels', 'Digi-Analog Speedometer'],
    description:
      'Agile and responsive 350cc urban roadster featuring the smooth J-series engine, compact wheelbase, cast alloy wheels, and lightweight flickable ergonomics.',
    rating: {
      average: 4.7,
      count: 174
    }
  },
  {
    vehicleCode: 'SKY-VHC-009',
    registrationNumber: 'NY-09-TS-9009',
    brand: 'Tesla',
    model: 'Model 3 Standard',
    name: 'Tesla Model 3',
    year: 2024,
    category: 'EV' as VehicleCategory,
    status: 'ACTIVE' as const,
    specifications: {
      seats: 5,
      doors: 4,
      transmission: 'AUTOMATIC' as const,
      fuelType: 'ELECTRIC' as const,
      mileage: '491 km range',
      luggageCapacity: 425
    },
    rental: {
      baseRate: 1000,
      currency: 'INR',
      deposit: 5000
    },
    location: {
      name: 'New York Hub',
      city: 'New York'
    },
    images: [
      {
        url: 'assets/images/tesla.jpg',
        altText: 'Tesla Model 3 Electric Sedan',
        isPrimary: true
      }
    ],
    features: ['Autopilot Capability', '15-inch Touchscreen Navigation', 'Glass Roof', 'Supercharger Network Access'],
    description:
      'Zero-emission luxury electric sedan offering instant torque, class-leading safety ratings, minimalist interior with central touch display, and Autopilot.',
    rating: {
      average: 5.0,
      count: 312
    }
  },
  {
    vehicleCode: 'SKY-VHC-010',
    registrationNumber: 'CA-10-FD-1010',
    brand: 'Ford',
    model: 'Mustang GT Convertible',
    name: 'Ford Mustang Convertible',
    year: 2023,
    category: 'LUXURY' as VehicleCategory,
    status: 'ACTIVE' as const,
    specifications: {
      seats: 2,
      doors: 2,
      transmission: 'AUTOMATIC' as const,
      fuelType: 'PETROL' as const,
      engineCC: 5038,
      mileage: '12 kmpl',
      luggageCapacity: 332
    },
    rental: {
      baseRate: 950,
      currency: 'INR',
      deposit: 5000
    },
    location: {
      name: 'Los Angeles Station',
      city: 'Los Angeles'
    },
    images: [
      {
        url: 'assets/images/mustang.jpg',
        altText: 'Ford Mustang GT Convertible',
        isPrimary: true
      }
    ],
    features: ['5.0L V8 Coyote Engine', 'Power-folding Soft Top', 'Selectable Drive Modes', 'Brembo Front Brakes'],
    description:
      'Head-turning open-top luxury convertible featuring active sport exhaust, premium audio system, heated seats, and effortless highway cruising.',
    rating: {
      average: 5.0,
      count: 98
    }
  },
  {
    vehicleCode: 'SKY-VHC-011',
    registrationNumber: 'IL-11-VW-1111',
    brand: 'Volkswagen',
    model: 'Passat SE Sedan',
    name: 'VW Passat SE Sedan',
    year: 2023,
    category: 'SEDAN' as VehicleCategory,
    status: 'ACTIVE' as const,
    specifications: {
      seats: 5,
      doors: 4,
      transmission: 'AUTOMATIC' as const,
      fuelType: 'PETROL' as const,
      engineCC: 1984,
      mileage: '15 kmpl',
      luggageCapacity: 450
    },
    rental: {
      baseRate: 900,
      currency: 'INR',
      deposit: 3000
    },
    location: {
      name: 'Chicago Downtown',
      city: 'Chicago'
    },
    images: [
      {
        url: 'assets/images/sedan.avif',
        altText: 'Volkswagen Passat SE Sedan',
        isPrimary: true
      }
    ],
    features: ['Adaptive Cruise Control', 'Dual-zone Climatronic', 'Leatherette Seats', 'Sunroof'],
    description:
      'Full-size executive sedan built for long-distance comfort with dual-zone climate control, adaptive cruise control, and whisper-quiet cabin.',
    rating: {
      average: 4.8,
      count: 140
    }
  },
  {
    vehicleCode: 'SKY-VHC-012',
    registrationNumber: 'PB-12-SB-1212',
    brand: 'SkyBolt',
    model: 'City Cruiser Crossover',
    name: 'SkyBolt City Cruiser',
    year: 2024,
    category: 'CAR' as VehicleCategory,
    status: 'ACTIVE' as const,
    specifications: {
      seats: 5,
      doors: 4,
      transmission: 'AUTOMATIC' as const,
      fuelType: 'PETROL' as const,
      engineCC: 1197,
      mileage: '18 kmpl',
      luggageCapacity: 350
    },
    rental: {
      baseRate: 750,
      currency: 'INR',
      deposit: 3000
    },
    location: {
      name: 'Ludhiana',
      city: 'Ludhiana'
    },
    images: [
      {
        url: 'assets/images/car-tour.webp',
        altText: 'SkyBolt Compact City Cruiser',
        isPrimary: true
      }
    ],
    features: ['Keyless Entry & Push Button Start', 'Touchscreen Infotainment', 'Reverse Parking Sensors', 'Great City Mileage'],
    description:
      'Comfortable compact crossover offering great fuel economy, easy parking, keyless entry, and smooth automatic transmission for family road trips.',
    rating: {
      average: 4.7,
      count: 76
    }
  },
  {
    vehicleCode: 'SKY-VHC-013',
    registrationNumber: 'PB-10-SN-1313',
    brand: 'Mahindra',
    model: 'Scorpio-N Z8L',
    name: 'Mahindra Scorpio-N SUV',
    year: 2024,
    category: 'SUV' as VehicleCategory,
    status: 'ACTIVE' as const,
    specifications: {
      seats: 7,
      doors: 5,
      transmission: 'AUTOMATIC' as const,
      fuelType: 'DIESEL' as const,
      engineCC: 2184,
      mileage: '14 kmpl',
      luggageCapacity: 460
    },
    rental: {
      baseRate: 1800,
      currency: 'INR',
      deposit: 5000
    },
    location: {
      name: 'Ludhiana',
      city: 'Ludhiana'
    },
    images: [
      {
        url: 'assets/images/suv.avif',
        altText: 'Mahindra Scorpio-N Premium SUV',
        isPrimary: true
      }
    ],
    features: ['7-Seater Comfort', '4Xplor Terrain Management', 'Sony 3D Immersive Audio', 'Sunroof & Cruise Control'],
    description:
      'Robust 7-seater full-size SUV offering high ground clearance, commanding road view, 4x4 capability, and luxurious captain seats for road trips.',
    rating: {
      average: 4.9,
      count: 89
    }
  },
  {
    vehicleCode: 'SKY-VHC-014',
    registrationNumber: 'PB-10-VS-1414',
    brand: 'Vespa',
    model: 'Elegante 150 Special Edition',
    name: 'Vespa Elegante 150',
    year: 2024,
    category: 'SCOOTER' as VehicleCategory,
    status: 'ACTIVE' as const,
    specifications: {
      seats: 2,
      transmission: 'AUTOMATIC' as const,
      fuelType: 'PETROL' as const,
      engineCC: 149,
      mileage: '45 kmpl'
    },
    rental: {
      baseRate: 450,
      currency: 'INR',
      deposit: 1500
    },
    location: {
      name: 'Ludhiana',
      city: 'Ludhiana'
    },
    images: [
      {
        url: 'assets/images/vespa-scooter.webp',
        altText: 'Vespa Elegante 150 Classic Scooter',
        isPrimary: true
      }
    ],
    features: ['Italian Monocoque Steel Chassis', 'Front Disc Brake with ABS', 'Split Leather Saddle', 'Chrome Accents'],
    description:
      'Timeless Italian style paired with a refined 150cc 3V Tech engine, signature chrome accessories, split leather seats, and retro charm for urban cruising.',
    rating: {
      average: 4.9,
      count: 67
    }
  },
  {
    vehicleCode: 'SKY-VHC-015',
    registrationNumber: 'PB-10-BP-1515',
    brand: 'Bajaj',
    model: 'Pulsar 150 Twin Disc',
    name: 'Bajaj Pulsar 150 Neon',
    year: 2023,
    category: 'BIKE' as VehicleCategory,
    status: 'ACTIVE' as const,
    specifications: {
      seats: 2,
      transmission: 'MANUAL' as const,
      fuelType: 'PETROL' as const,
      engineCC: 149,
      mileage: '50 kmpl'
    },
    rental: {
      baseRate: 550,
      currency: 'INR',
      deposit: 2000
    },
    location: {
      name: 'Ludhiana',
      city: 'Ludhiana'
    },
    images: [
      {
        url: 'assets/images/bajaj-pulsar.png',
        altText: 'Bajaj Pulsar 150 Neon Motorcycle',
        isPrimary: true
      }
    ],
    features: ['DTS-i Twin Spark Engine', 'Wolf-Eyed Headlamp', 'Tubeless Sport Tyres', 'Single-Channel ABS'],
    description:
      'India’s most trusted street motorcycle with 149cc DTS-i engine, iconic wolf-eyed headlamp, clip-on handlebars, and outstanding fuel efficiency.',
    rating: {
      average: 4.8,
      count: 165
    }
  },
  {
    vehicleCode: 'SKY-VHC-016',
    registrationNumber: 'NY-16-HH-1616',
    brand: 'Honda',
    model: 'Hornet 2.0 Repsol Edition',
    name: 'Honda Hornet 2.0',
    year: 2024,
    category: 'BIKE' as VehicleCategory,
    status: 'ACTIVE' as const,
    specifications: {
      seats: 2,
      transmission: 'MANUAL' as const,
      fuelType: 'PETROL' as const,
      engineCC: 184,
      mileage: '42 kmpl'
    },
    rental: {
      baseRate: 650,
      currency: 'INR',
      deposit: 2500
    },
    location: {
      name: 'New York Hub',
      city: 'New York'
    },
    images: [
      {
        url: 'assets/images/honda-hornet.png',
        altText: 'Honda Hornet 2.0 Repsol Edition',
        isPrimary: true
      }
    ],
    features: ['Golden USD Front Forks', 'Full LED Lighting with X-Shaped Tail Lamp', 'Hazard Switch', 'Dual Petal Disc Brakes'],
    description:
      'Fierce street naked motorcycle featuring upscale golden inverted front forks, aggressive muscular fuel tank, and 184cc PGM-FI engine delivering punchy torque.',
    rating: {
      average: 4.9,
      count: 112
    }
  },
  {
    vehicleCode: 'SKY-VHC-017',
    registrationNumber: 'CA-17-KT-1717',
    brand: 'KTM',
    model: '1290 Super Adventure R',
    name: 'KTM 1290 Super Adventure',
    year: 2024,
    category: 'BIKE' as VehicleCategory,
    status: 'ACTIVE' as const,
    specifications: {
      seats: 2,
      transmission: 'MANUAL' as const,
      fuelType: 'PETROL' as const,
      engineCC: 1301,
      mileage: '20 kmpl'
    },
    rental: {
      baseRate: 1200,
      currency: 'INR',
      deposit: 5000
    },
    location: {
      name: 'Los Angeles Station',
      city: 'Los Angeles'
    },
    images: [
      {
        url: 'assets/images/bike-tour.webp',
        altText: 'KTM 1290 Super Adventure Touring Motorcycle',
        isPrimary: true
      }
    ],
    features: ['WP XPLOR Suspension', 'Cornering ABS & Traction Control', 'TFT Display with Turn-by-Turn Navigation', 'Touring Panniers'],
    description:
      'Ultimate long-distance adventure touring machine powered by a ferocious 1301cc V-twin engine with semi-active WP suspension and rugged aluminum panniers.',
    rating: {
      average: 5.0,
      count: 145
    }
  },
  {
    vehicleCode: 'SKY-VHC-018',
    registrationNumber: 'CA-18-AM-1818',
    brand: 'Aston Martin',
    model: 'DB11 Volante V8',
    name: 'Aston Martin DB11 Volante',
    year: 2024,
    category: 'LUXURY' as VehicleCategory,
    status: 'ACTIVE' as const,
    specifications: {
      seats: 4,
      doors: 2,
      transmission: 'AUTOMATIC' as const,
      fuelType: 'PETROL' as const,
      engineCC: 3982,
      mileage: '9 kmpl',
      luggageCapacity: 224
    },
    rental: {
      baseRate: 2500,
      currency: 'INR',
      deposit: 10000
    },
    location: {
      name: 'Los Angeles Station',
      city: 'Los Angeles'
    },
    images: [
      {
        url: 'assets/images/convertible.jpg',
        altText: 'Aston Martin DB11 Volante Luxury Convertible',
        isPrimary: true
      }
    ],
    features: ['Twin-Turbo 4.0L V8 Engine', '8-Layer Acoustic Fabric Soft Top', 'Handcrafted Bridge of Weir Leather', 'Bang & Olufsen BeoSound Audio'],
    description:
      'Pinnacle of open-top British grand touring with a 503 hp twin-turbo V8, hand-stitched leather cockpit, and sculpted aerodynamic lines.',
    rating: {
      average: 5.0,
      count: 78
    }
  },
  {
    vehicleCode: 'SKY-VHC-019',
    registrationNumber: 'PB-10-VP-1919',
    brand: 'Vespa',
    model: 'Primavera 125 Classic',
    name: 'Vespa Primavera 125',
    year: 2024,
    category: 'SCOOTER' as VehicleCategory,
    status: 'ACTIVE' as const,
    specifications: {
      seats: 2,
      transmission: 'AUTOMATIC' as const,
      fuelType: 'PETROL' as const,
      engineCC: 124,
      mileage: '46 kmpl'
    },
    rental: {
      baseRate: 480,
      currency: 'INR',
      deposit: 1500
    },
    location: {
      name: 'Ludhiana',
      city: 'Ludhiana'
    },
    images: [
      {
        url: 'assets/images/scooter-vespa-primavera.jpg',
        altText: 'Vespa Primavera 125 Classic Scooter',
        isPrimary: true
      }
    ],
    features: ['Gloss Rosso Red Finish', 'Top Cargo Trunk Box', 'Front Disc ABS', 'LED Halo Headlamp'],
    description:
      'Charming and iconic Italian classic scooter in vibrant gloss red with chrome trims, matching top luggage box, and ultra-smooth i-get 125cc engine.',
    rating: {
      average: 4.9,
      count: 89
    }
  },
  {
    vehicleCode: 'SKY-VHC-020',
    registrationNumber: 'PB-10-SA-2020',
    brand: 'Suzuki',
    model: 'Access 125 Ride Connect',
    name: 'Suzuki Access 125 BT',
    year: 2024,
    category: 'SCOOTER' as VehicleCategory,
    status: 'ACTIVE' as const,
    specifications: {
      seats: 2,
      transmission: 'AUTOMATIC' as const,
      fuelType: 'PETROL' as const,
      engineCC: 124,
      mileage: '52 kmpl'
    },
    rental: {
      baseRate: 350,
      currency: 'INR',
      deposit: 1000
    },
    location: {
      name: 'Ludhiana',
      city: 'Ludhiana'
    },
    images: [
      {
        url: 'assets/images/scooter-suzuki-access.jpg',
        altText: 'Suzuki Access 125 Ride Connect Edition',
        isPrimary: true
      }
    ],
    features: ['Bluetooth Navigation Console', 'External Fuel Filling', 'Chrome Garnish', 'Dual Luggage Hooks'],
    description:
      'India’s top 125cc commuter scooter with Bluetooth-enabled turn-by-turn digital console, peppy SEP engine, spacious floorboard, and plush dual seat.',
    rating: {
      average: 4.8,
      count: 124
    }
  },
  {
    vehicleCode: 'SKY-VHC-021',
    registrationNumber: 'PB-10-TJ-2121',
    brand: 'TVS',
    model: 'Jupiter Grande 125 Disc',
    name: 'TVS Jupiter Grande 125',
    year: 2024,
    category: 'SCOOTER' as VehicleCategory,
    status: 'ACTIVE' as const,
    specifications: {
      seats: 2,
      transmission: 'AUTOMATIC' as const,
      fuelType: 'PETROL' as const,
      engineCC: 124,
      mileage: '54 kmpl'
    },
    rental: {
      baseRate: 320,
      currency: 'INR',
      deposit: 1000
    },
    location: {
      name: 'Ludhiana',
      city: 'Ludhiana'
    },
    images: [
      {
        url: 'assets/images/scooter-tvs-jupiter.jpg',
        altText: 'TVS Jupiter Grande 125 SmartXonnect',
        isPrimary: true
      }
    ],
    features: ['33L Class-Leading Boot Space', 'Front Fuel Tank Cap', 'IntelliGO Auto Start-Stop', 'Diamond-Cut Alloys'],
    description:
      'Smart and efficient family scooter offering unmatched 33-litre underseat storage for two helmets, front external refueling, and silent electric start.',
    rating: {
      average: 4.7,
      count: 108
    }
  },
  {
    vehicleCode: 'SKY-VHC-022',
    registrationNumber: 'NY-22-VG-2222',
    brand: 'Vespa',
    model: 'GTV 300 Sport Edition',
    name: 'Vespa GTV 300 Sport Edition',
    year: 2024,
    category: 'SCOOTER' as VehicleCategory,
    status: 'ACTIVE' as const,
    specifications: {
      seats: 2,
      transmission: 'AUTOMATIC' as const,
      fuelType: 'PETROL' as const,
      engineCC: 278,
      mileage: '33 kmpl'
    },
    rental: {
      baseRate: 600,
      currency: 'INR',
      deposit: 2000
    },
    location: {
      name: 'New York Hub',
      city: 'New York'
    },
    images: [
      {
        url: 'assets/images/scooter-vespa-gts.jpg',
        altText: 'Vespa GTV 300 Sport High-Performance Scooter',
        isPrimary: true
      }
    ],
    features: ['24 HP High Performance Engine (HPE)', 'Low Fender Headlamp', 'Matte Grey with Orange Sport Decals', 'Keyless Ignition'],
    description:
      'High-power 300cc touring scooter combining vintage racing heritage with modern 24 hp HPE motor, ASR traction control, keyless start, and low-fender headlight.',
    rating: {
      average: 5.0,
      count: 65
    }
  },
  {
    vehicleCode: 'SKY-VHC-023',
    registrationNumber: 'PB-10-YR-2323',
    brand: 'Yamaha',
    model: 'YZF-R15 V3 Sport',
    name: 'Yamaha YZF-R15 V3',
    year: 2024,
    category: 'BIKE' as VehicleCategory,
    status: 'ACTIVE' as const,
    specifications: {
      seats: 2,
      transmission: 'MANUAL' as const,
      fuelType: 'PETROL' as const,
      engineCC: 155,
      mileage: '45 kmpl'
    },
    rental: {
      baseRate: 750,
      currency: 'INR',
      deposit: 2500
    },
    location: {
      name: 'Ludhiana',
      city: 'Ludhiana'
    },
    images: [
      {
        url: 'assets/images/bike-yamaha-r15.jpg',
        altText: 'Yamaha YZF-R15 V3 Racing Supersport',
        isPrimary: true
      }
    ],
    features: ['Variable Valve Actuation (VVA)', 'Assist & Slipper Clutch', 'Deltabox Frame', 'Dual-Channel ABS'],
    description:
      'Track-bred supersport motorcycle featuring liquid-cooled 155cc VVA engine, aerodynamic full fairing, race-inspired Deltabox chassis, and sharp supersport handling.',
    rating: {
      average: 4.9,
      count: 182
    }
  },
  {
    vehicleCode: 'SKY-VHC-024',
    registrationNumber: 'NY-24-RH-2424',
    brand: 'Royal Enfield',
    model: 'Himalayan 450 Sherpa',
    name: 'Royal Enfield Himalayan 450',
    year: 2024,
    category: 'BIKE' as VehicleCategory,
    status: 'ACTIVE' as const,
    specifications: {
      seats: 2,
      transmission: 'MANUAL' as const,
      fuelType: 'PETROL' as const,
      engineCC: 452,
      mileage: '30 kmpl'
    },
    rental: {
      baseRate: 850,
      currency: 'INR',
      deposit: 3000
    },
    location: {
      name: 'New York Hub',
      city: 'New York'
    },
    images: [
      {
        url: 'assets/images/bike-re-himalayan.jpg',
        altText: 'Royal Enfield Himalayan 450 Adventure Touring',
        isPrimary: true
      }
    ],
    features: ['Sherpa 450 Liquid-Cooled Engine', 'Tripper TFT Map Navigation', 'Showa USD Long-Travel Suspension', 'Switchable Rear ABS'],
    description:
      'Built for all roads and no roads: liquid-cooled Sherpa 450 motor, 200mm ground clearance, full-color Google Maps TFT navigation, and rugged luggage mounts.',
    rating: {
      average: 5.0,
      count: 147
    }
  },
  {
    vehicleCode: 'SKY-VHC-025',
    registrationNumber: 'PB-10-HC-2525',
    brand: 'Hyundai',
    model: 'Creta SX(O) Turbo 1.5',
    name: 'Hyundai Creta SX(O) Turbo',
    year: 2024,
    category: 'SUV' as VehicleCategory,
    status: 'ACTIVE' as const,
    specifications: {
      seats: 5,
      doors: 5,
      transmission: 'AUTOMATIC' as const,
      fuelType: 'PETROL' as const,
      engineCC: 1482,
      mileage: '18 kmpl',
      luggageCapacity: 433
    },
    rental: {
      baseRate: 1400,
      currency: 'INR',
      deposit: 4000
    },
    location: {
      name: 'Ludhiana',
      city: 'Ludhiana'
    },
    images: [
      {
        url: 'assets/images/car-hyundai-creta.jpg',
        altText: 'Hyundai Creta 2024 SX(O) Turbo SUV',
        isPrimary: true
      }
    ],
    features: ['Level 2 ADAS Safety Suite', 'Panoramic Sunroof', 'Dual 10.25-inch Screens', 'Bose Premium 8-Speaker Audio'],
    description:
      'India’s favourite compact SUV featuring Level 2 ADAS active safety, dual panoramic display, ventilated front seats, and 160 PS turbocharged petrol engine.',
    rating: {
      average: 4.9,
      count: 119
    }
  },
  {
    vehicleCode: 'SKY-VHC-026',
    registrationNumber: 'CA-26-AR-2626',
    brand: 'Audi',
    model: 'R8 V10 Plus Coupe',
    name: 'Audi R8 V10 Plus Coupe',
    year: 2024,
    category: 'LUXURY' as VehicleCategory,
    status: 'ACTIVE' as const,
    specifications: {
      seats: 2,
      doors: 2,
      transmission: 'AUTOMATIC' as const,
      fuelType: 'PETROL' as const,
      engineCC: 5204,
      mileage: '8 kmpl',
      luggageCapacity: 112
    },
    rental: {
      baseRate: 3500,
      currency: 'INR',
      deposit: 15000
    },
    location: {
      name: 'Los Angeles Station',
      city: 'Los Angeles'
    },
    images: [
      {
        url: 'assets/images/car-audi-r8-coupe.jpg',
        altText: 'Audi R8 V10 Plus Blue Supercar',
        isPrimary: true
      }
    ],
    features: ['610 HP Naturally Aspirated V10', 'Quattro All-Wheel Drive', 'Carbon Ceramic Brakes', 'Sport Exhaust System'],
    description:
      'Glorious mid-engine supercar boasting a roaring 5.2L naturally aspirated V10 pushing 610 horsepower, carbon fiber sideblades, and lightning-fast S-Tronic DCT.',
    rating: {
      average: 5.0,
      count: 94
    }
  },
  {
    vehicleCode: 'SKY-VHC-027',
    registrationNumber: 'NY-27-PO-2727',
    brand: 'Porsche',
    model: '911 Carrera S 992',
    name: 'Porsche 911 Carrera S',
    year: 2024,
    category: 'LUXURY' as VehicleCategory,
    status: 'ACTIVE' as const,
    specifications: {
      seats: 4,
      doors: 2,
      transmission: 'AUTOMATIC' as const,
      fuelType: 'PETROL' as const,
      engineCC: 2981,
      mileage: '11 kmpl',
      luggageCapacity: 132
    },
    rental: {
      baseRate: 3200,
      currency: 'INR',
      deposit: 12000
    },
    location: {
      name: 'New York Hub',
      city: 'New York'
    },
    images: [
      {
        url: 'assets/images/car-porsche-911.jpg',
        altText: 'Porsche 911 Carrera S Luxury Sports Coupe',
        isPrimary: true
      }
    ],
    features: ['Twin-Turbo Boxer-6 Engine', '8-Speed PDK Transmission', 'Sport Chrono Package', 'PASM Adaptive Suspension'],
    description:
      'Timeless German sports car engineering offering 443 horsepower twin-turbo flat-six, lightning PDK dual-clutch transmission, and supreme track & street agility.',
    rating: {
      average: 5.0,
      count: 105
    }
  }
];

/**
 * Idempotently seed the vehicle inventory into MongoDB with operational fleet state and hubs
 */
export async function seedVehicles(force = false): Promise<number> {
  await VehicleModel.syncIndexes();

  // 1. Ensure operational logistics hubs are seeded
  await seedHubs(force);

  const hubLdh = await HubModel.findOne({ code: 'HUB-LDH-01' });
  const hubNyc = await HubModel.findOne({ code: 'HUB-NYC-01' });

  const count = await VehicleModel.countDocuments({ isDeleted: false });
  if (count > 0 && !force) {
    return count;
  }

  if (force) {
    await VehicleModel.deleteMany({});
  }

  let idx = 100;
  for (const vehicleData of INITIAL_VEHICLES_SEED) {
    idx += 1;
    const isNyc = vehicleData.location?.city === 'New York';
    const targetHub = isNyc && hubNyc ? hubNyc : hubLdh;

    const fleetAugmented = {
      ...vehicleData,
      fleetStatus: 'AVAILABLE' as const,
      status: 'ACTIVE' as const,
      currentHubId: targetHub ? targetHub._id : null,
      vin: `SKB${vehicleData.vehicleCode.replace(/[^A-Z0-9]/g, '')}${idx}VIN`,
      odometer: 10000 + idx * 250,
      maintenanceState: { inMaintenance: false },
      inspectionState: { lastInspectionResult: 'PASSED' as const, lastInspectedAt: new Date() }
    };

    await VehicleModel.findOneAndUpdate(
      { vehicleCode: vehicleData.vehicleCode },
      { $set: fleetAugmented },
      { upsert: true, returnDocument: 'after' }
    );
  }

  // Update hub vehicle counts
  if (hubLdh) {
    const ldhCount = await VehicleModel.countDocuments({ currentHubId: hubLdh._id, isDeleted: false });
    await HubModel.updateOne({ _id: hubLdh._id }, { $set: { currentVehicleCount: ldhCount } });
  }
  if (hubNyc) {
    const nycCount = await VehicleModel.countDocuments({ currentHubId: hubNyc._id, isDeleted: false });
    await HubModel.updateOne({ _id: hubNyc._id }, { $set: { currentVehicleCount: nycCount } });
  }

  return VehicleModel.countDocuments({ isDeleted: false });
}

if (process.argv[1] && process.argv[1].includes('vehicle.seed')) {
  connectDatabase()
    .then(() => seedVehicles(true))
    .then((c) => console.log(`🚀 [SkyBolt Seed] Successfully seeded ${c} vehicles across all categories into MongoDB`))
    .then(() => disconnectDatabase())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ [SkyBolt Seed Error]', err);
      process.exit(1);
    });
}

