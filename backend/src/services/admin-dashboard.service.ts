import mongoose, { Types } from 'mongoose';
import { VehicleModel, toAdminVehicle } from '../models/vehicle.model.js';
import { BookingModel } from '../models/booking.model.js';
import { PaymentModel } from '../models/payment.model.js';
import { HubModel } from '../models/hub.model.js';
import { MaintenanceModel } from '../models/maintenance.model.js';
import { InspectionModel } from '../models/inspection.model.js';
import { FleetTransferModel } from '../models/fleet-transfer.model.js';
import { UserModel } from '../models/user.model.js';
import { AuditLogModel } from '../models/audit-log.model.js';
import { auditService } from './audit.service.js';
import { fleetService } from './fleet.service.js';
import { paymentReconciliationService } from './payment-reconciliation.service.js';
import { recommendationService } from './recommendation.service.js';
import { RecommendationMetricsDTO } from '../types/recommendation.types.js';
import { ApiError } from '../utils/api-error.js';
import { AuthenticatedUser, UserRole, UserStatus } from '../types/auth.types.js';

export interface OperationalAlert {
  id: string;
  type:
    | 'VEHICLES_STUCK_IN_MAINTENANCE'
    | 'FAILED_INSPECTIONS'
    | 'TRANSFERS_OVERDUE'
    | 'INACTIVE_HUBS_WITH_VEHICLES'
    | 'PAYMENT_BOOKING_MISMATCHES'
    | 'VEHICLES_WITHOUT_HUBS'
    | 'CAPACITY_OVERFLOW_HUBS';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  message: string;
  count: number;
  entityIds?: string[];
  actionLink?: string;
}

export interface OverviewMetricsDTO {
  vehicles: {
    total: number;
    available: number;
    reserved: number;
    activeRental: number;
    maintenance: number;
    inspection: number;
    transfer: number;
    unavailable: number;
    retired: number;
  };
  bookings: {
    total: number;
    active: number;
    confirmed: number;
    pending: number;
    paymentPending: number;
    completed: number;
    cancelled: number;
    refunded: number;
  };
  payments: {
    total: number;
    captured: number;
    pending: number;
    failed: number;
    refunded: number;
    totalRevenueInr: number;
  };
  hubs: {
    total: number;
    active: number;
    inactive: number;
    totalCapacity: number;
    currentVehicleCount: number;
    occupancyPercent: number;
  };
  alerts: OperationalAlert[];
  recentActivity: Array<{
    id: string;
    timestamp: string;
    actorEmail: string;
    actorRole: string;
    action: string;
    entityType: string;
    entityId: string;
  }>;
  recommendations?: RecommendationMetricsDTO;
}

