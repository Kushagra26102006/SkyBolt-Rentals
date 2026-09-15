import crypto from 'crypto';
import { Types } from 'mongoose';
import { ConversationModel, IConversationDoc } from '../models/conversation.model.js';
import { IChatMessage } from '../chatbot.types.js';
import { AuthenticatedUser } from '../../../types/auth.types.js';
import { ChatbotError } from '../chatbot.errors.js';

export class ConversationRepository {
  /**
   * Find conversation by unique conversationId
   */
  public async findByConversationId(conversationId: string): Promise<IConversationDoc | null> {
    return ConversationModel.findOne({ conversationId, isDeleted: false }).exec();
  }

  /**
   * Find or create conversation by conversationId or new UUID
   */
  public async findOrCreate(options: {
    conversationId?: string;
    userId?: string | null;
    sessionId: string;
    ip?: string;
    userAgent?: string;
  }): Promise<IConversationDoc> {
    const { conversationId, userId, sessionId, ip, userAgent } = options;

    if (conversationId) {
      const existing = await this.findByConversationId(conversationId);
      if (existing) {
        // Associate conversation if user just logged in
        if (userId && !existing.userId) {
          existing.userId = new Types.ObjectId(userId);
          await existing.save();
        }
        return existing;
      }
    }

    const newConversationId = conversationId || `conv_${crypto.randomUUID()}`;

    const newDoc = new ConversationModel({
      conversationId: newConversationId,
      userId: userId ? new Types.ObjectId(userId) : null,
      sessionId: sessionId || crypto.randomUUID(),
      messages: [],
      summary: '',
      metadata: {
        ip: ip || '',
        userAgent: userAgent || '',
        totalTokens: 0,
        lastActivityAt: new Date()
      }
    });

    return newDoc.save();
  }

  /**
   * Verify ownership between caller and conversation to prevent cross-account access
   */
  public verifyAccess(
    conversation: IConversationDoc,
    user?: AuthenticatedUser,
    sessionId?: string
  ): void {
    // If conversation is owned by a registered user
    if (conversation.userId) {
      if (!user || conversation.userId.toString() !== user.id) {
        throw ChatbotError.forbidden('You do not have permission to view or continue this conversation.');
      }
      return;
    }

    // If conversation was created by a guest session
    if (sessionId && conversation.sessionId !== sessionId && (!user)) {
      throw ChatbotError.forbidden('Session mismatch for conversation.');
    }
  }

  /**
   * Append messages to conversation
   */
  public async appendMessages(
    conversationId: string,
    messages: IChatMessage[],
    tokensUsed = 0
  ): Promise<IConversationDoc | null> {
    return ConversationModel.findOneAndUpdate(
      { conversationId, isDeleted: false },
      {
        $push: { messages: { $each: messages } },
        $inc: { 'metadata.totalTokens': tokensUsed },
        $set: { 'metadata.lastActivityAt': new Date() }
      },
      { returnDocument: 'after' }
    ).exec();
  }

  /**
   * Update running summary for memory compaction
   */
  public async updateSummary(conversationId: string, summary: string): Promise<void> {
    await ConversationModel.updateOne(
      { conversationId, isDeleted: false },
      { $set: { summary, 'metadata.lastActivityAt': new Date() } }
    ).exec();
  }

  /**
   * Clear messages / reset conversation
   */
  public async clearConversation(conversationId: string): Promise<void> {
    await ConversationModel.updateOne(
      { conversationId },
      { $set: { messages: [], summary: '', 'metadata.lastActivityAt': new Date() } }
    ).exec();
  }

  /**
   * Soft delete conversation
   */
  public async deleteConversation(conversationId: string): Promise<void> {
    await ConversationModel.updateOne(
      { conversationId },
      { $set: { isDeleted: true } }
    ).exec();
  }
}

export const conversationRepository = new ConversationRepository();
