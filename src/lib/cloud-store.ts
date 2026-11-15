/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Cloud Firestore Persistence, Schema Sanitizers & Real-Time Subscriptions
 * Strictly aligned with firestore.rules & firebase-blueprint.json.
 */

import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Query,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  handleFirestoreError,
  OperationType,
} from './firebase';
import type {
  AppNotification,
  Customer,
  DriverAccount,
  DriverReconciliation,
  Expense,
  GPSEvent,
  Invoice,
  ManagerDirective,
  Order,
  SystemSettings,
  Trip,
  Truck,
} from '../types';

export interface CloudAppState {
  settings: SystemSettings | null;
  truck: Truck | null;
  driverAccounts: DriverAccount[];
  customers: Customer[];
  orders: Order[];
  trips: Trip[];
  invoices: Invoice[];
  reconciliations: DriverReconciliation[];
  expenses: Expense[];
  gpsEvents: GPSEvent[];
  notifications: AppNotification[];
  directives: ManagerDirective[];
  hasAnyCloudDocs: boolean;
}

export interface FullLocalStateSnapshot {
  settings: SystemSettings;
  truck: Truck;
  driverAccounts: DriverAccount[];
  customers: Customer[];
  orders: Order[];
  trips: Trip[];
  invoices: Invoice[];
  reconciliations: DriverReconciliation[];
  expenses: Expense[];
  gpsEvents: GPSEvent[];
  notifications: AppNotification[];
  directives: ManagerDirective[];
}

export type CloudCollectionName =
  | 'settings'
  | 'trucks'
  | 'driverAccounts'
  | 'customers'
  | 'orders'
  | 'trips'
  | 'invoices'
  | 'reconciliations'
  | 'expenses'
  | 'gpsEvents'
  | 'notifications'
  | 'directives';

interface KnownDocMeta {
  ownerId: string;
  serverCreatedAt: unknown;
}

// Tracks existing document ownerId & serverCreatedAt from Firestore reads/snapshots
// so subsequent updates preserve immutable audit fields required by firestore.rules.
const knownDocMeta = new Map<string, KnownDocMeta>();
const lastSyncedContentHash = new Map<string, string>();

function metaKey(col: CloudCollectionName, id: string): string {
  return `${col}/${id}`;
}

function stableHashWithoutTimestamps(data: Record<string, unknown>): string {
  const copy: Record<string, unknown> = { ...data };
  delete copy.serverCreatedAt;
  delete copy.serverUpdatedAt;
  delete copy.ownerId;
  return JSON.stringify(copy);
}

export function clearKnownCloudMeta(): void {
  knownDocMeta.clear();
  lastSyncedContentHash.clear();
}

export function isUserBootstrappedAdmin(user: User | null | undefined): boolean {
  if (!user?.email) return false;
  return user.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
}

export function sanitizeDocId(raw: string | undefined | null, fallbackPrefix = 'doc'): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  if (cleaned.length >= 1) return cleaned;
  return `${fallbackPrefix}-${Date.now()}`;
}

function truncStr(val: unknown, maxLen: number, fallback = ''): string {
  const s = typeof val === 'string' ? val.trim() : val == null ? '' : String(val).trim();
  const sliced = s.slice(0, maxLen);
  if (!sliced && fallback) return fallback.slice(0, maxLen);
  return sliced;
}

function optionalStr(val: unknown, maxLen: number): string | undefined {
  if (val === undefined || val === null) return undefined;
  const s = String(val).trim().slice(0, maxLen);
  return s.length > 0 ? s : undefined;
}

function finiteNum(val: unknown, fallback = 0): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function optionalNum(val: unknown): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

function cleanPlainValue(val: unknown): unknown {
  if (val === undefined) return undefined;
  if (val === null) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (typeof val === 'string' || typeof val === 'boolean') return val;
  if (Array.isArray(val)) {
    return val
      .map((item) => cleanPlainValue(item))
      .filter((item) => item !== undefined);
  }
  if (typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v === undefined) continue;
      const cleaned = cleanPlainValue(v);
      if (cleaned !== undefined) {
        out[k] = cleaned;
      }
    }
    return out;
  }
  return undefined;
}

function withAuditFields(
  col: CloudCollectionName,
  docId: string,
  payload: Record<string, unknown>,
  user: User
): Record<string, unknown> {
  const existingMeta = knownDocMeta.get(metaKey(col, docId));
  return {
    ...payload,
    id: docId,
    ownerId: existingMeta?.ownerId || user.uid,
    serverCreatedAt: existingMeta?.serverCreatedAt || serverTimestamp(),
    serverUpdatedAt: serverTimestamp(),
  };
}

function stripCloudMeta<T>(raw: Record<string, unknown>): T {
  const copy: Record<string, unknown> = { ...raw };
  delete copy.ownerId;
  delete copy.serverCreatedAt;
  delete copy.serverUpdatedAt;
  return copy as unknown as T;
}

export function getSettingsDocId(user: User): string {
  if (isUserBootstrappedAdmin(user)) return 'main';
  for (const key of knownDocMeta.keys()) {
    if (key.startsWith('settings/')) {
      return key.slice('settings/'.length);
    }
  }
  return sanitizeDocId(`cfg_${user.uid}`, 'cfg');
}

export function getTruckDocId(truck: Truck, user: User): string {
  for (const key of knownDocMeta.keys()) {
    if (key.startsWith('trucks/')) {
      return key.slice('trucks/'.length);
    }
  }
  const baseId = sanitizeDocId(truck.id || 'TRUCK-01', 'truck');
  return isUserBootstrappedAdmin(user) ? baseId : sanitizeDocId(`${baseId}_${user.uid.slice(0, 8)}`, 'truck');
}

// --- Exact Schema Sanitizers Matching firestore.rules ---

