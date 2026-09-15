import mongoose, { Schema, Document, Model } from 'mongoose';
import { AuditLogDTO } from '../types/fleet.types.js';

export interface IAuditLog {
  actorId?: mongoose.Types.ObjectId;
  actorRole: string;
  actorEmail: string;
  action: string;
  entityType: 'VEHICLE' | 'HUB' | 'TRANSFER' | 'MAINTENANCE' | 'INSPECTION' | 'BOOKING' | 'USER' | 'PAYMENT' | 'CONTACT' | 'REVIEW' | 'REVIEW_REPORT' | 'QUEUE_JOB';
  entityId: string;
  previousState?: unknown;
  newState?: unknown;
  reason?: string;
  ipAddress?: string;
  requestId?: string;
  createdAt: Date;
}

export interface IAuditLogDoc extends IAuditLog, Document {
  id: string;
  toDTO(): AuditLogDTO;
}

const auditLogSchema = new Schema<IAuditLogDoc>(
  {
    actorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      index: true
    },
    actorRole: {
      type: String,
      required: true
    },
    actorEmail: {
      type: String,
      required: true
    },
    action: {
      type: String,
      required: true,
      index: true
    },
    entityType: {
      type: String,
      enum: ['VEHICLE', 'HUB', 'TRANSFER', 'MAINTENANCE', 'INSPECTION', 'BOOKING', 'USER', 'PAYMENT', 'CONTACT', 'REVIEW', 'REVIEW_REPORT', 'QUEUE_JOB'],
      required: true,
      index: true
    },
    entityId: {
      type: String,
      required: true,
      index: true
    },
    previousState: {
      type: Schema.Types.Mixed,
      default: null
    },
    newState: {
      type: Schema.Types.Mixed,
      default: null
    },
    reason: {
      type: String,
      default: ''
    },
    ipAddress: {
      type: String,
      default: ''
    },
    requestId: {
      type: String,
      default: ''
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: false,
    versionKey: false
  }
);

auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });

auditLogSchema.methods.toDTO = function (): AuditLogDTO {
  return {
    id: this.id || String(this._id),
    actorId: String(this.actorId),
    actorRole: this.actorRole,
    actorEmail: this.actorEmail,
    action: this.action,
    entityType: this.entityType,
    entityId: this.entityId,
    previousState: this.previousState,
    newState: this.newState,
    reason: this.reason || '',
    ipAddress: this.ipAddress || '',
    requestId: this.requestId || '',
    createdAt: this.createdAt.toISOString()
  };
};

export const AuditLogModel: Model<IAuditLogDoc> =
  mongoose.models.AuditLog || mongoose.model<IAuditLogDoc>('AuditLog', auditLogSchema);

export default AuditLogModel;
