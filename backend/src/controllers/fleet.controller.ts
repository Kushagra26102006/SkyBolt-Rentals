import { Request, Response, NextFunction } from 'express';
import { fleetService } from '../services/fleet.service.js';
import { hubService } from '../services/hub.service.js';
import { fleetTransferService } from '../services/fleet-transfer.service.js';
import { maintenanceService } from '../services/maintenance.service.js';
import { inspectionService } from '../services/inspection.service.js';
import { fleetBookingIntegrationService } from '../services/fleet-booking-integration.service.js';
import { auditService } from '../services/audit.service.js';
import { AuthenticatedUser } from '../types/auth.types.js';

export class FleetController {
  public async listFleet(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await fleetService.listFleet(req.query as any);
      res.status(200).json({
        success: true,
        data: result.data,
        meta: result.meta,
        pagination: result.meta
      });
    } catch (err) {
      next(err);
    }
  }

  public async getVehicle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const vehicle = await fleetService.getVehicleFleetDetails(req.params.id as string);
      res.status(200).json({
        success: true,
        data: vehicle
      });
    } catch (err) {
      next(err);
    }
  }

  public async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const vehicle = await fleetService.updateFleetStatus(
        req.params.id as string,
        req.body.status,
        user,
        req.body.reason
      );
      res.status(200).json({
        success: true,
        message: `Vehicle fleet status updated to ${req.body.status}.`,
        data: vehicle
      });
    } catch (err) {
      next(err);
    }
  }

  public async checkReadiness(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const pickupAt = req.query.pickupAt ? new Date(req.query.pickupAt as string) : undefined;
      const returnAt = req.query.returnAt ? new Date(req.query.returnAt as string) : undefined;

      const readiness = await fleetService.checkVehicleReadiness(
        req.params.id as string,
        pickupAt,
        returnAt
      );
      res.status(200).json({
        success: true,
        data: readiness
      });
    } catch (err) {
      next(err);
    }
  }

  public async assignHub(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const result = await hubService.assignVehicleToHub(
        req.params.id as string,
        req.body.hubId,
        user
      );
      res.status(200).json({
        success: true,
        message: 'Vehicle assigned to hub successfully.',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  public async removeHub(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const vehicle = await hubService.removeVehicleFromHub(req.params.id as string, user);
      res.status(200).json({
        success: true,
        message: 'Vehicle unassigned from hub.',
        data: vehicle
      });
    } catch (err) {
      next(err);
    }
  }

  public async listTransfers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const transfers = await fleetTransferService.getVehicleTransfers(req.params.id as string);
      res.status(200).json({
        success: true,
        data: transfers
      });
    } catch (err) {
      next(err);
    }
  }

  public async createTransfer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const transfer = await fleetTransferService.initiateTransfer(
        {
          vehicleId: req.params.id as string,
          toHubId: req.body.toHubId,
          reason: req.body.reason,
          notes: req.body.notes
        },
        user
      );
      res.status(201).json({
        success: true,
        message: 'Vehicle transfer initiated.',
        data: transfer
      });
    } catch (err) {
      next(err);
    }
  }

  public async completeTransfer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const transfer = await fleetTransferService.completeTransfer(req.params.id as string, user);
      res.status(200).json({
        success: true,
        message: 'Vehicle transfer completed.',
        data: transfer
      });
    } catch (err) {
      next(err);
    }
  }

  public async cancelTransfer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const transfer = await fleetTransferService.cancelTransfer(
        req.params.id as string,
        user,
        req.body?.reason
      );
      res.status(200).json({
        success: true,
        message: 'Vehicle transfer cancelled.',
        data: transfer
      });
    } catch (err) {
      next(err);
    }
  }

  public async listMaintenance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const records = await maintenanceService.getVehicleMaintenance(req.params.id as string);
      res.status(200).json({
        success: true,
        data: records
      });
    } catch (err) {
      next(err);
    }
  }

  public async createMaintenance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const maintenance = await maintenanceService.scheduleMaintenance(
        {
          vehicleId: req.params.id as string,
          type: req.body.type,
          description: req.body.description,
          priority: req.body.priority,
          scheduledAt: req.body.scheduledAt,
          odometer: req.body.odometer,
          estimatedCost: req.body.estimatedCost,
          serviceProvider: req.body.serviceProvider,
          notes: req.body.notes
        },
        user
      );
      res.status(201).json({
        success: true,
        message: 'Maintenance scheduled.',
        data: maintenance
      });
    } catch (err) {
      next(err);
    }
  }

  public async startMaintenance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const maintenance = await maintenanceService.startMaintenance(req.params.id as string, user);
      res.status(200).json({
        success: true,
        message: 'Maintenance commenced.',
        data: maintenance
      });
    } catch (err) {
      next(err);
    }
  }

  public async completeMaintenance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const maintenance = await maintenanceService.completeMaintenance(
        req.params.id as string,
        req.body,
        user
      );
      res.status(200).json({
        success: true,
        message: 'Maintenance completed. Vehicle moved to inspection.',
        data: maintenance
      });
    } catch (err) {
      next(err);
    }
  }

  public async listInspections(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const inspections = await inspectionService.getVehicleInspections(req.params.id as string);
      res.status(200).json({
        success: true,
        data: inspections
      });
    } catch (err) {
      next(err);
    }
  }

  public async createInspection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const inspection = await inspectionService.recordInspection(
        {
          vehicleId: req.params.id as string,
          inspectionType: req.body.inspectionType,
          result: req.body.result,
          odometer: req.body.odometer,
          notes: req.body.notes,
          issues: req.body.issues,
          checklists: req.body.checklists
        },
        user
      );
      res.status(201).json({
        success: true,
        message: `Inspection recorded (${inspection.result}).`,
        data: inspection
      });
    } catch (err) {
      next(err);
    }
  }

  public async pickupBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const result = await fleetBookingIntegrationService.onBookingPickup(
        req.params.id as string,
        req.body,
        user
      );
      res.status(200).json({
        success: true,
        message: 'Vehicle pickup completed successfully.',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  public async returnBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const result = await fleetBookingIntegrationService.onBookingReturn(
        req.params.id as string,
        req.body,
        user
      );
      res.status(200).json({
        success: true,
        message: 'Vehicle return processed successfully. Vehicle moved to inspection.',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  public async getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await auditService.getLogs(req.query as any);
      res.status(200).json({
        success: true,
        data: result.data,
        meta: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: Math.ceil(result.total / result.limit) || 1
        }
      });
    } catch (err) {
      next(err);
    }
  }
}

export const fleetController = new FleetController();
export default fleetController;
