/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Application Context & State Provider
 * Offline-First IndexedDB Persistence, Automatic Background Sync, Trip Approval Workflow, & GPS Tracking.
 */

import React, { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback, useMemo } from 'react';
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
  AL_WADI_DISTRICT_NAMES,
  DEFAULT_AL_WADI_DISTRICT,
  mergeDistrictLists,
} from '../lib/alwadi-districts';
import {
  loadOfflineState,
  saveOfflineState,
  resetOfflineState,
  queueDeliveryAction,
  queueOfflineOrder,
  queueOfflineCustomer,
  queueOfflineDistrict,
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
  idbQueueDistrict,
  idbQueueReturnEvent,
  idbGetPendingSyncSnapshot,
  idbMarkSyncedByIds,
  idbGetTrips,
  idbClearAllDriverData,
  idbSetMeta,
} from '../lib/offline-db';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  auth,
  ensureCloudUserProfile,
  getCloudIdToken,
  signInWithGoogle,
  signOutCloud,
  testFirestoreConnection,
} from '../lib/firebase';
import {
  clearKnownCloudMeta,
  clearOperationalCollectionsInCloud,
  type CloudCollectionName,
  deleteSingleCloudDoc,
  type FullLocalStateSnapshot,
  loadInitialCloudState,
  pushFullSnapshotToCloud,
  serializeCustomer,
  serializeOrder,
  serializeSettings,
  serializeTrip,
  serializeTruck,
  subscribeToCloudState,
  syncCollectionsDiffToCloud,
  upsertSingleCloudDoc,
} from '../lib/cloud-store';

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

  // Customers, Orders & Districts
  allDistricts: string[];
  addCustomDistrict: (name: string) => Promise<void>;
  addCustomer: (customer: Partial<Customer>) => Promise<Customer>;
  updateCustomer: (id: string, customer: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: string) => Promise<{ success: boolean; error?: string }>;
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
  approveTrip: (tripId: string, notes?: string) => Promise<{ success: boolean; error?: string }>;
  stopTripTracking: (tripId: string, reason?: string) => Promise<{ success: boolean; error?: string }>;
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
  triggerAutoDepartureTracking: (params: {
    lat: number;
    lng: number;
    speedKmH?: number;
    accuracy?: number;
    timestamp?: string;
    seedPoints?: Array<{ lat: number; lng: number; speedKmH?: number; accuracy?: number; timestamp: string }>;
  }) => Promise<{ success: boolean; trip?: Trip; suppressedCooldown?: boolean; reason?: string }>;
  recordGpsTelemetryPoint: (tripId: string, point: Omit<TripGPSPoint, 'id' | 'seq' | 'distanceFromPrevKm' | 'tripId'>) => Promise<void>;
  completeTripReturn: (params: {
    tripId: string;
    lat: number;
    lng: number;
    detectedAutomatically: boolean;
  }) => Promise<boolean>;
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

  // Cloud Auth & Firestore Persistence
  cloudUser: User | null;
  authReady: boolean;
  isCloudConnected: boolean;
  isCloudSyncing: boolean;
  cloudSyncError: string | null;
  lastCloudSyncAt: string | null;
  dismissCloudSyncError: () => void;
  signInWithGoogleAccount: () => Promise<{ success: boolean; error?: string }>;
  signOutGoogleAccount: () => Promise<void>;
  syncNowToCloud: () => Promise<void>;

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

  // Firebase Google Auth & Cloud Sync State
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);
  const [lastCloudSyncAt, setLastCloudSyncAt] = useState<string | null>(null);

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
  const cloudUserRef = useRef<User | null>(cloudUser);
  cloudUserRef.current = cloudUser;
  const cloudWriteCooldownUntilRef = useRef<number>(0);
  const lastGpsCloudSyncAtRef = useRef<number>(0);
  const hydrateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialServerFetchDoneRef = useRef(false);
  const cloudBootstrapPromiseRef = useRef<Promise<void> | null>(null);
  const autoDepartureLockRef = useRef(false);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [printInvoice, setPrintInvoice] = useState<Invoice | null>(null);

  const latestStateRef = useRef<FullLocalStateSnapshot>({
    settings,
    truck,
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
  });
  latestStateRef.current = {
    settings,
    truck,
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
  };

  const clusterProposals = generateSmartClusters(orders, settings, truck.maxCapacityLiters);

  const allDistricts = useMemo(
    () =>
      mergeDistrictLists(
        settings.customDistricts,
        customers.map((c) => c.district),
        offlineState.pendingDistricts
      ),
    [settings.customDistricts, customers, offlineState.pendingDistricts]
  );

  const makeClientRequestId = (prefix: string) =>
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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

  const hydrateExpressFromCloud = useCallback(async (partialSnap: Partial<FullLocalStateSnapshot>) => {
    try {
      await fetch('/api/cloud-hydrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partialSnap),
      });
    } catch (err) {
      console.warn('[Miyahna Cloud] Deferred Express hydrate:', err);
    }
  }, []);

  const syncSnapshotToSql = useCallback(async (snapshot: FullLocalStateSnapshot | null | undefined) => {
    if (!snapshot) return;
    const token = await getCloudIdToken();
    if (!token) return;
    try {
      await fetch('/api/sql/sync-state', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(snapshot),
      });
    } catch {
      // Silently defer SQL sync on offline/transient network issues
    }
  }, []);

  const pushCloudCollections = useCallback(
    async (
      snapshot: FullLocalStateSnapshot | null | undefined,
      collections: CloudCollectionName[]
    ) => {
      if (cloudBootstrapPromiseRef.current) {
        await cloudBootstrapPromiseRef.current.catch(() => {});
      }
      const user = cloudUserRef.current;
      if (!user || !user.emailVerified || !snapshot) return;
      try {
        setIsCloudSyncing(true);
        cloudWriteCooldownUntilRef.current = Date.now() + 2500;
        const [written] = await Promise.all([
          syncCollectionsDiffToCloud(snapshot, collections, user),
          syncSnapshotToSql(snapshot),
        ]);
        if (written > 0) {
          setLastCloudSyncAt(new Date().toISOString());
        }
        setCloudSyncError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setCloudSyncError(msg);
      } finally {
        setIsCloudSyncing(false);
      }
    },
    [syncSnapshotToSql]
  );

  const fetchState = useCallback(async (): Promise<FullLocalStateSnapshot | null> => {
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
          const mergedTrips = Array.from(mergedTripsMap.values());
          setTrips(mergedTrips);

          setInvoices(json.data.invoices);
          setReconciliations(json.data.reconciliations);
          setExpenses(json.data.expenses);
          setGpsEvents(json.data.gpsEvents);
          const nextNotifications = Array.isArray(json.data.notifications)
            ? json.data.notifications
            : [];
          setNotifications(nextNotifications);
          const nextDirectives = Array.isArray(json.data.directives)
            ? json.data.directives
            : [];
          setDirectives(nextDirectives);
          if (json.data.presence) {
            setPresence(json.data.presence);
          }
          setTruck(json.data.truck);
          setSettings(serverSettings);

          if (serverSettings?.managerPin) {
            setManagerPin(serverSettings.managerPin);
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem(SAVED_PIN_KEY, serverSettings.managerPin);
            }
          }

          initialServerFetchDoneRef.current = true;
          const snapshot: FullLocalStateSnapshot = {
            settings: serverSettings,
            truck: json.data.truck,
            driverAccounts: serverAccounts,
            customers: json.data.customers || [],
            orders: json.data.orders || [],
            trips: mergedTrips,
            invoices: json.data.invoices || [],
            reconciliations: json.data.reconciliations || [],
            expenses: json.data.expenses || [],
            gpsEvents: json.data.gpsEvents || [],
            notifications: nextNotifications,
            directives: nextDirectives,
          };
          latestStateRef.current = snapshot;
          return snapshot;
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
    return null;
  }, [purgeDriverLocalData, saveDriverSession]);

  useEffect(() => {
    fetchState();
    refreshPendingSyncCount();
    testFirestoreConnection();
  }, [fetchState, refreshPendingSyncCount]);

  // Firebase Auth Gate & Cloud Firestore Real-Time Bidirectional Persistence
  useEffect(() => {
    let cloudUnsubscribe: (() => void) | null = null;
    let isDisposed = false;

    const scheduleExpressHydrate = () => {
      if (Date.now() < cloudWriteCooldownUntilRef.current) return;
      if (hydrateDebounceRef.current) clearTimeout(hydrateDebounceRef.current);
      hydrateDebounceRef.current = setTimeout(() => {
        if (!isDisposed) {
          hydrateExpressFromCloud(latestStateRef.current);
        }
      }, 650);
    };

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (cloudUnsubscribe) {
        cloudUnsubscribe();
        cloudUnsubscribe = null;
      }

      if (isDisposed) return;
      setCloudUser(user);
      cloudUserRef.current = user;
      setAuthReady(true);

      if (!user || !user.emailVerified) {
        cloudBootstrapPromiseRef.current = null;
        clearKnownCloudMeta();
        return;
      }

      setIsCloudSyncing(true);
      setCloudSyncError(null);

      let resolveBootstrap!: () => void;
      cloudBootstrapPromiseRef.current = new Promise<void>((resolve) => {
        resolveBootstrap = resolve;
      });

      try {
        await testFirestoreConnection();
        await ensureCloudUserProfile(
          user,
          viewModeRef.current === 'driver' ? 'driver' : 'manager'
        );

        // Ensure Express server state is loaded at least once before seeding empty cloud
        let localSnap = latestStateRef.current;
        if (!initialServerFetchDoneRef.current) {
          const fetched = await fetchState();
          if (fetched) localSnap = fetched;
        }

        const cloudState = await loadInitialCloudState(user);
        if (isDisposed) return;

        if (cloudState.hasAnyCloudDocs) {
          const nextSettings = cloudState.settings || localSnap.settings;
          const nextTruck = cloudState.truck || localSnap.truck;

          // Merge any local unsynced trips in IndexedDB
          const localTrips = await idbGetTrips();
          const mergedTripsMap = new Map<string, Trip>(
            cloudState.trips.map((t) => [t.id, t])
          );
          for (const lt of localTrips) {
            const existing = mergedTripsMap.get(lt.id);
            if (!existing || lt.syncStatus === 'pending_sync' || lt.syncStatus === 'local_only') {
              mergedTripsMap.set(lt.id, lt);
            }
          }
          const mergedTrips = Array.from(mergedTripsMap.values());

          setSettings(nextSettings);
          if (nextSettings.managerPin) {
            setManagerPin(nextSettings.managerPin);
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem(SAVED_PIN_KEY, nextSettings.managerPin);
            }
          }
          setTruck(nextTruck);
          setDriverAccounts(cloudState.driverAccounts);
          setCustomers(cloudState.customers);
          setOrders(cloudState.orders);
          setTrips(mergedTrips);
          setInvoices(cloudState.invoices);
          setReconciliations(cloudState.reconciliations);
          setExpenses(cloudState.expenses);
          setGpsEvents(cloudState.gpsEvents);
          setNotifications(cloudState.notifications);
          setDirectives(cloudState.directives);

          const hydratedSnap: FullLocalStateSnapshot = {
            settings: nextSettings,
            truck: nextTruck,
            driverAccounts: cloudState.driverAccounts,
            customers: cloudState.customers,
            orders: cloudState.orders,
            trips: mergedTrips,
            invoices: cloudState.invoices,
            reconciliations: cloudState.reconciliations,
            expenses: cloudState.expenses,
            gpsEvents: cloudState.gpsEvents,
            notifications: cloudState.notifications,
            directives: cloudState.directives,
          };
          latestStateRef.current = hydratedSnap;
          await hydrateExpressFromCloud(hydratedSnap);
          void syncSnapshotToSql(hydratedSnap);
        } else {
          // Check if Cloud SQL already has persisted state before seeding
          let sqlHydratedSnap: FullLocalStateSnapshot | null = null;
          const token = await getCloudIdToken();
          if (token) {
            try {
              const sqlRes = await fetch('/api/sql/state', {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (sqlRes.ok) {
                const sqlJson = await sqlRes.json();
                if (sqlJson?.success && sqlJson.data?.hasData) {
                  sqlHydratedSnap = {
                    settings: sqlJson.data.settings || localSnap.settings,
                    truck: sqlJson.data.truck || localSnap.truck,
                    driverAccounts: sqlJson.data.driverAccounts || localSnap.driverAccounts,
                    customers: sqlJson.data.customers || localSnap.customers,
                    orders: sqlJson.data.orders || localSnap.orders,
                    trips: sqlJson.data.trips || localSnap.trips,
                    invoices: sqlJson.data.invoices || localSnap.invoices,
                    reconciliations: sqlJson.data.reconciliations || localSnap.reconciliations,
                    expenses: sqlJson.data.expenses || localSnap.expenses,
                    gpsEvents: sqlJson.data.gpsEvents || localSnap.gpsEvents,
                    notifications: sqlJson.data.notifications || localSnap.notifications,
                    directives: sqlJson.data.directives || localSnap.directives,
                  };
                }
              }
            } catch {
              // Ignore SQL bootstrap failure and continue with Firestore
            }
          }

          const seedSnap = sqlHydratedSnap || localSnap;
          if (sqlHydratedSnap) {
            setSettings(seedSnap.settings);
            setTruck(seedSnap.truck);
            setDriverAccounts(seedSnap.driverAccounts);
            setCustomers(seedSnap.customers);
            setOrders(seedSnap.orders);
            setTrips(seedSnap.trips);
            setInvoices(seedSnap.invoices);
            setReconciliations(seedSnap.reconciliations);
            setExpenses(seedSnap.expenses);
            setGpsEvents(seedSnap.gpsEvents);
            setNotifications(seedSnap.notifications);
            setDirectives(seedSnap.directives);
            latestStateRef.current = seedSnap;
            await hydrateExpressFromCloud(seedSnap);
          }

          cloudWriteCooldownUntilRef.current = Date.now() + 2500;
          await Promise.all([
            pushFullSnapshotToCloud(seedSnap, user),
            syncSnapshotToSql(seedSnap),
          ]);
        }

        setLastCloudSyncAt(new Date().toISOString());

        // Attach real-time authenticated Firestore listeners ONLY after auth readiness
        if (!isDisposed) {
          cloudUnsubscribe = subscribeToCloudState(user, {
            onSettings: (s) => {
              setSettings(s);
              if (s.managerPin) {
                setManagerPin(s.managerPin);
                if (typeof localStorage !== 'undefined') {
                  localStorage.setItem(SAVED_PIN_KEY, s.managerPin);
                }
              }
              latestStateRef.current = { ...latestStateRef.current, settings: s };
              scheduleExpressHydrate();
            },
            onTruck: (trk) => {
              setTruck(trk);
              latestStateRef.current = { ...latestStateRef.current, truck: trk };
              scheduleExpressHydrate();
            },
            onDriverAccounts: (accs) => {
              setDriverAccounts(accs);
              const curSession = driverSessionRef.current;
              if (curSession) {
                const matched = accs.find((d) => d.id === curSession.id);
                if (accs.length > 0 && (!matched || matched.status !== 'approved')) {
                  saveDriverSession(null);
                }
              }
              latestStateRef.current = { ...latestStateRef.current, driverAccounts: accs };
              scheduleExpressHydrate();
            },
            onCustomers: (list) => {
              setCustomers(list);
              latestStateRef.current = { ...latestStateRef.current, customers: list };
              scheduleExpressHydrate();
            },
            onOrders: (list) => {
              setOrders(list);
              latestStateRef.current = { ...latestStateRef.current, orders: list };
              scheduleExpressHydrate();
            },
            onTrips: async (cloudTrips) => {
              const localTrips = await idbGetTrips();
              const mergedMap = new Map<string, Trip>(cloudTrips.map((t) => [t.id, t]));
              for (const lt of localTrips) {
                const existing = mergedMap.get(lt.id);
                if (!existing || lt.syncStatus === 'pending_sync' || lt.syncStatus === 'local_only') {
                  mergedMap.set(lt.id, lt);
                }
              }
              const merged = Array.from(mergedMap.values());
              setTrips(merged);
              latestStateRef.current = { ...latestStateRef.current, trips: merged };
              scheduleExpressHydrate();
            },
            onInvoices: (list) => {
              setInvoices(list);
              latestStateRef.current = { ...latestStateRef.current, invoices: list };
              scheduleExpressHydrate();
            },
            onReconciliations: (list) => {
              setReconciliations(list);
              latestStateRef.current = { ...latestStateRef.current, reconciliations: list };
              scheduleExpressHydrate();
            },
            onExpenses: (list) => {
              setExpenses(list);
              latestStateRef.current = { ...latestStateRef.current, expenses: list };
              scheduleExpressHydrate();
            },
            onGpsEvents: (list) => {
              setGpsEvents(list);
              latestStateRef.current = { ...latestStateRef.current, gpsEvents: list };
              scheduleExpressHydrate();
            },
            onNotifications: (list) => {
              setNotifications(list);
              latestStateRef.current = { ...latestStateRef.current, notifications: list };
              scheduleExpressHydrate();
            },
            onDirectives: (list) => {
              setDirectives(list);
              latestStateRef.current = { ...latestStateRef.current, directives: list };
              scheduleExpressHydrate();
            },
            onError: (err) => {
              setCloudSyncError(err.message);
            },
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setCloudSyncError(msg);
      } finally {
        resolveBootstrap();
        cloudBootstrapPromiseRef.current = null;
        if (!isDisposed) {
          setIsCloudSyncing(false);
        }
      }
    });

    return () => {
      isDisposed = true;
      if (hydrateDebounceRef.current) clearTimeout(hydrateDebounceRef.current);
      if (cloudUnsubscribe) cloudUnsubscribe();
      unsubAuth();
    };
  }, [fetchState, hydrateExpressFromCloud, saveDriverSession]);

  const signInWithGoogleAccount = useCallback(async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    try {
      setIsCloudSyncing(true);
      setCloudSyncError(null);
      await signInWithGoogle(viewModeRef.current === 'driver' ? 'driver' : 'manager');
      return { success: true };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'تعذر تسجيل الدخول عبر حساب Google';
      setCloudSyncError(message);
      return { success: false, error: message };
    } finally {
      setIsCloudSyncing(false);
    }
  }, []);

  const signOutGoogleAccount = useCallback(async (): Promise<void> => {
    try {
      await signOutCloud();
      clearKnownCloudMeta();
      setCloudSyncError(null);
    } catch (err) {
      console.error('[Miyahna Cloud] Sign-out error:', err);
    }
  }, []);

  const syncNowToCloud = useCallback(async (): Promise<void> => {
    if (cloudBootstrapPromiseRef.current) {
      await cloudBootstrapPromiseRef.current.catch(() => {});
    }
    const user = cloudUserRef.current;
    if (!user || !user.emailVerified) return;
    try {
      setIsCloudSyncing(true);
      setCloudSyncError(null);
      cloudWriteCooldownUntilRef.current = Date.now() + 2500;
      const fresh = (await fetchState()) || latestStateRef.current;
      await Promise.all([
        pushFullSnapshotToCloud(fresh, user),
        syncSnapshotToSql(fresh),
      ]);
      setLastCloudSyncAt(new Date().toISOString());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setCloudSyncError(msg);
    } finally {
      setIsCloudSyncing(false);
    }
  }, [fetchState, syncSnapshotToSql]);

  const dismissCloudSyncError = useCallback(() => {
    setCloudSyncError(null);
  }, []);

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
          pendingDistricts: snap.unsyncedDistricts,
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
          const ackedDistrictSet = new Set<string>(json.acks.districtNames || []);
          const ackedPointSet = new Set<string>(json.acks.pointIds || []);

          setOfflineState((prev) => {
            const next: OfflineState = {
              ...prev,
              pendingDeliveries: prev.pendingDeliveries.filter((d) => !ackedDeliverySet.has(d.id)),
              pendingOrders: prev.pendingOrders.filter((o) => !ackedOrderSet.has(o.id)),
              pendingCustomers: (prev.pendingCustomers || []).filter((c) => !ackedCustomerSet.has(c.id)),
              pendingDistricts: (prev.pendingDistricts || []).filter((d) => !ackedDistrictSet.has(d)),
              pendingGpsPoints: prev.pendingGpsPoints.filter((p) => !ackedPointSet.has(p.id)),
              lastSyncTimestamp: json.timestamp || new Date().toISOString(),
            };
            saveOfflineState(next);
            return next;
          });

          await refreshPendingSyncCount();
          const latestSnap = await fetchState();
          await pushCloudCollections(latestSnap, [
            'settings',
            'trucks',
            'customers',
            'orders',
            'trips',
            'invoices',
            'gpsEvents',
            'notifications',
          ]);

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
  }, [isOnline, fetchState, refreshPendingSyncCount, purgeDriverLocalData, pushCloudCollections]);

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

  const addCustomDistrict = useCallback(
    async (rawName: string): Promise<void> => {
      const clean = (rawName || '').trim();
      if (!clean || clean === '__other__' || clean === 'أخرى') return;
      if (AL_WADI_DISTRICT_NAMES.includes(clean)) return;

      let nextCustomDistricts: string[] = [];
      setSettings((prev) => {
        const cur = prev.customDistricts || [];
        if (cur.includes(clean)) {
          nextCustomDistricts = cur;
          return prev;
        }
        nextCustomDistricts = [...cur, clean];
        const nextSettings = { ...prev, customDistricts: nextCustomDistricts };
        latestStateRef.current = { ...latestStateRef.current, settings: nextSettings };
        return nextSettings;
      });

      if (isOnline) {
        try {
          const res = await fetch('/api/districts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: clean }),
          });
          if (res.ok) {
            const json = await res.json();
            if (json.success && Array.isArray(json.data)) {
              const updatedSettings = { ...latestStateRef.current.settings, customDistricts: json.data };
              setSettings(updatedSettings);
              latestStateRef.current = { ...latestStateRef.current, settings: updatedSettings };
              await pushCloudCollections(latestStateRef.current, ['settings']);
            }
            return;
          }
        } catch {
          // fall back to offline queue
        }
      }

      await idbQueueDistrict(clean);
      setOfflineState((prev) => queueOfflineDistrict(prev, clean));
      await refreshPendingSyncCount();
    },
    [isOnline, pushCloudCollections, refreshPendingSyncCount]
  );

  const addCustomer = async (cust: Partial<Customer>): Promise<Customer> => {
    const actorName = viewMode === 'driver' ? (driverSession?.name || truck.driverName) : 'الإدارة';
    const cleanDistrict = (cust.district || '').trim() || DEFAULT_AL_WADI_DISTRICT;
    const clientRequestId = makeClientRequestId('cust-req');

    await addCustomDistrict(cleanDistrict);

    if (isOnline) {
      try {
        const res = await fetch('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...cust,
            district: cleanDistrict,
            clientRequestId,
            actorRole: viewMode,
            actorName,
          }),
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success) {
            setCustomers((prev) => {
              const next = [json.data, ...prev.filter((c) => c.id !== json.data.id)];
              latestStateRef.current = { ...latestStateRef.current, customers: next };
              return next;
            });
            if (Array.isArray(json.customDistricts)) {
              setSettings((prev) => {
                const nextSettings = { ...prev, customDistricts: json.customDistricts };
                latestStateRef.current = { ...latestStateRef.current, settings: nextSettings };
                return nextSettings;
              });
            }
            const freshSnap = await fetchState();
            await pushCloudCollections(freshSnap || latestStateRef.current, [
              'customers',
              'settings',
              'notifications',
            ]);
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
      clientRequestId,
      name: cust.name || 'عميل جديد',
      phone: cust.phone || '710000000',
      district: cleanDistrict,
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
    setCustomers((prev) => [newCust, ...prev.filter((c) => c.id !== newCust.id)]);
    return newCust;
  };

  const updateCustomer = async (id: string, cust: Partial<Customer>): Promise<void> => {
    const cleanDistrict = cust.district ? cust.district.trim() : undefined;
    if (cleanDistrict) {
      await addCustomDistrict(cleanDistrict);
    }
    try {
      const res = await fetch(`/api/customers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cust, ...(cleanDistrict ? { district: cleanDistrict } : {}) }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setCustomers((prev) => {
            const next = prev.map((c) => (c.id === id ? json.data : c));
            latestStateRef.current = { ...latestStateRef.current, customers: next };
            return next;
          });
          if (Array.isArray(json.customDistricts)) {
            setSettings((prev) => {
              const nextSettings = { ...prev, customDistricts: json.customDistricts };
              latestStateRef.current = { ...latestStateRef.current, settings: nextSettings };
              return nextSettings;
            });
          }
          await pushCloudCollections(latestStateRef.current, ['customers', 'settings']);
          return;
        }
      }
    } catch (e) {
      console.error(e);
    }
    setCustomers((prev) => {
      const next = prev.map((c) =>
        c.id === id ? { ...c, ...cust, ...(cleanDistrict ? { district: cleanDistrict } : {}) } : c
      );
      latestStateRef.current = { ...latestStateRef.current, customers: next };
      return next;
    });
    const user = cloudUserRef.current;
    const updatedTarget = latestStateRef.current.customers.find((c) => c.id === id);
    if (user && user.emailVerified && updatedTarget) {
      const ser = serializeCustomer(updatedTarget, user);
      await upsertSingleCloudDoc({ col: 'customers', id: ser.id, data: ser.data });
    }
  };

  const deleteCustomer = async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return { success: false, error: json.error || 'تعذر حذف العميل' };
      }
      setCustomers((prev) => {
        const next = prev.filter((c) => c.id !== id);
        latestStateRef.current = { ...latestStateRef.current, customers: next };
        return next;
      });
      setOrders((prev) => {
        const next = prev.map((o) => (o.customerId === id ? { ...o, customerId: '' } : o));
        latestStateRef.current = { ...latestStateRef.current, orders: next };
        return next;
      });
      setSelectedCustomer((prev) => (prev?.id === id ? null : prev));

      const user = cloudUserRef.current;
      if (user && user.emailVerified) {
        try {
          cloudWriteCooldownUntilRef.current = Date.now() + 2500;
          await deleteSingleCloudDoc('customers', id);
          await pushCloudCollections(latestStateRef.current, ['orders']);
        } catch (err) {
          setCloudSyncError(err instanceof Error ? err.message : String(err));
        }
      }
      return { success: true };
    } catch {
      return { success: false, error: 'تعذر الاتصال بالخادم لحذف العميل' };
    }
  };

  const addOrder = async (orderPayload: Partial<Order>): Promise<{ order: Order; duplicateWarning?: boolean }> => {
    const actorName = viewMode === 'driver' ? (driverSession?.name || truck.driverName) : undefined;
    const cleanDistrict = (orderPayload.district || '').trim() || DEFAULT_AL_WADI_DISTRICT;
    const clientRequestId = makeClientRequestId('ord-req');

    await addCustomDistrict(cleanDistrict);

    if (!isOnline) {
      const cleanName = (orderPayload.customerName || 'عميل').trim();
      const cleanPhone = (orderPayload.phone || '').trim();
      const reqId = (orderPayload.customerId || '').trim();
      const isSentinel = !reqId || reqId === 'cust-manual' || reqId === 'cust-offline' || reqId === '__new__';

      let resolvedCustomerId = !isSentinel ? reqId : '';
      const existingById = resolvedCustomerId ? customers.find((c) => c.id === resolvedCustomerId) : undefined;
      if (existingById) {
        const sameName = !cleanName || existingById.name.trim() === cleanName;
        const samePhone = !cleanPhone || existingById.phone.trim() === cleanPhone;
        if (!sameName || !samePhone) {
          resolvedCustomerId = '';
        }
      } else {
        resolvedCustomerId = '';
      }

      if (!resolvedCustomerId) {
        const matchedExisting = customers.find(
          (c) =>
            cleanPhone &&
            c.phone.trim() === cleanPhone &&
            (!cleanName || c.name.trim() === cleanName)
        );
        if (matchedExisting) {
          resolvedCustomerId = matchedExisting.id;
        } else {
          const newOfflineCustId = `cust-off-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          const offCust = {
            id: newOfflineCustId,
            clientRequestId: makeClientRequestId('cust-req'),
            name: cleanName || 'عميل جديد',
            phone: cleanPhone,
            district: cleanDistrict,
            addressDetails: orderPayload.addressDetails || '',
            lat: orderPayload.lat || settings.plantLocation.lat + 0.004,
            lng: orderPayload.lng || settings.plantLocation.lng + 0.004,
            tankCapacityLiters: orderPayload.tankCapacity || 2000,
            notes: orderPayload.notes || '',
            createdAt: new Date().toISOString(),
            actorName,
          };
          await idbQueueCustomer(offCust);
          setOfflineState((prev) => queueOfflineCustomer(prev, offCust));
          const newSeq = customers.length + 1;
          const localCust: Customer = {
            id: newOfflineCustId,
            customerId: `CUST-${String(newSeq).padStart(4, '0')}`,
            name: offCust.name,
            phone: offCust.phone,
            altPhone: '',
            district: offCust.district,
            addressDetails: offCust.addressDetails,
            lat: offCust.lat,
            lng: offCust.lng,
            tankCapacityLiters: offCust.tankCapacityLiters,
            tankRemainingLiters: 0,
            notes: offCust.notes,
            createdAt: offCust.createdAt,
            isActive: true,
            totalOrdersCount: 0,
            totalLitersDelivered: 0,
            isOfflineCreated: true,
          };
          setCustomers((prev) => [localCust, ...prev.filter((c) => c.id !== localCust.id)]);
          resolvedCustomerId = newOfflineCustId;
        }
      }

      const offlineOrderId = `ord-off-${Date.now()}`;
      const offlineOrder = {
        id: offlineOrderId,
        clientRequestId,
        customerId: resolvedCustomerId,
        customerName: cleanName,
        phone: cleanPhone,
        district: cleanDistrict,
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
      setOfflineState((prev) => queueOfflineOrder(prev, offlineOrder));
      await refreshPendingSyncCount();

      const localOrder: Order = {
        ...offlineOrder,
        orderNumber: `ORD-OFF-${Date.now().toString().slice(-4)}`,
        customerId: resolvedCustomerId,
        lat: offlineOrder.lat,
        lng: offlineOrder.lng,
        status: 'waiting_clustering',
      };
      setOrders((prev) => [localOrder, ...prev.filter((o) => o.id !== localOrder.id)]);
      return { order: localOrder };
    }

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...orderPayload,
          district: cleanDistrict,
          clientRequestId,
          actorName,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setOrders((prev) => {
            const next = [json.data, ...prev.filter((o) => o.id !== json.data.id)];
            latestStateRef.current = { ...latestStateRef.current, orders: next };
            return next;
          });
          if (json.createdCustomer) {
            setCustomers((prev) => {
              const next = [
                json.createdCustomer,
                ...prev.filter((c) => c.id !== json.createdCustomer.id),
              ];
              latestStateRef.current = { ...latestStateRef.current, customers: next };
              return next;
            });
          }
          if (Array.isArray(json.customDistricts)) {
            setSettings((prev) => {
              const nextSettings = { ...prev, customDistricts: json.customDistricts };
              latestStateRef.current = { ...latestStateRef.current, settings: nextSettings };
              return nextSettings;
            });
          }
          const freshSnap = await fetchState();
          await pushCloudCollections(freshSnap || latestStateRef.current, [
            'orders',
            'customers',
            'settings',
            'notifications',
          ]);
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
      customerId: orderPayload.customerId || '',
      customerName: orderPayload.customerName || 'عميل',
      phone: orderPayload.phone || '710000000',
      district: cleanDistrict,
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
    setOrders((prev) => [fallbackOrder, ...prev.filter((o) => o.id !== fallbackOrder.id)]);
    return { order: fallbackOrder };
  };

  const updateOrder = async (id: string, ord: Partial<Order>): Promise<void> => {
    if (ord.district) {
      await addCustomDistrict(ord.district);
    }
    try {
      await fetch(`/api/orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ord),
      });
    } catch (e) {
      console.error(e);
    }
    setOrders((prev) => {
      const next = prev.map((o) => (o.id === id ? { ...o, ...ord } : o));
      latestStateRef.current = { ...latestStateRef.current, orders: next };
      return next;
    });
    const user = cloudUserRef.current;
    const updatedOrd = latestStateRef.current.orders.find((o) => o.id === id);
    if (user && user.emailVerified && updatedOrd) {
      const ser = serializeOrder(updatedOrd, user);
      await upsertSingleCloudDoc({ col: 'orders', id: ser.id, data: ser.data });
    }
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
        clientRequestId: makeClientRequestId('trip-req'),
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
    const freshSnap = await fetchState();
    await pushCloudCollections(freshSnap, ['trips', 'orders', 'trucks', 'gpsEvents', 'notifications']);
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
      const freshSnap = await fetchState();
      await pushCloudCollections(freshSnap, ['trips', 'orders', 'trucks', 'notifications']);
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
      const freshSnap = await fetchState();
      await pushCloudCollections(freshSnap, ['trips', 'notifications']);
      return { success: true };
    } catch {
      return { success: false, error: 'تعذر الاتصال بالخادم' };
    }
  };

  const approveTrip = async (tripId: string, notes?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/trips/${tripId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientRequestId: makeClientRequestId('approve-trip'),
          managerName: 'المدير العام',
          notes,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success !== false) {
        const freshSnap = await fetchState();
        await pushCloudCollections(freshSnap, ['trips', 'orders', 'trucks', 'gpsEvents', 'notifications']);
        return { success: true };
      }
      return { success: false, error: json?.error || 'تعذر اعتماد الرحلة وبدء التتبع' };
    } catch (e) {
      console.error(e);
      return { success: false, error: 'تعذر الاتصال بالخادم لاعتماد الرحلة' };
    }
  };

  const stopTripTracking = async (tripId: string, reason?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/trips/${tripId}/stop-tracking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientRequestId: makeClientRequestId('stop-tracking'),
          managerName: 'المدير العام',
          reason,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) {
        if (json.data) {
          await idbSaveTrip(json.data);
        }
        const freshSnap = await fetchState();
        await pushCloudCollections(freshSnap, ['trips', 'trucks', 'gpsEvents', 'notifications']);
        return { success: true };
      }
      return { success: false, error: json?.error || 'تعذر إيقاف التتبع لهذه الرحلة' };
    } catch (e) {
      console.error(e);
      return { success: false, error: 'تعذر الاتصال بالخادم لإيقاف التتبع' };
    }
  };

  const rejectTrip = async (tripId: string, reason: string): Promise<void> => {
    try {
      await fetch(`/api/trips/${tripId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerName: 'المدير العام', reason }),
      });
      const freshSnap = await fetchState();
      await pushCloudCollections(freshSnap, ['trips', 'orders', 'notifications']);
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
      const freshSnap = await fetchState();
      await pushCloudCollections(freshSnap, ['trips', 'notifications']);
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
          clientRequestId: makeClientRequestId('drv-resp'),
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
      const freshSnap = await fetchState();
      await pushCloudCollections(freshSnap, ['trips', 'notifications']);
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
        body: JSON.stringify({
          clientRequestId: makeClientRequestId('mod-req'),
          proposedStops,
          reason,
          requestedBy: driverSession?.name || truck.driverName,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return { success: false, error: json.error || 'تعذر إرسال طلب التعديل' };
      }
      const freshSnap = await fetchState();
      await pushCloudCollections(freshSnap, ['trips', 'notifications']);
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
      const freshSnap = await fetchState();
      await pushCloudCollections(freshSnap, ['trips', 'orders', 'notifications']);
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
      const freshSnap = await fetchState();
      await pushCloudCollections(freshSnap, ['trips', 'notifications']);
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
        const freshSnap = await fetchState();
        await pushCloudCollections(freshSnap, [
          'trips',
          'orders',
          'trucks',
          'gpsEvents',
          'notifications',
        ]);
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

  const triggerAutoDepartureTracking = async (params: {
    lat: number;
    lng: number;
    speedKmH?: number;
    accuracy?: number;
    timestamp?: string;
    seedPoints?: Array<{ lat: number; lng: number; speedKmH?: number; accuracy?: number; timestamp: string }>;
  }): Promise<{ success: boolean; trip?: Trip; suppressedCooldown?: boolean; reason?: string }> => {
    if (autoDepartureLockRef.current) {
      return { success: false, reason: 'جاري معالجة بدء التتبع التلقائي' };
    }
    const existingActive = trips.find((t) => t.status === 'in_progress');
    if (existingActive) {
      return { success: true, trip: existingActive };
    }

    autoDepartureLockRef.current = true;
    const nowIso = params.timestamp || new Date().toISOString();
    const clientRequestId = makeClientRequestId('auto-dep');

    try {
      if (isOnline) {
        try {
          const formattedSeedPoints: TripGPSPoint[] = (params.seedPoints || []).map((pt, idx) => ({
            id: `pt-auto-seed-${Date.now()}-${idx}`,
            tripId: 'pending',
            lat: pt.lat,
            lng: pt.lng,
            speedKmH: pt.speedKmH ?? 0,
            accuracy: pt.accuracy,
            timestamp: pt.timestamp || nowIso,
            seq: idx + 1,
            distanceFromPrevKm: 0,
            source: 'gps_watch',
          }));

          const res = await fetch('/api/gps/auto-start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clientRequestId,
              lat: params.lat,
              lng: params.lng,
              speedKmH: params.speedKmH ?? 0,
              accuracy: params.accuracy,
              timestamp: nowIso,
              driverId: driverSession?.id || truck.driverId,
              driverName: driverSession?.name || truck.driverName,
              gpsPoints: formattedSeedPoints,
            }),
          });
          const json = await res.json().catch(() => ({}));
          if (res.ok && json.success && json.data) {
            await idbSaveTrip(json.data);
            const freshSnap = await fetchState();
            await pushCloudCollections(freshSnap, ['trips', 'orders', 'trucks', 'gpsEvents', 'notifications']);
            return { success: true, trip: json.data };
          }
          if (json.suppressedCooldown || json.notDeparted) {
            return {
              success: false,
              suppressedCooldown: Boolean(json.suppressedCooldown),
              reason: json.reason,
            };
          }
        } catch (err) {
          console.warn('Online auto-start failed, falling back to offline auto-departure:', err);
        }
      }

      // Offline fallback: either transition waiting approved trip or create local trip-auto-*
      const waitingApproved = trips.find(
        (t) => t.status === 'approved' && t.driverAcceptanceStatus !== 'declined'
      );

      if (waitingApproved) {
        const ptId = `pt-${waitingApproved.id}-dep-${Date.now()}`;
        const seedPts: TripGPSPoint[] =
          params.seedPoints && params.seedPoints.length > 0
            ? params.seedPoints.map((p, idx) => ({
                id: `${ptId}-${idx}`,
                tripId: waitingApproved.id,
                lat: p.lat,
                lng: p.lng,
                speedKmH: p.speedKmH ?? 0,
                accuracy: p.accuracy,
                timestamp: p.timestamp || nowIso,
                seq: idx + 1,
                distanceFromPrevKm: 0,
                source: 'gps_watch' as const,
              }))
            : [
                {
                  id: ptId,
                  tripId: waitingApproved.id,
                  lat: params.lat,
                  lng: params.lng,
                  speedKmH: params.speedKmH ?? 0,
                  accuracy: params.accuracy,
                  timestamp: nowIso,
                  seq: 1,
                  distanceFromPrevKm: 0,
                  source: 'gps_watch' as const,
                },
              ];

        for (const pt of seedPts) {
          await idbAppendGpsPoint(pt);
        }

        const updatedTrip: Trip = {
          ...waitingApproved,
          status: 'in_progress',
          syncStatus: 'pending_sync',
          startedAt: waitingApproved.startedAt || nowIso,
          startLocation: waitingApproved.startLocation || settings.plantLocation,
          gpsPoints: [...(waitingApproved.gpsPoints || []), ...seedPts],
        };
        await idbSaveTrip(updatedTrip);
        setTrips((prev) => prev.map((t) => (t.id === updatedTrip.id ? updatedTrip : t)));
        setTruck((prev) => ({
          ...prev,
          status: 'on_trip',
          currentTripId: updatedTrip.id,
          lastEvent: 'DEPARTURE',
          lastLat: params.lat,
          lastLng: params.lng,
          lastSpeed: params.speedKmH ?? 0,
          lastUpdateTimestamp: nowIso,
        }));
        await refreshPendingSyncCount();
        return { success: true, trip: updatedTrip };
      }

      const offlineAutoId = `trip-auto-${Date.now()}`;
      const tripNumber = `AUTO-OFF-${Date.now().toString().slice(-4)}`;
      const seedPts: TripGPSPoint[] =
        params.seedPoints && params.seedPoints.length > 0
          ? params.seedPoints.map((p, idx) => ({
              id: `pt-${offlineAutoId}-${idx}`,
              tripId: offlineAutoId,
              lat: p.lat,
              lng: p.lng,
              speedKmH: p.speedKmH ?? 0,
              accuracy: p.accuracy,
              timestamp: p.timestamp || nowIso,
              seq: idx + 1,
              distanceFromPrevKm: 0,
              source: 'gps_watch' as const,
            }))
          : [
              {
                id: `pt-${offlineAutoId}-0`,
                tripId: offlineAutoId,
                lat: params.lat,
                lng: params.lng,
                speedKmH: params.speedKmH ?? 0,
                accuracy: params.accuracy,
                timestamp: nowIso,
                seq: 1,
                distanceFromPrevKm: 0,
                source: 'gps_watch' as const,
              },
            ];

      for (const pt of seedPts) {
        await idbAppendGpsPoint(pt);
      }

      const newOfflineAutoTrip: Trip = {
        id: offlineAutoId,
        tripNumber,
        date: nowIso.split('T')[0],
        truckId: truck.id,
        driverId: driverSession?.id || truck.driverId,
        driverName: driverSession?.name || truck.driverName,
        truckPlate: truck.plateNumber,
        initialLoadLiters: 0,
        deliveredLiters: 0,
        remainingLiters: 0,
        status: 'in_progress',
        syncStatus: 'pending_sync',
        createdByRole: 'manager',
        driverAcceptanceStatus: 'accepted',
        driverRespondedAt: nowIso,
        customerStops: [],
        orderIds: [],
        proposedAt: nowIso,
        approvedAt: nowIso,
        approvedBy: 'رصد آلي (محيط المصنع - دون إنترنت)',
        startedAt: nowIso,
        startLocation: { lat: settings.plantLocation.lat, lng: settings.plantLocation.lng },
        gpsPoints: seedPts,
        detectedStops: [],
        gpsGaps: [],
        auditLogs: [
          {
            id: `aud-off-auto-${Date.now()}`,
            timestamp: nowIso,
            actorRole: 'system',
            actorName: 'النظام الآلي',
            action: 'بدء تتبع تلقائي عند ابتعاد الوايت عن محيط المصنع (دون إنترنت)',
            details: 'سيتمت مزامنة السجل ونقاط GPS تلقائياً فور توفر الاتصال',
          },
        ],
        modificationRequests: [],
        estimatedDistanceKm: 0,
        estimatedFuelLiters: 0,
        fuelCost: 0,
        productionCost: 0,
        driverWageShare: settings.driverWagePerTrip,
        maintenanceShare: settings.maintenanceAllowancePerTrip,
        otherExpensesShare: 0,
        totalCost: settings.driverWagePerTrip + settings.maintenanceAllowancePerTrip,
        expectedRevenue: 0,
        expectedProfit: -(settings.driverWagePerTrip + settings.maintenanceAllowancePerTrip),
        profitMarginPercent: 0,
        capacityUtilizationPercent: 0,
        departureRecommendation: 'GO_NOW',
        recommendationReason: 'تتبع تلقائي عند ابتعاد الوايت عن محيط المصنع',
        notes: 'رحلة تتبع تلقائي بدأت ميدانياً عند الابتعاد عن محيط المصنع أثناء انقطاع الإنترنت',
      };

      await idbSaveTrip(newOfflineAutoTrip);
      setTrips((prev) => [newOfflineAutoTrip, ...prev]);
      setTruck((prev) => ({
        ...prev,
        status: 'on_trip',
        currentTripId: newOfflineAutoTrip.id,
        lastEvent: 'DEPARTURE',
        lastLat: params.lat,
        lastLng: params.lng,
        lastSpeed: params.speedKmH ?? 0,
        lastUpdateTimestamp: nowIso,
      }));
      await refreshPendingSyncCount();
      return { success: true, trip: newOfflineAutoTrip };
    } finally {
      autoDepartureLockRef.current = false;
    }
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
          // Throttled Firestore GPS telemetry sync (every 20 seconds while on trip)
          const user = cloudUserRef.current;
          if (
            user &&
            user.emailVerified &&
            Date.now() - lastGpsCloudSyncAtRef.current >= 20000
          ) {
            lastGpsCloudSyncAtRef.current = Date.now();
            const tripSer = serializeTrip(updatedTrip, user);
            upsertSingleCloudDoc({ col: 'trips', id: tripSer.id, data: tripSer.data }).catch(() => {
              // Silent retry on next point or trip completion
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
  }): Promise<boolean> => {
    const trip = trips.find((t) => t.id === params.tripId);
    if (!trip) return false;

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
            clientRequestId: makeClientRequestId('ret-req'),
            lat: params.lat,
            lng: params.lng,
            detectedAutomatically: params.detectedAutomatically,
            actualDistanceKm: trip.actualDistanceKm,
            gpsPoints: tripPts,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (json?.rejectedPrematureReturn) {
          console.warn('[Miyahna Tracking] Premature auto-return ignored:', json.reason);
          return false;
        }
        if (res.ok && json.success) {
          await idbMarkSyncedByIds({
            tripIds: [params.tripId],
            pointIds: tripPts.map((p) => p.id),
          });
          const freshSnap = await fetchState();
          await pushCloudCollections(freshSnap, [
            'trips',
            'trucks',
            'gpsEvents',
            'notifications',
          ]);
          await refreshPendingSyncCount();
          return true;
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
    return true;
  };

  const closeTripAfterReview = async (tripId: string, reviewNotes?: string): Promise<void> => {
    try {
      await fetch(`/api/trips/${tripId}/close-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerName: 'المدير العام', reviewNotes }),
      });
      const freshSnap = await fetchState();
      await pushCloudCollections(freshSnap, ['trips', 'notifications']);
    } catch (e) {
      console.error(e);
    }
  };

  const createTripFromCluster = async (proposal: ClusterProposal): Promise<Trip> => {
    try {
      const res = await fetch('/api/clustering/create-trip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposal,
          clientRequestId: makeClientRequestId('cluster-trip'),
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          const freshSnap = await fetchState();
          await pushCloudCollections(freshSnap, ['trips', 'orders', 'trucks', 'gpsEvents', 'notifications']);
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
        const freshSnap = await fetchState();
        await pushCloudCollections(freshSnap, [
          'trips',
          'orders',
          'customers',
          'invoices',
          'trucks',
          'notifications',
        ]);
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
        body: JSON.stringify({
          ...recPayload,
          clientRequestId: makeClientRequestId('rec-req'),
        }),
      });
      if (res.ok) {
        const freshSnap = await fetchState();
        await pushCloudCollections(freshSnap, ['reconciliations', 'trips', 'invoices']);
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
        body: JSON.stringify({
          ...exp,
          clientRequestId: makeClientRequestId('exp-req'),
        }),
      });
      if (res.ok) {
        const freshSnap = await fetchState();
        await pushCloudCollections(freshSnap, ['expenses']);
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
    const mergedSettings = { ...latestStateRef.current.settings, ...newSet };
    setSettings(mergedSettings);
    latestStateRef.current = { ...latestStateRef.current, settings: mergedSettings };
    if (cloudBootstrapPromiseRef.current) {
      await cloudBootstrapPromiseRef.current.catch(() => {});
    }
    const user = cloudUserRef.current;
    if (user && user.emailVerified) {
      try {
        cloudWriteCooldownUntilRef.current = Date.now() + 2500;
        const ser = serializeSettings(latestStateRef.current.settings, user);
        await upsertSingleCloudDoc({ col: 'settings', id: ser.id, data: ser.data });
        setLastCloudSyncAt(new Date().toISOString());
        setCloudSyncError(null);
      } catch (err) {
        setCloudSyncError(err instanceof Error ? err.message : String(err));
      }
    }
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
    const mergedTruck = { ...latestStateRef.current.truck, ...newTruck };
    setTruck(mergedTruck);
    latestStateRef.current = { ...latestStateRef.current, truck: mergedTruck };
    if (cloudBootstrapPromiseRef.current) {
      await cloudBootstrapPromiseRef.current.catch(() => {});
    }
    const user = cloudUserRef.current;
    if (user && user.emailVerified) {
      try {
        cloudWriteCooldownUntilRef.current = Date.now() + 2500;
        const ser = serializeTruck(latestStateRef.current.truck, user);
        await upsertSingleCloudDoc({ col: 'trucks', id: ser.id, data: ser.data });
        setLastCloudSyncAt(new Date().toISOString());
        setCloudSyncError(null);
      } catch (err) {
        setCloudSyncError(err instanceof Error ? err.message : String(err));
      }
    }
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
      const freshSnap = await fetchState();
      if (cloudBootstrapPromiseRef.current) {
        await cloudBootstrapPromiseRef.current.catch(() => {});
      }
      const user = cloudUserRef.current;
      if (user && user.emailVerified && freshSnap) {
        cloudWriteCooldownUntilRef.current = Date.now() + 3000;
        await clearOperationalCollectionsInCloud(
          user,
          freshSnap.settings,
          freshSnap.truck,
          freshSnap.driverAccounts
        )
          .then(() => {
            setLastCloudSyncAt(new Date().toISOString());
            setCloudSyncError(null);
          })
          .catch((err) => {
            setCloudSyncError(err instanceof Error ? err.message : String(err));
          });
      }
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
      const freshSnap = await fetchState();
      await pushCloudCollections(freshSnap, ['driverAccounts', 'trucks']);
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
        body: JSON.stringify({
          ...payload,
          clientRequestId: makeClientRequestId('drv-reg'),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return { success: false, error: json.error || 'تعذر إرسال طلب تسجيل الحساب' };
      }
      const freshSnap = await fetchState();
      await pushCloudCollections(freshSnap, ['driverAccounts', 'notifications']);
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
        body: JSON.stringify({
          ...payload,
          clientRequestId: makeClientRequestId('drv-create'),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return { success: false, error: json.error || 'تعذر إنشاء حساب السائق' };
      }
      const freshSnap = await fetchState();
      await pushCloudCollections(freshSnap, ['driverAccounts', 'trucks']);
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
      const freshSnap = await fetchState();
      await pushCloudCollections(freshSnap, ['driverAccounts', 'trucks', 'notifications']);
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
      const freshSnap = await fetchState();
      await pushCloudCollections(freshSnap, ['driverAccounts']);
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
      const freshSnap = await fetchState();
      await pushCloudCollections(freshSnap, ['driverAccounts']);
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
      const freshSnap = await fetchState();
      await pushCloudCollections(freshSnap, ['driverAccounts', 'trucks']);
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
      const freshSnap = await fetchState();
      await pushCloudCollections(freshSnap, ['trucks']);
    } catch (e) {
      console.error(e);
    }
  };

  const deleteDriverAccount = async (driverId: string): Promise<void> => {
    try {
      await fetch(`/api/drivers/${driverId}`, { method: 'DELETE' });
      const freshSnap = await fetchState();
      const user = cloudUserRef.current;
      if (user && user.emailVerified) {
        cloudWriteCooldownUntilRef.current = Date.now() + 2500;
        await deleteSingleCloudDoc('driverAccounts', driverId).catch((err) => {
          setCloudSyncError(err instanceof Error ? err.message : String(err));
        });
        await pushCloudCollections(freshSnap, ['trucks']);
      }
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
    setNotifications((prev) => {
      const next = prev.map((n) => {
        if (opts.markAll && (!opts.role || n.targetRole === opts.role)) {
          return { ...n, isRead: true };
        }
        if (opts.ids && opts.ids.includes(n.id)) {
          return { ...n, isRead: true };
        }
        return n;
      });
      latestStateRef.current = { ...latestStateRef.current, notifications: next };
      return next;
    });
    try {
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts),
      });
      await pushCloudCollections(latestStateRef.current, ['notifications']);
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
        body: JSON.stringify({
          ...params,
          clientRequestId: makeClientRequestId('dir-req'),
          createdBy: 'المدير العام',
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return { success: false, error: json.error || 'تعذر إرسال التوجيه' };
      }
      const freshSnap = await fetchState();
      await pushCloudCollections(freshSnap, ['directives', 'notifications']);
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
      const freshSnap = await fetchState();
      await pushCloudCollections(freshSnap, ['directives', 'notifications']);
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
      const freshSnap = await fetchState();
      await pushCloudCollections(freshSnap, ['directives', 'notifications']);
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
        allDistricts,
        addCustomDistrict,
        addCustomer,
        updateCustomer,
        deleteCustomer,
        addOrder,
        updateOrder,
        createTripPlan,
        updateTripPlan,
        submitTripForApproval,
        approveTrip,
        stopTripTracking,
        rejectTrip,
        returnTripForEdit,
        respondToManagerTrip,
        requestTripModification,
        approveTripModification,
        rejectTripModification,
        startTrip,
        triggerAutoDepartureTracking,
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
        cloudUser,
        authReady,
        isCloudConnected: Boolean(cloudUser && cloudUser.emailVerified),
        isCloudSyncing,
        cloudSyncError,
        lastCloudSyncAt,
        dismissCloudSyncError,
        signInWithGoogleAccount,
        signOutGoogleAccount,
        syncNowToCloud,
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
