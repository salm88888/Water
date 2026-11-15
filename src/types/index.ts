/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Smart Water Delivery Management System (Marib, Yemen)
 * System Data Types & Interfaces
 */

export type OrderStatus =
  | 'new'
  | 'under_review'
  | 'confirmed'
  | 'waiting_clustering'
  | 'clustered'
  | 'approved'
  | 'in_delivery'
  | 'delivered'
  | 'cancelled'
  | 'postponed';

export type OrderSource =
  | 'phone'
  | 'whatsapp'
  | 'manager_manual'
  | 'driver_manual'
  | 'customer_app';

/**
 * Exact 10 Trip Lifecycle States required by workflow:
 * 1. draft
 * 2. pending_approval
 * 3. rejected
 * 4. approved
 * 5. in_progress
 * 6. returned_to_plant
 * 7. pending_sync
 * 8. synced
 * 9. completed_pending_review
 * 10. closed
 */
export type TripStatus =
  | 'draft'
  | 'pending_approval'
  | 'rejected'
  | 'approved'
  | 'in_progress'
  | 'returned_to_plant'
  | 'pending_sync'
  | 'synced'
  | 'completed_pending_review'
  | 'closed';

export type TripSyncStatus =
  | 'local_only'
  | 'pending_sync'
  | 'syncing'
  | 'synced'
  | 'sync_error';

export type StopStatus =
  | 'pending'
  | 'arrived'
  | 'unloading'
  | 'delivered'
  | 'skipped';

export type GPSEventType =
  | 'START'
  | 'MOVING'
  | 'STOPPED'
  | 'ARRIVAL'
  | 'DEPARTURE'
  | 'RETURN_PLANT'
  | 'END';

export interface Customer {
  id: string;
  customerId: string; // e.g. CUST-0001
  name: string;
  phone: string;
  altPhone?: string;
  district: string;
  addressDetails: string;
  lat: number;
  lng: number;
  tankCapacityLiters: number;
  tankRemainingLiters?: number;
  notes?: string;
  createdAt: string;
  isActive: boolean;
  totalOrdersCount: number;
  totalLitersDelivered: number;
  isOfflineCreated?: boolean;
}

export interface Order {
  id: string;
  orderNumber: string; // e.g. ORD-2026-0001
  customerId: string;
  customerName: string;
  phone: string;
  district: string;
  addressDetails: string;
  lat: number;
  lng: number;
  tankCapacity: number;
  tankRemainingLiters?: number;
  requestedLiters: number;
  pricePerLiter: number;
  totalAmount: number;
  source: OrderSource;
  createdAt: string;
  scheduledDate?: string;
  notes?: string;
  status: OrderStatus;
  tripId?: string;
  isUrgent?: boolean;
  duplicateWarning?: boolean;
  duplicateMatchedOrderId?: string;
}

export interface TripCustomerStop {
  stopSequence: number;
  orderId: string;
  customerId: string;
  customerName: string;
  phone: string;
  district: string;
  addressDetails: string;
  lat: number;
  lng: number;
  tankCapacity: number;
  requestedLiters: number;
  deliveredLiters: number;
  pricePerLiter: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: StopStatus;
  arrivalTime?: string;
  departureTime?: string;
  arrivalLat?: number;
  arrivalLng?: number;
  departureLat?: number;
  departureLng?: number;
  notes?: string;
  invoiceId?: string;
}

export interface TripGPSPoint {
  id: string; // Unique deterministic ID to guarantee idempotent sync & prevent duplicates
  tripId: string;
  lat: number;
  lng: number;
  accuracy?: number; // meters
  speedKmH: number;
  timestamp: string;
  seq: number;
  distanceFromPrevKm: number;
  isWeakSignal?: boolean;
  source: 'gps_watch' | 'gps_android_fg' | 'gps_manual';
}

export interface DetectedStop {
  id: string; // Deterministic ID (e.g., stop-<firstPointId>)
  tripId: string;
  lat: number;
  lng: number;
  startTime: string;
  endTime?: string;
  durationMinutes: number;
  isActive: boolean;
  isProlongedStop: boolean; // >= stopDetectionMinutes threshold
  nearCustomerId?: string;
  nearCustomerName?: string;
  distanceToCustomerMeters?: number;
  isUnplannedStop: boolean; // True when prolonged stop is far from any planned customer stop
  notes?: string;
}

export interface GPSGap {
  id: string;
  tripId: string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  reason: 'weak_signal' | 'connection_loss' | 'gps_paused';
  fromLat?: number;
  fromLng?: number;
  toLat?: number;
  toLng?: number;
}

