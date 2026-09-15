import mongoose, { Types } from 'mongoose';
import { AuditLogModel } from '../models/audit-log.model.js';
import { AuthenticatedUser } from '../types/auth.types.js';
import { AuditLogDTO } from '../types/fleet.types.js';

export interface RecordAuditOptions {
  previousState?: unknown;
  newState?: unknown;
  reason?: string;
  ipAddress?: string;
  requestId?: string;
}

export class AuditService {
  /**
   * Sanitizes object payload to eliminate any sensitive keys
   */
  private sanitizePayload(data: unknown): unknown {
    if (!data || typeof data !== 'object') return data;

    const sensitiveKeys = [
      'password',
      'passwordhash',
      'secret',
      'jwt',
      'cookie',
      'razorpay_signature',
      'razorpay_secret',
      'token',
      'authorization'
    ];

    try {
      const copy = JSON.parse(JSON.stringify(data));
      const clean = (obj: Record<string, unknown>) => {
        for (const k of Object.keys(obj)) {
          if (sensitiveKeys.some((s) => k.toLowerCase().includes(s))) {
            delete obj[k];
          } else if (obj[k] && typeof obj[k] === 'object') {
            clean(obj[k] as Record<string, unknown>);
          }
        }
      };
      if (typeof copy === 'object' && copy !== null) {
        clean(copy as Record<string, unknown>);
      }
      return copy;
    } catch {
      return '[Unserializable Data]';
    }
  }

  /**
   * Records an immutable operational audit log entry
   */
  public async log(
    actor: AuthenticatedUser,
    action: string,
    entityType: 'VEHICLE' | 'HUB' | 'TRANSFER' | 'MAINTENANCE' | 'INSPECTION' | 'BOOKING' | 'USER' | 'PAYMENT' | 'CONTACT' | 'REVIEW' | 'REVIEW_REPORT' | 'QUEUE_JOB',
    entityId: string,
    options: RecordAuditOptions = {}
  ): Promise<void> {
    try {
      const actorObjectId = Types.ObjectId.isValid(actor.id)
        ? new Types.ObjectId(actor.id)
        : new Types.ObjectId();

      await AuditLogModel.create({
        actorId: actorObjectId,
        actorRole: actor.role,
        actorEmail: actor.email,
        action,
        entityType,
        entityId: String(entityId),
        previousState: this.sanitizePayload(options.previousState),
        newState: this.sanitizePayload(options.newState),
        reason: options.reason || '',
        ipAddress: options.ipAddress || '',
        requestId: options.requestId || '',
        createdAt: new Date()
      });
    } catch (err) {
      // Non-blocking error logging - operational mutation shouldn't fail purely on audit write
      console.warn('[AuditService] Failed to record audit log:', err);
    }
  }

  /**
   * Retrieves paginated audit logs for administration / traceability
   */
  public async getLogs(query: {
    entityType?: string;
    entityId?: string;
    actorId?: string;
    action?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: AuditLogDTO[]; total: number; page: number; limit: number }> {
    const filter: Record<string, unknown> = {};
    if (query.entityType) filter.entityType = query.entityType;
    if (query.entityId) filter.entityId = query.entityId;
    if (query.action) filter.action = query.action;
    if (query.actorId && mongoose.isValidObjectId(query.actorId)) {
      filter.actorId = new Types.ObjectId(query.actorId);
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [docs, total] = await Promise.all([
      AuditLogModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      AuditLogModel.countDocuments(filter).exec()
    ]);

    return {
      data: docs.map((doc) => doc.toDTO()),
      total,
      page,
      limit
    };
  }
}

export const auditService = new AuditService();
export default auditService;