export function serializeSettings(
  settings: SystemSettings,
  user: User,
  docId?: string
): { id: string; data: Record<string, unknown> } {
  const id = docId || getSettingsDocId(user);
  const customDistricts = Array.isArray(settings.customDistricts)
    ? Array.from(
        new Set(
          settings.customDistricts
            .map((d) => truncStr(d, 150))
            .filter((d) => d.length > 0)
        )
      ).slice(0, 300)
    : undefined;

  const base: Record<string, unknown> = {
    waterProductionCostPerLiter: finiteNum(settings.waterProductionCostPerLiter, 1),
    defaultSellingPricePerLiter: finiteNum(settings.defaultSellingPricePerLiter, 3),
    dieselPricePerLiter: finiteNum(settings.dieselPricePerLiter, 1200),
    truckDieselConsumptionPerKm: finiteNum(settings.truckDieselConsumptionPerKm, 0.35),
    maintenanceAllowancePerTrip: finiteNum(settings.maintenanceAllowancePerTrip, 2000),
    driverWagePerTrip: finiteNum(settings.driverWagePerTrip, 4000),
    stopDetectionMinutes: finiteNum(settings.stopDetectionMinutes, 3),
    minMovementSpeedKmH: finiteNum(settings.minMovementSpeedKmH, 8),
    stopRadiusMeters: finiteNum(settings.stopRadiusMeters, 80),
    plantGeofenceMeters: finiteNum(settings.plantGeofenceMeters, 120),
    gpsSampleIntervalSeconds: finiteNum(settings.gpsSampleIntervalSeconds, 10),
    gpsWeakAccuracyMeters: finiteNum(settings.gpsWeakAccuracyMeters, 60),
    gpsGapSeconds: finiteNum(settings.gpsGapSeconds, 120),
    plantLocation: {
      name: truncStr(settings.plantLocation?.name, 150, 'مصنع مياهنا المركزي'),
      city: truncStr(settings.plantLocation?.city, 150, 'مأرب - مديرية الوادي'),
      lat: finiteNum(settings.plantLocation?.lat, 15.4622),
      lng: finiteNum(settings.plantLocation?.lng, 45.3264),
    },
    ...(customDistricts ? { customDistricts } : {}),
    demoDataActive: Boolean(settings.demoDataActive),
    ...(optionalStr(settings.demoDataClearedAt, 64)
      ? { demoDataClearedAt: optionalStr(settings.demoDataClearedAt, 64) }
      : {}),
    ...(optionalNum(settings.demoResetVersion) !== undefined
      ? { demoResetVersion: optionalNum(settings.demoResetVersion) }
      : {}),
    ...(optionalStr(settings.managerPin, 32)
      ? { managerPin: optionalStr(settings.managerPin, 32) }
      : {}),
  };

  return { id, data: withAuditFields('settings', id, base, user) };
}

export function serializeTruck(
  truck: Truck,
  user: User,
  docId?: string
): { id: string; data: Record<string, unknown> } {
  const id = docId || getTruckDocId(truck, user);
  const validStatuses = ['idle', 'loading', 'on_trip', 'maintenance'] as const;
  const status = validStatuses.includes(truck.status) ? truck.status : 'idle';

  const base: Record<string, unknown> = {
    ...(optionalStr(truck.code, 64) ? { code: optionalStr(truck.code, 64) } : {}),
    plateNumber: truncStr(truck.plateNumber, 64, 'TRUCK-01'),
    ...(optionalStr(truck.model, 120) ? { model: optionalStr(truck.model, 120) } : {}),
    maxCapacityLiters: finiteNum(truck.maxCapacityLiters, 6000),
    currentWaterLiters: finiteNum(truck.currentWaterLiters, 0),
    ...(truck.driverId !== undefined ? { driverId: truncStr(truck.driverId, 128) } : {}),
    ...(truck.driverName !== undefined ? { driverName: truncStr(truck.driverName, 120) } : {}),
    ...(optionalStr(truck.driverPhone, 32) ? { driverPhone: optionalStr(truck.driverPhone, 32) } : {}),
    status,
    lastLat: finiteNum(truck.lastLat, 15.4622),
    lastLng: finiteNum(truck.lastLng, 45.3264),
    lastSpeed: finiteNum(truck.lastSpeed, 0),
    ...(optionalStr(truck.lastUpdateTimestamp, 64)
      ? { lastUpdateTimestamp: optionalStr(truck.lastUpdateTimestamp, 64) }
      : {}),
    ...(optionalStr(truck.lastEvent, 32) ? { lastEvent: optionalStr(truck.lastEvent, 32) } : {}),
    ...(optionalStr(truck.currentTripId, 128)
      ? { currentTripId: optionalStr(truck.currentTripId, 128) }
      : {}),
    odometerKm: finiteNum(truck.odometerKm, 0),
  };

  return { id, data: withAuditFields('trucks', id, base, user) };
}

export function serializeDriverAccount(
  acc: DriverAccount,
  user: User
): { id: string; data: Record<string, unknown> } {
  const id = sanitizeDocId(acc.id, 'drv');
  const rawPassword = truncStr(acc.password, 128, '1234');
  const safePassword = rawPassword.length >= 4 ? rawPassword : rawPassword.padEnd(4, '0');
  const validStatuses = ['pending', 'approved', 'rejected', 'suspended'] as const;
  const status = validStatuses.includes(acc.status)
    ? acc.status
    : isUserBootstrappedAdmin(user)
      ? 'pending'
      : 'pending';

  const base: Record<string, unknown> = {
    name: truncStr(acc.name, 120, 'سائق'),
    username: truncStr(acc.username || acc.phone, 64, id),
    phone: truncStr(acc.phone || acc.username, 32, '700000000'),
    password: safePassword,
    ...(optionalStr(acc.licenseNumber, 64)
      ? { licenseNumber: optionalStr(acc.licenseNumber, 64) }
      : {}),
    status,
    createdAt: truncStr(acc.createdAt, 64, new Date().toISOString()),
    ...(optionalStr(acc.createdBy, 24) ? { createdBy: optionalStr(acc.createdBy, 24) } : {}),
    ...(optionalStr(acc.approvedAt, 64) ? { approvedAt: optionalStr(acc.approvedAt, 64) } : {}),
    ...(optionalStr(acc.approvedBy, 120) ? { approvedBy: optionalStr(acc.approvedBy, 120) } : {}),
    ...(optionalStr(acc.rejectedAt, 64) ? { rejectedAt: optionalStr(acc.rejectedAt, 64) } : {}),
    ...(optionalStr(acc.rejectionReason, 500)
      ? { rejectionReason: optionalStr(acc.rejectionReason, 500) }
      : {}),
    ...(optionalStr(acc.lastLoginAt, 64) ? { lastLoginAt: optionalStr(acc.lastLoginAt, 64) } : {}),
    ...(typeof acc.isDemo === 'boolean' ? { isDemo: acc.isDemo } : {}),
  };

  return { id, data: withAuditFields('driverAccounts', id, base, user) };
}