export interface TripAuditEntry {
  id: string;
  timestamp: string;
  actorRole: 'driver' | 'manager' | 'system';
  actorName: string;
  action: string;
  details?: string;
}

export interface ModificationRequest {
  id: string;
  requestedAt: string;
  requestedBy: string;
  reason: string;
  proposedStops: TripCustomerStop[];
  proposedOrderIds: string[];
  proposedTotalLiters: number;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

export interface Trip {
  id: string;
  tripNumber: string; // e.g. TRIP-2026-0001
  date: string;
  truckId: string;
  driverId: string;
  driverName: string;
  truckPlate: string;
  initialLoadLiters: number; // max truck capacity (6,000L)
  deliveredLiters: number;
  remainingLiters: number;
  status: TripStatus;
  syncStatus: TripSyncStatus;
  createdByRole: 'driver' | 'manager';
  driverAcceptanceStatus?: 'pending' | 'accepted' | 'declined';
  driverRespondedAt?: string;
  driverResponseReason?: string;
  customerStops: TripCustomerStop[];
  orderIds: string[];
  proposedAt: string;
  submittedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  rejectionReason?: string;
  returnedForEditReason?: string;
  startedAt?: string;
  startLocation?: { lat: number; lng: number };
  returnedToPlantAt?: string;
  returnLocation?: {
    lat: number;
    lng: number;
    distanceFromPlantMeters: number;
    detectedAutomatically: boolean;
  };
  completedAt?: string;
  closedAt?: string;
  closedBy?: string;
  reconciledAt?: string;
  lastSyncedAt?: string;

  // GPS Telemetry & Stop Detection
  gpsPoints?: TripGPSPoint[];
  detectedStops?: DetectedStop[];
  gpsGaps?: GPSGap[];
  movingMinutes?: number;
  stoppedMinutes?: number;
  auditLogs?: TripAuditEntry[];
  modificationRequests?: ModificationRequest[];

  // Logistics & Economics
  estimatedDistanceKm: number;
  actualDistanceKm?: number;
  estimatedFuelLiters: number;
  actualFuelLiters?: number;
  fuelCost: number;
  productionCost: number;
  driverWageShare: number;
  maintenanceShare: number;
  otherExpensesShare: number;
  totalCost: number;
  actualCost?: number;
  expectedRevenue: number;
  actualRevenue?: number;
  expectedProfit: number;
  actualProfit?: number;
  profitMarginPercent: number;
  capacityUtilizationPercent: number;

  departureRecommendation: 'GO_NOW' | 'WAIT_MORE' | 'FEASIBLE_PARTIAL' | 'URGENT_OVERRIDE';
  recommendationReason: string;
  notes?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string; // e.g. INV-2026-0001
  orderId: string;
  orderNumber: string;
  tripId: string;
  tripNumber: string;
  customerId: string;
  customerName: string;
  phone: string;
  district: string;
  requestedLiters: number;
  deliveredLiters: number;
  pricePerLiter: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentMethod: 'cash';
  createdAt: string;
  driverName: string;
  isReconciled: boolean;
  notes?: string;
}

export interface DriverReconciliation {
  id: string;
  reconciliationNumber: string; // REC-2026-0001
  tripId: string;
  tripNumber: string;
  driverId: string;
  driverName: string;
  date: string;
  totalInvoicedAmount: number;
  totalCashCollected: number;
  actualCashHandedOver: number;
  authorizedExpensesDeducted: number;
  differenceAmount: number;
  status: 'pending' | 'approved_reconciled' | 'discrepancy';
  notes?: string;
  approvedBy?: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  expenseNumber: string; // EXP-2026-0001
  date: string;
  category:
    | 'diesel'
    | 'oil_change'
    | 'maintenance'
    | 'tires'
    | 'driver_wage'
    | 'water_treatment'
    | 'other';
  description: string;
  amount: number;
  liters?: number;
  tripId?: string;
  tripNumber?: string;
  receiptNumber?: string;
  createdBy: string;
}

export interface GPSEvent {
  id: string;
  tripId: string;
  tripNumber: string;
  timestamp: string;
  eventType: GPSEventType;
  lat: number;
  lng: number;
  speed?: number;
  accuracy?: number;
  customerId?: string;
  customerName?: string;
  source: 'app_local' | 'gps_auto';
  sequenceNumber: number;
  isProcessed: boolean;
}

export interface Truck {
  id: string;
  code: string;
  plateNumber: string;
  model: string;
  maxCapacityLiters: number; // 6,000L
  currentWaterLiters: number;
  driverId: string;
  driverName: string;
  driverPhone?: string;
  status: 'idle' | 'loading' | 'on_trip' | 'maintenance';
  lastLat: number;
  lastLng: number;
  lastSpeed: number;
  lastUpdateTimestamp: string;
  lastEvent: GPSEventType;
  currentTripId?: string;
  odometerKm: number;
}

export interface SystemSettings {
  waterProductionCostPerLiter: number;
  defaultSellingPricePerLiter: number;
  dieselPricePerLiter: number;
  truckDieselConsumptionPerKm: number;
  maintenanceAllowancePerTrip: number;
  driverWagePerTrip: number;

