/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Application Context & State Provider
 * Manages full system state, real-time updates, sync with server.ts, and offline driver caching.
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  Customer,
  Order,
  Trip,
  Invoice,
  Expense,
  GPSEvent,
  SMSMessage,
  SystemSettings,
  Truck,
  DriverReconciliation,
  ClusterProposal,
  GPSEventType,
} from '../types';
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
} from '../lib/marib-data';
import { generateSmartClusters } from '../lib/clustering';
import { parseSabafonSMS, isDuplicateMessage, buildWaterSMS } from '../lib/sms-parser';
import {
  loadOfflineState,
  saveOfflineState,
  queueDeliveryAction,
  queueOfflineOrder,
  queueGpsAndSms,
  OfflineState,
} from '../lib/offline-sync';

export type AppViewMode = 'manager' | 'driver' | 'simulator';

export type ManagerTab =
  | 'overview'
  | 'customers'
  | 'orders'
  | 'clustering'
  | 'trips'
  | 'map'
  | 'sms_gateway'
  | 'invoices'
  | 'reconciliation'
  | 'expenses'
  | 'profitability'
  | 'reports'
  | 'driver_mgmt'
  | 'settings'
  | 'manual';

interface AppContextType {
  // Navigation
  viewMode: AppViewMode;
  setViewMode: (mode: AppViewMode) => void;
  managerTab: ManagerTab;
  setManagerTab: (tab: ManagerTab) => void;

  // Data
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
  clusterProposals: ClusterProposal[];
  isLoading: boolean;
  isOnline: boolean;
  setIsOnline: (online: boolean) => void;

  // Offline Driver State
  offlineState: OfflineState;

  // Actions
  addCustomer: (customer: Partial<Customer>) => Promise<Customer>;
  updateCustomer: (id: string, customer: Partial<Customer>) => Promise<void>;
  addOrder: (order: Partial<Order>) => Promise<{ order: Order; duplicateWarning?: boolean }>;
  updateOrder: (id: string, order: Partial<Order>) => Promise<void>;
  approveTrip: (tripId: string) => Promise<void>;
  startTrip: (tripId: string) => Promise<void>;
  completeTrip: (tripId: string, actualDist?: number, actualFuel?: number) => Promise<void>;
  logDeliveryStop: (params: {
    tripId: string;
    orderId: string;
    deliveredLiters: number;
    paidAmount: number;
    remainingAmount: number;
    notes?: string;
  }) => Promise<void>;
  createTripFromCluster: (proposal: ClusterProposal) => Promise<Trip>;
  submitDriverReconciliation: (rec: Partial<DriverReconciliation>) => Promise<void>;
  addExpense: (expense: Partial<Expense>) => Promise<void>;
  updateSettings: (newSettings: Partial<SystemSettings>) => Promise<void>;
  updateTruck: (newTruck: Partial<Truck>) => Promise<void>;
  resetDemoData: () => Promise<void>;
  clearDemoData: () => Promise<void>;

  // SMS & GPS Gateway Simulation
  sendSabafonSMS: (rawText: string) => Promise<{ success: boolean; message: string }>;
  importSabafonSMSBatch: (
    rawBlob: string,
    senderNumber?: string
  ) => Promise<{
    success: boolean;
    message: string;
    processedCount?: number;
    duplicateCount?: number;
    rejectedCount?: number;
  }>;
  triggerDriverGPSUpdate: (
    eventType: GPSEventType,
    lat: number,
    lng: number,
    speed?: number,
    customerId?: string
  ) => { rawSms: string; sentViaNativeBridge: boolean };
  syncOfflineData: () => Promise<number>;
  
  // Role & Authentication
  savedRole: 'manager' | 'driver' | null;
  selectRole: (role: 'manager' | 'driver') => void;
  logoutToRoleSelection: () => void;
  managerPin: string;
  updateManagerPin: (newPin: string) => Promise<boolean>;
  verifyManagerPin: (pin: string) => boolean;
  isMobileSidebarOpen: boolean;
  setIsMobileSidebarOpen: (open: boolean) => void;
  isChangePinModalOpen: boolean;
  setIsChangePinModalOpen: (open: boolean) => void;

