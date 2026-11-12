/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Trips & Load Cycles Management (إدارة الرحلات ودورات الحمولة)
 */

import React, { useState } from 'react';
import {
  Truck,
  CheckCircle,
  Clock,
  Play,
  RotateCcw,
  ShieldCheck,
  MapPin,
  ChevronDown,
  ChevronUp,
  Receipt,
  Wallet,
  Fuel,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Trip, TripStatus } from '../../types';

export const TripsManagement: React.FC = () => {
  const { trips, approveTrip, startTrip, completeTrip, setManagerTab } = useApp();

  const [expandedTripId, setExpandedTripId] = useState<string | null>(trips[0]?.id || null);

  const toggleExpand = (id: string) => {
    setExpandedTripId(expandedTripId === id ? null : id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">إدارة رحلات وتعبئة صهريج مياه مأرب ({trips.length})</h2>
          <p className="text-xs text-slate-500">
            متابعة دورات الحمولة اليومية، اعتماد خروج الوايت، وتسجيل عمليات التفريغ والعودة للمصنع
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setManagerTab('clustering')}
            className="px-4 py-2 bg-sky-700 text-white rounded-lg text-xs font-semibold hover:bg-sky-800 transition-colors shadow-sm"
          >
            توليد مقترح رحلة جديد
          </button>
        </div>
      </div>

      {/* Trips List */}
      <div className="space-y-4">
        {trips.map((trip) => {
          const isExpanded = expandedTripId === trip.id;
          const isProposed = trip.status === 'proposed';
          const isApproved = trip.status === 'approved';
          const isInProgress = trip.status === 'in_progress';
          const isCompleted = trip.status === 'completed';
          const isReconciled = trip.status === 'reconciled';

          const completedStops = trip.customerStops.filter((s) => s.status === 'delivered').length;
          const totalStops = trip.customerStops.length;
          const progressPercent = totalStops > 0 ? Math.round((completedStops / totalStops) * 100) : 0;

          return (
            <div
              key={trip.id}
              className={`bg-white border rounded-xl overflow-hidden shadow-sm transition-all ${
                isInProgress ? 'border-sky-500 ring-1 ring-sky-500' : 'border-slate-200'
              }`}
            >
              {/* Trip Header Summary */}
              <div className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/50"
                   onClick={() => toggleExpand(trip.id)}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isInProgress
                      ? 'bg-sky-600 text-white shadow-md'
                      : isCompleted || isReconciled
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    <Truck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-slate-900">{trip.tripNumber}</span>
                      <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${getStatusBadge(trip.status)}`}>
                        {getTripStatusArabic(trip.status)}
                      </span>
                      <span className="text-xs text-slate-500 font-mono">({trip.date})</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
                      <span>السائق: <strong className="text-slate-700">{trip.driverName}</strong></span>
                      <span>الحمولة الأولية: <strong className="text-sky-700 font-mono">{trip.initialLoadLiters.toLocaleString()}L</strong></span>
                      <span>الماء المسلم: <strong className="text-emerald-700 font-mono">{trip.deliveredLiters.toLocaleString()}L</strong></span>
                      <span>المتبقي: <strong className="text-amber-700 font-mono">{trip.remainingLiters.toLocaleString()}L</strong></span>
                    </div>
                  </div>
                </div>

                {/* Progress & Actions */}
                <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end" onClick={(e) => e.stopPropagation()}>
                  <div className="text-left font-mono text-xs">
                    <div className="font-bold text-emerald-700">+{trip.actualProfit || trip.expectedProfit} ر.ي</div>
                    <div className="text-slate-400 text-[10px]">المسافة: {trip.actualDistanceKm || trip.estimatedDistanceKm} كم</div>
                  </div>

                  {/* Contextual Action Buttons */}
                  <div className="flex items-center gap-2">
                    {isProposed && (
                      <button
                        onClick={() => approveTrip(trip.id)}
                        className="px-3.5 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors flex items-center gap-1.5 shadow-sm"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>اعتماد المدير</span>
                      </button>
                    )}

                    {isApproved && (
                      <button
                        onClick={() => startTrip(trip.id)}
                        className="px-3.5 py-1.5 bg-sky-700 text-white rounded-lg text-xs font-bold hover:bg-sky-800 transition-colors flex items-center gap-1.5 shadow-sm"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>بدء خروج الوايت</span>
                      </button>
                    )}

                    {isInProgress && (
                      <button
                        onClick={() => completeTrip(trip.id)}
                        className="px-3.5 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 transition-colors flex items-center gap-1.5 shadow-sm"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>إغلاق الرحلة والعودة</span>
                      </button>
                    )}

                    {isCompleted && (
                      <button
                        onClick={() => setManagerTab('reconciliation')}
                        className="px-3.5 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors flex items-center gap-1.5 shadow-sm"
                      >
                        <Wallet className="w-3.5 h-3.5" />
                        <span>تسوية العهدة</span>
                      </button>
                    )}

                    <button
                      onClick={() => toggleExpand(trip.id)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 rounded"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Progress Bar for Delivery Stops */}
              <div className="w-full bg-slate-100 h-1.5 overflow-hidden">
                <div
                  className="bg-emerald-500 h-1.5 transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Expanded Details: Customer Stops & Ledger */}
              {isExpanded && (
                <div className="p-4 bg-slate-50 border-t border-slate-100 space-y-4">
                  <div className="flex items-center justify-between text-xs">
                    <h4 className="font-bold text-slate-800">
                      محطات توزيع مياه الرحلة ({completedStops}/{totalStops} مكتمل)
                    </h4>
                    <span className="text-slate-500 text-[11px] font-mono">
                      نسبة استغلال الصهريج: {trip.capacityUtilizationPercent}%
                    </span>
                  </div>

                  {/* Customer Stops Table */}
                  <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-100/75 text-slate-600 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">#</th>
                          <th className="py-2.5 px-3">العميل والحي</th>
                          <th className="py-2.5 px-3">الهاتف</th>
                          <th className="py-2.5 px-3">المطلوب</th>
                          <th className="py-2.5 px-3">المسلم فعلياً</th>
                          <th className="py-2.5 px-3">المبلغ المحصل</th>
                          <th className="py-2.5 px-3">الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {trip.customerStops.map((stop) => {
                          const isStopDelivered = stop.status === 'delivered';
                          const isStopArrived = stop.status === 'arrived';

                          return (
                            <tr key={stop.orderId} className="hover:bg-slate-50/50">
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
                                <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                                  isStopDelivered
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : isStopArrived
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {isStopDelivered ? 'تم التسليم' : isStopArrived ? 'الوايت عند العميل' : 'في الانتظار'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Financial & Logistics Summary Footer */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-white p-3 rounded-lg border border-slate-200">
                    <div>
                      <span className="text-slate-500 block">إجمالي الإيرادات:</span>
                      <span className="font-mono font-bold text-slate-900 text-sm">
                        {(trip.actualRevenue || trip.expectedRevenue).toLocaleString()} ر.ي
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">تكلفة إنتاج المياه:</span>
                      <span className="font-mono font-bold text-slate-700">
                        {trip.productionCost.toLocaleString()} ر.ي
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">تكلفة الديزل والتشغيل:</span>
                      <span className="font-mono font-bold text-amber-700">
                        {(trip.fuelCost + trip.driverWageShare + trip.maintenanceShare).toLocaleString()} ر.ي
                      </span>
                    </div>
                    <div>
                      <span className="text-emerald-700 block font-semibold">صافي الربح:</span>
                      <span className="font-mono font-bold text-emerald-800 text-sm">
                        +{(trip.actualProfit || trip.expectedProfit).toLocaleString()} ر.ي
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

function getTripStatusArabic(status: TripStatus): string {
  switch (status) {
    case 'proposed': return 'مقترحة للاعتماد';
    case 'approved': return 'معتمدة - جاهزة للتحميل';
    case 'loading': return 'جاري تعبئة المياه';
    case 'in_progress': return 'قيد التوزيع الميداني';
    case 'returning': return 'عائد للمصنع';
    case 'completed': return 'مكتملة التوزيع';
    case 'reconciled': return 'تمت تسوية العهدة';
    case 'cancelled': return 'ملغاة';
    default: return status;
  }
}

function getStatusBadge(status: TripStatus): string {
  switch (status) {
    case 'in_progress': return 'bg-sky-100 text-sky-800';
    case 'approved': return 'bg-blue-100 text-blue-800';
    case 'completed': return 'bg-emerald-100 text-emerald-800';
    case 'reconciled': return 'bg-slate-100 text-slate-800';
    case 'proposed': return 'bg-amber-100 text-amber-800';
    default: return 'bg-slate-100 text-slate-700';
  }
}
