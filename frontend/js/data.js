/* ==========================================================================
   SkyBolt Rentals - Vehicle Dataset & LocalStorage Favorites Store
   ========================================================================== */

const vehicles = [
  {
    id: 1,
    name: "Honda Activa 5G",
    category: "scooter",
    image: "assets/images/honda-activa.png",
    pricePerDay: 300,
    location: "Ludhiana",
    fuel: "Petrol",
    transmission: "Automatic",
    seats: 2,
    rating: 4.7,
    reviews: 142,
    description: "Reliable city scooty with 109cc HET engine, smooth acceleration, comfortable dual seating, and spacious underseat storage. Perfect for daily urban commutes."
  },
  {
    id: 2,
    name: "Ola S1 Pro Gen 2",
    category: "scooter",
    image: "assets/images/ola-s1-pro.webp",
    pricePerDay: 300,
    location: "New York Hub",
    fuel: "Electric",
    transmission: "Automatic",
    seats: 2,
    rating: 4.9,
    reviews: 210,
    description: "Next-generation high-speed electric scooter boasting 195 km battery range, 120 km/h top speed, touchscreen navigation, and built-in Bluetooth speakers."
  },
  {
    id: 3,
    name: "BGauss RUV 350",
    category: "scooter",
    image: "assets/images/bgauss-scooter.webp",
    pricePerDay: 400,
    location: "San Francisco Hub",
    fuel: "Electric",
    transmission: "Automatic",
    seats: 2,
    rating: 4.6,
    reviews: 88,
    description: "Heavy-duty urban electric scooter equipped with 16-inch alloy wheels, 145 km range, fast charging capability, and ultra-durable metal body chassis."
  },
  {
    id: 4,
    name: "Bajaj Chetak EV Premium",
    category: "scooter",
    image: "assets/images/chetak-scooter.webp",
    pricePerDay: 400,
    location: "Chicago Downtown",
    fuel: "Electric",
    transmission: "Automatic",
    seats: 2,
    rating: 4.8,
    reviews: 115,
    description: "Premium iconic electric scooter crafted with seamless steel bodywork, IP67 waterproof battery pack, smart app connectivity, and sequential LED indicators."
  },
  {
    id: 5,
    name: "Mountain Trail Bike",
    category: "bike",
    image: "assets/images/mountain-bike.webp",
    pricePerDay: 500,
    location: "New York Hub",
    fuel: "Manual",
    transmission: "Manual",
    seats: 1,
    rating: 4.9,
    reviews: 84,
    description: "Lightweight aluminum alloy mountain bike with 21-speed Shimano derailleur, dual mechanical disc brakes, and front suspension forks for off-road trails."
  },
  {
    id: 6,
    name: "Yamaha FZ-v3 Sport",
    category: "bike",
    image: "assets/images/yamaha-fzs.webp",
    pricePerDay: 500,
    location: "Ludhiana",
    fuel: "Petrol",
    transmission: "Manual",
    seats: 2,
    rating: 4.8,
    reviews: 112,
    description: "Agile 149cc fuel-injected sport motorcycle featuring single-channel ABS, monochrome LCD instrument cluster, and comfortable two-level muscular seating."
  },
  {
    id: 7,
    name: "Bajaj Pulsar 150",
    category: "bike",
    image: "assets/images/bajaj-pulsar.png",
    pricePerDay: 450,
    location: "Los Angeles Station",
    fuel: "Petrol",
    transmission: "Manual",
    seats: 2,
    rating: 4.7,
    reviews: 164,
    description: "India's favorite street motorcycle powered by a 150cc DTS-i twin spark engine, offering excellent fuel mileage and classic upright riding posture."
  },
  {
    id: 8,
    name: "Honda Hornet 2.0",
    category: "bike",
    image: "assets/images/honda-hornet.png",
    pricePerDay: 520,
    location: "San Francisco Hub",
    fuel: "Petrol",
    transmission: "Manual",
    seats: 2,
    rating: 4.8,
    reviews: 96,
    description: "Aggressive 184cc naked street bike fitted with golden Upside Down (USD) front suspension, hazardous lights switch, and energetic acceleration."
  },
  {
    id: 9,
    name: "Ford Edge ST 4WD",
    category: "car",
    image: "assets/images/suv.avif",
    pricePerDay: 800,
    location: "New York Hub",
    fuel: "Petrol",
    transmission: "Automatic",
    seats: 5,
    rating: 4.9,
    reviews: 156,
    description: "Performance 4WD midsize SUV with 2.7L twin-turbo V6 engine, spacious 5-passenger leather cabin, Apple CarPlay, and massive cargo space."
  },
  {
    id: 10,
    name: "Luxury Convertible",
    category: "car",
    image: "assets/images/convertible.jpg",
    pricePerDay: 900,
    location: "Los Angeles Station",
    fuel: "Petrol",
    transmission: "Automatic",
    seats: 2,
    rating: 5.0,
    reviews: 98,
    description: "Head-turning open-top luxury convertible featuring active sport exhaust, premium audio system, heated seats, and effortless highway cruising."
  },
  {
    id: 11,
    name: "VW Passat SE Sedan",
    category: "car",
    image: "assets/images/sedan.avif",
    pricePerDay: 900,
    location: "Chicago Downtown",
    fuel: "Petrol",
    transmission: "Automatic",
    seats: 5,
    rating: 4.8,
    reviews: 140,
    description: "Full-size executive sedan built for long-distance comfort with dual-zone climate control, adaptive cruise control, and whisper-quiet cabin."
  },
  {
    id: 12,
    name: "SkyBolt City Cruiser",
    category: "car",
    image: "assets/images/car-tour.webp",
    pricePerDay: 750,
    location: "Ludhiana",
    fuel: "Petrol",
    transmission: "Automatic",
    seats: 5,
    rating: 4.7,
    reviews: 76,
    description: "Comfortable compact crossover offering great fuel economy, easy parking, keyless entry, and smooth automatic transmission for family road trips."
  },
  {
    id: 13,
    name: "Mahindra Scorpio-N SUV",
    category: "car",
    image: "assets/images/suv.avif",
    pricePerDay: 1800,
    location: "Ludhiana",
    fuel: "Diesel",
    transmission: "Automatic",
    seats: 7,
    rating: 4.9,
    reviews: 89,
    description: "Robust 7-seater full-size SUV offering high ground clearance, commanding road view, 4x4 capability, and luxurious captain seats for road trips."
  },
  {
    id: 14,
    name: "Vespa Elegante 150",
    category: "scooter",
    image: "assets/images/vespa-scooter.webp",
    pricePerDay: 450,
    location: "Ludhiana",
    fuel: "Petrol",
    transmission: "Automatic",
    seats: 2,
    rating: 4.9,
    reviews: 67,
    description: "Timeless Italian style paired with a refined 150cc 3V Tech engine, signature chrome accessories, split leather seats, and retro charm for urban cruising."
  },
  {
    id: 15,
    name: "Bajaj Pulsar 150 Neon",
    category: "bike",
    image: "assets/images/bajaj-pulsar.png",
    pricePerDay: 550,
    location: "Ludhiana",
    fuel: "Petrol",
    transmission: "Manual",
    seats: 2,
    rating: 4.8,
    reviews: 165,
    description: "India’s most trusted street motorcycle with 149cc DTS-i engine, iconic wolf-eyed headlamp, clip-on handlebars, and outstanding fuel efficiency."
  },
  {
    id: 16,
    name: "Honda Hornet 2.0",
    category: "bike",
    image: "assets/images/honda-hornet.png",
    pricePerDay: 650,
    location: "New York Hub",
    fuel: "Petrol",
    transmission: "Manual",
    seats: 2,
    rating: 4.9,
    reviews: 112,
    description: "Fierce street naked motorcycle featuring upscale golden inverted front forks, aggressive muscular fuel tank, and 184cc PGM-FI engine delivering punchy torque."
  },
  {
    id: 17,
    name: "KTM 1290 Super Adventure",
    category: "bike",
    image: "assets/images/bike-tour.webp",
    pricePerDay: 1200,
    location: "Los Angeles Station",
    fuel: "Petrol",
    transmission: "Manual",
    seats: 2,
    rating: 5.0,
    reviews: 145,
    description: "Ultimate long-distance adventure touring machine powered by a ferocious 1301cc V-twin engine with semi-active WP suspension and rugged aluminum panniers."
  },
  {
    id: 18,
    name: "Aston Martin DB11 Volante",
    category: "car",
    image: "assets/images/convertible.jpg",
    pricePerDay: 2500,
    location: "Los Angeles Station",
    fuel: "Petrol",
    transmission: "Automatic",
    seats: 4,
    rating: 5.0,
    reviews: 78,
    description: "Pinnacle of open-top British grand touring with a 503 hp twin-turbo V8, hand-stitched leather cockpit, and sculpted aerodynamic lines."
  },
  {
    id: 19,
    name: "Vespa Primavera 125",
    category: "scooter",
    image: "assets/images/scooter-vespa-primavera.jpg",
    pricePerDay: 480,
    location: "Ludhiana",
    fuel: "Petrol",
    transmission: "Automatic",
    seats: 2,
    rating: 4.9,
    reviews: 89,
    description: "Charming and iconic Italian classic scooter in vibrant gloss red with chrome trims, matching top luggage box, and ultra-smooth i-get 125cc engine."
  },
  {
    id: 20,
    name: "Suzuki Access 125 BT",
    category: "scooter",
    image: "assets/images/scooter-suzuki-access.jpg",
    pricePerDay: 350,
    location: "Ludhiana",
    fuel: "Petrol",
    transmission: "Automatic",
    seats: 2,
    rating: 4.8,
    reviews: 124,
    description: "India’s top 125cc commuter scooter with Bluetooth-enabled turn-by-turn digital console, peppy SEP engine, spacious floorboard, and plush dual seat."
  },
  {
    id: 21,
    name: "TVS Jupiter Grande 125",
    category: "scooter",
    image: "assets/images/scooter-tvs-jupiter.jpg",
    pricePerDay: 320,
    location: "Ludhiana",
    fuel: "Petrol",
    transmission: "Automatic",
    seats: 2,
    rating: 4.7,
    reviews: 108,
    description: "Smart and efficient family scooter offering unmatched 33-litre underseat storage for two helmets, front external refueling, and silent electric start."
  },
  {
    id: 22,
    name: "Vespa GTV 300 Sport Edition",
    category: "scooter",
    image: "assets/images/scooter-vespa-gts.jpg",
    pricePerDay: 600,
    location: "New York Hub",
    fuel: "Petrol",
    transmission: "Automatic",
    seats: 2,
    rating: 5.0,
    reviews: 65,
    description: "High-power 300cc touring scooter combining vintage racing heritage with modern 24 hp HPE motor, ASR traction control, keyless start, and low-fender headlight."
  },
  {
    id: 23,
    name: "Yamaha YZF-R15 V3",
    category: "bike",
    image: "assets/images/bike-yamaha-r15.jpg",
    pricePerDay: 750,
    location: "Ludhiana",
    fuel: "Petrol",
    transmission: "Manual",
    seats: 2,
    rating: 4.9,
    reviews: 182,
    description: "Track-bred supersport motorcycle featuring liquid-cooled 155cc VVA engine, aerodynamic full fairing, race-inspired Deltabox chassis, and sharp supersport handling."
  },
  {
    id: 24,
    name: "Royal Enfield Himalayan 450",
    category: "bike",
    image: "assets/images/bike-re-himalayan.jpg",
    pricePerDay: 850,
    location: "New York Hub",
    fuel: "Petrol",
    transmission: "Manual",
    seats: 2,
    rating: 5.0,
    reviews: 147,
    description: "Built for all roads and no roads: liquid-cooled Sherpa 450 motor, 200mm ground clearance, full-color Google Maps TFT navigation, and rugged luggage mounts."
  },
  {
    id: 25,
    name: "Hyundai Creta SX(O) Turbo",
    category: "car",
    image: "assets/images/car-hyundai-creta.jpg",
    pricePerDay: 1400,
    location: "Ludhiana",
    fuel: "Petrol",
    transmission: "Automatic",
    seats: 5,
    rating: 4.9,
    reviews: 119,
    description: "India’s favourite compact SUV featuring Level 2 ADAS active safety, dual panoramic display, ventilated front seats, and 160 PS turbocharged petrol engine."
  },
  {
    id: 26,
    name: "Audi R8 V10 Plus Coupe",
    category: "car",
    image: "assets/images/car-audi-r8-coupe.jpg",
    pricePerDay: 3500,
    location: "Los Angeles Station",
    fuel: "Petrol",
    transmission: "Automatic",
    seats: 2,
    rating: 5.0,
    reviews: 94,
    description: "Glorious mid-engine supercar boasting a roaring 5.2L naturally aspirated V10 pushing 610 horsepower, carbon fiber sideblades, and lightning-fast S-Tronic DCT."
  },
  {
    id: 27,
    name: "Porsche 911 Carrera S",
    category: "car",
    image: "assets/images/car-porsche-911.jpg",
    pricePerDay: 3200,
    location: "New York Hub",
    fuel: "Petrol",
    transmission: "Automatic",
    seats: 4,
    rating: 5.0,
    reviews: 105,
    description: "Timeless German sports car engineering offering 443 horsepower twin-turbo flat-six, lightning PDK dual-clutch transmission, and supreme track & street agility."
  }
];

