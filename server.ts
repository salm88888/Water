/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Express Full-Stack Server & API
 * Offline-First GPS Tracking, Trip Approval Workflow, Stop Detection, & Idempotent Sync Engine.
 * Note: All SMS systems have been permanently removed per specification.
 */

import express, { Request, Response } from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { AuthRequest, requireAuth } from './src/middleware/auth.ts';
import { getOrCreateUser } from './src/db/users.ts';
import {
  deleteCustomerSql,
  getCustomersSql,
  getDistrictsSql,
  getOrdersSql,
  getTripsSql,
  loadFullStateFromSql,
  syncFullStateToSql,
  upsertCustomerSql,
  upsertDistrictSql,
  upsertOrderSql,
} from './src/db/repository.ts';
import {
  DEFAULT_SETTINGS,
  INITIAL_CUSTOMERS,
  INITIAL_DRIVER_ACCOUNTS,
  INITIAL_EXPENSES,
  INITIAL_GPS_EVENTS,
  INITIAL_INVOICES,
  INITIAL_ORDERS,
  INITIAL_RECONCILIATION,
  INITIAL_TRIPS,
  INITIAL_TRUCK,
} from './src/lib/marib-data.ts';
import { generateSmartClusters } from './src/lib/clustering.ts';
import {
  analyzeGpsTrack,
  evaluatePlantDepartureTrigger,
  evaluateTripCompletionReadiness,
  haversineDistanceMeters,
} from './src/lib/gps-tracker.ts';
import { AL_WADI_DISTRICT_NAMES, DEFAULT_AL_WADI_DISTRICT } from './src/lib/alwadi-districts.ts';
import {
  AppNotification,
  Customer,
  DriverAccount,
  DriverReconciliation,
  Expense,
  GPSEvent,
  Invoice,
  ManagerDirective,
  ModificationRequest,
  Order,
  RealtimePresence,
  SystemSettings,
  Trip,
  TripAuditEntry,
  TripCustomerStop,
  TripGPSPoint,
  TripStatus,
  Truck,
} from './src/types/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

interface DatabaseSchema {
  customers: Customer[];
  orders: Order[];
  trips: Trip[];
  invoices: Invoice[];
  reconciliations: DriverReconciliation[];
  expenses: Expense[];
  gpsEvents: GPSEvent[];
  notifications: AppNotification[];
  directives: ManagerDirective[];
  driverAccounts: DriverAccount[];
  truck: Truck;
  settings: SystemSettings;
}

function getInitialDatabase(): DatabaseSchema {
  return {
    customers: JSON.parse(JSON.stringify(INITIAL_CUSTOMERS)),
    orders: JSON.parse(JSON.stringify(INITIAL_ORDERS)),
    trips: JSON.parse(JSON.stringify(INITIAL_TRIPS)),
    invoices: JSON.parse(JSON.stringify(INITIAL_INVOICES)),
    reconciliations: JSON.parse(JSON.stringify(INITIAL_RECONCILIATION)),
    expenses: JSON.parse(JSON.stringify(INITIAL_EXPENSES)),
    gpsEvents: JSON.parse(JSON.stringify(INITIAL_GPS_EVENTS)),
    notifications: [],
    directives: [],
    driverAccounts: JSON.parse(JSON.stringify(INITIAL_DRIVER_ACCOUNTS)),
    truck: JSON.parse(JSON.stringify(INITIAL_TRUCK)),
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
  };
}

function mapLegacyTripStatus(rawStatus: string): TripStatus {
  switch (rawStatus) {
    case 'draft':
    case 'pending_approval':
    case 'rejected':
    case 'approved':
    case 'in_progress':
    case 'returned_to_plant':
    case 'pending_sync':
    case 'synced':
    case 'completed_pending_review':
    case 'closed':
      return rawStatus;
    case 'proposed':
      return 'pending_approval';
    case 'loading':
      return 'approved';
    case 'started':
      return 'in_progress';
    case 'returning':
      return 'returned_to_plant';
    case 'completed':
      return 'completed_pending_review';
    case 'reconciled':
      return 'closed';
    case 'cancelled':
      return 'rejected';
    default:
      return 'draft';
  }
}

/**
 * Non-destructive idempotent database migration.
 * Preserves existing customers, orders, invoices, expenses, reconciliations, plantLocation & managerPin
 * while removing legacy SMS structures and upgrading trip/settings schemas.
 */
function migrateDatabase(raw: any): { migrated: DatabaseSchema; changed: boolean } {
  let changed = false;
  if (!raw || typeof raw !== 'object') {
    return { migrated: getInitialDatabase(), changed: true };
  }

  // Strip smsLogs completely
  if ('smsLogs' in raw) {
    changed = true;
  }

  // Migrate Settings (remove SMS fields, add new GPS/stop defaults)
  const rawSettings = raw.settings || {};
  const cleanSettings: SystemSettings = {
    waterProductionCostPerLiter:
      Number(rawSettings.waterProductionCostPerLiter) || DEFAULT_SETTINGS.waterProductionCostPerLiter,
    defaultSellingPricePerLiter:
      Number(rawSettings.defaultSellingPricePerLiter) || DEFAULT_SETTINGS.defaultSellingPricePerLiter,
    dieselPricePerLiter: Number(rawSettings.dieselPricePerLiter) || DEFAULT_SETTINGS.dieselPricePerLiter,
    truckDieselConsumptionPerKm:
      Number(rawSettings.truckDieselConsumptionPerKm) || DEFAULT_SETTINGS.truckDieselConsumptionPerKm,
    maintenanceAllowancePerTrip:
      Number(rawSettings.maintenanceAllowancePerTrip) || DEFAULT_SETTINGS.maintenanceAllowancePerTrip,
    driverWagePerTrip: Number(rawSettings.driverWagePerTrip) || DEFAULT_SETTINGS.driverWagePerTrip,
    stopDetectionMinutes: Number(rawSettings.stopDetectionMinutes) || DEFAULT_SETTINGS.stopDetectionMinutes,
    minMovementSpeedKmH: Number(rawSettings.minMovementSpeedKmH) || DEFAULT_SETTINGS.minMovementSpeedKmH,
    stopRadiusMeters: Number(rawSettings.stopRadiusMeters) || DEFAULT_SETTINGS.stopRadiusMeters,
    plantGeofenceMeters: Number(rawSettings.plantGeofenceMeters) || DEFAULT_SETTINGS.plantGeofenceMeters,
    gpsSampleIntervalSeconds:
      Number(rawSettings.gpsSampleIntervalSeconds) || DEFAULT_SETTINGS.gpsSampleIntervalSeconds,
    gpsWeakAccuracyMeters:
      Number(rawSettings.gpsWeakAccuracyMeters) || DEFAULT_SETTINGS.gpsWeakAccuracyMeters,
    gpsGapSeconds: Number(rawSettings.gpsGapSeconds) || DEFAULT_SETTINGS.gpsGapSeconds,
    plantLocation: rawSettings.plantLocation || DEFAULT_SETTINGS.plantLocation,
    customDistricts: Array.isArray(rawSettings.customDistricts)
      ? rawSettings.customDistricts.filter((d: any) => typeof d === 'string' && d.trim().length > 0)
      : [],
    demoDataActive: false,
    demoDataClearedAt: rawSettings.demoDataClearedAt || undefined,
    demoResetVersion: Number(rawSettings.demoResetVersion) || 1,
    managerPin: rawSettings.managerPin || DEFAULT_SETTINGS.managerPin,
  };

  if (
    'sabafonCenterNumber' in rawSettings ||
    'driverSabafonNumber' in rawSettings ||
    'periodicHeartbeatMinutes' in rawSettings ||
    rawSettings.stopRadiusMeters === undefined
  ) {
    changed = true;
  }

  // Migrate Customers (preserve existing)
  const customers: Customer[] = Array.isArray(raw.customers) ? raw.customers : [];

  // Migrate Orders (map source 'sms' -> 'phone', preserve all)
  const orders: Order[] = (Array.isArray(raw.orders) ? raw.orders : []).map((o: any) => {
    if (o.source === 'sms') {
      changed = true;
      return { ...o, source: 'phone' };
    }
    return o;
  });

  // Migrate GPS Events
  const gpsEvents: GPSEvent[] = (Array.isArray(raw.gpsEvents) ? raw.gpsEvents : []).map((g: any) => {
    if (g.rawSmsText !== undefined || g.source === 'sms' || g.source === 'manual_gateway' || g.eventType === 'HEARTBEAT_10M') {
      changed = true;
      const { rawSmsText: _dropped, ...rest } = g;
      return {
        ...rest,
        eventType: g.eventType === 'HEARTBEAT_10M' ? 'MOVING' : g.eventType,
        source: g.source === 'app_local' ? 'app_local' : 'gps_auto',
      };
    }
    return g;
  });

  // Migrate Trips
  const trips: Trip[] = (Array.isArray(raw.trips) ? raw.trips : []).map((t: any) => {
    const mappedStatus = mapLegacyTripStatus(t.status);
    if (mappedStatus !== t.status || !t.syncStatus || !t.auditLogs) {
      changed = true;
    }
    const gpsPoints: TripGPSPoint[] = Array.isArray(t.gpsPoints) ? t.gpsPoints : [];
    const analysis = gpsPoints.length > 0
      ? analyzeGpsTrack({
          tripId: t.id,
          rawPoints: gpsPoints,
          approvedStops: Array.isArray(t.customerStops) ? t.customerStops : [],
          settings: cleanSettings,
        })
      : null;

    return {
      ...t,
      status: mappedStatus,
      syncStatus: t.syncStatus || 'synced',
      createdByRole: t.createdByRole || 'manager',
      gpsPoints: analysis ? analysis.points : gpsPoints,
      detectedStops: Array.isArray(t.detectedStops) && t.detectedStops.length > 0
        ? t.detectedStops
        : analysis?.detectedStops || [],
      gpsGaps: Array.isArray(t.gpsGaps) ? t.gpsGaps : analysis?.gpsGaps || [],
      auditLogs: Array.isArray(t.auditLogs)
        ? t.auditLogs
        : [
            {
              id: `aud-mig-${t.id}`,
              timestamp: t.proposedAt || new Date().toISOString(),
              actorRole: 'system',
              actorName: 'النظام',
              action: 'ترحيل سجل الرحلة للنظام الجديد',
              details: `الحالة: ${mappedStatus}`,
            },
          ],
      modificationRequests: Array.isArray(t.modificationRequests) ? t.modificationRequests : [],
    };
  });

  // Migrate Truck & Driver Accounts
  const rawTruck = raw.truck || INITIAL_TRUCK;
  const truck: Truck = {
    ...INITIAL_TRUCK,
    ...rawTruck,
    lastEvent: rawTruck.lastEvent === 'HEARTBEAT_10M' ? 'MOVING' : rawTruck.lastEvent || 'RETURN_PLANT',
  };

  let driverAccounts: DriverAccount[] = Array.isArray(raw.driverAccounts)
    ? raw.driverAccounts.filter((d: DriverAccount) => !d.isDemo)
    : [];

  return {
    migrated: {
      customers,
      orders,
      trips,
      invoices: Array.isArray(raw.invoices) ? raw.invoices : [],
      reconciliations: Array.isArray(raw.reconciliations) ? raw.reconciliations : [],
      expenses: Array.isArray(raw.expenses) ? raw.expenses : [],
      gpsEvents,
      notifications: Array.isArray(raw.notifications) ? raw.notifications : [],
      directives: Array.isArray(raw.directives) ? raw.directives : [],
      driverAccounts,
      truck,
      settings: cleanSettings,
    },
    changed,
  };
}

let db: DatabaseSchema = getInitialDatabase();

function saveDatabase(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Miyahna DB] Error saving DB to disk:', err);
  }
}

function loadDatabase(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      const { migrated, changed } = migrateDatabase(parsed);
      db = migrated;
      if (changed) {
        saveDatabase();
        console.log('[Miyahna DB] Non-destructive migration applied and saved safely.');
      } else {
        console.log('[Miyahna DB] Loaded persistent database from disk.');
      }
    } else {
      saveDatabase();
      console.log('[Miyahna DB] Initialized fresh database with Marib demo data.');
    }
  } catch (err) {
    console.error('[Miyahna DB] Error reading DB, using memory fallback:', err);
    db = getInitialDatabase();
  }
}

loadDatabase();

function appendAudit(
  trip: Trip,
  actorRole: 'driver' | 'manager' | 'system',
  actorName: string,
  action: string,
  details?: string
) {
  if (!trip.auditLogs) trip.auditLogs = [];
  const entry: TripAuditEntry = {
    id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    actorRole,
    actorName,
    action,
    details,
  };
  trip.auditLogs.push(entry);
}

function recomputeTripFinancials(trip: Trip): void {
  const stops = trip.customerStops || [];
  const totalRequested = stops.reduce((s, st) => s + (Number(st.requestedLiters) || 0), 0);
  const totalDelivered = stops.reduce((s, st) => s + (Number(st.deliveredLiters) || 0), 0);
  const expectedRev = stops.reduce((s, st) => s + (Number(st.totalAmount) || 0), 0);

  trip.initialLoadLiters = totalRequested;
  trip.deliveredLiters = totalDelivered;
  trip.remainingLiters = Math.max(0, totalRequested - totalDelivered);
  trip.capacityUtilizationPercent = Number(
    ((totalRequested / (db.truck.maxCapacityLiters || 6000)) * 100).toFixed(1)
  );
  trip.productionCost = Math.round(totalRequested * db.settings.waterProductionCostPerLiter);
  trip.fuelCost = Math.round((trip.estimatedFuelLiters || 5) * db.settings.dieselPricePerLiter);
  trip.totalCost = trip.fuelCost + trip.productionCost + trip.driverWageShare + trip.maintenanceShare;
  trip.expectedRevenue = expectedRev;
  trip.expectedProfit = expectedRev - trip.totalCost;
  trip.profitMarginPercent = expectedRev > 0
    ? Number(((trip.expectedProfit / expectedRev) * 100).toFixed(1))
    : 0;
}

/**
 * Merges incoming GPS points into trip safely & idempotently.
 * Rejects tampered points (existing ID with altered coordinates/timestamp).
 */
function mergeGpsPointsIdempotent(
  trip: Trip,
  incomingPoints: TripGPSPoint[]
): { acceptedIds: string[]; rejectedTamperIds: string[] } {
  const existing = trip.gpsPoints || [];
  const existingMap = new Map(existing.map((p) => [p.id, p]));
  const acceptedIds: string[] = [];
  const rejectedTamperIds: string[] = [];
  const newlyAdded: TripGPSPoint[] = [];

  for (const pt of incomingPoints) {
    if (!pt || !pt.id || typeof pt.lat !== 'number' || typeof pt.lng !== 'number') continue;
    const prev = existingMap.get(pt.id);
    if (prev) {
      const sameCoords =
        Math.abs(prev.lat - pt.lat) < 0.00001 &&
        Math.abs(prev.lng - pt.lng) < 0.00001 &&
        prev.timestamp === pt.timestamp;
      if (sameCoords) {
        acceptedIds.push(pt.id); // Already recorded cleanly -> idempotent OK
      } else {
        rejectedTamperIds.push(pt.id); // Attempt to alter immutable history!
      }
    } else {
      newlyAdded.push({ ...pt, tripId: trip.id });
      existingMap.set(pt.id, pt);
      acceptedIds.push(pt.id);
    }
  }

  if (newlyAdded.length > 0) {
    const merged = [...existing, ...newlyAdded];
    const analysis = analyzeGpsTrack({
      tripId: trip.id,
      rawPoints: merged,
      approvedStops: trip.customerStops || [],
      settings: db.settings,
    });
    trip.gpsPoints = analysis.points;
    trip.detectedStops = analysis.detectedStops;
    trip.gpsGaps = analysis.gpsGaps;
    trip.actualDistanceKm = analysis.totalDistanceKm;
    trip.movingMinutes = analysis.movingMinutes;
    trip.stoppedMinutes = analysis.stoppedMinutes;

    const latest = analysis.points[analysis.points.length - 1];
    if (latest && trip.status === 'in_progress') {
      db.truck.lastLat = latest.lat;
      db.truck.lastLng = latest.lng;
      db.truck.lastSpeed = latest.speedKmH || 0;
      db.truck.lastUpdateTimestamp = latest.timestamp;
      db.truck.lastEvent = latest.speedKmH >= db.settings.minMovementSpeedKmH ? 'MOVING' : 'STOPPED';
    }
  }

  return { acceptedIds, rejectedTamperIds };
}

