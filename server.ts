/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Express Full-Stack Server & API
 * Provides REST endpoints, SMS gateway webhook, intelligent clustering, and persistence.
 */

import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  DEFAULT_SETTINGS,
  INITIAL_CUSTOMERS,
  INITIAL_EXPENSES,
  INITIAL_GPS_EVENTS,
  INITIAL_INVOICES,
  INITIAL_ORDERS,
  INITIAL_RECONCILIATION,
  INITIAL_SMS_LOGS,
  INITIAL_TRIPS,
  INITIAL_TRUCK,
} from './src/lib/marib-data.ts';
import { generateSmartClusters } from './src/lib/clustering.ts';
import { parseSabafonSMS, isDuplicateMessage } from './src/lib/sms-parser.ts';
import { Customer, Order, Trip, Invoice, Expense, GPSEvent, SMSMessage, SystemSettings, Truck, DriverReconciliation } from './src/types/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// In-Memory Database Structure
interface DatabaseSchema {
  customers: Customer[];
  orders: Order[];
  trips: Trip[];
  invoices: Invoice[];
  reconciliations: DriverReconciliation[];
  expenses: Expense[];
  gpsEvents: GPSEvent[];
  smsLogs: SMSMessage[];
  truck: Truck;
  settings: SystemSettings;
}

function getInitialDatabase(): DatabaseSchema {
  return {
    customers: [...INITIAL_CUSTOMERS],
    orders: [...INITIAL_ORDERS],
    trips: [...INITIAL_TRIPS],
    invoices: [...INITIAL_INVOICES],
    reconciliations: [...INITIAL_RECONCILIATION],
    expenses: [...INITIAL_EXPENSES],
    gpsEvents: [...INITIAL_GPS_EVENTS],
    smsLogs: [...INITIAL_SMS_LOGS],
    truck: { ...INITIAL_TRUCK },
    settings: { ...DEFAULT_SETTINGS },
  };
}

let db: DatabaseSchema = getInitialDatabase();

// Load or initialize persistent storage
function loadDatabase(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      db = JSON.parse(content);
      console.log('[Miyahna DB] Loaded persistent database from disk.');
    } else {
      saveDatabase();
      console.log('[Miyahna DB] Initialized fresh database with Marib demo data.');
    }
  } catch (err) {
    console.error('[Miyahna DB] Error reading DB, using memory fallback:', err);
    db = getInitialDatabase();
  }
}

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

