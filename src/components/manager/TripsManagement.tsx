/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Comprehensive Manager Trips Management, Approval Workflow,
 * GPS Tracking Map Inspection, Stops Report, Plan-vs-Actual Review & Audit Timeline
 */

import React, { useMemo, useState } from 'react';
import {
  Truck,
  CheckCircle,
  Clock,
  ShieldCheck,
  MapPin,
  ChevronDown,
  ChevronUp,
  Wallet,
  XCircle,
  Navigation,
  AlertTriangle,
  History,
  FileCheck,
  RefreshCw,
  Edit3,
  PauseCircle,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Send,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Trip, TripCustomerStop, TripStatus, TripSyncStatus } from '../../types';
import { TripTrackingMap } from './TripTrackingMapModal';
import { buildPlanVsActualSummary } from '../../lib/gps-tracker';

export function getTripStatusArabic(status: TripStatus): string {
  switch (status) {
    case 'draft':
      return 'مسودة';
    case 'pending_approval':
      return 'بانتظار الاعتماد';
    case 'rejected':
      return 'مرفوضة';
    case 'approved':
      return 'معتمدة - جاهزة للبدء';
    case 'in_progress':
      return 'جارية الآن';
    case 'returned_to_plant':
      return 'عادت للمصنع';
    case 'pending_sync':
      return 'بانتظار المزامنة';
    case 'synced':
      return 'تمت المزامنة';
    case 'completed_pending_review':
      return 'مكتملة بانتظار المراجعة';
    case 'closed':
      return 'مغلقة';
    default:
      return status;
  }
}

