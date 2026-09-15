import { HubModel } from '../models/hub.model.js';
import { VehicleModel } from '../models/vehicle.model.js';

export const INITIAL_HUBS_SEED = [
  {
    code: 'HUB-LDH-01',
    name: 'Ludhiana Central Hub',
    address: 'Plot 45, Industrial Focal Point, Phase 5',
    city: 'Ludhiana',
    state: 'Punjab',
    country: 'India',
    postalCode: '141010',
    capacity: 30,
    operationalStatus: 'ACTIVE' as const,
    coordinates: { latitude: 30.901, longitude: 75.8573 },
    contact: {
      phone: '+91 98765 43210',
      email: 'hub.ldh@skybolt.test',
      managerName: 'Harpreet Singh'
    },
    timezone: 'Asia/Kolkata'
  },
  {
    code: 'HUB-NYC-01',
    name: 'New York Central Depot',
    address: '520 West 43rd Street',
    city: 'New York',
    state: 'New York',
    country: 'USA',
    postalCode: '10036',
    capacity: 50,
    operationalStatus: 'ACTIVE' as const,
    coordinates: { latitude: 40.7605, longitude: -73.9965 },
    contact: {
      phone: '+1 212 555 0199',
      email: 'hub.nyc@skybolt.test',
      managerName: 'John Miller'
    },
    timezone: 'America/New_York'
  },
  {
    code: 'HUB-DEL-01',
    name: 'Delhi Aerocity Logistics Hub',
    address: 'Asset 8, Hospitality District, IGI Airport',
    city: 'Delhi',
    state: 'Delhi',
    country: 'India',
    postalCode: '110037',
    capacity: 60,
    operationalStatus: 'ACTIVE' as const,
    coordinates: { latitude: 28.5494, longitude: 77.1215 },
    contact: {
      phone: '+91 99112 23344',
      email: 'hub.del@skybolt.test',
      managerName: 'Rajesh Sharma'
    },
    timezone: 'Asia/Kolkata'
  },
  {
    code: 'HUB-BLR-01',
    name: 'Bangalore Tech Hub',
    address: 'Electronic City Phase 1, Hosur Road',
    city: 'Bangalore',
    state: 'Karnataka',
    country: 'India',
    postalCode: '560100',
    capacity: 45,
    operationalStatus: 'ACTIVE' as const,
    coordinates: { latitude: 12.8452, longitude: 77.6602 },
    contact: {
      phone: '+91 98800 11223',
      email: 'hub.blr@skybolt.test',
      managerName: 'Ananya Rao'
    },
    timezone: 'Asia/Kolkata'
  }
];

export async function seedHubs(forceReset = false): Promise<void> {
  if (forceReset) {
    await HubModel.deleteMany({ isDeleted: false });
  }

  for (const hubData of INITIAL_HUBS_SEED) {
    const existing = await HubModel.findOne({ code: hubData.code });
    if (!existing) {
      await HubModel.create(hubData);
    } else {
      await HubModel.updateOne(
        { code: hubData.code },
        {
          $set: {
            name: hubData.name,
            address: hubData.address,
            city: hubData.city,
            state: hubData.state,
            country: hubData.country,
            postalCode: hubData.postalCode,
            capacity: hubData.capacity,
            operationalStatus: hubData.operationalStatus,
            coordinates: hubData.coordinates,
            contact: hubData.contact,
            timezone: hubData.timezone
          }
        }
      );
    }
  }

  // Recalculate physical vehicle counts assigned to each hub
  const hubs = await HubModel.find({ isDeleted: false });
  for (const hub of hubs) {
    const count = await VehicleModel.countDocuments({ currentHubId: hub._id, isDeleted: false });
    await HubModel.updateOne({ _id: hub._id }, { $set: { currentVehicleCount: count } });
  }
}
