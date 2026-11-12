/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Driver & Truck Assets Management
 * Manages Driver Info, Authorized Sabafon SIM Phone Number for GPS/SMS updates, and Truck Specs
 */

import React, { useState } from 'react';
import {
  UserCheck,
  Truck,
  Phone,
  Calendar,
  Fuel,
  Wrench,
  CheckCircle,
  Clock,
  Shield,
  MapPin,
  TrendingUp,
  Edit2,
  Save,
  X,
  Radio,
  AlertCircle,
  Smartphone,
  Signal,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const DriverAndTruckView: React.FC = () => {
  const { truck, trips, settings, updateSettings, updateTruck } = useApp();

  const [showEditDriverModal, setShowEditDriverModal] = useState(false);
  const [showEditTruckModal, setShowEditTruckModal] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Driver Edit Form
  const [driverForm, setDriverForm] = useState({
    driverName: truck.driverName,
    driverSabafonNumber: settings.driverSabafonNumber,
    sabafonCenterNumber: settings.sabafonCenterNumber,
    driverWagePerTrip: settings.driverWagePerTrip,
    driverLicense: 'عمومي - مأرب #84910',
  });

  // Truck Edit Form
  const [truckForm, setTruckForm] = useState({
    code: truck.code,
    plateNumber: truck.plateNumber,
    model: truck.model,
    maxCapacityLiters: truck.maxCapacityLiters,
    truckDieselConsumptionPerKm: settings.truckDieselConsumptionPerKm,
    maintenanceAllowancePerTrip: settings.maintenanceAllowancePerTrip,
    odometerKm: truck.odometerKm,
  });

  const completedTrips = trips.filter((t) => t.status === 'completed' || t.status === 'reconciled');
  const totalDriverWages = completedTrips.length * settings.driverWagePerTrip;
  const totalWaterDelivered = completedTrips.reduce((sum, t) => sum + t.deliveredLiters, 0);

  const handleSaveDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings({
      driverSabafonNumber: driverForm.driverSabafonNumber,
      sabafonCenterNumber: driverForm.sabafonCenterNumber,
      driverWagePerTrip: Number(driverForm.driverWagePerTrip),
    });
    await updateTruck({
      driverName: driverForm.driverName,
    });
    setShowEditDriverModal(false);
    setSuccessToast('تم حفظ وتحديث رقم شريحة السائق وبياناته المعتمدة بنجاح');
    setTimeout(() => setSuccessToast(null), 4000);
  };

  const handleSaveTruck = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateTruck({
      code: truckForm.code,
      plateNumber: truckForm.plateNumber,
      model: truckForm.model,
      maxCapacityLiters: Number(truckForm.maxCapacityLiters),
      odometerKm: Number(truckForm.odometerKm),
    });
    await updateSettings({
      truckDieselConsumptionPerKm: Number(truckForm.truckDieselConsumptionPerKm),
      maintenanceAllowancePerTrip: Number(truckForm.maintenanceAllowancePerTrip),
    });
    setShowEditTruckModal(false);
    setSuccessToast('تم حفظ وتحديث مواصفات وبيانات الوايت بنجاح');
    setTimeout(() => setSuccessToast(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">إدارة السائق وأصول الوايت (صهريج 6,000 لتر)</h2>
          <p className="text-xs text-slate-500">
            متابعة بيانات السائق، شريحة سبأفون المعتمدة لتحديثات الموقع GPS/SMS، الصيانة الدورية ومواصفات الوايت
          </p>
        </div>

        <button
          onClick={() => {
            setDriverForm({
              driverName: truck.driverName,
              driverSabafonNumber: settings.driverSabafonNumber,
              sabafonCenterNumber: settings.sabafonCenterNumber,
              driverWagePerTrip: settings.driverWagePerTrip,
              driverLicense: 'عمومي - مأرب #84910',
            });
            setShowEditDriverModal(true);
          }}
          className="flex items-center gap-1.5 px-4 py-2 bg-sky-700 hover:bg-sky-800 text-white rounded-lg text-xs font-bold transition-colors shadow-xs cursor-pointer self-start sm:self-auto"
        >
          <Phone className="w-4 h-4" />
          <span>تعديل رقم شريحة السائق</span>
        </button>
      </div>

      {successToast && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Security Info Banner */}
      <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-700 text-white flex items-center justify-center shrink-0">
            <Radio className="w-5 h-5 text-amber-300" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-900 text-sm">
                شريحة سبأفون المعتمدة لاستقبال تحديثات الموقع GPS:
              </span>
              <span className="font-mono font-bold text-sky-900 bg-white px-2 py-0.5 rounded border border-sky-300">
                {settings.driverSabafonNumber}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 mt-0.5">
              يقوم نظام مياهنا بالتحقق من هذا الرقم عند استقبال أي رسالة SMS ميدانية لتحديث الموقع أو الوصول والانطلاق، ويتم رفض الرسائل الواردة من أي رقم آخر تلقائياً.
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            setDriverForm({
              driverName: truck.driverName,
              driverSabafonNumber: settings.driverSabafonNumber,
              sabafonCenterNumber: settings.sabafonCenterNumber,
              driverWagePerTrip: settings.driverWagePerTrip,
              driverLicense: 'عمومي - مأرب #84910',
            });
            setShowEditDriverModal(true);
          }}
          className="px-3.5 py-1.5 bg-white border border-sky-300 text-sky-800 hover:bg-sky-100 font-bold rounded-lg text-xs transition-colors shrink-0 cursor-pointer"
        >
          تغيير الرقم ✏️
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Driver Profile */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 text-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-sky-700 text-white flex items-center justify-center font-bold text-base shadow-sm">
                MH
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">{truck.driverName}</h3>
                <p className="text-xs text-slate-500">سائق وايت المياه الرئيسي - مديرية مأرب</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setDriverForm({
                    driverName: truck.driverName,
                    driverSabafonNumber: settings.driverSabafonNumber,
                    sabafonCenterNumber: settings.sabafonCenterNumber,
                    driverWagePerTrip: settings.driverWagePerTrip,
                    driverLicense: 'عمومي - مأرب #84910',
                  });
                  setShowEditDriverModal(true);
                }}
                className="p-1.5 text-slate-500 hover:text-sky-700 hover:bg-sky-50 rounded-lg transition-colors cursor-pointer"
                title="تعديل بيانات السائق ورقم الهاتف"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <span className="bg-emerald-100 text-emerald-800 text-[11px] font-semibold px-2.5 py-1 rounded-full">
                على رأس العمل
              </span>
            </div>
          </div>

          <div className="space-y-2.5 text-slate-600">
            <div className="flex justify-between py-1 border-b border-slate-50 items-center">
              <span>رقم شريحة الاتصال سبأفون (GPS/SMS):</span>
              <span className="font-mono font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                {settings.driverSabafonNumber}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span>رقم مركز استقبال الرسائل بالمصنع:</span>
              <span className="font-mono text-slate-800">{settings.sabafonCenterNumber}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span>رقم رخصة القيادة:</span>
              <span className="font-mono text-slate-800">عمومي - مأرب #84910</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span>عدد الرحلات المنجزة:</span>
              <span className="font-mono font-bold text-sky-700">{completedTrips.length} رحلات</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span>كمية المياه الموزعة بالكامل:</span>
              <span className="font-mono font-bold text-emerald-700">{totalWaterDelivered.toLocaleString()} لتر</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span>حصة الأجر المتراكمة المعتمدة:</span>
              <span className="font-mono font-bold text-slate-900">{totalDriverWages.toLocaleString()} ر.ي</span>
            </div>
            <div className="flex justify-between py-1">
              <span>أجر الرحلة الواحدة المعتمد:</span>
              <span className="font-mono font-bold text-sky-800">{settings.driverWagePerTrip.toLocaleString()} ر.ي/رحلة</span>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => {
                setDriverForm({
                  driverName: truck.driverName,
                  driverSabafonNumber: settings.driverSabafonNumber,
                  sabafonCenterNumber: settings.sabafonCenterNumber,
                  driverWagePerTrip: settings.driverWagePerTrip,
                  driverLicense: 'عمومي - مأرب #84910',
                });
                setShowEditDriverModal(true);
              }}
              className="w-full py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg font-bold text-slate-700 text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5 text-sky-700" />
              <span>تعديل رقم هاتف السائق والبيانات</span>
            </button>
          </div>
        </div>

        {/* Card 2: Truck Specs & Condition */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 text-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-amber-600 text-white flex items-center justify-center font-bold text-base shadow-sm">
                <Truck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">{truck.code} ({truck.plateNumber})</h3>
                <p className="text-xs text-slate-500">{truck.model}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setTruckForm({
                    code: truck.code,
                    plateNumber: truck.plateNumber,
                    model: truck.model,
                    maxCapacityLiters: truck.maxCapacityLiters,
                    truckDieselConsumptionPerKm: settings.truckDieselConsumptionPerKm,
                    maintenanceAllowancePerTrip: settings.maintenanceAllowancePerTrip,
                    odometerKm: truck.odometerKm,
                  });
                  setShowEditTruckModal(true);
                }}
                className="p-1.5 text-slate-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                title="تعديل مواصفات الوايت"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                truck.status === 'on_trip'
                  ? 'bg-sky-100 text-sky-800'
                  : 'bg-emerald-100 text-emerald-800'
              }`}>
                {truck.status === 'on_trip' ? 'في رحلة توصيل' : 'جاهز للعمل'}
              </span>
            </div>
          </div>

          <div className="space-y-2.5 text-slate-600">
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span>السعة الإجمالية للصهريج:</span>
              <span className="font-mono font-bold text-sky-800 text-sm">{truck.maxCapacityLiters.toLocaleString()} لتر</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span>كمية المياه الحالية بالصهريج:</span>
              <span className="font-mono font-bold text-emerald-700">{truck.currentWaterLiters.toLocaleString()} لتر</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span>نوع الوقود:</span>
              <span className="font-bold text-amber-700">ديزل</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span>معدل الاستهلاك المعتمد:</span>
              <span className="font-mono text-slate-800">{settings.truckDieselConsumptionPerKm} لتر/كم</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span>عداد المسافات الكلي:</span>
              <span className="font-mono font-bold text-slate-900">{truck.odometerKm.toLocaleString()} كم</span>
            </div>
            <div className="flex justify-between py-1">
              <span>مخصص الصيانة لكل رحلة:</span>
              <span className="font-mono font-bold text-slate-800">{settings.maintenanceAllowancePerTrip.toLocaleString()} ر.ي</span>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => {
                setTruckForm({
                  code: truck.code,
                  plateNumber: truck.plateNumber,
                  model: truck.model,
                  maxCapacityLiters: truck.maxCapacityLiters,
                  truckDieselConsumptionPerKm: settings.truckDieselConsumptionPerKm,
                  maintenanceAllowancePerTrip: settings.maintenanceAllowancePerTrip,
                  odometerKm: truck.odometerKm,
                });
                setShowEditTruckModal(true);
              }}
              className="w-full py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg font-bold text-slate-700 text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5 text-amber-700" />
              <span>تعديل مواصفات ورقم لوحة الوايت</span>
            </button>
          </div>
        </div>
      </div>

      {/* Edit Driver & Sabafon Phone Modal */}
      {showEditDriverModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 text-xs space-y-4 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-800 flex items-center justify-center">
                  <Phone className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">تعديل بيانات السائق وشريحة هاتف سبأفون</h4>
                  <p className="text-[11px] text-slate-500">تحديد رقم الهاتف المعتمد لاستقبال رسائل GPS التلقائية</p>
                </div>
              </div>
              <button
                onClick={() => setShowEditDriverModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDriver} className="space-y-4">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">اسم السائق الثلاثي *</label>
                <input
                  type="text"
                  required
                  value={driverForm.driverName}
                  onChange={(e) => setDriverForm({ ...driverForm, driverName: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-slate-900"
                  placeholder="مثال: منصور صالح الحارثي"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1 flex items-center justify-between">
                  <span>رقم شريحة هاتف السائق (سبأفون) *</span>
                  <span className="text-[10px] text-sky-700 font-mono">الرقم المعتمد للـ GPS</span>
                </label>
                <input
                  type="text"
                  required
                  value={driverForm.driverSabafonNumber}
                  onChange={(e) => setDriverForm({ ...driverForm, driverSabafonNumber: e.target.value })}
                  className="w-full p-2.5 border border-sky-300 bg-sky-50/50 rounded-lg font-mono font-bold text-sky-900 text-sm focus:ring-2 focus:ring-sky-500/20"
                  placeholder="716755394 أو +967716755394"
                />
                <div className="mt-1.5 p-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 space-y-1">
                  <div className="font-bold flex items-center gap-1">
                    <Shield className="w-3.5 h-3.5 text-amber-600" />
                    <span>ملاحظة أمان هامة لمنع الرسائل الوهمية:</span>
                  </div>
                  <p>
                    هذا هو رقم الشريحة الوحيد الذي سيعتمده النظام لاستقبال وتحديث إحداثيات الوايت ورسائل الوصول والانطلاق عبر SMS. سيتم رفض أي رسالة تصل من رقم آخر تلقائياً.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">رقم مركز استقبال الرسائل بالمصنع (المدير)</label>
                <input
                  type="text"
                  value={driverForm.sabafonCenterNumber}
                  onChange={(e) => setDriverForm({ ...driverForm, sabafonCenterNumber: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg font-mono text-slate-800"
                  placeholder="718841063"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">رقم رخصة القيادة</label>
                  <input
                    type="text"
                    value={driverForm.driverLicense}
                    onChange={(e) => setDriverForm({ ...driverForm, driverLicense: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">أجر السائق لكل رحلة (ر.ي) *</label>
                  <input
                    type="number"
                    required
                    value={driverForm.driverWagePerTrip}
                    onChange={(e) => setDriverForm({ ...driverForm, driverWagePerTrip: Number(e.target.value) })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg font-mono font-bold text-emerald-700"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEditDriverModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-700 hover:bg-sky-800 text-white font-bold rounded-lg flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>حفظ وتطبيق الرقم المعتمد</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Truck Specs Modal */}
      {showEditTruckModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 text-xs space-y-4 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">تعديل مواصفات وبيانات الوايت</h4>
                  <p className="text-[11px] text-slate-500">صهريج توزيع المياه بمديرية مأرب</p>
                </div>
              </div>
              <button
                onClick={() => setShowEditTruckModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTruck} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">رمز الوايت *</label>
                  <input
                    type="text"
                    required
                    value={truckForm.code}
                    onChange={(e) => setTruckForm({ ...truckForm, code: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg font-mono text-slate-900"
                    placeholder="TRUCK-01"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">رقم لوحة الوايت *</label>
                  <input
                    type="text"
                    required
                    value={truckForm.plateNumber}
                    onChange={(e) => setTruckForm({ ...truckForm, plateNumber: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-slate-900 font-semibold"
                    placeholder="مأرب 14820 نقل"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">موديل ونوع الصهريج *</label>
                <input
                  type="text"
                  required
                  value={truckForm.model}
                  onChange={(e) => setTruckForm({ ...truckForm, model: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-slate-900"
                  placeholder="مرسيدس وايت 6000L"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">السعة القصوى للصهريج (لتر) *</label>
                  <input
                    type="number"
                    required
                    value={truckForm.maxCapacityLiters}
                    onChange={(e) => setTruckForm({ ...truckForm, maxCapacityLiters: Number(e.target.value) })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg font-mono font-bold text-sky-800"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">عداد المسافات الحالي (كم)</label>
                  <input
                    type="number"
                    value={truckForm.odometerKm}
                    onChange={(e) => setTruckForm({ ...truckForm, odometerKm: Number(e.target.value) })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">معدل استهلاك الديزل (لتر/كم)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={truckForm.truckDieselConsumptionPerKm}
                    onChange={(e) => setTruckForm({ ...truckForm, truckDieselConsumptionPerKm: Number(e.target.value) })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">مخصص الصيانة لكل رحلة (ر.ي)</label>
                  <input
                    type="number"
                    value={truckForm.maintenanceAllowancePerTrip}
                    onChange={(e) => setTruckForm({ ...truckForm, maintenanceAllowancePerTrip: Number(e.target.value) })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEditTruckModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>حفظ تعديلات الوايت</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
