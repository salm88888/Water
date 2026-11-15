/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Driver Login & Manager-Approved Account Request Screen (Permanent Mobile Shell)
 */

import React, { useState } from 'react';
import {
  Truck,
  Lock,
  User,
  Phone,
  Eye,
  EyeOff,
  LogIn,
  UserPlus,
  CheckCircle2,
  AlertTriangle,
  LogOut,
  ShieldCheck,
  KeyRound,
  X,
  FileBadge,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ManagerPinModal } from './ManagerPinModal';

export const DriverAuthScreen: React.FC = () => {
  const {
    loginDriver,
    registerDriverAccount,
    savedRole,
    setViewMode,
    selectRole,
    logoutToRoleSelection,
    demoClearedNotice,
    dismissDemoClearedNotice,
  } = useApp();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [regForm, setRegForm] = useState({
    name: '',
    phone: '',
    username: '',
    licenseNumber: '',
    password: '',
    confirmPassword: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [registerSuccessMsg, setRegisterSuccessMsg] = useState<string | null>(null);
  const [showManagerPinModal, setShowManagerPinModal] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);
    const res = await loginDriver(identifier, password);
    setIsSubmitting(false);
    if (!res.success) {
      setErrorMsg(res.error || 'تعذر تسجيل الدخول');
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setRegisterSuccessMsg(null);

    if (regForm.password.trim().length < 4) {
      setErrorMsg('يجب أن لا تقل كلمة المرور عن 4 أحرف أو أرقام');
      return;
    }
    if (regForm.password !== regForm.confirmPassword) {
      setErrorMsg('كلمتا المرور غير متطابقتين');
      return;
    }

    setIsSubmitting(true);
    const res = await registerDriverAccount({
      name: regForm.name,
      phone: regForm.phone,
      username: regForm.username || regForm.phone,
      licenseNumber: regForm.licenseNumber,
      password: regForm.password,
    });
    setIsSubmitting(false);

    if (!res.success) {
      setErrorMsg(res.error || 'تعذر إرسال طلب الحساب');
      return;
    }

    setRegisterSuccessMsg(
      'تم إرسال طلب فتح الحساب بنجاح إلى المدير العام. يمكنك تسجيل الدخول فور اعتماد حسابك من لوحة المدير.'
    );
    setRegForm({
      name: '',
      phone: '',
      username: '',
      licenseNumber: '',
      password: '',
      confirmPassword: '',
    });
  };

  const handleOpenManager = () => {
    if (savedRole === 'manager') {
      setViewMode('manager');
    } else {
      setShowManagerPinModal(true);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 flex justify-center items-stretch" dir="rtl">
      <div className="w-full max-w-[430px] min-h-screen bg-slate-900 text-white flex flex-col font-sans border-x border-slate-800/80 shadow-2xl">
        {/* Top Mobile Header */}
        <div className="bg-slate-950/95 px-3 py-2.5 flex items-center justify-between text-xs border-b border-slate-800">
          <div className="flex items-center gap-2">
            <button
              onClick={logoutToRoleSelection}
              title="العودة لاختيار الواجهة"
              className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800/80 hover:bg-slate-700 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5 rotate-180" />
            </button>
            <span className="font-bold text-sky-400">مياهنا · دخول السائق</span>
          </div>

          <button
            onClick={handleOpenManager}
            className="px-2.5 py-1 rounded-lg text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 border border-slate-700"
          >
            <Lock className="w-3 h-3 text-amber-400" />
            <span>{savedRole === 'manager' ? 'عودة للمدير' : 'المدير'}</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 p-4 flex flex-col justify-center space-y-4 overflow-y-auto">
          {demoClearedNotice && (
            <div className="p-3 rounded-xl bg-amber-950/80 border border-amber-600/60 text-amber-200 text-xs flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>{demoClearedNotice}</span>
              </div>
              <button onClick={dismissDemoClearedNotice} className="text-amber-300 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Brand Card */}
          <div className="text-center space-y-2 py-2">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-sky-600 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20 border border-emerald-400/30">
              <Truck className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-lg font-extrabold text-white">بوابة حسابات السائقين</h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              دخول السائق محمي بكلمة مرور ويتطلب اعتماد الحساب مسبقاً من قِبل المدير العام.
            </p>
          </div>

          {/* Mode Tabs */}
          <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMsg(null);
              }}
              className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
                mode === 'login' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>تسجيل الدخول</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setErrorMsg(null);
                setRegisterSuccessMsg(null);
              }}
              className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
                mode === 'register' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>طلب حساب جديد</span>
            </button>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/90 border border-rose-700 text-rose-200 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {registerSuccessMsg && (
            <div className="p-3 rounded-xl bg-emerald-950/90 border border-emerald-600 text-emerald-200 text-xs flex items-start gap-2 leading-relaxed">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{registerSuccessMsg}</span>
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  رقم الهاتف أو اسم المستخدم
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="أدخل رقم الهاتف أو اسم المستخدم"
                    className="w-full pr-9 pl-3 py-2.5 bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-xl text-white placeholder:text-slate-500 outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">كلمة المرور</label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="أدخل كلمة المرور"
                    className="w-full pr-9 pl-10 py-2.5 bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-xl text-white placeholder:text-slate-500 outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    aria-label="إظهار أو إخفاء كلمة المرور"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/40 transition-colors"
              >
                <LogIn className="w-4 h-4" />
                <span>{isSubmitting ? 'جاري التحقق...' : 'دخول تطبيق السائق'}</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit} className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4 space-y-3 text-xs">
              <div className="p-2.5 bg-sky-950/70 border border-sky-800/70 rounded-xl text-[11px] text-sky-200 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                <span>يتم إرسال طلبك فوراً للمدير العام للاعتماد وتفعيل الدخول.</span>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">الاسم الكامل للسائق *</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={regForm.name}
                    onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                    placeholder="الاسم الثلاثي"
                    className="w-full pr-9 pl-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">رقم الهاتف *</label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={regForm.phone}
                      onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                      placeholder="71xxxxxxx"
                      className="w-full pr-8 pl-2 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">اسم المستخدم</label>
                  <input
                    type="text"
                    value={regForm.username}
                    onChange={(e) => setRegForm({ ...regForm, username: e.target.value })}
                    placeholder="اختياري (أو الهاتف)"
                    className="w-full px-2.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">رقم رخصة القيادة (اختياري)</label>
                <div className="relative">
                  <FileBadge className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={regForm.licenseNumber}
                    onChange={(e) => setRegForm({ ...regForm, licenseNumber: e.target.value })}
                    placeholder="مثال: عمومي - مأرب #..."
                    className="w-full pr-9 pl-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">كلمة المرور *</label>
                  <input
                    type="password"
                    required
                    minLength={4}
                    value={regForm.password}
                    onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                    placeholder="4 أحرف+"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">تأكيد المرور *</label>
                  <input
                    type="password"
                    required
                    minLength={4}
                    value={regForm.confirmPassword}
                    onChange={(e) => setRegForm({ ...regForm, confirmPassword: e.target.value })}
                    placeholder="إعادة الكلمة"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-sky-900/40 transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                <span>{isSubmitting ? 'جاري الإرسال...' : 'إرسال طلب فتح الحساب للمدير'}</span>
              </button>
            </form>
          )}
        </div>
      </div>

      <ManagerPinModal
        isOpen={showManagerPinModal}
        onClose={() => setShowManagerPinModal(false)}
        onSuccess={() => {
          selectRole('manager');
          setShowManagerPinModal(false);
        }}
      />
    </div>
  );
};