export function getTripStatusBadgeClass(status: TripStatus): string {
  switch (status) {
    case 'draft':
      return 'bg-slate-100 text-slate-700';
    case 'pending_approval':
      return 'bg-amber-100 text-amber-800';
    case 'rejected':
      return 'bg-rose-100 text-rose-800';
    case 'approved':
      return 'bg-sky-100 text-sky-800';
    case 'in_progress':
      return 'bg-emerald-100 text-emerald-800';
    case 'returned_to_plant':
      return 'bg-teal-100 text-teal-800';
    case 'pending_sync':
      return 'bg-orange-100 text-orange-800';
    case 'synced':
      return 'bg-cyan-100 text-cyan-800';
    case 'completed_pending_review':
      return 'bg-indigo-100 text-indigo-800';
    case 'closed':
      return 'bg-slate-200 text-slate-800';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function getSyncStatusArabic(syncStatus: TripSyncStatus): { label: string; cls: string } {
  switch (syncStatus) {
    case 'local_only':
      return { label: 'محفوظة محلياً', cls: 'bg-slate-100 text-slate-700' };
    case 'pending_sync':
      return { label: 'بانتظار المزامنة', cls: 'bg-orange-100 text-orange-800' };
    case 'syncing':
      return { label: 'جاري المزامنة', cls: 'bg-sky-100 text-sky-800' };
    case 'synced':
      return { label: 'متزامنة ✓', cls: 'bg-emerald-100 text-emerald-800' };
    case 'sync_error':
      return { label: 'فشل مؤقت (سيعاد)', cls: 'bg-rose-100 text-rose-800' };
    default:
      return { label: syncStatus, cls: 'bg-slate-100 text-slate-700' };
  }
}

export const TripsManagement: React.FC = () => {
  const {
    trips,
    orders,
    customers,
    driverAccounts,
    truck,
    settings,
    selectedTrip: ctxSelectedTrip,
    createTripPlan,
    updateTripPlan,
    approveTrip,
    rejectTrip,
    returnTripForEdit,
    approveTripModification,
    rejectTripModification,
    closeTripAfterReview,
    setManagerTab,
  } = useApp();

  const [selectedTripId, setSelectedTripId] = useState<string | null>(ctxSelectedTrip?.id || trips[0]?.id || null);
  React.useEffect(() => {
    if (ctxSelectedTrip?.id) {
      setSelectedTripId(ctxSelectedTrip.id);
    }
  }, [ctxSelectedTrip?.id]);

  const [statusFilter, setStatusFilter] = useState<'all' | 'pending_approval' | 'in_progress' | 'completed_pending_review' | 'closed'>('all');
  const [reasonModal, setReasonModal] = useState<{
    type: 'reject' | 'return_edit' | 'close_review';
    tripId: string;
    tripNumber: string;
  } | null>(null);
  const [reasonInput, setReasonInput] = useState('');

  // Manager Trip Plan Builder Modal State (Exclusive to Manager)
  const [plannerMode, setPlannerMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const [editingTripId, setEditingTripId] = useState<string | null>(null);
  const [plannerStops, setPlannerStops] = useState<TripCustomerStop[]>([]);
  const [plannerDriverId, setPlannerDriverId] = useState<string>(truck.driverId);
  const [plannerNotes, setPlannerNotes] = useState('');
  const [plannerError, setPlannerError] = useState<string | null>(null);
  const [plannerSuccess, setPlannerSuccess] = useState<string | null>(null);
  const [isSavingPlan, setIsSavingPlan] = useState(false);

  const approvedDrivers = useMemo(
    () => driverAccounts.filter((d) => d.status === 'approved'),
    [driverAccounts]
  );

  const availableOrders = useMemo(() => {
    const usedOrderIds = new Set(plannerStops.map((s) => s.orderId));
    return orders.filter(
      (o) =>
        ['new', 'under_review', 'confirmed', 'waiting_clustering'].includes(o.status) &&
        !usedOrderIds.has(o.id)
    );
  }, [orders, plannerStops]);

  const availableCustomers = useMemo(() => {
    const usedCustIds = new Set(plannerStops.map((s) => s.customerId));
    return customers.filter((c) => c.isActive && !usedCustIds.has(c.id));
  }, [customers, plannerStops]);

  const plannedTotalLiters = plannerStops.reduce((sum, s) => sum + (Number(s.requestedLiters) || 0), 0);
  const overCapacity = plannedTotalLiters > truck.maxCapacityLiters;

  const openCreateManagerPlanner = () => {
    setEditingTripId(null);
    setPlannerStops([]);
    setPlannerDriverId(approvedDrivers[0]?.id || truck.driverId);
    setPlannerNotes('');
    setPlannerError(null);
    setPlannerMode('create');
  };

  const openEditManagerPlanner = (trip: Trip) => {
    setEditingTripId(trip.id);
    setPlannerStops(trip.customerStops.map((s) => ({ ...s })));
    setPlannerDriverId(trip.driverId || approvedDrivers[0]?.id || truck.driverId);
    setPlannerNotes(trip.notes || '');
    setPlannerError(null);
    setPlannerMode('edit');
  };

  const addOrderToPlanner = (orderId: string) => {
    const o = orders.find((ord) => ord.id === orderId);
    if (!o || plannerStops.some((s) => s.orderId === o.id)) return;
    const stop: TripCustomerStop = {
      stopSequence: plannerStops.length + 1,
      orderId: o.id,
      customerId: o.customerId,
      customerName: o.customerName,
      phone: o.phone,
      district: o.district,
      addressDetails: o.addressDetails,
      lat: o.lat,
      lng: o.lng,
      tankCapacity: o.tankCapacity,
      requestedLiters: o.requestedLiters,
      deliveredLiters: 0,
      pricePerLiter: o.pricePerLiter,
      totalAmount: o.totalAmount,
      paidAmount: 0,
      remainingAmount: o.totalAmount,
      status: 'pending',
    };
    setPlannerStops((prev) => [...prev, stop]);
  };

  const addCustomerToPlanner = (customerId: string) => {
    const c = customers.find((cust) => cust.id === customerId);
    if (!c) return;
    const reqLiters = c.tankCapacityLiters || 2000;
    const stop: TripCustomerStop = {
      stopSequence: plannerStops.length + 1,
      orderId: `ord-mgr-${c.id}-${Date.now()}`,
      customerId: c.id,
      customerName: c.name,
      phone: c.phone,
      district: c.district,
      addressDetails: c.addressDetails,
      lat: c.lat,
      lng: c.lng,
      tankCapacity: c.tankCapacityLiters,
      requestedLiters: reqLiters,
      deliveredLiters: 0,
      pricePerLiter: settings.defaultSellingPricePerLiter,
      totalAmount: reqLiters * settings.defaultSellingPricePerLiter,
      paidAmount: 0,
      remainingAmount: reqLiters * settings.defaultSellingPricePerLiter,
      status: 'pending',
    };
    setPlannerStops((prev) => [...prev, stop]);
  };

  const moveStopSequence = (index: number, dir: -1 | 1) => {
    const nextIdx = index + dir;
    if (nextIdx < 0 || nextIdx >= plannerStops.length) return;
    setPlannerStops((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[nextIdx];
      copy[nextIdx] = temp;
      return copy.map((s, idx) => ({ ...s, stopSequence: idx + 1 }));
    });
  };

  const removePlannerStop = (index: number) => {
    setPlannerStops((prev) =>
      prev.filter((_, i) => i !== index).map((s, idx) => ({ ...s, stopSequence: idx + 1 }))
    );
  };

  const handleSaveManagerPlan = async (approveImmediately: boolean) => {
    setPlannerError(null);
    if (plannerStops.length === 0) {
      setPlannerError('يجب اختيار طلب أو زبون واحد على الأقل لتكوين مخطط الرحلة.');
      return;
    }
    if (overCapacity) {
      setPlannerError(`إجمالي الكمية (${plannedTotalLiters.toLocaleString()}L) يتجاوز سعة الوايت (${truck.maxCapacityLiters.toLocaleString()}L).`);
      return;
    }

    const chosenDriver = approvedDrivers.find((d) => d.id === plannerDriverId);
    setIsSavingPlan(true);
    try {
      if (plannerMode === 'create') {
        const created = await createTripPlan({
          customerStops: plannerStops,
          approveImmediately,
          createdByRole: 'manager',
          driverId: chosenDriver?.id || plannerDriverId,
          driverName: chosenDriver?.name || truck.driverName,
          notes: plannerNotes,
        });
        setSelectedTripId(created.id);
        setPlannerMode('closed');
        setPlannerSuccess(
          approveImmediately
            ? `تم إنشاء واعتماد مخطط الرحلة ${created.tripNumber} وإرساله إلى تطبيق السائق (${created.driverName}) للموافقة والتنفيذ.`
            : `تم حفظ مسودة مخطط الرحلة ${created.tripNumber} بنجاح.`
        );
        setTimeout(() => setPlannerSuccess(null), 5000);
      } else if (plannerMode === 'edit' && editingTripId) {
        const updRes = await updateTripPlan(editingTripId, plannerStops, plannerNotes, plannerDriverId);
        if (!updRes.success) {
          setPlannerError(updRes.error || 'تعذر تحديث مخطط الرحلة');
          return;
        }
        if (approveImmediately) {
          await approveTrip(editingTripId, 'اعتماد وتوجيه للسائق بعد تحديث المخطط');
        }
        setPlannerMode('closed');
        setPlannerSuccess(
          approveImmediately
            ? 'تم تحديث المخطط واعتماده وإرساله إلى السائق بنجاح.'
            : 'تم حفظ تعديلات مسودة الرحلة بنجاح.'
        );
        setTimeout(() => setPlannerSuccess(null), 5000);
      }
    } catch (err) {
      setPlannerError(err instanceof Error ? err.message : 'تعذر حفظ مخطط الرحلة');
    } finally {
      setIsSavingPlan(false);
    }
  };

  const filteredTrips = useMemo(() => {
    if (statusFilter === 'all') return trips;
    return trips.filter((t) => t.status === statusFilter);
  }, [trips, statusFilter]);

  const selectedTrip: Trip | undefined = trips.find((t) => t.id === selectedTripId) || filteredTrips[0];
  const planVsActual = selectedTrip ? buildPlanVsActualSummary(selectedTrip) : null;

  const pendingApprovalsCount = trips.filter((t) => t.status === 'pending_approval').length;
  const pendingReviewCount = trips.filter((t) => t.status === 'completed_pending_review').length;

  const handleConfirmModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reasonModal) return;
    if (reasonModal.type === 'reject') {
      await rejectTrip(reasonModal.tripId, reasonInput || 'تم الرفض من قبل المدير');
    } else if (reasonModal.type === 'return_edit') {
      await returnTripForEdit(reasonModal.tripId, reasonInput || 'يرجى مراجعة الوجهات والترتيب');
    } else if (reasonModal.type === 'close_review') {
      await closeTripAfterReview(reasonModal.tripId, reasonInput || 'تمت مراجعة المسار والتوقفات وإغلاق الرحلة');
    }
    setReasonModal(null);
    setReasonInput('');
  };

  return (
    <div className="space-y-6">
      {/* Header & Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">إدارة ومراجعة الرحلات وتتبع GPS ({trips.length})</h2>
          <p className="text-xs text-slate-500">
            اعتماد مخططات الرحلات، مراقبة المسار الفعلي على الخريطة، تقرير التوقفات، والمقارنة الموضوعية بين المخطط والمنفذ
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {pendingApprovalsCount > 0 && (
            <button
              onClick={() => setStatusFilter('pending_approval')}
              className="px-3 py-1.5 bg-amber-100 text-amber-900 rounded-lg text-xs font-bold border border-amber-300"
            >
              {pendingApprovalsCount} رحلة بانتظار الاعتماد
            </button>
          )}
          {pendingReviewCount > 0 && (
            <button
              onClick={() => setStatusFilter('completed_pending_review')}
              className="px-3 py-1.5 bg-indigo-100 text-indigo-900 rounded-lg text-xs font-bold border border-indigo-300"
            >
              {pendingReviewCount} بانتظار المراجعة
            </button>
          )}
          <button
            onClick={openCreateManagerPlanner}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors shadow-sm flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>إنشاء مخطط رحلة جديد</span>
          </button>
          <button
            onClick={() => setManagerTab('clustering')}
            className="px-4 py-2 bg-sky-700 text-white rounded-lg text-xs font-semibold hover:bg-sky-800 transition-colors shadow-sm"
          >
            توليد مخطط رحلة ذكي
          </button>
        </div>
      </div>

      {plannerSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{plannerSuccess}</span>
          </div>
          <button onClick={() => setPlannerSuccess(null)} className="text-emerald-700 hover:text-emerald-950">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 text-xs">
        {[
          { id: 'all', label: `الكل (${trips.length})` },
          { id: 'pending_approval', label: `بانتظار الاعتماد (${pendingApprovalsCount})` },
          { id: 'in_progress', label: `جارية الآن (${trips.filter((t) => t.status === 'in_progress').length})` },
          { id: 'completed_pending_review', label: `بانتظار المراجعة (${pendingReviewCount})` },
          { id: 'closed', label: `مغلقة (${trips.filter((t) => t.status === 'closed').length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setStatusFilter(tab.id as typeof statusFilter)}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors border ${
              statusFilter === tab.id
                ? 'bg-sky-700 text-white border-sky-700'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Trips List Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-3">رقم الرحلة</th>
                <th className="py-3 px-3">السائق والوايت</th>
                <th className="py-3 px-3">التاريخ</th>
                <th className="py-3 px-3">الوجهات والكمية</th>
                <th className="py-3 px-3">الانطلاق / العودة</th>
                <th className="py-3 px-3">المدة والمسافة</th>
                <th className="py-3 px-3">حالة الرحلة</th>
                <th className="py-3 px-3">المزامنة</th>
                <th className="py-3 px-3 text-center">التحكم والمعاينة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTrips.map((trip) => {
                const isSelected = selectedTrip?.id === trip.id;
                const syncBadge = getSyncStatusArabic(trip.syncStatus || 'synced');
                const totalDurationMin = Math.round((trip.movingMinutes || 0) + (trip.stoppedMinutes || 0));
                const pendingMods = (trip.modificationRequests || []).filter((m) => m.status === 'pending').length;

                return (
                  <tr
                    key={trip.id}
                    onClick={() => setSelectedTripId(trip.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-sky-50/90' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-3 px-3 font-mono font-bold text-sky-900">
                      <div>{trip.tripNumber}</div>
                      {pendingMods > 0 && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-sans">
                          {pendingMods} طلب تعديل
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-900">{trip.driverName}</div>
                      <div className="text-[11px] text-slate-500">{trip.truckPlate}</div>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-600">{trip.date}</td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-800">{trip.customerStops.length} وجهات</div>
                      <div className="text-[11px] font-mono text-sky-700">
                        {trip.initialLoadLiters.toLocaleString()}L (مسلم {trip.deliveredLiters.toLocaleString()}L)
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-slate-600">
                      <div>
                        انطلاق:{' '}
                        {trip.startedAt
                          ? new Date(trip.startedAt).toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit' })
                          : '-'}
                      </div>
                      <div>
                        عودة:{' '}
                        {trip.returnedToPlantAt
                          ? new Date(trip.returnedToPlantAt).toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit' })
                          : '-'}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px]">
                      <div className="font-bold text-slate-800">{trip.actualDistanceKm ?? trip.estimatedDistanceKm} كم</div>
                      <div className="text-slate-500">{totalDurationMin > 0 ? `${totalDurationMin} دقيقة` : '-'}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-col items-start gap-1">
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${getTripStatusBadgeClass(trip.status)}`}>
                          {getTripStatusArabic(trip.status)}
                        </span>
                        {trip.createdByRole === 'manager' && trip.driverAcceptanceStatus === 'pending' && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
                            بانتظار رد السائق
                          </span>
                        )}
                        {trip.createdByRole === 'manager' && trip.driverAcceptanceStatus === 'accepted' && trip.status === 'approved' && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">
                            ✓ وافق السائق
                          </span>
                        )}
                        {trip.driverAcceptanceStatus === 'declined' && (
                          <span
                            title={trip.driverResponseReason || ''}
                            className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200 max-w-[180px] truncate"
                          >
                            رد السائق: {trip.driverResponseReason || 'غير موافق'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded whitespace-nowrap ${syncBadge.cls}`}>
                        {syncBadge.label}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setSelectedTripId(trip.id)}
                        className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded text-[11px] font-bold text-slate-800"
                      >
                        فتح التقرير والخريطة
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Trip Comprehensive Review Workspace */}
      {selectedTrip && planVsActual && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-6">
          {/* Inspector Header + Manager Decision Controls */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="font-bold text-base text-slate-900 font-mono">{selectedTrip.tripNumber}</h3>
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${getTripStatusBadgeClass(selectedTrip.status)}`}>
                  {getTripStatusArabic(selectedTrip.status)}
                </span>
                <span className="text-xs text-slate-500">
                  السائق: <strong className="text-slate-800">{selectedTrip.driverName}</strong> · {selectedTrip.truckPlate}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {selectedTrip.customerStops.map((s) => s.customerName).join(' ← ')}
              </p>
            </div>

            {/* Contextual Manager Decision Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {(selectedTrip.status === 'pending_approval' || selectedTrip.status === 'draft' || selectedTrip.status === 'rejected') && (
                <>
                  {(selectedTrip.status === 'draft' || selectedTrip.status === 'rejected') && (
                    <button
                      onClick={() => openEditManagerPlanner(selectedTrip)}
                      className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold flex items-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>تعديل المخطط</span>
                    </button>
                  )}
                  <button
                    onClick={() => approveTrip(selectedTrip.id)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>اعتماد الرحلة وتكليف السائق</span>
                  </button>
                  {selectedTrip.status !== 'rejected' && (
                    <button
                      onClick={() =>
                        setReasonModal({
                          type: 'reject',
                          tripId: selectedTrip.id,
                          tripNumber: selectedTrip.tripNumber,
                        })
                      }
                      className="px-3.5 py-2 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg text-xs font-bold flex items-center gap-1.5"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>إلغاء / رفض المخطط</span>
                    </button>
                  )}
                </>
              )}

              {(selectedTrip.status === 'completed_pending_review' || selectedTrip.status === 'synced') && (
                <>
                  <button
                    onClick={() =>
                      setReasonModal({
                        type: 'close_review',
                        tripId: selectedTrip.id,
                        tripNumber: selectedTrip.tripNumber,
                      })
                    }
                    className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm"
                  >
                    <FileCheck className="w-4 h-4" />
                    <span>اعتماد المراجعة وإغلاق الرحلة</span>
                  </button>
                  <button
                    onClick={() => setManagerTab('reconciliation')}
                    className="px-3.5 py-2 bg-blue-100 hover:bg-blue-200 text-blue-900 rounded-lg text-xs font-bold flex items-center gap-1.5"
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    <span>تسوية العهدة المالية</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Driver Response Status Banner for Manager-Proposed Trips */}
          {selectedTrip.createdByRole === 'manager' && selectedTrip.driverAcceptanceStatus === 'pending' && (
            <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold">
                <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                <span>تم إرسال طلب الرحلة إلى تطبيق السائق — بانتظار موافقة السائق أو رده بكتابة السبب</span>
              </div>
              <span className="text-[11px] font-mono text-amber-700 shrink-0">{selectedTrip.driverName}</span>
            </div>
          )}

          {selectedTrip.createdByRole === 'manager' && selectedTrip.driverAcceptanceStatus === 'accepted' && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>وافق السائق ({selectedTrip.driverName}) على استلام وتنفيذ طلب الرحلة المقترح من المدير</span>
              </div>
              {selectedTrip.driverRespondedAt && (
                <span className="text-[11px] font-mono text-emerald-700">
                  {new Date(selectedTrip.driverRespondedAt).toLocaleString('ar-YE')}
                </span>
              )}
            </div>
          )}

          {selectedTrip.driverAcceptanceStatus === 'declined' && (
            <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-xl text-xs text-rose-950 space-y-1.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 font-bold text-rose-800 text-sm">
                  <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>رد السائق ({selectedTrip.driverName}) بعدم الموافقة / الاعتذار عن الرحلة</span>
                </div>
                {selectedTrip.driverRespondedAt && (
                  <span className="text-[11px] font-mono text-rose-700">
                    {new Date(selectedTrip.driverRespondedAt).toLocaleString('ar-YE')}
                  </span>
                )}
              </div>
              <div className="bg-white border border-rose-200 rounded-lg p-2.5 text-slate-900 font-medium">
                <strong className="text-rose-800">السبب المكتوب من السائق: </strong>
                <span>{selectedTrip.driverResponseReason}</span>
              </div>
            </div>
          )}

          {/* Pending Modification Requests Panel */}
          {(selectedTrip.modificationRequests || []).filter((m) => m.status === 'pending').length > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-3 text-xs">
              <div className="font-bold text-amber-900 flex items-center gap-2 text-sm">
                <Edit3 className="w-4 h-4 text-amber-700" />
                <span>طلبات تعديل معلقة على هذه الرحلة المعتمدة</span>
              </div>
              {selectedTrip.modificationRequests!
                .filter((m) => m.status === 'pending')
                .map((req) => (
                  <div key={req.id} className="bg-white border border-amber-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-slate-900">
                        طلب من {req.requestedBy} ({new Date(req.requestedAt).toLocaleTimeString('ar-YE')})
                      </div>
                      <div className="text-slate-600 mt-0.5">السبب: {req.reason}</div>
                      <div className="text-[11px] font-mono text-sky-800 mt-1">
                        الوجهات المقترحة: {req.proposedStops.length} وجهات · {req.proposedTotalLiters.toLocaleString()} لتر
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => approveTripModification(selectedTrip.id, req.id)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold"
                      >
                        موافقة وتطبيق
                      </button>
                      <button
                        onClick={() => rejectTripModification(selectedTrip.id, req.id)}
                        className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg font-bold"
                      >
                        رفض التعديل
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* Plan-vs-Actual Neutral Operational Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-slate-500 block">الوجهات المسلمة / المخططة</span>
              <span className="font-mono font-bold text-sm text-sky-800">
                {planVsActual.deliveredStopsCount} / {planVsActual.plannedStopsCount}
              </span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-slate-500 block">زيارات GPS ضمن النطاق</span>
              <span className="font-mono font-bold text-sm text-emerald-700">
                {planVsActual.stopsWithLinkedGpsVisitCount} زبائن
              </span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-slate-500 block">توقفات خارج مواقع الزبائن</span>
              <span className={`font-mono font-bold text-sm ${planVsActual.unplannedStops.length > 0 ? 'text-amber-700' : 'text-slate-800'}`}>
                {planVsActual.unplannedStops.length} توقفات
              </span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-slate-500 block">المسافة الفعلية / المقدرة</span>
              <span className="font-mono font-bold text-sm text-slate-900">
                {planVsActual.actualDistanceKm} / {planVsActual.plannedDistanceKm} كم
              </span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-slate-500 block">الحركة / التوقف الفعلي</span>
              <span className="font-mono font-bold text-sm text-slate-900">
                {planVsActual.totalMovingMinutes}د / {planVsActual.totalStoppedMinutes}د
              </span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-slate-500 block">نقاط GPS / فجوات الإشارة</span>
              <span className="font-mono font-bold text-sm text-slate-900">
                {planVsActual.gpsPointsCount} نقطة ({planVsActual.gpsGapsCount} فجوة)
              </span>
            </div>
          </div>

          {planVsActual.unvisitedPlannedStops.length > 0 && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700">
              <strong>وجهات لم يُسجل تسليمها بعد ({planVsActual.unvisitedPlannedStops.length}):</strong>{' '}
              {planVsActual.unvisitedPlannedStops.map((s) => `${s.customerName} (${s.district})`).join('، ')}
            </div>
          )}

          {/* Interactive Trip Tracking Map */}
          <div className="space-y-2">
            <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Navigation className="w-4 h-4 text-sky-700" />
              <span>خريطة التتبع الفعلي والتوقفات للرحلة</span>
            </h4>
            <TripTrackingMap trip={selectedTrip} settings={settings} height="390px" />
          </div>

          {/* Detected Prolonged Stops Report Table */}
          <div className="space-y-2">
            <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <PauseCircle className="w-4 h-4 text-amber-600" />
              <span>تقرير التوقفات الطويلة المرصودة تلقائياً ({selectedTrip.detectedStops?.length || 0})</span>
            </h4>
            <p className="text-[11px] text-slate-500">
              تُرصد التوقفات عند انخفاض السرعة تحت {settings.minMovementSpeedKmH} كم/س لمدة تتجاوز {settings.stopDetectionMinutes} دقائق (التوقف وحده لا يُعد دليلاً على تسليم الطلب).
            </p>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">بداية التوقف</th>
                    <th className="py-2.5 px-3">نهاية التوقف</th>
                    <th className="py-2.5 px-3">المدة</th>
                    <th className="py-2.5 px-3">الإحداثيات</th>
                    <th className="py-2.5 px-3">الربط بالزبون المعتمد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {!selectedTrip.detectedStops || selectedTrip.detectedStops.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-5 text-center text-slate-400">
                        لم يتم تسجيل توقفات طويلة تتجاوز حد {settings.stopDetectionMinutes} دقائق في هذه الرحلة.
                      </td>
                    </tr>
                  ) : (
                    selectedTrip.detectedStops.map((st, idx) => (
                      <tr key={st.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono font-bold">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-mono">{new Date(st.startTime).toLocaleTimeString('ar-YE')}</td>
                        <td className="py-2.5 px-3 font-mono">
                          {st.endTime ? new Date(st.endTime).toLocaleTimeString('ar-YE') : 'مستمر'}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{st.durationMinutes} دقيقة</td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                          {st.lat.toFixed(5)}, {st.lng.toFixed(5)}
                        </td>
                        <td className="py-2.5 px-3">
                          {st.nearCustomerName ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                              قرب {st.nearCustomerName} ({st.distanceToCustomerMeters}م)
                            </span>
                          ) : st.isUnplannedStop ? (
                            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                              توقف بعيد عن الزبائن المعتمدين
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-800 font-semibold">
                              داخل نطاق المصنع
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* GPS Signal Gaps Alert Table (if any) */}
          {selectedTrip.gpsGaps && selectedTrip.gpsGaps.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-bold text-sm text-rose-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>سجل انقطاع أو فجوات إشارة GPS ({selectedTrip.gpsGaps.length})</span>
              </h4>
              <div className="border border-rose-200 rounded-xl overflow-hidden bg-rose-50/30">
                <table className="w-full text-right text-xs">
                  <thead className="bg-rose-50 text-rose-900 font-semibold border-b border-rose-200">
                    <tr>
                      <th className="py-2 px-3">بداية الفجوة</th>
                      <th className="py-2 px-3">استئناف الإشارة</th>
                      <th className="py-2 px-3">المدة</th>
                      <th className="py-2 px-3">التصنيف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-100">
                    {selectedTrip.gpsGaps.map((g) => (
                      <tr key={g.id}>
                        <td className="py-2 px-3 font-mono">{new Date(g.startTime).toLocaleTimeString('ar-YE')}</td>
                        <td className="py-2 px-3 font-mono">{new Date(g.endTime).toLocaleTimeString('ar-YE')}</td>
                        <td className="py-2 px-3 font-mono font-bold text-rose-800">{Math.round(g.durationSeconds / 60)} دقيقة</td>
                        <td className="py-2 px-3">{g.reason === 'weak_signal' ? 'ضعف إشارة GPS' : 'توقف مؤقت للتسجيل'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Customer Stops & Deliveries Table */}
          <div className="space-y-2">
            <h4 className="font-bold text-sm text-slate-900">الوجهات والطلبات المعتمدة في الرحلة</h4>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">الزبون والحي</th>
                    <th className="py-2.5 px-3">الهاتف</th>
                    <th className="py-2.5 px-3">المطلوب</th>
                    <th className="py-2.5 px-3">المسلم فعلياً</th>
                    <th className="py-2.5 px-3">المبلغ المحصل</th>
                    <th className="py-2.5 px-3">حالة التسليم</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedTrip.customerStops.map((stop) => (
                    <tr key={stop.orderId}>
                      <td className="py-2.5 px-3 font-mono font-bold text-sky-700">{stop.stopSequence}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{stop.customerName}</div>
                        <div className="text-[11px] text-slate-500">{stop.district}</div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">{stop.phone}</td>
                      <td className="py-2.5 px-3 font-mono">{stop.requestedLiters.toLocaleString()}L</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-sky-800">
                        {stop.deliveredLiters > 0 ? `${stop.deliveredLiters.toLocaleString()}L` : '-'}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">
                        {stop.paidAmount > 0 ? `${stop.paidAmount.toLocaleString()} ر.ي` : '0 ر.ي'}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                            stop.status === 'delivered'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {stop.status === 'delivered' ? 'تم التسليم والفوترة' : 'لم يُسجل تسليم'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Immutable Audit Trail Timeline */}
          <div className="space-y-2">
            <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <History className="w-4 h-4 text-slate-600" />
              <span>سجل الاعتمادات والتعديلات والتدقيق ({selectedTrip.auditLogs?.length || 0})</span>
            </h4>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 text-xs">
              {(selectedTrip.auditLogs || []).map((log) => (
                <div key={log.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2 border-b border-slate-200/70 last:border-0 last:pb-0">
                  <div>
                    <span className="font-bold text-slate-900">{log.action}</span>
                    <span className="text-slate-500 mx-1.5">·</span>
                    <span className="text-sky-800 font-semibold">{log.actorName}</span>
                    {log.details && <div className="text-[11px] text-slate-600 mt-0.5">{log.details}</div>}
                  </div>
                  <span className="font-mono text-[11px] text-slate-400 shrink-0">
                    {new Date(log.timestamp).toLocaleString('ar-YE')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Decision Reason Modal */}
      {reasonModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 text-xs space-y-4">
            <h4 className="font-bold text-sm text-slate-900">
              {reasonModal.type === 'reject' && `رفض مخطط ${reasonModal.tripNumber}`}
              {reasonModal.type === 'return_edit' && `إعادة ${reasonModal.tripNumber} للسائق للتعديل`}
              {reasonModal.type === 'close_review' && `اعتماد المراجعة وإغلاق ${reasonModal.tripNumber}`}
            </h4>
            <form onSubmit={handleConfirmModal} className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {reasonModal.type === 'close_review' ? 'ملاحظات المراجعة النهائية:' : 'السبب أو التوجيه للسائق:'}
                </label>
                <textarea
                  rows={3}
                  required={reasonModal.type !== 'close_review'}
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  placeholder="اكتب السبب أو الملاحظات ليتم توثيقها في سجل الرحلة..."
                  className="w-full p-2.5 border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setReasonModal(null);
                    setReasonInput('');
                  }}
                  className="px-4 py-2 border border-slate-200 rounded-lg font-semibold text-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-sky-700 hover:bg-sky-800 text-white rounded-lg font-bold"
                >
                  تأكيد وحفظ في السجل
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Manager Trip Plan Builder Modal (Exclusive Manager Responsibility) */}
      {plannerMode !== 'closed' && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 text-xs">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-2xl">
              <div>
                <h4 className="font-bold text-sm text-slate-900">
                  {plannerMode === 'create'
                    ? 'إعداد ورفع مخطط رحلة جديد (مهام المدير)'
                    : 'تعديل مخطط الرحلة قبل الاعتماد'}
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  اختر الطلبات المرفوعة أو الزبائن، رتب خط السير، حدد السائق المكلف ثم اعتمد الإرسال.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPlannerMode('closed')}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* Driver Selection & Truck Capacity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">السائق المكلف بالرحلة</label>
                  <select
                    value={plannerDriverId}
                    onChange={(e) => setPlannerDriverId(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                  >
                    {approvedDrivers.length === 0 ? (
                      <option value={truck.driverId}>{truck.driverName}</option>
                    ) : (
                      approvedDrivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.phone})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className={`p-2.5 rounded-xl border font-mono ${overCapacity ? 'bg-rose-50 border-rose-300 text-rose-800' : 'bg-slate-50 border-slate-200 text-slate-800'}`}>
                  <div className="flex justify-between mb-1">
                    <span className="font-sans font-bold">الحمولة المختارة:</span>
                    <span className="font-bold">
                      {plannedTotalLiters.toLocaleString()} / {truck.maxCapacityLiters.toLocaleString()} L
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-2 transition-all ${overCapacity ? 'bg-rose-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(100, (plannedTotalLiters / truck.maxCapacityLiters) * 100)}%` }}
                    />
                  </div>
                  {overCapacity && (
                    <div className="text-[11px] text-rose-700 mt-1 font-sans font-bold">
                      تجاوزت السعة القصوى للوايت!
                    </div>
                  )}
                </div>
              </div>

              {/* Pick from Orders (including Driver-submitted orders) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    1. إضافة من الطلبات المسجلة والمرفوعة ({availableOrders.length}):
                  </label>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        addOrderToPlanner(e.target.value);
                        e.target.value = '';
                      }
                    }}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                  >
                    <option value="">-- اختر طلباً لإضافته --</option>
                    {availableOrders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.customerName} ({o.district}) — {o.requestedLiters.toLocaleString()}L
                        {o.source === 'driver_manual' ? ' [مرفوع من السائق]' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    2. أو إضافة من الزبائن المسجلين ({availableCustomers.length}):
                  </label>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        addCustomerToPlanner(e.target.value);
                        e.target.value = '';
                      }
                    }}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                  >
                    <option value="">-- اختر زبوناً لإضافته لوجهة --</option>
                    {availableCustomers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.district}) — {c.tankCapacityLiters.toLocaleString()}L
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Ordered Stops List */}
              <div className="space-y-2">
                <div className="font-bold text-slate-800">
                  ترتيب الوجهات والطلبات في المخطط ({plannerStops.length}):
                </div>
                {plannerStops.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                    اختر طلباً أو زبوناً من القوائم أعلاه لإدراجه في مخطط الرحلة.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {plannerStops.map((stop, idx) => (
                      <div
                        key={stop.orderId}
                        className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-900 truncate">
                            #{stop.stopSequence} {stop.customerName} ({stop.district})
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {stop.requestedLiters.toLocaleString()} لتر · {stop.totalAmount.toLocaleString()} ر.ي · GPS: {stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveStopSequence(idx, -1)}
                            className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded disabled:opacity-30"
                            title="تحريك للأعلى"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === plannerStops.length - 1}
                            onClick={() => moveStopSequence(idx, 1)}
                            className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded disabled:opacity-30"
                            title="تحريك للأسفل"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removePlannerStop(idx)}
                            className="p-1.5 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 rounded"
                            title="حذف"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">ملاحظات وتوجيهات للرحلة</label>
                <input
                  type="text"
                  value={plannerNotes}
                  onChange={(e) => setPlannerNotes(e.target.value)}
                  placeholder="مثال: أولوية التوصيل في الفترة الصباحية..."
                  className="w-full p-2 border border-slate-300 rounded-lg"
                />
              </div>

              {plannerError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-semibold">
                  {plannerError}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={() => setPlannerMode('closed')}
                className="px-4 py-2 border border-slate-300 bg-white rounded-lg font-bold text-slate-700"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isSavingPlan || plannerStops.length === 0 || overCapacity}
                onClick={() => handleSaveManagerPlan(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold disabled:opacity-50"
              >
                حفظ كمسودة
              </button>
              <button
                type="button"
                disabled={isSavingPlan || plannerStops.length === 0 || overCapacity}
                onClick={() => handleSaveManagerPlan(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center gap-1.5 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSavingPlan ? 'جاري الإرسال...' : 'اعتماد وإرسال طلب الرحلة للسائق'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