loadDatabase();

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API Routes
  const router = express.Router();

  // 1. Full State
  router.get('/state', (_req: Request, res: Response) => {
    res.json({ success: true, data: db });
  });

  // 2. Customers
  router.get('/customers', (_req: Request, res: Response) => {
    res.json({ success: true, data: db.customers });
  });

  router.post('/customers', (req: Request, res: Response) => {
    const payload = req.body;
    const newSeq = db.customers.length + 1;
    const customerId = `CUST-${String(newSeq).padStart(4, '0')}`;
    const newCustomer: Customer = {
      id: `cust-${Date.now()}`,
      customerId,
      name: payload.name,
      phone: payload.phone,
      altPhone: payload.altPhone || '',
      district: payload.district || 'حي الروضة',
      addressDetails: payload.addressDetails || '',
      lat: payload.lat || db.settings.plantLocation.lat + 0.005,
      lng: payload.lng || db.settings.plantLocation.lng + 0.005,
      tankCapacityLiters: Number(payload.tankCapacityLiters) || 2000,
      tankRemainingLiters: payload.tankRemainingLiters !== undefined ? Number(payload.tankRemainingLiters) : 0,
      notes: payload.notes || '',
      createdAt: new Date().toISOString(),
      isActive: true,
      totalOrdersCount: 0,
      totalLitersDelivered: 0,
    };
    db.customers.unshift(newCustomer);
    saveDatabase();
    res.json({ success: true, data: newCustomer });
  });

  router.put('/customers/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const idx = db.customers.findIndex((c) => c.id === id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'العميل غير موجود' });
    }
    db.customers[idx] = { ...db.customers[idx], ...req.body };
    saveDatabase();
    res.json({ success: true, data: db.customers[idx] });
  });

  // 3. Orders & Duplicate Detection
  router.get('/orders', (_req: Request, res: Response) => {
    res.json({ success: true, data: db.orders });
  });

  router.post('/orders', (req: Request, res: Response) => {
    const payload = req.body;
    const phone = payload.phone?.trim();
    const customerId = payload.customerId;
    const requestedLiters = Number(payload.requestedLiters);

    // Duplicate detection: check if order from same phone or customer exists within last 24 hours with pending status
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const duplicate = db.orders.find(
      (o) =>
        (o.phone === phone || o.customerId === customerId) &&
        new Date(o.createdAt).getTime() > oneDayAgo &&
        o.status !== 'delivered' &&
        o.status !== 'cancelled'
    );

    const orderSeq = db.orders.length + 1;
    const orderNumber = `ORD-2026-${String(orderSeq).padStart(4, '0')}`;
    const pricePerLiter = Number(payload.pricePerLiter) || db.settings.defaultSellingPricePerLiter;
    const totalAmount = requestedLiters * pricePerLiter;

    const newOrder: Order = {
      id: `ord-${Date.now()}`,
      orderNumber,
      customerId: payload.customerId,
      customerName: payload.customerName,
      phone: payload.phone,
      district: payload.district,
      addressDetails: payload.addressDetails,
      lat: payload.lat,
      lng: payload.lng,
      tankCapacity: Number(payload.tankCapacity) || 2000,
      tankRemainingLiters: payload.tankRemainingLiters !== undefined ? Number(payload.tankRemainingLiters) : 0,
      requestedLiters,
      pricePerLiter,
      totalAmount,
      source: payload.source || 'manager_manual',
      createdAt: new Date().toISOString(),
      notes: payload.notes || '',
      status: 'waiting_clustering',
      isUrgent: Boolean(payload.isUrgent),
      duplicateWarning: Boolean(duplicate),
      duplicateMatchedOrderId: duplicate?.orderNumber,
    };

    db.orders.unshift(newOrder);

    // Update customer tank remaining if provided
    const custIdx = db.customers.findIndex((c) => c.id === payload.customerId);
    if (custIdx !== -1 && payload.tankRemainingLiters !== undefined) {
      db.customers[custIdx].tankRemainingLiters = Number(payload.tankRemainingLiters);
    }

    saveDatabase();
    res.json({
      success: true,
      data: newOrder,
      duplicateDetected: Boolean(duplicate),
      warning: duplicate ? `تنبيه: يوجد طلب سابق لهذا العميل (${duplicate.orderNumber}) في انتظار التوصيل!` : null,
    });
  });

  router.put('/orders/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const idx = db.orders.findIndex((o) => o.id === id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'الطلب غير موجود' });
    }
    db.orders[idx] = { ...db.orders[idx], ...req.body };
    saveDatabase();
    res.json({ success: true, data: db.orders[idx] });
  });

  // 4. Clustering & Optimization
  router.get('/clustering/proposals', (_req: Request, res: Response) => {
    const proposals = generateSmartClusters(db.orders, db.settings, db.truck.maxCapacityLiters);
    res.json({ success: true, data: proposals });
  });

  router.post('/clustering/create-trip', (req: Request, res: Response) => {
    const { proposal } = req.body;
    if (!proposal || !proposal.orders || proposal.orders.length === 0) {
      return res.status(400).json({ success: false, error: 'بيانات مقترح الرحلة غير صحيحة' });
    }

    const tripSeq = db.trips.length + 1;
    const tripNumber = `TRIP-2026-${String(tripSeq).padStart(4, '0')}`;
    const orderIds = proposal.orders.map((o: Order) => o.id);

    const newTrip: Trip = {
      id: `trip-${Date.now()}`,
      tripNumber,
      date: new Date().toISOString().split('T')[0],
      truckId: db.truck.id,
      driverId: db.truck.driverId,
      driverName: db.truck.driverName,
      truckPlate: db.truck.plateNumber,
      initialLoadLiters: proposal.totalLiters,
      deliveredLiters: 0,
      remainingLiters: proposal.totalLiters,
      status: 'proposed', // requires manager approval
      customerStops: proposal.customerStops,
      orderIds,
      proposedAt: new Date().toISOString(),
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

    // Update statuses of the clustered orders
    for (const ordId of orderIds) {
      const idx = db.orders.findIndex((o) => o.id === ordId);
      if (idx !== -1) {
        db.orders[idx].status = 'clustered';
        db.orders[idx].tripId = newTrip.id;
      }
    }

    db.trips.unshift(newTrip);
    saveDatabase();
    res.json({ success: true, data: newTrip });
  });

  // 5. Trips Management & Workflow
  router.get('/trips', (_req: Request, res: Response) => {
    res.json({ success: true, data: db.trips });
  });

  router.post('/trips/:id/approve', (req: Request, res: Response) => {
    const { id } = req.params;
    const trip = db.trips.find((t) => t.id === id);
    if (!trip) return res.status(404).json({ success: false, error: 'الرحلة غير موجودة' });

    trip.status = 'approved';
    trip.approvedAt = new Date().toISOString();

    // Update orders to approved
    for (const ordId of trip.orderIds) {
      const o = db.orders.find((ord) => ord.id === ordId);
      if (o) o.status = 'approved';
    }

    db.truck.status = 'loading';
    db.truck.currentWaterLiters = trip.initialLoadLiters;
    db.truck.currentTripId = trip.id;

    saveDatabase();
    res.json({ success: true, data: trip });
  });

  router.post('/trips/:id/start', (req: Request, res: Response) => {
    const { id } = req.params;
    const trip = db.trips.find((t) => t.id === id);
    if (!trip) return res.status(404).json({ success: false, error: 'الرحلة غير موجودة' });

    trip.status = 'in_progress';
    trip.startedAt = new Date().toISOString();

    for (const ordId of trip.orderIds) {
      const o = db.orders.find((ord) => ord.id === ordId);
      if (o) o.status = 'in_delivery';
    }

    db.truck.status = 'on_trip';
    db.truck.lastEvent = 'START';
    db.truck.lastUpdateTimestamp = new Date().toISOString();

    // Log GPS Event
    const gpsEvent: GPSEvent = {
      id: `gps-${Date.now()}`,
      tripId: trip.id,
      tripNumber: trip.tripNumber,
      timestamp: new Date().toISOString(),
      eventType: 'START',
      lat: db.settings.plantLocation.lat,
      lng: db.settings.plantLocation.lng,
      speed: 0,
      source: 'app_local',
      sequenceNumber: db.gpsEvents.length + 1,
      isProcessed: true,
    };
    db.gpsEvents.push(gpsEvent);

    saveDatabase();
    res.json({ success: true, data: trip });
  });

  // 6. Stop Delivery Logging & Invoicing
  router.post('/trips/:id/delivery-stop', (req: Request, res: Response) => {
    const { id } = req.params;
    const { orderId, deliveredLiters, paidAmount, remainingAmount, notes, lat, lng } = req.body;

    const trip = db.trips.find((t) => t.id === id);
    if (!trip) return res.status(404).json({ success: false, error: 'الرحلة غير موجودة' });

    const stop = trip.customerStops.find((s) => s.orderId === orderId);
    if (!stop) return res.status(404).json({ success: false, error: 'نقطة التوقف غير موجودة' });

    stop.deliveredLiters = Number(deliveredLiters);
    stop.paidAmount = Number(paidAmount);
    stop.remainingAmount = Number(remainingAmount);
    stop.status = 'delivered';
    stop.departureTime = new Date().toISOString();
    stop.departureLat = lat || stop.lat;
    stop.departureLng = lng || stop.lng;
    stop.notes = notes || stop.notes;

    // Generate Invoice
    const invoiceSeq = db.invoices.length + 1;
    const invoiceNumber = `INV-2026-${String(invoiceSeq).padStart(4, '0')}`;
    const newInvoice: Invoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber,
      orderId: stop.orderId,
      orderNumber: (db.orders.find((o) => o.id === stop.orderId)?.orderNumber) || 'ORD-UNKNOWN',
      tripId: trip.id,
      tripNumber: trip.tripNumber,
      customerId: stop.customerId,
      customerName: stop.customerName,
      phone: stop.phone,
      district: stop.district,
      requestedLiters: stop.requestedLiters,
      deliveredLiters: stop.deliveredLiters,
      pricePerLiter: stop.pricePerLiter,
      totalAmount: stop.totalAmount,
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

    // Update order status
    const order = db.orders.find((o) => o.id === orderId);
    if (order) {
      order.status = 'delivered';
    }

    // Update customer stats
    const customer = db.customers.find((c) => c.id === stop.customerId);
    if (customer) {
      customer.totalOrdersCount += 1;
      customer.totalLitersDelivered += stop.deliveredLiters;
      customer.tankRemainingLiters = 0; // Assume customer tank is always empty (0L)
    }

    // Recalculate trip remaining water
    const totalDelivered = trip.customerStops.reduce((sum, s) => sum + s.deliveredLiters, 0);
    trip.deliveredLiters = totalDelivered;
    trip.remainingLiters = Math.max(0, trip.initialLoadLiters - totalDelivered);
    db.truck.currentWaterLiters = trip.remainingLiters;

    // Check if all stops are completed
    const allDone = trip.customerStops.every((s) => s.status === 'delivered' || s.status === 'skipped');
    if (allDone) {
      trip.status = 'returning';
    }

    saveDatabase();
    res.json({ success: true, data: { trip, invoice: newInvoice } });
  });

  // 7. Complete & Return to Plant
  router.post('/trips/:id/complete', (req: Request, res: Response) => {
    const { id } = req.params;
    const { actualDistanceKm, actualFuelLiters } = req.body;
    const trip = db.trips.find((t) => t.id === id);
    if (!trip) return res.status(404).json({ success: false, error: 'الرحلة غير موجودة' });

    trip.status = 'completed';
    trip.completedAt = new Date().toISOString();
    trip.actualDistanceKm = actualDistanceKm || trip.estimatedDistanceKm;
    trip.actualFuelLiters = actualFuelLiters || trip.estimatedFuelLiters;

    // Recalculate final revenue & profit
    const actualRevenue = trip.customerStops.reduce((sum, s) => sum + (s.deliveredLiters * s.pricePerLiter), 0);
    const actualFuelCost = (trip.actualFuelLiters || trip.estimatedFuelLiters) * db.settings.dieselPricePerLiter;
    const actualProdCost = trip.deliveredLiters * db.settings.waterProductionCostPerLiter;
    const actualTotalCost = actualFuelCost + actualProdCost + trip.driverWageShare + trip.maintenanceShare;

    trip.actualRevenue = actualRevenue;
    trip.actualCost = actualTotalCost;
    trip.actualProfit = actualRevenue - actualTotalCost;

    db.truck.status = 'idle';
    db.truck.currentTripId = undefined;
    db.truck.currentWaterLiters = 0; // ready for reload
    db.truck.lastEvent = 'RETURN_PLANT';
    db.truck.lastLat = db.settings.plantLocation.lat;
    db.truck.lastLng = db.settings.plantLocation.lng;
    db.truck.odometerKm += (trip.actualDistanceKm || 15);

    saveDatabase();
    res.json({ success: true, data: trip });
  });

  // 8. SMS Gateway Receiver Webhook (Sabafon GSM Modem, SMS Forwarder App, or Phone Batch Reader)
  const processIncomingSms = (rawText: string, senderNumberInput?: string) => {
    const parsed = parseSabafonSMS(rawText);
    const sender = (senderNumberInput || '').trim() || db.settings.driverSabafonNumber;
    const messageId = `MSG-${Date.now()}-${Math.floor(Math.random() * 1000)}-${parsed.sequenceNumber}`;

    // Verify sender matches authorized driver Sabafon number (normalized last 9 digits)
    const normalizePhone = (p: string) => p.replace(/\D/g, '').slice(-9);
    if (
      senderNumberInput &&
      senderNumberInput.trim() &&
      db.settings.driverSabafonNumber &&
      normalizePhone(senderNumberInput) !== normalizePhone(db.settings.driverSabafonNumber)
    ) {
      const unauthorizedMsg: SMSMessage = {
        id: `sms-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        messageId,
        senderNumber: sender,
        tripId: 'UNAUTHORIZED',
        tripNumber: parsed.tripNumber || 'UNKNOWN',
        sequenceNumber: parsed.sequenceNumber,
        eventType: parsed.eventType,
        lat: parsed.lat,
        lng: parsed.lng,
        timeString: parsed.timeString,
        rawText,
        receivedAt: new Date().toISOString(),
        status: 'invalid_format',
        statusReason: `تم رفض الرسالة: رقم المرسل (${sender}) غير مطابق لرقم السائق المعتمد (${db.settings.driverSabafonNumber})`,
      };
      db.smsLogs.unshift(unauthorizedMsg);
      return {
        statusCode: 403,
        outcome: 'rejected' as const,
        payload: {
          success: false,
          error: `رقم المرسل غير مصرح به. الرقم المعتمد حالياً هو: ${db.settings.driverSabafonNumber}`,
          log: unauthorizedMsg,
        },
      };
    }

    if (!parsed.isValid) {
      const invalidMsg: SMSMessage = {
        id: `sms-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        messageId,
        senderNumber: sender,
        tripId: 'UNKNOWN',
        tripNumber: parsed.tripNumber || 'UNKNOWN',
        sequenceNumber: parsed.sequenceNumber,
        eventType: parsed.eventType,
        lat: parsed.lat,
        lng: parsed.lng,
        timeString: parsed.timeString,
        rawText,
        receivedAt: new Date().toISOString(),
        status: 'invalid_format',
        statusReason: parsed.errorMessage,
      };
      db.smsLogs.unshift(invalidMsg);
      return {
        statusCode: 400,
        outcome: 'invalid' as const,
        payload: { success: false, error: parsed.errorMessage, log: invalidMsg },
      };
    }

    // Check Duplicate
    const isDup = isDuplicateMessage(db.smsLogs, parsed.tripNumber, parsed.sequenceNumber, parsed.eventType);
    if (isDup) {
      const dupMsg: SMSMessage = {
        id: `sms-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        messageId,
        senderNumber: sender,
        tripId: parsed.tripNumber,
        tripNumber: parsed.tripNumber,
        sequenceNumber: parsed.sequenceNumber,
        eventType: parsed.eventType,
        lat: parsed.lat,
        lng: parsed.lng,
        timeString: parsed.timeString,
        rawText,
        receivedAt: new Date().toISOString(),
        status: 'duplicate_rejected',
        statusReason: 'تم رفض الرسالة لأنها مكررة بنفس الرقم التسلسلي والحدث',
      };
      db.smsLogs.unshift(dupMsg);
      return {
        statusCode: 200,
        outcome: 'duplicate' as const,
        payload: { success: true, duplicate: true, message: 'رسالة مكررة تم تجاهلها وتوثيقها' },
      };
    }

    // Save processed SMS
    const validMsg: SMSMessage = {
      id: `sms-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      messageId,
      senderNumber: sender,
      tripId: parsed.tripNumber,
      tripNumber: parsed.tripNumber,
      sequenceNumber: parsed.sequenceNumber,
      eventType: parsed.eventType,
      lat: parsed.lat,
      lng: parsed.lng,
      speed: parsed.speed,
      timeString: parsed.timeString,
      customerId: parsed.customerId,
      rawText,
      receivedAt: new Date().toISOString(),
      status: 'processed',
    };
    db.smsLogs.unshift(validMsg);

    // Create GPS Event
    const gpsEvent: GPSEvent = {
      id: `gps-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      tripId: parsed.tripNumber,
      tripNumber: parsed.tripNumber,
      timestamp: new Date().toISOString(),
      eventType: parsed.eventType,
      lat: parsed.lat,
      lng: parsed.lng,
      speed: parsed.speed,
      customerId: parsed.customerId,
      source: 'sms',
      rawSmsText: rawText,
      sequenceNumber: parsed.sequenceNumber,
      isProcessed: true,
    };
    db.gpsEvents.push(gpsEvent);

    // Update Truck telemetry
    db.truck.lastLat = parsed.lat;
    db.truck.lastLng = parsed.lng;
    db.truck.lastSpeed = parsed.speed || 0;
    db.truck.lastEvent = parsed.eventType;
    db.truck.lastUpdateTimestamp = new Date().toISOString();

    // If arrival or departure, update matching trip customer stop
    const activeTrip = db.trips.find(
      (t) => (t.tripNumber === parsed.tripNumber || t.id === parsed.tripNumber) && t.status === 'in_progress'
    );
    if (activeTrip && parsed.customerId) {
      const stop = activeTrip.customerStops.find(
        (s) => s.customerId === parsed.customerId || s.orderId === parsed.customerId
      );
      if (stop) {
        if (parsed.eventType === 'ARRIVAL') {
          stop.status = 'arrived';
          stop.arrivalTime = new Date().toISOString();
          stop.arrivalLat = parsed.lat;
          stop.arrivalLng = parsed.lng;
        } else if (parsed.eventType === 'DEPARTURE') {
          stop.departureTime = new Date().toISOString();
          stop.departureLat = parsed.lat;
          stop.departureLng = parsed.lng;
        }
      }
    }

    return {
      statusCode: 200,
      outcome: 'processed' as const,
      payload: { success: true, processed: true, event: gpsEvent, sms: validMsg },
    };
  };

  router.post('/sms/receive', (req: Request, res: Response) => {
    const rawText = req.body.rawText || req.body.text || req.body.message || req.body.body || '';
    const senderNumber = req.body.senderNumber || req.body.from || req.body.sender || req.body.phone;
    if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
      return res.status(400).json({ success: false, error: 'نص الرسالة فارغ' });
    }

    const result = processIncomingSms(rawText, senderNumber);
    saveDatabase();
    return res.status(result.statusCode).json(result.payload);
  });

  router.post('/sms/receive-batch', (req: Request, res: Response) => {
    const { rawBlob, messages, senderNumber, from } = req.body;
    const sender = senderNumber || from;
    let blocks: string[] = [];

    if (Array.isArray(messages)) {
      blocks = messages.map((m) => String(m || '').trim()).filter(Boolean);
    } else if (typeof rawBlob === 'string' && rawBlob.trim()) {
      const clean = rawBlob.replace(/\r\n/g, '\n').trim();
      const matches = [...clean.matchAll(/WATER\s+TRACK/gi)];
      if (matches.length === 0) {
        blocks = [clean];
      } else {
        for (let i = 0; i < matches.length; i++) {
          const start = matches[i].index ?? 0;
          const end = i + 1 < matches.length ? (matches[i + 1].index ?? clean.length) : clean.length;
          const chunk = clean.slice(start, end).trim();
          const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
          const payloadLines: string[] = [];
          for (const line of lines) {
            if (
              /^WATER\s+TRACK/i.test(line) ||
              /^(TRIP|EVENT|CUSTOMER|LAT|LON|LNG|SPEED|TIME|SEQ)\s*:/i.test(line)
            ) {
              payloadLines.push(line);
            } else if (payloadLines.length > 0 && line.includes(':')) {
              break;
            }
          }
          if (payloadLines.length > 0) blocks.push(payloadLines.join('\n'));
        }
      }
    }

    if (blocks.length === 0) {
      return res.status(400).json({ success: false, error: 'لم يتم العثور على رسائل لقراءتها' });
    }

    let processedCount = 0;
    let duplicateCount = 0;
    let rejectedCount = 0;
    let invalidCount = 0;

    const results = blocks.map((block) => {
      const r = processIncomingSms(block, sender);
      if (r.outcome === 'processed') processedCount++;
      else if (r.outcome === 'duplicate') duplicateCount++;
      else if (r.outcome === 'rejected') rejectedCount++;
      else invalidCount++;
      return { outcome: r.outcome, ...r.payload };
    });

    saveDatabase();

    return res.json({
      success: processedCount > 0 || duplicateCount > 0,
      totalCount: blocks.length,
      processedCount,
      duplicateCount,
      rejectedCount,
      invalidCount,
      results,
      message: `تم فحص ${blocks.length} رسالة: قُبلت ${processedCount}، مكررة ${duplicateCount}، مرفوضة/غير صالحة ${rejectedCount + invalidCount}`,
    });
  });

  // 9. Driver Offline Sync Endpoint
  router.post('/sync', (req: Request, res: Response) => {
    const { pendingDeliveries, pendingOrders, pendingGpsEvents } = req.body;

    let syncCount = 0;

    // Sync deliveries
    if (Array.isArray(pendingDeliveries)) {
      for (const del of pendingDeliveries) {
        const trip = db.trips.find((t) => t.id === del.tripId || t.tripNumber === del.tripNumber);
        if (trip) {
          const stop = trip.customerStops.find((s) => s.orderId === del.orderId);
          if (stop && stop.status !== 'delivered') {
            stop.deliveredLiters = del.deliveredLiters;
            stop.paidAmount = del.paidAmount;
            stop.remainingAmount = del.remainingAmount;
            stop.status = 'delivered';
            stop.departureTime = del.timestamp;

            // Generate invoice if missing
            const invSeq = db.invoices.length + 1;
            const newInvoice: Invoice = {
              id: `inv-${Date.now()}-${syncCount}`,
              invoiceNumber: `INV-2026-${String(invSeq).padStart(4, '0')}`,
              orderId: stop.orderId,
              orderNumber: (db.orders.find((o) => o.id === stop.orderId)?.orderNumber) || 'ORD-UNKNOWN',
              tripId: trip.id,
              tripNumber: trip.tripNumber,
              customerId: stop.customerId,
              customerName: stop.customerName,
              phone: stop.phone,
              district: stop.district,
              requestedLiters: stop.requestedLiters,
              deliveredLiters: stop.deliveredLiters,
              pricePerLiter: stop.pricePerLiter,
              totalAmount: stop.totalAmount,
              paidAmount: stop.paidAmount,
              remainingAmount: stop.remainingAmount,
              paymentMethod: 'cash',
              createdAt: del.timestamp || new Date().toISOString(),
              driverName: trip.driverName,
              isReconciled: false,
            };
            db.invoices.push(newInvoice);
            stop.invoiceId = newInvoice.id;

            const order = db.orders.find((o) => o.id === del.orderId);
            if (order) order.status = 'delivered';

            syncCount++;
          }
        }
      }
    }

    // Sync offline orders taken by driver
    if (Array.isArray(pendingOrders)) {
      for (const offOrd of pendingOrders) {
        const orderSeq = db.orders.length + 1;
        const newOrder: Order = {
          id: `ord-${Date.now()}-${syncCount}`,
          orderNumber: `ORD-2026-${String(orderSeq).padStart(4, '0')}`,
          customerId: 'cust-offline',
          customerName: offOrd.customerName,
          phone: offOrd.phone,
          district: offOrd.district || 'حي الروضة',
          addressDetails: offOrd.addressDetails || '',
          lat: db.settings.plantLocation.lat + 0.006,
          lng: db.settings.plantLocation.lng + 0.006,
          tankCapacity: offOrd.tankCapacity || 2000,
          requestedLiters: offOrd.requestedLiters,
          pricePerLiter: offOrd.pricePerLiter || db.settings.defaultSellingPricePerLiter,
          totalAmount: offOrd.totalAmount,
          source: 'driver_manual',
          createdAt: offOrd.createdAt || new Date().toISOString(),
          status: 'waiting_clustering',
          notes: offOrd.notes ? `[مسجل من السائق دون إنترنت] ${offOrd.notes}` : '[مسجل من السائق دون إنترنت]',
        };
        db.orders.unshift(newOrder);
        syncCount++;
      }
    }

    // Sync offline GPS points
    if (Array.isArray(pendingGpsEvents)) {
      for (const gps of pendingGpsEvents) {
        const exists = db.gpsEvents.some((g) => g.id === gps.id);
        if (!exists) {
          db.gpsEvents.push(gps);
        }
      }
    }

    saveDatabase();
    res.json({
      success: true,
      syncedCount: syncCount,
      timestamp: new Date().toISOString(),
      updatedState: db,
    });
  });

  // 10. Financial Reconciliation (عهدة السائق)
  router.get('/reconciliations', (_req: Request, res: Response) => {
    res.json({ success: true, data: db.reconciliations });
  });

  router.post('/reconciliations', (req: Request, res: Response) => {
    const payload = req.body;
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

    // Mark trip as reconciled
    const trip = db.trips.find((t) => t.id === payload.tripId);
    if (trip) {
      trip.status = 'reconciled';
      trip.reconciledAt = new Date().toISOString();
    }

    // Mark invoices as reconciled
    for (const inv of db.invoices) {
      if (inv.tripId === payload.tripId) {
        inv.isReconciled = true;
      }
    }

    saveDatabase();
    res.json({ success: true, data: newRec });
  });

  // 11. Expenses & Diesel
  router.get('/expenses', (_req: Request, res: Response) => {
    res.json({ success: true, data: db.expenses });
  });

  router.post('/expenses', (req: Request, res: Response) => {
    const payload = req.body;
    const expSeq = db.expenses.length + 1;
    const newExpense: Expense = {
      id: `exp-${Date.now()}`,
      expenseNumber: `EXP-2026-${String(expSeq).padStart(4, '0')}`,
      date: payload.date || new Date().toISOString().split('T')[0],
      category: payload.category || 'other',
      description: payload.description,
      amount: Number(payload.amount),
      liters: payload.liters ? Number(payload.liters) : undefined,
      tripId: payload.tripId,
      tripNumber: payload.tripNumber,
      receiptNumber: payload.receiptNumber || '',
      createdBy: payload.createdBy || 'المدير العام',
    };
    db.expenses.unshift(newExpense);
    saveDatabase();
    res.json({ success: true, data: newExpense });
  });

  // 12. Settings
  router.get('/settings', (_req: Request, res: Response) => {
    res.json({ success: true, data: db.settings });
  });

  router.put('/settings', (req: Request, res: Response) => {
    db.settings = { ...db.settings, ...req.body };
    if (req.body.plantLocation && db.truck.status === 'idle') {
      db.truck.lastLat = db.settings.plantLocation.lat;
      db.truck.lastLng = db.settings.plantLocation.lng;
    }
    saveDatabase();
    res.json({ success: true, data: db.settings });
  });

  router.put('/truck', (req: Request, res: Response) => {
    db.truck = { ...db.truck, ...req.body };
    saveDatabase();
    res.json({ success: true, data: db.truck });
  });

  // 13. Reset & Clear Demo Data
  router.post('/reset-demo', (_req: Request, res: Response) => {
    db = getInitialDatabase();
    saveDatabase();
    res.json({ success: true, message: 'تمت استعادة البيانات التجريبية لمأرب بنجاح', data: db });
  });

  router.post('/clear-demo', (_req: Request, res: Response) => {
    db = {
      customers: [],
      orders: [],
      trips: [],
      invoices: [],
      reconciliations: [],
      expenses: [],
      gpsEvents: [],
      smsLogs: [],
      truck: {
        id: 'truck-1',
        code: 'TRUCK-01',
        plateNumber: 'مأرب 14820 نقل',
        model: 'مرسيدس وايت 6000L',
        maxCapacityLiters: 6000,
        currentWaterLiters: 0,
        driverId: 'driver-1',
        driverName: 'منصور صالح الحارثي',
        status: 'idle',
        lastLat: db.settings.plantLocation.lat,
        lastLng: db.settings.plantLocation.lng,
        lastSpeed: 0,
        lastUpdateTimestamp: new Date().toISOString(),
        lastEvent: 'RETURN_PLANT',
        odometerKm: 42000,
      },
      settings: { ...db.settings, demoDataActive: false },
    };
    saveDatabase();
    res.json({ success: true, message: 'تم مسح كافة البيانات التجريبية وبدء النظام الفعلي', data: db });
  });

  app.use('/api', router);

  // Vite middleware mounting in development
  const vite = await createViteServer({
    server: { middlewareMode: true, allowedHosts: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Miyahna] Smart Water Delivery Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Miyahna] Fatal server startup error:', err);
});
