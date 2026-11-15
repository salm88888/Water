/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Application Context & State Provider
 * Offline-First IndexedDB Persistence, Automatic Background Sync, Trip Approval Workflow, & GPS Tracking.
 */

import React, { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from 'react';
import {
  Customer,
  Order,
  Trip,
  Invoice,
  Expense,
  GPSEvent,
  SystemSettings,
  Truck,
  DriverReconciliation,
  ClusterProposal,
  TripCustomerStop,
  TripGPSPoint,
  AppNotification,
  ManagerDirective,
  RealtimePresence,
  DriverAccount,
  DriverSession,
} from '../types';
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
} from '../lib/marib-data';
import { generateSmartClusters } from '../lib/clustering';
import { analyzeGpsTrack, haversineDistanceMeters } from '../lib/gps-tracker';
import {
  loadOfflineState,
  saveOfflineState,
  resetOfflineState,
  queueDeliveryAction,
  queueOfflineOrder,
  queueOfflineCustomer,
  queueGpsPoint,
  OfflineState,
} from '../lib/offline-sync';
import {
  idbSaveTrip,
  idbAppendGpsPoint,
  idbSaveStops,
  idbQueueDelivery,
  idbQueueOrder,
  idbQueueCustomer,
  idbQueueReturnEvent,
  idbGetPendingSyncSnapshot,
  idbMarkSyncedByIds,
  idbGetTrips,
  idbClearAllDriverData,
  idbSetMeta,
} from '../lib/offline-db';

export type AppViewMode = 'manager' | 'driver';

export type ManagerTab =
  | 'overview'
  | 'customers'
  | 'orders'
  | 'clustering'
  | 'trips'
  | 'map'
  | 'invoices'
  | 'reconciliation'
  | 'expenses'
  | 'profitability'
  | 'reports'
  | 'driver_mgmt'
  | 'settings'
  | 'manual';

interface AppContextType {
  viewMode: AppViewMode;
  setViewMode: (mode: AppViewMode) => void;
  managerTab: ManagerTab;
  setManagerTab: (tab: ManagerTab) => void;

  customers: Customer[];
  orders: Order[];
  trips: Trip[];
  invoices: Invoice[];
  reconciliations: DriverReconciliation[];
  expenses: Expense[];
  gpsEvents: GPSEvent[];
  notifications: AppNotification[];
  directives: ManagerDirective[];
  presence: RealtimePresence;
  wsConnected: boolean;
  unreadManagerCount: number;
  unreadDriverCount: number;
  latestToastNotification: AppNotification | null;
  dismissToastNotification: () => void;
  truck: Truck;
  settings: SystemSettings;
  clusterProposals: ClusterProposal[];
  isLoading: boolean;
  isOnline: boolean;
  setIsOnline: (online: boolean) => void;
  isSyncing: boolean;
  pendingSyncCount: number;
  lastAutoSyncResult: string | null;

  offlineState: OfflineState;

  // Customers & Orders
  addCustomer: (customer: Partial<Customer>) => Promise<Customer>;
  updateCustomer: (id: string, customer: Partial<Customer>) => Promise<void>;
  addOrder: (order: Partial<Order>) => Promise<{ order: Order; duplicateWarning?: boolean }>;
  updateOrder: (id: string, order: Partial<Order>) => Promise<void>;

  // Trip Planner (Manager Only) & Approval Workflow
  createTripPlan: (params: {
    customerStops: TripCustomerStop[];
    approveImmediately?: boolean;
    submitImmediately?: boolean;
    createdByRole?: 'manager';
    driverId?: string;
    driverName?: string;
    notes?: string;
  }) => Promise<Trip>;
  updateTripPlan: (
    tripId: string,
    customerStops: TripCustomerStop[],
    notes?: string,
    driverId?: string
  ) => Promise<{ success: boolean; error?: string }>;
  submitTripForApproval: (tripId: string) => Promise<{ success: boolean; error?: string }>;
  approveTrip: (tripId: string, notes?: string) => Promise<void>;
  rejectTrip: (tripId: string, reason: string) => Promise<void>;
  returnTripForEdit: (tripId: string, reason: string) => Promise<void>;
  respondToManagerTrip: (
    tripId: string,
    decision: 'accepted' | 'declined',
    reason?: string
  ) => Promise<{ success: boolean; error?: string; data?: Trip }>;
  requestTripModification: (tripId: string, proposedStops: TripCustomerStop[], reason: string) => Promise<{ success: boolean; error?: string }>;
  approveTripModification: (tripId: string, requestId: string, reviewNotes?: string) => Promise<void>;
  rejectTripModification: (tripId: string, requestId: string, reviewNotes?: string) => Promise<void>;
  startTrip: (tripId: string, lat?: number, lng?: number) => Promise<{ success: boolean; error?: string }>;
  recordGpsTelemetryPoint: (tripId: string, point: Omit<TripGPSPoint, 'id' | 'seq' | 'distanceFromPrevKm' | 'tripId'>) => Promise<void>;
  completeTripReturn: (params: {
    tripId: string;
    lat: number;
    lng: number;
    detectedAutomatically: boolean;
  }) => Promise<void>;
  closeTripAfterReview: (tripId: string, reviewNotes?: string) => Promise<void>;
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
  syncOfflineData: () => Promise<number>;

  // Two-Way Real-Time Notifications & Manager->Driver Directives
  markNotificationsRead: (opts: { ids?: string[]; markAll?: boolean; role?: 'manager' | 'driver' }) => Promise<void>;
  sendManagerDirective: (params: {
    title: string;
    message: string;
    priority: 'normal' | 'urgent';
    tripId?: string;
    tripNumber?: string;
    customerId?: string;
    customerName?: string;
  }) => Promise<{ success: boolean; data?: ManagerDirective; error?: string }>;
  acknowledgeDirective: (id: string, driverReply?: string) => Promise<void>;
  completeDirective: (id: string, driverReply?: string) => Promise<void>;

