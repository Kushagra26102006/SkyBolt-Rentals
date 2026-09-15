import mongoose, { Schema, Document, Model } from 'mongoose';

export type ContactInquiryStatus = 'NEW' | 'IN_REVIEW' | 'RESOLVED' | 'SPAM';

export interface IContactInquiry {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  status: ContactInquiryStatus;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IContactInquiryDoc extends IContactInquiry, Document {
  id: string;
}

const contactInquirySchema = new Schema<IContactInquiryDoc>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true
    },
    phone: {
      type: String,
      trim: true,
      default: ''
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      default: 'general'
    },
    message: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 5000
    },
    status: {
      type: String,
      enum: ['NEW', 'IN_REVIEW', 'RESOLVED', 'SPAM'],
      default: 'NEW',
      index: true
    },
    ipAddress: {
      type: String,
      default: ''
    },
    userAgent: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

contactInquirySchema.index({ email: 1, createdAt: -1 });

export const ContactInquiry: Model<IContactInquiryDoc> =
  mongoose.models.ContactInquiry || mongoose.model<IContactInquiryDoc>('ContactInquiry', contactInquirySchema);
