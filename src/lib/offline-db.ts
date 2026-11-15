/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - True Offline-First IndexedDB Persistence Engine
 * Persists trips, chronological GPS points, detected stops, deliveries, and field orders
 * reliably across internet loss, app close, and device reboot.
 * CRITICAL RULE: Local unsynced data is NEVER deleted until explicit server acknowledgement.
 */

import { DetectedStop, Trip, TripGPSPoint } from '../types';
import { PendingDeliverySync, PendingOfflineCustomer, PendingOfflineOrder } from './offline-sync';

const DB_NAME = 'miyahna_offline_db_v2';
const DB_VERSION = 1;

export interface LocalGPSPointRecord extends TripGPSPoint {
  synced: boolean;
}

export interface LocalDetectedStopRecord extends DetectedStop {
  synced: boolean;
}

export interface LocalDeliveryRecord extends PendingDeliverySync {
  synced: boolean;
}

export interface LocalOrderRecord extends PendingOfflineOrder {
  synced: boolean;
}

export interface LocalCustomerRecord extends PendingOfflineCustomer {
  synced: boolean;
}

export interface LocalTripReturnEvent {
  id: string;
  tripId: string;
  lat: number;
  lng: number;
  distanceFromPlantMeters: number;
  detectedAutomatically: boolean;
  returnedAt: string;
  synced: boolean;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('trips')) {
        db.createObjectStore('trips', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('gps_points')) {
        const store = db.createObjectStore('gps_points', { keyPath: 'id' });
        store.createIndex('tripId', 'tripId', { unique: false });
      }
      if (!db.objectStoreNames.contains('detected_stops')) {
        const store = db.createObjectStore('detected_stops', { keyPath: 'id' });
        store.createIndex('tripId', 'tripId', { unique: false });
      }
      if (!db.objectStoreNames.contains('deliveries')) {
        db.createObjectStore('deliveries', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('orders')) {
        db.createObjectStore('orders', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('return_events')) {
        db.createObjectStore('return_events', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllFromStore<T>(storeName: string): Promise<T[]> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve((req.result as T[]) || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    const lsRaw = typeof localStorage !== 'undefined' ? localStorage.getItem(`idb_fallback_${storeName}`) : null;
    return lsRaw ? (JSON.parse(lsRaw) as T[]) : [];
  }
}

async function putManyToStore<T extends { id?: string; key?: string }>(
  storeName: string,
  items: T[]
): Promise<void> {
  if (items.length === 0) return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      for (const item of items) {
        store.put(item);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    if (typeof localStorage !== 'undefined') {
      const current = await getAllFromStore<T>(storeName);
      const map = new Map<string, T>();
      for (const c of current) {
        const k = c.id || c.key || '';
        if (k) map.set(k, c);
      }
      for (const item of items) {
        const k = item.id || item.key || '';
        if (k) map.set(k, item);
      }
      localStorage.setItem(`idb_fallback_${storeName}`, JSON.stringify(Array.from(map.values())));
    }
  }
}

export async function idbSaveTrip(trip: Trip): Promise<void> {
  await putManyToStore('trips', [trip]);
}

export async function idbGetTrips(): Promise<Trip[]> {
  return getAllFromStore<Trip>('trips');
}

export async function idbAppendGpsPoint(point: TripGPSPoint): Promise<void> {
  const rec: LocalGPSPointRecord = { ...point, synced: false };
  await putManyToStore('gps_points', [rec]);
}

export async function idbGetAllGpsPoints(tripId?: string): Promise<LocalGPSPointRecord[]> {
  const all = await getAllFromStore<LocalGPSPointRecord>('gps_points');
  const filtered = tripId ? all.filter((p) => p.tripId === tripId) : all;
  return filtered.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

export async function idbSaveStops(stops: DetectedStop[], preserveSyncedStatus = true): Promise<void> {
  if (stops.length === 0) return;
  const existing = await getAllFromStore<LocalDetectedStopRecord>('detected_stops');
  const existingMap = new Map(existing.map((s) => [s.id, s]));
  const toPut: LocalDetectedStopRecord[] = stops.map((s) => {
    const prev = existingMap.get(s.id);
    // Keep synced: false whenever stop duration/endTime grew, or mark new
    const changed = !prev || prev.durationMinutes !== s.durationMinutes || prev.endTime !== s.endTime;
    return {
      ...s,
      synced: preserveSyncedStatus && prev && !changed ? prev.synced : false,
    };
  });
  await putManyToStore('detected_stops', toPut);
}

export async function idbGetAllStops(tripId?: string): Promise<LocalDetectedStopRecord[]> {
  const all = await getAllFromStore<LocalDetectedStopRecord>('detected_stops');
  return tripId ? all.filter((s) => s.tripId === tripId) : all;
}

export async function idbQueueDelivery(del: PendingDeliverySync): Promise<void> {
  await putManyToStore('deliveries', [{ ...del, synced: false }]);
}

export async function idbGetUnsyncedDeliveries(): Promise<LocalDeliveryRecord[]> {
  const all = await getAllFromStore<LocalDeliveryRecord>('deliveries');
  return all.filter((d) => !d.synced);
}

export async function idbQueueOrder(ord: PendingOfflineOrder): Promise<void> {
  await putManyToStore('orders', [{ ...ord, synced: false }]);
}

export async function idbGetUnsyncedOrders(): Promise<LocalOrderRecord[]> {
  const all = await getAllFromStore<LocalOrderRecord>('orders');
  return all.filter((o) => !o.synced);
}

export async function idbQueueCustomer(cust: PendingOfflineCustomer): Promise<void> {
  const existing = (await idbGetMeta<LocalCustomerRecord[]>('pending_customers')) || [];
  const filtered = existing.filter((c) => c.id !== cust.id);
  filtered.push({ ...cust, synced: false });
  await idbSetMeta('pending_customers', filtered);
}

export async function idbGetUnsyncedCustomers(): Promise<LocalCustomerRecord[]> {
  const existing = (await idbGetMeta<LocalCustomerRecord[]>('pending_customers')) || [];
  return existing.filter((c) => !c.synced);
}

export async function idbQueueDistrict(district: string): Promise<void> {
  const clean = (district || '').trim();
  if (!clean || clean === '__other__' || clean === 'أخرى') return;
  const existing = (await idbGetMeta<string[]>('pending_districts')) || [];
  if (!existing.includes(clean)) {
    await idbSetMeta('pending_districts', [...existing, clean]);
  }
}

export async function idbGetUnsyncedDistricts(): Promise<string[]> {
  const existing = (await idbGetMeta<string[]>('pending_districts')) || [];
  return Array.isArray(existing) ? existing.filter((d) => typeof d === 'string' && d.trim().length > 0) : [];
}

export async function idbQueueReturnEvent(evt: Omit<LocalTripReturnEvent, 'synced'>): Promise<void> {
  await putManyToStore('return_events', [{ ...evt, synced: false }]);
}

export async function idbGetUnsyncedReturnEvents(): Promise<LocalTripReturnEvent[]> {
  const all = await getAllFromStore<LocalTripReturnEvent>('return_events');
  return all.filter((e) => !e.synced);
}

/**
 * Mark items synced ONLY after receiving explicit server confirmation IDs.
 * Unconfirmed items remain synced: false and will be retried automatically.
 */
export async function idbMarkSyncedByIds(acks: {
  tripIds?: string[];
  pointIds?: string[];
  stopIds?: string[];
  deliveryIds?: string[];
  orderIds?: string[];
  customerIds?: string[];
  districtNames?: string[];
  returnEventIds?: string[];
}): Promise<void> {
  if (acks.tripIds?.length) {
    const all = await getAllFromStore<Trip>('trips');
    const set = new Set(acks.tripIds);
    const updated = all.filter((t) => set.has(t.id)).map((t) => ({
      ...t,
      syncStatus: 'synced' as const,
      lastSyncedAt: new Date().toISOString(),
    }));
    await putManyToStore('trips', updated);
  }
  if (acks.pointIds?.length) {
    const all = await getAllFromStore<LocalGPSPointRecord>('gps_points');
    const set = new Set(acks.pointIds);
    await putManyToStore('gps_points', all.filter((p) => set.has(p.id)).map((p) => ({ ...p, synced: true })));
  }
  if (acks.stopIds?.length) {
    const all = await getAllFromStore<LocalDetectedStopRecord>('detected_stops');
    const set = new Set(acks.stopIds);
    await putManyToStore('detected_stops', all.filter((s) => set.has(s.id)).map((s) => ({ ...s, synced: true })));
  }
  if (acks.deliveryIds?.length) {
    const all = await getAllFromStore<LocalDeliveryRecord>('deliveries');
    const set = new Set(acks.deliveryIds);
    await putManyToStore('deliveries', all.filter((d) => set.has(d.id)).map((d) => ({ ...d, synced: true })));
  }
  if (acks.orderIds?.length) {
    const all = await getAllFromStore<LocalOrderRecord>('orders');
    const set = new Set(acks.orderIds);
    await putManyToStore('orders', all.filter((o) => set.has(o.id)).map((o) => ({ ...o, synced: true })));
  }
  if (acks.customerIds?.length) {
    const all = (await idbGetMeta<LocalCustomerRecord[]>('pending_customers')) || [];
    const set = new Set(acks.customerIds);
    await idbSetMeta(
      'pending_customers',
      all.map((c) => (set.has(c.id) ? { ...c, synced: true } : c))
    );
  }
  if (acks.districtNames?.length) {
    const existing = (await idbGetMeta<string[]>('pending_districts')) || [];
    const ackSet = new Set(acks.districtNames);
    await idbSetMeta(
      'pending_districts',
      existing.filter((d) => !ackSet.has(d))
    );
  }
  if (acks.returnEventIds?.length) {
    const all = await getAllFromStore<LocalTripReturnEvent>('return_events');
    const set = new Set(acks.returnEventIds);
    await putManyToStore('return_events', all.filter((r) => set.has(r.id)).map((r) => ({ ...r, synced: true })));
  }
}

export async function idbGetPendingSyncSnapshot() {
  const [trips, gpsPoints, stops, deliveries, orders, customers, districts, returnEvents] = await Promise.all([
    idbGetTrips(),
    idbGetAllGpsPoints(),
    idbGetAllStops(),
    idbGetUnsyncedDeliveries(),
    idbGetUnsyncedOrders(),
    idbGetUnsyncedCustomers(),
    idbGetUnsyncedDistricts(),
    idbGetUnsyncedReturnEvents(),
  ]);

  const unsyncedTrips = trips.filter((t) => t.syncStatus === 'pending_sync' || t.syncStatus === 'local_only' || t.syncStatus === 'sync_error');
  const unsyncedPoints = gpsPoints.filter((p) => !p.synced);
  const unsyncedStops = stops.filter((s) => !s.synced);

  return {
    unsyncedTrips,
    unsyncedPoints,
    unsyncedStops,
    unsyncedDeliveries: deliveries,
    unsyncedOrders: orders,
    unsyncedCustomers: customers,
    unsyncedDistricts: districts,
    unsyncedReturnEvents: returnEvents,
    totalPendingCount:
      unsyncedTrips.length +
      unsyncedPoints.length +
      unsyncedStops.length +
      deliveries.length +
      orders.length +
      customers.length +
      districts.length +
      returnEvents.length,
  };
}

export async function idbGetMeta<T = unknown>(key: string): Promise<T | null> {
  try {
    const db = await openDB();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction('meta', 'readonly');
      const req = tx.objectStore('meta').get(key);
      req.onsuccess = () => resolve(req.result ? (req.result.value as T) : null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(`idb_fallback_meta_${key}`);
      return raw ? (JSON.parse(raw) as T) : null;
    }
    return null;
  }
}

export async function idbSetMeta(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`idb_fallback_meta_${key}`, JSON.stringify(value));
    }
  }
}

/**
 * Purges all driver-side cached & offline data (trips, GPS points, stops, deliveries, orders, return events)
 * when the Manager clears demo data so no demo records survive on driver devices or re-sync back.
 */
export async function idbClearAllDriverData(): Promise<void> {
  const dataStores = ['trips', 'gps_points', 'detected_stops', 'deliveries', 'orders', 'return_events'];
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([...dataStores, 'meta'], 'readwrite');
      for (const name of dataStores) {
        if (db.objectStoreNames.contains(name)) {
          tx.objectStore(name).clear();
        }
      }
      if (db.objectStoreNames.contains('meta')) {
        tx.objectStore('meta').delete('pending_customers');
        tx.objectStore('meta').delete('pending_districts');
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('IndexedDB clear warning:', e);
  }

  if (typeof localStorage !== 'undefined') {
    for (const name of dataStores) {
      localStorage.removeItem(`idb_fallback_${name}`);
    }
    localStorage.removeItem('idb_fallback_meta_pending_customers');
    localStorage.removeItem('idb_fallback_meta_pending_districts');
  }
}