  // Selected entities for modals
  selectedCustomer: Customer | null;
  setSelectedCustomer: (cust: Customer | null) => void;
  selectedOrder: Order | null;
  setSelectedOrder: (ord: Order | null) => void;
  selectedTrip: Trip | null;
  setSelectedTrip: (trip: Trip | null) => void;
  printInvoice: Invoice | null;
  setPrintInvoice: (inv: Invoice | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const SAVED_ROLE_KEY = 'miyahna_saved_role';
const SAVED_PIN_KEY = 'miyahna_manager_pin';
const DEFAULT_MANAGER_PIN = '20262027';

export function AppProvider({ children }: { children: ReactNode }) {
  const [savedRole, setSavedRole] = useState<'manager' | 'driver' | null>(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(SAVED_ROLE_KEY);
      if (stored === 'manager' || stored === 'driver') return stored;
    }
    return null;
  });

  const [managerPin, setManagerPin] = useState<string>(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(SAVED_PIN_KEY);
      if (stored) return stored;
    }
    return DEFAULT_MANAGER_PIN;
  });

  const [viewMode, setViewMode] = useState<AppViewMode>(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(SAVED_ROLE_KEY);
      if (stored === 'driver') return 'driver';
      if (stored === 'manager') return 'manager';
    }
    return 'manager';
  });

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isChangePinModalOpen, setIsChangePinModalOpen] = useState(false);

  const selectRole = (role: 'manager' | 'driver') => {
    setSavedRole(role);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SAVED_ROLE_KEY, role);
    }
    setViewMode(role);
  };

  const logoutToRoleSelection = () => {
    setSavedRole(null);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SAVED_ROLE_KEY);
    }
  };

  const verifyManagerPin = (inputPin: string): boolean => {
    const cleanInput = inputPin.trim();
    const cleanStored = managerPin.trim();
    const cleanDefault = (settings?.managerPin || DEFAULT_MANAGER_PIN).trim();
    return cleanInput === cleanStored || cleanInput === cleanDefault;
  };

  const updateManagerPin = async (newPin: string): Promise<boolean> => {
    const clean = newPin.trim();
    if (!clean || clean.length < 4) return false;
    setManagerPin(clean);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SAVED_PIN_KEY, clean);
    }
    await updateSettings({ managerPin: clean });
    return true;
  };

  const [managerTab, setManagerTab] = useState<ManagerTab>('overview');

  const [customers, setCustomers] = useState<Customer[]>(INITIAL_CUSTOMERS);
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);
  const [trips, setTrips] = useState<Trip[]>(INITIAL_TRIPS);
  const [invoices, setInvoices] = useState<Invoice[]>(INITIAL_INVOICES);
  const [reconciliations, setReconciliations] = useState<DriverReconciliation[]>(INITIAL_RECONCILIATION);
  const [expenses, setExpenses] = useState<Expense[]>(INITIAL_EXPENSES);
  const [gpsEvents, setGpsEvents] = useState<GPSEvent[]>(INITIAL_GPS_EVENTS);
  const [smsLogs, setSmsLogs] = useState<SMSMessage[]>(INITIAL_SMS_LOGS);
  const [truck, setTruck] = useState<Truck>(INITIAL_TRUCK);
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);

  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [offlineState, setOfflineState] = useState<OfflineState>(loadOfflineState());

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [printInvoice, setPrintInvoice] = useState<Invoice | null>(null);

  // Compute cluster proposals dynamically
  const clusterProposals = generateSmartClusters(orders, settings, truck.maxCapacityLiters);

  // Initial load from server
  const fetchState = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/state');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setCustomers(json.data.customers);
          setOrders(json.data.orders);
          setTrips(json.data.trips);
          setInvoices(json.data.invoices);
          setReconciliations(json.data.reconciliations);
          setExpenses(json.data.expenses);
          setGpsEvents(json.data.gpsEvents);
          setSmsLogs(json.data.smsLogs);
          setTruck(json.data.truck);
          setSettings(json.data.settings);
        }
      }
    } catch (err) {
      console.warn('API fetchState failed, using local/cached state:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchState();
  }, []);

  // Update active trip in offline cache when trips change
  useEffect(() => {
    const active = trips.find((t) => t.status === 'in_progress' || t.status === 'approved');
    if (active) {
      setOfflineState((prev) => {
        const next = { ...prev, activeTrip: active };
        saveOfflineState(next);
        return next;
      });
    }
  }, [trips]);

  // Actions
  const addCustomer = async (cust: Partial<Customer>): Promise<Customer> => {
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cust),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setCustomers((prev) => [json.data, ...prev]);
          return json.data;
        }
      }
    } catch (e) {
      console.error(e);
    }
    // Fallback local
    const newSeq = customers.length + 1;
    const newCust: Customer = {
      id: `cust-${Date.now()}`,
      customerId: `CUST-${String(newSeq).padStart(4, '0')}`,
      name: cust.name || 'عميل جديد',
      phone: cust.phone || '710000000',
      altPhone: cust.altPhone || '',
      district: cust.district || 'حي الروضة',
      addressDetails: cust.addressDetails || '',
      lat: cust.lat || settings.plantLocation.lat + 0.005,
      lng: cust.lng || settings.plantLocation.lng + 0.005,
      tankCapacityLiters: cust.tankCapacityLiters || 2000,
      tankRemainingLiters: cust.tankRemainingLiters !== undefined ? cust.tankRemainingLiters : 0,
      notes: cust.notes || '',
      createdAt: new Date().toISOString(),
      isActive: true,
      totalOrdersCount: 0,
      totalLitersDelivered: 0,
    };
    setCustomers((prev) => [newCust, ...prev]);
    return newCust;
  };

  const updateCustomer = async (id: string, cust: Partial<Customer>): Promise<void> => {
    try {
      await fetch(`/api/customers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cust),
      });
    } catch (e) {
      console.error(e);
    }
    setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, ...cust } : c)));
  };

  const addOrder = async (orderPayload: Partial<Order>): Promise<{ order: Order; duplicateWarning?: boolean }> => {
    // If offline on driver app, queue locally
    if (!isOnline && viewMode === 'driver') {
      const offlineOrder = {
        id: `offline-ord-${Date.now()}`,
        customerName: orderPayload.customerName || 'عميل',
        phone: orderPayload.phone || '',
        district: orderPayload.district || 'حي الروضة',
        addressDetails: orderPayload.addressDetails || '',
        tankCapacity: orderPayload.tankCapacity || 2000,
        requestedLiters: orderPayload.requestedLiters || orderPayload.tankCapacity || 2000,
        pricePerLiter: orderPayload.pricePerLiter || settings.defaultSellingPricePerLiter,
        totalAmount: (orderPayload.requestedLiters || orderPayload.tankCapacity || 2000) * (orderPayload.pricePerLiter || settings.defaultSellingPricePerLiter),
        source: 'driver_manual' as const,
        notes: orderPayload.notes,
        createdAt: new Date().toISOString(),
      };
      const updatedOffline = queueOfflineOrder(offlineState, offlineOrder);
      setOfflineState(updatedOffline);

      const mockOrder: Order = {
        ...offlineOrder,
        orderNumber: `ORD-OFFLINE-${Date.now().toString().slice(-4)}`,
        customerId: 'cust-offline',
        lat: settings.plantLocation.lat + 0.004,
        lng: settings.plantLocation.lng + 0.004,
        status: 'waiting_clustering',
      };
      setOrders((prev) => [mockOrder, ...prev]);
      return { order: mockOrder };
    }

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setOrders((prev) => [json.data, ...prev]);
          return { order: json.data, duplicateWarning: json.duplicateDetected };
        }
      }
    } catch (e) {
      console.error(e);
    }

    // Local fallback
    const ordSeq = orders.length + 1;
    const fallbackOrder: Order = {
      id: `ord-${Date.now()}`,
      orderNumber: `ORD-2026-${String(ordSeq).padStart(4, '0')}`,
      customerId: orderPayload.customerId || 'cust-1',
      customerName: orderPayload.customerName || 'عميل',
      phone: orderPayload.phone || '710000000',
      district: orderPayload.district || 'حي الروضة',
      addressDetails: orderPayload.addressDetails || '',
      lat: orderPayload.lat || settings.plantLocation.lat + 0.005,
      lng: orderPayload.lng || settings.plantLocation.lng + 0.005,
      tankCapacity: orderPayload.tankCapacity || 2000,
      tankRemainingLiters: orderPayload.tankRemainingLiters !== undefined ? orderPayload.tankRemainingLiters : 0,
      requestedLiters: orderPayload.requestedLiters || orderPayload.tankCapacity || 2000,
      pricePerLiter: orderPayload.pricePerLiter || settings.defaultSellingPricePerLiter,
      totalAmount: (orderPayload.requestedLiters || orderPayload.tankCapacity || 2000) * (orderPayload.pricePerLiter || settings.defaultSellingPricePerLiter),
      source: orderPayload.source || 'manager_manual',
      createdAt: new Date().toISOString(),
      status: 'waiting_clustering',
      notes: orderPayload.notes,
    };
    setOrders((prev) => [fallbackOrder, ...prev]);
    return { order: fallbackOrder };
  };

  const updateOrder = async (id: string, ord: Partial<Order>): Promise<void> => {
    try {
      await fetch(`/api/orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ord),
      });
    } catch (e) {
      console.error(e);
    }
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...ord } : o)));
  };

  const createTripFromCluster = async (proposal: ClusterProposal): Promise<Trip> => {
    try {
      const res = await fetch('/api/clustering/create-trip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setTrips((prev) => [json.data, ...prev]);
          // Refresh state
          fetchState();
          return json.data;
        }
      }
    } catch (e) {
      console.error(e);
    }

    // Local fallback
    const tripSeq = trips.length + 1;
    const newTrip: Trip = {
      id: `trip-${Date.now()}`,
      tripNumber: `TRIP-2026-${String(tripSeq).padStart(4, '0')}`,
      date: new Date().toISOString().split('T')[0],
      truckId: truck.id,
      driverId: truck.driverId,
      driverName: truck.driverName,
      truckPlate: truck.plateNumber,
      initialLoadLiters: proposal.totalLiters,
      deliveredLiters: 0,
      remainingLiters: proposal.totalLiters,
      status: 'proposed',
      customerStops: proposal.customerStops,
      orderIds: proposal.orders.map((o) => o.id),
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
    setTrips((prev) => [newTrip, ...prev]);
    return newTrip;
  };

  const approveTrip = async (tripId: string): Promise<void> => {
    try {
      const res = await fetch(`/api/trips/${tripId}/approve`, { method: 'POST' });
      if (res.ok) {
        fetchState();
        return;
      }
    } catch (e) {
      console.error(e);
    }
    setTrips((prev) =>
      prev.map((t) => (t.id === tripId ? { ...t, status: 'approved', approvedAt: new Date().toISOString() } : t))
    );
    setTruck((prev) => ({ ...prev, status: 'loading', currentTripId: tripId }));
  };

  const startTrip = async (tripId: string): Promise<void> => {
    try {
      const res = await fetch(`/api/trips/${tripId}/start`, { method: 'POST' });
      if (res.ok) {
        fetchState();
        return;
      }
    } catch (e) {
      console.error(e);
    }
    setTrips((prev) =>
      prev.map((t) => (t.id === tripId ? { ...t, status: 'in_progress', startedAt: new Date().toISOString() } : t))
    );
    setTruck((prev) => ({ ...prev, status: 'on_trip', currentTripId: tripId, lastEvent: 'START' }));
  };

  const completeTrip = async (tripId: string, actualDist?: number, actualFuel?: number): Promise<void> => {
    try {
      const res = await fetch(`/api/trips/${tripId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actualDistanceKm: actualDist, actualFuelLiters: actualFuel }),
      });
      if (res.ok) {
        fetchState();
        return;
      }
    } catch (e) {
      console.error(e);
    }
    setTrips((prev) =>
      prev.map((t) => (t.id === tripId ? { ...t, status: 'completed', completedAt: new Date().toISOString() } : t))
    );
    setTruck((prev) => ({
      ...prev,
      status: 'idle',
      currentTripId: undefined,
      currentWaterLiters: 0,
      lastEvent: 'RETURN_PLANT',
    }));
  };

  const logDeliveryStop = async (params: {
    tripId: string;
    orderId: string;
    deliveredLiters: number;
    paidAmount: number;
    remainingAmount: number;
    notes?: string;
  }): Promise<void> => {
    // If offline mode on driver device, queue locally
    if (!isOnline && viewMode === 'driver') {
      const activeTrip = trips.find((t) => t.id === params.tripId);
      const stop = activeTrip?.customerStops.find((s) => s.orderId === params.orderId);

      const deliveryAction = {
        id: `del-${Date.now()}`,
        tripId: params.tripId,
        tripNumber: activeTrip?.tripNumber || 'TRIP-OFFLINE',
        orderId: params.orderId,
        customerId: stop?.customerId || 'CUST-0001',
        deliveredLiters: params.deliveredLiters,
        paidAmount: params.paidAmount,
        remainingAmount: params.remainingAmount,
        timestamp: new Date().toISOString(),
        status: 'delivered' as const,
        notes: params.notes,
        lat: stop?.lat,
        lng: stop?.lng,
      };

      const nextOffline = queueDeliveryAction(offlineState, deliveryAction);
      setOfflineState(nextOffline);

      // Local UI update
      setTrips((prev) =>
        prev.map((t) => {
          if (t.id === params.tripId) {
            const updatedStops = t.customerStops.map((s) =>
              s.orderId === params.orderId
                ? {
                    ...s,
                    deliveredLiters: params.deliveredLiters,
                    paidAmount: params.paidAmount,
                    remainingAmount: params.remainingAmount,
                    status: 'delivered' as const,
                  }
                : s
            );
            const totalDelivered = updatedStops.reduce((sum, s) => sum + s.deliveredLiters, 0);
            return {
              ...t,
              customerStops: updatedStops,
              deliveredLiters: totalDelivered,
              remainingLiters: Math.max(0, t.initialLoadLiters - totalDelivered),
            };
          }
          return t;
        })
      );
      return;
    }

    try {
      const res = await fetch(`/api/trips/${params.tripId}/delivery-stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (res.ok) {
        fetchState();
        return;
      }
    } catch (e) {
      console.error(e);
    }
  };

  const submitDriverReconciliation = async (recPayload: Partial<DriverReconciliation>): Promise<void> => {
    try {
      const res = await fetch('/api/reconciliations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recPayload),
      });
      if (res.ok) {
        fetchState();
        return;
      }
    } catch (e) {
      console.error(e);
    }
    // Local fallback
    const newRec: DriverReconciliation = {
      id: `rec-${Date.now()}`,
      reconciliationNumber: `REC-2026-${String(reconciliations.length + 1).padStart(4, '0')}`,
      tripId: recPayload.tripId || '',
      tripNumber: recPayload.tripNumber || '',
      driverId: truck.driverId,
      driverName: truck.driverName,
      date: new Date().toISOString().split('T')[0],
      totalInvoicedAmount: recPayload.totalInvoicedAmount || 0,
      totalCashCollected: recPayload.totalCashCollected || 0,
      actualCashHandedOver: recPayload.actualCashHandedOver || 0,
      authorizedExpensesDeducted: recPayload.authorizedExpensesDeducted || 0,
      differenceAmount: recPayload.differenceAmount || 0,
      status: 'approved_reconciled',
      notes: recPayload.notes,
      approvedBy: 'المدير العام',
      createdAt: new Date().toISOString(),
    };
    setReconciliations((prev) => [newRec, ...prev]);
  };

  const addExpense = async (exp: Partial<Expense>): Promise<void> => {
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exp),
      });
      if (res.ok) {
        fetchState();
        return;
      }
    } catch (e) {
      console.error(e);
    }
    const newExp: Expense = {
      id: `exp-${Date.now()}`,
      expenseNumber: `EXP-2026-${String(expenses.length + 1).padStart(4, '0')}`,
      date: exp.date || new Date().toISOString().split('T')[0],
      category: exp.category || 'other',
      description: exp.description || '',
      amount: exp.amount || 0,
      liters: exp.liters,
      tripNumber: exp.tripNumber,
      receiptNumber: exp.receiptNumber,
      createdBy: 'المدير العام',
    };
    setExpenses((prev) => [newExp, ...prev]);
  };

  const updateSettings = async (newSet: Partial<SystemSettings>): Promise<void> => {
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSet),
      });
    } catch (e) {
      console.error(e);
    }
    setSettings((prev) => ({ ...prev, ...newSet }));
  };

  const updateTruck = async (newTruck: Partial<Truck>): Promise<void> => {
    try {
      await fetch('/api/truck', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTruck),
      });
    } catch (e) {
      console.error(e);
    }
    setTruck((prev) => ({ ...prev, ...newTruck }));
  };

  const resetDemoData = async (): Promise<void> => {
    try {
      await fetch('/api/reset-demo', { method: 'POST' });
      fetchState();
    } catch (e) {
      console.error(e);
      setCustomers(INITIAL_CUSTOMERS);
      setOrders(INITIAL_ORDERS);
      setTrips(INITIAL_TRIPS);
      setInvoices(INITIAL_INVOICES);
      setReconciliations(INITIAL_RECONCILIATION);
      setExpenses(INITIAL_EXPENSES);
      setGpsEvents(INITIAL_GPS_EVENTS);
      setSmsLogs(INITIAL_SMS_LOGS);
      setTruck(INITIAL_TRUCK);
      setSettings(DEFAULT_SETTINGS);
    }
  };

  const clearDemoData = async (): Promise<void> => {
    try {
      await fetch('/api/clear-demo', { method: 'POST' });
      fetchState();
    } catch (e) {
      console.error(e);
      setCustomers([]);
      setOrders([]);
      setTrips([]);
      setInvoices([]);
      setReconciliations([]);
      setExpenses([]);
      setGpsEvents([]);
      setSmsLogs([]);
      setTruck({
        ...INITIAL_TRUCK,
        status: 'idle',
        currentWaterLiters: 0,
        currentTripId: undefined,
      });
      setSettings((prev) => ({ ...prev, demoDataActive: false }));
    }
  };

  // SMS Gateway Webhook / Ingestion
  const sendSabafonSMS = async (rawText: string): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch('/api/sms/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText, senderNumber: settings.driverSabafonNumber }),
      });
      const json = await res.json();
      if (json.success) {
        fetchState();
        return { success: true, message: json.duplicate ? 'رسالة مكررة تم توثيقها' : 'تم استلام وتوثيق رسالة SMS وتحديث الموقع' };
      } else {
        return { success: false, message: json.error || 'فشل معالجة الرسالة' };
      }
    } catch (e) {
      console.error(e);
      return { success: false, message: 'خطأ في الاتصال بالخادم' };
    }
  };

  // Batch SMS Ingestion (from Manager's phone inbox paste or Android bridge)
  const importSabafonSMSBatch = async (
    rawBlob: string,
    senderNumber?: string
  ): Promise<{
    success: boolean;
    message: string;
    processedCount?: number;
    duplicateCount?: number;
    rejectedCount?: number;
  }> => {
    try {
      const res = await fetch('/api/sms/receive-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawBlob,
          senderNumber: senderNumber || settings.driverSabafonNumber,
        }),
      });
      const json = await res.json();
      if (res.ok && json) {
        await fetchState();
        return {
          success: Boolean(json.success),
          message: json.message || 'تمت معالجة الرسائل بنجاح',
          processedCount: json.processedCount,
          duplicateCount: json.duplicateCount,
          rejectedCount: json.rejectedCount,
        };
      }
      return { success: false, message: json.error || 'تعذر قراءة الرسائل' };
    } catch (e) {
      console.error(e);
      return { success: false, message: 'خطأ في الاتصال بالخادم' };
    }
  };

  // Trigger Driver GPS event & build/send Sabafon SMS
  const triggerDriverGPSUpdate = (
    eventType: GPSEventType,
    lat: number,
    lng: number,
    speed: number = 0,
    customerId?: string
  ): { rawSms: string; sentViaNativeBridge: boolean } => {
    const activeTrip = trips.find((t) => t.status === 'in_progress') || trips.find((t) => t.status === 'approved');
    const tripNumber = activeTrip?.tripNumber || 'TRIP-2026-0002';
    const seq = (smsLogs.length || 0) + (offlineState.pendingGpsEvents.length || 0) + 1;

    const rawSms = buildWaterSMS({
      tripNumber,
      eventType,
      lat,
      lng,
      speed,
      sequenceNumber: seq,
      customerId,
    });

    // Optional Native Android APK Bridge (when wrapped with WebView JavascriptInterface)
    let sentViaNativeBridge = false;
    if (typeof window !== 'undefined' && typeof window.MiyahnaAndroidSMS?.sendSms === 'function') {
      try {
        sentViaNativeBridge = Boolean(
          window.MiyahnaAndroidSMS.sendSms(settings.sabafonCenterNumber, rawSms)
        );
      } catch (bridgeErr) {
        console.warn('Android SMS bridge sendSms failed:', bridgeErr);
      }
    }

    // If online, also sync directly with server SMS gateway
    if (isOnline) {
      sendSabafonSMS(rawSms);
    } else {
      // Queue locally in driver offline store
      const gps: GPSEvent = {
        id: `gps-off-${Date.now()}`,
        tripId: activeTrip?.id || 'trip-2026-0002',
        tripNumber,
        timestamp: new Date().toISOString(),
        eventType,
        lat,
        lng,
        speed,
        customerId,
        source: 'sms',
        rawSmsText: rawSms,
        sequenceNumber: seq,
        isProcessed: false,
      };
      const sms: SMSMessage = {
        id: `sms-off-${Date.now()}`,
        messageId: `MSG-LOCAL-${seq}`,
        senderNumber: settings.driverSabafonNumber,
        tripId: activeTrip?.id || 'trip-2026-0002',
        tripNumber,
        sequenceNumber: seq,
        eventType,
        lat,
        lng,
        speed,
        customerId,
        timeString: new Date().toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit' }),
        rawText: rawSms,
        receivedAt: new Date().toISOString(),
        status: 'processed',
      };
      const nextOff = queueGpsAndSms(offlineState, gps, sms);
      setOfflineState(nextOff);
    }

    return { rawSms, sentViaNativeBridge };
  };

  // Sync Offline Driver Data back to server
  const syncOfflineData = async (): Promise<number> => {
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pendingDeliveries: offlineState.pendingDeliveries,
          pendingOrders: offlineState.pendingOrders,
          pendingGpsEvents: offlineState.pendingGpsEvents,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          // Clear offline queues
          const cleared: OfflineState = {
            ...offlineState,
            pendingDeliveries: [],
            pendingOrders: [],
            pendingGpsEvents: [],
            lastSyncTimestamp: new Date().toISOString(),
          };
          setOfflineState(cleared);
          saveOfflineState(cleared);
          fetchState();
          return json.syncedCount || 0;
        }
      }
    } catch (e) {
      console.error('Sync failed:', e);
    }
    return 0;
  };

  return (
    <AppContext.Provider
      value={{
        viewMode,
        setViewMode,
        managerTab,
        setManagerTab,
        customers,
        orders,
        trips,
        invoices,
        reconciliations,
        expenses,
        gpsEvents,
        smsLogs,
        truck,
        settings,
        clusterProposals,
        isLoading,
        isOnline,
        setIsOnline,
        offlineState,
        addCustomer,
        updateCustomer,
        addOrder,
        updateOrder,
        approveTrip,
        startTrip,
        completeTrip,
        logDeliveryStop,
        createTripFromCluster,
        submitDriverReconciliation,
        addExpense,
        updateSettings,
        updateTruck,
        resetDemoData,
        clearDemoData,
        sendSabafonSMS,
        importSabafonSMSBatch,
        triggerDriverGPSUpdate,
        syncOfflineData,
        savedRole,
        selectRole,
        logoutToRoleSelection,
        managerPin,
        updateManagerPin,
        verifyManagerPin,
        isMobileSidebarOpen,
        setIsMobileSidebarOpen,
        isChangePinModalOpen,
        setIsChangePinModalOpen,
        selectedCustomer,
        setSelectedCustomer,
        selectedOrder,
        setSelectedOrder,
        selectedTrip,
        setSelectedTrip,
        printInvoice,
        setPrintInvoice,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
