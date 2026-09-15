import { Request, Response, NextFunction } from 'express';
import { vehicleService } from '../services/vehicle.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { ListVehiclesQueryInput } from '../validators/vehicle.validator.js';

export class VehicleController {
  /**
   * GET /api/v1/vehicles - Public Catalog Query
   */
  public getVehicles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await vehicleService.listVehicles(
        req.query as unknown as ListVehiclesQueryInput,
        req.user?.role
      );
      sendSuccess(res, result, 200);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/vehicles/:id - Vehicle Details Lookup
   */
  public getVehicleById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const vehicle = await vehicleService.getVehicleById(req.params.id!, req.user?.role);
      sendSuccess(res, { vehicle }, 200);
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/vehicles - Create New Vehicle (Admin / Fleet Manager)
   */
  public createVehicle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const vehicle = await vehicleService.createVehicle(req.body, req.user!.role);
      sendSuccess(res, { vehicle }, 201, 'Vehicle created successfully');
    } catch (err) {
      next(err);
    }
  };

  /**
   * PATCH /api/v1/vehicles/:id - Update Vehicle (Admin / Fleet Manager)
   */
  public updateVehicle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const vehicle = await vehicleService.updateVehicle(
        req.params.id!,
        req.body,
        req.user!.role
      );
      sendSuccess(res, { vehicle }, 200, 'Vehicle updated successfully');
    } catch (err) {
      next(err);
    }
  };

  /**
   * DELETE /api/v1/vehicles/:id - Soft-Retire Vehicle (Admin only)
   */
  public deleteVehicle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const vehicle = await vehicleService.retireVehicle(req.params.id!);
      sendSuccess(res, { vehicle }, 200, 'Vehicle retired successfully');
    } catch (err) {
      next(err);
    }
  };
}

export const vehicleController = new VehicleController();
