import { Request, Response, NextFunction } from 'express';
import { ContactInquiry } from '../models/contact-inquiry.model.js';
import { submitContactSchema } from '../validators/contact.validator.js';
import { auditService } from '../services/audit.service.js';
import { AuthenticatedUser } from '../types/auth.types.js';

export class ContactController {
  /**
   * POST /api/v1/contact
   * Submit customer inquiry
   */
  public static async submitInquiry(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = submitContactSchema.parse(req.body);

      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';
      const userAgent = req.headers['user-agent'] || '';

      const inquiry = await ContactInquiry.create({
        name: validated.name,
        email: validated.email,
        phone: validated.phone || '',
        subject: validated.subject,
        message: validated.message,
        status: 'NEW',
        ipAddress,
        userAgent
      });

      // Audit log entry
      const actor: AuthenticatedUser = req.user || {
        id: inquiry._id.toString(),
        name: validated.name,
        email: validated.email,
        phone: validated.phone,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerified: false,
        phoneVerified: false
      };

      await auditService.log(
        actor,
        'CONTACT_INQUIRY_SUBMITTED',
        'CONTACT',
        inquiry._id.toString(),
        {
          newState: {
            name: validated.name,
            email: validated.email,
            subject: validated.subject
          },
          ipAddress,
          requestId: req.headers['x-request-id'] as string
        }
      );

      res.status(201).json({
        success: true,
        statusCode: 201,
        message: 'Thank you! Your message has been received by our support team.',
        data: {
          inquiryId: inquiry._id.toString(),
          name: inquiry.name,
          email: inquiry.email,
          createdAt: inquiry.createdAt
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/contact (Admin/Staff)
   * List customer inquiries
   */
  public static async listInquiries(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;
      const status = req.query.status as string | undefined;

      const query: Record<string, unknown> = {};
      if (status) query.status = status;

      const total = await ContactInquiry.countDocuments(query);
      const inquiries = await ContactInquiry.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      res.status(200).json({
        success: true,
        statusCode: 200,
        data: {
          items: inquiries,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
          }
        }
      });
    } catch (err) {
      next(err);
    }
  }
}
