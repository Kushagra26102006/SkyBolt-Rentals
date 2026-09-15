import { Request, Response, NextFunction } from 'express';
import { ownerService } from '../services/owner.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { ApiError } from '../utils/api-error.js';

export class OwnerController {
  /**
   * POST /api/v1/owner/vehicles
   */
  public createVehicle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(ApiError.unauthorized('Authentication required.'));
      }
      const vehicle = await ownerService.createVehicle(req.user.id, req.body);
      sendSuccess(res, { vehicle }, 201, 'Vehicle submitted for review. It will become active once approved by administration.');
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/owner/vehicles
   */
  public getVehicles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(ApiError.unauthorized('Authentication required.'));
      }
      const vehicles = await ownerService.getVehicles(req.user.id);
      sendSuccess(res, { vehicles }, 200);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/owner/vehicles/:id
   */
  public getVehicleById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(ApiError.unauthorized('Authentication required.'));
      }
      const vehicle = await ownerService.getVehicleById(req.user.id, req.params.id!);
      sendSuccess(res, { vehicle }, 200);
    } catch (err) {
      next(err);
    }
  };

  /**
   * PATCH /api/v1/owner/vehicles/:id
   */
  public updateVehicle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(ApiError.unauthorized('Authentication required.'));
      }
      const vehicle = await ownerService.updateVehicle(req.user.id, req.params.id!, req.body);
      sendSuccess(res, { vehicle }, 200, 'Vehicle listing updated successfully.');
    } catch (err) {
      next(err);
    }
  };

  /**
   * PATCH /api/v1/owner/vehicles/:id/status
   */
  public toggleVehicleStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(ApiError.unauthorized('Authentication required.'));
      }
      const vehicle = await ownerService.toggleVehicleStatus(req.user.id, req.params.id!, req.body.status);
      sendSuccess(res, { vehicle }, 200, `Vehicle status changed to ${req.body.status}.`);
    } catch (err) {
      next(err);
    }
  };

  /**
   * DELETE /api/v1/owner/vehicles/:id
   */
  public deleteVehicle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(ApiError.unauthorized('Authentication required.'));
      }
      await ownerService.deleteVehicle(req.user.id, req.params.id!);
      sendSuccess(res, null, 200, 'Vehicle listing removed successfully.');
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/owner/bookings
   */
  public getBookings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(ApiError.unauthorized('Authentication required.'));
      }
      const bookings = await ownerService.getBookings(req.user.id);
      sendSuccess(res, { bookings }, 200);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/owner/earnings
   */
  public getEarnings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(ApiError.unauthorized('Authentication required.'));
      }
      const earnings = await ownerService.getEarnings(req.user.id);
      sendSuccess(res, earnings, 200);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/owner/stats
   */
  public getStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(ApiError.unauthorized('Authentication required.'));
      }
      const stats = await ownerService.getDashboardStats(req.user.id);
      sendSuccess(res, stats, 200);
    } catch (err) {
      next(err);
    }
  };
}

export const ownerController = new OwnerController();