/* ==========================================================================
   PRODUCTION WARNING & ISOLATED STORAGE FOUNDATION
   Client-side storage, mock data, and pricing calculations are temporary
   prototype mechanisms and cannot be trusted for production environments.
   A secure backend API and database must be implemented in future phases.
   ========================================================================== */

/**
 * Safe localStorage reader with JSON parse fallback and quota resilience
 */
function safeStorageGet(key, fallback = null) {
  try {
    const item = localStorage.getItem(key);
    if (item === null || item === undefined) return fallback;
    return JSON.parse(item);
  } catch (err) {
    console.warn(`[SkyBolt Storage] Error reading key "${key}":`, err);
    return fallback;
  }
}

/**
 * Safe localStorage writer with QuotaExceededError handling
 */
function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error(`[SkyBolt Storage] Failed to write key "${key}":`, err);
    return false;
  }
}

/**
 * Safe localStorage key removal
 */
function safeStorageRemove(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (err) {
    console.error(`[SkyBolt Storage] Failed to remove key "${key}":`, err);
    return false;
  }
}

vehicles.forEach((v, index) => {
  if (!v.vehicleCode) {
    v.vehicleCode = 'SKY-VHC-' + String(v.id || (index + 1)).padStart(3, '0');
  }
});

/* Helper Functions */