  // Driver Accounts & Auth
  driverAccounts: DriverAccount[];
  driverSession: DriverSession | null;
  demoClearedNotice: string | null;
  dismissDemoClearedNotice: () => void;
  loginDriver: (
    usernameOrPhone: string,
    password: string
  ) => Promise<{ success: boolean; error?: string; data?: DriverSession }>;
  registerDriverAccount: (payload: {
    name: string;
    phone: string;
    username?: string;
    password: string;
    licenseNumber?: string;
  }) => Promise<{ success: boolean; error?: string; data?: DriverAccount }>;
  logoutDriver: () => void;
  createDriverAccount: (payload: {
    name: string;
    phone: string;
    username?: string;
    password: string;
    licenseNumber?: string;
    assignToTruck?: boolean;
  }) => Promise<{ success: boolean; error?: string }>;
  approveDriverAccount: (driverId: string) => Promise<void>;
  rejectDriverAccount: (driverId: string, reason?: string) => Promise<void>;
  toggleSuspendDriverAccount: (driverId: string) => Promise<void>;
  updateDriverAccount: (
    driverId: string,
    updates: Partial<DriverAccount>
  ) => Promise<{ success: boolean; error?: string }>;
  assignDriverToTruck: (driverId: string) => Promise<void>;
  deleteDriverAccount: (driverId: string) => Promise<void>;

