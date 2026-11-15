/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - System Settings, Cost Parameters & Production Reset
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Settings,
  DollarSign,
  Fuel,
  Radio,
  MapPin,
  Save,
  Trash2,
  CheckCircle,
  AlertTriangle,
  Signal,
  KeyRound,
  ShieldCheck,
  Crosshair,
  Loader2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { LocationPickerMapModal } from '../common/LocationPickerMapModal';

export const SystemSettingsView: React.FC = () => {
  const { settings, customers, updateSettings, clearDemoData, setIsChangePinModalOpen } = useApp();

  const [form, setForm] = useState({ ...settings });
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isPlantMapOpen, setIsPlantMapOpen] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const saveLockRef = useRef(false);
  const clearLockRef = useRef(false);

  useEffect(() => {
    setForm({ ...settings });
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saveLockRef.current || isSaving) return;
    saveLockRef.current = true;
    setIsSaving(true);
    try {
      await updateSettings({
        waterProductionCostPerLiter: Number(form.waterProductionCostPerLiter),
        defaultSellingPricePerLiter: Number(form.defaultSellingPricePerLiter),
        dieselPricePerLiter: Number(form.dieselPricePerLiter),
        truckDieselConsumptionPerKm: Number(form.truckDieselConsumptionPerKm),
        maintenanceAllowancePerTrip: Number(form.maintenanceAllowancePerTrip),
        driverWagePerTrip: Number(form.driverWagePerTrip),
        stopDetectionMinutes: Number(form.stopDetectionMinutes),
        minMovementSpeedKmH: Number(form.minMovementSpeedKmH),
        stopRadiusMeters: Number(form.stopRadiusMeters),
        plantGeofenceMeters: Number(form.plantGeofenceMeters),
        gpsSampleIntervalSeconds: Number(form.gpsSampleIntervalSeconds),
        gpsWeakAccuracyMeters: Number(form.gpsWeakAccuracyMeters),
        gpsGapSeconds: Number(form.gpsGapSeconds),
        plantLocation: form.plantLocation,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } finally {
      saveLockRef.current = false;
      setIsSaving(false);
    }
  };

  const handleCapturePlantGps = () => {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const updatedPlant = {
          ...form.plantLocation,
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        };
        setForm((prev) => ({ ...prev, plantLocation: updatedPlant }));
        await updateSettings({ plantLocation: updatedPlant });
        setGpsLoading(false);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      },
      () => {
        setGpsLoading(false);
        setIsPlantMapOpen(true);
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-slate-900">إعدادات النظام، أسعار التكاليف ومعايير التتبع GPS</h2>
        <p className="text-xs text-slate-500">
          تعديل معايير التسعير وتكاليف إنتاج ونقل المياه، شروط اكتشاف التوقفات، ونطاق المصنع الجغرافي
        </p>
      </div>

      {saveSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <span>تم حفظ الإعدادات وتطبيقها على كافة الحسابات والرحلات بنجاح</span>
        </div>
      )}

      {/* Manager Passcode & Access Security */}
      <div className="bg-linear-to-r from-slate-900 to-sky-950 text-white rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-amber-300">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <span>أمان الدخول ورمز حماية لوحة تحكم المدير</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-400/20 text-amber-300 border border-amber-400/30">
                  محمي برمز مرور
                </span>
              </h3>
              <p className="text-[11px] text-slate-300 mt-0.5">
                الرمز الحالي المعتمد: <span className="font-mono tracking-widest text-white font-bold bg-white/10 px-2 py-0.5 rounded">••••••••</span> محفوظ ضمن إعدادات النظام (يمكن تغييره في أي وقت)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsChangePinModalOpen(true)}
            className="w-full sm:w-auto px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-lg text-xs transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer"
          >
            <KeyRound className="w-4 h-4 text-slate-950" />
            <span>تغيير رمز دخول المدير</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 text-xs">
        {/* Section 1: Financial & Pricing Parameters */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 text-sm pb-2 border-b border-slate-100 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-sky-700" />
            <span>معايير التسعير وتكاليف الإنتاج والنقل</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                سعر بيع لتر الماء للعملاء (ر.ي/لتر) *
              </label>
              <input
                type="number"
                step="0.5"
                value={form.defaultSellingPricePerLiter}
                onChange={(e) => setForm({ ...form, defaultSellingPricePerLiter: Number(e.target.value) })}
                className="w-full p-2.5 border border-slate-200 rounded-lg font-mono font-bold text-sky-800"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">مثال: 12 ر.ي/لتر (الطن = 12,000 ر.ي)</span>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                تكلفة إنتاج وتحلية اللتر بالمصنع (ر.ي/لتر) *
              </label>
              <input
                type="number"
                step="0.1"
                value={form.waterProductionCostPerLiter}
                onChange={(e) => setForm({ ...form, waterProductionCostPerLiter: Number(e.target.value) })}
                className="w-full p-2.5 border border-slate-200 rounded-lg font-mono font-bold text-slate-800"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">تشمل الأملاح والفلاتر وكهرباء المحطة</span>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                سعر لتر الديزل في مأرب (ر.ي/لتر) *
              </label>
              <input
                type="number"
                value={form.dieselPricePerLiter}
                onChange={(e) => setForm({ ...form, dieselPricePerLiter: Number(e.target.value) })}
                className="w-full p-2.5 border border-slate-200 rounded-lg font-mono font-bold text-amber-700"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">سعر الوقود المعتمد لدى المحطات</span>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                معدل استهلاك الوايت للديزل (لتر/كم) *
              </label>
              <input
                type="number"
                step="0.01"
                value={form.truckDieselConsumptionPerKm}
                onChange={(e) => setForm({ ...form, truckDieselConsumptionPerKm: Number(e.target.value) })}
                className="w-full p-2.5 border border-slate-200 rounded-lg font-mono"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">للوايت المحمّل 6,000L (~0.38 لتر/كم)</span>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                حصة أجر السائق لكل رحلة معتمدة (ر.ي) *
              </label>
              <input
                type="number"
                value={form.driverWagePerTrip}
                onChange={(e) => setForm({ ...form, driverWagePerTrip: Number(e.target.value) })}
                className="w-full p-2.5 border border-slate-200 rounded-lg font-mono text-emerald-700 font-bold"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">توزيع عادل للأجر حسب عدد الرحلات</span>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                مخصص صيانة الوايت لكل رحلة (ر.ي) *
              </label>
              <input
                type="number"
                value={form.maintenanceAllowancePerTrip}
                onChange={(e) => setForm({ ...form, maintenanceAllowancePerTrip: Number(e.target.value) })}
                className="w-full p-2.5 border border-slate-200 rounded-lg font-mono text-slate-700 font-bold"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">احتياطي إهلاك وتغيير زيوت وإطارات</span>
            </div>
          </div>
        </div>

        {/* Section 2: Automatic GPS & Stop Detection Settings */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 text-sm pb-2 border-b border-slate-100 flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-700" />
            <span>معايير التتبع التلقائي عبر GPS وشروط اكتشاف التوقفات</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                مدة التوقف لاعتباره توقفاً فعلياً (دقائق) *
              </label>
              <input
                type="number"
                min={1}
                value={form.stopDetectionMinutes}
                onChange={(e) => setForm({ ...form, stopDetectionMinutes: Number(e.target.value) })}
                className="w-full p-2.5 border border-slate-200 rounded-lg font-mono"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">لتمييز التوقف الفعلي عن إشارات المرور والازدحام المؤقت</span>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                حد سرعة السكون / التوقف (كم/ساعة) *
              </label>
              <input
                type="number"
                min={1}
                value={form.minMovementSpeedKmH}
                onChange={(e) => setForm({ ...form, minMovementSpeedKmH: Number(e.target.value) })}
                className="w-full p-2.5 border border-slate-200 rounded-lg font-mono"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">السرعة الأقل من هذا الحد تُعد توقفاً عن الحركة</span>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                نطاق ربط التوقف بموقع الزبون (متر) *
              </label>
              <input
                type="number"
                min={10}
                value={form.stopRadiusMeters}
                onChange={(e) => setForm({ ...form, stopRadiusMeters: Number(e.target.value) })}
                className="w-full p-2.5 border border-slate-200 rounded-lg font-mono text-sky-800 font-bold"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">يربط التوقف بأقرب زبون ضمن هذا النطاق</span>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                نطاق المصنع الجغرافي للعودة (متر) *
              </label>
              <input
                type="number"
                min={20}
                value={form.plantGeofenceMeters}
                onChange={(e) => setForm({ ...form, plantGeofenceMeters: Number(e.target.value) })}
                className="w-full p-2.5 border border-slate-200 rounded-lg font-mono text-emerald-700 font-bold"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">لاكتشاف عودة الوايت إلى المصنع تلقائياً</span>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                فاصل تسجيل نقاط GPS (ثانية) *
              </label>
              <input
                type="number"
                min={3}
                value={form.gpsSampleIntervalSeconds}
                onChange={(e) => setForm({ ...form, gpsSampleIntervalSeconds: Number(e.target.value) })}
                className="w-full p-2.5 border border-slate-200 rounded-lg font-mono"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">كل كم ثانية تُحفظ نقطة موقع أثناء الرحلة</span>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                حد دقة الإشارة الضعيفة (متر) / الفجوة (ثانية)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={15}
                  value={form.gpsWeakAccuracyMeters}
                  onChange={(e) => setForm({ ...form, gpsWeakAccuracyMeters: Number(e.target.value) })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg font-mono"
                  title="حد الدقة الضعيفة بالمتر"
                />
                <input
                  type="number"
                  min={30}
                  value={form.gpsGapSeconds}
                  onChange={(e) => setForm({ ...form, gpsGapSeconds: Number(e.target.value) })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg font-mono"
                  title="مدة الفجوة الزمنية بالثانية"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">لتنبيه المدير عند ضعف أو انقطاع إشارة GPS</span>
            </div>
          </div>
        </div>

        {/* Section 3: Plant Location (Dynamic & Editable via Map or GPS) */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <MapPin className="w-4 h-4 text-sky-700" />
                <span>موقع مصنع المياه المركزي (قابل للتعديل والتغيير)</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                تُحسب مسافات الرحلات، استهلاك الديزل، ومسار الوايت انطلاقاً من هذا الموقع
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCapturePlantGps}
                disabled={gpsLoading}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Crosshair className={`w-3.5 h-3.5 text-sky-700 ${gpsLoading ? 'animate-spin' : ''}`} />
                <span>{gpsLoading ? 'جاري الالتقاط...' : 'موقعي الحالي GPS'}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsPlantMapOpen(true)}
                className="px-3.5 py-1.5 bg-sky-700 hover:bg-sky-800 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>تحديد موقع المصنع على الخريطة</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">اسم المنشأة والمصنع</label>
              <input
                type="text"
                value={form.plantLocation.name}
                onChange={(e) => setForm({
                  ...form,
                  plantLocation: { ...form.plantLocation, name: e.target.value },
                })}
                className="w-full p-2.5 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1">المنطقة / العنوان</label>
              <input
                type="text"
                value={form.plantLocation.city}
                onChange={(e) => setForm({
                  ...form,
                  plantLocation: { ...form.plantLocation, city: e.target.value },
                })}
                className="w-full p-2.5 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1">خط العرض (Latitude)</label>
              <input
                type="number"
                step="0.000001"
                value={form.plantLocation.lat}
                onChange={(e) => setForm({
                  ...form,
                  plantLocation: { ...form.plantLocation, lat: parseFloat(e.target.value) || 0 },
                })}
                className="w-full p-2.5 border border-slate-200 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1">خط الطول (Longitude)</label>
              <input
                type="number"
                step="0.000001"
                value={form.plantLocation.lng}
                onChange={(e) => setForm({
                  ...form,
                  plantLocation: { ...form.plantLocation, lng: parseFloat(e.target.value) || 0 },
                })}
                className="w-full p-2.5 border border-slate-200 rounded-lg font-mono"
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="px-6 py-2.5 bg-sky-700 text-white rounded-lg text-xs font-bold hover:bg-sky-800 transition-colors shadow-sm flex items-center gap-2 disabled:opacity-60 cursor-pointer"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{isSaving ? 'جاري حفظ الإعدادات...' : 'حفظ وتطبيق كافة الإعدادات'}</span>
          </button>
        </div>
      </form>

      {/* Operational Database Reset */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 text-xs">
        <h3 className="font-bold text-slate-900 text-sm pb-2 border-b border-slate-100 flex items-center gap-2 text-rose-800">
          <AlertTriangle className="w-4 h-4" />
          <span>تصفير سجلات التشغيل وإعادة الضبط</span>
        </h3>

        <p className="text-slate-600 leading-relaxed">
          يتيح هذا الخيار مسح كافة السجلات التشغيلية الحالية (العملاء، الطلبات، الرحلات، الفواتير، والمصاريف) من الخادم وتطبيقات السائقين مع الإبقاء على إعدادات المصنع ورمز المدير وحسابات السائقين الحقيقية.
        </p>

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            onClick={() => setShowClearConfirm(true)}
            className="px-4 py-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg font-semibold hover:bg-rose-100 flex items-center gap-1.5 shadow-xs"
          >
            <Trash2 className="w-4 h-4" />
            <span>مسح وتصفير كافة السجلات (الخادم والسائقين)</span>
          </button>
        </div>
      </div>

      {/* Clear Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-xs space-y-4">
            <div className="w-12 h-12 bg-rose-100 text-rose-700 rounded-xl flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h4 className="font-bold text-base text-slate-900">هل أنت متأكد من تصفير السجلات؟</h4>
              <p className="text-slate-500 mt-1">
                سيتم حذف جميع العملاء والطلبات والفواتير وسجلات GPS في الخادم، وكذلك تصفير التخزين المحلي لدى السائقين مع الاحتفاظ بإعدادات المصنع وحسابات السائقين المعتمدة.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={isClearing}
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2 border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                تراجع
              </button>
              <button
                type="button"
                disabled={isClearing}
                onClick={async () => {
                  if (clearLockRef.current || isClearing) return;
                  clearLockRef.current = true;
                  setIsClearing(true);
                  try {
                    await clearDemoData();
                    setShowClearConfirm(false);
                  } finally {
                    clearLockRef.current = false;
                    setIsClearing(false);
                  }
                }}
                className="flex-1 py-2 bg-rose-600 text-white rounded-lg font-bold hover:bg-rose-700 flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
              >
                {isClearing && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{isClearing ? 'جاري التصفير...' : 'تأكيد التصفير'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Plant Location Picker Modal */}
      <LocationPickerMapModal
        isOpen={isPlantMapOpen}
        onClose={() => setIsPlantMapOpen(false)}
        mode="plant"
        customerName={form.plantLocation.name}
        initialLat={form.plantLocation.lat}
        initialLng={form.plantLocation.lng}
        initialDistrict={form.plantLocation.city}
        existingCustomers={customers}
        settings={settings}
        onSelectLocation={async ({ lat, lng }) => {
          const updatedPlant = {
            ...form.plantLocation,
            lat,
            lng,
          };
          setForm((prev) => ({ ...prev, plantLocation: updatedPlant }));
          await updateSettings({ plantLocation: updatedPlant });
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 3000);
        }}
      />
    </div>
  );
};
