/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Driver Offline-First PWA & Automated GPS Tracking Interface
 * Zero SMS dependencies. Includes:
 * 1. Trip Planner (Select customers/orders, order stop sequence, capacity check, submit for manager approval)
 * 2. Strict Manager Approval Lock & Post-Approval Modification Requests
 * 3. Automatic GPS Tracking (navigator.geolocation.watchPosition + WakeLock + Native Android Foreground Bridge)
 * 4. Automatic Plant Return Geofence Detection & Local Offline-First IndexedDB Persistence
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Truck,
  Wifi,
  WifiOff,
  MapPin,
  Play,
  CheckCircle,
  Phone,
  Plus,
  RefreshCw,
  Droplet,
  Navigation,
  Clock,
  LogOut,
  Lock,
  AlertTriangle,
  ShieldCheck,
  Edit3,
  X,
  Database,
  Crosshair,
  ListChecks,
  Square,
  Bell,
  Radio,
  CheckCheck,
  XCircle,
  MessageSquare,
  UserPlus,
  ShoppingCart,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Trip, TripCustomerStop, TripStatus } from '../../types';
import { ManagerPinModal } from '../auth/ManagerPinModal';
import { LocationPickerMapModal } from '../common/LocationPickerMapModal';
import { PWAInstallButton } from '../common/PWAInstallButton';
import { TripTrackingMap } from '../manager/TripTrackingMapModal';
import {
  haversineDistanceMeters,
  isWithinPlantGeofence,
  requestScreenWakeLock,
} from '../../lib/gps-tracker';

function getTripStatusBadge(status: TripStatus): { label: string; cls: string } {
  switch (status) {
    case 'draft':
      return { label: 'مسودة قيد التعديل', cls: 'bg-slate-700 text-slate-200 border-slate-600' };
    case 'pending_approval':
      return { label: 'بانتظار اعتماد المدير', cls: 'bg-amber-950 text-amber-300 border-amber-700' };
    case 'rejected':
      return { label: 'مرفوضة من المدير', cls: 'bg-rose-950 text-rose-300 border-rose-700' };
    case 'approved':
      return { label: 'معتمدة - جاهزة للانطلاق', cls: 'bg-sky-950 text-sky-300 border-sky-700' };
    case 'in_progress':
      return { label: 'جارية (التتبع GPS نشط)', cls: 'bg-emerald-950 text-emerald-300 border-emerald-700' };
    case 'returned_to_plant':
      return { label: 'عادت للمصنع', cls: 'bg-teal-950 text-teal-300 border-teal-700' };
    case 'pending_sync':
      return { label: 'بانتظار المزامنة', cls: 'bg-orange-950 text-orange-300 border-orange-700' };
    case 'synced':
      return { label: 'تمت المزامنة', cls: 'bg-cyan-950 text-cyan-300 border-cyan-700' };
    case 'completed_pending_review':
      return { label: 'مكتملة بانتظار مراجعة المدير', cls: 'bg-indigo-950 text-indigo-300 border-indigo-700' };
    case 'closed':
      return { label: 'مغلقة ومعتمدة', cls: 'bg-slate-800 text-slate-300 border-slate-600' };
    default:
      return { label: status, cls: 'bg-slate-800 text-slate-300 border-slate-600' };
  }
}