export function serializeCustomer(
  c: Customer,
  user: User
): { id: string; data: Record<string, unknown> } {
  const id = sanitizeDocId(c.id, 'cust');
  const base: Record<string, unknown> = {
    ...(optionalStr(c.customerId, 64) ? { customerId: optionalStr(c.customerId, 64) } : {}),
    name: truncStr(c.name, 150, 'عميل'),
    phone: truncStr(c.phone, 32, ''),
    ...(optionalStr(c.altPhone, 32) ? { altPhone: optionalStr(c.altPhone, 32) } : {}),
    district: truncStr(c.district, 150, 'حصون آل جلال'),
    addressDetails: truncStr(c.addressDetails, 500, ''),
    lat: finiteNum(c.lat, 15.4622),
    lng: finiteNum(c.lng, 45.3264),
    tankCapacityLiters: finiteNum(c.tankCapacityLiters, 2000),
    ...(optionalNum(c.tankRemainingLiters) !== undefined
      ? { tankRemainingLiters: optionalNum(c.tankRemainingLiters) }
      : {}),
    ...(optionalStr(c.notes, 1000) ? { notes: optionalStr(c.notes, 1000) } : {}),
    createdAt: truncStr(c.createdAt, 64, new Date().toISOString()),
    isActive: typeof c.isActive === 'boolean' ? c.isActive : true,
    totalOrdersCount: finiteNum(c.totalOrdersCount, 0),
    totalLitersDelivered: finiteNum(c.totalLitersDelivered, 0),
    ...(typeof c.isOfflineCreated === 'boolean' ? { isOfflineCreated: c.isOfflineCreated } : {}),
  };

  return { id, data: withAuditFields('customers', id, base, user) };
}

export function serializeOrder(
  o: Order,
  user: User
): { id: string; data: Record<string, unknown> } {
  const id = sanitizeDocId(o.id, 'ord');
  const base: Record<string, unknown> = {
    ...(optionalStr(o.orderNumber, 64) ? { orderNumber: optionalStr(o.orderNumber, 64) } : {}),
    ...(o.customerId !== undefined ? { customerId: truncStr(o.customerId, 128) } : {}),
    customerName: truncStr(o.customerName, 150, 'عميل'),
    phone: truncStr(o.phone, 32, ''),
    district: truncStr(o.district, 150, 'حصون آل جلال'),
    addressDetails: truncStr(o.addressDetails, 500, ''),
    lat: finiteNum(o.lat, 15.4622),
    lng: finiteNum(o.lng, 45.3264),
    tankCapacity: finiteNum(o.tankCapacity, 2000),
    ...(optionalNum(o.tankRemainingLiters) !== undefined
      ? { tankRemainingLiters: optionalNum(o.tankRemainingLiters) }
      : {}),
    requestedLiters: finiteNum(o.requestedLiters, 2000),
    pricePerLiter: finiteNum(o.pricePerLiter, 3),
    totalAmount: finiteNum(o.totalAmount, 0),
    ...(optionalStr(o.source, 32) ? { source: optionalStr(o.source, 32) } : {}),
    createdAt: truncStr(o.createdAt, 64, new Date().toISOString()),
    ...(optionalStr(o.scheduledDate, 64)
      ? { scheduledDate: optionalStr(o.scheduledDate, 64) }
      : {}),
    ...(optionalStr(o.notes, 1000) ? { notes: optionalStr(o.notes, 1000) } : {}),
    status: truncStr(o.status, 32, 'waiting_clustering'),
    ...(optionalStr(o.tripId, 128) ? { tripId: optionalStr(o.tripId, 128) } : {}),
    ...(typeof o.isUrgent === 'boolean' ? { isUrgent: o.isUrgent } : {}),
    ...(typeof o.duplicateWarning === 'boolean' ? { duplicateWarning: o.duplicateWarning } : {}),
    ...(optionalStr(o.duplicateMatchedOrderId, 64)
      ? { duplicateMatchedOrderId: optionalStr(o.duplicateMatchedOrderId, 64) }
      : {}),
  };

  return { id, data: withAuditFields('orders', id, base, user) };
}

