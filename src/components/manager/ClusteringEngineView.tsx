/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Intelligent Order Clustering & Logistics Optimizer View
 * The core brain: groups orders by geographic affinity in Marib, enforces 6,000L truck limit,
 * calculates TSP route, evaluates fuel & economic profit, and suggests dispatch decision.
 */

import React, { useState } from 'react';
import {
  GitMerge,
  Truck,
  CheckCircle,
  Clock,
  Fuel,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  MapPin,
  Sparkles,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ClusterProposal, Order } from '../../types';
import { MaribMap } from '../common/MaribMap';

export const ClusteringEngineView: React.FC = () => {
  const {
    clusterProposals,
    orders,
    settings,
    createTripFromCluster,
    setManagerTab,
    truck,
  } = useApp();

  const [selectedProposalIndex, setSelectedProposalIndex] = useState(0);
  const [isCreatingTrip, setIsCreatingTrip] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const pendingCount = orders.filter(
    (o) => o.status === 'new' || o.status === 'waiting_clustering' || o.status === 'confirmed'
  ).length;

  const currentProposal: ClusterProposal | undefined = clusterProposals[selectedProposalIndex];

  const handleApproveAndCreateTrip = async (proposal: ClusterProposal) => {
    setIsCreatingTrip(true);
    try {
      const newTrip = await createTripFromCluster(proposal);
      setSuccessMessage(`تم بنجاح اعتماد وتوليد الرحلة المعتمدة ${newTrip.tripNumber} بحمولة ${newTrip.initialLoadLiters.toLocaleString()} لتر`);
      setTimeout(() => {
        setManagerTab('trips');
      }, 1500);
    } catch (e) {
      console.error(e);
    } finally {
      setIsCreatingTrip(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">خوارزمية تجميع الطلبات والجدوى اللوجستية الذكية</h2>
            <span className="text-xs bg-sky-100 text-sky-800 font-semibold px-2 py-0.5 rounded-full">
              سعة الوايت: 6,000 لتر
            </span>
          </div>
          <p className="text-xs text-slate-500">
            تجميع العملاء المتقاربين في مأرب، مراعاة شبكة الطرق الفعلية، وحساب الربحية قبل اعتماد خروج الوايت
          </p>
        </div>
        <div className="text-xs bg-slate-100 px-3 py-1.5 rounded-lg text-slate-700 font-mono">
          الطلبات المؤهلة للتجميع: <span className="font-bold text-sky-700">{pendingCount}</span> طلب
        </div>
      </div>

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}

      {clusterProposals.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
          <div className="w-12 h-12 bg-sky-50 text-sky-600 rounded-xl flex items-center justify-center mx-auto mb-3">
            <GitMerge className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-slate-900 text-sm">لا توجد طلبات معلقة كافية لتكوين مقترح رحلة</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
            جميع الطلبات إما موزعة مسبقاً أو معتمدة ضمن رحلات جارية. يمكنك تسجيل طلبات جديدة من لوحة التحكم أو انتظار طلبات السائق.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: List of Generated Proposals */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>المقترحات المحسوبة ({clusterProposals.length})</span>
              <span className="text-slate-400 font-normal">مرتبة حسب الجدوى والأولوية</span>
            </div>

            {clusterProposals.map((prop, idx) => {
              const isSelected = selectedProposalIndex === idx;
              const recColor =
                prop.recommendation === 'GO_NOW'
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  : prop.recommendation === 'URGENT_OVERRIDE'
                  ? 'bg-rose-100 text-rose-800 border-rose-200'
                  : prop.recommendation === 'FEASIBLE_PARTIAL'
                  ? 'bg-blue-100 text-blue-800 border-blue-200'
                  : 'bg-amber-100 text-amber-800 border-amber-200';

              return (
                <div
                  key={prop.id}
                  onClick={() => setSelectedProposalIndex(idx)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white border-sky-600 shadow-md ring-1 ring-sky-600'
                      : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                      <span>مقترح رحلة #{idx + 1}</span>
                      <span className="text-[11px] text-slate-500 font-normal">({prop.customerStops.length} عملاء)</span>
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${recColor}`}>
                      {getRecommendationArabic(prop.recommendation)}
                    </span>
                  </div>

                  {/* Neighborhoods */}
                  <div className="text-[11px] text-slate-600 mb-2">
                    الأحياء: <span className="font-semibold text-slate-800">{prop.districtsCovered.join(' · ')}</span>
                  </div>

                  {/* Progress bar of 6,000L */}
                  <div className="space-y-1 mb-3">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">الحمولة: {prop.totalLiters.toLocaleString()} لتر</span>
                      <span className="font-mono font-bold text-sky-700">{prop.capacityUtilization}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                      <div
                        className="bg-sky-600 h-2 rounded-full"
                        style={{ width: `${Math.min(100, prop.capacityUtilization)}%` }}
                      />
                    </div>
                  </div>

                  {/* Financials Strip */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px]">
                    <div>
                      <span className="text-slate-400">الإيراد: </span>
                      <span className="font-mono font-semibold text-slate-700">{prop.expectedRevenue.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">الربح الصافي: </span>
                      <span className="font-mono font-bold text-emerald-700">+{prop.expectedProfit.toLocaleString()} ر.ي</span>
                    </div>
                    <div>
                      <span className="font-mono text-slate-500">{prop.profitMarginPercent}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right 2 Columns: Detailed Selected Proposal Breakdown & Map */}
          {currentProposal && (
            <div className="lg:col-span-2 space-y-4">
              {/* Proposal Header Banner */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900 text-sm">
                        تفاصيل دراسة الجدوى التشغيلية والاقتصادية
                      </h3>
                      <span className="text-xs bg-sky-50 text-sky-700 px-2 py-0.5 rounded font-mono">
                        {currentProposal.totalLiters.toLocaleString()} / 6,000L
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">{currentProposal.reason}</p>
                  </div>

                  {/* Manager Approval Action */}
                  <button
                    onClick={() => handleApproveAndCreateTrip(currentProposal)}
                    disabled={isCreatingTrip}
                    className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors shadow-sm flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>{isCreatingTrip ? 'جاري الاعتماد...' : 'اعتماد الرحلة وتكليف السائق'}</span>
                  </button>
                </div>

                {/* Economic Matrix Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span className="text-slate-500 block text-[11px]">مسافة المسار المقدرة</span>
                    <span className="font-bold font-mono text-slate-900 text-sm">
                      {currentProposal.estimatedDistanceKm} كم
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">شاملاً الذهاب والعودة</span>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span className="text-slate-500 block text-[11px]">استهلاك الديزل التقديري</span>
                    <span className="font-bold font-mono text-amber-700 text-sm">
                      {currentProposal.estimatedFuelLiters} لتر
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      ({currentProposal.fuelCost.toLocaleString()} ر.ي)
                    </span>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span className="text-slate-500 block text-[11px]">تكلفة إنتاج المياه</span>
                    <span className="font-bold font-mono text-slate-800 text-sm">
                      {currentProposal.productionCost.toLocaleString()} ر.ي
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      ({settings.waterProductionCostPerLiter} ر.ي/لتر)
                    </span>
                  </div>

                  <div className="bg-emerald-50/70 p-2.5 rounded-lg border border-emerald-100">
                    <span className="text-emerald-800 block text-[11px] font-semibold">صافي الربح المتوقع</span>
                    <span className="font-bold font-mono text-emerald-700 text-sm">
                      +{currentProposal.expectedProfit.toLocaleString()} ر.ي
                    </span>
                    <span className="text-[10px] text-emerald-600 block mt-0.5">
                      هامش الربح: {currentProposal.profitMarginPercent}%
                    </span>
                  </div>
                </div>

                {/* Additional Logistics Cost Breakdown */}
                <div className="text-[11px] text-slate-600 bg-sky-50/50 p-3 rounded-lg border border-sky-100 flex flex-wrap gap-y-1 gap-x-6">
                  <div>
                    حصة أجر السائق للرحلة: <span className="font-mono font-bold">{currentProposal.driverWageShare.toLocaleString()} ر.ي</span>
                  </div>
                  <div>
                    مخصص صيانة الوايت: <span className="font-mono font-bold">{currentProposal.maintenanceShare.toLocaleString()} ر.ي</span>
                  </div>
                  <div>
                    إجمالي تكلفة الرحلة: <span className="font-mono font-bold text-rose-700">{currentProposal.totalCost.toLocaleString()} ر.ي</span>
                  </div>
                  <div>
                    متوسط تكلفة توصيل المنزل: <span className="font-mono font-bold text-sky-800">
                      {Math.round(currentProposal.totalCost / currentProposal.customerStops.length).toLocaleString()} ر.ي/منزل
                    </span>
                  </div>
                </div>
              </div>

              {/* Map & Sequence View */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <h4 className="font-bold text-slate-900 text-xs mb-2">
                  مسار الوايت الأمثل وتوزيع محطات العملاء ({currentProposal.customerStops.length} محطات)
                </h4>
                <div className="h-[280px]">
                  <MaribMap
                    settings={settings}
                    customerStops={currentProposal.customerStops}
                    height="280px"
                  />
                </div>

                {/* Ordered Customer List */}
                <div className="mt-3 divide-y divide-slate-100 text-xs">
                  {currentProposal.customerStops.map((stop, i) => (
                    <div key={stop.orderId} className="py-2 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-sky-600 text-white font-bold flex items-center justify-center text-[10px]">
                          {stop.stopSequence}
                        </span>
                        <div>
                          <span className="font-semibold text-slate-900">{stop.customerName}</span>
                          <span className="text-slate-500 text-[11px] mr-2">({stop.district})</span>
                        </div>
                      </div>
                      <div className="text-left font-mono">
                        <span className="font-bold text-sky-800">{stop.requestedLiters.toLocaleString()} لتر</span>
                        <span className="text-slate-400 mr-2 text-[11px]">({stop.totalAmount.toLocaleString()} ر.ي)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function getRecommendationArabic(rec: string): string {
  switch (rec) {
    case 'GO_NOW': return 'الخروج الآن';
    case 'WAIT_MORE': return 'الانتظار لطلبات إضافية';
    case 'FEASIBLE_PARTIAL': return 'رحلة جزئية مجدية';
    case 'URGENT_OVERRIDE': return 'استثناء لطلب عاجل';
    default: return rec;
  }
}