function getVehicleById(id) {
  if (id === undefined || id === null || id === '') return null;
  const strId = String(id).trim();
  const lowerId = strId.toLowerCase();

  // 1. Direct vehicleCode match (e.g., "SKY-VHC-001")
  const byCode = vehicles.find(v => v.vehicleCode && v.vehicleCode.toLowerCase() === lowerId);
  if (byCode) return byCode;

  // 2. Exact numeric id match (e.g., 1 or "1")
  const parsedId = parseInt(strId, 10);
  if (!isNaN(parsedId) && String(parsedId) === strId) {
    const found = vehicles.find(v => v.id === parsedId);
    if (found) return found;
    // Also try formatted SKY-VHC-00X
    const codeFormat = `SKY-VHC-${String(parsedId).padStart(3, '0')}`.toLowerCase();
    const foundCode = vehicles.find(v => v.vehicleCode && v.vehicleCode.toLowerCase() === codeFormat);
    if (foundCode) return foundCode;
  }

  // 3. String id or _id match
  const byId = vehicles.find(v => String(v.id) === strId || String(v._id) === strId);
  if (byId) return byId;

  // 4. Name match (exact or substring)
  const byName = vehicles.find(v => v.name && v.name.toLowerCase() === lowerId);
  if (byName) return byName;
  const byNamePart = vehicles.find(v => v.name && v.name.toLowerCase().includes(lowerId));
  if (byNamePart) return byNamePart;

  return null;
}

const FAVORITES_KEY = 'skybolt_favorites';

function getFavorites() {
  const data = safeStorageGet(FAVORITES_KEY, []);
  return Array.isArray(data) ? data : [];
}

function isFavorite(vehicleId) {
  const favs = getFavorites();
  return favs.includes(vehicleId);
}

function toggleFavorite(vehicleId) {
  let favs = getFavorites();
  if (favs.includes(vehicleId)) {
    favs = favs.filter(id => id !== vehicleId);
  } else {
    favs.push(vehicleId);
  }
  safeStorageSet(FAVORITES_KEY, favs);
  return favs.includes(vehicleId);
}