export async function createAppServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Real-Time WebSocket Hub (Two-Way Manager <-> Driver Live Sync & Notifications)
  const wsClients = new Map<WebSocket, { role: 'manager' | 'driver'; name: string; connectedAt: string }>();
  let driverLastSeenAt: string | undefined;
  let managerLastSeenAt: string | undefined;

  const getPresenceSnapshot = (): RealtimePresence => {
    let managerCount = 0;
    let driverCount = 0;
    for (const [sock, info] of wsClients.entries()) {
      if (sock.readyState === WebSocket.OPEN) {
        if (info.role === 'manager') managerCount += 1;
        if (info.role === 'driver') driverCount += 1;
      }
    }
    return {
      managerConnected: managerCount > 0,
      managerCount,
      driverConnected: driverCount > 0,
      driverCount,
      driverLastSeenAt,
      managerLastSeenAt,
    };
  };

  const broadcastWs = (payload: Record<string, any>) => {
    const serialized = JSON.stringify({
      ...payload,
      presence: getPresenceSnapshot(),
      serverTimestamp: new Date().toISOString(),
    });
    for (const [sock] of wsClients.entries()) {
      if (sock.readyState === WebSocket.OPEN) {
        try {
          sock.send(serialized);
        } catch {
          // ignore closed socket race
        }
      }
    }
  };

  const pushNotification = (
    input: Omit<AppNotification, 'id' | 'createdAt' | 'isRead'> & { id?: string }
  ): AppNotification => {
    const notifId = input.id || `notif-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const existing = db.notifications.find((n) => n.id === notifId);
    if (existing) return existing;

    const notif: AppNotification = {
      ...input,
      id: notifId,
      createdAt: new Date().toISOString(),
      isRead: false,
    };
    db.notifications.unshift(notif);
    if (db.notifications.length > 250) {
      db.notifications = db.notifications.slice(0, 250);
    }
    return notif;
  };

  const notifyAndBroadcast = (
    reason: string,
    notificationInput?: Omit<AppNotification, 'id' | 'createdAt' | 'isRead'> & { id?: string }
  ) => {
    let createdNotif: AppNotification | undefined;
    if (notificationInput) {
      createdNotif = pushNotification(notificationInput);
    }
    broadcastWs({
      type: 'state:updated',
      reason,
      notification: createdNotif,
    });
  };

  const wssRealtime = new WebSocketServer({ noServer: true });
  wssRealtime.on('connection', (socket, request) => {
    let role: 'manager' | 'driver' = 'manager';
    try {
      const parsed = new URL(`http://localhost${request.url || ''}`);
      const qRole = parsed.searchParams.get('role');
      if (qRole === 'driver' || qRole === 'manager') {
        role = qRole;
      }
    } catch {
      // default manager
    }
    const name = role === 'driver' ? db.truck.driverName : 'المدير العام';
    const nowIso = new Date().toISOString();
    if (role === 'driver') driverLastSeenAt = nowIso;
    else managerLastSeenAt = nowIso;

    wsClients.set(socket, { role, name, connectedAt: nowIso });

    // Send initial presence & unread counts to connecting client
    socket.send(
      JSON.stringify({
        type: 'realtime:hello',
        role,
        presence: getPresenceSnapshot(),
        serverTimestamp: nowIso,
      })
    );
    broadcastWs({ type: 'presence:update', reason: `${role}:connected` });

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg?.type === 'presence:ping' || msg?.type === 'presence:hello') {
          const prev = wsClients.get(socket);
          const nextRole = msg.role === 'driver' || msg.role === 'manager' ? msg.role : prev?.role || role;
          const ts = new Date().toISOString();
          if (nextRole === 'driver') driverLastSeenAt = ts;
          else managerLastSeenAt = ts;
          wsClients.set(socket, {
            role: nextRole,
            name: msg.name || prev?.name || name,
            connectedAt: prev?.connectedAt || ts,
          });
          if (msg?.type === 'presence:hello') {
            broadcastWs({ type: 'presence:update', reason: `${nextRole}:switched` });
          }
        }
      } catch {
        // ignore malformed message
      }
    });

    socket.on('close', () => {
      const info = wsClients.get(socket);
      const ts = new Date().toISOString();
      if (info?.role === 'driver') driverLastSeenAt = ts;
      else if (info?.role === 'manager') managerLastSeenAt = ts;
      wsClients.delete(socket);
      broadcastWs({ type: 'presence:update', reason: `${info?.role || role}:disconnected` });
    });
  });

  app.locals.attachRealtimeWebSocket = (httpServer: http.Server) => {
    httpServer.on('upgrade', (request, socket, head) => {
      try {
        const parsed = new URL(`http://localhost${request.url || ''}`);
        if (parsed.pathname === '/ws/realtime') {
          wssRealtime.handleUpgrade(request, socket, head, (ws) => {
            wssRealtime.emit('connection', ws, request);
          });
        }
      } catch {
        // ignore invalid URL
      }
    });
  };

  const router = express.Router();

  // Short-TTL idempotency & double-click deduplication cache (prevents duplicate execution from rapid double clicks)
  const processedClientRequests = new Map<string, { timestamp: number; response: any }>();
  const getIdempotentResponse = (reqId?: unknown) => {
    if (typeof reqId !== 'string' || !reqId.trim()) return null;
    const key = reqId.trim();
    const cached = processedClientRequests.get(key);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > 5 * 60 * 1000) {
      processedClientRequests.delete(key);
      return null;
    }
    return { ...cached.response, deduplicated: true };
  };
  const saveIdempotentResponse = (reqId: unknown, response: any) => {
    if (typeof reqId !== 'string' || !reqId.trim()) return;
    if (processedClientRequests.size > 500) {
      const cutoff = Date.now() - 5 * 60 * 1000;
      for (const [k, v] of processedClientRequests.entries()) {
        if (v.timestamp < cutoff) processedClientRequests.delete(k);
      }
    }
    processedClientRequests.set(reqId.trim(), { timestamp: Date.now(), response });
  };

  const registerCustomDistrict = (rawName?: unknown): string => {
    const clean = typeof rawName === 'string' ? rawName.trim() : '';
    if (!clean || clean === '__other__' || clean === 'أخرى') return '';
    if (!Array.isArray(db.settings.customDistricts)) {
      db.settings.customDistricts = [];
    }
    if (!AL_WADI_DISTRICT_NAMES.includes(clean) && !db.settings.customDistricts.includes(clean)) {
      db.settings.customDistricts.push(clean);
    }
    return clean;
  };

  const ensureCustomerRecord = (
    payload: any,
    actorRole: 'driver' | 'manager',
    actorName: string
  ): { customer: Customer; created: boolean; district: string } => {
    const cleanDistrict = registerCustomDistrict(payload.district) || DEFAULT_AL_WADI_DISTRICT;
    const cleanName = String(payload.customerName || payload.name || '').trim();
    const cleanPhone = String(payload.phone || '').trim();
    const requestedCustId = typeof payload.customerId === 'string' ? payload.customerId.trim() : '';

    const isSentinelId =
      !requestedCustId ||
      requestedCustId === 'cust-manual' ||
      requestedCustId === 'cust-offline' ||
      requestedCustId === '__new__';

    if (!isSentinelId) {
      const existingById = db.customers.find((c) => c.id === requestedCustId);
      if (existingById) {
        const samePhone = !cleanPhone || existingById.phone.trim() === cleanPhone;
        const sameName = !cleanName || existingById.name.trim() === cleanName;
        if (samePhone && sameName) {
          return { customer: existingById, created: false, district: cleanDistrict };
        }
      }
    }

    const matchedExisting = db.customers.find((c) => {
      const phoneMatch = cleanPhone && c.phone.trim() === cleanPhone;
      const nameMatch = cleanName && c.name.trim() === cleanName;
      if (cleanName && cleanPhone) return phoneMatch && nameMatch;
      if (cleanPhone && !cleanName) return phoneMatch;
      return false;
    });

    if (matchedExisting) {
      return { customer: matchedExisting, created: false, district: cleanDistrict };
    }

    const newSeq = db.customers.length + 1;
    const newCust: Customer = {
      id: payload.newCustomerId || `cust-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      customerId: `CUST-${String(newSeq).padStart(4, '0')}`,
      name: cleanName || cleanPhone || 'عميل جديد',
      phone: cleanPhone,
      altPhone: String(payload.altPhone || '').trim(),
      district: cleanDistrict,
      addressDetails: String(payload.addressDetails || '').trim(),
      lat: Number(payload.lat) || db.settings.plantLocation.lat + 0.005,
      lng: Number(payload.lng) || db.settings.plantLocation.lng + 0.005,
      tankCapacityLiters: Number(payload.tankCapacity || payload.tankCapacityLiters) || 2000,
      tankRemainingLiters: payload.tankRemainingLiters !== undefined ? Number(payload.tankRemainingLiters) : 0,
      notes: String(payload.notes || '').trim(),
      createdAt: payload.createdAt || new Date().toISOString(),
      isActive: true,
      totalOrdersCount: 0,
      totalLitersDelivered: 0,
      isOfflineCreated: Boolean(payload.isOfflineCreated),
    };
    db.customers.unshift(newCust);

    pushNotification({
      targetRole: 'manager',
      actorRole,
      actorName: actorName || (actorRole === 'driver' ? db.truck.driverName : 'الإدارة'),
      category: 'customer_added',
      priority: 'info',
      title:
        actorRole === 'driver'
          ? `تم حفظ زبون جديد تلقائياً من طلب السائق: ${newCust.name}`
          : `تم حفظ زبون جديد تلقائياً من الطلب: ${newCust.name}`,
      message: `${newCust.district} · الهاتف: ${newCust.phone || 'غير مسجل'}`,
      actionTab: 'customers',
    });

    return { customer: newCust, created: true, district: cleanDistrict };
  };

  // 1. Full State (includes notifications, directives, and live presence)
  router.get('/state', (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        ...db,
        presence: getPresenceSnapshot(),
      },
    });
  });

  // 1B. Custom Districts Registry (Al-Wadi District, Marib)
  router.post('/districts', (req: Request, res: Response) => {
    const clean = registerCustomDistrict(req.body?.name);
    if (!clean) {
      return res.status(400).json({ success: false, error: 'يرجى كتابة اسم المنطقة أو الحي بشكل صحيح' });
    }
    saveDatabase();
    broadcastWs({ type: 'state:updated', reason: 'district:created' });
    res.json({ success: true, name: clean, data: db.settings.customDistricts || [] });
  });

  // 2. Customers
  router.get('/customers', (_req: Request, res: Response) => {
    res.json({ success: true, data: db.customers });
  });

  router.post('/customers', (req: Request, res: Response) => {
    const payload = req.body || {};
    const cached = getIdempotentResponse(payload.clientRequestId);
    if (cached) return res.json(cached);

    if (payload.id && db.customers.some((c) => c.id === payload.id)) {
      const existing = db.customers.find((c) => c.id === payload.id);
      return res.json({
        success: true,
        data: existing,
        customDistricts: db.settings.customDistricts || [],
        deduplicated: true,
      });
    }

    const cleanName = String(payload.name || '').trim();
    const cleanPhone = String(payload.phone || '').trim();
    if (!cleanName || !cleanPhone) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال اسم العميل ورقم الهاتف' });
    }

    // Prevent double-click duplicate customer creation within 10 seconds
    const tenSecAgo = Date.now() - 10 * 1000;
    const rapidDup = db.customers.find(
      (c) =>
        c.name.trim() === cleanName &&
        c.phone.trim() === cleanPhone &&
        new Date(c.createdAt).getTime() > tenSecAgo
    );
    if (rapidDup) {
      return res.json({
        success: true,
        data: rapidDup,
        customDistricts: db.settings.customDistricts || [],
        deduplicated: true,
      });
    }

    const cleanDistrict = registerCustomDistrict(payload.district) || DEFAULT_AL_WADI_DISTRICT;
    const newSeq = db.customers.length + 1;
    const customerId = `CUST-${String(newSeq).padStart(4, '0')}`;
    const newCustomer: Customer = {
      id: payload.id || `cust-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      customerId,
      name: cleanName,
      phone: cleanPhone,
      altPhone: String(payload.altPhone || '').trim(),
      district: cleanDistrict,
      addressDetails: String(payload.addressDetails || '').trim(),
      lat: Number(payload.lat) || db.settings.plantLocation.lat + 0.005,
      lng: Number(payload.lng) || db.settings.plantLocation.lng + 0.005,
      tankCapacityLiters: Number(payload.tankCapacityLiters) || 2000,
      tankRemainingLiters: payload.tankRemainingLiters !== undefined ? Number(payload.tankRemainingLiters) : 0,
      notes: String(payload.notes || '').trim(),
      createdAt: payload.createdAt || new Date().toISOString(),
      isActive: true,
      totalOrdersCount: 0,
      totalLitersDelivered: 0,
    };
    db.customers.unshift(newCustomer);
    const isDriverActor = payload.isOfflineCreated || payload.actorRole === 'driver';
    notifyAndBroadcast('customer:created', {
      targetRole: 'manager',
      actorRole: isDriverActor ? 'driver' : 'manager',
      actorName: isDriverActor ? (payload.actorName || db.truck.driverName) : 'الإدارة',
      category: 'customer_added',
      priority: 'info',
      title: isDriverActor ? `زبون جديد مرفوع من السائق: ${newCustomer.name}` : `تسجيل زبون جديد: ${newCustomer.name}`,
      message: `${newCustomer.district} · سعة الخزان ${newCustomer.tankCapacityLiters.toLocaleString()} لتر`,
      actionTab: 'customers',
    });
    saveDatabase();
    const resp = { success: true, data: newCustomer, customDistricts: db.settings.customDistricts || [] };
    saveIdempotentResponse(payload.clientRequestId, resp);
    res.json(resp);
  });

  router.put('/customers/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const idx = db.customers.findIndex((c) => c.id === id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'العميل غير موجود' });
    }
    const {
      id: _ignoreId,
      customerId: _ignoreCode,
      clientRequestId: _ignoreReqId,
      ...incoming
    } = req.body || {};

    const cleanDistrict =
      incoming.district !== undefined
        ? registerCustomDistrict(incoming.district) || db.customers[idx].district || DEFAULT_AL_WADI_DISTRICT
        : db.customers[idx].district;

    db.customers[idx] = {
      ...db.customers[idx],
      ...incoming,
      name: incoming.name !== undefined ? String(incoming.name).trim() || db.customers[idx].name : db.customers[idx].name,
      phone: incoming.phone !== undefined ? String(incoming.phone).trim() : db.customers[idx].phone,
      district: cleanDistrict,
    };
    broadcastWs({ type: 'state:updated', reason: 'customer:updated' });
    saveDatabase();
    res.json({ success: true, data: db.customers[idx], customDistricts: db.settings.customDistricts || [] });
  });

  router.delete('/customers/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const idx = db.customers.findIndex((c) => c.id === id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'العميل غير موجود' });
    }
    const [removed] = db.customers.splice(idx, 1);
    for (const o of db.orders) {
      if (o.customerId === id) {
        o.customerId = '';
      }
    }
    broadcastWs({ type: 'state:updated', reason: 'customer:deleted' });
    saveDatabase();
    res.json({ success: true, deletedId: removed.id });
  });

  // 3. Orders & Duplicate Detection
  router.get('/orders', (_req: Request, res: Response) => {
    res.json({ success: true, data: db.orders });
  });

  router.post('/orders', (req: Request, res: Response) => {
    const payload = req.body || {};
    const cached = getIdempotentResponse(payload.clientRequestId);
    if (cached) return res.json(cached);

    if (payload.id && db.orders.some((o) => o.id === payload.id)) {
      const existing = db.orders.find((o) => o.id === payload.id);
      return res.json({
        success: true,
        data: existing,
        customDistricts: db.settings.customDistricts || [],
        deduplicated: true,
      });
    }

    const phone = String(payload.phone || '').trim();
    const cleanName = String(payload.customerName || '').trim();
    const requestedLiters = Number(payload.requestedLiters);
    if (!cleanName || !phone || !Number.isFinite(requestedLiters) || requestedLiters <= 0) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال اسم العميل ورقم الهاتف والكمية المطلوبة' });
    }

    // Prevent rapid double-click duplicate orders (within 8 seconds with exact same customer + phone + liters)
    const eightSecAgo = Date.now() - 8 * 1000;
    const rapidExact = db.orders.find(
      (o) =>
        o.phone.trim() === phone &&
        o.customerName.trim() === cleanName &&
        Number(o.requestedLiters) === requestedLiters &&
        new Date(o.createdAt).getTime() > eightSecAgo
    );
    if (rapidExact) {
      return res.json({
        success: true,
        data: rapidExact,
        customDistricts: db.settings.customDistricts || [],
        deduplicated: true,
      });
    }

    const isDriverOrder = payload.source === 'driver_manual';
    const ensured = ensureCustomerRecord(
      payload,
      isDriverOrder ? 'driver' : 'manager',
      payload.actorName || (isDriverOrder ? db.truck.driverName : 'المدير العام')
    );

    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const duplicate = db.orders.find(
      (o) =>
        (o.phone === phone || (ensured.customer.id && o.customerId === ensured.customer.id)) &&
        new Date(o.createdAt).getTime() > oneDayAgo &&
        o.status !== 'delivered' &&
        o.status !== 'cancelled'
    );

    const orderSeq = db.orders.length + 1;
    const orderNumber = `ORD-2026-${String(orderSeq).padStart(4, '0')}`;
    const pricePerLiter = Number(payload.pricePerLiter) || db.settings.defaultSellingPricePerLiter;
    const totalAmount = requestedLiters * pricePerLiter;

    const newOrder: Order = {
      id: payload.id || `ord-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      orderNumber,
      customerId: ensured.customer.id,
      customerName: cleanName,
      phone,
      district: ensured.district,
      addressDetails: String(payload.addressDetails || '').trim(),
      lat: Number(payload.lat) || db.settings.plantLocation.lat + 0.005,
      lng: Number(payload.lng) || db.settings.plantLocation.lng + 0.005,
      tankCapacity: Number(payload.tankCapacity) || 2000,
      tankRemainingLiters: payload.tankRemainingLiters !== undefined ? Number(payload.tankRemainingLiters) : 0,
      requestedLiters,
      pricePerLiter,
      totalAmount,
      source: payload.source === 'sms' ? 'phone' : payload.source || 'manager_manual',
      createdAt: payload.createdAt || new Date().toISOString(),
      notes: payload.notes || '',
      status: 'waiting_clustering',
      isUrgent: Boolean(payload.isUrgent),
      duplicateWarning: Boolean(duplicate),
      duplicateMatchedOrderId: duplicate?.orderNumber,
    };

    db.orders.unshift(newOrder);

    const custIdx = db.customers.findIndex((c) => c.id === ensured.customer.id);
    if (custIdx !== -1 && payload.tankRemainingLiters !== undefined) {
      db.customers[custIdx].tankRemainingLiters = Number(payload.tankRemainingLiters);
    }

    if (newOrder.source === 'driver_manual') {
      const driverActorName = payload.actorName || db.truck.driverName;
      notifyAndBroadcast('order:driver_created', {
        targetRole: 'manager',
        actorRole: 'driver',
        actorName: driverActorName,
        category: 'order_added',
        priority: newOrder.isUrgent ? 'urgent' : 'info',
        title: `طلب مياه مرفوع من السائق (${newOrder.orderNumber})`,
        message: `${driverActorName} رفع طلباً لـ ${newOrder.customerName} · ${newOrder.district} · ${newOrder.requestedLiters.toLocaleString()} لتر`,
        orderId: newOrder.id,
        actionTab: 'orders',
      });
    } else if (newOrder.isUrgent) {
      notifyAndBroadcast('order:urgent_created', {
        targetRole: 'driver',
        actorRole: 'manager',
        actorName: 'المدير العام',
        category: 'order_added',
        priority: 'urgent',
        title: `طلب ماء عاجل (${newOrder.orderNumber})`,
        message: `${newOrder.customerName} (${newOrder.district}) يحتاج ${newOrder.requestedLiters.toLocaleString()} لتر بشكل عاجل`,
        orderId: newOrder.id,
      });
    } else {
      broadcastWs({ type: 'state:updated', reason: 'order:created' });
    }

    saveDatabase();
    const resp = {
      success: true,
      data: newOrder,
      createdCustomer: ensured.created ? ensured.customer : undefined,
      customDistricts: db.settings.customDistricts || [],
      duplicateDetected: Boolean(duplicate),
      warning: duplicate ? `تنبيه: يوجد طلب سابق لهذا العميل (${duplicate.orderNumber}) في انتظار التوصيل!` : null,
    };
    saveIdempotentResponse(payload.clientRequestId, resp);
    res.json(resp);
  });

  router.put('/orders/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const idx = db.orders.findIndex((o) => o.id === id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'الطلب غير موجود' });
    }
    if (req.body?.district) {
      registerCustomDistrict(req.body.district);
    }
    db.orders[idx] = { ...db.orders[idx], ...req.body };
    broadcastWs({ type: 'state:updated', reason: 'order:updated' });
    saveDatabase();
    res.json({ success: true, data: db.orders[idx], customDistricts: db.settings.customDistricts || [] });
  });

  // 4. Clustering & Optimization
  router.get('/clustering/proposals', (_req: Request, res: Response) => {
    const proposals = generateSmartClusters(db.orders, db.settings, db.truck.maxCapacityLiters);
    res.json({ success: true, data: proposals });
  });

  router.post('/clustering/create-trip', (req: Request, res: Response) => {
    const { proposal, managerName, clientRequestId } = req.body || {};
    const cached = getIdempotentResponse(clientRequestId);
    if (cached) return res.json(cached);

    if (!proposal || !proposal.orders || proposal.orders.length === 0) {
      return res.status(400).json({ success: false, error: 'بيانات مقترح الرحلة غير صحيحة' });
    }

    const incomingSig = proposal.orders.map((o: Order) => o.id).sort().join(',');
    const tenSecAgo = Date.now() - 10 * 1000;
    const rapidTrip = db.trips.find(
      (t) =>
        new Date(t.proposedAt).getTime() > tenSecAgo &&
        [...(t.orderIds || [])].sort().join(',') === incomingSig
    );
    if (rapidTrip) {
      return res.json({ success: true, data: rapidTrip, deduplicated: true });
    }

    const activeOther = db.trips.find((t) => t.status === 'in_progress');
    if (activeOther) {
      return res.status(400).json({
        success: false,
        error: `توجد رحلة جارية قيد التتبع حالياً (${activeOther.tripNumber}) — أوقف التتبع عنها أولاً قبل اعتماد رحلة جديدة.`,
      });
    }

    const tripSeq = db.trips.length + 1;
    const tripNumber = `TRIP-2026-${String(tripSeq).padStart(4, '0')}`;
    const orderIds = proposal.orders.map((o: Order) => o.id);
    const nowIso = new Date().toISOString();
    const approver = (typeof managerName === 'string' && managerName.trim()) || 'المدير العام';
    const startLat = db.settings.plantLocation.lat;
    const startLng = db.settings.plantLocation.lng;

    const newTrip: Trip = {
      id: `trip-${Date.now()}`,
      tripNumber,
      date: nowIso.split('T')[0],
      truckId: db.truck.id,
      driverId: db.truck.driverId,
      driverName: db.truck.driverName,
      truckPlate: db.truck.plateNumber,
      initialLoadLiters: proposal.totalLiters,
      deliveredLiters: 0,
      remainingLiters: proposal.totalLiters,
      status: 'in_progress',
      syncStatus: 'synced',
      createdByRole: 'manager',
      driverAcceptanceStatus: 'accepted',
      driverRespondedAt: nowIso,
      customerStops: proposal.customerStops,
      orderIds,
      proposedAt: nowIso,
      submittedAt: nowIso,
      approvedAt: nowIso,
      approvedBy: approver,
      startedAt: nowIso,
      startLocation: { lat: startLat, lng: startLng },
      gpsPoints: [],
      detectedStops: [],
      gpsGaps: [],
      auditLogs: [
        {
          id: `aud-${Date.now()}`,
          timestamp: nowIso,
          actorRole: 'manager',
          actorName: approver,
          action: 'اعتماد الرحلة وتفعيل التتبع التلقائي من المدير',
          details: `${proposal.customerStops.length} وجهات بإجمالي ${proposal.totalLiters.toLocaleString()} لتر — بدأ تتبع GPS تلقائياً`,
        },
      ],
      modificationRequests: [],
      estimatedDistanceKm: proposal.estimatedDistanceKm,
      estimatedFuelLiters: proposal.estimatedFuelLiters,
      fuelCost: proposal.fuelCost,
      productionCost: proposal.productionCost,
      driverWageShare: proposal.driverWageShare,
      maintenanceShare: proposal.maintenanceShare,
      otherExpensesShare: 0,
      totalCost: proposal.totalCost,
      expectedRevenue: proposal.expectedRevenue,
      expectedProfit: proposal.expectedProfit,
      profitMarginPercent: proposal.profitMarginPercent,
      capacityUtilizationPercent: proposal.capacityUtilization,
      departureRecommendation: proposal.recommendation,
      recommendationReason: proposal.reason,
    };

    for (const ordId of orderIds) {
      const idx = db.orders.findIndex((o) => o.id === ordId);
      if (idx !== -1) {
        db.orders[idx].status = 'in_delivery';
        db.orders[idx].tripId = newTrip.id;
      }
    }

    db.truck.status = 'on_trip';
    db.truck.currentWaterLiters = proposal.totalLiters;
    db.truck.currentTripId = newTrip.id;
    db.truck.lastEvent = 'START';
    db.truck.lastUpdateTimestamp = nowIso;

    db.gpsEvents.push({
      id: `gps-start-${Date.now()}`,
      tripId: newTrip.id,
      tripNumber: newTrip.tripNumber,
      timestamp: nowIso,
      eventType: 'START',
      lat: startLat,
      lng: startLng,
      speed: 0,
      source: 'gps_auto',
      sequenceNumber: db.gpsEvents.length + 1,
      isProcessed: true,
    });

    db.trips.unshift(newTrip);
    notifyAndBroadcast('trip:approved', {
      targetRole: 'driver',
      actorRole: 'manager',
      actorName: approver,
      category: 'trip_approved',
      priority: 'urgent',
      title: `تم اعتماد الرحلة وبدأ التتبع (${newTrip.tripNumber})`,
      message: `${proposal.customerStops.length} وجهات — التتبع الجغرافي GPS نشط الآن وسيقف عند العودة لنقطة الانطلاق أو بإيقاف المدير`,
      tripId: newTrip.id,
      tripNumber: newTrip.tripNumber,
    });
    saveDatabase();
    const resp = { success: true, data: newTrip };
    saveIdempotentResponse(clientRequestId, resp);
    res.json(resp);
  });

  // 5. Driver Trip Planner & Mandatory Manager Approval Workflow
  router.get('/trips', (_req: Request, res: Response) => {
    res.json({ success: true, data: db.trips });
  });

  // Create Trip Plan (Manager ONLY — Drivers submit orders & customers only)
  router.post('/trips', (req: Request, res: Response) => {
    const payload = req.body || {};
    const cached = getIdempotentResponse(payload.clientRequestId);
    if (cached) return res.json(cached);

    if (payload.createdByRole !== 'manager') {
      return res.status(403).json({
        success: false,
        error: 'السائق يرفع طلبات أو زبائن فقط؛ لا يحق له رفع أو إنشاء مخطط رحلة لأن هذه من مهام المدير.',
      });
    }

    if (payload.id && db.trips.some((t) => t.id === payload.id)) {
      const existing = db.trips.find((t) => t.id === payload.id);
      return res.json({ success: true, data: existing, deduplicated: true });
    }

    const stops: TripCustomerStop[] = Array.isArray(payload.customerStops) ? payload.customerStops : [];
    if (stops.length === 0) {
      return res.status(400).json({ success: false, error: 'يجب اختيار وجهة أو زبون واحد على الأقل' });
    }

    const isManagerApproved = Boolean(payload.approveImmediately);
    if (isManagerApproved) {
      const activeOther = db.trips.find((t) => t.status === 'in_progress');
      if (activeOther) {
        return res.status(400).json({
          success: false,
          error: `توجد رحلة جارية قيد التتبع حالياً (${activeOther.tripNumber}) — أوقف التتبع عنها أولاً قبل اعتماد رحلة جديدة.`,
        });
      }
    }

    const requestedStatus: TripStatus = isManagerApproved
      ? 'in_progress'
      : payload.status === 'pending_approval'
      ? 'pending_approval'
      : 'draft';

    const matchedDriver = payload.driverId
      ? db.driverAccounts.find((d) => d.id === payload.driverId)
      : undefined;
    const assignedDriverId = matchedDriver?.id || payload.driverId || db.truck.driverId;
    const assignedDriverName = matchedDriver?.name || payload.driverName || db.truck.driverName;

    const tripSeq = db.trips.length + 1;
    const tripNumber = payload.tripNumber || `TRIP-2026-${String(tripSeq).padStart(4, '0')}`;
    const actorName = payload.actorName || 'المدير العام';
    const nowIso = new Date().toISOString();
    const startLat = db.settings.plantLocation.lat;
    const startLng = db.settings.plantLocation.lng;

    const totalLiters = stops.reduce((s, st) => s + (Number(st.requestedLiters) || 0), 0);
    const estDistKm = Number(payload.estimatedDistanceKm) || Math.max(4, stops.length * 3.5);
    const estFuelLiters = Number((estDistKm * db.settings.truckDieselConsumptionPerKm).toFixed(2));

    const newTrip: Trip = {
      id: payload.id || `trip-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      tripNumber,
      date: payload.date || nowIso.split('T')[0],
      truckId: db.truck.id,
      driverId: assignedDriverId,
      driverName: assignedDriverName,
      truckPlate: db.truck.plateNumber,
      initialLoadLiters: totalLiters,
      deliveredLiters: 0,
      remainingLiters: totalLiters,
      status: requestedStatus,
      syncStatus: 'synced',
      createdByRole: 'manager',
      driverAcceptanceStatus: isManagerApproved ? 'accepted' : 'pending',
      driverRespondedAt: isManagerApproved ? nowIso : undefined,
      customerStops: stops.map((s, idx) => ({ ...s, stopSequence: idx + 1 })),
      orderIds: stops.map((s) => s.orderId).filter(Boolean),
      proposedAt: payload.proposedAt || nowIso,
      submittedAt: requestedStatus !== 'draft' ? nowIso : undefined,
      approvedAt: isManagerApproved ? nowIso : undefined,
      approvedBy: isManagerApproved ? actorName : undefined,
      startedAt: isManagerApproved ? nowIso : undefined,
      startLocation: isManagerApproved ? { lat: startLat, lng: startLng } : undefined,
      gpsPoints: [],
      detectedStops: [],
      gpsGaps: [],
      auditLogs: [
        {
          id: `aud-${Date.now()}`,
          timestamp: nowIso,
          actorRole: 'manager',
          actorName,
          action: isManagerApproved
            ? 'اعتماد الرحلة وتفعيل التتبع التلقائي من المدير'
            : 'إنشاء مسودة مخطط رحلة من المدير',
          details: `السائق المكلف: ${assignedDriverName} · ${stops.length} وجهات بإجمالي ${totalLiters.toLocaleString()} لتر`,
        },
      ],
      modificationRequests: [],
      estimatedDistanceKm: estDistKm,
      estimatedFuelLiters: estFuelLiters,
      fuelCost: 0,
      productionCost: 0,
      driverWageShare: db.settings.driverWagePerTrip,
      maintenanceShare: db.settings.maintenanceAllowancePerTrip,
      otherExpensesShare: 0,
      totalCost: 0,
      expectedRevenue: 0,
      expectedProfit: 0,
      profitMarginPercent: 0,
      capacityUtilizationPercent: 0,
      departureRecommendation: totalLiters >= 4500 ? 'GO_NOW' : 'FEASIBLE_PARTIAL',
      recommendationReason: 'مخطط رحلة مُعد ومعتمد من لوحة المدير',
      notes: payload.notes,
    };

    recomputeTripFinancials(newTrip);

    for (const ordId of newTrip.orderIds) {
      const o = db.orders.find((ord) => ord.id === ordId);
      if (o) {
        o.status = isManagerApproved ? 'in_delivery' : 'clustered';
        o.tripId = newTrip.id;
      }
    }

    if (isManagerApproved) {
      db.truck.status = 'on_trip';
      db.truck.currentWaterLiters = totalLiters;
      db.truck.currentTripId = newTrip.id;
      db.truck.lastEvent = 'START';
      db.truck.lastUpdateTimestamp = nowIso;
      db.gpsEvents.push({
        id: `gps-start-${Date.now()}`,
        tripId: newTrip.id,
        tripNumber: newTrip.tripNumber,
        timestamp: nowIso,
        eventType: 'START',
        lat: startLat,
        lng: startLng,
        speed: 0,
        source: 'gps_auto',
        sequenceNumber: db.gpsEvents.length + 1,
        isProcessed: true,
      });
    }

    db.trips.unshift(newTrip);
    if (isManagerApproved) {
      notifyAndBroadcast('trip:approved', {
        targetRole: 'driver',
        actorRole: 'manager',
        actorName,
        category: 'trip_approved',
        priority: 'urgent',
        title: `تم اعتماد الرحلة وبدأ التتبع (${newTrip.tripNumber})`,
        message: `${stops.length} وجهات — التتبع الجغرافي GPS نشط الآن وسيقف تلقائياً عند العودة لنقطة الانطلاق أو بإيقاف المدير`,
        tripId: newTrip.id,
        tripNumber: newTrip.tripNumber,
      });
    } else {
      broadcastWs({ type: 'state:updated', reason: 'trip:created' });
    }
    saveDatabase();
    const resp = { success: true, data: newTrip };
    saveIdempotentResponse(payload.clientRequestId, resp);
    res.json(resp);
  });

  // Manager edits trip plan BEFORE approval (when status is 'draft' or 'rejected')
  router.put('/trips/:id/plan', (req: Request, res: Response) => {
    if (req.body?.actorRole !== 'manager') {
      return res.status(403).json({
        success: false,
        error: 'السائق يرفع طلبات أو زبائن فقط؛ تعديل مخطط الرحلة من مهام المدير.',
      });
    }

    const trip = db.trips.find((t) => t.id === req.params.id);
    if (!trip) return res.status(404).json({ success: false, error: 'الرحلة غير موجودة' });

    if (trip.status !== 'draft' && trip.status !== 'rejected') {
      return res.status(403).json({
        success: false,
        error: 'لا يمكن تعديل وجهات أو طلبات رحلة بعد اعتمادها إلا عبر طلب تعديل يوافق عليه المدير',
      });
    }

    const stops: TripCustomerStop[] = Array.isArray(req.body.customerStops) ? req.body.customerStops : [];
    if (stops.length === 0) {
      return res.status(400).json({ success: false, error: 'يجب تضمين وجهة واحدة على الأقل' });
    }

    if (req.body.driverId) {
      const drv = db.driverAccounts.find((d) => d.id === req.body.driverId);
      if (drv) {
        trip.driverId = drv.id;
        trip.driverName = drv.name;
      }
    }

    trip.customerStops = stops.map((s, idx) => ({ ...s, stopSequence: idx + 1 }));
    trip.orderIds = stops.map((s) => s.orderId).filter(Boolean);
    trip.notes = req.body.notes ?? trip.notes;
    recomputeTripFinancials(trip);

    appendAudit(
      trip,
      'manager',
      req.body.actorName || 'المدير العام',
      'تعديل مخطط الرحلة',
      `تحديث الترتيب والوجهات إلى ${stops.length} وجهات (${trip.initialLoadLiters.toLocaleString()} لتر)`
    );

    saveDatabase();
    broadcastWs({ type: 'state:updated', reason: 'trip:plan_updated' });
    res.json({ success: true, data: trip });
  });

  // Submit Draft/Rejected plan (Manager only — drivers cannot submit trip plans)
  router.post('/trips/:id/submit', (req: Request, res: Response) => {
    if (req.body?.actorRole !== 'manager') {
      return res.status(403).json({
        success: false,
        error: 'السائق يرفع طلبات أو زبائن فقط؛ رفع وإرسال مخططات الرحلات من مهام المدير.',
      });
    }

    const trip = db.trips.find((t) => t.id === req.params.id);
    if (!trip) return res.status(404).json({ success: false, error: 'الرحلة غير موجودة' });

    if (trip.status !== 'draft' && trip.status !== 'rejected') {
      return res.status(400).json({ success: false, error: 'الرحلة ليست في وضع المسودة' });
    }

    const managerActor = req.body?.actorName || 'المدير العام';
    trip.status = 'pending_approval';
    trip.submittedAt = new Date().toISOString();
    trip.rejectionReason = undefined;
    appendAudit(
      trip,
      'manager',
      managerActor,
      'إعداد وتجهيز مخطط الرحلة للاعتماد',
      `${trip.customerStops.length} وجهات · ${trip.initialLoadLiters.toLocaleString()} لتر`
    );

    broadcastWs({ type: 'state:updated', reason: 'trip:submitted' });
    saveDatabase();
    res.json({ success: true, data: trip });
  });

  // Manager explicitly approves trip -> immediately activates tracking ('in_progress')
  router.post('/trips/:id/approve', (req: Request, res: Response) => {
    const cached = getIdempotentResponse(req.body?.clientRequestId);
    if (cached) return res.json(cached);

    const trip = db.trips.find((t) => t.id === req.params.id);
    if (!trip) return res.status(404).json({ success: false, error: 'الرحلة غير موجودة' });

    if (trip.status === 'in_progress') {
      return res.json({ success: true, data: trip, deduplicated: true });
    }

    if (trip.status !== 'pending_approval' && trip.status !== 'draft' && trip.status !== 'approved' && trip.status !== 'rejected') {
      return res.status(400).json({ success: false, error: 'لا يمكن اعتماد رحلة في هذه الحالة' });
    }

    const activeOther = db.trips.find((t) => t.status === 'in_progress' && t.id !== trip.id);
    if (activeOther) {
      return res.status(400).json({
        success: false,
        error: `توجد رحلة جارية قيد التتبع حالياً (${activeOther.tripNumber}) — أوقف التتبع عنها أولاً قبل اعتماد رحلة جديدة.`,
      });
    }

    const nowIso = new Date().toISOString();
    const managerName = req.body?.managerName || 'المدير العام';
    const startLat = db.settings.plantLocation.lat;
    const startLng = db.settings.plantLocation.lng;

    trip.status = 'in_progress';
    trip.approvedAt = nowIso;
    trip.approvedBy = managerName;
    trip.startedAt = trip.startedAt || nowIso;
    trip.startLocation = trip.startLocation || { lat: startLat, lng: startLng };
    trip.rejectionReason = undefined;
    trip.returnedForEditReason = undefined;
    trip.driverAcceptanceStatus = 'accepted';
    trip.driverRespondedAt = nowIso;
    trip.driverResponseReason = undefined;

    for (const ordId of trip.orderIds) {
      const o = db.orders.find((ord) => ord.id === ordId);
      if (o) o.status = 'in_delivery';
    }

    db.truck.status = 'on_trip';
    db.truck.currentWaterLiters = trip.initialLoadLiters;
    db.truck.currentTripId = trip.id;
    db.truck.lastEvent = 'START';
    db.truck.lastUpdateTimestamp = nowIso;

    db.gpsEvents.push({
      id: `gps-start-${Date.now()}`,
      tripId: trip.id,
      tripNumber: trip.tripNumber,
      timestamp: nowIso,
      eventType: 'START',
      lat: startLat,
      lng: startLng,
      speed: 0,
      source: 'gps_auto',
      sequenceNumber: db.gpsEvents.length + 1,
      isProcessed: true,
    });

    appendAudit(
      trip,
      'manager',
      managerName,
      'اعتماد الرحلة وتفعيل التتبع التلقائي',
      req.body?.notes || 'تم اعتماد الرحلة من المدير وبدء تتبع GPS تلقائياً'
    );

    notifyAndBroadcast('trip:approved', {
      targetRole: 'driver',
      actorRole: 'manager',
      actorName: managerName,
      category: 'trip_approved',
      priority: 'urgent',
      title: `تم اعتماد الرحلة وبدأ التتبع (${trip.tripNumber})`,
      message: req.body?.notes
        ? `ملاحظة المدير: ${req.body.notes} — التتبع الجغرافي نشط الآن`
        : `${trip.customerStops.length} وجهات — التتبع الجغرافي GPS نشط تلقائياً وسيقف عند العودة لنقطة الانطلاق أو بإيقاف المدير`,
      tripId: trip.id,
      tripNumber: trip.tripNumber,
    });

    saveDatabase();
    const resp = { success: true, data: trip };
    saveIdempotentResponse(req.body?.clientRequestId, resp);
    res.json(resp);
  });

  // Manager rejects trip -> 'rejected'
  router.post('/trips/:id/reject', (req: Request, res: Response) => {
    const trip = db.trips.find((t) => t.id === req.params.id);
    if (!trip) return res.status(404).json({ success: false, error: 'الرحلة غير موجودة' });

    const managerName = req.body?.managerName || 'المدير العام';
    const reason = (req.body?.reason || 'مرفوض من الإدارة').trim();
    trip.status = 'rejected';
    trip.rejectedAt = new Date().toISOString();
    trip.rejectedBy = managerName;
    trip.rejectionReason = reason;

    appendAudit(trip, 'manager', managerName, 'رفض مخطط الرحلة', reason);

    notifyAndBroadcast('trip:rejected', {
      targetRole: 'driver',
      actorRole: 'manager',
      actorName: managerName,
      category: 'trip_rejected',
      priority: 'urgent',
      title: `تم رفض مخطط الرحلة ${trip.tripNumber}`,
      message: `السبب من المدير: ${reason}`,
      tripId: trip.id,
      tripNumber: trip.tripNumber,
    });

    saveDatabase();
    res.json({ success: true, data: trip });
  });

  // Manager returns trip to driver for edit -> 'draft'
  router.post('/trips/:id/return-for-edit', (req: Request, res: Response) => {
    const trip = db.trips.find((t) => t.id === req.params.id);
    if (!trip) return res.status(404).json({ success: false, error: 'الرحلة غير موجودة' });

    const managerName = req.body?.managerName || 'المدير العام';
    const reason = (req.body?.reason || 'يرجى تعديل الوجهات أو الترتيب وإعادة الإرسال').trim();
    trip.status = 'draft';
    trip.returnedForEditReason = reason;

    appendAudit(trip, 'manager', managerName, 'إعادة الرحلة للسائق للتعديل', reason);

    notifyAndBroadcast('trip:returned_for_edit', {
      targetRole: 'driver',
      actorRole: 'manager',
      actorName: managerName,
      category: 'trip_returned',
      priority: 'urgent',
      title: `المدير يطلب تعديل مخطط ${trip.tripNumber}`,
      message: `المطلوب: ${reason}`,
      tripId: trip.id,
      tripNumber: trip.tripNumber,
    });

    saveDatabase();
    res.json({ success: true, data: trip });
  });

  // Driver responds to a Manager-proposed trip request: accept OR reply/decline with written reason
  router.post('/trips/:id/driver-respond', (req: Request, res: Response) => {
    const cached = getIdempotentResponse(req.body?.clientRequestId);
    if (cached) return res.json(cached);

    const trip = db.trips.find((t) => t.id === req.params.id);
    if (!trip) return res.status(404).json({ success: false, error: 'الرحلة غير موجودة' });

    const decision = req.body?.decision;
    if (decision !== 'accepted' && decision !== 'declined') {
      return res.status(400).json({ success: false, error: 'نوع الرد غير صحيح (يجب أن يكون accepted أو declined)' });
    }

    const driverActor = (req.body?.driverName || trip.driverName || db.truck.driverName).trim();
    const rawReason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    const nowIso = new Date().toISOString();

    if (decision === 'declined') {
      if (!rawReason) {
        return res.status(400).json({
          success: false,
          error: 'يرجى كتابة سبب عدم الموافقة أو الاعتذار عن الرحلة ليظهر للمدير.',
        });
      }

      trip.driverAcceptanceStatus = 'declined';
      trip.driverRespondedAt = nowIso;
      trip.driverResponseReason = rawReason;

      appendAudit(
        trip,
        'driver',
        driverActor,
        'رد السائق بعدم الموافقة على طلب الرحلة',
        `السبب المكتوب: ${rawReason}`
      );

      notifyAndBroadcast('trip:driver_declined', {
        targetRole: 'manager',
        actorRole: 'driver',
        actorName: driverActor,
        category: 'trip_driver_declined',
        priority: 'urgent',
        title: `رد السائق على الرحلة ${trip.tripNumber}: غير موافق`,
        message: `السبب المكتوب من ${driverActor}: ${rawReason}`,
        tripId: trip.id,
        tripNumber: trip.tripNumber,
        actionTab: 'trips',
      });

      saveDatabase();
      const resp = { success: true, data: trip };
      saveIdempotentResponse(req.body?.clientRequestId, resp);
      return res.json(resp);
    }

    // decision === 'accepted'
    trip.driverAcceptanceStatus = 'accepted';
    trip.driverRespondedAt = nowIso;
    trip.driverResponseReason = rawReason || undefined;

    appendAudit(
      trip,
      'driver',
      driverActor,
      'موافقة السائق على طلب الرحلة المقترح من المدير',
      rawReason ? `ملاحظة السائق: ${rawReason}` : 'وافق السائق على استلام وتنفيذ الرحلة'
    );

    notifyAndBroadcast('trip:driver_accepted', {
      targetRole: 'manager',
      actorRole: 'driver',
      actorName: driverActor,
      category: 'trip_driver_accepted',
      priority: 'action_required',
      title: `وافق السائق على الرحلة ${trip.tripNumber}`,
      message: rawReason
        ? `وافق ${driverActor} على طلب الرحلة · ملاحظة: ${rawReason}`
        : `وافق ${driverActor} على استلام وتنفيذ الرحلة (${trip.customerStops.length} وجهات · ${trip.initialLoadLiters.toLocaleString()} لتر)`,
      tripId: trip.id,
      tripNumber: trip.tripNumber,
      actionTab: 'trips',
    });

    saveDatabase();
    const resp = { success: true, data: trip };
    saveIdempotentResponse(req.body?.clientRequestId, resp);
    res.json(resp);
  });

  // Modification Requests on approved / in_progress trips
  router.post('/trips/:id/request-modification', (req: Request, res: Response) => {
    const cached = getIdempotentResponse(req.body?.clientRequestId);
    if (cached) return res.json(cached);

    const trip = db.trips.find((t) => t.id === req.params.id);
    if (!trip) return res.status(404).json({ success: false, error: 'الرحلة غير موجودة' });

    if (trip.status !== 'approved' && trip.status !== 'in_progress') {
      return res.status(400).json({ success: false, error: 'طلبات التعديل تخص الرحلات المعتمدة أو الجارية فقط' });
    }

    const proposedStops: TripCustomerStop[] = Array.isArray(req.body.proposedStops)
      ? req.body.proposedStops
      : trip.customerStops;
    const reason = (req.body.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ success: false, error: 'يرجى كتابة سبب طلب التعديل' });
    }

    const tenSecAgo = Date.now() - 10 * 1000;
    const recentDupMod = (trip.modificationRequests || []).find(
      (m) => m.reason.trim() === reason && new Date(m.requestedAt).getTime() > tenSecAgo
    );
    if (recentDupMod) {
      return res.json({ success: true, data: trip, request: recentDupMod, deduplicated: true });
    }

    const modReq: ModificationRequest = {
      id: `mod-${Date.now()}`,
      requestedAt: new Date().toISOString(),
      requestedBy: req.body.requestedBy || trip.driverName,
      reason,
      proposedStops: proposedStops.map((s, idx) => ({ ...s, stopSequence: idx + 1 })),
      proposedOrderIds: proposedStops.map((s) => s.orderId).filter(Boolean),
      proposedTotalLiters: proposedStops.reduce((sum, s) => sum + (Number(s.requestedLiters) || 0), 0),
      status: 'pending',
    };

    if (!trip.modificationRequests) trip.modificationRequests = [];
    trip.modificationRequests.unshift(modReq);
    appendAudit(trip, 'driver', modReq.requestedBy, 'طلب تعديل على رحلة معتمدة', reason);

    notifyAndBroadcast('modification:requested', {
      targetRole: 'manager',
      actorRole: 'driver',
      actorName: modReq.requestedBy,
      category: 'mod_requested',
      priority: 'action_required',
      title: `طلب تعديل من السائق على ${trip.tripNumber}`,
      message: `السبب: ${reason} (${modReq.proposedStops.length} وجهات)`,
      tripId: trip.id,
      tripNumber: trip.tripNumber,
      actionTab: 'trips',
    });

    saveDatabase();
    const resp = { success: true, data: trip, request: modReq };
    saveIdempotentResponse(req.body?.clientRequestId, resp);
    res.json(resp);
  });

  router.post('/trips/:id/approve-modification', (req: Request, res: Response) => {
    const trip = db.trips.find((t) => t.id === req.params.id);
    if (!trip) return res.status(404).json({ success: false, error: 'الرحلة غير موجودة' });

    const modReq = (trip.modificationRequests || []).find((m) => m.id === req.body.requestId);
    if (!modReq || modReq.status !== 'pending') {
      return res.status(404).json({ success: false, error: 'طلب التعديل غير موجود أو تمت معالجته' });
    }

    const managerName = req.body.managerName || 'المدير العام';
    modReq.status = 'approved';
    modReq.reviewedBy = managerName;
    modReq.reviewedAt = new Date().toISOString();
    modReq.reviewNotes = req.body.reviewNotes || 'تمت الموافقة على التعديل';

    trip.customerStops = modReq.proposedStops;
    trip.orderIds = modReq.proposedOrderIds;
    recomputeTripFinancials(trip);

    for (const ordId of trip.orderIds) {
      const o = db.orders.find((ord) => ord.id === ordId);
      if (o) {
        o.status = trip.status === 'in_progress' ? 'in_delivery' : 'approved';
        o.tripId = trip.id;
      }
    }

    appendAudit(trip, 'manager', managerName, 'اعتماد طلب تعديل الرحلة', `${modReq.reason} (${modReq.proposedStops.length} وجهات)`);

    notifyAndBroadcast('modification:approved', {
      targetRole: 'driver',
      actorRole: 'manager',
      actorName: managerName,
      category: 'mod_approved',
      priority: 'urgent',
      title: `وافق المدير على تعديل الرحلة ${trip.tripNumber}`,
      message: `تم تحديث الوجهات المعتمدة إلى ${modReq.proposedStops.length} وجهات`,
      tripId: trip.id,
      tripNumber: trip.tripNumber,
    });

    saveDatabase();
    res.json({ success: true, data: trip });
  });

  router.post('/trips/:id/reject-modification', (req: Request, res: Response) => {
    const trip = db.trips.find((t) => t.id === req.params.id);
    if (!trip) return res.status(404).json({ success: false, error: 'الرحلة غير موجودة' });

    const modReq = (trip.modificationRequests || []).find((m) => m.id === req.body.requestId);
    if (!modReq || modReq.status !== 'pending') {
      return res.status(404).json({ success: false, error: 'طلب التعديل غير موجود أو تمت معالجته' });
    }

    const managerName = req.body.managerName || 'المدير العام';
    const reviewNotes: string = req.body.reviewNotes || 'تم رفض التعديل والإبقاء على الخطة المعتمدة';
    modReq.status = 'rejected';
    modReq.reviewedBy = managerName;
    modReq.reviewedAt = new Date().toISOString();
    modReq.reviewNotes = reviewNotes;

    appendAudit(trip, 'manager', managerName, 'رفض طلب تعديل الرحلة', reviewNotes);

    notifyAndBroadcast('modification:rejected', {
      targetRole: 'driver',
      actorRole: 'manager',
      actorName: managerName,
      category: 'mod_rejected',
      priority: 'urgent',
      title: `رفض طلب تعديل الرحلة ${trip.tripNumber}`,
      message: reviewNotes,
      tripId: trip.id,
      tripNumber: trip.tripNumber,
    });

    saveDatabase();
    res.json({ success: true, data: trip });
  });

  // Start Trip: Disabled for driver — tracking activates automatically when Manager approves trip
  router.post('/trips/:id/start', (_req: Request, res: Response) => {
    return res.status(403).json({
      success: false,
      error: 'التتبع يتم حصرياً عبر اعتماد الرحلة من المدير العام؛ لا يحق للسائق بدء أو إيقاف التتبع يدوياً.',
    });
  });

  // Manager explicitly stops active GPS tracking on a trip
  router.post('/trips/:id/stop-tracking', (req: Request, res: Response) => {
    const cached = getIdempotentResponse(req.body?.clientRequestId);
    if (cached) return res.json(cached);

    const trip = db.trips.find((t) => t.id === req.params.id);
    if (!trip) return res.status(404).json({ success: false, error: 'الرحلة غير موجودة' });

    if (trip.status === 'completed_pending_review' || trip.status === 'closed') {
      return res.json({ success: true, data: trip, deduplicated: true });
    }

    if (trip.status !== 'in_progress' && trip.status !== 'approved') {
      return res.status(400).json({
        success: false,
        error: 'هذه الرحلة ليست في حالة التتبع النشط حالياً',
      });
    }

    const nowIso = new Date().toISOString();
    const managerName = req.body?.managerName || 'المدير العام';
    const reason = (req.body?.reason || '').trim();
    const lastPt = (trip.gpsPoints || []).slice(-1)[0];
    const stopLat = lastPt?.lat || db.truck.lastLat || db.settings.plantLocation.lat;
    const stopLng = lastPt?.lng || db.truck.lastLng || db.settings.plantLocation.lng;

    trip.returnedToPlantAt = trip.returnedToPlantAt || nowIso;
    trip.completedAt = nowIso;
    trip.lastSyncedAt = nowIso;
    trip.syncStatus = 'synced';
    trip.status = 'completed_pending_review';
    trip.actualDistanceKm = trip.actualDistanceKm ?? trip.estimatedDistanceKm;
    trip.actualFuelLiters =
      trip.actualFuelLiters ??
      Number(((trip.actualDistanceKm || 0) * db.settings.truckDieselConsumptionPerKm).toFixed(2));

    const actualRevenue = trip.customerStops.reduce((sum, s) => sum + s.deliveredLiters * s.pricePerLiter, 0);
    const actualFuelCost = (trip.actualFuelLiters || trip.estimatedFuelLiters) * db.settings.dieselPricePerLiter;
    const actualProdCost = trip.deliveredLiters * db.settings.waterProductionCostPerLiter;
    const actualTotalCost = Math.round(actualFuelCost + actualProdCost + trip.driverWageShare + trip.maintenanceShare);

    trip.actualRevenue = actualRevenue;
    trip.actualCost = actualTotalCost;
    trip.actualProfit = actualRevenue - actualTotalCost;

    db.truck.status = 'idle';
    db.truck.currentTripId = undefined;
    db.truck.currentWaterLiters = 0;
    db.truck.lastEvent = 'END';
    db.truck.lastLat = stopLat;
    db.truck.lastLng = stopLng;
    db.truck.lastUpdateTimestamp = nowIso;
    db.truck.odometerKm += Math.round(trip.actualDistanceKm || 0);

    db.gpsEvents.push({
      id: `gps-end-${Date.now()}`,
      tripId: trip.id,
      tripNumber: trip.tripNumber,
      timestamp: nowIso,
      eventType: 'END',
      lat: stopLat,
      lng: stopLng,
      speed: 0,
      source: 'gps_auto',
      sequenceNumber: db.gpsEvents.length + 1,
      isProcessed: true,
    });

    appendAudit(
      trip,
      'manager',
      managerName,
      'إيقاف التتبع من قبل المدير',
      reason || 'أوقف المدير تتبع GPS للرحلة وحولها للمراجعة'
    );

    notifyAndBroadcast('trip:tracking_stopped', {
      targetRole: 'driver',
      actorRole: 'manager',
      actorName: managerName,
      category: 'trip_closed',
      priority: 'urgent',
      title: `أوقف المدير تتبع الرحلة ${trip.tripNumber}`,
      message: reason || 'تم إيقاف التتبع الجغرافي التلقائي من لوحة المدير العام.',
      tripId: trip.id,
      tripNumber: trip.tripNumber,
    });

    saveDatabase();
    const resp = { success: true, data: trip };
    saveIdempotentResponse(req.body?.clientRequestId, resp);
    res.json(resp);
  });

  // Auto-start GPS tracking when the truck leaves the plant perimeter
  router.post('/gps/auto-start', (req: Request, res: Response) => {
    const cached = getIdempotentResponse(req.body?.clientRequestId);
    if (cached) return res.json(cached);

    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    const speedKmH = req.body?.speedKmH !== undefined ? Number(req.body.speedKmH) : 0;
    const accuracy = req.body?.accuracy !== undefined ? Number(req.body.accuracy) : undefined;
    const clientPts: TripGPSPoint[] = Array.isArray(req.body?.gpsPoints) ? req.body.gpsPoints : [];

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ success: false, error: 'إحداثيات GPS غير صالحة' });
    }

    const nowIso = req.body?.timestamp || new Date().toISOString();

    // 1. If a trip is already in_progress, deduplicate cleanly and merge points
    const activeExisting = db.trips.find((t) => t.status === 'in_progress');
    if (activeExisting) {
      if (clientPts.length > 0) {
        mergeGpsPointsIdempotent(activeExisting, clientPts);
      }
      db.truck.status = 'on_trip';
      db.truck.currentTripId = activeExisting.id;
      db.truck.lastLat = lat;
      db.truck.lastLng = lng;
      db.truck.lastSpeed = Number.isFinite(speedKmH) ? speedKmH : 0;
      db.truck.lastUpdateTimestamp = nowIso;
      saveDatabase();
      const resp = { success: true, alreadyActive: true, data: activeExisting };
      saveIdempotentResponse(req.body?.clientRequestId, resp);
      return res.json(resp);
    }

    // 2. Cooldown guard: prevent immediate re-trigger right after Manager manually stops tracking
    const recentManagerStopped = db.trips.find(
      (t) =>
        (t.status === 'completed_pending_review' || t.status === 'closed') &&
        (t.auditLogs || []).some((a) => a.action === 'إيقاف التتبع من قبل المدير')
    );
    if (recentManagerStopped) {
      const stopTimeMs = new Date(
        recentManagerStopped.completedAt ||
          recentManagerStopped.auditLogs?.slice(-1)[0]?.timestamp ||
          0
      ).getTime();
      if (Number.isFinite(stopTimeMs) && Date.now() - stopTimeMs < 120 * 1000) {
        const lastStopPt =
          recentManagerStopped.returnLocation ||
          (recentManagerStopped.gpsPoints || []).slice(-1)[0];
        if (lastStopPt) {
          const distFromStop = haversineDistanceMeters(lat, lng, lastStopPt.lat, lastStopPt.lng);
          if (distFromStop < 250) {
            return res.json({
              success: false,
              suppressedCooldown: true,
              reason: 'تم إيقاف التتبع من المدير مؤخراً؛ لن يُعاد التشغيل حتى العودة للمصنع أو الابتعاد عن نقطة الإيقاف.',
            });
          }
        }
      }
    }

    // 3. Verify plant perimeter departure threshold & GPS reliability
    const evalResult = evaluatePlantDepartureTrigger({
      lat,
      lng,
      accuracy,
      speedKmH,
      settings: db.settings,
    });

    if (!evalResult.isReliableAccuracy || !evalResult.outsideTriggerZone) {
      return res.json({
        success: false,
        notDeparted: true,
        distanceMeters: evalResult.distanceFromPlantMeters,
        triggerDistanceMeters: evalResult.triggerDistanceMeters,
        reason: 'الوايت لا يزال داخل محيط المصنع أو دقة إشارة GPS غير كافية للتشغيل التلقائي',
      });
    }

    // 4. Transition a waiting 'approved' trip to 'in_progress', OR create a dedicated auto-departure trip
    const waitingApproved = db.trips.find(
      (t) => t.status === 'approved' && t.driverAcceptanceStatus !== 'declined'
    );

    const plantLat = db.settings.plantLocation.lat;
    const plantLng = db.settings.plantLocation.lng;

    if (waitingApproved) {
      waitingApproved.status = 'in_progress';
      waitingApproved.startedAt = waitingApproved.startedAt || nowIso;
      waitingApproved.startLocation = waitingApproved.startLocation || { lat: plantLat, lng: plantLng };
      waitingApproved.driverAcceptanceStatus = 'accepted';
      waitingApproved.driverRespondedAt = waitingApproved.driverRespondedAt || nowIso;
      waitingApproved.syncStatus = 'synced';

      for (const ordId of waitingApproved.orderIds) {
        const o = db.orders.find((ord) => ord.id === ordId);
        if (o) o.status = 'in_delivery';
      }

      const seedPoints: TripGPSPoint[] =
        clientPts.length > 0
          ? clientPts.map((p) => ({ ...p, tripId: waitingApproved.id }))
          : [
              {
                id: `pt-${waitingApproved.id}-dep-${Date.now()}`,
                tripId: waitingApproved.id,
                lat,
                lng,
                speedKmH: Number.isFinite(speedKmH) ? speedKmH : 0,
                accuracy,
                timestamp: nowIso,
                seq: 1,
                distanceFromPrevKm: 0,
                source: 'gps_watch',
              },
            ];
      mergeGpsPointsIdempotent(waitingApproved, seedPoints);

      db.truck.status = 'on_trip';
      db.truck.currentTripId = waitingApproved.id;
      db.truck.currentWaterLiters = waitingApproved.initialLoadLiters;
      db.truck.lastEvent = 'DEPARTURE';
      db.truck.lastLat = lat;
      db.truck.lastLng = lng;
      db.truck.lastSpeed = Number.isFinite(speedKmH) ? speedKmH : 0;
      db.truck.lastUpdateTimestamp = nowIso;

      db.gpsEvents.push({
        id: `gps-dep-${Date.now()}`,
        tripId: waitingApproved.id,
        tripNumber: waitingApproved.tripNumber,
        timestamp: nowIso,
        eventType: 'DEPARTURE',
        lat,
        lng,
        speed: Number.isFinite(speedKmH) ? speedKmH : 0,
        source: 'gps_auto',
        sequenceNumber: db.gpsEvents.length + 1,
        isProcessed: true,
      });

      appendAudit(
        waitingApproved,
        'system',
        waitingApproved.driverName,
        'بدء التتبع التلقائي عند ابتعاد الوايت عن محيط المصنع',
        `تم رصد خروج الوايت عن محيط المصنع (${evalResult.distanceFromPlantMeters} م >= ${evalResult.triggerDistanceMeters} م)`
      );

      notifyAndBroadcast('gps:auto_started', {
        targetRole: 'manager',
        actorRole: 'system',
        actorName: waitingApproved.driverName,
        category: 'gps_alert',
        priority: 'urgent',
        title: `انطلاق تلقائي للرحلة ${waitingApproved.tripNumber}`,
        message: `ابتعد الوايت عن محيط المصنع بمسافة ${evalResult.distanceFromPlantMeters} م وتم تفعيل التتبع الجغرافي تلقائياً`,
        tripId: waitingApproved.id,
        tripNumber: waitingApproved.tripNumber,
        actionTab: 'trips',
      });

      saveDatabase();
      const resp = { success: true, data: waitingApproved, activatedExistingTrip: true };
      saveIdempotentResponse(req.body?.clientRequestId, resp);
      return res.json(resp);
    }

    // Create a new auto-departure tracking trip
    const matchedDriver = req.body?.driverId
      ? db.driverAccounts.find((d) => d.id === req.body.driverId)
      : undefined;
    const assignedDriverId = matchedDriver?.id || db.truck.driverId;
    const assignedDriverName = matchedDriver?.name || req.body?.driverName || db.truck.driverName;
    const tripSeq = db.trips.length + 1;
    const newTripId =
      typeof req.body?.tripId === 'string' && req.body.tripId.startsWith('trip-auto-')
        ? req.body.tripId
        : `trip-auto-${Date.now()}`;
    const tripNumber = `AUTO-2026-${String(tripSeq).padStart(4, '0')}`;

    const newAutoTrip: Trip = {
      id: newTripId,
      tripNumber,
      date: nowIso.split('T')[0],
      truckId: db.truck.id,
      driverId: assignedDriverId,
      driverName: assignedDriverName,
      truckPlate: db.truck.plateNumber,
      initialLoadLiters: 0,
      deliveredLiters: 0,
      remainingLiters: 0,
      status: 'in_progress',
      syncStatus: 'synced',
      createdByRole: 'manager',
      driverAcceptanceStatus: 'accepted',
      driverRespondedAt: nowIso,
      customerStops: [],
      orderIds: [],
      proposedAt: nowIso,
      approvedAt: nowIso,
      approvedBy: 'رصد آلي (محيط المصنع)',
      startedAt: nowIso,
      startLocation: { lat: plantLat, lng: plantLng },
      gpsPoints: [],
      detectedStops: [],
      gpsGaps: [],
      auditLogs: [
        {
          id: `aud-auto-${Date.now()}`,
          timestamp: nowIso,
          actorRole: 'system',
          actorName: 'النظام الآلي',
          action: 'بدء تتبع تلقائي عند ابتعاد الوايت عن محيط المصنع',
          details: `ابتعد الوايت ${evalResult.distanceFromPlantMeters} م عن المصنع (حد التشغيل ${evalResult.triggerDistanceMeters} م)`,
        },
      ],
      modificationRequests: [],
      estimatedDistanceKm: 0,
      estimatedFuelLiters: 0,
      fuelCost: 0,
      productionCost: 0,
      driverWageShare: db.settings.driverWagePerTrip,
      maintenanceShare: db.settings.maintenanceAllowancePerTrip,
      otherExpensesShare: 0,
      totalCost: db.settings.driverWagePerTrip + db.settings.maintenanceAllowancePerTrip,
      expectedRevenue: 0,
      expectedProfit: -(db.settings.driverWagePerTrip + db.settings.maintenanceAllowancePerTrip),
      profitMarginPercent: 0,
      capacityUtilizationPercent: 0,
      departureRecommendation: 'GO_NOW',
      recommendationReason: 'تتبع تلقائي عند ابتعاد الوايت عن محيط المصنع',
      notes: `تم فتح سجل التتبع تلقائياً عند خروج الوايت من محيط المصنع (${evalResult.distanceFromPlantMeters} م)`,
    };

    const seedPoints: TripGPSPoint[] =
      clientPts.length > 0
        ? clientPts.map((p) => ({ ...p, tripId: newAutoTrip.id }))
        : [
            {
              id: `pt-${newAutoTrip.id}-dep-${Date.now()}`,
              tripId: newAutoTrip.id,
              lat,
              lng,
              speedKmH: Number.isFinite(speedKmH) ? speedKmH : 0,
              accuracy,
              timestamp: nowIso,
              seq: 1,
              distanceFromPrevKm: 0,
              source: 'gps_watch',
            },
          ];
    mergeGpsPointsIdempotent(newAutoTrip, seedPoints);

    db.truck.status = 'on_trip';
    db.truck.currentTripId = newAutoTrip.id;
    db.truck.lastEvent = 'DEPARTURE';
    db.truck.lastLat = lat;
    db.truck.lastLng = lng;
    db.truck.lastSpeed = Number.isFinite(speedKmH) ? speedKmH : 0;
    db.truck.lastUpdateTimestamp = nowIso;

    db.gpsEvents.push({
      id: `gps-dep-${Date.now()}`,
      tripId: newAutoTrip.id,
      tripNumber: newAutoTrip.tripNumber,
      timestamp: nowIso,
      eventType: 'DEPARTURE',
      lat,
      lng,
      speed: Number.isFinite(speedKmH) ? speedKmH : 0,
      source: 'gps_auto',
      sequenceNumber: db.gpsEvents.length + 1,
      isProcessed: true,
    });

    db.trips.unshift(newAutoTrip);

    notifyAndBroadcast('gps:auto_started', {
      targetRole: 'manager',
      actorRole: 'system',
      actorName: assignedDriverName,
      category: 'gps_alert',
      priority: 'urgent',
      title: `بدء تتبع تلقائي للوايت خارج المصنع (${newAutoTrip.tripNumber})`,
      message: `ابتعد الوايت عن محيط المصنع بمسافة ${evalResult.distanceFromPlantMeters} م — التتبع التلقائي نشط الآن`,
      tripId: newAutoTrip.id,
      tripNumber: newAutoTrip.tripNumber,
      actionTab: 'trips',
    });

    saveDatabase();
    const resp = { success: true, data: newAutoTrip };
    saveIdempotentResponse(req.body?.clientRequestId, resp);
    res.json(resp);
  });

  // Upload chronological GPS batch idempotently with tamper protection
  router.post('/trips/:id/gps-batch', (req: Request, res: Response) => {
    const trip = db.trips.find((t) => t.id === req.params.id);
    if (!trip) return res.status(404).json({ success: false, error: 'الرحلة غير موجودة' });

    const prevUnplannedCount = (trip.detectedStops || []).filter((s) => s.isUnplannedStop).length;
    const prevGapCount = (trip.gpsGaps || []).length;

    const points: TripGPSPoint[] = Array.isArray(req.body?.points) ? req.body.points : [];
    const { acceptedIds, rejectedTamperIds } = mergeGpsPointsIdempotent(trip, points);

    if (rejectedTamperIds.length > 0 && acceptedIds.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'لا يُسمح بتعديل أو تزوير نقاط GPS المسجلة مسبقاً',
        rejectedTamperIds,
      });
    }

    trip.lastSyncedAt = new Date().toISOString();

    const nextUnplannedCount = (trip.detectedStops || []).filter((s) => s.isUnplannedStop).length;
    const nextGapCount = (trip.gpsGaps || []).length;

    if (nextUnplannedCount > prevUnplannedCount) {
      const latestUnplanned = (trip.detectedStops || []).filter((s) => s.isUnplannedStop).slice(-1)[0];
      notifyAndBroadcast('gps:unplanned_stop', {
        id: `notif-unplanned-${latestUnplanned?.id || trip.id}`,
        targetRole: 'manager',
        actorRole: 'system',
        actorName: trip.driverName,
        category: 'gps_alert',
        priority: 'action_required',
        title: `توقف غير مخطط للوايت (${trip.tripNumber})`,
        message: `رصد النظام توقفاً لمدة ${latestUnplanned?.durationMinutes || 0} د خارج نطاق الزبائن والمصنع`,
        tripId: trip.id,
        tripNumber: trip.tripNumber,
        actionTab: 'trips',
      });
    } else if (nextGapCount > prevGapCount) {
      const latestGap = (trip.gpsGaps || []).slice(-1)[0];
      notifyAndBroadcast('gps:gap', {
        id: `notif-gap-${latestGap?.id || trip.id}`,
        targetRole: 'manager',
        actorRole: 'system',
        actorName: trip.driverName,
        category: 'gps_alert',
        priority: 'info',
        title: `فجوة إشارة GPS (${trip.tripNumber})`,
        message: `انقطاع التغطية لمدة ${Math.round((latestGap?.durationSeconds || 0) / 60)} دقيقة ثم استئناف التتبع`,
        tripId: trip.id,
        tripNumber: trip.tripNumber,
        actionTab: 'trips',
      });
    } else if (acceptedIds.length > 0) {
      broadcastWs({ type: 'state:updated', reason: 'gps:updated', tripId: trip.id });
    }

    saveDatabase();
    res.json({
      success: true,
      acceptedIds,
      rejectedTamperIds,
      data: trip,
    });
  });

  // 6. Stop Delivery Logging & Invoicing (does NOT mark trip returned automatically!)
  router.post('/trips/:id/delivery-stop', (req: Request, res: Response) => {
    const { id } = req.params;
    const { orderId, deliveredLiters, paidAmount, remainingAmount, notes, lat, lng } = req.body;

    const trip = db.trips.find((t) => t.id === id);
    if (!trip) return res.status(404).json({ success: false, error: 'الرحلة غير موجودة' });

    const stop = trip.customerStops.find((s) => s.orderId === orderId);
    if (!stop) return res.status(404).json({ success: false, error: 'نقطة التوقف غير موجودة' });

    if (stop.status === 'delivered' && stop.invoiceId) {
      const inv = db.invoices.find((i) => i.id === stop.invoiceId);
      return res.json({ success: true, data: { trip, invoice: inv }, deduplicated: true });
    }

    stop.deliveredLiters = Number(deliveredLiters);
    stop.paidAmount = Number(paidAmount);
    stop.remainingAmount = Number(remainingAmount);
    stop.status = 'delivered';
    stop.departureTime = new Date().toISOString();
    stop.departureLat = lat || stop.lat;
    stop.departureLng = lng || stop.lng;
    stop.notes = notes || stop.notes;

    const invoiceSeq = db.invoices.length + 1;
    const invoiceNumber = `INV-2026-${String(invoiceSeq).padStart(4, '0')}`;
    const newInvoice: Invoice = {
      id: `inv-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      invoiceNumber,
      orderId: stop.orderId,
      orderNumber: db.orders.find((o) => o.id === stop.orderId)?.orderNumber || 'ORD-MANUAL',
      tripId: trip.id,
      tripNumber: trip.tripNumber,
      customerId: stop.customerId,
      customerName: stop.customerName,
      phone: stop.phone,
      district: stop.district,
      requestedLiters: stop.requestedLiters,
      deliveredLiters: stop.deliveredLiters,
      pricePerLiter: stop.pricePerLiter,
      totalAmount: stop.deliveredLiters * stop.pricePerLiter,
      paidAmount: stop.paidAmount,
      remainingAmount: stop.remainingAmount,
      paymentMethod: 'cash',
      createdAt: new Date().toISOString(),
      driverName: trip.driverName,
      isReconciled: false,
      notes: notes || '',
    };
    db.invoices.push(newInvoice);
    stop.invoiceId = newInvoice.id;

    const order = db.orders.find((o) => o.id === orderId);
    if (order) {
      order.status = 'delivered';
    }

    const customer = db.customers.find((c) => c.id === stop.customerId);
    if (customer) {
      customer.totalOrdersCount += 1;
      customer.totalLitersDelivered += stop.deliveredLiters;
      customer.tankRemainingLiters = 0; // Customer tank always assumed empty (0L)
    }

    const totalDelivered = trip.customerStops.reduce((sum, s) => sum + s.deliveredLiters, 0);
    trip.deliveredLiters = totalDelivered;
    trip.remainingLiters = Math.max(0, trip.initialLoadLiters - totalDelivered);
    db.truck.currentWaterLiters = trip.remainingLiters;

    appendAudit(
      trip,
      'driver',
      trip.driverName,
      'تسجيل تسليم مياه لعميل',
      `${stop.customerName}: ${stop.deliveredLiters} لتر (${stop.paidAmount.toLocaleString()} ر.ي)`
    );

    notifyAndBroadcast('delivery:logged', {
      targetRole: 'manager',
      actorRole: 'driver',
      actorName: trip.driverName,
      category: 'delivery_logged',
      priority: 'info',
      title: `تم تسليم مياه لـ ${stop.customerName} (${trip.tripNumber})`,
      message: `الكمية المسلمة: ${stop.deliveredLiters.toLocaleString()} لتر · المحصل نقداً: ${stop.paidAmount.toLocaleString()} ر.ي`,
      tripId: trip.id,
      tripNumber: trip.tripNumber,
      actionTab: 'trips',
    });

    saveDatabase();
    res.json({ success: true, data: { trip, invoice: newInvoice } });
  });

  // 7. Complete Trip Return to Plant -> 'completed_pending_review' (when synced online)
  router.post('/trips/:id/complete-return', (req: Request, res: Response) => {
    const cached = getIdempotentResponse(req.body?.clientRequestId);
    if (cached) return res.json(cached);

    const { id } = req.params;
    const { lat, lng, detectedAutomatically, actualDistanceKm, actualFuelLiters, gpsPoints, clientRequestId } = req.body || {};
    const trip = db.trips.find((t) => t.id === id);
    if (!trip) return res.status(404).json({ success: false, error: 'الرحلة غير موجودة' });

    if (trip.status === 'completed_pending_review' || trip.status === 'closed') {
      return res.json({ success: true, data: trip, deduplicated: true });
    }

    if (Array.isArray(gpsPoints) && gpsPoints.length > 0) {
      mergeGpsPointsIdempotent(trip, gpsPoints);
    }

    const originLat = trip.startLocation?.lat ?? db.settings.plantLocation.lat;
    const originLng = trip.startLocation?.lng ?? db.settings.plantLocation.lng;
    const retLat = Number(lat) || originLat;
    const retLng = Number(lng) || originLng;

    if (Boolean(detectedAutomatically)) {
      const readiness = evaluateTripCompletionReadiness({
        trip,
        settings: db.settings,
        candidateReturnLocation: { lat: retLat, lng: retLng },
      });
      if (!readiness.qualified) {
        saveDatabase();
        return res.status(422).json({
          success: false,
          rejectedPrematureReturn: true,
          reason: readiness.reason,
          error: readiness.reason,
        });
      }
    }

    const distFromOrigin = Math.round(
      haversineDistanceMeters(retLat, retLng, originLat, originLng)
    );
    const distFromPlant = Math.round(
      haversineDistanceMeters(retLat, retLng, db.settings.plantLocation.lat, db.settings.plantLocation.lng)
    );
    const measuredDist = Math.min(distFromOrigin, distFromPlant);
    const nowIso = new Date().toISOString();

    trip.returnedToPlantAt = trip.returnedToPlantAt || nowIso;
    trip.completedAt = nowIso;
    trip.lastSyncedAt = nowIso;
    trip.returnLocation = {
      lat: retLat,
      lng: retLng,
      distanceFromPlantMeters: measuredDist,
      detectedAutomatically: Boolean(detectedAutomatically),
    };
    trip.syncStatus = 'synced';
    trip.status = 'completed_pending_review';

    trip.actualDistanceKm = actualDistanceKm ?? trip.actualDistanceKm ?? trip.estimatedDistanceKm;
    trip.actualFuelLiters = actualFuelLiters ?? Number(((trip.actualDistanceKm || 0) * db.settings.truckDieselConsumptionPerKm).toFixed(2));

    const actualRevenue = trip.customerStops.reduce((sum, s) => sum + s.deliveredLiters * s.pricePerLiter, 0);
    const actualFuelCost = (trip.actualFuelLiters || trip.estimatedFuelLiters) * db.settings.dieselPricePerLiter;
    const actualProdCost = trip.deliveredLiters * db.settings.waterProductionCostPerLiter;
    const actualTotalCost = Math.round(actualFuelCost + actualProdCost + trip.driverWageShare + trip.maintenanceShare);

    trip.actualRevenue = actualRevenue;
    trip.actualCost = actualTotalCost;
    trip.actualProfit = actualRevenue - actualTotalCost;

    db.truck.status = 'idle';
    db.truck.currentTripId = undefined;
    db.truck.currentWaterLiters = 0;
    db.truck.lastEvent = 'RETURN_PLANT';
    db.truck.lastLat = retLat;
    db.truck.lastLng = retLng;
    db.truck.lastUpdateTimestamp = nowIso;
    db.truck.odometerKm += Math.round(trip.actualDistanceKm || 0);

    db.gpsEvents.push({
      id: `gps-ret-${Date.now()}`,
      tripId: trip.id,
      tripNumber: trip.tripNumber,
      timestamp: nowIso,
      eventType: 'RETURN_PLANT',
      lat: retLat,
      lng: retLng,
      speed: 0,
      source: 'gps_auto',
      sequenceNumber: db.gpsEvents.length + 1,
      isProcessed: true,
    });

    appendAudit(
      trip,
      'system',
      trip.driverName,
      'إيقاف التتبع تلقائياً عند العودة لنقطة الانطلاق',
      `المسافة المسجلة من نقطة الانطلاق عند العودة: ${measuredDist} م`
    );

    notifyAndBroadcast('trip:returned_to_plant', {
      targetRole: 'manager',
      actorRole: 'system',
      actorName: trip.driverName,
      category: 'trip_returned_plant',
      priority: 'action_required',
      title: `عاد السائق لنقطة الانطلاق وتوقف التتبع (${trip.tripNumber})`,
      message: `تم رصد عودة الوايت لنقطة الانطلاق وإيقاف التتبع التلقائي بمسافة ${trip.actualDistanceKm || 0} كم. يرجى المراجعة والإغلاق.`,
      tripId: trip.id,
      tripNumber: trip.tripNumber,
      actionTab: 'trips',
    });

    saveDatabase();
    const resp = { success: true, data: trip };
    saveIdempotentResponse(clientRequestId, resp);
    res.json(resp);
  });

  // Backwards-compatible alias /trips/:id/complete -> complete-return handler
  router.post('/trips/:id/complete', (req: Request, res: Response) => {
    const { id } = req.params;
    const trip = db.trips.find((t) => t.id === id);
    if (!trip) return res.status(404).json({ success: false, error: 'الرحلة غير موجودة' });

    const nowIso = new Date().toISOString();
    trip.returnedToPlantAt = nowIso;
    trip.completedAt = nowIso;
    trip.lastSyncedAt = nowIso;
    trip.syncStatus = 'synced';
    trip.status = 'completed_pending_review';
    trip.actualDistanceKm = req.body?.actualDistanceKm ?? trip.actualDistanceKm ?? trip.estimatedDistanceKm;

    const actualRevenue = trip.customerStops.reduce((sum, s) => sum + s.deliveredLiters * s.pricePerLiter, 0);
    const actualFuelLiters = req.body?.actualFuelLiters || Number(((trip.actualDistanceKm || 0) * db.settings.truckDieselConsumptionPerKm).toFixed(2));
    const actualTotalCost = Math.round(
      actualFuelLiters * db.settings.dieselPricePerLiter +
        trip.deliveredLiters * db.settings.waterProductionCostPerLiter +
        trip.driverWageShare +
        trip.maintenanceShare
    );
    trip.actualFuelLiters = actualFuelLiters;
    trip.actualRevenue = actualRevenue;
    trip.actualCost = actualTotalCost;
    trip.actualProfit = actualRevenue - actualTotalCost;

    db.truck.status = 'idle';
    db.truck.currentTripId = undefined;
    db.truck.currentWaterLiters = 0;
    db.truck.lastEvent = 'RETURN_PLANT';

    appendAudit(trip, 'manager', 'المدير العام', 'إنهاء الرحلة وتحويلها للمراجعة', 'بانتظار مراجعة المسار والتوقفات');
    broadcastWs({ type: 'state:updated', reason: 'trip:completed_pending_review' });
    saveDatabase();
    res.json({ success: true, data: trip });
  });

  // Manager closes completed trip after review -> 'closed'
  router.post('/trips/:id/close-review', (req: Request, res: Response) => {
    const trip = db.trips.find((t) => t.id === req.params.id);
    if (!trip) return res.status(404).json({ success: false, error: 'الرحلة غير موجودة' });

    if (trip.status !== 'completed_pending_review' && trip.status !== 'synced' && trip.status !== 'returned_to_plant') {
      return res.status(400).json({ success: false, error: 'يجب إتمام العودة والمزامنة قبل الإغلاق النهائي' });
    }

    const managerName = req.body?.managerName || 'المدير العام';
    trip.status = 'closed';
    trip.closedAt = new Date().toISOString();
    trip.closedBy = managerName;
    if (req.body?.reviewNotes) {
      trip.notes = trip.notes ? `${trip.notes} | مراجعة المدير: ${req.body.reviewNotes}` : `مراجعة المدير: ${req.body.reviewNotes}`;
    }
    appendAudit(trip, 'manager', managerName, 'اعتماد المراجعة وإغلاق الرحلة نهائياً', req.body?.reviewNotes || 'تمت مراجعة المسار الفعلي ونقاط التوقف');

    notifyAndBroadcast('trip:closed', {
      targetRole: 'driver',
      actorRole: 'manager',
      actorName: managerName,
      category: 'trip_closed',
      priority: 'info',
      title: `أغلق المدير مراجعة الرحلة ${trip.tripNumber}`,
      message: req.body?.reviewNotes || 'تمت مراجعة المسار والتوقفات وإغلاق الرحلة نهائياً',
      tripId: trip.id,
      tripNumber: trip.tripNumber,
    });

    saveDatabase();
    res.json({ success: true, data: trip });
  });

  // 8. Comprehensive Idempotent Offline-First Sync Endpoint
  router.post('/sync', (req: Request, res: Response) => {
    const {
      offlineTrips = [],
      gpsPoints = [],
      detectedStops = [],
      pendingDeliveries = [],
      pendingOrders = [],
      pendingCustomers = [],
      pendingDistricts = [],
      returnEvents = [],
      clientDemoResetVersion,
    } = req.body || {};

    const serverResetVersion = Number(db.settings.demoResetVersion || 0);
    if (
      serverResetVersion > 0 &&
      (typeof clientDemoResetVersion !== 'number' || clientDemoResetVersion < serverResetVersion)
    ) {
      return res.json({
        success: true,
        syncedCount: 0,
        demoResetRequired: true,
        demoResetVersion: serverResetVersion,
        acks: {
          tripIds: [],
          pointIds: [],
          stopIds: [],
          deliveryIds: [],
          orderIds: [],
          customerIds: [],
          districtNames: [],
          returnEventIds: [],
        },
        rejectedTamperPointIds: [],
        timestamp: new Date().toISOString(),
        updatedState: db,
      });
    }

    const acks = {
      tripIds: [] as string[],
      pointIds: [] as string[],
      stopIds: [] as string[],
      deliveryIds: [] as string[],
      orderIds: [] as string[],
      customerIds: [] as string[],
      districtNames: [] as string[],
      returnEventIds: [] as string[],
    };
    const rejectedTamperPointIds: string[] = [];

    // A. Sync offline trip updates for Manager-created trips AND offline auto-departure tracking trips (trip-auto-*)
    if (Array.isArray(offlineTrips)) {
      for (const offTrip of offlineTrips) {
        if (!offTrip || !offTrip.id) continue;
        let existing = db.trips.find((t) => t.id === offTrip.id);
        if (!existing) {
          if (typeof offTrip.id === 'string' && offTrip.id.startsWith('trip-auto-')) {
            const nowIso = new Date().toISOString();
            const tripSeq = db.trips.length + 1;
            const autoStatus: TripStatus =
              offTrip.status === 'pending_sync' ||
              offTrip.status === 'returned_to_plant' ||
              offTrip.status === 'completed_pending_review'
                ? 'completed_pending_review'
                : 'in_progress';
            const syncedAutoTrip: Trip = {
              id: offTrip.id,
              tripNumber: offTrip.tripNumber || `AUTO-2026-${String(tripSeq).padStart(4, '0')}`,
              date: offTrip.date || nowIso.split('T')[0],
              truckId: db.truck.id,
              driverId: offTrip.driverId || db.truck.driverId,
              driverName: offTrip.driverName || db.truck.driverName,
              truckPlate: db.truck.plateNumber,
              initialLoadLiters: 0,
              deliveredLiters: 0,
              remainingLiters: 0,
              status: autoStatus,
              syncStatus: 'synced',
              lastSyncedAt: nowIso,
              createdByRole: 'manager',
              driverAcceptanceStatus: 'accepted',
              driverRespondedAt: offTrip.startedAt || nowIso,
              customerStops: [],
              orderIds: [],
              proposedAt: offTrip.proposedAt || nowIso,
              approvedAt: offTrip.approvedAt || nowIso,
              approvedBy: 'رصد آلي (محيط المصنع - دون إنترنت)',
              startedAt: offTrip.startedAt || nowIso,
              startLocation: {
                lat: db.settings.plantLocation.lat,
                lng: db.settings.plantLocation.lng,
              },
              returnedToPlantAt: offTrip.returnedToPlantAt,
              completedAt: offTrip.completedAt,
              returnLocation: offTrip.returnLocation,
              gpsPoints: [],
              detectedStops: [],
              gpsGaps: [],
              auditLogs: [
                {
                  id: `aud-sync-auto-${Date.now()}`,
                  timestamp: nowIso,
                  actorRole: 'system',
                  actorName: 'المزامنة التلقائية',
                  action: 'مزامنة رحلة تتبع تلقائي (ابتعاد عن المصنع دون إنترنت)',
                  details: `تم إنشاء السجل ميدانياً أثناء انقطاع الإنترنت ومزامنته الآن`,
                },
              ],
              modificationRequests: [],
              estimatedDistanceKm: 0,
              estimatedFuelLiters: 0,
              fuelCost: 0,
              productionCost: 0,
              driverWageShare: db.settings.driverWagePerTrip,
              maintenanceShare: db.settings.maintenanceAllowancePerTrip,
              otherExpensesShare: 0,
              totalCost: db.settings.driverWagePerTrip + db.settings.maintenanceAllowancePerTrip,
              expectedRevenue: 0,
              expectedProfit: -(db.settings.driverWagePerTrip + db.settings.maintenanceAllowancePerTrip),
              profitMarginPercent: 0,
              capacityUtilizationPercent: 0,
              departureRecommendation: 'GO_NOW',
              recommendationReason: 'تتبع تلقائي عند ابتعاد الوايت عن محيط المصنع',
              notes: offTrip.notes || 'رحلة تتبع تلقائي مسجلة دون إنترنت عند الابتعاد عن محيط المصنع',
            };
            if (Array.isArray(offTrip.gpsPoints) && offTrip.gpsPoints.length > 0) {
              mergeGpsPointsIdempotent(syncedAutoTrip, offTrip.gpsPoints);
            }
            db.trips.unshift(syncedAutoTrip);
            existing = syncedAutoTrip;

            const firstPt = syncedAutoTrip.gpsPoints?.[0];
            db.gpsEvents.push({
              id: `gps-dep-sync-${Date.now()}-${acks.tripIds.length}`,
              tripId: syncedAutoTrip.id,
              tripNumber: syncedAutoTrip.tripNumber,
              timestamp: syncedAutoTrip.startedAt || nowIso,
              eventType: 'DEPARTURE',
              lat: firstPt?.lat ?? db.settings.plantLocation.lat,
              lng: firstPt?.lng ?? db.settings.plantLocation.lng,
              speed: firstPt?.speedKmH ?? 0,
              source: 'gps_auto',
              sequenceNumber: db.gpsEvents.length + 1,
              isProcessed: true,
            });

            if (autoStatus === 'in_progress') {
              db.truck.status = 'on_trip';
              db.truck.currentTripId = syncedAutoTrip.id;
              db.truck.lastEvent = 'DEPARTURE';
              db.truck.lastUpdateTimestamp = nowIso;
            }

            pushNotification({
              targetRole: 'manager',
              actorRole: 'system',
              actorName: syncedAutoTrip.driverName,
              category: 'gps_alert',
              priority: 'urgent',
              title: `تمت مزامنة تتبع تلقائي للوايت (${syncedAutoTrip.tripNumber})`,
              message: `ابتعد الوايت عن محيط المصنع وتم تسجيل المسار دون إنترنت ومزامنته الآن`,
              tripId: syncedAutoTrip.id,
              tripNumber: syncedAutoTrip.tripNumber,
              actionTab: 'trips',
            });

            acks.tripIds.push(syncedAutoTrip.id);
            continue;
          }
          // Reject/ignore any unauthorized driver-created offline trip plan
          acks.tripIds.push(offTrip.id);
          continue;
        }
        if (
          offTrip.status === 'pending_sync' ||
          offTrip.status === 'returned_to_plant' ||
          existing.status === 'returned_to_plant' ||
          existing.status === 'pending_sync'
        ) {
          if (existing.status === 'in_progress' || existing.status === 'returned_to_plant' || existing.status === 'pending_sync') {
            existing.status = 'completed_pending_review';
            existing.returnedToPlantAt = existing.returnedToPlantAt || offTrip.returnedToPlantAt || new Date().toISOString();
            existing.completedAt = existing.completedAt || offTrip.completedAt || new Date().toISOString();
          }
        }
        existing.syncStatus = 'synced';
        existing.lastSyncedAt = new Date().toISOString();
        acks.tripIds.push(existing.id);
      }
    }

    // B. Sync offline GPS points chronologically grouped by tripId (with tamper & dedup check)
    if (Array.isArray(gpsPoints) && gpsPoints.length > 0) {
      const byTrip = new Map<string, TripGPSPoint[]>();
      for (const pt of gpsPoints) {
        if (!pt || !pt.id || !pt.tripId) continue;
        if (!byTrip.has(pt.tripId)) byTrip.set(pt.tripId, []);
        byTrip.get(pt.tripId)!.push(pt);
      }

      for (const [tId, pts] of byTrip.entries()) {
        const trip = db.trips.find((t) => t.id === tId);
        if (!trip) continue;
        const { acceptedIds, rejectedTamperIds } = mergeGpsPointsIdempotent(trip, pts);
        acks.pointIds.push(...acceptedIds);
        rejectedTamperPointIds.push(...rejectedTamperIds);
        trip.syncStatus = 'synced';
        trip.lastSyncedAt = new Date().toISOString();
      }
    }

    // C. Acknowledge client detected stops (server already derives canonical stops from merged gpsPoints, plus retain client stops if no points)
    if (Array.isArray(detectedStops)) {
      for (const st of detectedStops) {
        if (!st || !st.id) continue;
        const trip = db.trips.find((t) => t.id === st.tripId);
        if (trip) {
          if ((!trip.gpsPoints || trip.gpsPoints.length === 0) && !(trip.detectedStops || []).some((s) => s.id === st.id)) {
            if (!trip.detectedStops) trip.detectedStops = [];
            trip.detectedStops.push(st);
          }
          acks.stopIds.push(st.id);
        }
      }
    }

    // D. Sync deliveries idempotently
    if (Array.isArray(pendingDeliveries)) {
      for (const del of pendingDeliveries) {
        if (!del || !del.id) continue;
        const trip = db.trips.find((t) => t.id === del.tripId || t.tripNumber === del.tripNumber);
        if (trip) {
          const stop = trip.customerStops.find((s) => s.orderId === del.orderId);
          if (stop) {
            if (stop.status !== 'delivered') {
              stop.deliveredLiters = Number(del.deliveredLiters);
              stop.paidAmount = Number(del.paidAmount);
              stop.remainingAmount = Number(del.remainingAmount);
              stop.status = 'delivered';
              stop.departureTime = del.timestamp;
              stop.notes = del.notes || stop.notes;

              const invSeq = db.invoices.length + 1;
              const newInvoice: Invoice = {
                id: `inv-${Date.now()}-${acks.deliveryIds.length}`,
                invoiceNumber: `INV-2026-${String(invSeq).padStart(4, '0')}`,
                orderId: stop.orderId,
                orderNumber: db.orders.find((o) => o.id === stop.orderId)?.orderNumber || 'ORD-SYNC',
                tripId: trip.id,
                tripNumber: trip.tripNumber,
                customerId: stop.customerId,
                customerName: stop.customerName,
                phone: stop.phone,
                district: stop.district,
                requestedLiters: stop.requestedLiters,
                deliveredLiters: stop.deliveredLiters,
                pricePerLiter: stop.pricePerLiter,
                totalAmount: stop.deliveredLiters * stop.pricePerLiter,
                paidAmount: stop.paidAmount,
                remainingAmount: stop.remainingAmount,
                paymentMethod: 'cash',
                createdAt: del.timestamp || new Date().toISOString(),
                driverName: trip.driverName,
                isReconciled: false,
                notes: del.notes,
              };
              db.invoices.push(newInvoice);
              stop.invoiceId = newInvoice.id;

              const order = db.orders.find((o) => o.id === del.orderId);
              if (order) order.status = 'delivered';

              const totalDelivered = trip.customerStops.reduce((sum, s) => sum + s.deliveredLiters, 0);
              trip.deliveredLiters = totalDelivered;
              trip.remainingLiters = Math.max(0, trip.initialLoadLiters - totalDelivered);
            }
            acks.deliveryIds.push(del.id);
          }
        }
      }
    }

    // D2. Sync custom districts first so all subsequent records reference valid saved districts
    if (Array.isArray(pendingDistricts)) {
      for (const rawDist of pendingDistricts) {
        if (typeof rawDist !== 'string') continue;
        registerCustomDistrict(rawDist);
        acks.districtNames.push(rawDist);
      }
    }

    // E1. Sync offline customers FIRST so linked orders immediately match them
    if (Array.isArray(pendingCustomers)) {
      for (const offCust of pendingCustomers) {
        if (!offCust || !offCust.id) continue;
        const cleanDistrict = registerCustomDistrict(offCust.district) || DEFAULT_AL_WADI_DISTRICT;
        const already = db.customers.some(
          (c) =>
            c.id === offCust.id ||
            (c.name.trim() === String(offCust.name || '').trim() &&
              c.phone.trim() === String(offCust.phone || '').trim() &&
              c.createdAt === offCust.createdAt)
        );
        if (!already) {
          const custSeq = db.customers.length + 1;
          const newCust: Customer = {
            id: offCust.id,
            customerId: `CUST-${String(custSeq).padStart(4, '0')}`,
            name: String(offCust.name || '').trim() || 'عميل جديد',
            phone: String(offCust.phone || '').trim(),
            altPhone: '',
            district: cleanDistrict,
            addressDetails: String(offCust.addressDetails || '').trim(),
            lat: Number(offCust.lat) || db.settings.plantLocation.lat + 0.005,
            lng: Number(offCust.lng) || db.settings.plantLocation.lng + 0.005,
            tankCapacityLiters: Number(offCust.tankCapacityLiters) || 2000,
            tankRemainingLiters: 0,
            notes: offCust.notes || '',
            createdAt: offCust.createdAt || new Date().toISOString(),
            isActive: true,
            totalOrdersCount: 0,
            totalLitersDelivered: 0,
            isOfflineCreated: true,
          };
          db.customers.unshift(newCust);
        }
        acks.customerIds.push(offCust.id);
      }
    }

    // E2. Sync offline orders idempotently by order ID & auto-ensure customer + custom district
    if (Array.isArray(pendingOrders)) {
      for (const offOrd of pendingOrders) {
        if (!offOrd || !offOrd.id) continue;
        const already = db.orders.some((o) => o.id === offOrd.id);
        if (!already) {
          const ensured = ensureCustomerRecord(
            {
              customerId: offOrd.customerId,
              newCustomerId: offOrd.customerId && offOrd.customerId !== 'cust-offline' ? offOrd.customerId : undefined,
              customerName: offOrd.customerName,
              phone: offOrd.phone,
              district: offOrd.district,
              addressDetails: offOrd.addressDetails,
              lat: offOrd.lat,
              lng: offOrd.lng,
              tankCapacity: offOrd.tankCapacity,
              createdAt: offOrd.createdAt,
              isOfflineCreated: true,
            },
            'driver',
            offOrd.actorName || db.truck.driverName
          );
          const orderSeq = db.orders.length + 1;
          const newOrder: Order = {
            id: offOrd.id,
            orderNumber: `ORD-2026-${String(orderSeq).padStart(4, '0')}`,
            customerId: ensured.customer.id,
            customerName: offOrd.customerName,
            phone: offOrd.phone,
            district: ensured.district,
            addressDetails: offOrd.addressDetails || '',
            lat: Number(offOrd.lat) || db.settings.plantLocation.lat + 0.006,
            lng: Number(offOrd.lng) || db.settings.plantLocation.lng + 0.006,
            tankCapacity: offOrd.tankCapacity || 2000,
            tankRemainingLiters: 0,
            requestedLiters: offOrd.requestedLiters,
            pricePerLiter: offOrd.pricePerLiter || db.settings.defaultSellingPricePerLiter,
            totalAmount: offOrd.totalAmount,
            source: 'driver_manual',
            createdAt: offOrd.createdAt || new Date().toISOString(),
            status: 'waiting_clustering',
            isUrgent: Boolean(offOrd.isUrgent),
            notes: offOrd.notes ? `[مسجل من السائق دون إنترنت] ${offOrd.notes}` : '[مسجل من السائق دون إنترنت]',
          };
          db.orders.unshift(newOrder);
        }
        acks.orderIds.push(offOrd.id);
      }
    }

    // F. Sync return-to-plant confirmation events -> moves trip into 'completed_pending_review'
    if (Array.isArray(returnEvents)) {
      for (const ret of returnEvents) {
        if (!ret || !ret.id || !ret.tripId) continue;
        const trip = db.trips.find((t) => t.id === ret.tripId);
        if (trip) {
          if (Boolean(ret.detectedAutomatically)) {
            const readiness = evaluateTripCompletionReadiness({
              trip,
              settings: db.settings,
              candidateReturnLocation: {
                lat: Number(ret.lat) || db.settings.plantLocation.lat,
                lng: Number(ret.lng) || db.settings.plantLocation.lng,
              },
            });
            if (!readiness.qualified) {
              acks.returnEventIds.push(ret.id);
              continue;
            }
          }

          trip.returnedToPlantAt = ret.returnedAt || new Date().toISOString();
          trip.completedAt = ret.returnedAt || new Date().toISOString();
          trip.returnLocation = {
            lat: Number(ret.lat) || db.settings.plantLocation.lat,
            lng: Number(ret.lng) || db.settings.plantLocation.lng,
            distanceFromPlantMeters: Number(ret.distanceFromPlantMeters) || 0,
            detectedAutomatically: Boolean(ret.detectedAutomatically),
          };
          trip.syncStatus = 'synced';
          trip.lastSyncedAt = new Date().toISOString();
          if (trip.status !== 'closed') {
            trip.status = 'completed_pending_review';
          }

          const actualRevenue = trip.customerStops.reduce((sum, s) => sum + s.deliveredLiters * s.pricePerLiter, 0);
          const actualFuelLiters = Number(((trip.actualDistanceKm || trip.estimatedDistanceKm) * db.settings.truckDieselConsumptionPerKm).toFixed(2));
          const actualTotalCost = Math.round(
            actualFuelLiters * db.settings.dieselPricePerLiter +
              trip.deliveredLiters * db.settings.waterProductionCostPerLiter +
              trip.driverWageShare +
              trip.maintenanceShare
          );
          trip.actualFuelLiters = actualFuelLiters;
          trip.actualRevenue = actualRevenue;
          trip.actualCost = actualTotalCost;
          trip.actualProfit = actualRevenue - actualTotalCost;

          db.truck.status = 'idle';
          db.truck.currentTripId = undefined;
          db.truck.currentWaterLiters = 0;
          db.truck.lastEvent = 'RETURN_PLANT';
          db.truck.lastLat = trip.returnLocation.lat;
          db.truck.lastLng = trip.returnLocation.lng;

          appendAudit(
            trip,
            'system',
            'المزامنة التلقائية',
            'تمت مزامنة رحلة العودة إلى المصنع وهي بانتظار مراجعة المدير',
            `نقاط GPS: ${(trip.gpsPoints || []).length}، التوقفات: ${(trip.detectedStops || []).length}`
          );
          acks.returnEventIds.push(ret.id);
        }
      }
    }

    const totalSynced =
      acks.tripIds.length +
      acks.pointIds.length +
      acks.stopIds.length +
      acks.deliveryIds.length +
      acks.orderIds.length +
      acks.customerIds.length +
      acks.districtNames.length +
      acks.returnEventIds.length;

    if (totalSynced > 0) {
      notifyAndBroadcast('offline:synced', {
        targetRole: 'manager',
        actorRole: 'driver',
        actorName: db.truck.driverName,
        category: 'sync_completed',
        priority: acks.returnEventIds.length > 0 ? 'action_required' : 'info',
        title: `مزامنة فورية من تطبيق السائق (${totalSynced} سجل)`,
        message: `تمت مزامنة ${acks.pointIds.length} نقطة GPS، ${acks.deliveryIds.length} تسليمات، ${acks.orderIds.length} طلبات، ${acks.customerIds.length} زبائن، ${acks.returnEventIds.length} رحلة عودة`,
        tripId: acks.tripIds[0] || returnEvents[0]?.tripId,
        actionTab: acks.orderIds.length > 0 && acks.tripIds.length === 0 ? 'orders' : 'trips',
      });
    }

    saveDatabase();
    res.json({
      success: true,
      syncedCount: totalSynced,
      acks,
      rejectedTamperPointIds,
      timestamp: new Date().toISOString(),
      updatedState: db,
    });
  });

  // 9. Financial Reconciliation
  router.get('/reconciliations', (_req: Request, res: Response) => {
    res.json({ success: true, data: db.reconciliations });
  });

  router.post('/reconciliations', (req: Request, res: Response) => {
    const payload = req.body || {};
    const cached = getIdempotentResponse(payload.clientRequestId);
    if (cached) return res.json(cached);

    if (payload.tripId && db.reconciliations.some((r) => r.tripId === payload.tripId)) {
      const existing = db.reconciliations.find((r) => r.tripId === payload.tripId);
      return res.json({ success: true, data: existing, deduplicated: true });
    }

    const recSeq = db.reconciliations.length + 1;
    const recNumber = `REC-2026-${String(recSeq).padStart(4, '0')}`;

    const totalCashCollected = Number(payload.totalCashCollected) || 0;
    const actualCashHandedOver = Number(payload.actualCashHandedOver) || 0;
    const authorizedExpenses = Number(payload.authorizedExpensesDeducted) || 0;
    const difference = actualCashHandedOver + authorizedExpenses - totalCashCollected;

    const newRec: DriverReconciliation = {
      id: `rec-${Date.now()}`,
      reconciliationNumber: recNumber,
      tripId: payload.tripId,
      tripNumber: payload.tripNumber,
      driverId: payload.driverId || db.truck.driverId,
      driverName: payload.driverName || db.truck.driverName,
      date: new Date().toISOString().split('T')[0],
      totalInvoicedAmount: Number(payload.totalInvoicedAmount) || totalCashCollected,
      totalCashCollected,
      actualCashHandedOver,
      authorizedExpensesDeducted: authorizedExpenses,
      differenceAmount: difference,
      status: Math.abs(difference) <= 50 ? 'approved_reconciled' : 'discrepancy',
      notes: payload.notes || '',
      approvedBy: payload.approvedBy || 'المدير العام',
      createdAt: new Date().toISOString(),
    };

    db.reconciliations.unshift(newRec);

    const trip = db.trips.find((t) => t.id === payload.tripId);
    if (trip) {
      const closedBy = payload.approvedBy || 'المدير العام';
      trip.status = 'closed';
      trip.reconciledAt = new Date().toISOString();
      trip.closedAt = trip.closedAt || new Date().toISOString();
      trip.closedBy = closedBy;
      appendAudit(trip, 'manager', closedBy, 'تسوية العهدة النقدية وإغلاق الرحلة', `الفارق: ${difference} ر.ي`);
    }

    for (const inv of db.invoices) {
      if (inv.tripId === payload.tripId) {
        inv.isReconciled = true;
      }
    }

    saveDatabase();
    broadcastWs({ type: 'state:updated', reason: 'reconciliation:created' });
    const resp = { success: true, data: newRec };
    saveIdempotentResponse(payload.clientRequestId, resp);
    res.json(resp);
  });

  // 10. Expenses
  router.get('/expenses', (_req: Request, res: Response) => {
    res.json({ success: true, data: db.expenses });
  });

  router.post('/expenses', (req: Request, res: Response) => {
    const payload = req.body || {};
    const cached = getIdempotentResponse(payload.clientRequestId);
    if (cached) return res.json(cached);

    const cleanDesc = String(payload.description || '').trim();
    const numAmount = Number(payload.amount);
    const recentExactExp = db.expenses.find(
      (e) =>
        e.description.trim() === cleanDesc &&
        e.amount === numAmount &&
        e.category === (payload.category || 'other') &&
        e.date === (payload.date || new Date().toISOString().split('T')[0]) &&
        e.id.startsWith('exp-') &&
        Date.now() - Number(e.id.split('-')[1] || 0) < 8000
    );
    if (recentExactExp) {
      return res.json({ success: true, data: recentExactExp, deduplicated: true });
    }

    const expSeq = db.expenses.length + 1;
    const newExpense: Expense = {
      id: `exp-${Date.now()}`,
      expenseNumber: `EXP-2026-${String(expSeq).padStart(4, '0')}`,
      date: payload.date || new Date().toISOString().split('T')[0],
      category: payload.category || 'other',
      description: cleanDesc,
      amount: numAmount,
      liters: payload.liters ? Number(payload.liters) : undefined,
      tripId: payload.tripId,
      tripNumber: payload.tripNumber,
      receiptNumber: payload.receiptNumber || '',
      createdBy: payload.createdBy || 'المدير العام',
    };
    db.expenses.unshift(newExpense);
    broadcastWs({ type: 'state:updated', reason: 'expense:created' });
    saveDatabase();
    const resp = { success: true, data: newExpense };
    saveIdempotentResponse(payload.clientRequestId, resp);
    res.json(resp);
  });

  // 11. Settings & Truck
  router.get('/settings', (_req: Request, res: Response) => {
    res.json({ success: true, data: db.settings });
  });

  router.put('/settings', (req: Request, res: Response) => {
    const {
      sabafonCenterNumber: _s1,
      driverSabafonNumber: _s2,
      periodicHeartbeatMinutes: _s3,
      ...cleanIncoming
    } = req.body || {};
    db.settings = { ...db.settings, ...cleanIncoming };
    if (cleanIncoming.plantLocation && db.truck.status === 'idle') {
      db.truck.lastLat = db.settings.plantLocation.lat;
      db.truck.lastLng = db.settings.plantLocation.lng;
    }
    broadcastWs({ type: 'state:updated', reason: 'settings:updated' });
    saveDatabase();
    res.json({ success: true, data: db.settings });
  });

  router.put('/truck', (req: Request, res: Response) => {
    db.truck = { ...db.truck, ...req.body };
    broadcastWs({ type: 'state:updated', reason: 'truck:updated' });
    saveDatabase();
    res.json({ success: true, data: db.truck });
  });

  // 12. Real-Time Notifications & Manager->Driver Directives APIs
  router.get('/notifications', (req: Request, res: Response) => {
    const role = req.query.role;
    const list =
      role === 'manager' || role === 'driver'
        ? db.notifications.filter((n) => n.targetRole === role)
        : db.notifications;
    res.json({ success: true, data: list, presence: getPresenceSnapshot() });
  });

  router.post('/notifications/mark-read', (req: Request, res: Response) => {
    const { ids, role, markAll } = req.body || {};
    const idSet = Array.isArray(ids) ? new Set<string>(ids) : null;
    for (const n of db.notifications) {
      if (markAll && (!role || n.targetRole === role)) {
        n.isRead = true;
      } else if (idSet && idSet.has(n.id)) {
        n.isRead = true;
      }
    }
    saveDatabase();
    broadcastWs({ type: 'state:updated', reason: 'notifications:read' });
    res.json({ success: true, data: db.notifications });
  });

  router.get('/directives', (_req: Request, res: Response) => {
    res.json({ success: true, data: db.directives });
  });

  router.post('/directives', (req: Request, res: Response) => {
    const { title, message, priority, tripId, tripNumber, customerId, customerName, createdBy, clientRequestId } = req.body || {};
    const cached = getIdempotentResponse(clientRequestId);
    if (cached) return res.json(cached);

    if (!title || !message) {
      return res.status(400).json({ success: false, error: 'يرجى كتابة عنوان التوجيه وتفاصيله' });
    }
    const cleanTitle = String(title).trim();
    const cleanMessage = String(message).trim();
    const eightSecAgo = Date.now() - 8 * 1000;
    const rapidDir = db.directives.find(
      (d) => d.title === cleanTitle && d.message === cleanMessage && new Date(d.createdAt).getTime() > eightSecAgo
    );
    if (rapidDir) {
      return res.json({ success: true, data: rapidDir, deduplicated: true });
    }

    const directive: ManagerDirective = {
      id: `dir-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      createdAt: new Date().toISOString(),
      createdBy: createdBy || 'المدير العام',
      title: cleanTitle,
      message: cleanMessage,
      priority: priority === 'urgent' ? 'urgent' : 'normal',
      tripId,
      tripNumber,
      customerId,
      customerName,
      status: 'sent',
    };
    db.directives.unshift(directive);
    if (db.directives.length > 100) db.directives = db.directives.slice(0, 100);

    notifyAndBroadcast('directive:created', {
      targetRole: 'driver',
      actorRole: 'manager',
      actorName: directive.createdBy,
      category: 'directive',
      priority: directive.priority === 'urgent' ? 'urgent' : 'action_required',
      title: `توجيه من المدير: ${directive.title}`,
      message: directive.message,
      tripId: directive.tripId,
      tripNumber: directive.tripNumber,
      directiveId: directive.id,
    });

    saveDatabase();
    const resp = { success: true, data: directive };
    saveIdempotentResponse(clientRequestId, resp);
    res.json(resp);
  });

  router.post('/directives/:id/acknowledge', (req: Request, res: Response) => {
    const directive = db.directives.find((d) => d.id === req.params.id);
    if (!directive) return res.status(404).json({ success: false, error: 'التوجيه غير موجود' });

    if (directive.status === 'sent') {
      directive.status = 'acknowledged';
      directive.acknowledgedAt = new Date().toISOString();
    }
    if (req.body?.driverReply) {
      directive.driverReply = String(req.body.driverReply);
    }

    // Mark related driver notification as read
    for (const n of db.notifications) {
      if (n.directiveId === directive.id && n.targetRole === 'driver') {
        n.isRead = true;
      }
    }

    notifyAndBroadcast('directive:acknowledged', {
      targetRole: 'manager',
      actorRole: 'driver',
      actorName: req.body?.driverName || db.truck.driverName,
      category: 'directive',
      priority: 'info',
      title: `استلم السائق توجيهك: ${directive.title}`,
      message: directive.driverReply || 'أكد السائق استلام التوجيه وبدأ العمل عليه الآن',
      tripId: directive.tripId,
      tripNumber: directive.tripNumber,
      directiveId: directive.id,
      actionTab: 'trips',
    });

    saveDatabase();
    res.json({ success: true, data: directive });
  });

  router.post('/directives/:id/complete', (req: Request, res: Response) => {
    const directive = db.directives.find((d) => d.id === req.params.id);
    if (!directive) return res.status(404).json({ success: false, error: 'التوجيه غير موجود' });

    directive.status = 'completed';
    directive.acknowledgedAt = directive.acknowledgedAt || new Date().toISOString();
    directive.completedAt = new Date().toISOString();
    if (req.body?.driverReply) {
      directive.driverReply = String(req.body.driverReply);
    }

    for (const n of db.notifications) {
      if (n.directiveId === directive.id && n.targetRole === 'driver') {
        n.isRead = true;
      }
    }

    notifyAndBroadcast('directive:completed', {
      targetRole: 'manager',
      actorRole: 'driver',
      actorName: req.body?.driverName || db.truck.driverName,
      category: 'directive',
      priority: 'info',
      title: `أنجز السائق التوجيه: ${directive.title}`,
      message: directive.driverReply || 'أفاد السائق بإتمام المهمة المطلوبة من المدير',
      tripId: directive.tripId,
      tripNumber: directive.tripNumber,
      directiveId: directive.id,
      actionTab: 'trips',
    });

    saveDatabase();
    res.json({ success: true, data: directive });
  });

  // 12B. Driver Accounts Management & Manager Approval with Passwords
  router.get('/drivers', (_req: Request, res: Response) => {
    res.json({ success: true, data: db.driverAccounts });
  });

  // Manager creates an approved driver account directly
  router.post('/drivers', (req: Request, res: Response) => {
    const { name, phone, username, password, licenseNumber, assignToTruck, clientRequestId } = req.body || {};
    const cached = getIdempotentResponse(clientRequestId);
    if (cached) return res.json(cached);

    const cleanName = String(name || '').trim();
    const cleanPhone = String(phone || '').trim();
    const cleanUsername = String(username || cleanPhone).trim().toLowerCase();
    const cleanPassword = String(password || '').trim();

    if (!cleanName || !cleanPhone || cleanPassword.length < 4) {
      return res.status(400).json({
        success: false,
        error: 'يرجى إدخال اسم السائق ورقم الهاتف وكلمة مرور لا تقل عن 4 أحرف/أرقام',
      });
    }

    const duplicate = db.driverAccounts.find(
      (d) => d.username.toLowerCase() === cleanUsername || d.phone === cleanPhone
    );
    if (duplicate) {
      return res.status(409).json({
        success: false,
        error: 'يوجد حساب سائق مسجل مسبقاً بنفس اسم المستخدم أو رقم الهاتف',
      });
    }

    const nowIso = new Date().toISOString();
    const newAccount: DriverAccount = {
      id: `drv-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: cleanName,
      username: cleanUsername,
      phone: cleanPhone,
      password: cleanPassword,
      licenseNumber: licenseNumber ? String(licenseNumber).trim() : undefined,
      status: 'approved',
      createdAt: nowIso,
      createdBy: 'manager',
      approvedAt: nowIso,
      approvedBy: 'المدير العام',
      isDemo: false,
    };

    db.driverAccounts.unshift(newAccount);

    if (assignToTruck || !db.truck.driverId) {
      db.truck.driverId = newAccount.id;
      db.truck.driverName = newAccount.name;
      db.truck.driverPhone = newAccount.phone;
    }

    saveDatabase();
    broadcastWs({ type: 'state:updated', reason: 'driver:account_created' });
    const resp = { success: true, data: newAccount };
    saveIdempotentResponse(clientRequestId, resp);
    res.json(resp);
  });

  // Driver submits registration request -> status 'pending' until Manager approves
  router.post('/drivers/register', (req: Request, res: Response) => {
    const { name, phone, username, password, licenseNumber, clientRequestId } = req.body || {};
    const cached = getIdempotentResponse(clientRequestId);
    if (cached) return res.json(cached);
    const cleanName = String(name || '').trim();
    const cleanPhone = String(phone || '').trim();
    const cleanUsername = String(username || cleanPhone).trim().toLowerCase();
    const cleanPassword = String(password || '').trim();

    if (!cleanName || !cleanPhone || cleanPassword.length < 4) {
      return res.status(400).json({
        success: false,
        error: 'يرجى إدخال الاسم الكامل ورقم الهاتف وكلمة مرور (4 أحرف/أرقام على الأقل)',
      });
    }

    const duplicate = db.driverAccounts.find(
      (d) => d.username.toLowerCase() === cleanUsername || d.phone === cleanPhone
    );
    if (duplicate) {
      return res.status(409).json({
        success: false,
        error:
          duplicate.status === 'pending'
            ? 'طلب إنشاء هذا الحساب مسجل مسبقاً وبانتظار اعتماد المدير'
            : 'يوجد حساب مسجل مسبقاً بنفس رقم الهاتف أو اسم المستخدم',
      });
    }

    const nowIso = new Date().toISOString();
    const pendingAccount: DriverAccount = {
      id: `drv-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: cleanName,
      username: cleanUsername,
      phone: cleanPhone,
      password: cleanPassword,
      licenseNumber: licenseNumber ? String(licenseNumber).trim() : undefined,
      status: 'pending',
      createdAt: nowIso,
      createdBy: 'driver_self',
      isDemo: false,
    };

    db.driverAccounts.unshift(pendingAccount);
    notifyAndBroadcast('driver:account_requested', {
      targetRole: 'manager',
      actorRole: 'driver',
      actorName: cleanName,
      category: 'driver_account_requested',
      priority: 'action_required',
      title: `طلب اعتماد حساب سائق جديد: ${cleanName}`,
      message: `الهاتف: ${cleanPhone} · اسم الدخول: ${cleanUsername} — بانتظار موافقة واعتماد المدير`,
      actionTab: 'driver_mgmt',
    });
    saveDatabase();
    const resp = { success: true, data: pendingAccount };
    saveIdempotentResponse(clientRequestId, resp);
    res.json(resp);
  });

  // Driver login verification (requires approved status + valid password)
  router.post('/drivers/login', (req: Request, res: Response) => {
    const { usernameOrPhone, password } = req.body || {};
    const identifier = String(usernameOrPhone || '').trim().toLowerCase();
    const cleanPass = String(password || '').trim();

    if (!identifier || !cleanPass) {
      return res.status(400).json({
        success: false,
        error: 'يرجى إدخال رقم الهاتف أو اسم المستخدم وكلمة المرور',
      });
    }

    const account = db.driverAccounts.find(
      (d) => d.username.toLowerCase() === identifier || d.phone.trim().toLowerCase() === identifier
    );

    if (!account || account.password !== cleanPass) {
      return res.status(401).json({
        success: false,
        error: 'اسم المستخدم/رقم الهاتف أو كلمة المرور غير صحيحة',
      });
    }

    if (account.status === 'pending') {
      return res.status(403).json({
        success: false,
        error: 'حسابك مسجل بنجاح ولكنه بانتظار اعتماد وموافقة المدير العام قبل السماح بالدخول.',
      });
    }
    if (account.status === 'rejected') {
      return res.status(403).json({
        success: false,
        error: `تم رفض طلب حسابك من قبل الإدارة${account.rejectionReason ? `: ${account.rejectionReason}` : '.'}`,
      });
    }
    if (account.status === 'suspended') {
      return res.status(403).json({
        success: false,
        error: 'تم إيقاف هذا الحساب مؤقتاً من قبل المدير العام.',
      });
    }

    const nowIso = new Date().toISOString();
    account.lastLoginAt = nowIso;

    if (db.truck.status !== 'on_trip') {
      db.truck.driverId = account.id;
      db.truck.driverName = account.name;
      db.truck.driverPhone = account.phone;
    }

    saveDatabase();
    broadcastWs({ type: 'state:updated', reason: 'driver:logged_in' });
    res.json({
      success: true,
      data: {
        id: account.id,
        name: account.name,
        username: account.username,
        phone: account.phone,
        licenseNumber: account.licenseNumber,
        loggedInAt: nowIso,
        isDemo: account.isDemo,
      },
    });
  });

  router.post('/drivers/:id/approve', (req: Request, res: Response) => {
    const acc = db.driverAccounts.find((d) => d.id === req.params.id);
    if (!acc) return res.status(404).json({ success: false, error: 'حساب السائق غير موجود' });

    const nowIso = new Date().toISOString();
    const approverName = String(req.body?.managerName || 'المدير العام');
    acc.status = 'approved';
    acc.approvedAt = nowIso;
    acc.approvedBy = approverName;
    acc.rejectionReason = undefined;

    if (!db.truck.driverId || db.truck.status === 'idle') {
      db.truck.driverId = acc.id;
      db.truck.driverName = acc.name;
      db.truck.driverPhone = acc.phone;
    }

    notifyAndBroadcast('driver:account_approved', {
      targetRole: 'driver',
      actorRole: 'manager',
      actorName: approverName,
      category: 'driver_account_approved',
      priority: 'info',
      title: `تم اعتماد حساب السائق: ${acc.name}`,
      message: `يمكن للسائق ${acc.name} الآن تسجيل الدخول برقم ${acc.username} والبدء بالعمل`,
    });
    saveDatabase();
    res.json({ success: true, data: acc });
  });

  router.post('/drivers/:id/reject', (req: Request, res: Response) => {
    const acc = db.driverAccounts.find((d) => d.id === req.params.id);
    if (!acc) return res.status(404).json({ success: false, error: 'حساب السائق غير موجود' });

    const reason = String(req.body?.reason || 'مرفوض من المدير العام').trim();
    acc.status = 'rejected';
    acc.rejectedAt = new Date().toISOString();
    acc.rejectionReason = reason;

    saveDatabase();
    broadcastWs({ type: 'state:updated', reason: 'driver:account_rejected' });
    res.json({ success: true, data: acc });
  });

  router.post('/drivers/:id/toggle-suspend', (req: Request, res: Response) => {
    const acc = db.driverAccounts.find((d) => d.id === req.params.id);
    if (!acc) return res.status(404).json({ success: false, error: 'حساب السائق غير موجود' });

    acc.status = acc.status === 'suspended' ? 'approved' : 'suspended';
    if (acc.status === 'approved') {
      acc.approvedAt = acc.approvedAt || new Date().toISOString();
      acc.approvedBy = req.body?.managerName || 'المدير العام';
    }
    saveDatabase();
    broadcastWs({ type: 'state:updated', reason: 'driver:account_status_changed' });
    res.json({ success: true, data: acc });
  });

  router.post('/drivers/:id/assign-truck', (req: Request, res: Response) => {
    const acc = db.driverAccounts.find((d) => d.id === req.params.id);
    if (!acc) return res.status(404).json({ success: false, error: 'حساب السائق غير موجود' });
    if (acc.status !== 'approved') {
      return res.status(400).json({ success: false, error: 'يجب اعتماد حساب السائق أولاً قبل تعيينه للوايت' });
    }
    db.truck.driverId = acc.id;
    db.truck.driverName = acc.name;
    db.truck.driverPhone = acc.phone;
    saveDatabase();
    broadcastWs({ type: 'state:updated', reason: 'driver:assigned_to_truck' });
    res.json({ success: true, data: db.truck });
  });

  router.put('/drivers/:id', (req: Request, res: Response) => {
    const idx = db.driverAccounts.findIndex((d) => d.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'حساب السائق غير موجود' });

    const { name, phone, username, password, licenseNumber, status } = req.body || {};
    const current = db.driverAccounts[idx];
    const nextUsername = username !== undefined ? String(username).trim().toLowerCase() : current.username;
    const nextPhone = phone !== undefined ? String(phone).trim() : current.phone;

    const dup = db.driverAccounts.find(
      (d) => d.id !== current.id && (d.username.toLowerCase() === nextUsername || d.phone === nextPhone)
    );
    if (dup) {
      return res.status(409).json({
        success: false,
        error: 'اسم المستخدم أو رقم الهاتف مستخدم بالفعل لسائق آخر',
      });
    }

    if (password !== undefined && String(password).trim().length < 4) {
      return res.status(400).json({
        success: false,
        error: 'كلمة المرور يجب أن لا تقل عن 4 أحرف/أرقام',
      });
    }

    const updated: DriverAccount = {
      ...current,
      name: name !== undefined ? String(name).trim() || current.name : current.name,
      phone: nextPhone || current.phone,
      username: nextUsername || current.username,
      password: password !== undefined ? String(password).trim() : current.password,
      licenseNumber: licenseNumber !== undefined ? String(licenseNumber).trim() : current.licenseNumber,
      status: status || current.status,
    };
    db.driverAccounts[idx] = updated;

    if (db.truck.driverId === updated.id) {
      db.truck.driverName = updated.name;
      db.truck.driverPhone = updated.phone;
    }

    saveDatabase();
    broadcastWs({ type: 'state:updated', reason: 'driver:account_updated' });
    res.json({ success: true, data: updated });
  });

  router.delete('/drivers/:id', (req: Request, res: Response) => {
    const idx = db.driverAccounts.findIndex((d) => d.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'حساب السائق غير موجود' });

    const [removed] = db.driverAccounts.splice(idx, 1);
    if (db.truck.driverId === removed.id) {
      const nextApproved = db.driverAccounts.find((d) => d.status === 'approved');
      db.truck.driverId = nextApproved?.id || '';
      db.truck.driverName = nextApproved?.name || 'غير معين';
      db.truck.driverPhone = nextApproved?.phone || '';
    }

    saveDatabase();
    broadcastWs({ type: 'state:updated', reason: 'driver:account_deleted' });
    res.json({ success: true });
  });

  // 12b. Hydrate Express Server DB from Cloud Firestore Snapshot
  router.post('/cloud-hydrate', (req: Request, res: Response) => {
    try {
      const payload = req.body || {};
      const candidateRaw = {
        customers: Array.isArray(payload.customers) ? payload.customers : db.customers,
        orders: Array.isArray(payload.orders) ? payload.orders : db.orders,
        trips: Array.isArray(payload.trips) ? payload.trips : db.trips,
        invoices: Array.isArray(payload.invoices) ? payload.invoices : db.invoices,
        reconciliations: Array.isArray(payload.reconciliations) ? payload.reconciliations : db.reconciliations,
        expenses: Array.isArray(payload.expenses) ? payload.expenses : db.expenses,
        gpsEvents: Array.isArray(payload.gpsEvents) ? payload.gpsEvents : db.gpsEvents,
        notifications: Array.isArray(payload.notifications) ? payload.notifications : db.notifications,
        directives: Array.isArray(payload.directives) ? payload.directives : db.directives,
        driverAccounts: Array.isArray(payload.driverAccounts) ? payload.driverAccounts : db.driverAccounts,
        truck: payload.truck && typeof payload.truck === 'object' ? payload.truck : db.truck,
        settings: payload.settings && typeof payload.settings === 'object' ? payload.settings : db.settings,
      };
      const { migrated } = migrateDatabase(candidateRaw);
      db = migrated;
      saveDatabase();
      if (payload.broadcast === true) {
        broadcastWs({ type: 'state:updated', reason: 'cloud:hydrated' });
      }
      res.json({ success: true, data: db });
    } catch (err) {
      console.error('[Miyahna Cloud Hydrate] Error:', err);
      res.status(500).json({ success: false, error: 'تعذر مزامنة الحالة السحابية مع الخادم' });
    }
  });

  // 13. Clear / Reset Operational Records (Demo mode permanently disabled in production)
  router.post('/reset-demo', (_req: Request, res: Response) => {
    res.status(403).json({
      success: false,
      error: 'تم إلغاء البيانات التجريبية؛ النظام يعمل في وضع التشغيل الفعلي الحقيقي فقط.',
    });
  });

  router.post('/clear-demo', (_req: Request, res: Response) => {
    const nowIso = new Date().toISOString();
    const nextResetVersion = (Number(db.settings.demoResetVersion) || 0) + 1;
    const preservedDrivers = db.driverAccounts.filter((d) => !d.isDemo);
    const activeNonDemoDriver =
      preservedDrivers.find((d) => d.id === db.truck.driverId && d.status === 'approved') ||
      preservedDrivers.find((d) => d.status === 'approved');

    db = {
      customers: [],
      orders: [],
      trips: [],
      invoices: [],
      reconciliations: [],
      expenses: [],
      gpsEvents: [],
      notifications: [],
      directives: [],
      driverAccounts: preservedDrivers,
      truck: {
        ...db.truck,
        driverId: activeNonDemoDriver?.id || '',
        driverName: activeNonDemoDriver?.name || 'غير معين',
        driverPhone: activeNonDemoDriver?.phone || '',
        status: 'idle',
        currentWaterLiters: 0,
        currentTripId: undefined,
        lastLat: db.settings.plantLocation.lat,
        lastLng: db.settings.plantLocation.lng,
        lastSpeed: 0,
        lastUpdateTimestamp: nowIso,
        lastEvent: 'RETURN_PLANT',
      },
      settings: {
        ...db.settings,
        demoDataActive: false,
        demoDataClearedAt: nowIso,
        demoResetVersion: nextResetVersion,
      },
    };
    broadcastWs({
      type: 'state:updated',
      reason: 'demo:cleared',
      demoDataClearedAt: nowIso,
      demoResetVersion: nextResetVersion,
    });
    saveDatabase();
    res.json({
      success: true,
      message: 'تم مسح كافة البيانات التجريبية من الخادم وتطبيقات السائقين وبدء النظام الفعلي',
      data: db,
    });
  });

  // 14. Google Maps Runtime Config (exposes provisioned API key if injected at runtime)
  router.get('/maps-config', (_req: Request, res: Response) => {
    const apiKey =
      process.env.VITE_GOOGLE_MAPS_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      '';
    res.json({ success: true, apiKey });
  });

  // 15. Protected Cloud SQL (PostgreSQL + Drizzle ORM + Firebase Auth) Endpoints
  router.get('/sql/me', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      const email = req.user?.email || '';
      if (!uid) return res.status(401).json({ success: false, error: 'Unauthorized' });
      const user = await getOrCreateUser(uid, email, req.user?.name, 'manager');
      res.json({ success: true, data: user });
    } catch (error: any) {
      console.error('Failed /api/sql/me:', error);
      res.status(500).json({ success: false, error: error.message || 'Database error' });
    }
  });

  router.get('/sql/state', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      const email = req.user?.email || '';
      if (!uid) return res.status(401).json({ success: false, error: 'Unauthorized' });
      await getOrCreateUser(uid, email, req.user?.name, 'manager');
      const sqlState = await loadFullStateFromSql(uid);
      res.json({ success: true, data: sqlState });
    } catch (error: any) {
      console.error('Failed /api/sql/state:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to load SQL state' });
    }
  });

  router.post('/sql/sync-state', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      const email = req.user?.email || '';
      if (!uid) return res.status(401).json({ success: false, error: 'Unauthorized' });
      const payload = req.body || {};
      const result = await syncFullStateToSql(
        { uid, email, displayName: req.user?.name },
        {
          customers: Array.isArray(payload.customers) ? payload.customers : db.customers,
          orders: Array.isArray(payload.orders) ? payload.orders : db.orders,
          trips: Array.isArray(payload.trips) ? payload.trips : db.trips,
          invoices: Array.isArray(payload.invoices) ? payload.invoices : db.invoices,
          reconciliations: Array.isArray(payload.reconciliations)
            ? payload.reconciliations
            : db.reconciliations,
          expenses: Array.isArray(payload.expenses) ? payload.expenses : db.expenses,
          gpsEvents: Array.isArray(payload.gpsEvents) ? payload.gpsEvents : db.gpsEvents,
          notifications: Array.isArray(payload.notifications)
            ? payload.notifications
            : db.notifications,
          directives: Array.isArray(payload.directives) ? payload.directives : db.directives,
          driverAccounts: Array.isArray(payload.driverAccounts)
            ? payload.driverAccounts
            : db.driverAccounts,
          truck: payload.truck && typeof payload.truck === 'object' ? payload.truck : db.truck,
          settings:
            payload.settings && typeof payload.settings === 'object'
              ? payload.settings
              : db.settings,
        }
      );
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error('Failed /api/sql/sync-state:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to sync SQL state' });
    }
  });

  router.get('/sql/customers', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ success: false, error: 'Unauthorized' });
      const rows = await getCustomersSql(uid);
      res.json({ success: true, data: rows });
    } catch (error: any) {
      console.error('Failed GET /api/sql/customers:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch customers' });
    }
  });

  router.post('/sql/customers', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      const email = req.user?.email || '';
      if (!uid) return res.status(401).json({ success: false, error: 'Unauthorized' });
      await getOrCreateUser(uid, email, req.user?.name, 'manager');
      const saved = await upsertCustomerSql(req.body, uid);
      res.json({ success: true, data: saved });
    } catch (error: any) {
      console.error('Failed POST /api/sql/customers:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to save customer' });
    }
  });

  router.put('/sql/customers/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      const email = req.user?.email || '';
      if (!uid) return res.status(401).json({ success: false, error: 'Unauthorized' });
      await getOrCreateUser(uid, email, req.user?.name, 'manager');
      const saved = await upsertCustomerSql({ ...req.body, id: req.params.id }, uid);
      res.json({ success: true, data: saved });
    } catch (error: any) {
      console.error('Failed PUT /api/sql/customers/:id:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to update customer' });
    }
  });

  router.delete('/sql/customers/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ success: false, error: 'Unauthorized' });
      const deleted = await deleteCustomerSql(req.params.id);
      res.json({ success: true, data: deleted });
    } catch (error: any) {
      console.error('Failed DELETE /api/sql/customers/:id:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to delete customer' });
    }
  });

  router.get('/sql/orders', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ success: false, error: 'Unauthorized' });
      const rows = await getOrdersSql(uid);
      res.json({ success: true, data: rows });
    } catch (error: any) {
      console.error('Failed GET /api/sql/orders:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch orders' });
    }
  });

  router.post('/sql/orders', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      const email = req.user?.email || '';
      if (!uid) return res.status(401).json({ success: false, error: 'Unauthorized' });
      await getOrCreateUser(uid, email, req.user?.name, 'manager');
      const saved = await upsertOrderSql(req.body, uid);
      res.json({ success: true, data: saved });
    } catch (error: any) {
      console.error('Failed POST /api/sql/orders:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to save order' });
    }
  });

  router.get('/sql/trips', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ success: false, error: 'Unauthorized' });
      const rows = await getTripsSql(uid);
      res.json({ success: true, data: rows });
    } catch (error: any) {
      console.error('Failed GET /api/sql/trips:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch trips' });
    }
  });

  router.get('/sql/districts', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ success: false, error: 'Unauthorized' });
      const rows = await getDistrictsSql(uid);
      res.json({ success: true, data: rows });
    } catch (error: any) {
      console.error('Failed GET /api/sql/districts:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch districts' });
    }
  });

  router.post('/sql/districts', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      const email = req.user?.email || '';
      if (!uid) return res.status(401).json({ success: false, error: 'Unauthorized' });
      await getOrCreateUser(uid, email, req.user?.name, 'manager');
      const saved = await upsertDistrictSql(String(req.body?.name || ''), uid);
      res.json({ success: true, data: saved });
    } catch (error: any) {
      console.error('Failed POST /api/sql/districts:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to save district' });
    }
  });

  app.use('/api', router);

  return app;
}

async function startServer() {
  const app = await createAppServer();
  const httpServer = http.createServer(app);

  if (typeof app.locals.attachRealtimeWebSocket === 'function') {
    app.locals.attachRealtimeWebSocket(httpServer);
  }

  const vite = await createViteServer({
    server: {
      middlewareMode: true,
      allowedHosts: true,
      hmr: false,
      ws: { server: httpServer },
    },
    appType: 'spa',
  });
  app.use(vite.middlewares);

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[Miyahna] Smart Water Delivery Server running on http://0.0.0.0:${PORT}`);
  });
}

// Only bind port when run directly (allows automated tests to import createAppServer if needed)
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startServer().catch((err) => {
    console.error('[Miyahna] Fatal server startup error:', err);
  });
}
