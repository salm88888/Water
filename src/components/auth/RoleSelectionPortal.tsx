/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Initial Role Selection Portal
 * Displays the two primary entry buttons (Manager & Driver) on initial startup,
 * with passcode verification for Manager and persistent selection.
 */

import React, { useRef, useState } from 'react';
import {
  Droplet,
  Truck,
  ShieldCheck,
  Lock,
  CheckCircle2,
  MapPin,
  Sparkles,
  Cloud,
  LogOut,
  RefreshCw,
  Loader2,
  AlertTriangle,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface RoleSelectionPortalProps {
  onSelectManager: () => void;
  onSelectDriver: () => void;
}

export const RoleSelectionPortal: React.FC<RoleSelectionPortalProps> = ({
  onSelectManager,
  onSelectDriver,
}) => {
  const {
    cloudUser,
    isCloudConnected,
    isCloudSyncing,
    cloudSyncError,
    dismissCloudSyncError,
    signInWithGoogleAccount,
    signOutGoogleAccount,
    syncNowToCloud,
  } = useApp();

  const [authLoading, setAuthLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const authLockRef = useRef(false);

  const handleGoogleSignIn = async () => {
    if (authLockRef.current) return;
    authLockRef.current = true;
    setAuthLoading(true);
    setLocalError(null);
    try {
      const res = await signInWithGoogleAccount();
      if (!res.success && res.error) {
        setLocalError(res.error);
      }
    } finally {
      authLockRef.current = false;
      setAuthLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col justify-between p-4 sm:p-6 text-white font-sans selection:bg-sky-500 selection:text-white">
      {/* Top Bar / Branding */}
      <div className="max-w-4xl mx-auto w-full flex flex-wrap items-center justify-between gap-2 py-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-sky-400 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Droplet className="w-5 h-5 fill-white text-white" />
          </div>
          <div>
            <h1 className="font-bold text-sm text-white leading-tight">مياهنا</h1>
            <p className="text-[11px] text-slate-400">إدارة مصنع المياه والتوزيع الذكي</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-400 bg-slate-800/60 px-3 py-1 rounded-full border border-slate-700/60">
          <MapPin className="w-3.5 h-3.5 text-sky-400" />
          <span>مديرية مأرب · تتبع GPS والعمل دون إنترنت</span>
        </div>
      </div>

      {/* Main Hero & Two Selection Buttons */}
      <div className="max-w-3xl mx-auto w-full py-6 my-auto text-center space-y-6">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-950/80 border border-sky-800/60 text-sky-300 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>نظام التشغيل الميداني المتكامل</span>
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white tracking-tight">
            مرحباً بك في منظومة <span className="text-sky-400">مياهنا</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-lg mx-auto leading-relaxed">
            يرجى اختيار واجهة العمل المخصصة لك للمتابعة. سيتم حفظ اختيارك تلقائياً لفتح واجهتك مباشرة عند كل تشغيل.
          </p>
        </div>

        {/* Google Cloud Account Bar */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 text-right space-y-3 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  isCloudConnected
                    ? 'bg-emerald-600/20 border border-emerald-500/40 text-emerald-400'
                    : 'bg-sky-600/20 border border-sky-500/40 text-sky-400'
                }`}
              >
                <Cloud className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                  <span>الحفظ السحابي الدائم (Google Cloud)</span>
                  {isCloudConnected && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {isCloudConnected && cloudUser
                    ? `الحساب المرتبط: ${cloudUser.email || cloudUser.displayName}`
                    : 'سجّل الدخول بحساب Google لحفظ كافة البيانات والحسابات والطلبات والرحلات سحابياً بشكل دائم.'}
                </p>
              </div>
            </div>

            {isCloudConnected ? (
              <div className="flex items-center gap-2 self-end sm:self-center">
                <button
                  type="button"
                  onClick={syncNowToCloud}
                  disabled={isCloudSyncing}
                  className="px-3 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-60 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {isCloudSyncing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  <span>مزامنة وحفظ الآن</span>
                </button>
                <button
                  type="button"
                  onClick={signOutGoogleAccount}
                  className="px-3 py-2 bg-slate-900 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="تسجيل الخروج من الحساب السحابي"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>خروج</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={authLoading || isCloudSyncing}
                className="px-4 py-2.5 bg-white hover:bg-slate-100 disabled:opacity-60 text-slate-900 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md transition-colors self-stretch sm:self-center cursor-pointer"
              >
                {authLoading || isCloudSyncing ? (
                  <Loader2 className="w-4 h-4 animate-spin text-sky-700" />
                ) : (
                  <Cloud className="w-4 h-4 text-sky-700" />
                )}
                <span>تسجيل الدخول بحساب Google</span>
              </button>
            )}
          </div>

          {(localError || cloudSyncError) && (
            <div className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-700/70 text-rose-200 text-[11px] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{localError || cloudSyncError}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLocalError(null);
                  dismissCloudSyncError();
                }}
                className="text-rose-300 hover:text-white p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* The Two Primary Action Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-right">
          {/* Option 1: Manager (Protected by Passcode) */}
          <button
            onClick={onSelectManager}
            className="group relative bg-slate-800/90 hover:bg-slate-750 border-2 border-slate-700 hover:border-sky-500 rounded-2xl p-6 transition-all duration-300 text-right flex flex-col justify-between shadow-xl hover:shadow-sky-500/10 active:scale-[0.98] cursor-pointer"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-14 h-14 rounded-2xl bg-sky-600/20 border border-sky-500/30 text-sky-400 flex items-center justify-center group-hover:scale-110 group-hover:bg-sky-600 group-hover:text-white transition-all duration-300">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/80 text-[11px] font-mono text-slate-300 border border-slate-700">
                <Lock className="w-3 h-3 text-amber-400" />
                <span>برمز دخول</span>
              </div>
            </div>

            <div className="space-y-2 mb-6">
              <h3 className="text-lg font-bold text-white group-hover:text-sky-300 transition-colors">
                واجهة المدير العام
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                لوحة التحكم المركزية للكمبيوتر والجوال: اعتماد مخططات الرحلات، متابعة مسار الوايت والتوقفات عبر GPS، الفواتير، والأرباح.
              </p>
            </div>

            <div className="w-full py-3 bg-sky-700 group-hover:bg-sky-600 text-white rounded-xl text-xs font-bold text-center transition-colors flex items-center justify-center gap-2 shadow-md">
              <Lock className="w-3.5 h-3.5" />
              <span>دخول وضع المدير (رمز المرور)</span>
            </div>
          </button>

          {/* Option 2: Driver (Tactile Android Interface) */}
          <button
            onClick={onSelectDriver}
            className="group relative bg-slate-800/90 hover:bg-slate-750 border-2 border-slate-700 hover:border-emerald-500 rounded-2xl p-6 transition-all duration-300 text-right flex flex-col justify-between shadow-xl hover:shadow-emerald-500/10 active:scale-[0.98] cursor-pointer"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center group-hover:scale-110 group-hover:bg-emerald-600 group-hover:text-white transition-all duration-300">
                <Truck className="w-7 h-7" />
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/80 text-[11px] font-semibold text-emerald-300 border border-slate-700">
                <Lock className="w-3 h-3 text-emerald-400" />
                <span>حساب سائق معتمد</span>
              </div>
            </div>

            <div className="space-y-2 mb-6">
              <h3 className="text-lg font-bold text-white group-hover:text-emerald-300 transition-colors">
                تطبيق السائق (Android)
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                واجهة جوال دائمة بكلمة مرور وحساب معتمد من المدير: مخطط الوجهات، التتبع التلقائي GPS، والعمل دون إنترنت.
              </p>
            </div>

            <div className="w-full py-3 bg-emerald-700 group-hover:bg-emerald-600 text-white rounded-xl text-xs font-bold text-center transition-colors flex items-center justify-center gap-2 shadow-md">
              <Truck className="w-3.5 h-3.5" />
              <span>تسجيل دخول / طلب حساب سائق</span>
            </div>
          </button>
        </div>

        <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-800 text-[11px] text-slate-400 max-w-lg mx-auto">
          💡 يمكنك التبديل بين الواجهات في أي وقت من زر «تبديل الحساب» الموجود بأعلى الشاشة.
        </div>
      </div>

      {/* Footer */}
      <div className="max-w-4xl mx-auto w-full py-3 text-center text-[11px] text-slate-500 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>مصنع مياهنا المركزي لتحلية وتعبئة المياه · مأرب</span>
        <span className="text-slate-400">نظام التشغيل الميداني المعتمد</span>
      </div>
    </div>
  );
};
