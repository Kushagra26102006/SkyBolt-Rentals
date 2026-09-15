import mongoose, { Schema, Document, Model } from 'mongoose';
import { baseSchemaOptions, softDeleteSchemaDefinition, ISoftDeletable } from './base.schema.js';
import {
  InspectionDTO,
  InspectionType,
  InspectionResult,
  InspectionIssue,
  InspectionChecklist
} from '../types/fleet.types.js';

export interface IInspection {
  inspectionNumber: string;
  vehicleId: mongoose.Types.ObjectId;
  inspectionType: InspectionType;
  result: InspectionResult;
  inspectedBy: mongoose.Types.ObjectId;
  inspectedAt: Date;
  odometer: number;
  notes?: string;
  issues: InspectionIssue[];
  checklists: InspectionChecklist;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IInspectionDoc extends IInspection, ISoftDeletable, Document {
  id: string;
  toDTO(): InspectionDTO;
}

const inspectionIssueSchema = new Schema<InspectionIssue>(
  {
    item: { type: String, required: true, trim: true },
    severity: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'CRITICAL'],
      default: 'MEDIUM'
    },
    notes: { type: String, trim: true, default: '' }
  },
  { _id: false }
);

const inspectionChecklistSchema = new Schema<InspectionChecklist>(
  {
    brakes: { type: Boolean, default: true },
    lights: { type: Boolean, default: true },
    tires: { type: Boolean, default: true },
    fluids: { type: Boolean, default: true },
    bodywork: { type: Boolean, default: true },
    documents: { type: Boolean, default: true }
  },
  { _id: false }
);

const inspectionSchema = new Schema<IInspectionDoc>(
  {
    inspectionNumber: {
      type: String,
      required: [true, 'Inspection number is required'],
      unique: true,
      trim: true,
      uppercase: true,
      index: true
    },
    vehicleId: {
      type: Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: [true, 'Vehicle reference is required'],
      index: true
    },
    inspectionType: {
      type: String,
      enum: {
        values: ['PRE_RENTAL', 'POST_RENTAL', 'POST_MAINTENANCE', 'ROUTINE', 'ANNUAL'],
        message: '{VALUE} is not a valid inspection type'
      },
      required: true
    },
    result: {
      type: String,
      enum: {
        values: ['PASSED', 'FAILED', 'CONDITIONAL'],
        message: '{VALUE} is not a valid inspection result'
      },
      required: true,
      index: true
    },
    inspectedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    inspectedAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    odometer: {
      type: Number,
      required: [true, 'Odometer reading at inspection is required'],
      min: [0, 'Odometer cannot be negative']
    },
    notes: {
      type: String,
      trim: true,
      default: ''
    },
    issues: {
      type: [inspectionIssueSchema],
      default: []
    },
    checklists: {
      type: inspectionChecklistSchema,
      default: () => ({
        brakes: true,
        lights: true,
        tires: true,
        fluids: true,
        bodywork: true,
        documents: true
      })
    },
    ...softDeleteSchemaDefinition
  },
  {
    ...baseSchemaOptions
  }
);

inspectionSchema.index({ vehicleId: 1, inspectedAt: -1 });
inspectionSchema.index({ vehicleId: 1, result: 1 });

inspectionSchema.methods.toDTO = function (): InspectionDTO {
  return {
    id: this.id || String(this._id),
    inspectionNumber: this.inspectionNumber,
    vehicleId: String(this.vehicleId),
    inspectionType: this.inspectionType,
    result: this.result,
    inspectedBy: String(this.inspectedBy),
    inspectedAt: this.inspectedAt ? this.inspectedAt.toISOString() : new Date().toISOString(),
    odometer: this.odometer,
    notes: this.notes || '',
    issues: this.issues || [],
    checklists: this.checklists || {
      brakes: true,
      lights: true,
      tires: true,
      fluids: true,
      bodywork: true,
      documents: true
    },
    createdAt: this.createdAt ? this.createdAt.toISOString() : new Date().toISOString()
  };
};

export const InspectionModel: Model<IInspectionDoc> =
  mongoose.models.Inspection ||
  mongoose.model<IInspectionDoc>('Inspection', inspectionSchema);

export default InspectionModel;
