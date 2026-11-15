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
  Navigation,
  BookOpen,
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
  } = useApp();

  const [showGuideModal, setShowGuideModal] = useState(false);

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
      {/* Production Operational Header Banner */}
      <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 text-sm">نظام مصنع مياهنا في وضع التشغيل الميداني الفعلي</span>
              <span className="text-[10px] bg-emerald-200 text-emerald-950 font-bold px-2 py-0.5 rounded-full">
                قاعدة البيانات الفعلية
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              كافة العمليات والعملاء والرحلات المسجلة هي بيانات حقيقية لإنتاج وتوزيع المياه.
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
                مواقع العملاء، مصنع المياه المركزي، ومسار الوايت الحالي عبر GPS التلقائي
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

            {/* Quick action button to Trips & Driver */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex gap-2">
              <button
                onClick={() => setManagerTab('trips')}
                className="flex-1 py-2 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-xs font-semibold hover:bg-amber-100 transition-colors flex items-center justify-center gap-1.5"
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>مراجعة الرحلات والتتبع</span>
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
                          : trip.status === 'completed_pending_review' || trip.status === 'synced'
                          ? 'bg-indigo-100 text-indigo-800'
                          : trip.status === 'closed'
                          ? 'bg-slate-200 text-slate-800'
                          : trip.status === 'rejected'
                          ? 'bg-rose-100 text-rose-800'
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
                  <h4 className="font-bold text-sm text-slate-900">دليل البدء والتشغيل الفعلي لمصنع مياهنا</h4>
                  <p className="text-[11px] text-slate-500">خارطة طريق كاملة من تهيئة السائقين والعملاء حتى تسوية الأرباح اليومية</p>
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
                  <div className="font-bold text-slate-900 text-xs">تهيئة حسابات السائقين وموقع المصنع</div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    من تبويب <strong>«السائق والوايت»</strong> أضف أو اعتمد حساب السائق بكلمة المرور، وتأكد من ضبط موقع المصنع من <strong>«إعدادات النظام»</strong>.
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-sky-700 text-white font-bold text-xs flex items-center justify-center shrink-0">2</span>
                <div>
                  <div className="font-bold text-slate-900 text-xs">إضافة عملاء المصنع الحقيقيين</div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    من تبويب <strong>«العملاء»</strong>، اضغط <strong>«+ عميل جديد»</strong> وسجل أسماء العملاء، أرقام هواتفهم، الحي السكني، وسعة خزاناتهم ومواقعهم الجغرافية. يمكن للسائق أيضاً رفع زبائن جدد ميدانياً.
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-sky-700 text-white font-bold text-xs flex items-center justify-center shrink-0">3</span>
                <div>
                  <div className="font-bold text-slate-900 text-xs">استقبال ورفع طلبات المياه</div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    تُسجل الطلبات في تبويب <strong>«الطلبات»</strong> من لوحة المدير أو تُرفع مباشرة من تطبيق السائق ليراها المدير فوراً.
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-sky-700 text-white font-bold text-xs flex items-center justify-center shrink-0">4</span>
                <div>
                  <div className="font-bold text-slate-900 text-xs">إعداد المخطط واعتماد رحلة الوايت من المدير</div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    يقوم المدير بإعداد مخطط الوجهات من <strong>«إدارة الرحلات»</strong> أو <strong>«التجميع الذكي»</strong> واعتماده وإرساله للسائق للموافقة والتنفيذ.
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-sky-700 text-white font-bold text-xs flex items-center justify-center shrink-0">5</span>
                <div>
                  <div className="font-bold text-slate-900 text-xs">تتبع GPS التلقائي والعمل دون إنترنت</div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    يوافق السائق على الرحلة ويبدأها فتعمل حركة التتبع بالـ GPS تلقائياً حتى دون إنترنت عبر IndexedDB، وتتم المزامنة التلقائية فور عودة الاتصال.
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-sky-700 text-white font-bold text-xs flex items-center justify-center shrink-0">6</span>
                <div>
                  <div className="font-bold text-slate-900 text-xs">عودة الوايت وتسوية العهدة النقدية والأرباح</div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    عند رجوع الوايت للمصنع، يتم فتح تبويب <strong>«تسوية عهدة السائق»</strong>، ومطابقة النقد الفعلي المحصل مع فواتير المياه، وحساب الأرباح الصافية المحققة فوراً.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
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
    case 'manager_manual': return 'إدخال المدير';
    case 'driver_manual': return 'إدخال السائق';
    case 'customer_app': return 'تطبيق العميل';
    default: return source;
  }
}

function getTripStatusArabic(status: string): string {
  switch (status) {
    case 'draft': return 'مسودة';
    case 'pending_approval': return 'بانتظار الاعتماد';
    case 'rejected': return 'مرفوضة';
    case 'approved': return 'معتمدة للخروج';
    case 'in_progress': return 'جارية الآن';
    case 'returned_to_plant': return 'عادت للمصنع';
    case 'pending_sync': return 'بانتظار المزامنة';
    case 'synced': return 'تمت المزامنة';
    case 'completed_pending_review': return 'مكتملة بانتظار المراجعة';
    case 'closed': return 'مغلقة';
    default: return status;
  }
}
