export type FleetStatus =
  | 'AVAILABLE'
  | 'RESERVED'
  | 'ACTIVE_RENTAL'
  | 'MAINTENANCE'
  | 'INSPECTION'
  | 'UNAVAILABLE'
  | 'TRANSFER_PENDING'
  | 'RETIRED';

export type HubOperationalStatus = 'ACTIVE' | 'INACTIVE' | 'TEMPORARILY_CLOSED';

export interface HubContact {
  phone?: string;
  email?: string;
  managerName?: string;
}

export interface HubCoordinates {
  latitude: number;
  longitude: number;
}

export interface HubDTO {
  id: string;
  name: string;
  code: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  coordinates?: HubCoordinates;
  capacity: number;
  currentVehicleCount: number;
  availableCapacity: number;
  operationalStatus: HubOperationalStatus;
  contact?: HubContact;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateHubInput {
  name: string;
  code: string;
  address: string;
  city: string;
  state: string;
  country?: string;
  postalCode: string;
  capacity: number;
  operationalStatus?: HubOperationalStatus;
  contact?: HubContact;
  timezone?: string;
}

export interface UpdateHubInput {
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  capacity?: number;
  operationalStatus?: HubOperationalStatus;
  contact?: HubContact;
  timezone?: string;
}

export interface HubListQuery {
  city?: string;
  operationalStatus?: HubOperationalStatus;
  search?: string;
  page?: number;
  limit?: number;
}

export type TransferStatus = 'PENDING' | 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED';

export interface TransferDTO {
  id: string;
  transferNumber: string;
  vehicleId: string;
  vehicleCode?: string;
  vehicleName?: string;
  fromHubId: string;
  fromHubCode?: string;
  fromHubName?: string;
  toHubId: string;
  toHubCode?: string;
  toHubName?: string;
  initiatedBy: string;
  completedBy?: string;
  cancelledBy?: string;
  status: TransferStatus;
  reason?: string;
  notes?: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTransferInput {
  vehicleId: string;
  toHubId: string;
  reason?: string;
  notes?: string;
}

export type MaintenanceType =
  | 'ROUTINE'
  | 'REPAIR'
  | 'EMERGENCY'
  | 'TIRE_CHANGE'
  | 'OIL_SERVICE'
  | 'INSPECTION_REMEDY'
  | 'OTHER';

export type MaintenanceStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type MaintenancePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface MaintenanceDTO {
  id: string;
  maintenanceNumber: string;
  vehicleId: string;
  vehicleCode?: string;
  vehicleName?: string;
  type: MaintenanceType;
  description: string;
  status: MaintenanceStatus;
  priority: MaintenancePriority;
  scheduledAt: string;
  startedAt?: string;
  completedAt?: string;
  odometer?: number;
  cost?: number;
  serviceProvider?: string;
  notes?: string;
  createdBy: string;
  completedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMaintenanceInput {
  vehicleId: string;
  type: MaintenanceType;
  description: string;
  priority?: MaintenancePriority;
  scheduledAt: string;
  odometer?: number;
  estimatedCost?: number;
  serviceProvider?: string;
  notes?: string;
}

export interface CompleteMaintenanceInput {
  odometer?: number;
  cost?: number;
  notes?: string;
  serviceProvider?: string;
}

export type InspectionType =
  | 'PRE_RENTAL'
  | 'POST_RENTAL'
  | 'POST_MAINTENANCE'
  | 'ROUTINE'
  | 'ANNUAL';

export type InspectionResult = 'PASSED' | 'FAILED' | 'CONDITIONAL';

export interface InspectionIssue {
  item: string;
  severity: 'LOW' | 'MEDIUM' | 'CRITICAL';
  notes?: string;
}

export interface InspectionChecklist {
  brakes: boolean;
  lights: boolean;
  tires: boolean;
  fluids: boolean;
  bodywork: boolean;
  documents: boolean;
}

export interface InspectionDTO {
  id: string;
  inspectionNumber: string;
  vehicleId: string;
  vehicleCode?: string;
  vehicleName?: string;
  inspectionType: InspectionType;
  result: InspectionResult;
  inspectedBy: string;
  inspectedAt: string;
  odometer: number;
  notes?: string;
  issues: InspectionIssue[];
  checklists: InspectionChecklist;
  createdAt: string;
}

export interface CreateInspectionInput {
  vehicleId: string;
  inspectionType: InspectionType;
  result: InspectionResult;
  odometer: number;
  notes?: string;
  issues?: InspectionIssue[];
  checklists?: Partial<InspectionChecklist>;
}

export interface VehicleReadinessResult {
  ready: boolean;
  vehicleId: string;
  fleetStatus: FleetStatus;
  reasons: string[];
  hubId?: string;
  hubName?: string;
  hubOperational?: boolean;
  checkedAt: string;
}

export interface FleetListQuery {
  fleetStatus?: FleetStatus;
  hubId?: string;
  category?: string;
  search?: string;
  page?: number;
  limit?: number;
  sort?: string;
}

export interface UpdateFleetStatusInput {
  status: FleetStatus;
  reason?: string;
  notes?: string;
}

export interface PickupBookingInput {
  odometer?: number;
  notes?: string;
}

export interface ReturnBookingInput {
  odometer?: number;
  returnHubId?: string;
  notes?: string;
}
