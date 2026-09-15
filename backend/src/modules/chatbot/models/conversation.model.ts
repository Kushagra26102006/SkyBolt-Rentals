import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import { baseSchemaOptions } from '../../../models/base.schema.js';
import { IChatMessage } from '../chatbot.types.js';

export interface IConversationDoc extends Document {
  conversationId: string;
  userId?: Types.ObjectId | null;
  sessionId: string;
  messages: IChatMessage[];
  summary?: string;
  metadata: {
    ip?: string;
    userAgent?: string;
    totalTokens?: number;
    lastActivityAt: Date;
  };
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const chatMessageSchema = new Schema<IChatMessage>(
  {
    role: {
      type: String,
      enum: ['system', 'user', 'assistant', 'tool'],
      required: true
    },
    content: {
      type: String,
      default: ''
    },
    toolCalls: {
      type: [Schema.Types.Mixed],
      default: undefined
    },
    toolCallId: {
      type: String,
      default: undefined
    },
    name: {
      type: String,
      default: undefined
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const conversationSchema = new Schema<IConversationDoc>(
  {
    conversationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    sessionId: {
      type: String,
      required: true,
      index: true,
      trim: true
    },
    messages: {
      type: [chatMessageSchema],
      default: []
    },
    summary: {
      type: String,
      default: ''
    },
    metadata: {
      ip: { type: String, default: '' },
      userAgent: { type: String, default: '' },
      totalTokens: { type: Number, default: 0 },
      lastActivityAt: { type: Date, default: Date.now }
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    ...baseSchemaOptions,
    collection: 'conversations'
  }
);

conversationSchema.index({ userId: 1, updatedAt: -1 });
conversationSchema.index({ sessionId: 1, updatedAt: -1 });

export const ConversationModel: Model<IConversationDoc> =
  mongoose.models.Conversation || mongoose.model<IConversationDoc>('Conversation', conversationSchema);

export default ConversationModel;