  // GPS & Stop Detection Rules (Manager Configurable)
  stopDetectionMinutes: number; // e.g., 3 minutes stationary -> prolonged stop
  minMovementSpeedKmH: number; // e.g., 8 km/h -> below this considered stationary
  stopRadiusMeters: number; // e.g., 80m -> radius around customer coordinates to link stop
  plantGeofenceMeters: number; // e.g., 120m -> radius around plant to detect return
  gpsSampleIntervalSeconds: number; // e.g., 10s sampling interval
  gpsWeakAccuracyMeters: number; // e.g., 60m -> mark point as weak signal
  gpsGapSeconds: number; // e.g., 120s -> gap duration alert

  plantLocation: {
    name: string;
    city: string;
    lat: number;
    lng: number;
  };
  demoDataActive: boolean;
  demoDataClearedAt?: string;
  demoResetVersion?: number;
  managerPin?: string;
}

export type DriverAccountStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface DriverAccount {
  id: string;
  name: string;
  username: string;
  phone: string;
  password: string;
  licenseNumber?: string;
  status: DriverAccountStatus;
  createdAt: string;
  createdBy: 'manager' | 'driver_self';
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  lastLoginAt?: string;
  isDemo?: boolean;
}

export interface DriverSession {
  id: string;
  name: string;
  username: string;
  phone: string;
  licenseNumber?: string;
  loggedInAt: string;
  isDemo?: boolean;
}

export interface ClusterProposal {
  id: string;
  orders: Order[];
  totalLiters: number;
  capacityUtilization: number;
  customerStops: TripCustomerStop[];
  estimatedDistanceKm: number;
  estimatedFuelLiters: number;
  fuelCost: number;
  productionCost: number;
  driverWageShare: number;
  maintenanceShare: number;
  totalCost: number;
  expectedRevenue: number;
  expectedProfit: number;
  profitMarginPercent: number;
  recommendation: 'GO_NOW' | 'WAIT_MORE' | 'FEASIBLE_PARTIAL' | 'URGENT_OVERRIDE';
  reason: string;
  districtsCovered: string[];
}

export type NotificationPriority = 'urgent' | 'action_required' | 'info';

export type NotificationCategory =
  | 'trip_submitted'
  | 'trip_approved'
  | 'trip_rejected'
  | 'trip_returned'
  | 'trip_driver_accepted'
  | 'trip_driver_declined'
  | 'trip_started'
  | 'trip_returned_plant'
  | 'trip_closed'
  | 'mod_requested'
  | 'mod_approved'
  | 'mod_rejected'
  | 'delivery_logged'
  | 'order_added'
  | 'customer_added'
  | 'gps_alert'
  | 'sync_completed'
  | 'driver_account_requested'
  | 'driver_account_approved'
  | 'driver_account_rejected'
  | 'directive';

export interface AppNotification {
  id: string;
  createdAt: string;
  targetRole: 'manager' | 'driver';
  actorRole: 'manager' | 'driver' | 'system';
  actorName: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  message: string;
  tripId?: string;
  tripNumber?: string;
  orderId?: string;
  directiveId?: string;
  isRead: boolean;
  actionTab?: string;
}

export type DirectiveStatus = 'sent' | 'acknowledged' | 'completed';

export interface ManagerDirective {
  id: string;
  createdAt: string;
  createdBy: string;
  title: string;
  message: string;
  priority: 'normal' | 'urgent';
  tripId?: string;
  tripNumber?: string;
  customerId?: string;
  customerName?: string;
  status: DirectiveStatus;
  acknowledgedAt?: string;
  completedAt?: string;
  driverReply?: string;
}

export interface RealtimePresence {
  managerConnected: boolean;
  managerCount: number;
  driverConnected: boolean;
  driverCount: number;
  driverLastSeenAt?: string;
  managerLastSeenAt?: string;
}

