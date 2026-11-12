/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - New Water Order Modal with Tank Auto-fill & Duplicate Detection
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Droplet,
  AlertTriangle,
  CheckCircle,
  Phone,
  MapPin,
  Clock,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { OrderSource } from '../../types';

interface NewOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewOrderModal: React.FC<NewOrderModalProps> = ({ isOpen, onClose }) => {
  const { customers, settings, addOrder } = useApp();

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(customers[0]?.id || '');
  const [customerName, setCustomerName] = useState(customers[0]?.name || '');
  const [phone, setPhone] = useState(customers[0]?.phone || '');
  const [district, setDistrict] = useState(customers[0]?.district || 'حي الروضة');
  const [addressDetails, setAddressDetails] = useState(customers[0]?.addressDetails || '');
  const [tankCapacity, setTankCapacity] = useState<number>(customers[0]?.tankCapacityLiters || 2000);
  const [tankRemaining, setTankRemaining] = useState<number>(0);
  const [requestedLiters, setRequestedLiters] = useState<number>(customers[0]?.tankCapacityLiters || 2000);
  const [pricePerLiter, setPricePerLiter] = useState<number>(settings.defaultSellingPricePerLiter);
  const [source, setSource] = useState<OrderSource>('phone');
  const [isUrgent, setIsUrgent] = useState(false);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const first = customers.find((cust) => cust.id === selectedCustomerId) || customers[0];
      if (first) {
        setSelectedCustomerId(first.id);
        setCustomerName(first.name);
        setPhone(first.phone);
        setDistrict(first.district);
        setAddressDetails(first.addressDetails);
        setTankCapacity(first.tankCapacityLiters);
        setTankRemaining(0);
        setRequestedLiters(first.tankCapacityLiters);
      } else {
        setTankRemaining(0);
        setRequestedLiters(tankCapacity);
      }
      setPricePerLiter(settings.defaultSellingPricePerLiter);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCustomerChange = (custId: string) => {
    setSelectedCustomerId(custId);
    const c = customers.find((cust) => cust.id === custId);
    if (c) {
      setCustomerName(c.name);
      setPhone(c.phone);
      setDistrict(c.district);
      setAddressDetails(c.addressDetails);
      setTankCapacity(c.tankCapacityLiters);
      // Always assume customer tank is empty (0 liters)
      setTankRemaining(0);
      setRequestedLiters(c.tankCapacityLiters);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !phone || requestedLiters <= 0) return;

    setIsSubmitting(true);
    setDuplicateWarning(null);

    try {
      const selectedCust = customers.find((c) => c.id === selectedCustomerId);
      const res = await addOrder({
        customerId: selectedCustomerId,
        customerName,
        phone,
        district,
        addressDetails,
        lat: selectedCust?.lat || settings.plantLocation.lat + 0.005,
        lng: selectedCust?.lng || settings.plantLocation.lng + 0.005,
        tankCapacity,
        tankRemainingLiters: tankRemaining,
        requestedLiters,
        pricePerLiter,
        totalAmount: requestedLiters * pricePerLiter,
        source,
        isUrgent,
        notes,
      });

      if (res.duplicateWarning) {
        setDuplicateWarning('تنبيه: تم تسجيل الطلب مع وجود تنبيه باحتمال تكرار طلب سابق لنفس العميل!');
        setTimeout(() => onClose(), 2500);
      } else {
        onClose();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalAmount = requestedLiters * pricePerLiter;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
              <Droplet className="w-4 h-4 fill-sky-700" />
            </div>
            <h3 className="font-bold text-base text-slate-900">تسجيل طلب تعبئة مياه صهريج جديد</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {duplicateWarning && (
          <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs font-semibold flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{duplicateWarning}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Pick Existing Customer */}
          <div>
            <label className="block text-slate-700 font-semibold mb-1">
              اختر عميل مسجل (أو عدل البيانات يدوياً)
            </label>
            <select
              value={selectedCustomerId}
              onChange={(e) => handleCustomerChange(e.target.value)}
              className="w-full p-2.5 border border-slate-200 rounded-lg bg-white"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} - {c.district} ({c.phone}) - خزان {c.tankCapacityLiters}L
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">اسم العميل *</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1">هاتف العميل (سبأفون) *</label>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-lg font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">الحي بمأرب</label>
              <input
                type="text"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1">مصدر ورود الطلب</label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as OrderSource)}
                className="w-full p-2.5 border border-slate-200 rounded-lg bg-white"
              >
                <option value="phone">اتصال هاتفي</option>
                <option value="whatsapp">واتساب</option>
                <option value="sms">رسالة SMS</option>
                <option value="manager_manual">إدخال يدوي من المدير</option>
                <option value="driver_manual">إدخال السائق</option>
              </select>
            </div>
          </div>

          {/* Tank Capacity Rules Check */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-800">قواعد سعة الخزان (يفترض أن الخزان فارغ 0 لتر):</span>
              <span className="text-[11px] text-sky-700 font-mono">سعة الخزان: {tankCapacity.toLocaleString()}L</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 text-[11px] mb-1">الماء المتبقي بالخزان (لتر)</label>
                <input
                  type="number"
                  min={0}
                  max={tankCapacity}
                  value={tankRemaining}
                  onChange={(e) => {
                    const rem = Math.max(0, Number(e.target.value) || 0);
                    setTankRemaining(rem);
                    setRequestedLiters(Math.max(0, tankCapacity - rem));
                  }}
                  className="w-full p-2 border border-slate-200 rounded-lg font-mono text-center bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-600 text-[11px] mb-1 font-bold text-sky-800">
                  الكمية المطلوبة للشراء (لتر) *
                </label>
                <input
                  type="number"
                  required
                  value={requestedLiters}
                  onChange={(e) => setRequestedLiters(Number(e.target.value))}
                  className="w-full p-2 border border-slate-200 rounded-lg font-mono font-bold text-sky-800 text-center bg-white"
                />
              </div>
            </div>

            <div className="text-[10px] text-slate-500 leading-normal">
              يفترض النظام دائماً أن خزان الزبون فارغ (0 لتر)، لذا الكمية المقترحة للتعبئة الكاملة = {(tankCapacity - tankRemaining).toLocaleString()} لتر.
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">سعر اللتر (ر.ي/لتر)</label>
              <input
                type="number"
                value={pricePerLiter}
                onChange={(e) => setPricePerLiter(Number(e.target.value))}
                className="w-full p-2.5 border border-slate-200 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1">إجمالي قيمة الفاتورة</label>
              <div className="p-2.5 bg-slate-100 rounded-lg font-mono font-bold text-emerald-800 text-sm">
                {totalAmount.toLocaleString()} ر.ي
              </div>
            </div>
          </div>

          {/* Urgent Checkbox */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="urgentCheck"
              checked={isUrgent}
              onChange={(e) => setIsUrgent(e.target.checked)}
              className="w-4 h-4 text-rose-600 rounded"
            />
            <label htmlFor="urgentCheck" className="text-slate-800 font-bold select-none cursor-pointer">
              طلب عاجل واستثنائي (يمنح أولوية قصوى في خوارزمية التجميع)
            </label>
          </div>

          <div>
            <label className="block text-slate-700 font-semibold mb-1">ملاحظات إضافية</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: يفضل التوصيل قبل صلاة العصر"
              className="w-full p-2.5 border border-slate-200 rounded-lg"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-medium"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-sky-700 text-white rounded-lg hover:bg-sky-800 font-semibold shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? 'جاري الحفظ...' : 'تسجيل وإرسال للتجميع'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