export const DriverApp: React.FC = () => {
  const {
    trips,
    truck,
    customers,
    orders,
    isOnline,
    setIsOnline,
    isSyncing,
    pendingSyncCount,
    lastAutoSyncResult,
    offlineState,
    requestTripModification,
    startTrip,
    recordGpsTelemetryPoint,
    completeTripReturn,
    logDeliveryStop,
    addCustomer,
    addOrder,
    syncOfflineData,
    settings,
    logoutToRoleSelection,
    selectRole,
    savedRole,
    setViewMode,
    driverSession,
    logoutDriver,
    demoClearedNotice,
    dismissDemoClearedNotice,
    notifications,
    directives,
    wsConnected,
    unreadDriverCount,
    latestToastNotification,
    dismissToastNotification,
    respondToManagerTrip,
    markNotificationsRead,
    acknowledgeDirective,
    completeDirective,
  } = useApp();

  const [showManagerPinModal, setShowManagerPinModal] = useState(false);
  const [showDriverNotifModal, setShowDriverNotifModal] = useState(false);
  const [directiveReplyMap, setDirectiveReplyMap] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'trip' | 'new_order' | 'gps_live' | 'offline_queue'>('trip');
  const [decliningTripId, setDecliningTripId] = useState<string | null>(null);
  const [declineReasonInput, setDeclineReasonInput] = useState('');
  const [respondError, setRespondError] = useState<string | null>(null);
  const [respondingTripId, setRespondingTripId] = useState<string | null>(null);

  // Manager-proposed trips awaiting Driver's acceptance or written reply
  const pendingManagerTripRequests = useMemo(
    () =>
      trips.filter(
        (t) =>
          t.createdByRole === 'manager' &&
          (t.status === 'approved' || t.status === 'pending_approval') &&
          (t.driverAcceptanceStatus === 'pending' || !t.driverAcceptanceStatus)
      ),
    [trips]
  );

  // Selected trip (prioritize in_progress, then manager trip requests, approved, pending_approval, draft, rejected, latest)
  const prioritizedTrip = useMemo(() => {
    const orderRank: Record<TripStatus, number> = {
      in_progress: 1,
      approved: 2,
      pending_approval: 3,
      draft: 4,
      rejected: 5,
      pending_sync: 6,
      returned_to_plant: 7,
      synced: 8,
      completed_pending_review: 9,
      closed: 10,
    };
    return [...trips].sort((a, b) => (orderRank[a.status] || 99) - (orderRank[b.status] || 99))[0] || null;
  }, [trips]);

  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const activeTrip: Trip | null =
    trips.find((t) => t.id === selectedTripId) || prioritizedTrip;

  // Mini-map trip payload focused on the most recent 50 route points + detected stops
  const gpsLiveMiniMapTrip: Trip = useMemo(() => {
    const recentPoints = (activeTrip?.gpsPoints || [])
      .slice()
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-50);

    if (activeTrip) {
      return {
        ...activeTrip,
        gpsPoints: recentPoints,
      };
    }

    return {
      id: 'gps-live-preview',
      tripNumber: 'GPS-LIVE',
      date: new Date().toISOString().split('T')[0],
      truckId: truck.id,
      truckPlate: truck.plateNumber,
      driverId: truck.driverId,
      driverName: truck.driverName,
      status: 'draft',
      syncStatus: 'local_only',
      createdByRole: 'manager',
      orderIds: [],
      customerStops: [],
      gpsPoints: recentPoints,
      detectedStops: [],
      gpsGaps: [],
      auditLogs: [],
      modificationRequests: [],
      initialLoadLiters: 0,
      deliveredLiters: 0,
      remainingLiters: 0,
      capacityUtilizationPercent: 0,
      estimatedDistanceKm: 0,
      estimatedDurationMinutes: 0,
      estimatedFuelLiters: 0,
      fuelCost: 0,
      productionCost: 0,
      driverWageShare: 0,
      maintenanceShare: 0,
      otherExpensesShare: 0,
      totalCost: 0,
      expectedRevenue: 0,
      expectedProfit: 0,
      profitMarginPercent: 0,
      departureRecommendation: 'WAIT_MORE',
      recommendationReason: '',
      proposedAt: new Date().toISOString(),
    };
  }, [activeTrip, truck.id, truck.plateNumber, truck.driverId, truck.driverName]);

  const [plannerToast, setPlannerToast] = useState<string | null>(null);

  // Post-approval emergency modification request modal
  const [showModModal, setShowModModal] = useState(false);
  const [modReason, setModReason] = useState('');
  const [modStops, setModStops] = useState<TripCustomerStop[]>([]);
  const [modFeedback, setModFeedback] = useState<string | null>(null);

  // Stop Delivery State
  const [selectedStopIndex, setSelectedStopIndex] = useState(0);
  const [deliveredInput, setDeliveredInput] = useState<number>(0);
  const [paidInput, setPaidInput] = useState<number>(0);
  const [deliveryNotes, setDeliveryNotes] = useState<string>('');
  const [unloadingActive, setUnloadingActive] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Field New Customer / Water Order Form (Driver submits ONLY orders or customers)
  const [submissionMode, setSubmissionMode] = useState<'order_existing' | 'order_new' | 'customer_only'>('order_new');
  const [selectedExistingCustomerId, setSelectedExistingCustomerId] = useState<string>('');
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
  const [hasPickedFromMap, setHasPickedFromMap] = useState(false);
  const [newOrderForm, setNewOrderForm] = useState({
    customerName: '',
    phone: '',
    district: 'حي الروضة',
    addressDetails: '',
    tankCapacity: 2000,
    requestedLiters: 2000,
    lat: settings.plantLocation.lat + 0.005,
    lng: settings.plantLocation.lng + 0.005,
    isUrgent: false,
    notes: '',
  });

  // Live GPS Watch State
  const [livePosition, setLivePosition] = useState<{
    lat: number;
    lng: number;
    speedKmH: number;
    accuracy: number;
    timestamp: string;
  } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const lastSampleTimeRef = useRef<number>(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Sync current trip status feedback
  const [tripActionError, setTripActionError] = useState<string | null>(null);

  // Automatic Background GPS Tracking when Trip Status === 'in_progress'
  useEffect(() => {
    if (!activeTrip || activeTrip.status !== 'in_progress') {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
        setWakeLockActive(false);
      }
      if (typeof window !== 'undefined' && window.MiyahnaAndroidLocation?.stopTracking) {
        try {
          window.MiyahnaAndroidLocation.stopTracking();
        } catch {
          // ignore
        }
      }
      return;
    }

    let watchId: number | null = null;
    let androidPollTimer: ReturnType<typeof setInterval> | null = null;
    let isCancelled = false;

    const minSampleMs = Math.max(4000, (settings.gpsSampleIntervalSeconds || 10) * 1000);

    // Activate Screen WakeLock
    requestScreenWakeLock().then((sentinel) => {
      if (sentinel && !isCancelled) {
        wakeLockRef.current = sentinel;
        setWakeLockActive(true);
      }
    });

    // Activate Native Android Foreground Location Service if inside APK WebView wrapper
    if (typeof window !== 'undefined' && window.MiyahnaAndroidLocation?.startTracking) {
      try {
        window.MiyahnaAndroidLocation.startTracking(
          activeTrip.id,
          settings.gpsSampleIntervalSeconds || 10
        );
      } catch (e) {
        console.warn('Android bridge startTracking failed:', e);
      }
    }

    // Poll Android Foreground buffer if bridge exists
    if (typeof window !== 'undefined' && window.MiyahnaAndroidLocation?.getBufferedPointsJson) {
      androidPollTimer = setInterval(async () => {
        try {
          const raw = window.MiyahnaAndroidLocation?.getBufferedPointsJson?.();
          if (!raw) return;
          const pts = JSON.parse(raw) as Array<{
            id?: string;
            lat: number;
            lng: number;
            speedKmH?: number;
            accuracy?: number;
            timestamp: string;
          }>;
          const ackedIds: string[] = [];
          for (const p of pts) {
            await recordGpsTelemetryPoint(activeTrip.id, {
              lat: p.lat,
              lng: p.lng,
              speedKmH: p.speedKmH ?? 0,
              accuracy: p.accuracy,
              timestamp: p.timestamp || new Date().toISOString(),
              source: 'gps_android_fg',
            });
            if (p.id) ackedIds.push(p.id);
          }
          if (ackedIds.length > 0 && window.MiyahnaAndroidLocation?.clearSyncedBuffer) {
            window.MiyahnaAndroidLocation.clearSyncedBuffer(JSON.stringify(ackedIds));
          }
        } catch (err) {
          console.warn('Android foreground buffer read error:', err);
        }
      }, 15000);
    }

    // Standard Web Geolocation watchPosition
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        async (pos) => {
          if (isCancelled) return;
          setGpsError(null);
          const nowMs = Date.now();
          const speedKmH =
            pos.coords.speed !== null && !Number.isNaN(pos.coords.speed)
              ? Number((pos.coords.speed * 3.6).toFixed(1))
              : 0;
          const accuracy = pos.coords.accuracy ? Math.round(pos.coords.accuracy) : 15;
          const tsIso = new Date(pos.timestamp || nowMs).toISOString();

          setLivePosition({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            speedKmH,
            accuracy,
            timestamp: tsIso,
          });

          if (nowMs - lastSampleTimeRef.current >= minSampleMs) {
            lastSampleTimeRef.current = nowMs;
            await recordGpsTelemetryPoint(activeTrip.id, {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              speedKmH,
              accuracy,
              timestamp: tsIso,
              source: 'gps_watch',
            });
          }
        },
        (err) => {
          if (isCancelled) return;
          if (err.code === err.PERMISSION_DENIED) {
            setGpsError('يرجى السماح بصلاحية الموقع (GPS) لتسجيل مسار الوايت تلقائياً.');
          } else {
            setGpsError('إشارة GPS ضعيفة أو غير متاحة مؤقتاً — سيحاول النظام إعادة الالتقاط تلقائياً.');
          }
        },
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 15000,
        }
      );
    } else {
      setGpsError('المتصفح الحالي لا يدعم خدمة الموقع الجغرافي GPS.');
    }

    return () => {
      isCancelled = true;
      if (watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
      if (androidPollTimer) clearInterval(androidPollTimer);
    };
  }, [activeTrip?.id, activeTrip?.status, settings.gpsSampleIntervalSeconds]);

  // Plant Geofence Check for active trip
  const latestTrackPoint =
    livePosition ||
    (activeTrip?.gpsPoints && activeTrip.gpsPoints.length > 0
      ? activeTrip.gpsPoints[activeTrip.gpsPoints.length - 1]
      : null);

  const plantGeofenceCheck = latestTrackPoint
    ? isWithinPlantGeofence(latestTrackPoint.lat, latestTrackPoint.lng, settings)
    : {
        inside: false,
        distanceMeters: Math.round(
          haversineDistanceMeters(
            truck.lastLat || settings.plantLocation.lat,
            truck.lastLng || settings.plantLocation.lng,
            settings.plantLocation.lat,
            settings.plantLocation.lng
          )
        ),
      };

  // Drivers cannot create/edit/submit trip plans; manager handles trip planning.

  const handleStartTrip = async () => {
    if (!activeTrip) return;
    setTripActionError(null);
    if (activeTrip.status !== 'approved') {
      setTripActionError('ممنوع بدء الرحلة دون وجود موافقة صريحة من المدير.');
      return;
    }

    const executeStart = async (lat?: number, lng?: number) => {
      const res = await startTrip(activeTrip.id, lat, lng);
      if (!res.success) {
        setTripActionError(res.error || 'تعذر بدء الرحلة');
      }
    };

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => executeStart(pos.coords.latitude, pos.coords.longitude),
        () => executeStart(settings.plantLocation.lat, settings.plantLocation.lng),
        { enableHighAccuracy: true, timeout: 4000 }
      );
    } else {
      await executeStart(settings.plantLocation.lat, settings.plantLocation.lng);
    }
  };

  const handleConfirmReturnToPlant = async (detectedAutomatically: boolean) => {
    if (!activeTrip) return;
    const lat = livePosition?.lat ?? truck.lastLat ?? settings.plantLocation.lat;
    const lng = livePosition?.lng ?? truck.lastLng ?? settings.plantLocation.lng;
    await completeTripReturn({
      tripId: activeTrip.id,
      lat,
      lng,
      detectedAutomatically,
    });
  };

  const currentStop: TripCustomerStop | undefined = activeTrip?.customerStops[selectedStopIndex];

  const handleSelectStop = (index: number) => {
    setSelectedStopIndex(index);
    const stop = activeTrip?.customerStops[index];
    if (stop) {
      setDeliveredInput(stop.deliveredLiters > 0 ? stop.deliveredLiters : stop.requestedLiters);
      setPaidInput(stop.paidAmount > 0 ? stop.paidAmount : stop.totalAmount);
      setDeliveryNotes(stop.notes || '');
      setUnloadingActive(stop.status === 'unloading');
    }
  };

  const handleConfirmDelivery = async () => {
    if (!activeTrip || !currentStop) return;
    setIsSubmitting(true);
    try {
      const remainingAmount = Math.max(0, deliveredInput * currentStop.pricePerLiter - paidInput);
      await logDeliveryStop({
        tripId: activeTrip.id,
        orderId: currentStop.orderId,
        deliveredLiters: Number(deliveredInput),
        paidAmount: Number(paidInput),
        remainingAmount,
        notes: deliveryNotes,
      });
      setUnloadingActive(false);
      if (selectedStopIndex < activeTrip.customerStops.length - 1) {
        handleSelectStop(selectedStopIndex + 1);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Field Customer & Water Order submission (Driver raises Orders or Customers ONLY)
  const handleSelectExistingCustomer = (custId: string) => {
    setSelectedExistingCustomerId(custId);
    const found = customers.find((c) => c.id === custId);
    if (found) {
      setNewOrderForm((prev) => ({
        ...prev,
        customerName: found.name,
        phone: found.phone,
        district: found.district,
        addressDetails: found.addressDetails,
        tankCapacity: found.tankCapacityLiters,
        requestedLiters: found.tankCapacityLiters,
        lat: found.lat,
        lng: found.lng,
      }));
    }
  };

  const handleSaveFieldOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    if (submissionMode === 'order_existing') {
      const selected = customers.find((c) => c.id === selectedExistingCustomerId);
      if (!selected) return;
      await addOrder({
        customerId: selected.id,
        customerName: selected.name,
        phone: selected.phone,
        district: selected.district,
        addressDetails: selected.addressDetails,
        lat: selected.lat,
        lng: selected.lng,
        tankCapacity: selected.tankCapacityLiters,
        tankRemainingLiters: 0,
        requestedLiters: Number(newOrderForm.requestedLiters) || selected.tankCapacityLiters,
        pricePerLiter: settings.defaultSellingPricePerLiter,
        totalAmount:
          (Number(newOrderForm.requestedLiters) || selected.tankCapacityLiters) *
          settings.defaultSellingPricePerLiter,
        source: 'driver_manual',
        isUrgent: newOrderForm.isUrgent,
        notes: newOrderForm.notes,
      });
      setPlannerToast(`تم رفع طلب المياه للزبون (${selected.name}) وإرساله إلى المدير لإدراجه في رحلة.`);
    } else if (submissionMode === 'customer_only') {
      if (!newOrderForm.customerName.trim() || !newOrderForm.phone.trim()) return;
      const createdCust = await addCustomer({
        name: newOrderForm.customerName.trim(),
        phone: newOrderForm.phone.trim(),
        district: newOrderForm.district,
        addressDetails: newOrderForm.addressDetails,
        tankCapacityLiters: Number(newOrderForm.tankCapacity),
        lat: newOrderForm.lat,
        lng: newOrderForm.lng,
        notes: newOrderForm.notes,
      });
      setPlannerToast(`تم رفع بيانات الزبون الجديد (${createdCust.name}) إلى لوحة المدير بنجاح.`);
    } else {
      if (!newOrderForm.customerName.trim() || !newOrderForm.phone.trim()) return;
      const createdCust = await addCustomer({
        name: newOrderForm.customerName.trim(),
        phone: newOrderForm.phone.trim(),
        district: newOrderForm.district,
        addressDetails: newOrderForm.addressDetails,
        tankCapacityLiters: Number(newOrderForm.tankCapacity),
        lat: newOrderForm.lat,
        lng: newOrderForm.lng,
      });

      await addOrder({
        customerId: createdCust.id,
        customerName: newOrderForm.customerName.trim(),
        phone: newOrderForm.phone.trim(),
        district: newOrderForm.district,
        addressDetails: newOrderForm.addressDetails,
        lat: newOrderForm.lat,
        lng: newOrderForm.lng,
        tankCapacity: Number(newOrderForm.tankCapacity),
        tankRemainingLiters: 0,
        requestedLiters: Number(newOrderForm.requestedLiters),
        pricePerLiter: settings.defaultSellingPricePerLiter,
        totalAmount: Number(newOrderForm.requestedLiters) * settings.defaultSellingPricePerLiter,
        source: 'driver_manual',
        isUrgent: newOrderForm.isUrgent,
        notes: newOrderForm.notes,
      });
      setPlannerToast('تم رفع الزبون وطلب المياه بنجاح إلى لوحة المدير لإدراجه في مخطط الرحلة.');
    }

    setSelectedExistingCustomerId('');
    setNewOrderForm({
      customerName: '',
      phone: '',
      district: 'حي الروضة',
      addressDetails: '',
      tankCapacity: 2000,
      requestedLiters: 2000,
      lat: settings.plantLocation.lat + 0.005,
      lng: settings.plantLocation.lng + 0.005,
      isUrgent: false,
      notes: '',
    });
    setHasPickedFromMap(false);
    setTimeout(() => setPlannerToast(null), 5000);
    setActiveTab('trip');
  };

  const handleOpenModificationModal = () => {
    if (!activeTrip) return;
    setModStops(activeTrip.customerStops.map((s) => ({ ...s })));
    setModReason('');
    setModFeedback(null);
    setShowModModal(true);
  };

  const handleSubmitModificationRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTrip || !modReason.trim()) return;
    const res = await requestTripModification(activeTrip.id, modStops, modReason.trim());
    if (res.success) {
      setShowModModal(false);
      setPlannerToast('تم إرسال طلب التعديل إلى المدير للمراجعة والاعتماد.');
      setTimeout(() => setPlannerToast(null), 4000);
    } else {
      setModFeedback(res.error || 'تعذر إرسال طلب التعديل');
    }
  };

  const handleManualSync = async () => {
    if (!isOnline) return;
    await syncOfflineData();
  };

  const totalPendingLocal =
    pendingSyncCount +
    offlineState.pendingDeliveries.length +
    offlineState.pendingOrders.length +
    (offlineState.pendingCustomers?.length || 0) +
    offlineState.pendingGpsPoints.length;

  const handleDriverAcceptTripRequest = async (trip: Trip) => {
    setRespondError(null);
    setRespondingTripId(trip.id);
    const res = await respondToManagerTrip(trip.id, 'accepted');
    setRespondingTripId(null);
    if (res.success) {
      setDecliningTripId(null);
      setDeclineReasonInput('');
      setSelectedTripId(trip.id);
      setActiveTab('trip');
      setPlannerToast(`تمت موافقتك على طلب الرحلة ${trip.tripNumber} وظهور ذلك للمدير فوراً.`);
      setTimeout(() => setPlannerToast(null), 5000);
    } else {
      setRespondError(res.error || 'تعذر تسجيل الموافقة');
    }
  };

  const handleDriverDeclineTripRequest = async (trip: Trip) => {
    setRespondError(null);
    if (!declineReasonInput.trim()) {
      setRespondError('يرجى كتابة سبب عدم الموافقة أو الاعتذار ليظهر للمدير.');
      return;
    }
    setRespondingTripId(trip.id);
    const res = await respondToManagerTrip(trip.id, 'declined', declineReasonInput.trim());
    setRespondingTripId(null);
    if (res.success) {
      setDecliningTripId(null);
      setDeclineReasonInput('');
      setPlannerToast(`تم إرسال ردك بالسبب المكتوب عن الرحلة ${trip.tripNumber} إلى المدير فوراً.`);
      setTimeout(() => setPlannerToast(null), 5000);
    } else {
      setRespondError(res.error || 'تعذر إرسال الرد');
    }
  };

  const activeBadge = activeTrip ? getTripStatusBadge(activeTrip.status) : null;
  const activeDirectives = directives.filter((d) => d.status !== 'completed');
  const driverNotifications = notifications.filter((n) => n.targetRole === 'driver');
  const driverBellCount = unreadDriverCount + activeDirectives.length + pendingManagerTripRequests.length;

  return (
    <div className="min-h-screen w-full bg-slate-950 flex justify-center items-stretch" dir="rtl">
      <div className="w-full max-w-[430px] min-h-screen bg-slate-900 text-white flex flex-col font-sans border-x border-slate-800/80 shadow-2xl relative">
        {/* Sticky Mobile Top Bar: Driver Account, Bell Notifications, PWA Install, Manager Switch & Online/Offline Status */}
        <div className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur px-3 py-2 flex items-center justify-between text-xs border-b border-slate-800 gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              onClick={() => {
                logoutDriver();
              }}
              title="تسجيل خروج السائق"
              className="p-1.5 text-slate-300 hover:text-rose-300 rounded-lg bg-slate-800/80 hover:bg-slate-700 transition-colors shrink-0"
            >
              <LogOut className="w-3.5 h-3.5 rotate-180" />
            </button>
            <div className="min-w-0">
              <div className="font-bold text-sky-400 text-[11px] truncate">
                {driverSession?.name || truck.driverName}
              </div>
              <div className="text-[9px] text-slate-400 flex items-center gap-1">
                <Radio className={`w-2.5 h-2.5 ${wsConnected ? 'animate-pulse text-emerald-400' : 'text-slate-500'}`} />
                <span>{wsConnected ? 'مربوط فورياً' : 'محلي'}</span>
              </div>
            </div>
          </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Driver Notification Bell */}
          <button
            onClick={() => setShowDriverNotifModal(true)}
            title="المطلوب من المدير والإشعارات"
            aria-label="إشعارات السائق"
            className={`relative p-1.5 rounded-lg border transition-colors ${
              driverBellCount > 0
                ? 'bg-amber-950/90 border-amber-600 text-amber-300'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            <Bell className={`w-3.5 h-3.5 ${driverBellCount > 0 ? 'animate-pulse text-amber-400' : ''}`} />
            {driverBellCount > 0 && (
              <span className="absolute -top-1.5 -left-1.5 min-w-4 h-4 px-1 rounded-full bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center">
                {driverBellCount > 9 ? '9+' : driverBellCount}
              </span>
            )}
          </button>

          <PWAInstallButton variant="dark" />
          <button
            onClick={() => {
              if (savedRole === 'manager') {
                setViewMode('manager');
              } else {
                setShowManagerPinModal(true);
              }
            }}
            title="دخول لوحة المدير العام"
            className="px-2 py-1 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1"
          >
            <Lock className="w-3 h-3 text-amber-400" />
            <span>المدير</span>
          </button>

          <button
            onClick={() => setIsOnline(!isOnline)}
            title="حالة الاتصال (اضغط لاختبار العمل دون نت)"
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
              isOnline
                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                : 'bg-rose-950 text-rose-400 border border-rose-800'
            }`}
          >
            {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            <span>{isOnline ? 'متصل' : 'دون نت'}</span>
          </button>
        </div>
      </div>

      {demoClearedNotice && (
        <div className="bg-amber-950/90 border-b border-amber-600 px-3 py-2 text-[11px] text-amber-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>{demoClearedNotice}</span>
          </div>
          <button onClick={dismissDemoClearedNotice} className="text-amber-300 hover:text-white shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Urgent Live Directive Strip from Manager */}
      {activeDirectives.length > 0 && (
        <div className="bg-gradient-to-l from-amber-950/95 via-slate-900 to-rose-950/80 border-b border-amber-600/70 p-2.5 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-amber-300 flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5 text-amber-400 animate-bounce" />
              <span>توجيه مطلوب من المدير ({activeDirectives.length}):</span>
            </span>
            <button
              onClick={() => setShowDriverNotifModal(true)}
              className="text-[10px] text-sky-300 underline"
            >
              عرض الكل
            </button>
          </div>
          {activeDirectives.slice(0, 1).map((d) => (
            <div key={d.id} className="bg-slate-900/90 border border-amber-500/40 rounded-xl p-2.5 text-xs space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-white">{d.title}</span>
                {d.priority === 'urgent' && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-600 text-white font-bold">عاجل</span>
                )}
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">{d.message}</p>
              <div className="flex gap-2">
                {d.status === 'sent' && (
                  <button
                    onClick={() => acknowledgeDirective(d.id, directiveReplyMap[d.id])}
                    className="flex-1 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-[11px] font-bold"
                  >
                    تم الاستلام
                  </button>
                )}
                <button
                  onClick={() => completeDirective(d.id, directiveReplyMap[d.id] || 'تم تنفيذ توجيه المدير')}
                  className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-bold"
                >
                  تم الإنجاز
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Incoming Manager-Proposed Trip Requests (Requires Driver Approval or Written Reason) */}
      {pendingManagerTripRequests.length > 0 && (
        <div className="bg-gradient-to-l from-sky-950/95 via-slate-900 to-indigo-950/90 border-b-2 border-sky-500 p-3 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-sky-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span>طلب رحلة من اقتراح المدير ({pendingManagerTripRequests.length})</span>
            </span>
            <span className="text-[10px] bg-sky-900/80 text-sky-200 px-2 py-0.5 rounded border border-sky-600 font-bold">
              بانتظار موافقتك
            </span>
          </div>

          {pendingManagerTripRequests.map((reqTrip) => {
            const isDecliningThis = decliningTripId === reqTrip.id;
            const isBusy = respondingTripId === reqTrip.id;
            return (
              <div
                key={reqTrip.id}
                className="bg-slate-900/95 border border-sky-500/60 rounded-xl p-3 space-y-2.5 text-xs shadow-lg"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="font-mono font-bold text-sky-400">{reqTrip.tripNumber}</span>
                    <span className="text-[11px] text-slate-300 mr-2">
                      · {reqTrip.customerStops.length} وجهات · {reqTrip.initialLoadLiters.toLocaleString()} لتر
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTripId(reqTrip.id);
                      setActiveTab('trip');
                    }}
                    className="text-[11px] text-sky-300 hover:text-sky-200 underline shrink-0"
                  >
                    التفاصيل
                  </button>
                </div>

                <div className="text-[11px] text-slate-300 bg-slate-950/70 rounded-lg p-2 border border-slate-800 leading-relaxed">
                  {reqTrip.customerStops.map((s) => `${s.customerName} (${s.district})`).join(' ← ')}
                </div>

                {respondError && isDecliningThis && (
                  <div className="text-[11px] text-rose-300 bg-rose-950/80 border border-rose-700 rounded-lg p-2">
                    {respondError}
                  </div>
                )}

                {!isDecliningThis ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleDriverAcceptTripRequest(reqTrip)}
                      className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>{isBusy ? 'جاري التأكيد...' : 'موافقة على الرحلة'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        setDecliningTripId(reqTrip.id);
                        setDeclineReasonInput('');
                        setRespondError(null);
                      }}
                      className="flex-1 py-2 bg-rose-950/90 hover:bg-rose-900 border border-rose-600 text-rose-200 rounded-lg font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>رد بكتابة السبب</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 bg-slate-950/80 p-2.5 rounded-xl border border-rose-700/70">
                    <label className="block text-[11px] font-bold text-rose-300">
                      اكتب سبب عدم الموافقة أو الاعتذار ليظهر للمدير فوراً:
                    </label>
                    <textarea
                      rows={2}
                      value={declineReasonInput}
                      onChange={(e) => setDeclineReasonInput(e.target.value)}
                      placeholder="مثال: الوايت يحتاج صيانة، الطريق مغلق، أو الحمولة غير مناسبة للحي حالياً..."
                      className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:border-rose-500 outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleDriverDeclineTripRequest(reqTrip)}
                        className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold text-[11px] disabled:opacity-50"
                      >
                        {isBusy ? 'جاري الإرسال...' : 'إرسال الرد والسبب للمدير'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDecliningTripId(null);
                          setRespondError(null);
                        }}
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold text-[11px]"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Main Truck Capacity & Auto-Sync Alert Strip */}
      <div className="bg-slate-800/80 p-3 border-b border-slate-700 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-slate-300">
            <Truck className="w-4 h-4 text-sky-400" />
            <span>
              وايت {truck.maxCapacityLiters.toLocaleString()}L ({truck.plateNumber})
            </span>
          </div>
          <span className="font-mono text-emerald-400 font-bold">
            {activeTrip ? activeTrip.remainingLiters.toLocaleString() : truck.maxCapacityLiters.toLocaleString()} لتر متبقي
          </span>
        </div>

        <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
          <div
            className="bg-sky-500 h-2 rounded-full transition-all duration-500"
            style={{
              width: `${
                activeTrip
                  ? Math.min(100, (activeTrip.remainingLiters / truck.maxCapacityLiters) * 100)
                  : 100
              }%`,
            }}
          />
        </div>

        {(lastAutoSyncResult || isSyncing) && (
          <div className="text-[11px] bg-emerald-950/80 border border-emerald-700 text-emerald-300 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
            <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'جاري المزامنة التلقائية مع الخادم...' : lastAutoSyncResult}</span>
          </div>
        )}
      </div>

      {/* Main Mobile Content Area */}
      <div className="flex-1 p-3 pb-6 space-y-4">
        {plannerToast && (
          <div className="bg-emerald-950/90 border border-emerald-600 text-emerald-200 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{plannerToast}</span>
          </div>
        )}

        {/* TAB 1: MANAGER-ASSIGNED TRIPS & EXECUTION */}
        {activeTab === 'trip' && (
          <div className="space-y-4">
            {/* Switch between Manager-assigned Trips (Role Policy Banner) */}
            <div className="bg-slate-800/70 p-2.5 rounded-xl border border-slate-700 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <select
                  value={activeTrip?.id || ''}
                  onChange={(e) => {
                    setSelectedTripId(e.target.value);
                    setSelectedStopIndex(0);
                  }}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono text-white"
                >
                  {trips.length === 0 ? (
                    <option value="">لا توجد رحلات حالياً</option>
                  ) : (
                    trips.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.tripNumber} — {getTripStatusBadge(t.status).label}
                      </option>
                    ))
                  )}
                </select>

                <button
                  type="button"
                  onClick={() => setActiveTab('new_order')}
                  className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg flex items-center gap-1 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>رفع طلب/زبون</span>
                </button>
              </div>
              <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>إعداد مخططات الرحلات من صلاحيات المدير فقط — يمكنك رفع الطلبات والزبائن وتنفيذ الرحلات المعتمدة.</span>
              </div>
            </div>

            {/* VIEW ACTIVE/SELECTED TRIP */}
            {activeTrip && (
              <div className="space-y-4">
                {/* Status Banner & Primary Workflow Actions */}
                <div className="bg-slate-800 border border-slate-700 rounded-2xl p-3.5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-sky-400 text-sm">{activeTrip.tripNumber}</span>
                        {activeBadge && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${activeBadge.cls}`}>
                            {activeBadge.label}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        {activeTrip.customerStops.length} وجهات · المطلوب {activeTrip.initialLoadLiters.toLocaleString()}L · الموزع{' '}
                        {activeTrip.deliveredLiters.toLocaleString()}L
                      </div>
                    </div>

                    {(activeTrip.status === 'approved' || activeTrip.status === 'in_progress') && (
                      <button
                        type="button"
                        onClick={handleOpenModificationModal}
                        className="px-2.5 py-1.5 bg-amber-950/70 hover:bg-amber-900 border border-amber-700 text-amber-300 rounded-lg text-[11px] font-bold flex items-center gap-1"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>طلب تعديل للمدير</span>
                      </button>
                    )}
                  </div>

                  {/* Rejection / Return Notes */}
                  {activeTrip.status === 'rejected' && activeTrip.rejectionReason && (
                    <div className="p-2.5 bg-rose-950/70 border border-rose-700 rounded-xl text-xs text-rose-200">
                      <strong>سبب الإلغاء / الرفض:</strong> {activeTrip.rejectionReason}
                    </div>
                  )}
                  {activeTrip.status === 'draft' && (
                    <div className="p-2.5 bg-slate-900/80 border border-slate-700 rounded-xl text-xs text-slate-300">
                      هذه الرحلة مسودة قيد الإعداد من المدير ولم تُعتمد بعد للانطلاق.
                    </div>
                  )}

                  {/* Mandatory Manager Approval Gate */}
                  {activeTrip.status === 'pending_approval' && (
                    <div className="space-y-2">
                      <div className="p-2.5 bg-amber-950/60 border border-amber-700/70 rounded-xl text-[11px] text-amber-200 flex items-center gap-2">
                        <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>لا يُسمح ببدء الرحلة إلا بعد مراجعة واعتماد المدير العام الصريح.</span>
                      </div>
                      <button
                        type="button"
                        disabled
                        className="w-full py-3 bg-slate-700 text-slate-400 font-bold rounded-xl text-xs flex items-center justify-center gap-2 cursor-not-allowed opacity-70"
                      >
                        <Lock className="w-4 h-4" />
                        <span>بدء الرحلة (مقفل — بانتظار الاعتماد)</span>
                      </button>
                    </div>
                  )}

                  {/* Driver Acceptance / Declined Status for Manager-Proposed Trips */}
                  {activeTrip.createdByRole === 'manager' && activeTrip.driverAcceptanceStatus === 'declined' && (
                    <div className="p-3 bg-rose-950/75 border border-rose-600 rounded-xl text-xs text-rose-200 space-y-2">
                      <div className="flex items-center gap-2 font-bold text-rose-300">
                        <XCircle className="w-4 h-4 shrink-0" />
                        <span>تم إرسال ردك للمدير: اعتذار / عدم الموافقة على طلب الرحلة</span>
                      </div>
                      <p className="text-[11px] bg-slate-950/70 p-2 rounded-lg border border-rose-800/70">
                        <strong>السبب المكتوب:</strong> {activeTrip.driverResponseReason}
                      </p>
                      {activeTrip.status === 'approved' && (
                        <button
                          type="button"
                          onClick={() => handleDriverAcceptTripRequest(activeTrip)}
                          className="w-full py-2 bg-emerald-700 hover:bg-emerald-600 text-white font-bold rounded-lg text-[11px]"
                        >
                          تغيير الرد والموافقة على تنفيذ الرحلة
                        </button>
                      )}
                    </div>
                  )}

                  {/* Approved -> Wait for Driver Acceptance if Manager-proposed, otherwise Start Trip */}
                  {activeTrip.status === 'approved' && (
                    <div className="space-y-2">
                      {activeTrip.createdByRole === 'manager' &&
                      activeTrip.driverAcceptanceStatus !== 'accepted' ? (
                        activeTrip.driverAcceptanceStatus !== 'declined' && (
                          <div className="p-3 bg-sky-950/70 border border-sky-500 rounded-xl space-y-2.5 text-xs">
                            <div className="font-bold text-sky-300 flex items-center gap-1.5">
                              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                              <span>طلب رحلة معتمد ومقترح من المدير — يرجى تأكيد الموافقة أو الرد بالسبب</span>
                            </div>
                            {respondError && decliningTripId === activeTrip.id && (
                              <div className="text-[11px] text-rose-300 bg-rose-950/80 border border-rose-700 rounded-lg p-2">
                                {respondError}
                              </div>
                            )}
                            {decliningTripId === activeTrip.id ? (
                              <div className="space-y-2 bg-slate-950/80 p-2.5 rounded-xl border border-rose-700/70">
                                <label className="block text-[11px] font-bold text-rose-300">
                                  اكتب سبب عدم الموافقة أو الاعتذار ليظهر للمدير فوراً:
                                </label>
                                <textarea
                                  rows={2}
                                  value={declineReasonInput}
                                  onChange={(e) => setDeclineReasonInput(e.target.value)}
                                  placeholder="اكتب السبب هنا..."
                                  className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:border-rose-500 outline-none"
                                />
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    disabled={respondingTripId === activeTrip.id}
                                    onClick={() => handleDriverDeclineTripRequest(activeTrip)}
                                    className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold text-[11px] disabled:opacity-50"
                                  >
                                    {respondingTripId === activeTrip.id ? 'جاري الإرسال...' : 'إرسال الرد والسبب للمدير'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDecliningTripId(null);
                                      setRespondError(null);
                                    }}
                                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold text-[11px]"
                                  >
                                    إلغاء
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  disabled={respondingTripId === activeTrip.id}
                                  onClick={() => handleDriverAcceptTripRequest(activeTrip)}
                                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center justify-center gap-1.5"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                  <span>موافقة على الرحلة</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDecliningTripId(activeTrip.id);
                                    setDeclineReasonInput('');
                                    setRespondError(null);
                                  }}
                                  className="flex-1 py-2.5 bg-rose-950 hover:bg-rose-900 border border-rose-600 text-rose-200 font-bold rounded-xl flex items-center justify-center gap-1.5"
                                >
                                  <MessageSquare className="w-4 h-4" />
                                  <span>رد بكتابة السبب</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      ) : (
                        <>
                          <div className="p-2 bg-emerald-950/60 border border-emerald-700/70 rounded-xl text-[11px] text-emerald-300 flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 shrink-0" />
                            <span>
                              تم اعتماد الرحلة من {activeTrip.approvedBy || 'المدير العام'}
                              {activeTrip.createdByRole === 'manager' ? ' ووافق السائق' : ''} — اضغط للانطلاق.
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={handleStartTrip}
                            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg"
                          >
                            <Play className="w-5 h-5 fill-white" />
                            <span>بدء الرحلة وتشغيل التتبع التلقائي</span>
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* In Progress -> Plant Geofence Return Alert & Manual Return Button */}
                  {activeTrip.status === 'in_progress' && (
                    <div className="space-y-2.5">
                      <div className="bg-emerald-950/70 border border-emerald-600 rounded-xl p-2.5 flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-2 text-emerald-300 font-bold">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                          <span>تتبع GPS التلقائي يعمل ({(activeTrip.gpsPoints || []).length} نقطة)</span>
                        </div>
                        <span className="font-mono text-sky-300">{activeTrip.actualDistanceKm ?? 0} كم</span>
                      </div>

                      {gpsError && (
                        <div className="p-2 bg-rose-950 border border-rose-700 text-rose-200 rounded-lg text-[11px] flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                          <span>{gpsError}</span>
                        </div>
                      )}

                      {plantGeofenceCheck.inside ? (
                        <div className="bg-teal-950 border-2 border-emerald-400 rounded-xl p-3 space-y-2 shadow-lg">
                          <div className="text-xs font-bold text-emerald-300 flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 shrink-0" />
                            <span>تم رصد وصولك إلى نطاق المصنع ({plantGeofenceCheck.distanceMeters} متر)!</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleConfirmReturnToPlant(true)}
                            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2"
                          >
                            <Square className="w-4 h-4 fill-white" />
                            <span>إنهاء الرحلة وتأكيد العودة للمصنع</span>
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleConfirmReturnToPlant(false)}
                          className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2"
                        >
                          <MapPin className="w-4 h-4" />
                          <span>تأكيد العودة إلى المصنع وإنهاء التتبع (البعد: {plantGeofenceCheck.distanceMeters}م)</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Returned / Pending Sync / Completed / Closed Banners */}
                  {activeTrip.status === 'pending_sync' && (
                    <div className="p-3 bg-orange-950/80 border border-orange-600 rounded-xl text-xs text-orange-200 space-y-2">
                      <div className="font-bold flex items-center gap-2">
                        <WifiOff className="w-4 h-4 text-orange-400" />
                        <span>تم إنهاء الرحلة محلياً — بانتظار المزامنة عند توفر الإنترنت</span>
                      </div>
                      <p className="text-[11px] opacity-90">
                        كافة نقاط GPS والتوقفات محفوظة بأمان في قاعدة بيانات الهاتف ولن تُحذف حتى تأكيد الخادم.
                      </p>
                    </div>
                  )}

                  {activeTrip.status === 'completed_pending_review' && (
                    <div className="p-3 bg-indigo-950/80 border border-indigo-600 rounded-xl text-xs text-indigo-200 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span>تمت المزامنة بنجاح — الرحلة الآن في لوحة المدير بحالة «مكتملة بانتظار المراجعة».</span>
                    </div>
                  )}

                  {tripActionError && (
                    <div className="p-2 bg-rose-950 border border-rose-700 text-rose-200 rounded-lg text-xs">
                      {tripActionError}
                    </div>
                  )}
                </div>

                {/* Stops Queue Strip */}
                {activeTrip.customerStops.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs text-slate-400 font-semibold flex justify-between">
                      <span>الوجهات المعتمدة في المخطط:</span>
                      <span className="font-mono">
                        {selectedStopIndex + 1} من {activeTrip.customerStops.length}
                      </span>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {activeTrip.customerStops.map((stop, idx) => {
                        const isSelected = selectedStopIndex === idx;
                        const isDone = stop.status === 'delivered';
                        return (
                          <button
                            key={stop.orderId}
                            onClick={() => handleSelectStop(idx)}
                            className={`p-2.5 rounded-xl text-right min-w-[140px] shrink-0 border transition-all ${
                              isSelected
                                ? 'bg-sky-600 border-sky-400 text-white shadow-lg'
                                : isDone
                                ? 'bg-emerald-950/60 border-emerald-800 text-emerald-200'
                                : 'bg-slate-800 border-slate-700 text-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="font-bold text-[10px]">#{stop.stopSequence}</span>
                              <span className="text-[10px] font-mono">{stop.requestedLiters}L</span>
                            </div>
                            <div className="font-bold text-xs truncate">{stop.customerName}</div>
                            <div className="text-[10px] opacity-80 truncate">{stop.district}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Active Stop Card */}
                {currentStop && (
                  <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 space-y-4">
                    <div className="flex items-start justify-between pb-3 border-b border-slate-700">
                      <div>
                        <span className="text-xs text-sky-400 font-bold block mb-0.5">
                          المحطة #{currentStop.stopSequence} · {currentStop.district}
                        </span>
                        <h3 className="font-bold text-base text-white">{currentStop.customerName}</h3>
                        <p className="text-xs text-slate-400 mt-0.5">{currentStop.addressDetails}</p>
                        <div className="text-[10px] font-mono text-slate-500 mt-1">
                          GPS: {currentStop.lat.toFixed(5)}, {currentStop.lng.toFixed(5)}
                        </div>
                      </div>
                      <a
                        href={`tel:${currentStop.phone}`}
                        className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-500 shadow-lg"
                      >
                        <Phone className="w-5 h-5" />
                      </a>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-slate-900/60 p-3 rounded-xl border border-slate-700/60 font-mono">
                      <div>
                        <span className="text-slate-400 block text-[10px]">الكمية المطلوبة:</span>
                        <span className="text-sky-400 font-bold text-sm">
                          {currentStop.requestedLiters.toLocaleString()} لتر
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">حالة التسليم:</span>
                        <span className={`font-bold text-sm ${currentStop.status === 'delivered' ? 'text-emerald-400' : 'text-amber-300'}`}>
                          {currentStop.status === 'delivered' ? 'تم التسليم ✓' : 'قيد الانتظار'}
                        </span>
                      </div>
                    </div>

                    {/* Delivery Logging Allowed Only When In Progress */}
                    {activeTrip.status === 'in_progress' && currentStop.status !== 'delivered' && (
                      <div className="space-y-2.5">
                        {!unloadingActive ? (
                          <button
                            onClick={() => {
                              setDeliveredInput(currentStop.requestedLiters);
                              setPaidInput(currentStop.totalAmount);
                              setUnloadingActive(true);
                            }}
                            className="w-full py-3.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg"
                          >
                            <Droplet className="w-5 h-5 fill-white" />
                            <span>بدء تفريغ المياه وتسجيل التسليم</span>
                          </button>
                        ) : (
                          <div className="bg-slate-900 p-4 rounded-xl border border-sky-500 space-y-3">
                            <div className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                              <Droplet className="w-4 h-4 fill-sky-400" />
                              <span>توثيق الكمية المسلمة والمبلغ المحصل</span>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[11px] text-slate-400 mb-1">الكمية المسلمة (لتر) *</label>
                                <input
                                  type="number"
                                  value={deliveredInput}
                                  onChange={(e) => {
                                    const val = Number(e.target.value);
                                    setDeliveredInput(val);
                                    setPaidInput(val * currentStop.pricePerLiter);
                                  }}
                                  className="w-full p-2.5 bg-slate-800 border border-slate-600 rounded-lg text-sm font-mono font-bold text-white text-center"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] text-slate-400 mb-1">المبلغ المستلم (ر.ي) *</label>
                                <input
                                  type="number"
                                  value={paidInput}
                                  onChange={(e) => setPaidInput(Number(e.target.value))}
                                  className="w-full p-2.5 bg-slate-800 border border-slate-600 rounded-lg text-sm font-mono font-bold text-emerald-400 text-center"
                                />
                              </div>
                            </div>

                            <button
                              onClick={handleConfirmDelivery}
                              disabled={isSubmitting}
                              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
                            >
                              <CheckCircle className="w-4 h-4" />
                              <span>{isSubmitting ? 'جاري الحفظ...' : 'تأكيد التسليم وإصدار الفاتورة'}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {!activeTrip && (
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 text-center space-y-3 text-xs">
                <Truck className="w-10 h-10 text-slate-500 mx-auto" />
                <div className="font-bold text-slate-200">لا توجد رحلات موكلة إليك حالياً</div>
                <p className="text-slate-400 leading-relaxed">
                  إعداد ورفع مخططات الرحلات من مهام المدير العام فقط. يمكنك رفع طلبات المياه أو تسجيل الزبائن الجدد ليقوم المدير بإدراجها في رحلة وإرسالها إليك.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('new_order')}
                  className="px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>رفع طلب مياه أو زبون جديد</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: RAISE WATER ORDER OR REGISTER CUSTOMER ONLY */}
        {activeTab === 'new_order' && (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 space-y-4 text-xs">
            <div className="space-y-1">
              <h3 className="font-bold text-sm text-sky-400 flex items-center gap-2">
                {submissionMode === 'customer_only' ? (
                  <UserPlus className="w-4 h-4" />
                ) : (
                  <ShoppingCart className="w-4 h-4" />
                )}
                <span>رفع طلبات المياه والزبائن للمدير</span>
              </h3>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                يرفع السائق الطلبات أو الزبائن فقط لتصل فوراً إلى لوحة المدير (أو تحفظ محلياً دون نت) ليقوم المدير بإعداد مخطط الرحلة.
              </p>
            </div>

            {/* 3-Way Mode Selector */}
            <div className="grid grid-cols-3 gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-700 text-[11px]">
              <button
                type="button"
                onClick={() => setSubmissionMode('order_new')}
                className={`py-2 px-1.5 rounded-lg font-bold transition-colors ${
                  submissionMode === 'order_new'
                    ? 'bg-sky-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                زبون جديد + طلب
              </button>
              <button
                type="button"
                onClick={() => setSubmissionMode('order_existing')}
                className={`py-2 px-1.5 rounded-lg font-bold transition-colors ${
                  submissionMode === 'order_existing'
                    ? 'bg-sky-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                طلب لزبون مسجل
              </button>
              <button
                type="button"
                onClick={() => setSubmissionMode('customer_only')}
                className={`py-2 px-1.5 rounded-lg font-bold transition-colors ${
                  submissionMode === 'customer_only'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                زبون جديد فقط
              </button>
            </div>

            <form onSubmit={handleSaveFieldOrder} className="space-y-3">
              {submissionMode === 'order_existing' ? (
                <>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">اختر الزبون المسجل *</label>
                    <select
                      required
                      value={selectedExistingCustomerId}
                      onChange={(e) => handleSelectExistingCustomer(e.target.value)}
                      className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
                    >
                      <option value="">-- اختر الزبون --</option>
                      {customers
                        .filter((c) => c.isActive)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.district}) — {c.phone}
                          </option>
                        ))}
                    </select>
                  </div>

                  {selectedExistingCustomerId && (
                    <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-2.5 text-[11px] text-slate-300 space-y-1">
                      <div>
                        <strong>الهاتف:</strong> <span className="font-mono">{newOrderForm.phone}</span> ·{' '}
                        <strong>الحي:</strong> {newOrderForm.district}
                      </div>
                      <div>
                        <strong>سعة الخزان:</strong> {newOrderForm.tankCapacity.toLocaleString()} لتر (يفترض فارغ 0L)
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">الكمية المطلوبة (لتر) *</label>
                    <input
                      type="number"
                      required
                      min={100}
                      value={newOrderForm.requestedLiters}
                      onChange={(e) => setNewOrderForm({ ...newOrderForm, requestedLiters: Number(e.target.value) })}
                      className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">اسم الزبون *</label>
                    <input
                      type="text"
                      required
                      value={newOrderForm.customerName}
                      onChange={(e) => setNewOrderForm({ ...newOrderForm, customerName: e.target.value })}
                      placeholder="مثال: صالح العبيدي"
                      className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">رقم الهاتف *</label>
                    <input
                      type="text"
                      required
                      value={newOrderForm.phone}
                      onChange={(e) => setNewOrderForm({ ...newOrderForm, phone: e.target.value })}
                      placeholder="71xxxxxxx"
                      className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">الحي بمأرب</label>
                    <select
                      value={newOrderForm.district}
                      onChange={(e) => setNewOrderForm({ ...newOrderForm, district: e.target.value })}
                      className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
                    >
                      <option value="حي الروضة">حي الروضة</option>
                      <option value="حي الشركة">حي الشركة</option>
                      <option value="المجمع الحكومي">المجمع الحكومي</option>
                      <option value="حي السلام">حي السلام</option>
                      <option value="حي المطار">حي المطار</option>
                      <option value="حي الفاو">حي الفاو</option>
                      <option value="الخسيف">الخسيف</option>
                      <option value="حصون آل جلال">حصون آل جلال</option>
                    </select>
                  </div>
                  <div className={submissionMode === 'order_new' ? 'grid grid-cols-2 gap-2' : ''}>
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">سعة الخزان</label>
                      <select
                        value={newOrderForm.tankCapacity}
                        onChange={(e) => {
                          const cap = Number(e.target.value);
                          setNewOrderForm({ ...newOrderForm, tankCapacity: cap, requestedLiters: cap });
                        }}
                        className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                      >
                        <option value={500}>500 لتر</option>
                        <option value={1000}>1,000 لتر</option>
                        <option value={2000}>2,000 لتر</option>
                        <option value={3000}>3,000 لتر</option>
                        <option value={5000}>5,000 لتر</option>
                        <option value={6000}>6,000 لتر</option>
                      </select>
                    </div>
                    {submissionMode === 'order_new' && (
                      <div>
                        <label className="block text-slate-300 font-semibold mb-1">الكمية المطلوبة (لتر)</label>
                        <input
                          type="number"
                          min={100}
                          value={newOrderForm.requestedLiters}
                          onChange={(e) => setNewOrderForm({ ...newOrderForm, requestedLiters: Number(e.target.value) })}
                          className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">العنوان التفصيلي</label>
                    <input
                      type="text"
                      value={newOrderForm.addressDetails}
                      onChange={(e) => setNewOrderForm({ ...newOrderForm, addressDetails: e.target.value })}
                      placeholder="خلف المسجد / جوار البقالة"
                      className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
                    />
                  </div>

                  <div className="bg-slate-900/90 border border-slate-700 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-200 font-bold text-xs flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-rose-500" />
                        <span>موقع الزبون الجغرافي</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsMapPickerOpen(true)}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-xs flex items-center gap-1"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        <span>{hasPickedFromMap ? 'تعديل الدبوس' : 'تحديد على الخريطة'}</span>
                      </button>
                    </div>
                    <div className="text-[11px] font-mono text-emerald-400">
                      ({newOrderForm.lat.toFixed(5)}, {newOrderForm.lng.toFixed(5)})
                    </div>
                  </div>
                </>
              )}

              {submissionMode !== 'customer_only' && (
                <label className="flex items-center gap-2 bg-slate-900/70 border border-slate-700 rounded-xl p-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newOrderForm.isUrgent}
                    onChange={(e) => setNewOrderForm({ ...newOrderForm, isUrgent: e.target.checked })}
                    className="rounded text-rose-600"
                  />
                  <span className="font-bold text-rose-300">طلب مياه عاجل</span>
                </label>
              )}

              <div>
                <label className="block text-slate-300 font-semibold mb-1">ملاحظات للمدير (اختياري)</label>
                <input
                  type="text"
                  value={newOrderForm.notes}
                  onChange={(e) => setNewOrderForm({ ...newOrderForm, notes: e.target.value })}
                  placeholder="أي تفاصيل إضافية للمدير..."
                  className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow"
              >
                <CheckCircle className="w-4 h-4" />
                <span>
                  {submissionMode === 'customer_only'
                    ? 'رفع بيانات الزبون للمدير'
                    : 'رفع طلب المياه للمدير'}
                </span>
              </button>
            </form>
          </div>
        )}

        {/* TAB 3: LIVE AUTOMATIC GPS TELEMETRY */}
        {activeTab === 'gps_live' && (
          <div className="space-y-4 text-xs">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-700">
                <h3 className="font-bold text-sm text-emerald-400 flex items-center gap-2">
                  <Navigation className="w-4 h-4" />
                  <span>التتبع الجغرافي التلقائي GPS</span>
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${activeTrip?.status === 'in_progress' ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' : 'bg-slate-900 text-slate-400'}`}>
                  {activeTrip?.status === 'in_progress' ? 'نشط الآن' : 'متوقف'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 bg-slate-900/70 p-3 rounded-xl border border-slate-700 font-mono">
                <div>
                  <span className="text-slate-400 block text-[10px]">الإحداثيات الحالية:</span>
                  <span className="text-sky-300 font-bold">
                    {latestTrackPoint ? `${latestTrackPoint.lat.toFixed(5)}, ${latestTrackPoint.lng.toFixed(5)}` : 'بانتظار GPS...'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">السرعة والدقة:</span>
                  <span className="text-emerald-300 font-bold">
                    {livePosition ? `${livePosition.speedKmH} كم/س (±${livePosition.accuracy}م)` : `${truck.lastSpeed || 0} كم/س`}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">المسافة المقطوعة:</span>
                  <span className="text-white font-bold">{activeTrip?.actualDistanceKm ?? 0} كم</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">البعد عن المصنع:</span>
                  <span className={plantGeofenceCheck.inside ? 'text-emerald-400 font-bold' : 'text-amber-300 font-bold'}>
                    {plantGeofenceCheck.distanceMeters} م ({plantGeofenceCheck.inside ? 'داخل النطاق' : 'خارج النطاق'})
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-[10px]">
                <span className={`px-2 py-1 rounded border ${wakeLockActive ? 'bg-emerald-950 text-emerald-300 border-emerald-800' : 'bg-slate-900 text-slate-400 border-slate-700'}`}>
                  WakeLock: {wakeLockActive ? 'الشاشة نشطة' : 'غير مفعل'}
                </span>
                <span className="px-2 py-1 rounded border bg-slate-900 text-slate-300 border-slate-700">
                  التوقف الفعلي ≥ {settings.stopDetectionMinutes} د
                </span>
                <span className="px-2 py-1 rounded border bg-slate-900 text-slate-300 border-slate-700">
                  سرعة الحركة ≥ {settings.minMovementSpeedKmH} كم/س
                </span>
              </div>

              <div className="p-2.5 bg-slate-900/90 border border-slate-700 rounded-xl text-[11px] text-slate-400 flex items-center gap-2">
                <Lock className="w-4 h-4 text-sky-400 shrink-0" />
                <span>سجل نقاط GPS للقراءة فقط ولا يمكن تعديله أو حذفه من تطبيق السائق لضمان الموثوقية.</span>
              </div>
            </div>

            {/* Small Leaflet Mini-View: Recent Route Points & Detected Stops */}
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-bold text-slate-100 flex items-center gap-1.5 text-xs">
                  <MapPin className="w-4 h-4 text-sky-400" />
                  <span>خريطة مصغرة للمسار والتوقفات</span>
                </h4>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-sky-300">
                  آخر {gpsLiveMiniMapTrip.gpsPoints?.length || 0} نقطة · {gpsLiveMiniMapTrip.detectedStops?.length || 0} توقفات
                </span>
              </div>

              <div className="rounded-xl overflow-hidden border border-slate-700">
                <TripTrackingMap
                  trip={gpsLiveMiniMapTrip}
                  settings={settings}
                  height="215px"
                  showLegend={false}
                  liveCoords={
                    livePosition
                      ? { lat: livePosition.lat, lng: livePosition.lng, speedKmH: livePosition.speedKmH }
                      : truck.lastLat && truck.lastLng
                        ? { lat: truck.lastLat, lng: truck.lastLng, speedKmH: truck.lastSpeed }
                        : null
                  }
                />
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-300 pt-0.5">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                  <span>الوايت الحالي</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3.5 h-1 bg-sky-500 inline-block rounded" />
                  <span>المسار الحديث</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="px-1 rounded bg-emerald-700 text-white text-[9px]">⏸</span>
                  <span>توقف قرب زبون</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="px-1 rounded bg-amber-600 text-white text-[9px]">⏸</span>
                  <span>توقف غير مخطط</span>
                </span>
              </div>
            </div>

            {/* Detected Stops List (Read-Only) */}
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 space-y-2.5">
              <h4 className="font-bold text-slate-200 flex items-center gap-1.5">
                <Crosshair className="w-4 h-4 text-amber-400" />
                <span>التوقفات المرصودة آلياً ({activeTrip?.detectedStops?.length || 0})</span>
              </h4>
              {!activeTrip?.detectedStops || activeTrip.detectedStops.length === 0 ? (
                <p className="text-[11px] text-slate-400">
                  لم يُرصد أي توقف طويل يتجاوز {settings.stopDetectionMinutes} دقائق بعد (يتم تجاهل التوقفات المرورية المؤقتة تلقائياً).
                </p>
              ) : (
                <div className="space-y-2">
                  {activeTrip.detectedStops.map((st, idx) => (
                    <div key={st.id} className="bg-slate-900 border border-slate-700 rounded-xl p-2.5 space-y-1">
                      <div className="flex justify-between font-mono text-[11px]">
                        <span className="font-bold text-amber-300">توقف #{idx + 1} · {st.durationMinutes} دقيقة</span>
                        <span className="text-slate-400">{new Date(st.startTime).toLocaleTimeString('ar-YE')}</span>
                      </div>
                      <div className="text-[11px] text-slate-300">
                        {st.nearCustomerName
                          ? `قرب الزبون: ${st.nearCustomerName} (${st.distanceToCustomerMeters} م)`
                          : 'خارج نطاق مواقع الزبائن المعتمدين'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: OFFLINE-FIRST STORAGE & AUTO-SYNC */}
        {activeTab === 'offline_queue' && (
          <div className="space-y-4 text-xs">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-700">
                <h3 className="font-bold text-sm text-sky-400 flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  <span>التخزين المحلي والمزامنة التلقائية (IndexedDB)</span>
                </h3>
                <span className={`font-mono font-bold px-2 py-0.5 rounded ${totalPendingLocal > 0 ? 'bg-amber-950 text-amber-300' : 'bg-emerald-950 text-emerald-300'}`}>
                  {totalPendingLocal} معلق
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-900/70 p-3 rounded-xl border border-slate-700">
                <div className="flex justify-between">
                  <span className="text-slate-400">نقاط GPS بالذاكرة:</span>
                  <span className="font-mono font-bold text-sky-400">{offlineState.pendingGpsPoints.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">عمليات التسليم:</span>
                  <span className="font-mono font-bold text-emerald-400">{offlineState.pendingDeliveries.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">طلبات / زبائن معلقة:</span>
                  <span className="font-mono font-bold text-amber-400">
                    {offlineState.pendingOrders.length + (offlineState.pendingCustomers?.length || 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">معدل الطابور الكلي:</span>
                  <span className="font-mono font-bold text-white">{pendingSyncCount}</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-300 leading-relaxed">
                يحفظ التطبيق كافة بيانات الرحلة ونقاط GPS والتوقفات محلياً في IndexedDB حتى عند انقطاع الإنترنت أو إغلاق التطبيق أو إعادة تشغيل الهاتف، وتتم المزامنة تلقائياً فور عودة الإنترنت.
              </p>

              <button
                type="button"
                onClick={handleManualSync}
                disabled={!isOnline || isSyncing}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'جاري المزامنة...' : isOnline ? 'مزامنة البيانات الآن' : 'بانتظار توفر اتصال الإنترنت'}</span>
              </button>

              <div className="text-[10px] font-mono text-slate-400 text-center">
                آخر مزامنة ناجحة:{' '}
                {offlineState.lastSyncTimestamp
                  ? new Date(offlineState.lastSyncTimestamp).toLocaleTimeString('ar-YE')
                  : 'تتم تلقائياً عند توفر الاتصال'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sticky Mobile Bottom Navigation Bar */}
      <nav
        aria-label="تنقل تطبيق السائق"
        className="sticky bottom-0 z-30 grid grid-cols-4 gap-1 px-2 py-1.5 bg-slate-950/95 backdrop-blur border-t border-slate-800 text-[10px]"
      >
        <button
          type="button"
          onClick={() => setActiveTab('trip')}
          className={`py-1.5 px-1 rounded-xl font-bold transition-all flex flex-col items-center justify-center gap-1 ${
            activeTab === 'trip'
              ? 'bg-sky-600/20 text-sky-400 border border-sky-500/40'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <ListChecks className="w-4 h-4" />
          <span>الرحلات</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('new_order')}
          className={`py-1.5 px-1 rounded-xl font-bold transition-all flex flex-col items-center justify-center gap-1 ${
            activeTab === 'new_order'
              ? 'bg-sky-600/20 text-sky-400 border border-sky-500/40'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Plus className="w-4 h-4" />
          <span>طلب / زبون</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('gps_live')}
          className={`py-1.5 px-1 rounded-xl font-bold transition-all flex flex-col items-center justify-center gap-1 ${
            activeTab === 'gps_live'
              ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/40'
              : activeTrip?.status === 'in_progress'
              ? 'text-emerald-300'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Navigation className={`w-4 h-4 ${activeTrip?.status === 'in_progress' ? 'animate-pulse' : ''}`} />
          <span>GPS مباشر</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('offline_queue')}
          className={`relative py-1.5 px-1 rounded-xl font-bold transition-all flex flex-col items-center justify-center gap-1 ${
            activeTab === 'offline_queue'
              ? 'bg-amber-600/20 text-amber-400 border border-amber-500/40'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>مزامنة ({totalPendingLocal})</span>
        </button>
      </nav>

      {/* Post-Approval Modification Request Modal (Mobile Bottom Sheet) */}
      {showModModal && (
        <div className="fixed inset-0 bg-slate-950/80 z-50 flex items-end justify-center p-0" dir="rtl">
          <div className="bg-slate-800 border-t border-x border-slate-700 rounded-t-2xl max-w-[430px] w-full max-h-[88vh] overflow-y-auto p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-700">
              <h4 className="font-bold text-sm text-amber-400">طلب تعديل مخطط رحلة معتمدة</h4>
              <button onClick={() => setShowModModal(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-slate-300 text-[11px]">
              لا تُطبق أي تعديلات على الوجهات أو الطلبات بعد اعتماد المدير إلا بموافقة المدير على هذا الطلب.
            </p>
            <form onSubmit={handleSubmitModificationRequest} className="space-y-3">
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {modStops.map((st, idx) => (
                  <div key={st.orderId} className="flex items-center justify-between bg-slate-900 p-2 rounded-lg border border-slate-700">
                    <span>#{idx + 1} {st.customerName} ({st.requestedLiters}L)</span>
                    <button
                      type="button"
                      onClick={() => setModStops((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-rose-400 text-[11px] font-bold"
                    >
                      حذف
                    </button>
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">سبب طلب التعديل *</label>
                <textarea
                  required
                  rows={2}
                  value={modReason}
                  onChange={(e) => setModReason(e.target.value)}
                  placeholder="مثال: تعذر وصول الطريق بسبب صيانة أو طلب زبون التأجيل..."
                  className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
                />
              </div>
              {modFeedback && <div className="text-rose-400 text-[11px]">{modFeedback}</div>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowModModal(false)}
                  className="flex-1 py-2 bg-slate-700 rounded-xl font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold"
                >
                  إرسال الطلب للمدير
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Driver Notifications & Manager Requests Modal (Mobile Bottom Sheet) */}
      {showDriverNotifModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-end justify-center p-0">
          <div className="w-full max-w-[430px] bg-slate-900 border-t border-x border-slate-700 rounded-t-2xl max-h-[86vh] flex flex-col text-xs">
            <div className="p-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between rounded-t-2xl">
              <div className="flex items-center gap-2 font-bold text-sm text-amber-300">
                <Bell className="w-4 h-4 text-amber-400" />
                <span>المطلوب من المدير والإشعارات</span>
              </div>
              <div className="flex items-center gap-2">
                {unreadDriverCount > 0 && (
                  <button
                    onClick={() => markNotificationsRead({ markAll: true, role: 'driver' })}
                    className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>قراءة الكل</span>
                  </button>
                )}
                <button
                  onClick={() => setShowDriverNotifModal(false)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-3.5 overflow-y-auto space-y-3 flex-1">
              {directives.length > 0 && (
                <div className="space-y-2">
                  <div className="font-bold text-amber-300 text-[11px]">توجيهات مباشرة من المدير ({directives.length}):</div>
                  {directives.map((d) => (
                    <div
                      key={d.id}
                      className={`p-3 rounded-xl border space-y-2 ${
                        d.status === 'completed'
                          ? 'bg-slate-800/40 border-slate-700 text-slate-400'
                          : 'bg-amber-950/40 border-amber-600/60 text-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold">{d.title}</span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                            d.status === 'completed'
                              ? 'bg-emerald-950 text-emerald-300'
                              : d.status === 'acknowledged'
                              ? 'bg-sky-950 text-sky-300'
                              : 'bg-amber-950 text-amber-300'
                          }`}
                        >
                          {d.status === 'completed' ? 'مكتمل' : d.status === 'acknowledged' ? 'مستلم' : 'جديد'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300">{d.message}</p>
                      {d.status !== 'completed' && (
                        <div className="space-y-1.5 pt-1">
                          <input
                            type="text"
                            placeholder="رد سريع للمدير (اختياري)..."
                            value={directiveReplyMap[d.id] || ''}
                            onChange={(e) =>
                              setDirectiveReplyMap((prev) => ({ ...prev, [d.id]: e.target.value }))
                            }
                            className="w-full p-1.5 bg-slate-950 border border-slate-700 rounded-lg text-[11px] text-white"
                          />
                          <div className="flex gap-2">
                            {d.status === 'sent' && (
                              <button
                                onClick={() => acknowledgeDirective(d.id, directiveReplyMap[d.id])}
                                className="flex-1 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-bold"
                              >
                                تم الاستلام
                              </button>
                            )}
                            <button
                              onClick={() => completeDirective(d.id, directiveReplyMap[d.id] || 'تم التنفيذ بنجاح')}
                              className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold"
                            >
                              تأكيد الإنجاز
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <div className="font-bold text-slate-300 text-[11px]">سجل تنبيهات الإدارة ({driverNotifications.length}):</div>
                {driverNotifications.length === 0 ? (
                  <div className="text-center text-slate-500 py-4">لا توجد تنبيهات جديدة من المدير حالياً.</div>
                ) : (
                  driverNotifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => {
                        if (!n.isRead) markNotificationsRead({ ids: [n.id] });
                        if (n.tripId) {
                          setSelectedTripId(n.tripId);
                          setActiveTab('trip');
                          setShowDriverNotifModal(false);
                        }
                      }}
                      className={`p-2.5 rounded-xl border space-y-1 cursor-pointer ${
                        n.isRead ? 'bg-slate-800/40 border-slate-800 text-slate-400' : 'bg-sky-950/60 border-sky-600 text-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold">{n.title}</span>
                        {!n.isRead && <span className="w-2 h-2 rounded-full bg-sky-400" />}
                      </div>
                      <p className="text-[11px] opacity-90">{n.message}</p>
                      <div className="text-[10px] opacity-60">
                        {new Date(n.createdAt).toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Instant Live Toast Banner for Driver (Mobile Viewport Centered Above Bottom Bar) */}
      {latestToastNotification && latestToastNotification.targetRole === 'driver' && (
        <div className="fixed bottom-18 left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-[406px] z-50 bg-slate-950 border border-amber-500 text-white rounded-2xl p-3 shadow-2xl flex items-start gap-2.5">
          <Bell className="w-5 h-5 text-amber-400 shrink-0 mt-0.5 animate-bounce" />
          <div className="flex-1 text-xs space-y-1">
            <div className="font-bold text-amber-300">{latestToastNotification.title}</div>
            <p className="text-[11px] text-slate-200">{latestToastNotification.message}</p>
            <button
              onClick={() => {
                if (latestToastNotification.tripId) {
                  setSelectedTripId(latestToastNotification.tripId);
                  setActiveTab('trip');
                } else {
                  setShowDriverNotifModal(true);
                }
                dismissToastNotification();
              }}
              className="text-[11px] font-bold text-sky-400 underline"
            >
              فتح التفاصيل
            </button>
          </div>
          <button onClick={dismissToastNotification} className="text-slate-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Manager Passcode Modal */}
      <ManagerPinModal
        isOpen={showManagerPinModal}
        onClose={() => setShowManagerPinModal(false)}
        onSuccess={() => {
          selectRole('manager');
          setShowManagerPinModal(false);
        }}
      />

      {/* Interactive Map Location Picker */}
      <LocationPickerMapModal
        isOpen={isMapPickerOpen}
        onClose={() => setIsMapPickerOpen(false)}
        mode="customer"
        customerName={newOrderForm.customerName || 'العميل الجديد'}
        initialLat={newOrderForm.lat}
        initialLng={newOrderForm.lng}
        existingCustomers={customers}
        settings={settings}
        onSelectLocation={({ lat, lng, district }) => {
          setNewOrderForm((prev) => ({
            ...prev,
            lat,
            lng,
            district: district || prev.district,
          }));
          setHasPickedFromMap(true);
        }}
      />
      </div>
    </div>
  );
};

