/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Invoices & Cash Collections Management (الفواتير والتحصيل النقدي)
 */

import React, { useState } from 'react';
import {
  Receipt,
  Search,
  Printer,
  Download,
  Filter,
  CheckCircle,
  Clock,
  ArrowRight,
  Droplet,
  Phone,
  MapPin,
  Calendar,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Invoice } from '../../types';

export const InvoicingAndCash: React.FC = () => {
  const { invoices, printInvoice, setPrintInvoice } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'paid' | 'partial'>('all');

  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.phone.includes(searchQuery) ||
      inv.tripNumber.toLowerCase().includes(searchQuery.toLowerCase());

    const isFullPaid = inv.remainingAmount === 0;
    const isPartial = inv.remainingAmount > 0;

    if (selectedFilter === 'paid') return matchesSearch && isFullPaid;
    if (selectedFilter === 'partial') return matchesSearch && isPartial;
    return matchesSearch;
  });

  const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const totalPaid = invoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
  const totalRemaining = invoices.reduce((sum, inv) => sum + inv.remainingAmount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">سجل فواتير تسليم المياه والتحصيل النقدي ({invoices.length})</h2>
          <p className="text-xs text-slate-500">
            فواتير المبيعات الصادرة لكل تفريغ صهريج، مطابقة المبالغ المحصلة والديون المتبقية
          </p>
        </div>
      </div>

      {/* Financial Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <span className="text-slate-500 block text-[11px]">إجمالي قيمة الفواتير</span>
          <span className="font-bold font-mono text-slate-900 text-lg">{totalInvoiced.toLocaleString()} ر.ي</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">المبيعات المحسوبة باللتر</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <span className="text-slate-500 block text-[11px]">المبالغ النقدية المحصلة</span>
          <span className="font-bold font-mono text-emerald-700 text-lg">{totalPaid.toLocaleString()} ر.ي</span>
          <span className="text-[10px] text-emerald-600 block mt-0.5">
            نسبة التحصيل: {totalInvoiced > 0 ? Math.round((totalPaid / totalInvoiced) * 100) : 0}%
          </span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <span className="text-slate-500 block text-[11px]">المتبقي ديون لدى العملاء</span>
          <span className="font-bold font-mono text-rose-700 text-lg">{totalRemaining.toLocaleString()} ر.ي</span>
          <span className="text-[10px] text-rose-500 block mt-0.5">مستحقات مؤجلة بموافقة المدير</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث برقم الفاتورة، اسم العميل، الهاتف، أو رقم الرحلة..."
            className="w-full pl-3 pr-9 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-sky-500/20"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => setSelectedFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              selectedFilter === 'all' ? 'bg-sky-700 text-white font-bold' : 'bg-slate-100 text-slate-700'
            }`}
          >
            الكل ({invoices.length})
          </button>
          <button
            onClick={() => setSelectedFilter('paid')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              selectedFilter === 'paid' ? 'bg-emerald-600 text-white font-bold' : 'bg-slate-100 text-slate-700'
            }`}
          >
            مسددة بالكامل
          </button>
          <button
            onClick={() => setSelectedFilter('partial')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              selectedFilter === 'partial' ? 'bg-rose-600 text-white font-bold' : 'bg-slate-100 text-slate-700'
            }`}
          >
            دفع جزئي / آجل
          </button>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">رقم الفاتورة</th>
                <th className="py-3 px-4">العميل والحي</th>
                <th className="py-3 px-4">رقم الرحلة</th>
                <th className="py-3 px-4">الكمية المسلمة</th>
                <th className="py-3 px-4">سعر اللتر</th>
                <th className="py-3 px-4">الإجمالي</th>
                <th className="py-3 px-4">المسدد نقداً</th>
                <th className="py-3 px-4">المتبقي</th>
                <th className="py-3 px-4">التاريخ والوقت</th>
                <th className="py-3 px-4 text-center">طباعة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredInvoices.map((inv) => {
                const isFull = inv.remainingAmount === 0;

                return (
                  <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-sky-800">{inv.invoiceNumber}</td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{inv.customerName}</div>
                      <div className="text-[11px] text-slate-500">{inv.district} - {inv.phone}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">{inv.tripNumber}</td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-800">
                      {inv.deliveredLiters.toLocaleString()} لتر
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">{inv.pricePerLiter} ر.ي</td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {inv.totalAmount.toLocaleString()} ر.ي
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-emerald-700">
                      {inv.paidAmount.toLocaleString()} ر.ي
                    </td>
                    <td className="py-3 px-4 font-mono">
                      {isFull ? (
                        <span className="text-emerald-700 font-semibold text-[11px]">مسدد بالكامل</span>
                      ) : (
                        <span className="text-rose-700 font-bold">{inv.remainingAmount.toLocaleString()} ر.ي</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                      {new Date(inv.createdAt).toLocaleString('ar-YE', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => setPrintInvoice(inv)}
                        className="p-1.5 text-slate-600 hover:text-sky-700 hover:bg-sky-50 rounded"
                        title="معاينة وطباعة الفاتورة"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Printable Invoice Modal */}
      {printInvoice && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            {/* Header */}
            <div className="text-center pb-4 border-b border-slate-200 space-y-1">
              <div className="w-12 h-12 bg-sky-700 text-white rounded-xl flex items-center justify-center mx-auto mb-2">
                <Droplet className="w-6 h-6 fill-white" />
              </div>
              <h3 className="font-bold text-base text-slate-900">مصنع مياهنا المركزي لتحلية وتعبئة المياه</h3>
              <p className="text-xs text-slate-500">مديرية مأرب - اليمن · خدمة توصيل الصهاريج للمنازل</p>
              <div className="text-xs font-mono font-bold text-sky-800 mt-2 bg-sky-50 py-1 rounded">
                فاتورة توصيل مياه #{printInvoice.invoiceNumber}
              </div>
            </div>

            {/* Invoice Body */}
            <div className="py-4 space-y-3 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>اسم العميل:</span>
                <span className="font-bold text-slate-900">{printInvoice.customerName}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>الهاتف والحي:</span>
                <span className="font-mono text-slate-800">{printInvoice.phone} ({printInvoice.district})</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>رقم الرحلة:</span>
                <span className="font-mono text-slate-800">{printInvoice.tripNumber}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>السائق المسلم:</span>
                <span className="font-semibold text-slate-800">{printInvoice.driverName}</span>
              </div>

              <div className="border-t border-b border-slate-200 py-2.5 my-2 space-y-1.5">
                <div className="flex justify-between">
                  <span>كمية المياه المسلمة فعلياً:</span>
                  <span className="font-mono font-bold text-sky-700">{printInvoice.deliveredLiters.toLocaleString()} لتر</span>
                </div>
                <div className="flex justify-between">
                  <span>سعر اللتر:</span>
                  <span className="font-mono">{printInvoice.pricePerLiter} ر.ي/لتر</span>
                </div>
                <div className="flex justify-between font-bold text-slate-900 text-sm pt-1 border-t border-dashed border-slate-200">
                  <span>إجمالي المبلغ المستحق:</span>
                  <span className="font-mono">{printInvoice.totalAmount.toLocaleString()} ر.ي</span>
                </div>
              </div>

              <div className="flex justify-between text-slate-600">
                <span>المبلغ المدفوع نقداً:</span>
                <span className="font-mono font-bold text-emerald-700">{printInvoice.paidAmount.toLocaleString()} ر.ي</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>المبلغ المتبقي دين:</span>
                <span className="font-mono font-bold text-rose-700">{printInvoice.remainingAmount.toLocaleString()} ر.ي</span>
              </div>
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>تاريخ ووقت التسليم:</span>
                <span className="font-mono">{new Date(printInvoice.createdAt).toLocaleString('ar-YE')}</span>
              </div>
            </div>

            {/* Footer */}
            <div className="text-center pt-3 border-t border-slate-200 text-[11px] text-slate-400">
              شكراً لتعاملكم مع مياهنا · مياه نقية وصحية للشرب
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setPrintInvoice(null)}
                className="flex-1 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                إغلاق
              </button>
              <button
                onClick={() => window.print()}
                className="flex-1 py-2 bg-sky-700 text-white rounded-lg text-xs font-bold hover:bg-sky-800 flex items-center justify-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>طباعة الفاتورة</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
