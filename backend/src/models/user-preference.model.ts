import { Schema, model, Document, Types } from 'mongoose';
import { UserPreferencesDTO } from '../types/recommendation.types.js';
import { VehicleCategory } from '../types/vehicle.types.js';

export interface IUserPreference {
  userId: Types.ObjectId;
  preferredCategories: VehicleCategory[];
  preferredTransmission?: 'MANUAL' | 'AUTOMATIC';
  preferredFuelType?: string;
  preferredSeatCount?: number;
  preferredPriceRange?: {
    min?: number;
    max?: number;
  };
  preferredFeatures: string[];
  preferredPickupLocations: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IUserPreferenceDoc extends IUserPreference, Document {
  toDTO(): UserPreferencesDTO;
}

const userPreferenceSchema = new Schema<IUserPreferenceDoc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },
    preferredCategories: {
      type: [String],
      enum: ['CAR', 'SUV', 'SEDAN', 'HATCHBACK', 'BIKE', 'SCOOTER', 'EV', 'LUXURY'],
      default: []
    },
    preferredTransmission: {
      type: String,
      enum: ['MANUAL', 'AUTOMATIC', null],
      default: null
    },
    preferredFuelType: {
      type: String,
      default: ''
    },
    preferredSeatCount: {
      type: Number,
      min: 1,
      max: 12,
      default: null
    },
    preferredPriceRange: {
      min: { type: Number, min: 0, default: null },
      max: { type: Number, min: 0, default: null }
    },
    preferredFeatures: {
      type: [String],
      default: []
    },
    preferredPickupLocations: {
      type: [String],
      default: []
    }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

userPreferenceSchema.methods.toDTO = function (): UserPreferencesDTO {
  return {
    userId: String(this.userId),
    preferredCategories: this.preferredCategories || [],
    preferredTransmission: this.preferredTransmission || undefined,
    preferredFuelType: this.preferredFuelType || undefined,
    preferredSeatCount: this.preferredSeatCount || undefined,
    preferredPriceRange: this.preferredPriceRange || undefined,
    preferredFeatures: this.preferredFeatures || [],
    preferredPickupLocations: this.preferredPickupLocations || [],
    updatedAt: this.updatedAt ? this.updatedAt.toISOString() : new Date().toISOString()
  };
};

export const UserPreferenceModel = model<IUserPreferenceDoc>('UserPreference', userPreferenceSchema);
export default UserPreferenceModel;