export function serializeTrip(
  t: Trip,
  user: User
): { id: string; data: Record<string, unknown> } {
  const id = sanitizeDocId(t.id, 'trip');
  const customerStops = Array.isArray(t.customerStops)
    ? (cleanPlainValue(t.customerStops.slice(0, 50)) as unknown[])
    : [];
  const orderIds = Array.isArray(t.orderIds)
    ? t.orderIds
        .slice(0, 50)
        .map((oid) => truncStr(oid, 128))
        .filter((oid) => oid.length > 0)
    : [];
  const gpsPoints = Array.isArray(t.gpsPoints)
    ? (cleanPlainValue(t.gpsPoints.slice(-1500)) as unknown[])
    : undefined;
  const detectedStops = Array.isArray(t.detectedStops)
    ? (cleanPlainValue(t.detectedStops.slice(0, 200)) as unknown[])
    : undefined;
  const gpsGaps = Array.isArray(t.gpsGaps)
    ? (cleanPlainValue(t.gpsGaps.slice(0, 200)) as unknown[])
    : undefined;
  const auditLogs = Array.isArray(t.auditLogs)
    ? (cleanPlainValue(t.auditLogs.slice(-400)) as unknown[])
    : undefined;
  const modificationRequests = Array.isArray(t.modificationRequests)
    ? (cleanPlainValue(t.modificationRequests.slice(-50)) as unknown[])
    : undefined;

  const base: Record<string, unknown> = {
    tripNumber: truncStr(t.tripNumber, 64, id),
    ...(optionalStr(t.date, 32) ? { date: optionalStr(t.date, 32) } : {}),
    ...(optionalStr(t.truckId, 128) ? { truckId: optionalStr(t.truckId, 128) } : {}),
    ...(optionalStr(t.driverId, 128) ? { driverId: optionalStr(t.driverId, 128) } : {}),
    ...(optionalStr(t.driverName, 120) ? { driverName: optionalStr(t.driverName, 120) } : {}),
    ...(optionalStr(t.truckPlate, 64) ? { truckPlate: optionalStr(t.truckPlate, 64) } : {}),
    initialLoadLiters: finiteNum(t.initialLoadLiters, 6000),
    deliveredLiters: finiteNum(t.deliveredLiters, 0),
    remainingLiters: finiteNum(t.remainingLiters, 0),
    status: truncStr(t.status, 40, 'draft'),
    ...(optionalStr(t.syncStatus, 32) ? { syncStatus: optionalStr(t.syncStatus, 32) } : {}),
    ...(optionalStr(t.createdByRole, 20)
      ? { createdByRole: optionalStr(t.createdByRole, 20) }
      : {}),
    ...(optionalStr(t.driverAcceptanceStatus, 32)
      ? { driverAcceptanceStatus: optionalStr(t.driverAcceptanceStatus, 32) }
      : {}),
    ...(optionalStr(t.driverRespondedAt, 64)
      ? { driverRespondedAt: optionalStr(t.driverRespondedAt, 64) }
      : {}),
    ...(optionalStr(t.driverResponseReason, 500)
      ? { driverResponseReason: optionalStr(t.driverResponseReason, 500) }
      : {}),
    customerStops,
    orderIds,
    proposedAt: truncStr(t.proposedAt, 64, new Date().toISOString()),
    ...(optionalStr(t.submittedAt, 64) ? { submittedAt: optionalStr(t.submittedAt, 64) } : {}),
    ...(optionalStr(t.approvedAt, 64) ? { approvedAt: optionalStr(t.approvedAt, 64) } : {}),
    ...(optionalStr(t.approvedBy, 120) ? { approvedBy: optionalStr(t.approvedBy, 120) } : {}),
    ...(optionalStr(t.rejectedAt, 64) ? { rejectedAt: optionalStr(t.rejectedAt, 64) } : {}),
    ...(optionalStr(t.rejectedBy, 120) ? { rejectedBy: optionalStr(t.rejectedBy, 120) } : {}),
    ...(optionalStr(t.rejectionReason, 500)
      ? { rejectionReason: optionalStr(t.rejectionReason, 500) }
      : {}),
    ...(optionalStr(t.returnedForEditReason, 500)
      ? { returnedForEditReason: optionalStr(t.returnedForEditReason, 500) }
      : {}),
    ...(optionalStr(t.startedAt, 64) ? { startedAt: optionalStr(t.startedAt, 64) } : {}),
    ...(t.startLocation && typeof t.startLocation === 'object'
      ? { startLocation: cleanPlainValue(t.startLocation) }
      : {}),
    ...(optionalStr(t.returnedToPlantAt, 64)
      ? { returnedToPlantAt: optionalStr(t.returnedToPlantAt, 64) }
      : {}),
    ...(t.returnLocation && typeof t.returnLocation === 'object'
      ? { returnLocation: cleanPlainValue(t.returnLocation) }
      : {}),
    ...(optionalStr(t.completedAt, 64) ? { completedAt: optionalStr(t.completedAt, 64) } : {}),
    ...(optionalStr(t.closedAt, 64) ? { closedAt: optionalStr(t.closedAt, 64) } : {}),
    ...(optionalStr(t.closedBy, 120) ? { closedBy: optionalStr(t.closedBy, 120) } : {}),
    ...(optionalStr(t.reconciledAt, 64) ? { reconciledAt: optionalStr(t.reconciledAt, 64) } : {}),
    ...(optionalStr(t.lastSyncedAt, 64) ? { lastSyncedAt: optionalStr(t.lastSyncedAt, 64) } : {}),
    ...(gpsPoints ? { gpsPoints } : {}),
    ...(detectedStops ? { detectedStops } : {}),
    ...(gpsGaps ? { gpsGaps } : {}),
    ...(optionalNum(t.movingMinutes) !== undefined
      ? { movingMinutes: optionalNum(t.movingMinutes) }
      : {}),
    ...(optionalNum(t.stoppedMinutes) !== undefined
      ? { stoppedMinutes: optionalNum(t.stoppedMinutes) }
      : {}),
    ...(auditLogs ? { auditLogs } : {}),
    ...(modificationRequests ? { modificationRequests } : {}),
    estimatedDistanceKm: finiteNum(t.estimatedDistanceKm, 0),
    ...(optionalNum(t.actualDistanceKm) !== undefined
      ? { actualDistanceKm: optionalNum(t.actualDistanceKm) }
      : {}),
    estimatedFuelLiters: finiteNum(t.estimatedFuelLiters, 0),
    ...(optionalNum(t.actualFuelLiters) !== undefined
      ? { actualFuelLiters: optionalNum(t.actualFuelLiters) }
      : {}),
    fuelCost: finiteNum(t.fuelCost, 0),
    productionCost: finiteNum(t.productionCost, 0),
    driverWageShare: finiteNum(t.driverWageShare, 0),
    maintenanceShare: finiteNum(t.maintenanceShare, 0),
    otherExpensesShare: finiteNum(t.otherExpensesShare, 0),
    totalCost: finiteNum(t.totalCost, 0),
    ...(optionalNum(t.actualCost) !== undefined ? { actualCost: optionalNum(t.actualCost) } : {}),
    expectedRevenue: finiteNum(t.expectedRevenue, 0),
    ...(optionalNum(t.actualRevenue) !== undefined
      ? { actualRevenue: optionalNum(t.actualRevenue) }
      : {}),
    expectedProfit: finiteNum(t.expectedProfit, 0),
    ...(optionalNum(t.actualProfit) !== undefined
      ? { actualProfit: optionalNum(t.actualProfit) }
      : {}),
    profitMarginPercent: finiteNum(t.profitMarginPercent, 0),
    capacityUtilizationPercent: finiteNum(t.capacityUtilizationPercent, 0),
    ...(optionalStr(t.departureRecommendation, 32)
      ? { departureRecommendation: optionalStr(t.departureRecommendation, 32) }
      : {}),
    ...(optionalStr(t.recommendationReason, 500)
      ? { recommendationReason: optionalStr(t.recommendationReason, 500) }
      : {}),
    ...(optionalStr(t.notes, 1000) ? { notes: optionalStr(t.notes, 1000) } : {}),
  };

  return { id, data: withAuditFields('trips', id, base, user) };
}

export function serializeInvoice(
  inv: Invoice,
  user: User
): { id: string; data: Record<string, unknown> } {
  const id = sanitizeDocId(inv.id, 'inv');
  const base: Record<string, unknown> = {
    invoiceNumber: truncStr(inv.invoiceNumber, 64, id),
    ...(optionalStr(inv.orderId, 128) ? { orderId: optionalStr(inv.orderId, 128) } : {}),
    ...(optionalStr(inv.orderNumber, 64) ? { orderNumber: optionalStr(inv.orderNumber, 64) } : {}),
    tripId: truncStr(inv.tripId, 128, 'trip'),
    ...(optionalStr(inv.tripNumber, 64) ? { tripNumber: optionalStr(inv.tripNumber, 64) } : {}),
    ...(optionalStr(inv.customerId, 128) ? { customerId: optionalStr(inv.customerId, 128) } : {}),
    customerName: truncStr(inv.customerName, 150, 'عميل'),
    ...(optionalStr(inv.phone, 32) ? { phone: optionalStr(inv.phone, 32) } : {}),
    ...(optionalStr(inv.district, 150) ? { district: optionalStr(inv.district, 150) } : {}),
    requestedLiters: finiteNum(inv.requestedLiters, 0),
    deliveredLiters: finiteNum(inv.deliveredLiters, 0),
    pricePerLiter: finiteNum(inv.pricePerLiter, 0),
    totalAmount: finiteNum(inv.totalAmount, 0),
    paidAmount: finiteNum(inv.paidAmount, 0),
    remainingAmount: finiteNum(inv.remainingAmount, 0),
    paymentMethod: truncStr(inv.paymentMethod, 20, 'cash'),
    createdAt: truncStr(inv.createdAt, 64, new Date().toISOString()),
    ...(optionalStr(inv.driverName, 120) ? { driverName: optionalStr(inv.driverName, 120) } : {}),
    isReconciled: Boolean(inv.isReconciled),
    ...(optionalStr(inv.notes, 1000) ? { notes: optionalStr(inv.notes, 1000) } : {}),
  };

  return { id, data: withAuditFields('invoices', id, base, user) };
}

