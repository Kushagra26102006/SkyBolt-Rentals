import { Request, Response, NextFunction } from 'express';
import { adminDashboardService } from '../services/admin-dashboard.service.js';
import { auditService } from '../services/audit.service.js';
import { AuthenticatedUser } from '../types/auth.types.js';

export class AdminDashboardController {
  /**
   * GET /api/v1/admin/dashboard/overview
   */
  public async getOverview(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await adminDashboardService.getOverviewMetrics();
      res.status(200).json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/admin/bookings
   */
  public async getBookings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await adminDashboardService.getBookings(req.query as any);
      res.status(200).json({
        success: true,
        data: result.data,
        meta: result.meta
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/admin/users
   */
  public async getUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await adminDashboardService.getUsers(req.query as any);
      res.status(200).json({
        success: true,
        data: result.data,
        meta: result.meta
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/admin/users/:id/role
   */
  public async updateUserRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = req.user as AuthenticatedUser;
      const targetUserId = req.params.id as string;
      const { role, reason } = req.body;

      const updated = await adminDashboardService.updateUserRole(
        targetUserId,
        role,
        actor,
        reason
      );

      res.status(200).json({
        success: true,
        message: `User role successfully updated to ${role}.`,
        data: updated
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/admin/users/:id/status
   */
  public async updateUserStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = req.user as AuthenticatedUser;
      const targetUserId = req.params.id as string;
      const { status, reason } = req.body;

      const updated = await adminDashboardService.updateUserStatus(
        targetUserId,
        status,
        actor,
        reason
      );

      res.status(200).json({
        success: true,
        message: `User account status updated to ${status}.`,
        data: updated
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/admin/maintenance
   */
  public async getMaintenance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await adminDashboardService.getMaintenance(req.query as any);
      res.status(200).json({
        success: true,
        data: result.data,
        meta: result.meta
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/admin/inspections
   */
  public async getInspections(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await adminDashboardService.getInspections(req.query as any);
      res.status(200).json({
        success: true,
        data: result.data,
        meta: result.meta
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/admin/transfers
   */
  public async getTransfers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await adminDashboardService.getTransfers(req.query as any);
      res.status(200).json({
        success: true,
        data: result.data,
        meta: result.meta
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/admin/payments
   */
  public async getPayments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await adminDashboardService.getPayments(req.query as any);
      res.status(200).json({
        success: true,
        data: result.data,
        discrepancies: result.discrepancies,
        meta: result.meta
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/admin/vehicles/:id/operations
   */
  public async getVehicleDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await adminDashboardService.getVehicleOperationsDetail(req.params.id as string);
      res.status(200).json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/admin/audit-logs
   */
  public async getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await auditService.getLogs(req.query as any);
      res.status(200).json({
        success: true,
        data: result.data,
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / result.limit) || 1
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/admin/vehicles/:id/approval
   */
  public async approveVehicle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = req.user as AuthenticatedUser;
      const vehicle = await adminDashboardService.approveVehicle(
        req.params.id as string,
        req.body.status,
        actor,
        req.body.reason
      );
      res.status(200).json({
        success: true,
        data: { vehicle },
        message: `Vehicle listing marked as ${req.body.status}`
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/admin/users/:id/verify-owner
   */
  public async verifyOwner(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = req.user as AuthenticatedUser;
      const user = await adminDashboardService.verifyOwner(
        req.params.id as string,
        req.body.status,
        actor,
        req.body.reason
      );
      res.status(200).json({
        success: true,
        data: { user },
        message: `Owner verification status updated to ${req.body.status}`
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/admin/owners
   */
  public async getOwners(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await adminDashboardService.getOwners(req.query as any);
      res.status(200).json({
        success: true,
        data: result.data,
        meta: result.meta
      });
    } catch (err) {
      next(err);
    }
  }
}

export const adminDashboardController = new AdminDashboardController();
export default adminDashboardController;
