/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Marib Water Management System
 * Production Initial Configuration (Empty Operational Records, Zero Demo Data, Zero SMS)
 */

import {
  Customer,
  DriverAccount,
  DriverReconciliation,
  Expense,
  GPSEvent,
  Invoice,
  Order,
  SystemSettings,
  Trip,
  Truck,
} from '../types';

export const DEFAULT_SETTINGS: SystemSettings = {
  waterProductionCostPerLiter: 3.5,
  defaultSellingPricePerLiter: 12.0,
  dieselPricePerLiter: 650.0,
  truckDieselConsumptionPerKm: 0.38,
  maintenanceAllowancePerTrip: 2500,
  driverWagePerTrip: 5000,

  // GPS & Stop Detection parameters (configurable by Manager)
  stopDetectionMinutes: 3,
  minMovementSpeedKmH: 8,
  stopRadiusMeters: 80,
  plantGeofenceMeters: 120,
  gpsSampleIntervalSeconds: 10,
  gpsWeakAccuracyMeters: 60,
  gpsGapSeconds: 120,

  plantLocation: {
    name: 'مصنع مياهنا المركزي لتحلية وتعبئة المياه',
    city: 'مديرية الوادي - قرب حصون آل جلال، مأرب',
    lat: 15.4920,
    lng: 45.3620,
  },
  customDistricts: [],
  demoDataActive: false,
  demoResetVersion: 1,
  managerPin: '20262027',
};

export const INITIAL_DRIVER_ACCOUNTS: DriverAccount[] = [];

export const INITIAL_CUSTOMERS: Customer[] = [];

export const INITIAL_TRUCK: Truck = {
  id: 'truck-1',
  code: 'TRUCK-01',
  plateNumber: 'غير محدد',
  model: 'وايت مياه صالح للشرب 6000L',
  maxCapacityLiters: 6000,
  currentWaterLiters: 0,
  driverId: '',
  driverName: 'غير معين',
  driverPhone: '',
  status: 'idle',
  lastLat: 15.4920,
  lastLng: 45.3620,
  lastSpeed: 0,
  lastUpdateTimestamp: new Date().toISOString(),
  lastEvent: 'RETURN_PLANT',
  odometerKm: 0,
};

export const INITIAL_ORDERS: Order[] = [];

export const INITIAL_TRIPS: Trip[] = [];

export const INITIAL_INVOICES: Invoice[] = [];

export const INITIAL_RECONCILIATION: DriverReconciliation[] = [];

export const INITIAL_EXPENSES: Expense[] = [];

export const INITIAL_GPS_EVENTS: GPSEvent[] = [];