export function serializeReconciliation(
  rec: DriverReconciliation,
  user: User
): { id: string; data: Record<string, unknown> } {
  const id = sanitizeDocId(rec.id, 'rec');
  const base: Record<string, unknown> = {
    reconciliationNumber: truncStr(rec.reconciliationNumber, 64, id),
    tripId: truncStr(rec.tripId, 128, 'trip'),
    ...(optionalStr(rec.tripNumber, 64) ? { tripNumber: optionalStr(rec.tripNumber, 64) } : {}),
    ...(optionalStr(rec.driverId, 128) ? { driverId: optionalStr(rec.driverId, 128) } : {}),
    ...(optionalStr(rec.driverName, 120) ? { driverName: optionalStr(rec.driverName, 120) } : {}),
    ...(optionalStr(rec.date, 32) ? { date: optionalStr(rec.date, 32) } : {}),
    totalInvoicedAmount: finiteNum(rec.totalInvoicedAmount, 0),
    totalCashCollected: finiteNum(rec.totalCashCollected, 0),
    actualCashHandedOver: finiteNum(rec.actualCashHandedOver, 0),
    authorizedExpensesDeducted: finiteNum(rec.authorizedExpensesDeducted, 0),
    differenceAmount: finiteNum(rec.differenceAmount, 0),
    status: truncStr(rec.status, 32, 'pending'),
    ...(optionalStr(rec.notes, 1000) ? { notes: optionalStr(rec.notes, 1000) } : {}),
    ...(optionalStr(rec.approvedBy, 120) ? { approvedBy: optionalStr(rec.approvedBy, 120) } : {}),
    createdAt: truncStr(rec.createdAt, 64, new Date().toISOString()),
  };

  return { id, data: withAuditFields('reconciliations', id, base, user) };
}

export function serializeExpense(
  exp: Expense,
  user: User
): { id: string; data: Record<string, unknown> } {
  const id = sanitizeDocId(exp.id, 'exp');
  const base: Record<string, unknown> = {
    expenseNumber: truncStr(exp.expenseNumber, 64, id),
    date: truncStr(exp.date, 32, new Date().toISOString().slice(0, 10)),
    category: truncStr(exp.category, 32, 'other'),
    description: truncStr(exp.description, 500, 'مصروف تشغيلي'),
    amount: finiteNum(exp.amount, 0),
    ...(optionalNum(exp.liters) !== undefined ? { liters: optionalNum(exp.liters) } : {}),
    ...(optionalStr(exp.tripId, 128) ? { tripId: optionalStr(exp.tripId, 128) } : {}),
    ...(optionalStr(exp.tripNumber, 64) ? { tripNumber: optionalStr(exp.tripNumber, 64) } : {}),
    ...(optionalStr(exp.receiptNumber, 64)
      ? { receiptNumber: optionalStr(exp.receiptNumber, 64) }
      : {}),
    ...(optionalStr(exp.createdBy, 120) ? { createdBy: optionalStr(exp.createdBy, 120) } : {}),
  };

  return { id, data: withAuditFields('expenses', id, base, user) };
}

export function serializeGpsEvent(
  ev: GPSEvent,
  user: User
): { id: string; data: Record<string, unknown> } {
  const id = sanitizeDocId(ev.id, 'gps');
  const base: Record<string, unknown> = {
    tripId: truncStr(ev.tripId, 128, 'trip'),
    ...(optionalStr(ev.tripNumber, 64) ? { tripNumber: optionalStr(ev.tripNumber, 64) } : {}),
    timestamp: truncStr(ev.timestamp, 64, new Date().toISOString()),
    eventType: truncStr(ev.eventType, 32, 'MOVING'),
    lat: finiteNum(ev.lat, 15.4622),
    lng: finiteNum(ev.lng, 45.3264),
    ...(optionalNum(ev.speed) !== undefined ? { speed: optionalNum(ev.speed) } : {}),
    ...(optionalNum(ev.accuracy) !== undefined ? { accuracy: optionalNum(ev.accuracy) } : {}),
    ...(optionalStr(ev.customerId, 128) ? { customerId: optionalStr(ev.customerId, 128) } : {}),
    ...(optionalStr(ev.customerName, 150)
      ? { customerName: optionalStr(ev.customerName, 150) }
      : {}),
    ...(optionalStr(ev.source, 32) ? { source: optionalStr(ev.source, 32) } : {}),
    ...(optionalNum(ev.sequenceNumber) !== undefined
      ? { sequenceNumber: optionalNum(ev.sequenceNumber) }
      : {}),
    isProcessed: Boolean(ev.isProcessed),
  };

  return { id, data: withAuditFields('gpsEvents', id, base, user) };
}

export function serializeNotification(
  n: AppNotification,
  user: User
): { id: string; data: Record<string, unknown> } {
  const id = sanitizeDocId(n.id, 'notif');
  const targetRole = n.targetRole === 'driver' ? 'driver' : 'manager';
  const base: Record<string, unknown> = {
    createdAt: truncStr(n.createdAt, 64, new Date().toISOString()),
    targetRole,
    ...(optionalStr(n.actorRole, 20) ? { actorRole: optionalStr(n.actorRole, 20) } : {}),
    ...(optionalStr(n.actorName, 120) ? { actorName: optionalStr(n.actorName, 120) } : {}),
    ...(optionalStr(n.category, 48) ? { category: optionalStr(n.category, 48) } : {}),
    ...(optionalStr(n.priority, 32) ? { priority: optionalStr(n.priority, 32) } : {}),
    title: truncStr(n.title, 300, 'إشعار'),
    message: truncStr(n.message, 1000, ''),
    ...(optionalStr(n.tripId, 128) ? { tripId: optionalStr(n.tripId, 128) } : {}),
    ...(optionalStr(n.tripNumber, 64) ? { tripNumber: optionalStr(n.tripNumber, 64) } : {}),
    ...(optionalStr(n.orderId, 128) ? { orderId: optionalStr(n.orderId, 128) } : {}),
    ...(optionalStr(n.directiveId, 128) ? { directiveId: optionalStr(n.directiveId, 128) } : {}),
    isRead: Boolean(n.isRead),
    ...(optionalStr(n.actionTab, 40) ? { actionTab: optionalStr(n.actionTab, 40) } : {}),
  };

  return { id, data: withAuditFields('notifications', id, base, user) };
}

