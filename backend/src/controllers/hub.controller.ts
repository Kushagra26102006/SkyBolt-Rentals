import { Request, Response, NextFunction } from 'express';
import { hubService } from '../services/hub.service.js';
import { AuthenticatedUser } from '../types/auth.types.js';

export class HubController {
  public async createHub(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const hub = await hubService.createHub(req.body, user);
      res.status(201).json({
        success: true,
        message: 'Hub created successfully.',
        data: hub
      });
    } catch (err) {
      next(err);
    }
  }

  public async getHub(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const hub = await hubService.getHubById(req.params.id as string);
      res.status(200).json({
        success: true,
        data: hub
      });
    } catch (err) {
      next(err);
    }
  }

  public async updateHub(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const hub = await hubService.updateHub(req.params.id as string, req.body, user);
      res.status(200).json({
        success: true,
        message: 'Hub updated successfully.',
        data: hub
      });
    } catch (err) {
      next(err);
    }
  }

  public async listHubs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await hubService.listHubs(req.query as any);
      res.status(200).json({
        success: true,
        data: result.data,
        meta: result.meta
      });
    } catch (err) {
      next(err);
    }
  }

  public async getHubVehicles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const vehicles = await hubService.getHubVehicles(req.params.id as string);
      res.status(200).json({
        success: true,
        data: vehicles
      });
    } catch (err) {
      next(err);
    }
  }
}

export const hubController = new HubController();
export default hubController;
