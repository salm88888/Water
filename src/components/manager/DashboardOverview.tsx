/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Dashboard Overview (لوحة المؤشرات والتشغيل اليومي)
 */

import React, { useState } from 'react';
import {
  Droplets,
  TrendingUp,
  Truck,
  CheckCircle,
  Clock,
  Fuel,
  ArrowUpRight,
  ArrowRight,
  MapPin,
  GitMerge,
  Smartphone,
  AlertCircle,
  Receipt,
  Radio,
  Trash2,
  Sparkles,
  BookOpen,
  AlertTriangle,
  X,
  PlayCircle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { MaribMap } from '../common/MaribMap';

export const DashboardOverview: React.FC = () => {
  const {
    orders,
    trips,
    invoices,
    expenses,
    truck,
    settings,
    clusterProposals,
    setManagerTab,
    setViewMode,
    clearDemoData,
  } = useApp();

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Metrics
  const newOrders = orders.filter((o) => o.status === 'new').length;
  const waitingOrders = orders.filter((o) => o.status === 'waiting_clustering').length;
  const clusteredOrders = orders.filter((o) => o.status === 'clustered').length;
  const approvedOrders = orders.filter((o) => o.status === 'approved').length;
  const inDeliveryOrders = orders.filter((o) => o.status === 'in_delivery').length;
  const deliveredOrders = orders.filter((o) => o.status === 'delivered').length;
  const cancelledOrders = orders.filter((o) => o.status === 'cancelled').length;

  const totalRequestedLiters = orders.reduce((sum, o) => sum + o.requestedLiters, 0);
  const totalDeliveredLiters = trips.reduce((sum, t) => sum + t.deliveredLiters, 0);

  // Financials
  const totalSalesRevenue = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const totalCashCollected = invoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
  const totalReceivables = invoices.reduce((sum, inv) => sum + inv.remainingAmount, 0);

  // Diesel & Costs
  const dieselExpenses = expenses.filter((e) => e.category === 'diesel');
  const totalDieselLiters = dieselExpenses.reduce((sum, e) => sum + (e.liters || 0), 0) +
    trips.reduce((sum, t) => sum + (t.actualFuelLiters || t.estimatedFuelLiters || 0), 0);
  const totalProductionCost = totalDeliveredLiters * settings.waterProductionCostPerLiter;
  const totalDeliveryCost = trips.reduce((sum, t) => sum + (t.actualCost || t.totalCost || 0), 0);
  const totalOperatingCost = totalProductionCost + totalDeliveryCost;
  const totalOperatingProfit = totalSalesRevenue - totalOperatingCost;
  const profitMargin = totalSalesRevenue > 0 ? ((totalOperatingProfit / totalSalesRevenue) * 100).toFixed(1) : '0';

  const activeTrip = trips.find((t) => t.status === 'in_progress');

  return (
    <div className="space-y-6">
      {/* Production Readiness & Demo Status Banner */}
      {settings.demoDataActive !== false ? (
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-slate-900 text-sm">وضع البيانات التجريبية نشط</span>
                <span className="text-[10px] bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded-full">
                  15 عميلاً تجريبياً في مأرب
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                النظام محمل ببيانات تجريبية استرشادية لمأرب. يمكنك مسح البيانات بضغطة واحدة وبدء التشغيل الفعلي للمصنع فوراً.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
            <button
              onClick={() => setShowGuideModal(true)}
              className="flex-1 sm:flex-none px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
            >
              <BookOpen className="w-4 h-4 text-sky-700" />
              <span>دليل البدء الفعلي</span>
            </button>
            <button
              onClick={() => setShowClearConfirm(true)}
              className="flex-1 sm:flex-none px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>مسح وبدء التشغيل الفعلي</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-sm">نظام مصنع مياهنا في وضع التشغيل الميداني الفعلي</span>
                <span className="text-[10px] bg-emerald-200 text-emerald-950 font-bold px-2 py-0.5 rounded-full">
                  قاعدة البيانات جاهزة
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                كافة العمليات والرحلات المسجلة هي بيانات حقيقية لإنتاج وتوزيع المياه في مأرب.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
            <button
              onClick={() => setShowGuideModal(true)}
              className="flex-1 sm:flex-none px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-sky-700" />
              <span>دليل العمل الميداني</span>
            </button>
            <button
              onClick={() => setManagerTab('orders')}
              className="flex-1 sm:flex-none px-3.5 py-2 bg-sky-700 hover:bg-sky-800 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Droplets className="w-4 h-4" />
              <span>+ تسجيل طلب مياه</span>
            </button>
          </div>
        </div>
      )}

      {/* Top Banner & Quick Recommendation Alert */}
      {clusterProposals.length > 0 && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-600 text-white flex items-center justify-center shrink-0">
              <GitMerge className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-sm">
                  اقتراح رحلة ذكي جاهز للاعتماد ({clusterProposals[0].totalLiters.toLocaleString()} لتر / {clusterProposals[0].capacityUtilization}%)
                </h3>
                <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-semibold">
                  {clusterProposals[0].recommendation === 'GO_NOW' ? 'الخروج الآن' : 'رحلة جزئية مجدية'}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">{clusterProposals[0].reason}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <button
              onClick={() => setManagerTab('clustering')}
              className="px-4 py-2 bg-sky-700 text-white rounded-lg text-xs font-semibold hover:bg-sky-800 transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>معاينة المقترح والاعتماد</span>
              <ArrowLeftIcon />
            </button>
          </div>
        </div>
      )}

      {/* Row 1: High-Level Performance Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard
          title="الطلبات المنتظرة"
          value={waitingOrders + newOrders}
          subtext={`${totalRequestedLiters.toLocaleString()} لتر مطلوب`}
          icon={Clock}
          color="text-amber-700 bg-amber-50"
        />
        <StatCard
          title="قيد التوصيل الآن"
          value={inDeliveryOrders}
          subtext={activeTrip ? `${activeTrip.tripNumber}` : 'لا توجد رحلة نشطة'}
          icon={Truck}
          color="text-sky-700 bg-sky-50"
        />
        <StatCard
          title="طلبات منفذة"
          value={deliveredOrders}
          subtext={`${totalDeliveredLiters.toLocaleString()} لتر تم تسليمه`}
          icon={CheckCircle}
          color="text-emerald-700 bg-emerald-50"
        />
        <StatCard
          title="المبيعات الإجمالية"
          value={`${totalSalesRevenue.toLocaleString()} ر.ي`}
          subtext={`التحصيل: ${totalCashCollected.toLocaleString()} ر.ي`}
          icon={Receipt}
          color="text-blue-700 bg-blue-50"
        />
        <StatCard
          title="الديون المتبقية"
          value={`${totalReceivables.toLocaleString()} ر.ي`}
          subtext="متبقي لدى العملاء"
          icon={TrendingUp}
          color="text-rose-700 bg-rose-50"
        />
        <StatCard
          title="الربح التشغيلي"
          value={`${totalOperatingProfit.toLocaleString()} ر.ي`}
          subtext={`هامش الربح: ${profitMargin}%`}
          icon={ArrowUpRight}
          color="text-emerald-800 bg-emerald-100/60"
        />
      </div>

      {/* Row 2: Live Truck Status & Marib Map */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Live Map */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-bold text-slate-900 text-sm">خريطة التوزيع المباشر – مديرية مأرب</h2>
              <p className="text-xs text-slate-500">
                مواقع العملاء، مصنع المياه المركزي، ومسار الوايت الحالي عبر GPS وSMS
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setManagerTab('map')}
                className="text-xs text-sky-700 hover:text-sky-900 font-semibold flex items-center gap-1"
              >
                <span>فتح الخريطة الكاملة</span>
                <ArrowLeftIcon />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-[380px]">
            <MaribMap
              settings={settings}
              truck={truck}
              customerStops={activeTrip ? activeTrip.customerStops : []}
              height="380px"
            />
          </div>
        </div>

        {/* Right 1 Col: Live Truck & Operational Cycle Telemetry */}
        <div className="space-y-4">
          {/* Truck Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">وايت مأرب (6,000L)</h3>
                  <p className="text-xs text-slate-500">{truck.plateNumber}</p>
                </div>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                truck.status === 'on_trip'
                  ? 'bg-emerald-100 text-emerald-800'
                  : truck.status === 'loading'
                  ? 'bg-sky-100 text-sky-800'
                  : 'bg-slate-100 text-slate-700'
              }`}>
                {truck.status === 'on_trip' ? 'في مهمة توصيل' : truck.status === 'loading' ? 'جاري التعبئة' : 'جاهز'}
              </span>
            </div>

            {/* Gauge */}
            <div className="py-3">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-slate-600">كمية المياه بالصهريج:</span>
                <span className="font-bold font-mono text-sky-700">
                  {truck.currentWaterLiters.toLocaleString()} / 6,000 لتر
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200">
                <div
                  className="bg-sky-600 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${(truck.currentWaterLiters / 6000) * 100}%` }}
                />
              </div>
            </div>

            {/* Telemetry rows */}
            <div className="space-y-2 text-xs text-slate-600 pt-2 border-t border-slate-100">
              <div className="flex justify-between">
                <span>السائق المسؤول:</span>
                <span className="font-semibold text-slate-900">{truck.driverName}</span>
              </div>
              <div className="flex justify-between">
                <span>آخر سرعة مسجلة:</span>
                <span className="font-mono font-bold text-slate-900">{truck.lastSpeed || 0} كم/س</span>
              </div>
              <div className="flex justify-between">
                <span>آخر حدث GPS:</span>
                <span className="font-semibold text-sky-700">{truck.lastEvent}</span>
              </div>
              <div className="flex justify-between">
                <span>وقت آخر تحديث:</span>
                <span className="text-slate-500 font-mono">
                  {new Date(truck.lastUpdateTimestamp).toLocaleTimeString('ar-YE')}
                </span>
              </div>
              <div className="flex justify-between">
                <span>عداد المسافات:</span>
                <span className="font-mono">{truck.odometerKm.toLocaleString()} كم</span>
              </div>
            </div>

            {/* Quick action button to driver simulator */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex gap-2">
              <button
                onClick={() => setViewMode('simulator')}
                className="flex-1 py-2 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-xs font-semibold hover:bg-amber-100 transition-colors flex items-center justify-center gap-1.5"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>محاكاة إرسال SMS</span>
              </button>
              <button
                onClick={() => setViewMode('driver')}
                className="flex-1 py-2 bg-sky-50 text-sky-800 border border-sky-200 rounded-lg text-xs font-semibold hover:bg-sky-100 transition-colors flex items-center justify-center gap-1.5"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>تطبيق السائق</span>
              </button>
            </div>
          </div>

          {/* Diesel & Fuel Efficiency Widget */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-xs space-y-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Fuel className="w-4 h-4 text-amber-600" />
                <span className="font-bold text-slate-900">الوقود والديزل للوايت</span>
              </div>
              <span className="text-slate-500 font-mono">{settings.dieselPricePerLiter} ر.ي/لتر</span>
            </div>
            <div className="flex justify-between">
              <span>استهلاك الرحلات التقديري:</span>
              <span className="font-mono font-bold text-slate-800">{totalDieselLiters.toFixed(1)} لتر ديزل</span>
            </div>
            <div className="flex justify-between">
              <span>معدل الاستهلاك:</span>
              <span className="font-mono">{settings.truckDieselConsumptionPerKm} لتر/كم</span>
            </div>
            <div className="flex justify-between">
              <span>تكلفة إنتاج لتر الماء:</span>
              <span className="font-mono">{settings.waterProductionCostPerLiter} ر.ي/لتر</span>
            </div>
            <div className="flex justify-between">
              <span>سعر بيع لتر الماء:</span>
              <span className="font-mono text-emerald-700 font-bold">{settings.defaultSellingPricePerLiter} ر.ي/لتر</span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Active Orders & Trips Table Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Unclustered Orders */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Droplets className="w-4 h-4 text-sky-600" />
              <h3 className="font-bold text-slate-900 text-sm">أحدث طلبات المياه الواردة</h3>
            </div>
            <button
              onClick={() => setManagerTab('orders')}
              className="text-xs text-sky-700 hover:text-sky-900 font-medium"
            >
              عرض الكل ({orders.length})
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {orders.length === 0 ? (
              <div className="py-8 text-center text-slate-400 space-y-2">
                <Droplets className="w-8 h-8 mx-auto text-slate-300" />
                <p className="font-semibold text-slate-600 text-xs">لا توجد طلبات مسجلة حالياً</p>
                <p className="text-[11px] text-slate-400">قاعدة البيانات جاهزة لاستقبال طلبات المياه الحقيقية</p>
                <button
                  onClick={() => setManagerTab('orders')}
                  className="mt-2 px-3 py-1.5 bg-sky-700 text-white rounded-lg text-xs font-bold hover:bg-sky-800 transition-colors cursor-pointer"
                >
                  + تسجيل طلب مياه جديد
                </button>
              </div>
            ) : (
              orders.slice(0, 5).map((order) => (
                <div key={order.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-semibold text-slate-900 flex items-center gap-2">
                      <span>{order.customerName}</span>
                      {order.isUrgent && (
                        <span className="text-[10px] bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded font-bold">عاجل</span>
                      )}
                      {order.duplicateWarning && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded">محتمل تكراره</span>
                      )}
                    </div>
                    <div className="text-slate-500 text-[11px]">
                      {order.district} · {order.phone} · المصدر: {getOrderSourceArabic(order.source)}
                    </div>
                  </div>
                  <div className="text-left font-mono">
                    <div className="font-bold text-sky-800">{order.requestedLiters.toLocaleString()} لتر</div>
                    <div className="text-slate-500 text-[11px]">{order.totalAmount.toLocaleString()} ر.ي</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Trips Summary */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-emerald-600" />
              <h3 className="font-bold text-slate-900 text-sm">سجل رحلات اليوم ودورات الحمولة</h3>
            </div>
            <button
              onClick={() => setManagerTab('trips')}
              className="text-xs text-sky-700 hover:text-sky-900 font-medium"
            >
              إدارة الرحلات ({trips.length})
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {trips.length === 0 ? (
              <div className="py-8 text-center text-slate-400 space-y-2">
                <Truck className="w-8 h-8 mx-auto text-slate-300" />
                <p className="font-semibold text-slate-600 text-xs">لا توجد رحلات مسجلة اليوم</p>
                <p className="text-[11px] text-slate-400">الوايت متوقف داخل المصنع في وضع الاستعداد بانتظار اعتماد الرحلة الأولى</p>
              </div>
            ) : (
              trips.map((trip) => (
                <div key={trip.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-semibold text-slate-900 flex items-center gap-2">
                      <span className="font-mono">{trip.tripNumber}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                        trip.status === 'in_progress'
                          ? 'bg-emerald-100 text-emerald-800'
                          : trip.status === 'completed'
                          ? 'bg-blue-100 text-blue-800'
                          : trip.status === 'reconciled'
                          ? 'bg-slate-100 text-slate-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {getTripStatusArabic(trip.status)}
                      </span>
                    </div>
                    <div className="text-slate-500 text-[11px] mt-0.5">
                      {trip.customerStops.length} عملاء · الحمولة: {trip.initialLoadLiters.toLocaleString()} لتر ({trip.capacityUtilizationPercent}%)
                    </div>
                  </div>
                  <div className="text-left font-mono">
                    <div className="font-bold text-emerald-700">+{trip.expectedProfit.toLocaleString()} ر.ي</div>
                    <div className="text-slate-500 text-[11px]">هامش: {trip.profitMarginPercent}%</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal: Clear Demo Data & Start Real Operation */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-xs space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="w-12 h-12 bg-rose-100 text-rose-700 rounded-xl flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h4 className="font-bold text-base text-slate-900">مسح البيانات التجريبية وبدء التشغيل الفعلي</h4>
              <p className="text-slate-600 mt-2 leading-relaxed">
                سيتم مسح جميع العملاء التجريبيين، والطلبات، والرحلات السابقة، وسجلات الـ GPS التجريبية نهائياً لتجهيز قاعدة البيانات للميدان.
              </p>
              <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3 text-right space-y-1 text-[11px] text-slate-700">
                <div className="font-bold text-slate-900 text-xs mb-1">ما الذي يتم الاحتفاظ به؟</div>
                <div className="flex items-center gap-1.5 text-emerald-700">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>معايير التسعير وتكلفة تحلية اللتر وسعر الديزل في مأرب</span>
                </div>
                <div className="flex items-center gap-1.5 text-emerald-700">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>رمز مرور الدخول للوحة المدير العام</span>
                </div>
                <div className="flex items-center gap-1.5 text-emerald-700">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>موقع المصنع المركزي بمأرب وبيانات شريحة سبأفون</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                disabled={isClearing}
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                تراجع
              </button>
              <button
                disabled={isClearing}
                onClick={async () => {
                  setIsClearing(true);
                  await clearDemoData();
                  setIsClearing(false);
                  setShowClearConfirm(false);
                }}
                className="flex-1 py-2.5 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
              >
                {isClearing ? (
                  <span>جاري التصفير...</span>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>تأكيد والبدء الفعلي</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Field Operations Guide Modal (دليل خطوات التشغيل الفعلي) */}
      {showGuideModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 text-xs space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-800 flex items-center justify-center">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">دليل البدء والتشغيل الفعلي لمصنع مياهنا بمأرب</h4>
                  <p className="text-[11px] text-slate-500">خارطة طريق كاملة من تصفير البيانات حتى تسوية الأرباح اليومية</p>
                </div>
              </div>
              <button
                onClick={() => setShowGuideModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-slate-700 leading-relaxed">
              <div className="p-3 bg-sky-50 border border-sky-100 rounded-xl flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-sky-700 text-white font-bold text-xs flex items-center justify-center shrink-0">1</span>
                <div>
                  <div className="font-bold text-slate-900 text-xs">تصفير البيانات التجريبية</div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    اضغط على زر <strong>«مسح وبدء التشغيل الفعلي»</strong>. ستصبح قاعدة البيانات نظيفة وجاهزة تماماً.
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-sky-700 text-white font-bold text-xs flex items-center justify-center shrink-0">2</span>
                <div>
                  <div className="font-bold text-slate-900 text-xs">إضافة عملاء المصنع الحقيقيين</div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    من تبويب <strong>«العملاء»</strong>، اضغط <strong>«+ عميل جديد»</strong> وسجل أسماء العملاء، أرقام هواتفهم، الحي السكني، وسعة خزاناتهم ومواقعهم الجغرافية. يمكن للسائق أيضاً إضافة عملاء ميدانياً أثناء الجولات.
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-sky-700 text-white font-bold text-xs flex items-center justify-center shrink-0">3</span>
                <div>
                  <div className="font-bold text-slate-900 text-xs">استقبال وتسجيل طلبات المياه</div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    عند اتصال العميل أو مراسلته عبر واتساب أو سبأفون، سجل طلبه في تبويب <strong>«الطلبات»</strong> محددًا الكمية باللتر أو الطن ومدى استعجال الطلب.
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-sky-700 text-white font-bold text-xs flex items-center justify-center shrink-0">4</span>
                <div>
                  <div className="font-bold text-slate-900 text-xs">التجميع الذكي واعتماد رحلة الوايت (6,000 لتر)</div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    في تبويب <strong>«التجميع الذكي»</strong>، ستقوم الخوارزمية تلقائياً بتجميع العملاء المتقاربين جغرافياً بحمولة لا تتجاوز 6,000 لتر، وحساب استهلاك الديزل وتكاليف التوصيل وصافي الربح المتوقع، والضغط على <strong>«اعتماد الرحلة وتكليف الوايت»</strong>.
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-sky-700 text-white font-bold text-xs flex items-center justify-center shrink-0">5</span>
                <div>
                  <div className="font-bold text-slate-900 text-xs">انطلاق السائق وتسليم المياه والتتبع دون إنترنت</div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    يفتح السائق تطبيقه على هاتف العمل (أندرويد) ليجد الرحلة المعتمدة وترتيب العملاء. يقوم بتسجيل الوصول، والكمية المسلمة، والمبلغ المستلم نقداً. التطبيق يعمل حتى دون إنترنت عبر الرسائل النصية القصيرة لشبكة سبأفون.
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-sky-700 text-white font-bold text-xs flex items-center justify-center shrink-0">6</span>
                <div>
                  <div className="font-bold text-slate-900 text-xs">عودة الوايت وتسوية العهدة النقدية والأرباح</div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    عند رجوع الوايت للمصنع، يتم فتح تبويب <strong>«تسوية عهدة السائق»</strong>، ومطابقة النقد الفعلي المحصل مع فواتير المياه، وخصم أي مصاريف ديزل معتمدة، وحساب الأرباح الصافية المحققة فوراً.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                ملاحظة: يمكنك في أي وقت من إعدادات النظام استعادة البيانات التجريبية لتدريب سائق جديد.
              </span>
              <button
                onClick={() => setShowGuideModal(false)}
                className="px-4 py-2 bg-sky-700 text-white font-bold rounded-lg hover:bg-sky-800 transition-colors cursor-pointer"
              >
                فهمت، إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function StatCard({
  title,
  value,
  subtext,
  icon: Icon,
  color,
}: {
  title: string;
  value: string | number;
  subtext: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-600 font-medium truncate">{title}</span>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div>
        <div className="text-lg font-bold font-mono text-slate-900 leading-none truncate">{value}</div>
        <div className="text-[11px] text-slate-500 mt-1 truncate">{subtext}</div>
      </div>
    </div>
  );
}

function ArrowLeftIcon() {
  return (
    <svg className="w-3.5 h-3.5 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
  );
}

function getOrderSourceArabic(source: string): string {
  switch (source) {
    case 'phone': return 'اتصال هاتفي';
    case 'whatsapp': return 'واتساب';
    case 'sms': return 'رسالة SMS';
    case 'manager_manual': return 'إدخال المدير';
    case 'driver_manual': return 'إدخال السائق';
    default: return source;
  }
}

function getTripStatusArabic(status: string): string {
  switch (status) {
    case 'proposed': return 'مقترح للمدير';
    case 'approved': return 'معتمد للخروج';
    case 'loading': return 'جاري التعبئة';
    case 'in_progress': return 'قيد التوصيل';
    case 'returning': return 'عائد للمصنع';
    case 'completed': return 'مكتملة';
    case 'reconciled': return 'تمت تسوية العهدة';
    default: return status;
  }
}
