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
  | 'sms'
  | 'manager_manual'
  | 'driver_manual'
  | 'customer_app';

export type TripStatus =
  | 'proposed'
  | 'approved'
  | 'loading'
  | 'started'
  | 'in_progress'
  | 'returning'
  | 'completed'
  | 'reconciled'
  | 'cancelled';

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
  | 'HEARTBEAT_10M'
  | 'RETURN_PLANT'
  | 'END';

export interface Customer {
  id: string;
  customerId: string; // e.g. CUST-0001
  name: string;
  phone: string;
  altPhone?: string;
  district: string; // المنطقة / الحي في مأرب
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

export interface Trip {
  id: string;
  tripNumber: string; // e.g. TRIP-2026-0001
  date: string;
  truckId: string;
  driverId: string;
  driverName: string;
  truckPlate: string;
  initialLoadLiters: number; // max 6,000L
  deliveredLiters: number;
  remainingLiters: number;
  status: TripStatus;
  customerStops: TripCustomerStop[];
  orderIds: string[];
  proposedAt: string;
  approvedAt?: string;
  startedAt?: string;
  completedAt?: string;
  reconciledAt?: string;
  
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
  capacityUtilizationPercent: number; // e.g. (totalLiters / 6000) * 100
  
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
  authorizedExpensesDeducted: number; // e.g. emergency diesel or tips
  differenceAmount: number; // actualHandedOver + expenses - totalCashCollected
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
  liters?: number; // for diesel
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
  customerId?: string;
  customerName?: string;
  source: 'sms' | 'app_local' | 'manual_gateway';
  rawSmsText?: string;
  sequenceNumber: number;
  isProcessed: boolean;
}

export interface SMSMessage {
  id: string;
  messageId: string;
  senderNumber: string;
  tripId: string;
  tripNumber: string;
  sequenceNumber: number;
  eventType: GPSEventType;
  lat: number;
  lng: number;
  speed?: number;
  timeString: string;
  customerId?: string;
  rawText: string;
  receivedAt: string;
  status: 'processed' | 'duplicate_rejected' | 'invalid_format' | 'delayed_archived';
  statusReason?: string;
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
  waterProductionCostPerLiter: number; // e.g. 4 YER / Liter
  defaultSellingPricePerLiter: number; // e.g. 15 YER / Liter
  dieselPricePerLiter: number; // e.g. 700 YER / Liter
  truckDieselConsumptionPerKm: number; // e.g. 0.35 Liter per km
  maintenanceAllowancePerTrip: number; // e.g. 2000 YER
  driverWagePerTrip: number; // e.g. 4000 YER
  stopDetectionMinutes: number; // 3 minutes
  minMovementSpeedKmH: number; // 10 km/h
  periodicHeartbeatMinutes: number; // 10 minutes
  plantLocation: {
    name: string;
    city: string;
    lat: number;
    lng: number;
  };
  sabafonCenterNumber: string;
  driverSabafonNumber: string;
  demoDataActive: boolean;
  managerPin?: string;
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
