/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Manager Top Bar Header Component (Responsive for Phone & Laptop)
 */

import React, { useMemo, useRef, useState } from 'react';
import {
  Droplet,
  Smartphone,
  PlusCircle,
  CheckCircle2,
  Menu,
  KeyRound,
  LogOut,
  Navigation,
  RefreshCw,
  Bell,
  Radio,
  X,
  Cloud,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PWAInstallButton } from '../common/PWAInstallButton';
import { ManagerNotificationDrawer } from './ManagerNotificationDrawer';

interface ManagerHeaderProps {
  onOpenNewOrderModal: () => void;
}

export const ManagerHeader: React.FC<ManagerHeaderProps> = ({ onOpenNewOrderModal }) => {
  const {
    viewMode,
    setViewMode,
    setManagerTab,
    setSelectedTrip,
    trips,
    driverAccounts,
    isOnline,
    isSyncing,
    wsConnected,
    presence,
    unreadManagerCount,
    latestToastNotification,
    dismissToastNotification,
    logoutToRoleSelection,
    setIsChangePinModalOpen,
    isMobileSidebarOpen,
    setIsMobileSidebarOpen,
    cloudUser,
    isCloudConnected,
    isCloudSyncing,
    cloudSyncError,
    dismissCloudSyncError,
    signInWithGoogleAccount,
    signOutGoogleAccount,
    syncNowToCloud,
  } = useApp();

  const [isNotifDrawerOpen, setIsNotifDrawerOpen] = useState(false);
  const [cloudConnecting, setCloudConnecting] = useState(false);
  const cloudLockRef = useRef(false);

  const handleCloudConnect = async () => {
    if (cloudLockRef.current) return;
    cloudLockRef.current = true;
    setCloudConnecting(true);
    try {
      await signInWithGoogleAccount();
    } finally {
      cloudLockRef.current = false;
      setCloudConnecting(false);
    }
  };

  const activeTrip = trips.find((t) => t.status === 'in_progress');

  const pendingActionCount = useMemo(() => {
    let count = driverAccounts.filter((d) => d.status === 'pending').length;
    for (const t of trips) {
      if (
        t.status === 'pending_approval' ||
        t.status === 'completed_pending_review' ||
        t.status === 'synced' ||
        t.driverAcceptanceStatus === 'declined'
      ) {
        count += 1;
      }
      count += (t.modificationRequests || []).filter((m) => m.status === 'pending').length;
    }
    return count;
  }, [trips, driverAccounts]);

  const totalBellBadge = unreadManagerCount + pendingActionCount;

  return (
    <>
      <header className="h-16 bg-white border-b border-slate-200 px-3 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            className="p-2 -mr-1 md:hidden text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            title="القائمة الرئيسية"
            aria-label="القائمة الرئيسية"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-sky-700 to-sky-500 text-white flex items-center justify-center shadow-sm shrink-0">
              <Droplet className="w-4 h-4 sm:w-5 sm:h-5 fill-white" />
            </div>
            <div>
              <h1 className="font-bold text-sm sm:text-base text-slate-900 leading-tight">
                مياهنا <span className="text-[10px] sm:text-xs font-normal text-slate-500">· مأرب</span>
              </h1>
              <p className="text-[10px] sm:text-[11px] text-slate-500 hidden xs:block">إدارة المصنع والتتبع الذكي</p>
            </div>
          </div>

          {/* Operational & Real-Time Presence Indicators */}
          <div className="hidden xl:flex items-center gap-2.5 text-xs border-r border-slate-200 pr-4 mr-2">
            {activeTrip ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg font-medium text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                <span>{activeTrip.tripNumber}</span>
                <span className="text-[11px] text-emerald-600">
                  ({activeTrip.remainingLiters.toLocaleString()}L متبقي)
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                <span>الوايت بالمصنع</span>
              </div>
            )}

            <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-[11px]">
              {isSyncing ? (
                <RefreshCw className="w-3.5 h-3.5 text-sky-600 animate-spin" />
              ) : (
                <Navigation className="w-3.5 h-3.5 text-emerald-600" />
              )}
              <span>{isOnline ? (wsConnected ? 'ربط مباشر لحظي' : 'مزامنة تلقائية') : 'وضع عدم الاتصال'}</span>
            </div>

            <div
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] border ${
                presence.driverConnected
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-semibold'
                  : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}
              title="حالة اتصال تطبيق السائق بالخادم"
            >
              <Radio className={`w-3 h-3 ${presence.driverConnected ? 'text-emerald-600 animate-pulse' : 'text-slate-400'}`} />
              <span>{presence.driverConnected ? 'السائق متصل الآن' : 'السائق غير متصل'}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2.5">
          {/* Interactive Notifications & Required Actions Bell */}
          <button
            onClick={() => setIsNotifDrawerOpen(true)}
            title="إشعارات المطلوب وأفعال السائق وتوجيهه فوريا"
            aria-label="مركز الإشعارات"
            className={`relative p-2 rounded-lg transition-colors flex items-center gap-1.5 border ${
              totalBellBadge > 0
                ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-sky-700 hover:bg-sky-50'
            }`}
          >
            <Bell className={`w-4 h-4 ${totalBellBadge > 0 ? 'text-amber-600 animate-pulse' : ''}`} />
            <span className="hidden md:inline text-xs font-bold">الإشعارات</span>
            {totalBellBadge > 0 && (
              <span className="min-w-5 h-5 px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
                {totalBellBadge > 99 ? '99+' : totalBellBadge}
              </span>
            )}
          </button>

          <PWAInstallButton variant="light" />

          {/* Google Cloud Account Connect / Sync */}
          {isCloudConnected && cloudUser ? (
            <div className="hidden md:flex items-center gap-1 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] text-emerald-800">
              <button
                type="button"
                onClick={syncNowToCloud}
                disabled={isCloudSyncing}
                title={`حفظ ومزامنة سحابية (${cloudUser.email || ''})`}
                className="flex items-center gap-1 hover:text-emerald-950 font-semibold cursor-pointer"
              >
                {isCloudSyncing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                ) : (
                  <Cloud className="w-3.5 h-3.5 text-emerald-600" />
                )}
                <span className="max-w-[115px] truncate" dir="ltr">
                  {cloudUser.email || 'متصل'}
                </span>
              </button>
              <button
                type="button"
                onClick={signOutGoogleAccount}
                title="تسجيل الخروج من السحابة"
                className="p-0.5 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleCloudConnect}
              disabled={cloudConnecting || isCloudSyncing}
              title="تسجيل الدخول بحساب Google للحفظ السحابي الدائم"
              className="px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-800 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {cloudConnecting || isCloudSyncing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />
              ) : (
                <Cloud className="w-3.5 h-3.5 text-sky-600" />
              )}
              <span className="hidden lg:inline">حفظ سحابي (Google)</span>
            </button>
          )}

          <button
            onClick={() => setIsChangePinModalOpen(true)}
            title="تغيير رمز دخول المدير"
            className="p-2 text-slate-600 hover:text-sky-700 hover:bg-sky-50 rounded-lg transition-colors text-xs flex items-center gap-1"
          >
            <KeyRound className="w-4 h-4 text-slate-500 hover:text-sky-700" />
            <span className="hidden lg:inline text-slate-600">تغيير الرمز</span>
          </button>

          <button
            onClick={logoutToRoleSelection}
            title="تبديل الحساب أو تسجيل الخروج للشاشة الرئيسية"
            className="p-2 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors text-xs flex items-center gap-1"
          >
            <LogOut className="w-4 h-4 text-slate-500 hover:text-amber-700 rotate-180" />
            <span className="hidden lg:inline text-slate-600">تبديل الحساب</span>
          </button>

          <div className="hidden sm:flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-medium">
            <button
              onClick={() => setViewMode('manager')}
              className={`px-2.5 py-1.5 rounded-lg transition-all ${
                viewMode === 'manager'
                  ? 'bg-white text-sky-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              لوحة المدير
            </button>
            <button
              onClick={() => setViewMode('driver')}
              className={`px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                viewMode === 'driver'
                  ? 'bg-sky-700 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span className="hidden md:inline">تطبيق السائق</span>
            </button>
          </div>

          <button
            onClick={onOpenNewOrderModal}
            className="flex items-center gap-1.5 px-3 py-2 sm:px-4 sm:py-2 bg-sky-700 text-white text-xs font-semibold rounded-lg hover:bg-sky-800 transition-colors shadow-sm shrink-0"
          >
            <PlusCircle className="w-4 h-4" />
            <span>طلب ماء</span>
          </button>
        </div>
      </header>

      {cloudSyncError && (
        <div
          dir="rtl"
          className="bg-rose-50 border-b border-rose-200 px-4 py-2 text-xs text-rose-800 flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-medium">تنبيه الحفظ السحابي: {cloudSyncError}</span>
          </div>
          <button
            type="button"
            onClick={dismissCloudSyncError}
            className="text-rose-600 hover:text-rose-800 p-1"
            aria-label="إغلاق التنبيه"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Instant Live Notification Toast for Manager */}
      {latestToastNotification && latestToastNotification.targetRole === 'manager' && (
        <div
          dir="rtl"
          className="fixed bottom-4 left-4 z-50 max-w-sm bg-slate-900 text-white rounded-2xl shadow-2xl border border-sky-500/60 p-3.5 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2"
        >
          <div className="w-8 h-8 rounded-xl bg-sky-600/30 border border-sky-400/50 flex items-center justify-center shrink-0 mt-0.5">
            <Bell className="w-4 h-4 text-sky-300" />
          </div>
          <div className="flex-1 text-xs space-y-1">
            <div className="font-bold text-sky-300">{latestToastNotification.title}</div>
            <p className="text-slate-200 text-[11px] leading-relaxed">{latestToastNotification.message}</p>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => {
                  if (latestToastNotification.tripId) {
                    const found = trips.find((t) => t.id === latestToastNotification.tripId);
                    if (found) setSelectedTrip(found);
                    setManagerTab('trips');
                  } else if (latestToastNotification.actionTab === 'driver_mgmt') {
                    setManagerTab('driver_mgmt');
                  } else if (latestToastNotification.actionTab === 'orders') {
                    setManagerTab('orders');
                  } else {
                    setIsNotifDrawerOpen(true);
                  }
                  dismissToastNotification();
                }}
                className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300"
              >
                عرض الآن
              </button>
            </div>
          </div>
          <button
            onClick={dismissToastNotification}
            className="text-slate-400 hover:text-white p-1"
            aria-label="إخفاء التنبيه"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <ManagerNotificationDrawer
        isOpen={isNotifDrawerOpen}
        onClose={() => setIsNotifDrawerOpen(false)}
      />
    </>
  );
};