export class AdminDashboardService {
  /**
   * Authoritative Overview Aggregations & Operational Health Diagnostics
   */
  public async getOverviewMetrics(): Promise<OverviewMetricsDTO> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // 1. Vehicle Fleet Aggregation
    const vehicleAggPromise = VehicleModel.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$fleetStatus', count: { $sum: 1 } } }
    ]);

    // 2. Booking State Aggregation
    const bookingAggPromise = BookingModel.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // 3. Payment Aggregation
    const paymentAggPromise = PaymentModel.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmountPaise: { $sum: '$amountPaise' }
        }
      }
    ]);

    // 4. Hub Capacity Aggregation
    const hubAggPromise = HubModel.aggregate([
      {
        $group: {
          _id: '$operationalStatus',
          count: { $sum: 1 },
          totalCapacity: { $sum: '$capacity' },
          totalVehicles: { $sum: '$currentVehicleCount' }
        }
      }
    ]);

    // 5. Operational Alerts Queries
    // a. Stuck in maintenance > 7 days
    const stuckMaintenancePromise = MaintenanceModel.find({
      status: 'IN_PROGRESS',
      startedAt: { $lt: sevenDaysAgo }
    })
      .select('_id vehicleId startedAt')
      .lean();

    // b. Recent failed inspections
    const failedInspectionsPromise = InspectionModel.find({
      result: 'FAILED'
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('_id vehicleId result createdAt notes')
      .lean();

    // c. Overdue transfers > 24 hours
    const overdueTransfersPromise = FleetTransferModel.find({
      status: { $in: ['PENDING', 'IN_TRANSIT'] },
      createdAt: { $lt: oneDayAgo }
    })
      .select('_id vehicleId status createdAt')
      .lean();

    // d. Inactive hubs with assigned vehicles
    const inactiveHubsWithVehiclesPromise = HubModel.find({
      operationalStatus: { $ne: 'ACTIVE' },
      currentVehicleCount: { $gt: 0 }
    })
      .select('_id name code currentVehicleCount operationalStatus')
      .lean();

    // e. Available vehicles with no assigned hub
    const unhubbedVehiclesPromise = VehicleModel.find({
      isDeleted: false,
      fleetStatus: 'AVAILABLE',
      $or: [{ currentHubId: null }, { currentHubId: { $exists: false } }]
    })
      .select('_id brand model registrationNumber')
      .lean();

    // f. Hubs exceeding capacity
    const overflowHubsPromise = HubModel.find({
      $expr: { $gte: ['$currentVehicleCount', '$capacity'] }
    })
      .select('_id name code capacity currentVehicleCount')
      .lean();

    // g. Payment Reconciliation Discrepancies
    const discrepanciesPromise = paymentReconciliationService.detectDiscrepancies();

    // h. Recent Audit Trail Activity
    const recentAuditPromise = AuditLogModel.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('actorEmail actorRole action entityType entityId createdAt')
      .lean();

    // Execute concurrently
    const [
      vehicleAgg,
      bookingAgg,
      paymentAgg,
      hubAgg,
      stuckMnt,
      failedInsp,
      overdueTrans,
      inactiveHubs,
      unhubbedVehicles,
      overflowHubs,
      discrepancies,
      recentAudit
    ] = await Promise.all([
      vehicleAggPromise,
      bookingAggPromise,
      paymentAggPromise,
      hubAggPromise,
      stuckMaintenancePromise,
      failedInspectionsPromise,
      overdueTransfersPromise,
      inactiveHubsWithVehiclesPromise,
      unhubbedVehiclesPromise,
      overflowHubsPromise,
      discrepanciesPromise,
      recentAuditPromise
    ]);

    // Parse Vehicle Stats
    const vehicleMap = new Map(vehicleAgg.map((item) => [item._id, item.count]));
    const available = vehicleMap.get('AVAILABLE') || 0;
    const reserved = vehicleMap.get('RESERVED') || 0;
    const activeRental = vehicleMap.get('ACTIVE_RENTAL') || 0;
    const maintenance = vehicleMap.get('MAINTENANCE') || 0;
    const inspection = vehicleMap.get('INSPECTION') || 0;
    const transfer = vehicleMap.get('TRANSFER_PENDING') || 0;
    const unavailable = vehicleMap.get('UNAVAILABLE') || 0;
    const retired = vehicleMap.get('RETIRED') || 0;
    const totalVehicles =
      available + reserved + activeRental + maintenance + inspection + transfer + unavailable + retired;

    // Parse Booking Stats
    const bookingMap = new Map(bookingAgg.map((item) => [item._id, item.count]));
    const bConfirmed = bookingMap.get('CONFIRMED') || 0;
    const bActive = bookingMap.get('ACTIVE') || 0;
    const bPending = bookingMap.get('PENDING') || 0;
    const bPaymentPending = bookingMap.get('PAYMENT_PENDING') || 0;
    const bCompleted = bookingMap.get('COMPLETED') || 0;
    const bCancelled = bookingMap.get('CANCELLED') || 0;
    const bRefunded = bookingMap.get('REFUNDED') || 0;
    const totalBookings =
      bConfirmed + bActive + bPending + bPaymentPending + bCompleted + bCancelled + bRefunded;

    // Parse Payment Stats
    const paymentMap = new Map(paymentAgg.map((item) => [item._id, item]));
    const pCaptured = paymentMap.get('CAPTURED')?.count || 0;
    const pPending =
      (paymentMap.get('ORDER_CREATED')?.count || 0) + (paymentMap.get('AUTHORIZED')?.count || 0);
    const pFailed = paymentMap.get('FAILED')?.count || 0;
    const pRefunded = paymentMap.get('REFUNDED')?.count || 0;
    const totalPayments = pCaptured + pPending + pFailed + pRefunded;
    const capturedPaise = paymentMap.get('CAPTURED')?.totalAmountPaise || 0;
    const totalRevenueInr = Math.round(capturedPaise / 100);

    // Parse Hub Stats
    let totalHubCount = 0;
    let activeHubCount = 0;
    let inactiveHubCount = 0;
    let totalCap = 0;
    let totalVehsInHubs = 0;
    for (const h of hubAgg) {
      totalHubCount += h.count;
      totalCap += h.totalCapacity;
      totalVehsInHubs += h.totalVehicles;
      if (h._id === 'ACTIVE') {
        activeHubCount += h.count;
      } else {
        inactiveHubCount += h.count;
      }
    }
    const occupancyPercent = totalCap > 0 ? Math.round((totalVehsInHubs / totalCap) * 100) : 0;

    // Construct Operational Health Alerts
    const alerts: OperationalAlert[] = [];

    if (stuckMnt.length > 0) {
      alerts.push({
        id: 'ALERT_STUCK_MAINTENANCE',
        type: 'VEHICLES_STUCK_IN_MAINTENANCE',
        severity: 'HIGH',
        title: 'Vehicles Stuck in Maintenance',
        message: `${stuckMnt.length} vehicle(s) have been in active maintenance for over 7 days without completion.`,
        count: stuckMnt.length,
        entityIds: stuckMnt.map((m) => String(m.vehicleId)),
        actionLink: '#maintenance'
      });
    }

    if (failedInsp.length > 0) {
      alerts.push({
        id: 'ALERT_FAILED_INSPECTIONS',
        type: 'FAILED_INSPECTIONS',
        severity: 'CRITICAL',
        title: 'Safety Inspection Failures',
        message: `${failedInsp.length} recent safety inspection(s) failed and require technician rectification.`,
        count: failedInsp.length,
        entityIds: failedInsp.map((i) => String(i.vehicleId)),
        actionLink: '#inspections'
      });
    }

    if (overdueTrans.length > 0) {
      alerts.push({
        id: 'ALERT_OVERDUE_TRANSFERS',
        type: 'TRANSFERS_OVERDUE',
        severity: 'MEDIUM',
        title: 'Overdue Inter-Hub Transfers',
        message: `${overdueTrans.length} vehicle transfer(s) initiated over 24 hours ago are still pending completion.`,
        count: overdueTrans.length,
        entityIds: overdueTrans.map((t) => String(t._id)),
        actionLink: '#transfers'
      });
    }

    if (inactiveHubs.length > 0) {
      alerts.push({
        id: 'ALERT_INACTIVE_HUBS',
        type: 'INACTIVE_HUBS_WITH_VEHICLES',
        severity: 'HIGH',
        title: 'Vehicles at Inactive Hubs',
        message: `${inactiveHubs.length} inactive or closed hub(s) still hold assigned physical vehicles.`,
        count: inactiveHubs.length,
        entityIds: inactiveHubs.map((h) => String(h._id)),
        actionLink: '#hubs'
      });
    }

    if (unhubbedVehicles.length > 0) {
      alerts.push({
        id: 'ALERT_UNHUBBED_VEHICLES',
        type: 'VEHICLES_WITHOUT_HUBS',
        severity: 'MEDIUM',
        title: 'Available Vehicles Without Hubs',
        message: `${unhubbedVehicles.length} available vehicle(s) are not assigned to any physical logistics hub.`,
        count: unhubbedVehicles.length,
        entityIds: unhubbedVehicles.map((v) => String(v._id)),
        actionLink: '#fleet'
      });
    }

    if (overflowHubs.length > 0) {
      alerts.push({
        id: 'ALERT_OVERFLOW_HUBS',
        type: 'CAPACITY_OVERFLOW_HUBS',
        severity: 'HIGH',
        title: 'Hub Capacity Exceeded / At Max',
        message: `${overflowHubs.length} logistics hub(s) have reached or exceeded 100% vehicle capacity.`,
        count: overflowHubs.length,
        entityIds: overflowHubs.map((h) => String(h._id)),
        actionLink: '#hubs'
      });
    }

    if (discrepancies.length > 0) {
      alerts.push({
        id: 'ALERT_PAYMENT_DISCREPANCIES',
        type: 'PAYMENT_BOOKING_MISMATCHES',
        severity: 'CRITICAL',
        title: 'Payment & Booking Discrepancies',
        message: `${discrepancies.length} discrepancy anomaly(ies) detected between payments and booking states.`,
        count: discrepancies.length,
        actionLink: '#payments'
      });
    }

    return {
      vehicles: {
        total: totalVehicles,
        available,
        reserved,
        activeRental,
        maintenance,
        inspection,
        transfer,
        unavailable,
        retired
      },
      bookings: {
        total: totalBookings,
        active: bActive,
        confirmed: bConfirmed,
        pending: bPending,
        paymentPending: bPaymentPending,
        completed: bCompleted,
        cancelled: bCancelled,
        refunded: bRefunded
      },
      payments: {
        total: totalPayments,
        captured: pCaptured,
        pending: pPending,
        failed: pFailed,
        refunded: pRefunded,
        totalRevenueInr
      },
      hubs: {
        total: totalHubCount,
        active: activeHubCount,
        inactive: inactiveHubCount,
        totalCapacity: totalCap,
        currentVehicleCount: totalVehsInHubs,
        occupancyPercent
      },
      alerts,
      recentActivity: recentAudit.map((a) => ({
        id: String(a._id),
        timestamp: a.createdAt.toISOString(),
        actorEmail: a.actorEmail,
        actorRole: a.actorRole,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId
      })),
      recommendations: await recommendationService.getOperationalMetrics().catch(() => undefined)
    };
  }

  /**
   * Admin Booking Management (Server-side paginated & filtered)
   */
  public async getBookings(query: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    paymentStatus?: string;
    vehicleId?: string;
    hubId?: string;
    from?: string;
    to?: string;
    sort?: string;
  }): Promise<{
    data: any[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const filter: Record<string, any> = { isDeleted: false };

    if (query.status) {
      filter.status = query.status;
    }

    if (query.paymentStatus) {
      filter.paymentStatus = query.paymentStatus;
    }

    if (query.vehicleId && Types.ObjectId.isValid(query.vehicleId)) {
      filter.vehicleId = new Types.ObjectId(query.vehicleId);
    }

    if (query.from || query.to) {
      filter.pickupAt = {};
      if (query.from) filter.pickupAt.$gte = new Date(query.from);
      if (query.to) filter.pickupAt.$lte = new Date(query.to);
    }

    // Search by reference or user email
    if (query.search) {
      const searchRegex = new RegExp(query.search.trim(), 'i');
      // If valid ObjectId or reference pattern
      filter.$or = [
        { bookingReference: searchRegex }
      ];

      // Find users matching search regex and include their userIds
      const matchingUsers = await UserModel.find({
        $or: [{ email: searchRegex }, { name: searchRegex }]
      })
        .select('_id')
        .lean();

      if (matchingUsers.length > 0) {
        filter.$or.push({ userId: { $in: matchingUsers.map((u) => u._id) } });
      }
    }

    const sortMap: Record<string, Record<string, 1 | -1>> = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      pickup_soonest: { pickupAt: 1 },
      pickup_latest: { pickupAt: -1 },
      amount_high: { 'pricingSnapshot.total': -1 },
      amount_low: { 'pricingSnapshot.total': 1 }
    };
    const sortCriteria = sortMap[query.sort || 'newest'] || { createdAt: -1 };

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [bookings, total] = await Promise.all([
      BookingModel.find(filter)
        .populate('userId', 'name email phone role status')
        .populate('vehicleId', 'brand model variant registrationNumber name fleetStatus category')
        .sort(sortCriteria)
        .skip(skip)
        .limit(limit)
        .lean(),
      BookingModel.countDocuments(filter).exec()
    ]);

    const sanitized = bookings.map((b: any) => ({
      id: String(b._id),
      bookingReference: b.bookingReference,
      customer: b.userId
        ? {
            id: String(b.userId._id),
            name: b.userId.name,
            email: b.userId.email,
            phone: b.userId.phone || ''
          }
        : null,
      vehicle: b.vehicleId
        ? {
            id: String(b.vehicleId._id),
            brand: b.vehicleId.brand,
            model: b.vehicleId.model,
            variant: b.vehicleId.variant || '',
            registrationNumber: b.vehicleId.registrationNumber || '',
            name: b.vehicleId.name,
            category: b.vehicleId.category,
            fleetStatus: b.vehicleId.fleetStatus
          }
        : b.vehicleSnapshot,
      pickupAt: b.pickupAt ? new Date(b.pickupAt).toISOString() : '',
      returnAt: b.returnAt ? new Date(b.returnAt).toISOString() : '',
      pickupLocation: b.pickupLocation?.name || 'Main Logistics Hub',
      returnLocation: b.returnLocation?.name || 'Main Logistics Hub',
      status: b.status,
      paymentStatus: b.paymentStatus,
      pricing: {
        baseRate: b.pricingSnapshot?.baseRate || 0,
        days: b.pricingSnapshot?.durationDays || 1,
        subtotal: b.pricingSnapshot?.subtotal || 0,
        gst: b.pricingSnapshot?.taxes?.gst || 0,
        securityDeposit: b.pricingSnapshot?.securityDeposit || 0,
        total: b.pricingSnapshot?.total || 0,
        currency: b.pricingSnapshot?.currency || 'INR'
      },
      createdAt: b.createdAt ? new Date(b.createdAt).toISOString() : '',
      updatedAt: b.updatedAt ? new Date(b.updatedAt).toISOString() : '',
      statusHistory: b.statusHistory || []
    }));

    return {
      data: sanitized,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1
      }
    };
  }

  /**
   * Admin User Directory (Strictly for ADMIN role)
   */
  public async getUsers(query: {
    page: number;
    limit: number;
    search?: string;
    role?: UserRole;
    status?: UserStatus;
    sort?: string;
  }): Promise<{
    data: any[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const filter: Record<string, any> = { isDeleted: false };

    if (query.role) filter.role = query.role;
    if (query.status) filter.status = query.status;

    if (query.search) {
      const searchRegex = new RegExp(query.search.trim(), 'i');
      filter.$or = [{ name: searchRegex }, { email: searchRegex }, { phone: searchRegex }];
    }

    const sortMap: Record<string, Record<string, 1 | -1>> = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      name_asc: { name: 1 },
      name_desc: { name: -1 }
    };
    const sortCriteria = sortMap[query.sort || 'newest'] || { createdAt: -1 };

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      UserModel.find(filter)
        .select('-passwordHash -__v')
        .sort(sortCriteria)
        .skip(skip)
        .limit(limit)
        .lean(),
      UserModel.countDocuments(filter).exec()
    ]);

    const sanitized = users.map((u: any) => ({
      id: String(u._id),
      name: u.name,
      email: u.email,
      phone: u.phone || '',
      role: u.role,
      status: u.status,
      avatar: u.avatar || '',
      licenseNumber: u.licenseNumber || '',
      emailVerified: Boolean(u.emailVerified),
      phoneVerified: Boolean(u.phoneVerified),
      createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : '',
      updatedAt: u.updatedAt ? new Date(u.updatedAt).toISOString() : '',
      lastLoginAt: u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : null
    }));

    return {
      data: sanitized,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1
      }
    };
  }

  /**
   * Update User Role with Self-Demotion Protection & Audit Trail
   */
  public async updateUserRole(
    targetUserId: string,
    newRole: UserRole,
    actor: AuthenticatedUser,
    reason?: string
  ): Promise<any> {
    if (!mongoose.isValidObjectId(targetUserId)) {
      throw ApiError.badRequest('Invalid user ID.');
    }

    // Protection: Admin cannot change their own role (prevent accidental lockout)
    if (actor.id === targetUserId) {
      throw new ApiError(
        409,
        'SELF_ROLE_CHANGE_BLOCKED',
        'Administrators cannot modify their own role to prevent system lockout.'
      );
    }

    const user = await UserModel.findById(targetUserId);
    if (!user || user.isDeleted) {
      throw new ApiError(404, 'USER_NOT_FOUND', 'User account not found.');
    }

    const previousRole = user.role;
    user.role = newRole;
    await user.save();

    await auditService.log(actor, 'USER_ROLE_UPDATED', 'USER', String(user._id), {
      previousState: { role: previousRole },
      newState: { role: newRole },
      reason: reason || 'Administrative role change'
    });

    return {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status
    };
  }

  /**
   * Update User Account Status (ACTIVE, SUSPENDED, DEACTIVATED)
   */
  public async updateUserStatus(
    targetUserId: string,
    newStatus: UserStatus,
    actor: AuthenticatedUser,
    reason?: string
  ): Promise<any> {
    if (!mongoose.isValidObjectId(targetUserId)) {
      throw ApiError.badRequest('Invalid user ID.');
    }

    // Protection: Admin cannot suspend/deactivate their own account
    if (actor.id === targetUserId) {
      throw new ApiError(
        409,
        'SELF_STATUS_CHANGE_BLOCKED',
        'Administrators cannot suspend or deactivate their own account.'
      );
    }

    const user = await UserModel.findById(targetUserId);
    if (!user || user.isDeleted) {
      throw new ApiError(404, 'USER_NOT_FOUND', 'User account not found.');
    }

    const previousStatus = user.status;
    user.status = newStatus;
    await user.save();

    await auditService.log(actor, 'USER_STATUS_UPDATED', 'USER', String(user._id), {
      previousState: { status: previousStatus },
      newState: { status: newStatus },
      reason: reason || 'Administrative status change'
    });

    return {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status
    };
  }

  /**
   * Global Maintenance List (Server-side paginated & filtered)
   */
  public async getMaintenance(query: {
    page: number;
    limit: number;
    status?: string;
    priority?: string;
    vehicleId?: string;
  }): Promise<{
    data: any[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const filter: Record<string, any> = {};
    if (query.status) filter.status = query.status;
    if (query.priority) filter.priority = query.priority;
    if (query.vehicleId && Types.ObjectId.isValid(query.vehicleId)) {
      filter.vehicleId = new Types.ObjectId(query.vehicleId);
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      MaintenanceModel.find(filter)
        .populate('vehicleId', 'brand model variant registrationNumber name fleetStatus')
        .populate('createdBy', 'name email')
        .populate('completedBy', 'name email')
        .sort({ scheduledAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      MaintenanceModel.countDocuments(filter).exec()
    ]);

    const formatted = records.map((r: any) => ({
      id: String(r._id),
      maintenanceNumber: r.maintenanceNumber,
      vehicle: r.vehicleId
        ? {
            id: String(r.vehicleId._id),
            brand: r.vehicleId.brand,
            model: r.vehicleId.model,
            registrationNumber: r.vehicleId.registrationNumber || '',
            name: r.vehicleId.name,
            fleetStatus: r.vehicleId.fleetStatus
          }
        : null,
      type: r.type,
      description: r.description,
      priority: r.priority,
      status: r.status,
      scheduledAt: r.scheduledAt ? new Date(r.scheduledAt).toISOString() : null,
      startedAt: r.startedAt ? new Date(r.startedAt).toISOString() : null,
      completedAt: r.completedAt ? new Date(r.completedAt).toISOString() : null,
      estimatedCost: r.estimatedCost || 0,
      cost: r.cost || 0,
      odometer: r.odometer || 0,
      serviceProvider: r.serviceProvider || '',
      notes: r.notes || '',
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : ''
    }));

    return {
      data: formatted,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
    };
  }

  /**
   * Global Inspection List (Server-side paginated & filtered)
   */
  public async getInspections(query: {
    page: number;
    limit: number;
    result?: string;
    type?: string;
    vehicleId?: string;
  }): Promise<{
    data: any[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const filter: Record<string, any> = {};
    if (query.result) filter.result = query.result;
    if (query.type) filter.inspectionType = query.type;
    if (query.vehicleId && Types.ObjectId.isValid(query.vehicleId)) {
      filter.vehicleId = new Types.ObjectId(query.vehicleId);
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      InspectionModel.find(filter)
        .populate('vehicleId', 'brand model variant registrationNumber name fleetStatus')
        .populate('inspectedBy', 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      InspectionModel.countDocuments(filter).exec()
    ]);

    const formatted = records.map((i: any) => ({
      id: String(i._id),
      inspectionNumber: i.inspectionNumber,
      vehicle: i.vehicleId
        ? {
            id: String(i.vehicleId._id),
            brand: i.vehicleId.brand,
            model: i.vehicleId.model,
            registrationNumber: i.vehicleId.registrationNumber || '',
            name: i.vehicleId.name,
            fleetStatus: i.vehicleId.fleetStatus
          }
        : null,
      inspector: i.inspectedBy
        ? {
            id: String(i.inspectedBy._id),
            name: i.inspectedBy.name,
            email: i.inspectedBy.email
          }
        : null,
      type: i.inspectionType,
      result: i.result,
      checklist: i.checklist || {},
      issues: i.issues || [],
      notes: i.notes || '',
      createdAt: i.createdAt ? new Date(i.createdAt).toISOString() : ''
    }));

    return {
      data: formatted,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
    };
  }

  /**
   * Global Transfer List (Server-side paginated & filtered)
   */
  public async getTransfers(query: {
    page: number;
    limit: number;
    status?: string;
    fromHubId?: string;
    toHubId?: string;
    vehicleId?: string;
  }): Promise<{
    data: any[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const filter: Record<string, any> = {};
    if (query.status) filter.status = query.status;
    if (query.fromHubId && Types.ObjectId.isValid(query.fromHubId)) {
      filter.fromHubId = new Types.ObjectId(query.fromHubId);
    }
    if (query.toHubId && Types.ObjectId.isValid(query.toHubId)) {
      filter.toHubId = new Types.ObjectId(query.toHubId);
    }
    if (query.vehicleId && Types.ObjectId.isValid(query.vehicleId)) {
      filter.vehicleId = new Types.ObjectId(query.vehicleId);
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      FleetTransferModel.find(filter)
        .populate('vehicleId', 'brand model variant registrationNumber name fleetStatus')
        .populate('fromHubId', 'name code city')
        .populate('toHubId', 'name code city')
        .populate('initiatedBy', 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      FleetTransferModel.countDocuments(filter).exec()
    ]);

    const formatted = records.map((t: any) => ({
      id: String(t._id),
      transferNumber: t.transferNumber,
      vehicle: t.vehicleId
        ? {
            id: String(t.vehicleId._id),
            brand: t.vehicleId.brand,
            model: t.vehicleId.model,
            registrationNumber: t.vehicleId.registrationNumber || '',
            name: t.vehicleId.name,
            fleetStatus: t.vehicleId.fleetStatus
          }
        : null,
      fromHub: t.fromHubId
        ? { id: String(t.fromHubId._id), name: t.fromHubId.name, code: t.fromHubId.code, city: t.fromHubId.city }
        : null,
      toHub: t.toHubId
        ? { id: String(t.toHubId._id), name: t.toHubId.name, code: t.toHubId.code, city: t.toHubId.city }
        : null,
      initiatedBy: t.initiatedBy
        ? { id: String(t.initiatedBy._id), name: t.initiatedBy.name, email: t.initiatedBy.email }
        : null,
      status: t.status,
      reason: t.reason || '',
      notes: t.notes || '',
      createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : '',
      completedAt: t.completedAt ? new Date(t.completedAt).toISOString() : null
    }));

    return {
      data: formatted,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
    };
  }

  /**
   * Admin Payment Overview (Safe fields only, financial reconciliation)
   */
  public async getPayments(query: {
    page: number;
    limit: number;
    status?: string;
    search?: string;
    sort?: string;
  }): Promise<{
    data: any[];
    discrepancies: any[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const filter: Record<string, any> = {};
    if (query.status) filter.status = query.status;

    if (query.search) {
      const searchRegex = new RegExp(query.search.trim(), 'i');
      filter.$or = [
        { paymentReference: searchRegex },
        { providerOrderId: searchRegex },
        { providerPaymentId: searchRegex }
      ];
    }

    const sortMap: Record<string, Record<string, 1 | -1>> = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      amount_high: { amountPaise: -1 },
      amount_low: { amountPaise: 1 }
    };
    const sortCriteria = sortMap[query.sort || 'newest'] || { createdAt: -1 };

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [payments, total, discrepancies] = await Promise.all([
      PaymentModel.find(filter)
        .populate('bookingId', 'bookingReference status pricingSnapshot')
        .populate('userId', 'name email phone')
        .select('-rawSignature -webhookSecret -keySecret -metadata.customerRaw')
        .sort(sortCriteria)
        .skip(skip)
        .limit(limit)
        .lean(),
      PaymentModel.countDocuments(filter).exec(),
      paymentReconciliationService.detectDiscrepancies()
    ]);

    const formatted = payments.map((p: any) => ({
      id: String(p._id),
      paymentReference: p.paymentReference,
      booking: p.bookingId
        ? {
            id: String(p.bookingId._id),
            reference: p.bookingId.bookingReference,
            status: p.bookingId.status
          }
        : null,
      customer: p.userId
        ? {
            id: String(p.userId._id),
            name: p.userId.name,
            email: p.userId.email
          }
        : null,
      amountPaise: p.amountPaise,
      amount: p.amountPaise / 100,
      currency: p.currency,
      status: p.status,
      provider: p.provider,
      providerOrderId: p.providerOrderId || '',
      providerPaymentId: p.providerPaymentId || '',
      failureReason: p.failureReason || null,
      createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : '',
      updatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : ''
    }));

    return {
      data: formatted,
      discrepancies,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
    };
  }

  /**
   * Complete Operational Vehicle Dossier (Single-call aggregation)
   */
  public async getVehicleOperationsDetail(vehicleIdOrCode: string): Promise<any> {
    let vehicle = null;
    if (mongoose.isValidObjectId(vehicleIdOrCode)) {
      vehicle = await VehicleModel.findById(vehicleIdOrCode).populate('currentHubId').exec();
    }
    if (!vehicle) {
      vehicle = await VehicleModel.findOne({
        $or: [{ vehicleCode: vehicleIdOrCode }, { registrationNumber: vehicleIdOrCode }],
        isDeleted: false
      })
        .populate('currentHubId')
        .exec();
    }

    if (!vehicle || vehicle.isDeleted) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', `Vehicle "${vehicleIdOrCode}" not found.`);
    }

    const vId = vehicle._id;

    const [readiness, maintenanceHistory, inspectionHistory, transferHistory, bookingHistory] =
      await Promise.all([
        fleetService.checkVehicleReadiness(String(vehicle._id)),
        MaintenanceModel.find({ vehicleId: vId }).sort({ scheduledAt: -1 }).limit(10).lean(),
        InspectionModel.find({ vehicleId: vId }).sort({ createdAt: -1 }).limit(10).lean(),
        FleetTransferModel.find({ vehicleId: vId })
          .populate('fromHubId', 'name code')
          .populate('toHubId', 'name code')
          .sort({ createdAt: -1 })
          .limit(10)
          .lean(),
        BookingModel.find({ vehicleId: vId, isDeleted: false })
          .populate('userId', 'name email phone')
          .sort({ pickupAt: -1 })
          .limit(10)
          .lean()
      ]);

    return {
      vehicle: toAdminVehicle(vehicle),
      readiness,
      hub: vehicle.currentHubId,
      maintenanceHistory,
      inspectionHistory,
      transferHistory,
      bookingHistory: bookingHistory.map((b: any) => ({
        id: String(b._id),
        reference: b.bookingReference,
        customer: b.userId ? { name: b.userId.name, email: b.userId.email } : null,
        pickupAt: b.pickupAt,
        returnAt: b.returnAt,
        status: b.status,
        total: b.pricingSnapshot?.total || 0
      }))
    };
  }

  /**
   * Approve, reject, or suspend vehicle listing
   */
  public async approveVehicle(
    vehicleId: string,
    status: 'ACTIVE' | 'REJECTED' | 'SUSPENDED',
    actor: AuthenticatedUser,
    reason?: string
  ): Promise<any> {
    const isObjectId = mongoose.isValidObjectId(vehicleId);
    const vehicle = await VehicleModel.findOne({
      ...(isObjectId ? { _id: vehicleId } : { vehicleCode: vehicleId.toUpperCase().trim() }),
      isDeleted: false
    }).exec();

    if (!vehicle) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', `Vehicle "${vehicleId}" not found.`);
    }

    const previousStatus = vehicle.status;
    vehicle.status = status;
    if (status === 'ACTIVE') {
      vehicle.fleetStatus = 'AVAILABLE';
    } else {
      vehicle.fleetStatus = 'UNAVAILABLE';
    }
    await vehicle.save();

    await auditService.log(
      actor,
      `VEHICLE_APPROVAL_${status}`,
      'VEHICLE',
      String(vehicle._id),
      {
        previousState: { status: previousStatus },
        newState: { status },
        reason: reason || `Vehicle marked ${status} by admin`
      }
    );

    return toAdminVehicle(vehicle);
  }

  /**
   * Approve or reject owner identity verification
   */
  public async verifyOwner(
    ownerId: string,
    status: 'ACTIVE' | 'SUSPENDED',
    actor: AuthenticatedUser,
    reason?: string
  ): Promise<any> {
    const user = await UserModel.findById(ownerId).exec();
    if (!user || user.isDeleted) {
      throw new ApiError(404, 'USER_NOT_FOUND', 'User not found.');
    }

    const previousStatus = user.status;
    user.status = status;
    await user.save();

    await auditService.log(
      actor,
      `OWNER_VERIFICATION_${status}`,
      'USER',
      String(user._id),
      {
        previousState: { status: previousStatus },
        newState: { status },
        reason: reason || `Owner verification updated to ${status}`
      }
    );

    return user.toSafeDTO();
  }

  /**
   * List vehicle owners with marketplace statistics
   */
  public async getOwners(query: { page?: number; limit?: number; search?: string }): Promise<any> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = { role: 'OWNER', isDeleted: false };
    if (query.search && query.search.trim()) {
      filter.$or = [
        { name: { $regex: query.search.trim(), $options: 'i' } },
        { email: { $regex: query.search.trim(), $options: 'i' } },
        { phone: { $regex: query.search.trim(), $options: 'i' } }
      ];
    }

    const [total, owners] = await Promise.all([
      UserModel.countDocuments(filter).exec(),
      UserModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec()
    ]);

    const ownerIds = owners.map((o) => o._id);

    // Aggregate vehicles and bookings per owner
    const vehicles = await VehicleModel.find({ ownerId: { $in: ownerIds }, isDeleted: false })
      .select('_id ownerId status')
      .exec();
    const bookings = await BookingModel.find({
      ownerId: { $in: ownerIds },
      isDeleted: false,
      paymentStatus: 'PAID'
    })
      .select('ownerId pricingSnapshot')
      .exec();

    const statsMap = new Map<string, { vehiclesCount: number; activeVehiclesCount: number; totalEarnings: number }>();
    owners.forEach((o) => {
      statsMap.set(String(o._id), { vehiclesCount: 0, activeVehiclesCount: 0, totalEarnings: 0 });
    });

    vehicles.forEach((v) => {
      const oId = String(v.ownerId);
      const stat = statsMap.get(oId);
      if (stat) {
        stat.vehiclesCount += 1;
        if (v.status === 'ACTIVE') stat.activeVehiclesCount += 1;
      }
    });

    bookings.forEach((b) => {
      const oId = String(b.ownerId);
      const stat = statsMap.get(oId);
      if (stat) {
        const base = b.pricingSnapshot?.baseAmount || b.pricingSnapshot?.total || 0;
        stat.totalEarnings += Math.round(base * 0.85);
      }
    });

    const data = owners.map((o) => ({
      ...o.toSafeDTO(),
      stats: statsMap.get(String(o._id)) || { vehiclesCount: 0, activeVehiclesCount: 0, totalEarnings: 0 }
    }));

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1
      }
    };
  }
}

export const adminDashboardService = new AdminDashboardService();
export default adminDashboardService;