export function serializeDirective(
  d: ManagerDirective,
  user: User
): { id: string; data: Record<string, unknown> } {
  const id = sanitizeDocId(d.id, 'dir');
  const validStatuses = ['sent', 'acknowledged', 'completed'] as const;
  const status = validStatuses.includes(d.status) ? d.status : 'sent';
  const base: Record<string, unknown> = {
    createdAt: truncStr(d.createdAt, 64, new Date().toISOString()),
    createdBy: truncStr(d.createdBy, 120, 'المدير العام'),
    title: truncStr(d.title, 300, 'توجيه'),
    message: truncStr(d.message, 1500, ''),
    ...(optionalStr(d.priority, 20) ? { priority: optionalStr(d.priority, 20) } : {}),
    ...(optionalStr(d.tripId, 128) ? { tripId: optionalStr(d.tripId, 128) } : {}),
    ...(optionalStr(d.tripNumber, 64) ? { tripNumber: optionalStr(d.tripNumber, 64) } : {}),
    ...(optionalStr(d.customerId, 128) ? { customerId: optionalStr(d.customerId, 128) } : {}),
    ...(optionalStr(d.customerName, 150) ? { customerName: optionalStr(d.customerName, 150) } : {}),
    status,
    ...(optionalStr(d.acknowledgedAt, 64)
      ? { acknowledgedAt: optionalStr(d.acknowledgedAt, 64) }
      : {}),
    ...(optionalStr(d.completedAt, 64) ? { completedAt: optionalStr(d.completedAt, 64) } : {}),
    ...(optionalStr(d.driverReply, 1000) ? { driverReply: optionalStr(d.driverReply, 1000) } : {}),
  };

  return { id, data: withAuditFields('directives', id, base, user) };
}

// --- Query Helper matching firestore.rules allow list ---

function buildCollectionQuery(colName: CloudCollectionName, user: User): Query {
  const colRef = collection(db, colName);
  if (isUserBootstrappedAdmin(user)) {
    return colRef;
  }
  return query(colRef, where('ownerId', '==', user.uid));
}

function recordMetaFromDocs<T>(
  colName: CloudCollectionName,
  docs: Array<{ id: string; raw: Record<string, unknown> }>
): T[] {
  const result: T[] = [];
  for (const item of docs) {
    if (item.raw.ownerId && item.raw.serverCreatedAt) {
      knownDocMeta.set(metaKey(colName, item.id), {
        ownerId: String(item.raw.ownerId),
        serverCreatedAt: item.raw.serverCreatedAt,
      });
    }
    lastSyncedContentHash.set(metaKey(colName, item.id), stableHashWithoutTimestamps(item.raw));
    result.push(stripCloudMeta<T>(item.raw));
  }
  return result;
}

async function fetchCloudCollection<T>(
  colName: CloudCollectionName,
  user: User
): Promise<T[]> {
  try {
    const snap = await getDocs(buildCollectionQuery(colName, user));
    const rows = snap.docs.map((d) => ({
      id: d.id,
      raw: d.data() as Record<string, unknown>,
    }));
    return recordMetaFromDocs<T>(colName, rows);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, colName);
  }
}

export async function loadInitialCloudState(user: User): Promise<CloudAppState> {
  const [
    settingsList,
    trucksList,
    driverAccounts,
    customers,
    orders,
    trips,
    invoices,
    reconciliations,
    expenses,
    gpsEvents,
    notifications,
    directives,
  ] = await Promise.all([
    fetchCloudCollection<SystemSettings>('settings', user),
    fetchCloudCollection<Truck>('trucks', user),
    fetchCloudCollection<DriverAccount>('driverAccounts', user),
    fetchCloudCollection<Customer>('customers', user),
    fetchCloudCollection<Order>('orders', user),
    fetchCloudCollection<Trip>('trips', user),
    fetchCloudCollection<Invoice>('invoices', user),
    fetchCloudCollection<DriverReconciliation>('reconciliations', user),
    fetchCloudCollection<Expense>('expenses', user),
    fetchCloudCollection<GPSEvent>('gpsEvents', user),
    fetchCloudCollection<AppNotification>('notifications', user),
    fetchCloudCollection<ManagerDirective>('directives', user),
  ]);

  const hasAnyCloudDocs =
    settingsList.length > 0 ||
    trucksList.length > 0 ||
    driverAccounts.length > 0 ||
    customers.length > 0 ||
    orders.length > 0 ||
    trips.length > 0 ||
    invoices.length > 0 ||
    reconciliations.length > 0 ||
    expenses.length > 0 ||
    gpsEvents.length > 0 ||
    notifications.length > 0 ||
    directives.length > 0;

  return {
    settings: settingsList[0] || null,
    truck: trucksList[0] || null,
    driverAccounts,
    customers,
    orders,
    trips,
    invoices,
    reconciliations,
    expenses,
    gpsEvents: gpsEvents.slice(-100),
    notifications: notifications.slice(0, 250),
    directives,
    hasAnyCloudDocs,
  };
}

// --- Batch Upsert & Delete Helpers ---

export interface CloudWriteItem {
  col: CloudCollectionName;
  id: string;
  data: Record<string, unknown>;
}

async function ensureKnownDocMetaForItems(items: CloudWriteItem[]): Promise<Set<string>> {
  const uncached = items.filter((item) => !knownDocMeta.has(metaKey(item.col, item.id)));
  const newlyCreatedKeys = new Set<string>();
  if (uncached.length === 0) return newlyCreatedKeys;

  const fallbackUid = auth.currentUser?.uid;
  await Promise.all(
    uncached.map(async (item) => {
      const key = metaKey(item.col, item.id);
      try {
        const snap = await getDoc(doc(db, item.col, item.id));
        if (snap.exists()) {
          const existing = snap.data() as Record<string, unknown>;
          const existingOwnerId =
            typeof existing.ownerId === 'string' && existing.ownerId.length > 0
              ? existing.ownerId
              : typeof item.data.ownerId === 'string' && item.data.ownerId.length > 0
                ? item.data.ownerId
                : fallbackUid;
          const existingCreatedAt = existing.serverCreatedAt;
          if (existingOwnerId && existingCreatedAt !== undefined) {
            knownDocMeta.set(key, {
              ownerId: existingOwnerId,
              serverCreatedAt: existingCreatedAt,
            });
          }
          if (existingOwnerId) {
            item.data = { ...item.data, ownerId: existingOwnerId };
          }
          if (existingCreatedAt !== undefined) {
            item.data = { ...item.data, serverCreatedAt: existingCreatedAt };
          }
        } else {
          newlyCreatedKeys.add(key);
        }
      } catch {
        // Non-fatal: e.g. doc does not exist or rules restrict reading non-owned doc ID
      }
    })
  );

  return newlyCreatedKeys;
}

