import { Request, Response, NextFunction } from 'express';
import { availabilityService } from '../services/availability.service.js';
import { sendSuccess } from '../utils/api-response.js';

export class AvailabilityController {
  /**
   * Check vehicle availability for requested date range
   * GET /api/v1/vehicles/:id/availability?pickupAt=...&returnAt=...
   */
  public async getAvailability(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const id = req.params.id as string;
      const { pickupAt, returnAt } = req.query as { pickupAt: string; returnAt: string };

      const result = await availabilityService.checkVehicleAvailability(
        id,
        new Date(pickupAt),
        new Date(returnAt)
      );

      sendSuccess(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Create an inventory hold lock for checkout
   * POST /api/v1/vehicles/:id/holds
   */
  public async createHold(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const id = req.params.id as string;
      const { pickupAt, returnAt, ttlMinutes } = req.body as {
        pickupAt: string;
        returnAt: string;
        ttlMinutes?: number;
      };
      const userId = req.user!.id;

      const hold = await availabilityService.createInventoryHold(
        id,
        userId,
        new Date(pickupAt),
        new Date(returnAt),
        ttlMinutes ?? 15
      );

      sendSuccess(res, { hold }, 201, 'Inventory hold placed successfully.');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Release an inventory hold explicitly
   * DELETE /api/v1/holds/:id
   */
  public async releaseHold(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const id = req.params.id as string;
      const userId = req.user!.id;

      await availabilityService.releaseInventoryHold(id, userId);

      sendSuccess(res, null, 200, 'Inventory hold released successfully.');
    } catch (err) {
      next(err);
    }
  }
}

export const availabilityController = new AvailabilityController();
export default availabilityController;
