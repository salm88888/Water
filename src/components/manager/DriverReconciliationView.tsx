/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Driver Cash Reconciliation (تسوية عهدة السائق المالية)
 */

import React, { useState } from 'react';
import {
  Wallet,
  CheckCircle,
  AlertTriangle,
  Receipt,
  FileCheck,
  Plus,
  ShieldCheck,
  Calendar,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { DriverReconciliation } from '../../types';

export const DriverReconciliationView: React.FC = () => {
  const {
    reconciliations,
    trips,
    invoices,
    submitDriverReconciliation,
    truck,
  } = useApp();

  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTripId, setSelectedTripId] = useState<string>('');
  const [actualHandedOver, setActualHandedOver] = useState<number>(0);
  const [authorizedExpenses, setAuthorizedExpenses] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');

  // Unreconciled completed trips
  const unreconciledTrips = trips.filter(
    (t) => t.status === 'completed' || (t.status === 'in_progress' && t.deliveredLiters > 0)
  );

  const selectedTrip = trips.find((t) => t.id === selectedTripId);

  // Calculate invoiced totals for selected trip
  const tripInvoices = selectedTripId ? invoices.filter((inv) => inv.tripId === selectedTripId) : [];
  const totalInvoiced = tripInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const totalCollectedCash = tripInvoices.reduce((sum, inv) => sum + inv.paidAmount, 0);

  const difference = actualHandedOver + authorizedExpenses - totalCollectedCash;

  const handleOpenModal = (tripId?: string) => {
    const targetTrip = tripId || unreconciledTrips[0]?.id || trips[0]?.id || '';
    setSelectedTripId(targetTrip);

    const relatedInvoices = invoices.filter((inv) => inv.tripId === targetTrip);
    const sumPaid = relatedInvoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
    setActualHandedOver(sumPaid);
    setAuthorizedExpenses(0);
    setNotes('');
    setShowAddModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTrip) return;

    await submitDriverReconciliation({
      tripId: selectedTrip.id,
      tripNumber: selectedTrip.tripNumber,
      driverId: selectedTrip.driverId,
      driverName: selectedTrip.driverName,
      totalInvoicedAmount: totalInvoiced,
      totalCashCollected: totalCollectedCash,
      actualCashHandedOver: Number(actualHandedOver),
      authorizedExpensesDeducted: Number(authorizedExpenses),
      differenceAmount: difference,
      notes,
    });

    setShowAddModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">تسوية عهدة السائق والمطابقة النقدية ({reconciliations.length})</h2>
          <p className="text-xs text-slate-500">
            مطابقة النقد المسلم من السائق بعد عودة الصهريج، خصم المصروفات المعتمدة، وتوثيق الفروقات
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2 bg-sky-700 text-white rounded-lg text-xs font-semibold hover:bg-sky-800 transition-colors self-start sm:self-auto shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>إجراء تسوية عهدة جديدة</span>
        </button>
      </div>

      {/* Unreconciled Trips Alert */}
      {unreconciledTrips.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-amber-800">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>
              يوجد <strong className="font-bold">{unreconciledTrips.length} رحلة</strong> اكتملت أو بانتظار تسوية العهدة النقدية مع السائق {truck.driverName}.
            </span>
          </div>
          <div className="flex gap-2">
            {unreconciledTrips.map((t) => (
              <button
                key={t.id}
                onClick={() => handleOpenModal(t.id)}
                className="px-3 py-1 bg-amber-600 text-white font-semibold rounded hover:bg-amber-700 font-mono text-[11px]"
              >
                تسوية {t.tripNumber}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Reconciliation Records Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">رقم التسوية</th>
                <th className="py-3 px-4">رقم الرحلة</th>
                <th className="py-3 px-4">السائق</th>
                <th className="py-3 px-4">إجمالي الفواتير</th>
                <th className="py-3 px-4">المسجل بالفواتير</th>
                <th className="py-3 px-4">النقد المسلم فعلياً</th>
                <th className="py-3 px-4">المصروفات المخصومة</th>
                <th className="py-3 px-4">الفارق (عجز/زيادة)</th>
                <th className="py-3 px-4">حالة المطابقة</th>
                <th className="py-3 px-4">التاريخ والاعتماد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reconciliations.map((rec) => {
                const isMatched = Math.abs(rec.differenceAmount) <= 50;

                return (
                  <tr key={rec.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-sky-800">{rec.reconciliationNumber}</td>
                    <td className="py-3 px-4 font-mono font-semibold text-slate-800">{rec.tripNumber}</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">{rec.driverName}</td>
                    <td className="py-3 px-4 font-mono">{rec.totalInvoicedAmount.toLocaleString()} ر.ي</td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-800">
                      {rec.totalCashCollected.toLocaleString()} ر.ي
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-emerald-700">
                      {rec.actualCashHandedOver.toLocaleString()} ر.ي
                    </td>
                    <td className="py-3 px-4 font-mono text-amber-700">
                      {rec.authorizedExpensesDeducted > 0 ? `${rec.authorizedExpensesDeducted.toLocaleString()} ر.ي` : '-'}
                    </td>
                    <td className="py-3 px-4 font-mono">
                      {rec.differenceAmount === 0 ? (
                        <span className="text-emerald-700 font-bold">0 (متطابق)</span>
                      ) : rec.differenceAmount > 0 ? (
                        <span className="text-blue-700 font-bold">+{rec.differenceAmount.toLocaleString()} (زيادة)</span>
                      ) : (
                        <span className="text-rose-700 font-bold">{rec.differenceAmount.toLocaleString()} (عجز)</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                        isMatched ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {isMatched ? 'مطابقة معتمدة' : 'يوجد فارق نقدي'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                      <div>{rec.date}</div>
                      <div className="text-[10px] text-slate-400">بواسطة: {rec.approvedBy}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Reconciliation Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-sky-700" />
                <h3 className="font-bold text-base text-slate-900">تسوية عهدة السائق لرحلة مأرب</h3>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">اختر الرحلة المطلوب تسويتها *</label>
                <select
                  value={selectedTripId}
                  onChange={(e) => {
                    setSelectedTripId(e.target.value);
                    const relInv = invoices.filter((inv) => inv.tripId === e.target.value);
                    const sPaid = relInv.reduce((sum, inv) => sum + inv.paidAmount, 0);
                    setActualHandedOver(sPaid);
                  }}
                  className="w-full p-2.5 border border-slate-200 rounded-lg bg-white font-mono"
                >
                  {trips.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.tripNumber} ({t.date}) - {t.deliveredLiters.toLocaleString()} لتر مسلّم
                    </option>
                  ))}
                </select>
              </div>

              {/* Trip Invoiced Summary */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">إجمالي قيمة فواتير الرحلة:</span>
                  <span className="font-mono font-bold">{totalInvoiced.toLocaleString()} ر.ي</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">المبلغ المسجل كتحصيل نقدي:</span>
                  <span className="font-mono font-bold text-sky-700">{totalCollectedCash.toLocaleString()} ر.ي</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  المبلغ النقدي المسلم فعلياً من السائق (ر.ي) *
                </label>
                <input
                  type="number"
                  required
                  value={actualHandedOver}
                  onChange={(e) => setActualHandedOver(Number(e.target.value))}
                  className="w-full p-2.5 border border-slate-200 rounded-lg font-mono text-sm font-bold text-emerald-800"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  مصروفات مبررة ومخصومة بإذن المدير (مثل ديزل طارئ أو بنشر)
                </label>
                <input
                  type="number"
                  value={authorizedExpenses}
                  onChange={(e) => setAuthorizedExpenses(Number(e.target.value))}
                  className="w-full p-2.5 border border-slate-200 rounded-lg font-mono text-amber-700"
                  placeholder="0"
                />
              </div>

              {/* Real-Time Discrepancy Indicator */}
              <div className={`p-3 rounded-lg border font-mono flex items-center justify-between text-xs font-bold ${
                difference === 0
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : difference > 0
                  ? 'bg-blue-50 text-blue-800 border-blue-200'
                  : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}>
                <span>الفارق الحسابي:</span>
                <span>
                  {difference === 0 ? '0 ر.ي (مطابقة تامة 100%)' : `${difference.toLocaleString()} ر.ي (${difference > 0 ? 'فائض نقدي' : 'عجز في العهدة'})`}
                </span>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">ملاحظات المحاسب والمدير</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="مثال: تمت المطابقة بالكامل وتم توريد المبلغ إلى خزينة المصنع"
                  className="w-full p-2.5 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-medium"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-700 text-white rounded-lg hover:bg-sky-800 font-semibold flex items-center gap-1.5"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>اعتماد وإغلاق التسوية</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
