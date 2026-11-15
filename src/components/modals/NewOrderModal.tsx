/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - New Water Order Modal with Tank Auto-fill & Duplicate Detection
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Droplet,
  AlertTriangle,
  CheckCircle,
  Phone,
  MapPin,
  Clock,
  Sparkles,
  Loader2,
  UserPlus,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { OrderSource } from '../../types';
import { DistrictSelectField } from '../common/DistrictSelectField';

interface NewOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewOrderModal: React.FC<NewOrderModalProps> = ({ isOpen, onClose }) => {
  const { customers, allDistricts, settings, addOrder } = useApp();

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(customers[0]?.id || '__new__');
  const [customerName, setCustomerName] = useState(customers[0]?.name || '');
  const [phone, setPhone] = useState(customers[0]?.phone || '');
  const [district, setDistrict] = useState(customers[0]?.district || '');
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
  const submitLockRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      const first = customers[0];
      if (first) {
        setSelectedCustomerId(first.id);
        setCustomerName(first.name);
        setPhone(first.phone);
        setDistrict(first.district || '');
        setAddressDetails(first.addressDetails);
        setTankCapacity(first.tankCapacityLiters);
        setTankRemaining(0);
        setRequestedLiters(first.tankCapacityLiters);
      } else {
        setSelectedCustomerId('__new__');
        setCustomerName('');
        setPhone('');
        setDistrict('');
        setAddressDetails('');
        setTankCapacity(2000);
        setTankRemaining(0);
        setRequestedLiters(2000);
      }
      setDuplicateWarning(null);
      setPricePerLiter(settings.defaultSellingPricePerLiter);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCustomerChange = (custId: string) => {
    setSelectedCustomerId(custId);
    if (custId === '__new__') {
      setCustomerName('');
      setPhone('');
      setDistrict('');
      setAddressDetails('');
      setTankCapacity(2000);
      setTankRemaining(0);
      setRequestedLiters(2000);
      return;
    }
    const c = customers.find((cust) => cust.id === custId);
    if (c) {
      setCustomerName(c.name);
      setPhone(c.phone);
      setDistrict(c.district || '');
      setAddressDetails(c.addressDetails);
      setTankCapacity(c.tankCapacityLiters);
      setTankRemaining(0);
      setRequestedLiters(c.tankCapacityLiters);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLockRef.current || isSubmitting) return;
    if (!customerName.trim() || !phone.trim() || requestedLiters <= 0 || !district.trim()) return;

    submitLockRef.current = true;
    setIsSubmitting(true);
    setDuplicateWarning(null);

    try {
      const selectedCust =
        selectedCustomerId && selectedCustomerId !== '__new__'
          ? customers.find((c) => c.id === selectedCustomerId)
          : undefined;

      const res = await addOrder({
        customerId: selectedCust?.id,
        customerName: customerName.trim(),
        phone: phone.trim(),
        district: district.trim(),
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
        setTimeout(() => onClose(), 2200);
      } else {
        onClose();
      }
    } catch (err) {
      console.error(err);
    } finally {
      submitLockRef.current = false;
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
          {/* Pick Existing Customer or Auto-Create New */}
          <div>
            <label className="block text-slate-700 font-semibold mb-1">
              اختر عميل مسجل (أو أنشئ عميلاً جديداً يُحفظ تلقائياً في قاعدة العملاء)
            </label>
            <select
              disabled={isSubmitting}
              value={selectedCustomerId}
              onChange={(e) => handleCustomerChange(e.target.value)}
              className="w-full p-2.5 border border-slate-200 rounded-lg bg-white disabled:opacity-60"
            >
              <option value="__new__">+ عميل جديد (سيتم حفظه تلقائياً في قاعدة بيانات العملاء)</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} - {c.district} ({c.phone}) - خزان {c.tankCapacityLiters}L
                </option>
              ))}
            </select>
            {selectedCustomerId === '__new__' && (
              <p className="text-[11px] text-emerald-700 mt-1 flex items-center gap-1 font-medium">
                <UserPlus className="w-3.5 h-3.5 shrink-0" />
                <span>سيتم حفظ بيانات هذا العميل تلقائياً في قاعدة العملاء عند إرسال الطلب.</span>
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">اسم العميل *</label>
              <input
                type="text"
                required
                disabled={isSubmitting}
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  if (selectedCustomerId !== '__new__') {
                    setSelectedCustomerId('__new__');
                  }
                }}
                placeholder="مثال: أحمد محمد مبخوت"
                className="w-full p-2.5 border border-slate-200 rounded-lg disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1">هاتف العميل *</label>
              <input
                type="text"
                required
                disabled={isSubmitting}
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (selectedCustomerId !== '__new__') {
                    setSelectedCustomerId('__new__');
                  }
                }}
                placeholder="71xxxxxxx"
                className="w-full p-2.5 border border-slate-200 rounded-lg font-mono disabled:opacity-60"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DistrictSelectField
              value={district}
              onChange={setDistrict}
              districts={allDistricts}
              label="المنطقة / الحي (مديرية الوادي - مأرب)"
              theme="light"
              disabled={isSubmitting}
            />
            <div>
              <label className="block text-slate-700 font-semibold mb-1">مصدر ورود الطلب</label>
              <select
                disabled={isSubmitting}
                value={source}
                onChange={(e) => setSource(e.target.value as OrderSource)}
                className="w-full p-2.5 border border-slate-200 rounded-lg bg-white disabled:opacity-60"
              >
                <option value="phone">اتصال هاتفي</option>
                <option value="whatsapp">واتساب</option>
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
              disabled={isSubmitting}
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-medium disabled:opacity-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-sky-700 text-white rounded-lg hover:bg-sky-800 font-semibold shadow-sm disabled:opacity-60 flex items-center gap-2 cursor-pointer"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{isSubmitting ? 'جاري إرسال الطلب...' : 'تسجيل وإرسال للتجميع'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