  // Auth & UI
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
const SAVED_DRIVER_SESSION_KEY = 'miyahna_driver_session_v1';
const LOCAL_DEMO_RESET_VERSION_KEY = 'miyahna_demo_reset_version';
const DEFAULT_MANAGER_PIN = '20262027';

export function AppProvider({ children }: { children: ReactNode }) {
  const [savedRole, setSavedRole] = useState<'manager' | 'driver' | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlMode = params.get('mode') || params.get('role');
      if (urlMode === 'driver') {
        try {
          localStorage.setItem(SAVED_ROLE_KEY, 'driver');
        } catch {
          // ignore storage restrictions
        }
        return 'driver';
      }
    }
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
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlMode = params.get('mode') || params.get('role');
      if (urlMode === 'driver') return 'driver';
    }
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(SAVED_ROLE_KEY);
      if (stored === 'driver') return 'driver';
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

  const [managerTab, setManagerTab] = useState<ManagerTab>('overview');

  const [customers, setCustomers] = useState<Customer[]>(INITIAL_CUSTOMERS);
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);
  const [trips, setTrips] = useState<Trip[]>(INITIAL_TRIPS);
  const [invoices, setInvoices] = useState<Invoice[]>(INITIAL_INVOICES);
  const [reconciliations, setReconciliations] = useState<DriverReconciliation[]>(INITIAL_RECONCILIATION);
  const [expenses, setExpenses] = useState<Expense[]>(INITIAL_EXPENSES);
  const [gpsEvents, setGpsEvents] = useState<GPSEvent[]>(INITIAL_GPS_EVENTS);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [directives, setDirectives] = useState<ManagerDirective[]>([]);
  const [presence, setPresence] = useState<RealtimePresence>({
    managerConnected: false,
    managerCount: 0,
    driverConnected: false,
    driverCount: 0,
  });
  const [wsConnected, setWsConnected] = useState(false);
  const [latestToastNotification, setLatestToastNotification] = useState<AppNotification | null>(null);
  const [driverAccounts, setDriverAccounts] = useState<DriverAccount[]>(INITIAL_DRIVER_ACCOUNTS);
  const [driverSession, setDriverSession] = useState<DriverSession | null>(() => {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(SAVED_DRIVER_SESSION_KEY);
        if (raw) return JSON.parse(raw) as DriverSession;
      } catch {
        // ignore invalid stored session
      }
    }
    return null;
  });
  const [demoClearedNotice, setDemoClearedNotice] = useState<string | null>(null);

  const [truck, setTruck] = useState<Truck>(INITIAL_TRUCK);
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);

  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnlineState] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [lastAutoSyncResult, setLastAutoSyncResult] = useState<string | null>(null);
  const [offlineState, setOfflineState] = useState<OfflineState>(loadOfflineState());

  const syncInFlightRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  const viewModeRef = useRef<AppViewMode>(viewMode);
  viewModeRef.current = viewMode;
  const driverSessionRef = useRef<DriverSession | null>(driverSession);
  driverSessionRef.current = driverSession;

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [printInvoice, setPrintInvoice] = useState<Invoice | null>(null);

  const clusterProposals = generateSmartClusters(orders, settings, truck.maxCapacityLiters);

  const saveDriverSession = useCallback((session: DriverSession | null) => {
    setDriverSession(session);
    driverSessionRef.current = session;
    if (typeof localStorage !== 'undefined') {
      if (session) {
        localStorage.setItem(SAVED_DRIVER_SESSION_KEY, JSON.stringify(session));
      } else {
        localStorage.removeItem(SAVED_DRIVER_SESSION_KEY);
      }
    }
  }, []);

  const purgeDriverLocalData = useCallback(
    async (targetVersion: number, reason?: string, serverAccounts?: DriverAccount[]) => {
      await idbClearAllDriverData();
      const emptyOffline = resetOfflineState();
      setOfflineState(emptyOffline);
      setPendingSyncCount(0);
      setLastAutoSyncResult(null);
      setSelectedTrip(null);

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LOCAL_DEMO_RESET_VERSION_KEY, String(targetVersion));
      }
      await idbSetMeta('demoResetVersion', targetVersion);

      const curSession = driverSessionRef.current;
      if (curSession) {
        const stillValid = Array.isArray(serverAccounts)
          ? serverAccounts.some((d) => d.id === curSession.id && d.status === 'approved')
          : !curSession.isDemo;
        if (!stillValid) {
          saveDriverSession(null);
        }
      }

      if (reason === 'demo:cleared' && viewModeRef.current === 'driver') {
        setDemoClearedNotice('تم مسح جميع البيانات التجريبية وتصفير سجلات السائق المحلية من قِبل المدير.');
      }
    },
    [saveDriverSession]
  );

  const dismissDemoClearedNotice = useCallback(() => {
    setDemoClearedNotice(null);
  }, []);

  const refreshPendingSyncCount = useCallback(async () => {
    const snap = await idbGetPendingSyncSnapshot();
    setPendingSyncCount(snap.totalPendingCount);
  }, []);

  const setIsOnline = useCallback((online: boolean) => {
    setIsOnlineState(online);
  }, []);

  const fetchState = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/state');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const serverSettings: SystemSettings = json.data.settings;
          const serverAccounts: DriverAccount[] = Array.isArray(json.data.driverAccounts)
            ? json.data.driverAccounts
            : [];
          const serverResetVersion = Number(serverSettings?.demoResetVersion || 0);
          const localResetVersion =
            typeof localStorage !== 'undefined'
              ? Number(localStorage.getItem(LOCAL_DEMO_RESET_VERSION_KEY) || '0')
              : 0;

          if (serverResetVersion > localResetVersion) {
            await purgeDriverLocalData(serverResetVersion, 'demo:cleared', serverAccounts);
          } else {
            // Ensure current driverSession is still approved & active on server
            const curSession = driverSessionRef.current;
            if (curSession && serverAccounts.length > 0) {
              const matched = serverAccounts.find((d) => d.id === curSession.id);
              if (!matched || matched.status !== 'approved') {
                saveDriverSession(null);
              }
            } else if (curSession && serverAccounts.length === 0) {
              saveDriverSession(null);
            }
          }

          setDriverAccounts(serverAccounts);
          setCustomers(json.data.customers);
          setOrders(json.data.orders);

          // Merge any local unsynced trips/GPS telemetry stored in IndexedDB so local state is never lost on refresh
          const localTrips = await idbGetTrips();
          const serverTrips: Trip[] = json.data.trips || [];
          const mergedTripsMap = new Map<string, Trip>(serverTrips.map((t) => [t.id, t]));
          for (const lt of localTrips) {
            const existing = mergedTripsMap.get(lt.id);
            if (!existing || lt.syncStatus === 'pending_sync' || lt.syncStatus === 'local_only') {
              mergedTripsMap.set(lt.id, lt);
            }
          }
          setTrips(Array.from(mergedTripsMap.values()));

          setInvoices(json.data.invoices);
          setReconciliations(json.data.reconciliations);
          setExpenses(json.data.expenses);
          setGpsEvents(json.data.gpsEvents);
          if (Array.isArray(json.data.notifications)) {
            setNotifications(json.data.notifications);
          }
          if (Array.isArray(json.data.directives)) {
            setDirectives(json.data.directives);
          }
          if (json.data.presence) {
            setPresence(json.data.presence);
          }
          setTruck(json.data.truck);
          setSettings(serverSettings);
        }
      }
    } catch (err) {
      console.warn('API fetchState offline fallback, restoring IndexedDB trips:', err);
      const localTrips = await idbGetTrips();
      if (localTrips.length > 0) {
        setTrips(localTrips);
      }
    } finally {
      setIsLoading(false);
    }
  }, [purgeDriverLocalData, saveDriverSession]);

  useEffect(() => {
    fetchState();
    refreshPendingSyncCount();
  }, [fetchState, refreshPendingSyncCount]);

  // Idempotent Automatic & Manual Sync Engine
  const syncOfflineData = useCallback(async (): Promise<number> => {
    if (!isOnline || syncInFlightRef.current) return 0;
    const snap = await idbGetPendingSyncSnapshot();
    if (snap.totalPendingCount === 0) return 0;

    syncInFlightRef.current = true;
    setIsSyncing(true);
    try {
      const localResetVersion =
        typeof localStorage !== 'undefined'
          ? Number(localStorage.getItem(LOCAL_DEMO_RESET_VERSION_KEY) || '0')
          : 0;
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offlineTrips: snap.unsyncedTrips,
          gpsPoints: snap.unsyncedPoints,
          detectedStops: snap.unsyncedStops,
          pendingDeliveries: snap.unsyncedDeliveries,
          pendingOrders: snap.unsyncedOrders,
          pendingCustomers: snap.unsyncedCustomers,
          returnEvents: snap.unsyncedReturnEvents,
          clientDemoResetVersion: localResetVersion,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.demoResetRequired) {
          await purgeDriverLocalData(
            Number(json.demoResetVersion || 1),
            'demo:cleared',
            json.updatedState?.driverAccounts
          );
          await fetchState();
          return 0;
        }
        if (json.success && json.acks) {
          // Only mark synced items explicitly acknowledged by server
          await idbMarkSyncedByIds(json.acks);

          const ackedDeliverySet = new Set<string>(json.acks.deliveryIds || []);
          const ackedOrderSet = new Set<string>(json.acks.orderIds || []);
          const ackedCustomerSet = new Set<string>(json.acks.customerIds || []);
          const ackedPointSet = new Set<string>(json.acks.pointIds || []);

          setOfflineState((prev) => {
            const next: OfflineState = {
              ...prev,
              pendingDeliveries: prev.pendingDeliveries.filter((d) => !ackedDeliverySet.has(d.id)),
              pendingOrders: prev.pendingOrders.filter((o) => !ackedOrderSet.has(o.id)),
              pendingCustomers: (prev.pendingCustomers || []).filter((c) => !ackedCustomerSet.has(c.id)),
              pendingGpsPoints: prev.pendingGpsPoints.filter((p) => !ackedPointSet.has(p.id)),
              lastSyncTimestamp: json.timestamp || new Date().toISOString(),
            };
            saveOfflineState(next);
            return next;
          });

          await refreshPendingSyncCount();
          await fetchState();

          const count = json.syncedCount || 0;
          if (count > 0) {
            setLastAutoSyncResult(`تمت مزامنة ${count} سجلات تلقائياً بنجاح`);
            setTimeout(() => setLastAutoSyncResult(null), 5000);
          }
          return count;
        }
      }
    } catch (e) {
      console.error('Auto-sync deferred (offline/network error):', e);
    } finally {
      syncInFlightRef.current = false;
      setIsSyncing(false);
    }
    return 0;
  }, [isOnline, fetchState, refreshPendingSyncCount, purgeDriverLocalData]);

  // Detect browser online/offline transitions + trigger automatic sync
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => {
      setIsOnlineState(true);
    };
    const handleOffline = () => {
      setIsOnlineState(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Automatically sync whenever connection returns or pending queue exists while online
  useEffect(() => {
    if (isOnline && pendingSyncCount > 0) {
      syncOfflineData();
    }
  }, [isOnline, pendingSyncCount, syncOfflineData]);

  // Periodic background retry every 20 seconds when online & pending items exist
  useEffect(() => {
    if (!isOnline) return;
    const timer = setInterval(() => {
      syncOfflineData();
    }, 20000);
    return () => clearInterval(timer);
  }, [isOnline, syncOfflineData]);

  // Persistent Real-Time WebSocket Connection (/ws/realtime) for instant Manager <-> Driver sync
  useEffect(() => {
    if (typeof window === 'undefined' || !isOnline) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsConnected(false);
      return;
    }

    let isDisposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let toastTimer: ReturnType<typeof setTimeout> | null = null;
    let hasConnectedOnce = false;

    const connect = () => {
      if (isDisposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const url = `${protocol}://${window.location.host}/ws/realtime?role=${viewModeRef.current}`;
      const sock = new WebSocket(url);
      wsRef.current = sock;

      sock.onopen = () => {
        if (isDisposed) {
          sock.close();
          return;
        }
        setWsConnected(true);
        if (hasConnectedOnce) {
          // State sync on reconnect
          fetchState();
          syncOfflineData();
        }
        hasConnectedOnce = true;

        if (pingTimer) clearInterval(pingTimer);
        pingTimer = setInterval(() => {
          if (sock.readyState === WebSocket.OPEN) {
            sock.send(JSON.stringify({ type: 'presence:ping', role: viewModeRef.current }));
          }
        }, 25000);
      };

      sock.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.presence) {
            setPresence(msg.presence);
          }
          if (msg.type === 'state:updated') {
            if (msg.reason === 'demo:cleared') {
              await purgeDriverLocalData(Number(msg.demoResetVersion || 1), 'demo:cleared');
            }
            fetchState();
            if (msg.notification) {
              const notif = msg.notification as AppNotification;
              setNotifications((prev) =>
                prev.some((n) => n.id === notif.id) ? prev : [notif, ...prev].slice(0, 250)
              );
              if (notif.targetRole === viewModeRef.current) {
                setLatestToastNotification(notif);
                if (toastTimer) clearTimeout(toastTimer);
                toastTimer = setTimeout(() => {
                  setLatestToastNotification((cur) => (cur?.id === notif.id ? null : cur));
                }, 7000);
              }
            }
          }
        } catch {
          // ignore malformed frames
        }
      };

      sock.onclose = () => {
        setWsConnected(false);
        if (pingTimer) clearInterval(pingTimer);
        if (!isDisposed) {
          reconnectTimer = setTimeout(connect, 2500);
        }
      };

      sock.onerror = () => {
        sock.close();
      };
    };

    connect();

    return () => {
      isDisposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pingTimer) clearInterval(pingTimer);
      if (toastTimer) clearTimeout(toastTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [isOnline, fetchState, syncOfflineData, purgeDriverLocalData]);

  // Notify WebSocket hub immediately whenever user switches Manager <-> Driver view
  useEffect(() => {
    const sock = wsRef.current;
    if (sock && sock.readyState === WebSocket.OPEN) {
      sock.send(
        JSON.stringify({
          type: 'presence:hello',
          role: viewMode,
          name: viewMode === 'driver' ? driverSession?.name || truck.driverName : 'المدير العام',
        })
      );
    }
  }, [viewMode, truck.driverName, driverSession?.name]);

  // Keep active/approved trip synced into IndexedDB
  useEffect(() => {
    const activeOrApproved = trips.filter((t) =>
      ['draft', 'pending_approval', 'approved', 'in_progress', 'returned_to_plant', 'pending_sync'].includes(t.status)
    );
    activeOrApproved.forEach((t) => {
      idbSaveTrip(t);
    });
  }, [trips]);

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

  const addCustomer = async (cust: Partial<Customer>): Promise<Customer> => {
    const actorName = viewMode === 'driver' ? (driverSession?.name || truck.driverName) : 'الإدارة';
    if (isOnline) {
      try {
        const res = await fetch('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...cust,
            actorRole: viewMode,
            actorName,
          }),
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
    }

    const custId = `cust-off-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const offlineCust = {
      id: custId,
      name: cust.name || 'عميل جديد',
      phone: cust.phone || '710000000',
      district: cust.district || 'حي الروضة',
      addressDetails: cust.addressDetails || '',
      lat: cust.lat || settings.plantLocation.lat + 0.005,
      lng: cust.lng || settings.plantLocation.lng + 0.005,
      tankCapacityLiters: cust.tankCapacityLiters || 2000,
      notes: cust.notes || '',
      createdAt: new Date().toISOString(),
      actorName,
    };
    await idbQueueCustomer(offlineCust);
    setOfflineState((prev) => queueOfflineCustomer(prev, offlineCust));
    await refreshPendingSyncCount();

    const newSeq = customers.length + 1;
    const newCust: Customer = {
      id: custId,
      customerId: `CUST-${String(newSeq).padStart(4, '0')}`,
      name: offlineCust.name,
      phone: offlineCust.phone,
      altPhone: cust.altPhone || '',
      district: offlineCust.district,
      addressDetails: offlineCust.addressDetails,
      lat: offlineCust.lat,
      lng: offlineCust.lng,
      tankCapacityLiters: offlineCust.tankCapacityLiters,
      tankRemainingLiters: 0,
      notes: offlineCust.notes,
      createdAt: offlineCust.createdAt,
      isActive: true,
      totalOrdersCount: 0,
      totalLitersDelivered: 0,
      isOfflineCreated: true,
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
    const actorName = viewMode === 'driver' ? (driverSession?.name || truck.driverName) : undefined;
    if (!isOnline) {
      const offlineOrderId = `ord-off-${Date.now()}`;
      const offlineOrder = {
        id: offlineOrderId,
        customerId: orderPayload.customerId,
        customerName: orderPayload.customerName || 'عميل',
        phone: orderPayload.phone || '',
        district: orderPayload.district || 'حي الروضة',
        addressDetails: orderPayload.addressDetails || '',
        lat: orderPayload.lat || settings.plantLocation.lat + 0.004,
        lng: orderPayload.lng || settings.plantLocation.lng + 0.004,
        tankCapacity: orderPayload.tankCapacity || 2000,
        requestedLiters: orderPayload.requestedLiters || orderPayload.tankCapacity || 2000,
        pricePerLiter: orderPayload.pricePerLiter || settings.defaultSellingPricePerLiter,
        totalAmount:
          (orderPayload.requestedLiters || orderPayload.tankCapacity || 2000) *
          (orderPayload.pricePerLiter || settings.defaultSellingPricePerLiter),
        source: 'driver_manual' as const,
        isUrgent: Boolean(orderPayload.isUrgent),
        notes: orderPayload.notes,
        createdAt: new Date().toISOString(),
        actorName,
      };
      await idbQueueOrder(offlineOrder);
      const updatedOffline = queueOfflineOrder(offlineState, offlineOrder);
      setOfflineState(updatedOffline);
      await refreshPendingSyncCount();

      const localOrder: Order = {
        ...offlineOrder,
        orderNumber: `ORD-OFF-${Date.now().toString().slice(-4)}`,
        customerId: offlineOrder.customerId || 'cust-offline',
        lat: offlineOrder.lat,
        lng: offlineOrder.lng,
        status: 'waiting_clustering',
      };
      setOrders((prev) => [localOrder, ...prev]);
      return { order: localOrder };
    }

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...orderPayload,
          actorName,
        }),
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
      tankRemainingLiters: 0,
      requestedLiters: orderPayload.requestedLiters || orderPayload.tankCapacity || 2000,
      pricePerLiter: orderPayload.pricePerLiter || settings.defaultSellingPricePerLiter,
      totalAmount:
        (orderPayload.requestedLiters || orderPayload.tankCapacity || 2000) *
        (orderPayload.pricePerLiter || settings.defaultSellingPricePerLiter),
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

  const createTripPlan = async (params: {
    customerStops: TripCustomerStop[];
    approveImmediately?: boolean;
    submitImmediately?: boolean;
    createdByRole?: 'manager';
    driverId?: string;
    driverName?: string;
    notes?: string;
  }): Promise<Trip> => {
    if (viewMode === 'driver' && params.createdByRole !== 'manager') {
      throw new Error('السائق يرفع طلبات أو زبائن فقط؛ إعداد مخطط الرحلة من مهام المدير.');
    }

    const stops = params.customerStops.map((s, idx) => ({ ...s, stopSequence: idx + 1 }));
    const approveNow = params.approveImmediately ?? params.submitImmediately ?? true;

    const res = await fetch('/api/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerStops: stops,
        approveImmediately: approveNow,
        createdByRole: 'manager',
        driverId: params.driverId || truck.driverId,
        driverName: params.driverName || truck.driverName,
        actorName: 'المدير العام',
        notes: params.notes,
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'تعذر إنشاء مخطط الرحلة');
    }
    await idbSaveTrip(json.data);
    await fetchState();
    return json.data;
  };

  const updateTripPlan = async (
    tripId: string,
    customerStops: TripCustomerStop[],
    notes?: string,
    driverId?: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/trips/${tripId}/plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerStops,
          notes,
          driverId,
          actorRole: 'manager',
          actorName: 'المدير العام',
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return { success: false, error: json.error || 'تعذر تعديل المخطط' };
      }
      await fetchState();
      return { success: true };
    } catch {
      return { success: false, error: 'تعذر الاتصال بالخادم لتعديل المخطط' };
    }
  };

  const submitTripForApproval = async (tripId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/trips/${tripId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorRole: 'manager', actorName: 'المدير العام' }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return { success: false, error: json.error || 'تعذر إرسال المخطط' };
      }
      await fetchState();
      return { success: true };
    } catch {
      return { success: false, error: 'تعذر الاتصال بالخادم' };
    }
  };

  const approveTrip = async (tripId: string, notes?: string): Promise<void> => {
    try {
      const res = await fetch(`/api/trips/${tripId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerName: 'المدير العام', notes }),
      });
      if (res.ok) {
        await fetchState();
        return;
      }
    } catch (e) {
      console.error(e);
    }
  };

  const rejectTrip = async (tripId: string, reason: string): Promise<void> => {
    try {
      await fetch(`/api/trips/${tripId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerName: 'المدير العام', reason }),
      });
      await fetchState();
    } catch (e) {
      console.error(e);
    }
  };

  const returnTripForEdit = async (tripId: string, reason: string): Promise<void> => {
    try {
      await fetch(`/api/trips/${tripId}/return-for-edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerName: 'المدير العام', reason }),
      });
      await fetchState();
    } catch (e) {
      console.error(e);
    }
  };

  const respondToManagerTrip = async (
    tripId: string,
    decision: 'accepted' | 'declined',
    reason?: string
  ): Promise<{ success: boolean; error?: string; data?: Trip }> => {
    if (decision === 'declined' && (!reason || !reason.trim())) {
      return { success: false, error: 'يرجى كتابة سبب عدم الموافقة على الرحلة ليظهر للمدير' };
    }
    try {
      const res = await fetch(`/api/trips/${tripId}/driver-respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          reason: reason?.trim() || '',
          driverName: driverSession?.name || truck.driverName,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return { success: false, error: json.error || 'تعذر تسجيل رد السائق' };
      }
      await idbSaveTrip(json.data);
      await fetchState();
      return { success: true, data: json.data };
    } catch {
      return { success: false, error: 'تعذر الاتصال بالخادم لإرسال رد السائق' };
    }
  };

  const requestTripModification = async (
    tripId: string,
    proposedStops: TripCustomerStop[],
    reason: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/trips/${tripId}/request-modification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposedStops, reason, requestedBy: driverSession?.name || truck.driverName }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return { success: false, error: json.error || 'تعذر إرسال طلب التعديل' };
      }
      await fetchState();
      return { success: true };
    } catch {
      return { success: false, error: 'تعذر الاتصال بالخادم' };
    }
  };

  const approveTripModification = async (tripId: string, requestId: string, reviewNotes?: string): Promise<void> => {
    try {
      await fetch(`/api/trips/${tripId}/approve-modification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, reviewNotes, managerName: 'المدير العام' }),
      });
      await fetchState();
    } catch (e) {
      console.error(e);
    }
  };

  const rejectTripModification = async (tripId: string, requestId: string, reviewNotes?: string): Promise<void> => {
    try {
      await fetch(`/api/trips/${tripId}/reject-modification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, reviewNotes, managerName: 'المدير العام' }),
      });
      await fetchState();
    } catch (e) {
      console.error(e);
    }
  };

  const startTrip = async (tripId: string, lat?: number, lng?: number): Promise<{ success: boolean; error?: string }> => {
    const target = trips.find((t) => t.id === tripId);
    if (!target || target.status !== 'approved') {
      return { success: false, error: 'ممنوع بدء الرحلة دون اعتماد صريح من المدير!' };
    }
    if (target.createdByRole === 'manager' && target.driverAcceptanceStatus === 'pending') {
      return { success: false, error: 'يرجى تأكيد موافقتك على طلب الرحلة من المدير قبل البدء!' };
    }
    if (target.createdByRole === 'manager' && target.driverAcceptanceStatus === 'declined') {
      return { success: false, error: 'تم تسجيل ردك بعدم الموافقة على هذه الرحلة؛ يرجى مراجعتها أولاً.' };
    }

    const startLat = lat ?? settings.plantLocation.lat;
    const startLng = lng ?? settings.plantLocation.lng;
    const startPointId = `pt-start-${tripId}-${Date.now()}`;

    if (isOnline) {
      try {
        const res = await fetch(`/api/trips/${tripId}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: startLat, lng: startLng, startPointId }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          return { success: false, error: json.error || 'تعذر بدء الرحلة' };
        }
        await idbSaveTrip(json.data);
        await fetchState();
        return { success: true };
      } catch (e) {
        console.error(e);
      }
    }

    // Approved trip started offline -> stored locally in IndexedDB with pending_sync status
    const nowIso = new Date().toISOString();
    const firstPt: TripGPSPoint = {
      id: startPointId,
      tripId,
      lat: startLat,
      lng: startLng,
      speedKmH: 0,
      accuracy: 10,
      timestamp: nowIso,
      seq: 1,
      distanceFromPrevKm: 0,
      source: 'gps_watch',
    };
    await idbAppendGpsPoint(firstPt);

    const updatedTrip: Trip = {
      ...target,
      status: 'in_progress',
      syncStatus: 'pending_sync',
      startedAt: nowIso,
      startLocation: { lat: startLat, lng: startLng },
      gpsPoints: [firstPt],
    };
    await idbSaveTrip(updatedTrip);
    setTrips((prev) => prev.map((t) => (t.id === tripId ? updatedTrip : t)));
    await refreshPendingSyncCount();
    return { success: true };
  };

  const recordGpsTelemetryPoint = async (
    tripId: string,
    rawPt: Omit<TripGPSPoint, 'id' | 'seq' | 'distanceFromPrevKm' | 'tripId'>
  ): Promise<void> => {
    const trip = trips.find((t) => t.id === tripId);
    if (!trip || trip.status !== 'in_progress') return;

    const pointId = `pt-${tripId}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const newPoint: TripGPSPoint = {
      ...rawPt,
      id: pointId,
      tripId,
      seq: (trip.gpsPoints?.length || 0) + 1,
      distanceFromPrevKm: 0,
    };

    const existingPoints = trip.gpsPoints || [];
    const analysis = analyzeGpsTrack({
      tripId,
      rawPoints: [...existingPoints, newPoint],
      approvedStops: trip.customerStops,
      settings,
    });

    const analyzedLatest = analysis.points.find((p) => p.id === pointId) || newPoint;

    // 1. Always save locally to IndexedDB first (Offline-First safety guarantee!)
    await idbAppendGpsPoint(analyzedLatest);
    if (analysis.detectedStops.length > 0) {
      await idbSaveStops(analysis.detectedStops);
    }

    const updatedTrip: Trip = {
      ...trip,
      gpsPoints: analysis.points,
      detectedStops: analysis.detectedStops,
      gpsGaps: analysis.gpsGaps,
      actualDistanceKm: analysis.totalDistanceKm,
      movingMinutes: analysis.movingMinutes,
      stoppedMinutes: analysis.stoppedMinutes,
      syncStatus: isOnline ? trip.syncStatus : 'pending_sync',
    };
    await idbSaveTrip(updatedTrip);

    setTrips((prev) => prev.map((t) => (t.id === tripId ? updatedTrip : t)));
    setOfflineState((prev) => queueGpsPoint(prev, analyzedLatest));
    setTruck((prev) => ({
      ...prev,
      lastLat: analyzedLatest.lat,
      lastLng: analyzedLatest.lng,
      lastSpeed: analyzedLatest.speedKmH,
      lastUpdateTimestamp: analyzedLatest.timestamp,
      lastEvent: analyzedLatest.speedKmH >= settings.minMovementSpeedKmH ? 'MOVING' : 'STOPPED',
    }));

    // 2. If online, push immediately and only mark synced after server ack
    if (isOnline) {
      try {
        const res = await fetch(`/api/trips/${tripId}/gps-batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points: [analyzedLatest] }),
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.acceptedIds)) {
            await idbMarkSyncedByIds({
              pointIds: json.acceptedIds,
              stopIds: analysis.detectedStops.map((s) => s.id),
            });
          }
        }
      } catch {
        // Remains unsynced in IndexedDB for automatic retry
      }
    }
    await refreshPendingSyncCount();
  };

  const completeTripReturn = async (params: {
    tripId: string;
    lat: number;
    lng: number;
    detectedAutomatically: boolean;
  }): Promise<void> => {
    const trip = trips.find((t) => t.id === params.tripId);
    if (!trip) return;

    const nowIso = new Date().toISOString();
    const distMeters = Math.round(
      haversineDistanceMeters(params.lat, params.lng, settings.plantLocation.lat, settings.plantLocation.lng)
    );

    if (isOnline) {
      try {
        // First ensure any buffered points are included
        const snap = await idbGetPendingSyncSnapshot();
        const tripPts = snap.unsyncedPoints.filter((p) => p.tripId === params.tripId);

        const res = await fetch(`/api/trips/${params.tripId}/complete-return`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat: params.lat,
            lng: params.lng,
            detectedAutomatically: params.detectedAutomatically,
            actualDistanceKm: trip.actualDistanceKm,
            gpsPoints: tripPts,
          }),
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success) {
            await idbMarkSyncedByIds({
              tripIds: [params.tripId],
              pointIds: tripPts.map((p) => p.id),
            });
            await fetchState();
            await refreshPendingSyncCount();
            return;
          }
        }
      } catch (e) {
        console.error('Online return completion failed, saving offline:', e);
      }
    }

    // Offline return confirmation: DO NOT mark synced yet! Status = 'pending_sync'
    await idbQueueReturnEvent({
      id: `ret-${params.tripId}-${Date.now()}`,
      tripId: params.tripId,
      lat: params.lat,
      lng: params.lng,
      distanceFromPlantMeters: distMeters,
      detectedAutomatically: params.detectedAutomatically,
      returnedAt: nowIso,
    });

    const offlineReturnedTrip: Trip = {
      ...trip,
      status: 'pending_sync',
      syncStatus: 'pending_sync',
      returnedToPlantAt: nowIso,
      completedAt: nowIso,
      returnLocation: {
        lat: params.lat,
        lng: params.lng,
        distanceFromPlantMeters: distMeters,
        detectedAutomatically: params.detectedAutomatically,
      },
    };
    await idbSaveTrip(offlineReturnedTrip);
    setTrips((prev) => prev.map((t) => (t.id === params.tripId ? offlineReturnedTrip : t)));
    setTruck((prev) => ({
      ...prev,
      status: 'idle',
      currentTripId: undefined,
      currentWaterLiters: 0,
      lastEvent: 'RETURN_PLANT',
      lastLat: params.lat,
      lastLng: params.lng,
    }));
    await refreshPendingSyncCount();
  };

  const closeTripAfterReview = async (tripId: string, reviewNotes?: string): Promise<void> => {
    try {
      await fetch(`/api/trips/${tripId}/close-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerName: 'المدير العام', reviewNotes }),
      });
      await fetchState();
    } catch (e) {
      console.error(e);
    }
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
          await fetchState();
          return json.data;
        }
      }
    } catch (e) {
      console.error(e);
    }
    return createTripPlan({
      customerStops: proposal.customerStops,
      approveImmediately: true,
      createdByRole: 'manager',
      notes: proposal.reason,
    });
  };

  const logDeliveryStop = async (params: {
    tripId: string;
    orderId: string;
    deliveredLiters: number;
    paidAmount: number;
    remainingAmount: number;
    notes?: string;
  }): Promise<void> => {
    if (!isOnline) {
      const activeTrip = trips.find((t) => t.id === params.tripId);
      const stop = activeTrip?.customerStops.find((s) => s.orderId === params.orderId);

      const deliveryAction = {
        id: `del-${params.orderId}-${Date.now()}`,
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

      await idbQueueDelivery(deliveryAction);
      const nextOffline = queueDeliveryAction(offlineState, deliveryAction);
      setOfflineState(nextOffline);

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
                    departureTime: deliveryAction.timestamp,
                  }
                : s
            );
            const totalDelivered = updatedStops.reduce((sum, s) => sum + s.deliveredLiters, 0);
            const updated = {
              ...t,
              customerStops: updatedStops,
              deliveredLiters: totalDelivered,
              remainingLiters: Math.max(0, t.initialLoadLiters - totalDelivered),
            };
            idbSaveTrip(updated);
            return updated;
          }
          return t;
        })
      );
      await refreshPendingSyncCount();
      return;
    }

    try {
      const res = await fetch(`/api/trips/${params.tripId}/delivery-stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (res.ok) {
        await fetchState();
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
        await fetchState();
        return;
      }
    } catch (e) {
      console.error(e);
    }
  };

  const addExpense = async (exp: Partial<Expense>): Promise<void> => {
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exp),
      });
      if (res.ok) {
        await fetchState();
        return;
      }
    } catch (e) {
      console.error(e);
    }
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
      await fetchState();
    } catch (e) {
      console.error(e);
    }
  };

  const clearDemoData = async (): Promise<void> => {
    try {
      const res = await fetch('/api/clear-demo', { method: 'POST' });
      const json = await res.json();
      const nextVersion = Number(json?.data?.settings?.demoResetVersion || (settings.demoResetVersion || 0) + 1);
      await purgeDriverLocalData(nextVersion, 'demo:cleared', json?.data?.driverAccounts);
      setSelectedCustomer(null);
      setSelectedOrder(null);
      setSelectedTrip(null);
      await fetchState();
    } catch (e) {
      console.error(e);
    }
  };

  // Driver Account Auth & Manager Approval Methods
  const loginDriver = async (
    usernameOrPhone: string,
    password: string
  ): Promise<{ success: boolean; error?: string; data?: DriverSession }> => {
    try {
      const res = await fetch('/api/drivers/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrPhone, password }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return { success: false, error: json.error || 'تعذر تسجيل دخول السائق' };
      }
      const session = json.data as DriverSession;
      saveDriverSession(session);
      await fetchState();
      return { success: true, data: session };
    } catch {
      return { success: false, error: 'تعذر الاتصال بالخادم للتحقق من حساب السائق' };
    }
  };

  const registerDriverAccount = async (payload: {
    name: string;
    phone: string;
    username?: string;
    password: string;
    licenseNumber?: string;
  }): Promise<{ success: boolean; error?: string; data?: DriverAccount }> => {
    try {
      const res = await fetch('/api/drivers/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return { success: false, error: json.error || 'تعذر إرسال طلب تسجيل الحساب' };
      }
      await fetchState();
      return { success: true, data: json.data };
    } catch {
      return { success: false, error: 'تعذر الاتصال بالخادم لإرسال طلب التسجيل' };
    }
  };

  const logoutDriver = useCallback(() => {
    saveDriverSession(null);
  }, [saveDriverSession]);

  const createDriverAccount = async (payload: {
    name: string;
    phone: string;
    username?: string;
    password: string;
    licenseNumber?: string;
    assignToTruck?: boolean;
  }): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return { success: false, error: json.error || 'تعذر إنشاء حساب السائق' };
      }
      await fetchState();
      return { success: true };
    } catch {
      return { success: false, error: 'تعذر الاتصال بالخادم' };
    }
  };

  const approveDriverAccount = async (driverId: string): Promise<void> => {
    try {
      await fetch(`/api/drivers/${driverId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerName: 'المدير العام' }),
      });
      await fetchState();
    } catch (e) {
      console.error(e);
    }
  };

  const rejectDriverAccount = async (driverId: string, reason?: string): Promise<void> => {
    try {
      await fetch(`/api/drivers/${driverId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      await fetchState();
    } catch (e) {
      console.error(e);
    }
  };

  const toggleSuspendDriverAccount = async (driverId: string): Promise<void> => {
    try {
      await fetch(`/api/drivers/${driverId}/toggle-suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerName: 'المدير العام' }),
      });
      await fetchState();
    } catch (e) {
      console.error(e);
    }
  };

  const updateDriverAccount = async (
    driverId: string,
    updates: Partial<DriverAccount>
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/drivers/${driverId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return { success: false, error: json.error || 'تعذر تحديث بيانات السائق' };
      }
      await fetchState();
      return { success: true };
    } catch {
      return { success: false, error: 'تعذر الاتصال بالخادم' };
    }
  };

  const assignDriverToTruck = async (driverId: string): Promise<void> => {
    try {
      await fetch(`/api/drivers/${driverId}/assign-truck`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      await fetchState();
    } catch (e) {
      console.error(e);
    }
  };

  const deleteDriverAccount = async (driverId: string): Promise<void> => {
    try {
      await fetch(`/api/drivers/${driverId}`, { method: 'DELETE' });
      await fetchState();
    } catch (e) {
      console.error(e);
    }
  };

  const dismissToastNotification = useCallback(() => {
    setLatestToastNotification(null);
  }, []);

  const markNotificationsRead = async (opts: {
    ids?: string[];
    markAll?: boolean;
    role?: 'manager' | 'driver';
  }): Promise<void> => {
    setNotifications((prev) =>
      prev.map((n) => {
        if (opts.markAll && (!opts.role || n.targetRole === opts.role)) {
          return { ...n, isRead: true };
        }
        if (opts.ids && opts.ids.includes(n.id)) {
          return { ...n, isRead: true };
        }
        return n;
      })
    );
    try {
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts),
      });
    } catch (e) {
      console.error(e);
    }
  };

  const sendManagerDirective = async (params: {
    title: string;
    message: string;
    priority: 'normal' | 'urgent';
    tripId?: string;
    tripNumber?: string;
    customerId?: string;
    customerName?: string;
  }): Promise<{ success: boolean; data?: ManagerDirective; error?: string }> => {
    try {
      const res = await fetch('/api/directives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, createdBy: 'المدير العام' }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return { success: false, error: json.error || 'تعذر إرسال التوجيه' };
      }
      await fetchState();
      return { success: true, data: json.data };
    } catch {
      return { success: false, error: 'تعذر الاتصال بالخادم لإرسال التوجيه' };
    }
  };

  const acknowledgeDirective = async (id: string, driverReply?: string): Promise<void> => {
    try {
      await fetch(`/api/directives/${id}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverName: driverSession?.name || truck.driverName, driverReply }),
      });
      await fetchState();
    } catch (e) {
      console.error(e);
    }
  };

  const completeDirective = async (id: string, driverReply?: string): Promise<void> => {
    try {
      await fetch(`/api/directives/${id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverName: driverSession?.name || truck.driverName, driverReply }),
      });
      await fetchState();
    } catch (e) {
      console.error(e);
    }
  };

  const unreadManagerCount = notifications.filter((n) => n.targetRole === 'manager' && !n.isRead).length;
  const unreadDriverCount = notifications.filter((n) => n.targetRole === 'driver' && !n.isRead).length;

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
        notifications,
        directives,
        presence,
        wsConnected,
        unreadManagerCount,
        unreadDriverCount,
        latestToastNotification,
        dismissToastNotification,
        truck,
        settings,
        clusterProposals,
        isLoading,
        isOnline,
        setIsOnline,
        isSyncing,
        pendingSyncCount,
        lastAutoSyncResult,
        offlineState,
        addCustomer,
        updateCustomer,
        addOrder,
        updateOrder,
        createTripPlan,
        updateTripPlan,
        submitTripForApproval,
        approveTrip,
        rejectTrip,
        returnTripForEdit,
        respondToManagerTrip,
        requestTripModification,
        approveTripModification,
        rejectTripModification,
        startTrip,
        recordGpsTelemetryPoint,
        completeTripReturn,
        closeTripAfterReview,
        logDeliveryStop,
        createTripFromCluster,
        submitDriverReconciliation,
        addExpense,
        updateSettings,
        updateTruck,
        resetDemoData,
        clearDemoData,
        syncOfflineData,
        markNotificationsRead,
        sendManagerDirective,
        acknowledgeDirective,
        completeDirective,
        driverAccounts,
        driverSession,
        demoClearedNotice,
        dismissDemoClearedNotice,
        loginDriver,
        registerDriverAccount,
        logoutDriver,
        createDriverAccount,
        approveDriverAccount,
        rejectDriverAccount,
        toggleSuspendDriverAccount,
        updateDriverAccount,
        assignDriverToTruck,
        deleteDriverAccount,
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
