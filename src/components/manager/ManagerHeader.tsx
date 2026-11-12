/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Manager Top Bar Header Component (Responsive for Phone & Laptop)
 */

import React from 'react';
import {
  Droplet,
  Smartphone,
  Radio,
  PlusCircle,
  RotateCcw,
  Signal,
  CheckCircle2,
  Menu,
  KeyRound,
  LogOut,
  Users,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface ManagerHeaderProps {
  onOpenNewOrderModal: () => void;
}

export const ManagerHeader: React.FC<ManagerHeaderProps> = ({ onOpenNewOrderModal }) => {
  const {
    viewMode,
    setViewMode,
    trips,
    settings,
    resetDemoData,
    logoutToRoleSelection,
    setIsChangePinModalOpen,
    isMobileSidebarOpen,
    setIsMobileSidebarOpen,
  } = useApp();

  const activeTrip = trips.find((t) => t.status === 'in_progress');

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-3 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-xs">
      {/* Zone 1: Mobile Hamburger & Brand Title */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Mobile Sidebar Hamburger Toggle */}
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
            <p className="text-[10px] sm:text-[11px] text-slate-500 hidden xs:block">إدارة المصنع والتوزيع</p>
          </div>
        </div>

        {/* Operational Indicators (Laptop / Desktop) */}
        <div className="hidden xl:flex items-center gap-3 text-xs border-r border-slate-200 pr-4 mr-2">
          {activeTrip ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg font-medium text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
              <span>{activeTrip.tripNumber}</span>
              <span className="text-[11px] text-emerald-600">({activeTrip.remainingLiters.toLocaleString()}L متبقي)</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
              <span>الوايت بالمصنع</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-[11px]">
            <Signal className="w-3.5 h-3.5 text-sky-600" />
            <span>سبأفون SMS</span>
          </div>
        </div>
      </div>

      {/* Zone 2 & 3: Mode Switcher, Security PIN & Action Controls */}
      <div className="flex items-center gap-1.5 sm:gap-2.5">
        {/* Change Passcode PIN Button */}
        <button
          onClick={() => setIsChangePinModalOpen(true)}
          title="تغيير رمز دخول المدير"
          className="p-2 text-slate-600 hover:text-sky-700 hover:bg-sky-50 rounded-lg transition-colors text-xs flex items-center gap-1"
        >
          <KeyRound className="w-4 h-4 text-slate-500 hover:text-sky-700" />
          <span className="hidden lg:inline text-slate-600">تغيير الرمز</span>
        </button>

        {/* Switch / Logout to Initial Role Screen */}
        <button
          onClick={logoutToRoleSelection}
          title="تبديل الحساب أو تسجيل الخروج للشاشة الرئيسية"
          className="p-2 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors text-xs flex items-center gap-1"
        >
          <LogOut className="w-4 h-4 text-slate-500 hover:text-amber-700 rotate-180" />
          <span className="hidden lg:inline text-slate-600">تبديل الحساب</span>
        </button>

        {/* Mode Switcher (Compact for Mobile, Full for Desktop) */}
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
          <button
            onClick={() => setViewMode('simulator')}
            className={`px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
              viewMode === 'simulator'
                ? 'bg-amber-600 text-white shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span className="hidden md:inline">محاكي SMS</span>
          </button>
        </div>

        {/* Primary CTA: Add New Order */}
        <button
          onClick={onOpenNewOrderModal}
          className="flex items-center gap-1.5 px-3 py-2 sm:px-4 sm:py-2 bg-sky-700 text-white text-xs font-semibold rounded-lg hover:bg-sky-800 transition-colors shadow-sm shrink-0"
        >
          <PlusCircle className="w-4 h-4" />
          <span>طلب ماء</span>
        </button>
      </div>
    </header>
  );
};
