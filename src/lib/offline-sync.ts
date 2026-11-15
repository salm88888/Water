/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Offline-First Sync & Queue Types (No SMS)
 */

import { Trip, TripGPSPoint } from '../types';

export interface PendingDeliverySync {
  id: string;
  tripId: string;
  tripNumber: string;
  orderId: string;
  customerId: string;
  deliveredLiters: number;
  paidAmount: number;
  remainingAmount: number;
  timestamp: string;
  status: 'delivered';
  notes?: string;
  lat?: number;
  lng?: number;
}

export interface PendingOfflineOrder {
  id: string;
  customerId?: string;
  customerName: string;
  phone: string;
  district: string;
  addressDetails: string;
  lat?: number;
  lng?: number;
  tankCapacity: number;
  requestedLiters: number;
  pricePerLiter: number;
  totalAmount: number;
  source: 'driver_manual';
  isUrgent?: boolean;
  notes?: string;
  createdAt: string;
  actorName?: string;
}

export interface PendingOfflineCustomer {
  id: string;
  name: string;
  phone: string;
  district: string;
  addressDetails: string;
  lat?: number;
  lng?: number;
  tankCapacityLiters: number;
  notes?: string;
  createdAt: string;
  actorName?: string;
}

export interface OfflineState {
  isOnline: boolean;
  lastSyncTimestamp: string | null;
  activeTrip: Trip | null;
  pendingDeliveries: PendingDeliverySync[];
  pendingOrders: PendingOfflineOrder[];
  pendingCustomers: PendingOfflineCustomer[];
  pendingGpsPoints: TripGPSPoint[];
  lastKnownGps: { lat: number; lng: number; speed: number; accuracy?: number; timestamp: string } | null;
  sequenceCounter: number;
}

const STORAGE_KEY = 'miyahna_driver_offline_store_v2';

export function loadOfflineState(): OfflineState {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
        lastSyncTimestamp: parsed.lastSyncTimestamp || null,
        activeTrip: parsed.activeTrip || null,
        pendingDeliveries: Array.isArray(parsed.pendingDeliveries) ? parsed.pendingDeliveries : [],
        pendingOrders: Array.isArray(parsed.pendingOrders) ? parsed.pendingOrders : [],
        pendingCustomers: Array.isArray(parsed.pendingCustomers) ? parsed.pendingCustomers : [],
        pendingGpsPoints: Array.isArray(parsed.pendingGpsPoints) ? parsed.pendingGpsPoints : [],
        lastKnownGps: parsed.lastKnownGps || null,
        sequenceCounter: typeof parsed.sequenceCounter === 'number' ? parsed.sequenceCounter : 1,
      };
    }
  } catch (e) {
    console.error('Failed to parse offline state from localStorage', e);
  }

  return {
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    lastSyncTimestamp: null,
    activeTrip: null,
    pendingDeliveries: [],
    pendingOrders: [],
    pendingCustomers: [],
    pendingGpsPoints: [],
    lastKnownGps: null,
    sequenceCounter: 1,
  };
}

export function saveOfflineState(state: OfflineState): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch (e) {
    console.error('Failed to save offline state to localStorage', e);
  }
}

export function resetOfflineState(): OfflineState {
  const empty: OfflineState = {
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    lastSyncTimestamp: null,
    activeTrip: null,
    pendingDeliveries: [],
    pendingOrders: [],
    pendingCustomers: [],
    pendingGpsPoints: [],
    lastKnownGps: null,
    sequenceCounter: 1,
  };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (e) {
    console.error('Failed to clear offline state from localStorage', e);
  }
  return empty;
}

export function queueDeliveryAction(
  state: OfflineState,
  delivery: PendingDeliverySync
): OfflineState {
  const updatedDeliveries = [...state.pendingDeliveries.filter((d) => d.orderId !== delivery.orderId), delivery];

  let updatedTrip = state.activeTrip;
  if (updatedTrip) {
    const stops = updatedTrip.customerStops.map((stop) => {
      if (stop.orderId === delivery.orderId) {
        return {
          ...stop,
          deliveredLiters: delivery.deliveredLiters,
          paidAmount: delivery.paidAmount,
          remainingAmount: delivery.remainingAmount,
          status: 'delivered' as const,
          departureTime: delivery.timestamp,
        };
      }
      return stop;
    });

    const totalDelivered = stops.reduce((sum, s) => sum + s.deliveredLiters, 0);
    const remainingLiters = Math.max(0, updatedTrip.initialLoadLiters - totalDelivered);

    updatedTrip = {
      ...updatedTrip,
      customerStops: stops,
      deliveredLiters: totalDelivered,
      remainingLiters,
    };
  }

  const newState: OfflineState = {
    ...state,
    activeTrip: updatedTrip,
    pendingDeliveries: updatedDeliveries,
  };

  saveOfflineState(newState);
  return newState;
}

export function queueOfflineOrder(
  state: OfflineState,
  order: PendingOfflineOrder
): OfflineState {
  const newState: OfflineState = {
    ...state,
    pendingOrders: [...state.pendingOrders, order],
  };
  saveOfflineState(newState);
  return newState;
}

export function queueOfflineCustomer(
  state: OfflineState,
  customer: PendingOfflineCustomer
): OfflineState {
  const newState: OfflineState = {
    ...state,
    pendingCustomers: [...(state.pendingCustomers || []), customer],
  };
  saveOfflineState(newState);
  return newState;
}

export function queueGpsPoint(
  state: OfflineState,
  point: TripGPSPoint
): OfflineState {
  const exists = state.pendingGpsPoints.some((p) => p.id === point.id);
  const nextPoints = exists ? state.pendingGpsPoints : [...state.pendingGpsPoints, point];
  const newState: OfflineState = {
    ...state,
    sequenceCounter: state.sequenceCounter + 1,
    pendingGpsPoints: nextPoints,
    lastKnownGps: {
      lat: point.lat,
      lng: point.lng,
      speed: point.speedKmH || 0,
      accuracy: point.accuracy,
      timestamp: point.timestamp,
    },
  };
  saveOfflineState(newState);
  return newState;
}
