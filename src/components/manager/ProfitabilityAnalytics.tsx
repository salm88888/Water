/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Profitability & Unit Economics Analytics Engine
 * Calculates multi-level profitability: per order, customer, trip, cycle, day, month;
 * Cost per house delivered and cost per 1,000 Liters delivered.
 */

import React, { useState } from 'react';
import {
  TrendingUp,
  DollarSign,
  Fuel,
  Home,
  Droplet,
  Layers,
  Calendar,
  Users,
  Truck,
  ArrowUpRight,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const ProfitabilityAnalytics: React.FC = () => {
  const { trips, invoices, customers, settings } = useApp();

  const [activeLevel, setActiveLevel] = useState<'trips' | 'customers' | 'summary'>('summary');

  // Overall calculations
  const totalDeliveredWater = trips.reduce((sum, t) => sum + t.deliveredLiters, 0);
  const totalRevenue = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const totalProductionCost = totalDeliveredWater * settings.waterProductionCostPerLiter;
  const totalDeliveryCost = trips.reduce((sum, t) => sum + (t.actualCost || t.totalCost || 0), 0) - totalProductionCost;
  const totalOperatingCost = totalProductionCost + totalDeliveryCost;
  const totalOperatingProfit = totalRevenue - totalOperatingCost;
  const overallMargin = totalRevenue > 0 ? ((totalOperatingProfit / totalRevenue) * 100).toFixed(1) : '0';

  const totalDeliveredHouses = trips.reduce((sum, t) => sum + t.customerStops.filter((s) => s.status === 'delivered').length, 0);

  // Unit Economics
  const costPerHouse = totalDeliveredHouses > 0 ? Math.round(totalDeliveryCost / totalDeliveredHouses) : 0;
  const costPer1000Liters = totalDeliveredWater > 0 ? Math.round((totalDeliveryCost / (totalDeliveredWater / 1000))) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">محرك حساب الربحية والتكلفة الحدية (Unit Economics)</h2>
          <p className="text-xs text-slate-500">
            تحليل تكلفة إنتاج ونقل المياه، تكلفة توصيل المنزل الواحد، وهوامش ربح كل رحلة وعميل
          </p>
        </div>

        {/* Level Switcher */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-medium">
          <button
            onClick={() => setActiveLevel('summary')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeLevel === 'summary' ? 'bg-white text-sky-800 shadow-sm font-bold' : 'text-slate-600'
            }`}
          >
            الملخص والوحدات
          </button>
          <button
            onClick={() => setActiveLevel('trips')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeLevel === 'trips' ? 'bg-white text-sky-800 shadow-sm font-bold' : 'text-slate-600'
            }`}
          >
            ربحية كل رحلة ودورة
          </button>
          <button
            onClick={() => setActiveLevel('customers')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeLevel === 'customers' ? 'bg-white text-sky-800 shadow-sm font-bold' : 'text-slate-600'
            }`}
          >
            ربحية كل عميل
          </button>
        </div>
      </div>

      {/* Primary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <span className="text-slate-500 block text-[11px]">إجمالي الإيرادات</span>
          <span className="font-bold font-mono text-slate-900 text-lg">{totalRevenue.toLocaleString()} ر.ي</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">سعر اللتر: {settings.defaultSellingPricePerLiter} ر.ي</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <span className="text-slate-500 block text-[11px]">إجمالي التكاليف التشغيلية</span>
          <span className="font-bold font-mono text-rose-700 text-lg">{totalOperatingCost.toLocaleString()} ر.ي</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">إنتاج + ديزل + أجور وصيانة</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <span className="text-slate-500 block text-[11px]">صافي الربح التشغيلي</span>
          <span className="font-bold font-mono text-emerald-700 text-lg">+{totalOperatingProfit.toLocaleString()} ر.ي</span>
          <span className="text-[10px] text-emerald-600 font-semibold block mt-0.5">هامش الربح: {overallMargin}%</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <span className="text-slate-500 block text-[11px]">تكلفة توصيل 1,000 لتر</span>
          <span className="font-bold font-mono text-sky-800 text-lg">{costPer1000Liters.toLocaleString()} ر.ي</span>
          <span className="text-[10px] text-slate-500 block mt-0.5">تكلفة النقل فقط للطن</span>
        </div>
      </div>

      {/* Unit Economics Deep Dive */}
      {activeLevel === 'summary' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 text-xs">
            <h3 className="font-bold text-slate-900 text-sm pb-2 border-b border-slate-100 flex items-center gap-2">
              <Home className="w-4 h-4 text-sky-600" />
              <span>معدلات التكلفة لكل منزل وزيارة</span>
            </h3>

            <div className="space-y-3">
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-600">متوسط تكلفة نقل المياه لكل منزل:</span>
                <span className="font-mono font-bold text-slate-900">{costPerHouse.toLocaleString()} ر.ي/منزل</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-600">تكلفة نقل اللتر الواحد عبر الوايت:</span>
                <span className="font-mono font-bold text-slate-900">
                  {totalDeliveredWater > 0 ? (totalDeliveryCost / totalDeliveredWater).toFixed(2) : 0} ر.ي/لتر
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-600">تكلفة إنتاج اللتر بمحطة التحلية:</span>
                <span className="font-mono font-bold text-sky-700">{settings.waterProductionCostPerLiter} ر.ي/لتر</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-600">إجمالي تكلفة اللتر الواصل للمنزل:</span>
                <span className="font-mono font-bold text-rose-700">
                  {totalDeliveredWater > 0
                    ? ((totalOperatingCost / totalDeliveredWater)).toFixed(2)
                    : 0} ر.ي/لتر
                </span>
              </div>
              <div className="flex justify-between py-1 font-bold text-emerald-800 bg-emerald-50 p-2 rounded">
                <span>صافي ربح اللتر الواحد الصافي:</span>
                <span className="font-mono">
                  {totalDeliveredWater > 0
                    ? (settings.defaultSellingPricePerLiter - (totalOperatingCost / totalDeliveredWater)).toFixed(2)
                    : 0} ر.ي/لتر
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 text-xs">
            <h3 className="font-bold text-slate-900 text-sm pb-2 border-b border-slate-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600" />
              <span>هيكل تكلفة دورة الحمولة الكاملة (6,000 لتر)</span>
            </h3>

            <div className="space-y-3">
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-600">إنتاج 6,000 لتر ماء صحي:</span>
                <span className="font-mono font-bold text-slate-800">
                  {(6000 * settings.waterProductionCostPerLiter).toLocaleString()} ر.ي
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-600">متوسط وقود الديزل للرحلة (18 كم):</span>
                <span className="font-mono font-bold text-amber-700">
                  {Math.round(18 * settings.truckDieselConsumptionPerKm * settings.dieselPricePerLiter).toLocaleString()} ر.ي
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-600">حصة أجر السائق للرحلة:</span>
                <span className="font-mono font-bold text-slate-800">{settings.driverWagePerTrip.toLocaleString()} ر.ي</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-600">مخصص صيانة وإهلاك الوايت:</span>
                <span className="font-mono font-bold text-slate-800">{settings.maintenanceAllowancePerTrip.toLocaleString()} ر.ي</span>
              </div>
              <div className="flex justify-between py-1.5 font-bold text-slate-900 border-t border-slate-200">
                <span>إجمالي التكلفة التقديرية للحمولة:</span>
                <span className="font-mono text-rose-700">
                  {(
                    6000 * settings.waterProductionCostPerLiter +
                    18 * settings.truckDieselConsumptionPerKm * settings.dieselPricePerLiter +
                    settings.driverWagePerTrip +
                    settings.maintenanceAllowancePerTrip
                  ).toLocaleString()} ر.ي
                </span>
              </div>
              <div className="flex justify-between py-1.5 font-bold text-emerald-800 bg-emerald-50 p-2 rounded">
                <span>إيراد بيع 6,000 لتر (12 ر.ي/لتر):</span>
                <span className="font-mono">72,000 ر.ي (ربح تشغيلي: ~39,000 ر.ي)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Trips Profitability Table */}
      {activeLevel === 'trips' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden text-xs">
          <table className="w-full text-right">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">رقم الرحلة</th>
                <th className="py-3 px-4">الحمولة المسلمة</th>
                <th className="py-3 px-4">المسافة الفعلية</th>
                <th className="py-3 px-4">تكلفة الإنتاج</th>
                <th className="py-3 px-4">تكلفة النقل والديزل</th>
                <th className="py-3 px-4">الإيراد المحقق</th>
                <th className="py-3 px-4">صافي الربح</th>
                <th className="py-3 px-4">هامش الربح</th>
                <th className="py-3 px-4">تكلفة المنزل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {trips.map((t) => {
                const stopsCount = t.customerStops.length || 1;
                const costHouse = Math.round((t.fuelCost + t.driverWageShare + t.maintenanceShare) / stopsCount);

                return (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono font-bold text-sky-800">{t.tripNumber}</td>
                    <td className="py-3 px-4 font-mono">{t.deliveredLiters.toLocaleString()}L ({t.capacityUtilizationPercent}%)</td>
                    <td className="py-3 px-4 font-mono">{t.actualDistanceKm || t.estimatedDistanceKm} كم</td>
                    <td className="py-3 px-4 font-mono">{t.productionCost.toLocaleString()} ر.ي</td>
                    <td className="py-3 px-4 font-mono text-amber-700">
                      {(t.fuelCost + t.driverWageShare + t.maintenanceShare).toLocaleString()} ر.ي
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {(t.actualRevenue || t.expectedRevenue).toLocaleString()} ر.ي
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-emerald-700">
                      +{(t.actualProfit || t.expectedProfit).toLocaleString()} ر.ي
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-emerald-800">
                      {t.profitMarginPercent}%
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">{costHouse.toLocaleString()} ر.ي</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Customer Profitability Table */}
      {activeLevel === 'customers' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden text-xs">
          <table className="w-full text-right">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">العميل</th>
                <th className="py-3 px-4">المنطقة والحي</th>
                <th className="py-3 px-4">إجمالي الطلبات</th>
                <th className="py-3 px-4">الكمية المسلمة</th>
                <th className="py-3 px-4">قيمة المشتريات</th>
                <th className="py-3 px-4">تكلفة إنتاج المياه</th>
                <th className="py-3 px-4">المساهمة في الربح</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.map((c) => {
                const revenue = c.totalLitersDelivered * settings.defaultSellingPricePerLiter;
                const prodCost = c.totalLitersDelivered * settings.waterProductionCostPerLiter;
                const estProfit = revenue - prodCost - (c.totalOrdersCount * 1200);

                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-semibold text-slate-900">{c.name}</td>
                    <td className="py-3 px-4 text-slate-600">{c.district}</td>
                    <td className="py-3 px-4 font-mono">{c.totalOrdersCount}</td>
                    <td className="py-3 px-4 font-mono font-bold text-sky-800">
                      {c.totalLitersDelivered.toLocaleString()} لتر
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {revenue.toLocaleString()} ر.ي
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500">{prodCost.toLocaleString()} ر.ي</td>
                    <td className="py-3 px-4 font-mono font-bold text-emerald-700">
                      +{estProfit.toLocaleString()} ر.ي
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
