/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Driver Accounts (Manager-Approved + Passwords) & Truck Assets Management
 */

import React, { useMemo, useState } from 'react';
import {
  Truck,
  Phone,
  CheckCircle,
  Edit2,
  Save,
  X,
  Navigation,
  UserPlus,
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  Eye,
  EyeOff,
  Trash2,
  Ban,
  CheckCircle2,
  XCircle,
  Users,
  Clock,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { DriverAccount } from '../../types';

function getAccountBadge(status: DriverAccount['status']) {
  switch (status) {
    case 'approved':
      return { label: 'حساب معتمد', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    case 'pending':
      return { label: 'بانتظار اعتماد المدير', cls: 'bg-amber-100 text-amber-800 border-amber-200' };
    case 'suspended':
      return { label: 'موقوف مؤقتاً', cls: 'bg-slate-200 text-slate-700 border-slate-300' };
    case 'rejected':
      return { label: 'مرفوض', cls: 'bg-rose-100 text-rose-800 border-rose-200' };
  }
}

export const DriverAndTruckView: React.FC = () => {
  const {
    truck,
    trips,
    settings,
    driverAccounts,
    updateSettings,
    updateTruck,
    createDriverAccount,
    approveDriverAccount,
    rejectDriverAccount,
    toggleSuspendDriverAccount,
    updateDriverAccount,
    assignDriverToTruck,
    deleteDriverAccount,
  } = useApp();

  const [showEditDriverModal, setShowEditDriverModal] = useState(false);
  const [showEditTruckModal, setShowEditTruckModal] = useState(false);
  const [showCreateAccountModal, setShowCreateAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<DriverAccount | null>(null);
  const [rejectingAccount, setRejectingAccount] = useState<DriverAccount | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [newAccountForm, setNewAccountForm] = useState({
    name: '',
    phone: '',
    username: '',
    licenseNumber: '',
    password: '',
    assignToTruck: true,
  });

  const [editAccountForm, setEditAccountForm] = useState({
    name: '',
    phone: '',
    username: '',
    licenseNumber: '',
    password: '',
  });

  const [driverForm, setDriverForm] = useState({
    driverName: truck.driverName,
    driverPhone: truck.driverPhone || '',
    driverWagePerTrip: settings.driverWagePerTrip,
    driverLicense: '',
  });

  const [truckForm, setTruckForm] = useState({
    code: truck.code,
    plateNumber: truck.plateNumber,
    model: truck.model,
    maxCapacityLiters: truck.maxCapacityLiters,
    truckDieselConsumptionPerKm: settings.truckDieselConsumptionPerKm,
    maintenanceAllowancePerTrip: settings.maintenanceAllowancePerTrip,
    odometerKm: truck.odometerKm,
  });

  const pendingAccounts = useMemo(
    () => driverAccounts.filter((d) => d.status === 'pending'),
    [driverAccounts]
  );

  const completedTrips = trips.filter(
    (t) => t.status === 'completed_pending_review' || t.status === 'closed' || t.status === 'synced'
  );
  const totalDriverWages = completedTrips.length * settings.driverWagePerTrip;
  const totalWaterDelivered = completedTrips.reduce((sum, t) => sum + t.deliveredLiters, 0);

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const res = await createDriverAccount(newAccountForm);
    if (!res.success) {
      setFormError(res.error || 'تعذر إنشاء الحساب');
      return;
    }
    setShowCreateAccountModal(false);
    setNewAccountForm({ name: '', phone: '', username: '', licenseNumber: '', password: '', assignToTruck: true });
    showToast('تم إنشاء حساب السائق واعتماده بكلمة مرور بنجاح');
  };

  const handleSaveEditAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;
    setFormError(null);
    const res = await updateDriverAccount(editingAccount.id, editAccountForm);
    if (!res.success) {
      setFormError(res.error || 'تعذر تحديث الحساب');
      return;
    }
    setEditingAccount(null);
    showToast('تم تحديث بيانات وكلمة مرور السائق بنجاح');
  };

  const handleSaveDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings({
      driverWagePerTrip: Number(driverForm.driverWagePerTrip),
    });
    await updateTruck({
      driverName: driverForm.driverName,
      driverPhone: driverForm.driverPhone,
    });
    setShowEditDriverModal(false);
    showToast('تم حفظ وتحديث بيانات السائق وهاتف التواصل بنجاح');
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
    showToast('تم حفظ وتحديث مواصفات وبيانات الوايت بنجاح');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            إدارة حسابات السائقين والوايت ({truck.maxCapacityLiters.toLocaleString()} لتر)
          </h2>
          <p className="text-xs text-slate-500">
            اعتماد حسابات السائقين وكلمات المرور، إدارة صلاحيات الدخول، ومواصفات صهريج المياه واستهلاك الديزل
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => {
              setFormError(null);
              setShowCreateAccountModal(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-colors shadow-xs cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>إضافة حساب سائق معتمد</span>
          </button>

          <button
            onClick={() => {
              setDriverForm({
                driverName: truck.driverName,
                driverPhone: truck.driverPhone || '',
                driverWagePerTrip: settings.driverWagePerTrip,
                driverLicense: '',
              });
              setShowEditDriverModal(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-sky-700 hover:bg-sky-800 text-white rounded-lg text-xs font-bold transition-colors shadow-xs cursor-pointer"
          >
            <Phone className="w-4 h-4" />
            <span>تعديل السائق الحالي</span>
          </button>
        </div>
      </div>

      {successToast && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Pending Driver Account Approvals Banner */}
      {pendingAccounts.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-amber-900 text-sm">
              <Clock className="w-5 h-5 text-amber-600" />
              <span>طلبات حسابات سائقين بانتظار اعتمادك ({pendingAccounts.length})</span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-amber-200 text-amber-900 font-bold text-[11px]">
              مطلوب مراجعة المدير
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pendingAccounts.map((acc) => (
              <div
                key={acc.id}
                className="bg-white border border-amber-200 rounded-xl p-3.5 flex flex-col justify-between gap-3 shadow-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-sm">{acc.name}</span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {new Date(acc.createdAt).toLocaleDateString('ar-YE')}
                    </span>
                  </div>
                  <div className="text-slate-600 flex flex-wrap gap-3 text-[11px]">
                    <span>الهاتف: <strong className="font-mono text-slate-900">{acc.phone}</strong></span>
                    <span>اسم الدخول: <strong className="font-mono text-sky-800">{acc.username}</strong></span>
                  </div>
                  {acc.licenseNumber && (
                    <div className="text-[11px] text-slate-500">الرخصة: {acc.licenseNumber}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      await approveDriverAccount(acc.id);
                      showToast(`تم اعتماد حساب السائق ${acc.name} وتفعيل دخوله`);
                    }}
                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>اعتماد الحساب</span>
                  </button>
                  <button
                    onClick={() => {
                      setRejectingAccount(acc);
                      setRejectReason('');
                    }}
                    className="px-3 py-2 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg font-bold flex items-center gap-1"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>رفض</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Driver Accounts Table / Cards */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden text-xs">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-sky-700" />
            <h3 className="font-bold text-sm text-slate-900">
              سجل حسابات السائقين وكلمات المرور ({driverAccounts.length})
            </h3>
          </div>
          <span className="text-[11px] text-slate-500">
            لا يمكن لأي سائق الدخول إلى التطبيق إلا بعد اعتماد حسابه من هنا وإدخال كلمة المرور الصحيحة
          </span>
        </div>

        {driverAccounts.length === 0 ? (
          <div className="p-8 text-center text-slate-500 space-y-3">
            <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto" />
            <p className="font-bold text-slate-700">لا توجد حسابات سائقين مسجلة حالياً</p>
            <p className="text-[11px]">
              أضف حساب سائق معتمد بكلمة مرور ليتمكن السائق من تسجيل الدخول وتشغيل التطبيق الميداني.
            </p>
            <button
              onClick={() => {
                setFormError(null);
                setShowCreateAccountModal(true);
              }}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold inline-flex items-center gap-1.5"
            >
              <UserPlus className="w-4 h-4" />
              <span>إنشاء حساب سائق الآن</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {driverAccounts.map((acc) => {
              const badge = getAccountBadge(acc.status);
              const isAssigned = truck.driverId === acc.id;
              const isPwVisible = Boolean(visiblePasswords[acc.id]);
              return (
                <div
                  key={acc.id}
                  className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:bg-slate-50/60 transition-colors"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">{acc.name}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.cls}`}>
                        {badge.label}
                      </span>
                      {isAssigned && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
                          سائق الوايت النشط حالياً
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
                      <span>
                        اسم الدخول: <strong className="font-mono text-sky-800">{acc.username}</strong>
                      </span>
                      <span>
                        الهاتف: <strong className="font-mono text-slate-800">{acc.phone}</strong>
                      </span>
                      <span className="flex items-center gap-1">
                        <span>كلمة المرور:</span>
                        <strong className="font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-slate-900">
                          {isPwVisible ? acc.password : '••••••'}
                        </strong>
                        <button
                          type="button"
                          onClick={() =>
                            setVisiblePasswords((prev) => ({ ...prev, [acc.id]: !prev[acc.id] }))
                          }
                          className="p-0.5 text-slate-500 hover:text-sky-700"
                          title={isPwVisible ? 'إخفاء' : 'إظهار كلمة المرور'}
                        >
                          {isPwVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </span>
                      {acc.licenseNumber && <span>الرخصة: {acc.licenseNumber}</span>}
                      {acc.lastLoginAt && (
                        <span className="text-slate-400">
                          آخر دخول: {new Date(acc.lastLoginAt).toLocaleString('ar-YE')}
                        </span>
                      )}
                    </div>

                    {acc.status === 'rejected' && acc.rejectionReason && (
                      <div className="text-[11px] text-rose-700 bg-rose-50 px-2 py-1 rounded border border-rose-200 inline-block">
                        سبب الرفض: {acc.rejectionReason}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {acc.status !== 'approved' && (
                      <button
                        onClick={async () => {
                          await approveDriverAccount(acc.id);
                          showToast(`تم اعتماد حساب السائق ${acc.name}`);
                        }}
                        className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center gap-1"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>اعتماد</span>
                      </button>
                    )}

                    {acc.status === 'approved' && !isAssigned && (
                      <button
                        onClick={async () => {
                          await assignDriverToTruck(acc.id);
                          showToast(`تم تعيين ${acc.name} كسائق للوايت الحالي`);
                        }}
                        className="px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 rounded-lg font-bold flex items-center gap-1"
                      >
                        <Truck className="w-3.5 h-3.5" />
                        <span>تعيين للوايت</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setFormError(null);
                        setEditingAccount(acc);
                        setEditAccountForm({
                          name: acc.name,
                          phone: acc.phone,
                          username: acc.username,
                          licenseNumber: acc.licenseNumber || '',
                          password: acc.password,
                        });
                      }}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-semibold flex items-center gap-1"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-sky-700" />
                      <span>تعديل / كلمة المرور</span>
                    </button>

                    {(acc.status === 'approved' || acc.status === 'suspended') && (
                      <button
                        onClick={async () => {
                          await toggleSuspendDriverAccount(acc.id);
                          showToast(
                            acc.status === 'suspended'
                              ? `تم إعادة تفعيل حساب ${acc.name}`
                              : `تم إيقاف حساب ${acc.name} مؤقتاً`
                          );
                        }}
                        className={`px-2.5 py-1.5 rounded-lg font-semibold flex items-center gap-1 ${
                          acc.status === 'suspended'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                            : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                        }`}
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>{acc.status === 'suspended' ? 'تفعيل' : 'إيقاف'}</span>
                      </button>
                    )}

                    <button
                      onClick={async () => {
                        await deleteDriverAccount(acc.id);
                        showToast(`تم حذف حساب ${acc.name}`);
                      }}
                      className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg"
                      title="حذف الحساب"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* GPS Tracking Policy Banner */}
      <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 flex items-center gap-3 text-xs">
        <div className="w-10 h-10 rounded-xl bg-sky-700 text-white flex items-center justify-center shrink-0">
          <Navigation className="w-5 h-5 text-emerald-300" />
        </div>
        <div>
          <div className="font-bold text-slate-900 text-sm">التتبع التلقائي عبر GPS والعمل دون إنترنت</div>
          <p className="text-[11px] text-slate-600 mt-0.5">
            يسجل تطبيق السائق مسار الوايت والتوقفات تلقائياً فور بدء الرحلة المعتمدة ويحفظ النقاط محلياً عند انقطاع الإنترنت لمزامنتها تلقائياً مع الخادم.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Active Driver Profile */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 text-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-sky-700 text-white flex items-center justify-center font-bold text-base shadow-sm">
                MH
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">{truck.driverName || 'غير معين'}</h3>
                <p className="text-xs text-slate-500">سائق وايت المياه النشط - مديرية مأرب</p>
              </div>
            </div>
            <span className="bg-emerald-100 text-emerald-800 text-[11px] font-semibold px-2.5 py-1 rounded-full">
              {truck.driverId ? 'معيّن للوايت' : 'بدون سائق'}
            </span>
          </div>

          <div className="space-y-2.5 text-slate-600">
            <div className="flex justify-between py-1 border-b border-slate-50 items-center">
              <span>رقم هاتف التواصل للسائق:</span>
              <span className="font-mono font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                {truck.driverPhone || '—'}
              </span>
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
                  driverPhone: truck.driverPhone || '',
                  driverWagePerTrip: settings.driverWagePerTrip,
                  driverLicense: '',
                });
                setShowEditDriverModal(true);
              }}
              className="w-full py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg font-bold text-slate-700 text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5 text-sky-700" />
              <span>تعديل بيانات وأجر السائق</span>
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
                <h3 className="font-bold text-base text-slate-900">
                  {truck.code} ({truck.plateNumber})
                </h3>
                <p className="text-xs text-slate-500">{truck.model}</p>
              </div>
            </div>
            <span
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                truck.status === 'on_trip'
                  ? 'bg-sky-100 text-sky-800'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {truck.status === 'on_trip' ? 'في رحلة توصيل' : 'جاهز للعمل'}
            </span>
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

      {/* Create Approved Driver Account Modal */}
      {showCreateAccountModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 text-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-emerald-700" />
                <span>إضافة حساب سائق معتمد بكلمة مرور</span>
              </h4>
              <button onClick={() => setShowCreateAccountModal(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            {formError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg font-semibold">
                {formError}
              </div>
            )}
            <form onSubmit={handleCreateAccount} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">اسم السائق الكامل *</label>
                <input
                  type="text"
                  required
                  value={newAccountForm.name}
                  onChange={(e) => setNewAccountForm({ ...newAccountForm, name: e.target.value })}
                  placeholder="الاسم الثلاثي"
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-slate-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">رقم الهاتف *</label>
                  <input
                    type="text"
                    required
                    value={newAccountForm.phone}
                    onChange={(e) => setNewAccountForm({ ...newAccountForm, phone: e.target.value })}
                    placeholder="71xxxxxxx"
                    className="w-full p-2.5 border border-slate-200 rounded-lg font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">اسم المستخدم (اختياري)</label>
                  <input
                    type="text"
                    value={newAccountForm.username}
                    onChange={(e) => setNewAccountForm({ ...newAccountForm, username: e.target.value })}
                    placeholder="تلقائياً رقم الهاتف"
                    className="w-full p-2.5 border border-slate-200 rounded-lg font-mono text-slate-900"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">كلمة المرور للدخول *</label>
                  <input
                    type="text"
                    required
                    minLength={4}
                    value={newAccountForm.password}
                    onChange={(e) => setNewAccountForm({ ...newAccountForm, password: e.target.value })}
                    placeholder="4 أحرف/أرقام على الأقل"
                    className="w-full p-2.5 border border-slate-200 rounded-lg font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">رقم رخصة القيادة</label>
                  <input
                    type="text"
                    value={newAccountForm.licenseNumber}
                    onChange={(e) => setNewAccountForm({ ...newAccountForm, licenseNumber: e.target.value })}
                    placeholder="عمومي - مأرب #..."
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newAccountForm.assignToTruck}
                  onChange={(e) => setNewAccountForm({ ...newAccountForm, assignToTruck: e.target.checked })}
                  className="rounded text-emerald-700"
                />
                <span className="font-semibold text-slate-700">تعيين هذا السائق للوايت الحالي فور الإنشاء</span>
              </label>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setShowCreateAccountModal(false)} className="px-4 py-2 border border-slate-200 rounded-lg">
                  إلغاء
                </button>
                <button type="submit" className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>اعتماد وحفظ الحساب</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Driver Account & Password Modal */}
      {editingAccount && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 text-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-sky-700" />
                <span>تعديل حساب وكلمة مرور: {editingAccount.name}</span>
              </h4>
              <button onClick={() => setEditingAccount(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            {formError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg font-semibold">
                {formError}
              </div>
            )}
            <form onSubmit={handleSaveEditAccount} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">اسم السائق *</label>
                <input
                  type="text"
                  required
                  value={editAccountForm.name}
                  onChange={(e) => setEditAccountForm({ ...editAccountForm, name: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-slate-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">رقم الهاتف *</label>
                  <input
                    type="text"
                    required
                    value={editAccountForm.phone}
                    onChange={(e) => setEditAccountForm({ ...editAccountForm, phone: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">اسم الدخول *</label>
                  <input
                    type="text"
                    required
                    value={editAccountForm.username}
                    onChange={(e) => setEditAccountForm({ ...editAccountForm, username: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg font-mono text-slate-900"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">كلمة المرور الجديدة *</label>
                  <input
                    type="text"
                    required
                    minLength={4}
                    value={editAccountForm.password}
                    onChange={(e) => setEditAccountForm({ ...editAccountForm, password: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg font-mono font-bold text-sky-800"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">رقم الرخصة</label>
                  <input
                    type="text"
                    value={editAccountForm.licenseNumber}
                    onChange={(e) => setEditAccountForm({ ...editAccountForm, licenseNumber: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
              </div>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setEditingAccount(null)} className="px-4 py-2 border border-slate-200 rounded-lg">
                  إلغاء
                </button>
                <button type="submit" className="px-5 py-2 bg-sky-700 hover:bg-sky-800 text-white font-bold rounded-lg flex items-center gap-1.5">
                  <Save className="w-4 h-4" />
                  <span>حفظ التعديلات</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Pending Driver Account Modal */}
      {rejectingAccount && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 text-xs space-y-3">
            <h4 className="font-bold text-sm text-rose-800">رفض طلب حساب السائق: {rejectingAccount.name}</h4>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="اكتب سبب الرفض (اختياري)..."
              className="w-full p-2.5 border border-slate-200 rounded-lg"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectingAccount(null)}
                className="px-4 py-2 border border-slate-200 rounded-lg"
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={async () => {
                  await rejectDriverAccount(rejectingAccount.id, rejectReason);
                  setRejectingAccount(null);
                  showToast('تم رفض طلب الحساب');
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg"
              >
                تأكيد الرفض
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Driver Wage / Active Truck Profile Modal */}
      {showEditDriverModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 text-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h4 className="font-bold text-sm text-slate-900">تعديل بيانات وأجر السائق النشط</h4>
              <button onClick={() => setShowEditDriverModal(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveDriver} className="space-y-4">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">اسم السائق *</label>
                <input
                  type="text"
                  required
                  value={driverForm.driverName}
                  onChange={(e) => setDriverForm({ ...driverForm, driverName: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-slate-900"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-semibold mb-1">رقم هاتف السائق *</label>
                <input
                  type="text"
                  required
                  value={driverForm.driverPhone}
                  onChange={(e) => setDriverForm({ ...driverForm, driverPhone: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg font-mono text-slate-900"
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
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setShowEditDriverModal(false)} className="px-4 py-2 border border-slate-200 rounded-lg">
                  إلغاء
                </button>
                <button type="submit" className="px-5 py-2 bg-sky-700 hover:bg-sky-800 text-white font-bold rounded-lg flex items-center gap-1.5">
                  <Save className="w-4 h-4" />
                  <span>حفظ</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Truck Modal */}
      {showEditTruckModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 text-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h4 className="font-bold text-sm text-slate-900">تعديل مواصفات الوايت</h4>
              <button onClick={() => setShowEditTruckModal(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
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
                    className="w-full p-2.5 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">رقم اللوحة *</label>
                  <input
                    type="text"
                    required
                    value={truckForm.plateNumber}
                    onChange={(e) => setTruckForm({ ...truckForm, plateNumber: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-700 font-semibold mb-1">الموديل *</label>
                <input
                  type="text"
                  required
                  value={truckForm.model}
                  onChange={(e) => setTruckForm({ ...truckForm, model: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">السعة القصوى (لتر) *</label>
                  <input
                    type="number"
                    required
                    value={truckForm.maxCapacityLiters}
                    onChange={(e) => setTruckForm({ ...truckForm, maxCapacityLiters: Number(e.target.value) })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg font-mono font-bold text-sky-800"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">عداد المسافات (كم)</label>
                  <input
                    type="number"
                    value={truckForm.odometerKm}
                    onChange={(e) => setTruckForm({ ...truckForm, odometerKm: Number(e.target.value) })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
              </div>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setShowEditTruckModal(false)} className="px-4 py-2 border border-slate-200 rounded-lg">
                  إلغاء
                </button>
                <button type="submit" className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg flex items-center gap-1.5">
                  <Save className="w-4 h-4" />
                  <span>حفظ</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