async function refreshCreatedDocMeta(items: CloudWriteItem[], createdKeys: Set<string>): Promise<void> {
  if (createdKeys.size === 0) return;
  const targets = items.filter((item) => createdKeys.has(metaKey(item.col, item.id))).slice(0, 30);
  if (targets.length === 0) return;
  await Promise.all(
    targets.map(async (item) => {
      try {
        const snap = await getDoc(doc(db, item.col, item.id));
        if (snap.exists()) {
          const raw = snap.data() as Record<string, unknown>;
          if (raw.ownerId && raw.serverCreatedAt) {
            knownDocMeta.set(metaKey(item.col, item.id), {
              ownerId: String(raw.ownerId),
              serverCreatedAt: raw.serverCreatedAt,
            });
          }
        }
      } catch {
        // Ignore; onSnapshot will populate asynchronously
      }
    })
  );
}

export async function commitCloudBatch(items: CloudWriteItem[]): Promise<void> {
  if (items.length === 0) return;
  const createdKeys = await ensureKnownDocMetaForItems(items);
  const CHUNK_SIZE = 400;
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const item of chunk) {
      batch.set(doc(db, item.col, item.id), item.data);
    }
    try {
      await batch.commit();
      for (const item of chunk) {
        lastSyncedContentHash.set(
          metaKey(item.col, item.id),
          stableHashWithoutTimestamps(item.data)
        );
      }
      await refreshCreatedDocMeta(chunk, createdKeys);
    } catch (err) {
      const first = chunk[0];
      console.error(
        '[Miyahna Cloud] Batch write failed for docs:',
        chunk.map((c) => `${c.col}/${c.id}`).join(', ')
      );
      handleFirestoreError(err, OperationType.WRITE, first ? `${first.col}/${first.id}` : 'batch');
    }
  }
}

export async function upsertSingleCloudDoc(item: CloudWriteItem): Promise<void> {
  try {
    const createdKeys = await ensureKnownDocMetaForItems([item]);
    await setDoc(doc(db, item.col, item.id), item.data);
    lastSyncedContentHash.set(metaKey(item.col, item.id), stableHashWithoutTimestamps(item.data));
    await refreshCreatedDocMeta([item], createdKeys);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `${item.col}/${item.id}`);
  }
}

export async function deleteSingleCloudDoc(
  col: CloudCollectionName,
  rawId: string
): Promise<void> {
  const id = sanitizeDocId(rawId);
  const path = `${col}/${id}`;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, col, id));
    await batch.commit();
    knownDocMeta.delete(metaKey(col, id));
    lastSyncedContentHash.delete(metaKey(col, id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function syncCollectionsDiffToCloud(
  snapshot: FullLocalStateSnapshot,
  collections: CloudCollectionName[],
  user: User
): Promise<number> {
  const colSet = new Set<CloudCollectionName>(collections);
  const candidateItems: CloudWriteItem[] = [];

  if (colSet.has('settings')) {
    const ser = serializeSettings(snapshot.settings, user);
    candidateItems.push({ col: 'settings', id: ser.id, data: ser.data });
  }
  if (colSet.has('trucks')) {
    const ser = serializeTruck(snapshot.truck, user);
    candidateItems.push({ col: 'trucks', id: ser.id, data: ser.data });
  }
  if (colSet.has('driverAccounts')) {
    for (const d of snapshot.driverAccounts) {
      if (!isUserBootstrappedAdmin(user) && d.status !== 'pending' && !knownDocMeta.has(metaKey('driverAccounts', sanitizeDocId(d.id, 'drv')))) {
        continue;
      }
      const ser = serializeDriverAccount(d, user);
      candidateItems.push({ col: 'driverAccounts', id: ser.id, data: ser.data });
    }
  }
  if (colSet.has('customers')) {
    for (const c of snapshot.customers) {
      const ser = serializeCustomer(c, user);
      candidateItems.push({ col: 'customers', id: ser.id, data: ser.data });
    }
  }
  if (colSet.has('orders')) {
    for (const o of snapshot.orders) {
      const ser = serializeOrder(o, user);
      candidateItems.push({ col: 'orders', id: ser.id, data: ser.data });
    }
  }
  if (colSet.has('trips')) {
    for (const t of snapshot.trips) {
      const ser = serializeTrip(t, user);
      candidateItems.push({ col: 'trips', id: ser.id, data: ser.data });
    }
  }
  if (colSet.has('invoices')) {
    for (const inv of snapshot.invoices) {
      const ser = serializeInvoice(inv, user);
      candidateItems.push({ col: 'invoices', id: ser.id, data: ser.data });
    }
  }
  if (colSet.has('reconciliations')) {
    for (const rec of snapshot.reconciliations) {
      const ser = serializeReconciliation(rec, user);
      candidateItems.push({ col: 'reconciliations', id: ser.id, data: ser.data });
    }
  }
  if (colSet.has('expenses')) {
    for (const exp of snapshot.expenses) {
      const ser = serializeExpense(exp, user);
      candidateItems.push({ col: 'expenses', id: ser.id, data: ser.data });
    }
  }
  if (colSet.has('gpsEvents')) {
    for (const ev of snapshot.gpsEvents.slice(-100)) {
      const ser = serializeGpsEvent(ev, user);
      candidateItems.push({ col: 'gpsEvents', id: ser.id, data: ser.data });
    }
  }
  if (colSet.has('notifications')) {
    for (const n of snapshot.notifications.slice(0, 100)) {
      const ser = serializeNotification(n, user);
      candidateItems.push({ col: 'notifications', id: ser.id, data: ser.data });
    }
  }
  if (colSet.has('directives')) {
    for (const dir of snapshot.directives) {
      const ser = serializeDirective(dir, user);
      candidateItems.push({ col: 'directives', id: ser.id, data: ser.data });
    }
  }

  const changedItems = candidateItems.filter((item) => {
    const hash = stableHashWithoutTimestamps(item.data);
    return lastSyncedContentHash.get(metaKey(item.col, item.id)) !== hash;
  });

  if (changedItems.length === 0) return 0;
  await commitCloudBatch(changedItems);
  return changedItems.length;
}

export async function pushFullSnapshotToCloud(
  snapshot: FullLocalStateSnapshot,
  user: User
): Promise<void> {
  const items: CloudWriteItem[] = [];

  const settingsSer = serializeSettings(snapshot.settings, user);
  items.push({ col: 'settings', id: settingsSer.id, data: settingsSer.data });

  const truckSer = serializeTruck(snapshot.truck, user);
  items.push({ col: 'trucks', id: truckSer.id, data: truckSer.data });

  for (const d of snapshot.driverAccounts) {
    if (!isUserBootstrappedAdmin(user) && d.status !== 'pending' && !knownDocMeta.has(metaKey('driverAccounts', sanitizeDocId(d.id, 'drv')))) {
      continue;
    }
    const ser = serializeDriverAccount(d, user);
    items.push({ col: 'driverAccounts', id: ser.id, data: ser.data });
  }
  for (const c of snapshot.customers) {
    const ser = serializeCustomer(c, user);
    items.push({ col: 'customers', id: ser.id, data: ser.data });
  }
  for (const o of snapshot.orders) {
    const ser = serializeOrder(o, user);
    items.push({ col: 'orders', id: ser.id, data: ser.data });
  }
  for (const t of snapshot.trips) {
    const ser = serializeTrip(t, user);
    items.push({ col: 'trips', id: ser.id, data: ser.data });
  }
  for (const inv of snapshot.invoices) {
    const ser = serializeInvoice(inv, user);
    items.push({ col: 'invoices', id: ser.id, data: ser.data });
  }
  for (const rec of snapshot.reconciliations) {
    const ser = serializeReconciliation(rec, user);
    items.push({ col: 'reconciliations', id: ser.id, data: ser.data });
  }
  for (const exp of snapshot.expenses) {
    const ser = serializeExpense(exp, user);
    items.push({ col: 'expenses', id: ser.id, data: ser.data });
  }
  for (const ev of snapshot.gpsEvents.slice(-100)) {
    const ser = serializeGpsEvent(ev, user);
    items.push({ col: 'gpsEvents', id: ser.id, data: ser.data });
  }
  for (const n of snapshot.notifications.slice(0, 250)) {
    const ser = serializeNotification(n, user);
    items.push({ col: 'notifications', id: ser.id, data: ser.data });
  }
  for (const dir of snapshot.directives) {
    const ser = serializeDirective(dir, user);
    items.push({ col: 'directives', id: ser.id, data: ser.data });
  }

  await commitCloudBatch(items);
}

export async function clearOperationalCollectionsInCloud(
  user: User,
  nextSettings: SystemSettings,
  nextTruck: Truck,
  preservedDrivers: DriverAccount[]
): Promise<void> {
  const operationalCols: CloudCollectionName[] = [
    'customers',
    'orders',
    'trips',
    'invoices',
    'reconciliations',
    'expenses',
    'gpsEvents',
    'notifications',
    'directives',
  ];

  const docRefsToDelete: Array<{ col: CloudCollectionName; id: string }> = [];

  for (const colName of operationalCols) {
    try {
      const snap = await getDocs(buildCollectionQuery(colName, user));
      for (const d of snap.docs) {
        docRefsToDelete.push({ col: colName, id: d.id });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, colName);
    }
  }

  // Also remove any demo driver accounts from Firestore if present
  try {
    const drvSnap = await getDocs(buildCollectionQuery('driverAccounts', user));
    const keepIds = new Set(preservedDrivers.map((d) => sanitizeDocId(d.id, 'drv')));
    for (const d of drvSnap.docs) {
      if (!keepIds.has(d.id)) {
        docRefsToDelete.push({ col: 'driverAccounts', id: d.id });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'driverAccounts');
  }

  const CHUNK_SIZE = 400;
  for (let i = 0; i < docRefsToDelete.length; i += CHUNK_SIZE) {
    const chunk = docRefsToDelete.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const ref of chunk) {
      batch.delete(doc(db, ref.col, ref.id));
      knownDocMeta.delete(metaKey(ref.col, ref.id));
    }
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, chunk[0]?.col || 'clear-operational');
    }
  }

  const settingsSer = serializeSettings(nextSettings, user);
  const truckSer = serializeTruck(nextTruck, user);
  await commitCloudBatch([
    { col: 'settings', id: settingsSer.id, data: settingsSer.data },
    { col: 'trucks', id: truckSer.id, data: truckSer.data },
  ]);
}

