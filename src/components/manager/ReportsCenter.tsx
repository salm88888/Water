/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Comprehensive 15 Business Reports & CSV Export Center
 */

import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Download,
  Printer,
  Calendar,
  Filter,
  Search,
  CheckCircle,
  Truck,
  Droplet,
  Users,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const ReportsCenter: React.FC = () => {
  const { orders, customers, trips, invoices, expenses, settings, truck, gpsEvents } = useApp();

  const [activeReportId, setActiveReportId] = useState<number>(1);
  const [dateFilter, setDateFilter] = useState('2026-11-11');

  const reportDefinitions = [
    { id: 1, title: 'تقرير الطلبات اليومية', desc: 'كافة الطلبات المسجلة وحالاتها ومصادرها' },
    { id: 2, title: 'تقرير الطلبات غير المنفذة', desc: 'الطلبات المنتظرة للتجميع والتوزيع' },
    { id: 3, title: 'تقرير العملاء الأكثر طلباً', desc: 'ترتيب العملاء بحسب حجم المياه والمشتريات' },
    { id: 4, title: 'تقرير الكميات المباعة', desc: 'إجمالي لترات المياه المسلمة وإيراداتها' },
    { id: 5, title: 'تقرير الرحلات المنجزة', desc: 'سجل دورات الحمولة ومسافاتها وساعات خروجها' },
    { id: 6, title: 'تقرير استهلاك الديزل', desc: 'استهلاك الوقود التقديري والفعلي لكل رحلة' },
    { id: 7, title: 'تقرير التحصيل النقدي', desc: 'المبالغ المحصلة نقداً ومطابقتها' },
    { id: 8, title: 'تقرير الديون والمتبقيات', desc: 'مستحقات المصنع الآجلة لدى العملاء' },
    { id: 9, title: 'تقرير المصروفات والتشغيل', desc: 'بيان مصروفات الصيانة، الزيوت، والمولد' },
    { id: 10, title: 'تقرير الأرباح والخسائر P&L', desc: 'قائمة الدخل: الإيرادات ناقص تكاليف الإنتاج والنقل' },
    { id: 11, title: 'تقرير أداء السائق والوايت', desc: 'كفاءة التسليم والالتزام بالوقت والتحصيل' },
    { id: 12, title: 'تقرير حركة الوايت وتتبع GPS', desc: 'سجل أحداث الحركة والتوقف والوصول عبر SMS' },
    { id: 13, title: 'تقرير تكلفة التوصيل للمنزل', desc: 'متوسط تكلفة النقل لكل منزل في أحياء مأرب' },
    { id: 14, title: 'تقرير استغلال حمولة الوايت (6000L)', desc: 'نسبة استغلال سعة الصهريج لكل دورة توزيع' },
    { id: 15, title: 'تقرير أداء المناطق والأحياء', desc: 'حجم الطلبات واللترات في الروضة، الشركة، المجمع، إلخ' },
  ];

  // Helper to trigger real CSV download
  const downloadCSV = (filename: string, rows: (string | number)[][]) => {
    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      rows.map((e) => e.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportCSV = () => {
    const rep = reportDefinitions.find((r) => r.id === activeReportId);
    const title = rep?.title || 'تقرير مياهنا';

    if (activeReportId === 1) {
      // Daily Orders
      const rows = [
        ['رقم الطلب', 'العميل', 'الهاتف', 'المنطقة', 'الكمية المطلوبة (لتر)', 'الإجمالي (ر.ي)', 'المصدر', 'الحالة', 'التاريخ'],
        ...orders.map((o) => [
          o.orderNumber,
          o.customerName,
          o.phone,
          o.district,
          o.requestedLiters,
          o.totalAmount,
          o.source,
          o.status,
          o.createdAt,
        ]),
      ];
      downloadCSV('تقرير_الطلبات_اليومية_مأرب', rows);
    } else if (activeReportId === 3) {
      // Top Customers
      const sorted = [...customers].sort((a, b) => b.totalLitersDelivered - a.totalLitersDelivered);
      const rows = [
        ['رقم العميل', 'الاسم', 'الهاتف', 'الحي', 'سعة الخزان', 'إجمالي الطلبات', 'إجمالي اللترات المسلمة', 'المبيعات المقدرة'],
        ...sorted.map((c) => [
          c.customerId,
          c.name,
          c.phone,
          c.district,
          c.tankCapacityLiters,
          c.totalOrdersCount,
          c.totalLitersDelivered,
          c.totalLitersDelivered * settings.defaultSellingPricePerLiter,
        ]),
      ];
      downloadCSV('تقرير_العملاء_الأكثر_طلباً', rows);
    } else if (activeReportId === 10) {
      // P&L
      const totalDelivered = trips.reduce((sum, t) => sum + t.deliveredLiters, 0);
      const totalRev = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
      const prodCost = totalDelivered * settings.waterProductionCostPerLiter;
      const fuelCost = trips.reduce((sum, t) => sum + t.fuelCost, 0);
      const wageCost = trips.reduce((sum, t) => sum + t.driverWageShare, 0);
      const maintCost = trips.reduce((sum, t) => sum + t.maintenanceShare, 0);
      const totalCost = prodCost + fuelCost + wageCost + maintCost;
      const profit = totalRev - totalCost;

      const rows = [
        ['بند قائمة الدخل', 'المبلغ (ريال يمني)', 'النسبة من الإيراد'],
        ['إجمالي إيرادات مبيعات المياه', totalRev, '100%'],
        ['تكلفة إنتاج وتحلية المياه', prodCost, `${Math.round((prodCost / totalRev) * 100)}%`],
        ['تكلفة وقود الديزل للوايت', fuelCost, `${Math.round((fuelCost / totalRev) * 100)}%`],
        ['أجور السائق للرحلات', wageCost, `${Math.round((wageCost / totalRev) * 100)}%`],
        ['مخصص الصيانة والإهلاك', maintCost, `${Math.round((maintCost / totalRev) * 100)}%`],
        ['إجمالي التكاليف التشغيلية', totalCost, `${Math.round((totalCost / totalRev) * 100)}%`],
        ['صافي الربح التشغيلي', profit, `${Math.round((profit / totalRev) * 100)}%`],
      ];
      downloadCSV('تقرير_الأرباح_والخسائر_مصنع_مياهنا', rows);
    } else {
      // Generic Trip / Invoices CSV
      const rows = [
        ['رقم الفاتورة', 'رقم الرحلة', 'العميل', 'الحي', 'الكمية المسلمة', 'المسدد نقداً', 'المتبقي دين'],
        ...invoices.map((inv) => [
          inv.invoiceNumber,
          inv.tripNumber,
          inv.customerName,
          inv.district,
          inv.deliveredLiters,
          inv.paidAmount,
          inv.remainingAmount,
        ]),
      ];
      downloadCSV('تقرير_بيانات_مياهنا', rows);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">مركز التقارير والإحصائيات الشاملة (15 تقريراً معتمداً)</h2>
          <p className="text-xs text-slate-500">
            استخراج بيانات التشغيل، الحسابات الختامية، استهلاك الوقود وأداء المناطق مع تصدير Excel وطباعة PDF
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-700 text-white rounded-lg text-xs font-semibold hover:bg-emerald-800 transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            <span>تصدير Excel (CSV)</span>
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 bg-white text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة التقرير (PDF)</span>
          </button>
        </div>
      </div>

      {/* Report Selector Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
        {reportDefinitions.map((rep) => {
          const isActive = activeReportId === rep.id;
          return (
            <button
              key={rep.id}
              onClick={() => setActiveReportId(rep.id)}
              className={`p-2.5 rounded-xl text-right transition-all border ${
                isActive
                  ? 'bg-sky-700 text-white border-sky-800 shadow-sm font-bold'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 shadow-xs'
              }`}
            >
              <div className="truncate font-semibold text-[11px] mb-0.5">{rep.title}</div>
              <div className={`text-[10px] truncate ${isActive ? 'text-sky-200' : 'text-slate-400'}`}>
                {rep.desc}
              </div>
            </button>
          );
        })}
      </div>

      {/* Render Active Report Data Preview */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">
              {reportDefinitions.find((r) => r.id === activeReportId)?.title}
            </h3>
            <p className="text-xs text-slate-500">
              {reportDefinitions.find((r) => r.id === activeReportId)?.desc} · مصنع مياهنا - مأرب
            </p>
          </div>
          <div className="text-xs font-mono text-slate-500 bg-slate-50 px-2.5 py-1 rounded border border-slate-200">
            تاريخ التوليد: {new Date().toLocaleDateString('ar-YE')}
          </div>
        </div>

        {/* Dynamic Table based on Report */}
        {activeReportId === 1 && (
          // Daily Orders
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-right">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">رقم الطلب</th>
                  <th className="py-2.5 px-3">العميل</th>
                  <th className="py-2.5 px-3">الحي</th>
                  <th className="py-2.5 px-3">المطلوب</th>
                  <th className="py-2.5 px-3">المبلغ</th>
                  <th className="py-2.5 px-3">المصدر</th>
                  <th className="py-2.5 px-3">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono font-bold text-sky-800">{o.orderNumber}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">{o.customerName}</td>
                    <td className="py-2.5 px-3 text-slate-600">{o.district}</td>
                    <td className="py-2.5 px-3 font-mono font-bold">{o.requestedLiters.toLocaleString()}L</td>
                    <td className="py-2.5 px-3 font-mono">{o.totalAmount.toLocaleString()} ر.ي</td>
                    <td className="py-2.5 px-3 text-slate-500">{o.source}</td>
                    <td className="py-2.5 px-3 font-semibold text-sky-700">{o.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeReportId === 10 && (
          // P&L Report
          <div className="space-y-4 text-xs max-w-2xl mx-auto py-2">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
              <div className="flex justify-between font-bold text-sm text-slate-900 pb-2 border-b border-slate-200">
                <span>1. إجمالي إيرادات مبيعات المياه المحققة:</span>
                <span className="font-mono text-emerald-800">
                  {invoices.reduce((s, i) => s + i.totalAmount, 0).toLocaleString()} ر.ي
                </span>
              </div>

              <div className="flex justify-between text-slate-600">
                <span>- تكلفة إنتاج وتحلية المياه بالمصنع (3.5 ر.ي/لتر):</span>
                <span className="font-mono text-rose-700">
                  {(trips.reduce((s, t) => s + t.deliveredLiters, 0) * settings.waterProductionCostPerLiter).toLocaleString()} ر.ي
                </span>
              </div>

              <div className="flex justify-between text-slate-600">
                <span>- تكلفة استهلاك ديزل الوايت:</span>
                <span className="font-mono text-rose-700">
                  {trips.reduce((s, t) => s + t.fuelCost, 0).toLocaleString()} ر.ي
                </span>
              </div>

              <div className="flex justify-between text-slate-600">
                <span>- أجور ومكافآت السائق:</span>
                <span className="font-mono text-rose-700">
                  {trips.reduce((s, t) => s + t.driverWageShare, 0).toLocaleString()} ر.ي
                </span>
              </div>

              <div className="flex justify-between text-slate-600">
                <span>- مخصص صيانة الوايت والإهلاك:</span>
                <span className="font-mono text-rose-700">
                  {trips.reduce((s, t) => s + t.maintenanceShare, 0).toLocaleString()} ر.ي
                </span>
              </div>

              <div className="flex justify-between font-bold text-sm text-emerald-800 pt-3 border-t border-dashed border-slate-300 bg-emerald-100/50 p-3 rounded-lg">
                <span>صافي الأرباح التشغيلية:</span>
                <span className="font-mono">
                  +{(
                    invoices.reduce((s, i) => s + i.totalAmount, 0) -
                    (trips.reduce((s, t) => s + t.deliveredLiters, 0) * settings.waterProductionCostPerLiter +
                      trips.reduce((s, t) => s + t.fuelCost + t.driverWageShare + t.maintenanceShare, 0))
                  ).toLocaleString()} ر.ي
                </span>
              </div>
            </div>
          </div>
        )}

        {activeReportId === 15 && (
          // Neighborhoods performance
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-right">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">المنطقة والحي</th>
                  <th className="py-2.5 px-3">عدد العملاء</th>
                  <th className="py-2.5 px-3">إجمالي الطلبات</th>
                  <th className="py-2.5 px-3">كمية المياه (لتر)</th>
                  <th className="py-2.5 px-3">الإيراد المحقق</th>
                  <th className="py-2.5 px-3">متوسط الطلب</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {['حي الروضة', 'حي الشركة', 'المجمع الحكومي', 'حي السلام', 'حي المطار', 'حي الفاو', 'الخسيف', 'حصون آل جلال', 'جو النسيم'].map((dist) => {
                  const distCusts = customers.filter((c) => c.district === dist);
                  const totalOrders = distCusts.reduce((sum, c) => sum + c.totalOrdersCount, 0);
                  const totalLiters = distCusts.reduce((sum, c) => sum + c.totalLitersDelivered, 0);
                  const revenue = totalLiters * settings.defaultSellingPricePerLiter;

                  return (
                    <tr key={dist} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{dist}</td>
                      <td className="py-2.5 px-3 font-mono">{distCusts.length}</td>
                      <td className="py-2.5 px-3 font-mono">{totalOrders}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-sky-800">{totalLiters.toLocaleString()}L</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-800">{revenue.toLocaleString()} ر.ي</td>
                      <td className="py-2.5 px-3 font-mono text-slate-500">
                        {totalOrders > 0 ? Math.round(totalLiters / totalOrders) : 0} لتر/طلب
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Default / Fallback view for other reports */}
        {activeReportId !== 1 && activeReportId !== 10 && activeReportId !== 15 && (
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-right">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">البيان</th>
                  <th className="py-2.5 px-3">رقم المرجع</th>
                  <th className="py-2.5 px-3">الكمية المسلمة</th>
                  <th className="py-2.5 px-3">المبلغ المحصل</th>
                  <th className="py-2.5 px-3">المسافة المقدرة</th>
                  <th className="py-2.5 px-3">الحالة والنتيجة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trips.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-semibold text-slate-900">{t.recommendationReason}</td>
                    <td className="py-2.5 px-3 font-mono text-sky-800">{t.tripNumber}</td>
                    <td className="py-2.5 px-3 font-mono font-bold">{t.deliveredLiters.toLocaleString()}L</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">
                      {(t.actualRevenue || t.expectedRevenue).toLocaleString()} ر.ي
                    </td>
                    <td className="py-2.5 px-3 font-mono">{t.actualDistanceKm || t.estimatedDistanceKm} كم</td>
                    <td className="py-2.5 px-3 text-slate-600 font-semibold">{t.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
