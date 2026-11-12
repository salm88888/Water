/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Expenses, Fuel & Truck Maintenance Management
 */

import React, { useState } from 'react';
import {
  Fuel,
  Wrench,
  DollarSign,
  Plus,
  Calendar,
  FileText,
  AlertCircle,
  Truck,
  Droplet,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Expense } from '../../types';

export const ExpensesAndFuel: React.FC = () => {
  const { expenses, addExpense, settings, trips } = useApp();

  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    category: 'diesel' as Expense['category'],
    description: '',
    amount: 0,
    liters: 50,
    receiptNumber: '',
    tripNumber: '',
    date: new Date().toISOString().split('T')[0],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.description || formData.amount <= 0) return;

    await addExpense({
      ...formData,
      amount: Number(formData.amount),
      liters: formData.category === 'diesel' ? Number(formData.liters) : undefined,
    });
    setShowAddModal(false);
  };

  // Grouped totals
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const dieselExpenses = expenses.filter((e) => e.category === 'diesel').reduce((sum, e) => sum + e.amount, 0);
  const maintenanceExpenses = expenses.filter((e) => e.category === 'maintenance' || e.category === 'oil_change' || e.category === 'tires').reduce((sum, e) => sum + e.amount, 0);
  const treatmentExpenses = expenses.filter((e) => e.category === 'water_treatment').reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">إدارة المصروفات ومشتريات الديزل والصيانة ({expenses.length})</h2>
          <p className="text-xs text-slate-500">
            الفصل المحاسبي الدقيق بين تكلفة معالجة وإنتاج المياه وتكاليف النقل وتشغيل الوايت
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-sky-700 text-white rounded-lg text-xs font-semibold hover:bg-sky-800 transition-colors self-start sm:self-auto shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>تسجيل سند صرف جديد</span>
        </button>
      </div>

      {/* Accounting Separation Banner */}
      <div className="bg-sky-50/60 border border-sky-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-sky-600 text-white flex items-center justify-center shrink-0">
            <Droplet className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-slate-900 block">1. تكلفة إنتاج المياه (محطة التحلية)</span>
            <span className="text-slate-600">
              أملاح، فلاتر، كهرباء ومولد المصنع = <strong className="font-mono text-sky-800 font-bold">{settings.waterProductionCostPerLiter} ر.ي/لتر</strong>. لا تخلط مع تكاليف النقل.
            </span>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center shrink-0">
            <Truck className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-slate-900 block">2. تكلفة النقل والتوصيل (الوايت)</span>
            <span className="text-slate-600">
              ديزل ({settings.dieselPricePerLiter} ر.ي/لتر) + حصة أجر السائق للرحلة ({settings.driverWagePerTrip.toLocaleString()} ر.ي) + مخصص الصيانة ({settings.maintenanceAllowancePerTrip.toLocaleString()} ر.ي).
            </span>
          </div>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
          <span className="text-slate-500 block text-[11px]">إجمالي المصروفات المسجلة</span>
          <span className="font-bold font-mono text-slate-900 text-base">{totalExpenses.toLocaleString()} ر.ي</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
          <span className="text-slate-500 block text-[11px]">مشتريات وقود الديزل</span>
          <span className="font-bold font-mono text-amber-700 text-base">{dieselExpenses.toLocaleString()} ر.ي</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
          <span className="text-slate-500 block text-[11px]">الصيانة والزيوت والإطارات</span>
          <span className="font-bold font-mono text-slate-800 text-base">{maintenanceExpenses.toLocaleString()} ر.ي</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
          <span className="text-slate-500 block text-[11px]">فلاتر ومعالجة المياه</span>
          <span className="font-bold font-mono text-sky-700 text-base">{treatmentExpenses.toLocaleString()} ر.ي</span>
        </div>
      </div>

      {/* Expenses Ledger Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">رقم السند</th>
                <th className="py-3 px-4">التصنيف</th>
                <th className="py-3 px-4">البيان والتفاصيل</th>
                <th className="py-3 px-4">كمية الديزل</th>
                <th className="py-3 px-4">المبلغ</th>
                <th className="py-3 px-4">رقم السند الورقي</th>
                <th className="py-3 px-4">مرتبط برحلة</th>
                <th className="py-3 px-4">التاريخ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {expenses.map((exp) => (
                <tr key={exp.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-sky-800">{exp.expenseNumber}</td>
                  <td className="py-3 px-4">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${getCategoryBadge(exp.category)}`}>
                      {getCategoryArabic(exp.category)}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-900">{exp.description}</td>
                  <td className="py-3 px-4 font-mono text-amber-700">
                    {exp.liters ? `${exp.liters} لتر` : '-'}
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-slate-900">
                    {exp.amount.toLocaleString()} ر.ي
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-500">{exp.receiptNumber || '-'}</td>
                  <td className="py-3 px-4 font-mono text-sky-700">{exp.tripNumber || 'عام'}</td>
                  <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">{exp.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Expense Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="font-bold text-base text-slate-900">تسجيل سند صرف / مصروف جديد</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">تصنيف المصروف *</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg bg-white"
                >
                  <option value="diesel">شراء ديزل للوايت</option>
                  <option value="maintenance">صيانة الوايت وقطع غيار</option>
                  <option value="oil_change">تغيير زيوت وفلاتر المحرك</option>
                  <option value="tires">إطارات وبنشر</option>
                  <option value="driver_wage">أجور ومكافآت السائق</option>
                  <option value="water_treatment">فلاتر وأملاح تحلية المياه (إنتاج)</option>
                  <option value="other">مصروفات إدارية أخرى</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">البيان والتفاصيل *</label>
                <input
                  type="text"
                  required
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="مثال: تعبئة 50 لتر ديزل من محطة بن معيلي"
                  className="w-full p-2.5 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">المبلغ الإجمالي (ر.ي) *</label>
                  <input
                    type="number"
                    required
                    value={formData.amount || ''}
                    onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg font-mono font-bold"
                  />
                </div>
                {formData.category === 'diesel' && (
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">عدد لترات الديزل</label>
                    <input
                      type="number"
                      value={formData.liters || ''}
                      onChange={(e) => setFormData({ ...formData, liters: Number(e.target.value) })}
                      className="w-full p-2.5 border border-slate-200 rounded-lg font-mono text-amber-700"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">رقم الفاتورة الورقية / السند</label>
                  <input
                    type="text"
                    value={formData.receiptNumber}
                    onChange={(e) => setFormData({ ...formData, receiptNumber: e.target.value })}
                    placeholder="REC-xxx"
                    className="w-full p-2.5 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">ربط برقم الرحلة (اختياري)</label>
                  <select
                    value={formData.tripNumber}
                    onChange={(e) => setFormData({ ...formData, tripNumber: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg bg-white font-mono"
                  >
                    <option value="">بدون ربط (مصروف عام)</option>
                    {trips.map((t) => (
                      <option key={t.id} value={t.tripNumber}>{t.tripNumber}</option>
                    ))}
                  </select>
                </div>
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
                  className="px-5 py-2 bg-sky-700 text-white rounded-lg hover:bg-sky-800 font-semibold"
                >
                  حفظ السند
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

function getCategoryArabic(cat: Expense['category']): string {
  switch (cat) {
    case 'diesel': return 'شراء ديزل';
    case 'maintenance': return 'صيانة وقطع غيار';
    case 'oil_change': return 'تغيير زيوت';
    case 'tires': return 'إطارات وبنشر';
    case 'driver_wage': return 'أجور السائق';
    case 'water_treatment': return 'معالجة المياه';
    default: return 'مصروفات أخرى';
  }
}

function getCategoryBadge(cat: Expense['category']): string {
  switch (cat) {
    case 'diesel': return 'bg-amber-100 text-amber-800';
    case 'maintenance':
    case 'oil_change':
    case 'tires':
      return 'bg-slate-100 text-slate-800';
    case 'water_treatment':
      return 'bg-sky-100 text-sky-800';
    case 'driver_wage':
      return 'bg-emerald-100 text-emerald-800';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}