// --- Real-Time Authenticated Cloud Listeners ---

export interface CloudListenersCallbacks {
  onSettings: (settings: SystemSettings) => void;
  onTruck: (truck: Truck) => void;
  onDriverAccounts: (accounts: DriverAccount[]) => void;
  onCustomers: (customers: Customer[]) => void;
  onOrders: (orders: Order[]) => void;
  onTrips: (trips: Trip[]) => void;
  onInvoices: (invoices: Invoice[]) => void;
  onReconciliations: (reconciliations: DriverReconciliation[]) => void;
  onExpenses: (expenses: Expense[]) => void;
  onGpsEvents: (gpsEvents: GPSEvent[]) => void;
  onNotifications: (notifications: AppNotification[]) => void;
  onDirectives: (directives: ManagerDirective[]) => void;
  onError?: (err: Error) => void;
}

export function subscribeToCloudState(
  user: User,
  callbacks: CloudListenersCallbacks
): Unsubscribe {
  const unsubscribers: Unsubscribe[] = [];

  const attachList = <T,>(
    colName: CloudCollectionName,
    handler: (items: T[]) => void
  ) => {
    const q = buildCollectionQuery(colName, user);
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({
          id: d.id,
          raw: d.data() as Record<string, unknown>,
        }));
        const items = recordMetaFromDocs<T>(colName, rows);
        handler(items);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, colName);
        } catch (wrapped) {
          callbacks.onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    );
    unsubscribers.push(unsub);
  };

  attachList<SystemSettings>('settings', (list) => {
    if (list.length > 0) callbacks.onSettings(list[0]);
  });
  attachList<Truck>('trucks', (list) => {
    if (list.length > 0) callbacks.onTruck(list[0]);
  });
  attachList<DriverAccount>('driverAccounts', callbacks.onDriverAccounts);
  attachList<Customer>('customers', callbacks.onCustomers);
  attachList<Order>('orders', callbacks.onOrders);
  attachList<Trip>('trips', callbacks.onTrips);
  attachList<Invoice>('invoices', callbacks.onInvoices);
  attachList<DriverReconciliation>('reconciliations', callbacks.onReconciliations);
  attachList<Expense>('expenses', callbacks.onExpenses);
  attachList<GPSEvent>('gpsEvents', (items) => callbacks.onGpsEvents(items.slice(-100)));
  attachList<AppNotification>('notifications', (items) => {
    const sorted = [...items].sort((a, b) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    );
    callbacks.onNotifications(sorted.slice(0, 250));
  });
  attachList<ManagerDirective>('directives', (items) => {
    const sorted = [...items].sort((a, b) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    );
    callbacks.onDirectives(sorted);
  });

  return () => {
    for (const unsub of unsubscribers) {
      unsub();
    }
  };
}
