import { SchemaOptions } from 'mongoose';

/**
 * Base Schema Options for all SkyBolt Mongoose Models
 * Ensures consistent serialization, timestamps, and id virtuals.
 */
export const baseSchemaOptions: SchemaOptions = {
  timestamps: true,
  versionKey: false,
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      // Expose virtual `id` string and remove MongoDB raw `_id` and `__v`
      if (ret['_id']) {
        ret['id'] = String(ret['_id']);
      }
      delete ret['_id'];
      delete ret['__v'];
      return ret;
    }
  },
  toObject: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      if (ret['_id']) {
        ret['id'] = String(ret['_id']);
      }
      delete ret['_id'];
      delete ret['__v'];
      return ret;
    }
  }
};

/**
 * Common fields for Soft-Deletable entities
 */
export interface ISoftDeletable {
  isDeleted: boolean;
  deletedAt: Date | null;
}

/**
 * Helper definition to attach soft-delete fields to Mongoose schemas
 */
export const softDeleteSchemaDefinition = {
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: {
    type: Date,
    default: null
  }
};
