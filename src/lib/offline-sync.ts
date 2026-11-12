/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Offline-First Sync & Queue Engine for Driver Android PWA
 * Operates autonomously in Marib without active internet, storing events in local storage
 * and reconciling when back at the water plant.
 */

import { Trip, TripCustomerStop, Order, GPSEvent, SMSMessage } from '../types';

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
  customerName: string;
  phone: string;
  district: string;
  addressDetails: string;
  tankCapacity: number;
  requestedLiters: number;
  pricePerLiter: number;
  totalAmount: number;
  source: 'driver_manual';
  notes?: string;
  createdAt: string;
}

export interface OfflineState {
  isOnline: boolean;
  lastSyncTimestamp: string | null;
  activeTrip: Trip | null;
  pendingDeliveries: PendingDeliverySync[];
  pendingOrders: PendingOfflineOrder[];
  pendingGpsEvents: GPSEvent[];
  outboxSms: SMSMessage[];
  lastKnownGps: { lat: number; lng: number; speed: number; timestamp: string } | null;
  sequenceCounter: number;
}

const STORAGE_KEY = 'miyahna_driver_offline_store_v1';

export function loadOfflineState(): OfflineState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
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
    pendingGpsEvents: [],
    outboxSms: [],
    lastKnownGps: null,
    sequenceCounter: 5,
  };
}

export function saveOfflineState(state: OfflineState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save offline state to localStorage', e);
  }
}

export function queueDeliveryAction(
  state: OfflineState,
  delivery: PendingDeliverySync
): OfflineState {
  const updatedDeliveries = [...state.pendingDeliveries.filter((d) => d.orderId !== delivery.orderId), delivery];

  // Also update local activeTrip customer stop immediately so driver sees real-time progress
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

export function queueGpsAndSms(
  state: OfflineState,
  gps: GPSEvent,
  sms: SMSMessage
): OfflineState {
  const newState: OfflineState = {
    ...state,
    sequenceCounter: state.sequenceCounter + 1,
    pendingGpsEvents: [...state.pendingGpsEvents, gps],
    outboxSms: [...state.outboxSms, sms],
    lastKnownGps: {
      lat: gps.lat,
      lng: gps.lng,
      speed: gps.speed || 0,
      timestamp: gps.timestamp,
    },
  };
  saveOfflineState(newState);
  return newState;
}
