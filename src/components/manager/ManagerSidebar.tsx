/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Manager Dashboard Sidebar Navigation (Responsive Desktop & Mobile Drawer)
 */

import React from 'react';
import {
  LayoutDashboard,
  Users,
  ShoppingCart,
  MapPin,
  GitMerge,
  Truck,
  Receipt,
  Wallet,
  Fuel,
  TrendingUp,
  FileSpreadsheet,
  UserCheck,
  Settings,
  BookOpen,
  X,
  Droplet,
  LogOut,
  KeyRound,
} from 'lucide-react';
import { ManagerTab, useApp } from '../../context/AppContext';

interface NavItem {
  id: ManagerTab;
  label: string;
  icon: React.ElementType;
  badge?: number | string;
  badgeColor?: string;
}

export const ManagerSidebar: React.FC = () => {
  const {
    managerTab,
    setManagerTab,
    orders,
    trips,
    truck,
    driverAccounts,
    clusterProposals,
    isMobileSidebarOpen,
    setIsMobileSidebarOpen,
    logoutToRoleSelection,
    setIsChangePinModalOpen,
  } = useApp();

  const pendingOrdersCount = orders.filter(
    (o) => o.status === 'new' || o.status === 'waiting_clustering'
  ).length;
  const pendingDriversCount = driverAccounts.filter((d) => d.status === 'pending').length;

  const activeTrip = trips.find((t) => t.status === 'in_progress');
  const pendingApprovalTripsCount = trips.filter((t) => t.status === 'pending_approval').length;
  const pendingReviewTripsCount = trips.filter((t) => t.status === 'completed_pending_review').length;

  const tripsBadge = activeTrip
    ? 'رحلة جارية'
    : pendingApprovalTripsCount > 0
    ? `${pendingApprovalTripsCount} للاعتماد`
    : pendingReviewTripsCount > 0
    ? `${pendingReviewTripsCount} للمراجعة`
    : undefined;

  const navItems: NavItem[] = [
    { id: 'overview', label: 'الرئيسية والمؤشرات', icon: LayoutDashboard },
    { id: 'customers', label: 'إدارة العملاء والخزانات', icon: Users },
    {
      id: 'orders',
      label: 'استقبال الطلبات',
      icon: ShoppingCart,
      badge: pendingOrdersCount > 0 ? pendingOrdersCount : undefined,
      badgeColor: 'bg-amber-100 text-amber-800',
    },
    {
      id: 'clustering',
      label: 'تجميع الطلبات الذكي',
      icon: GitMerge,
      badge: clusterProposals.length > 0 ? `${clusterProposals.length} مقترحات` : undefined,
      badgeColor: 'bg-sky-100 text-sky-800',
    },
    {
      id: 'trips',
      label: 'إدارة الرحلات وتتبع GPS',
      icon: Truck,
      badge: tripsBadge,
      badgeColor: activeTrip
        ? 'bg-emerald-100 text-emerald-800'
        : pendingApprovalTripsCount > 0
        ? 'bg-amber-100 text-amber-800'
        : 'bg-indigo-100 text-indigo-800',
    },
    { id: 'map', label: 'خريطة التوزيع المباشر', icon: MapPin },
    { id: 'invoices', label: 'الفواتير والمبيعات', icon: Receipt },
    { id: 'reconciliation', label: 'تسوية عهدة السائق', icon: Wallet },
    { id: 'expenses', label: 'المصروفات والديزل', icon: Fuel },
    { id: 'profitability', label: 'المحاسبة والربحية', icon: TrendingUp },
    { id: 'reports', label: 'التقارير والإحصائيات (15)', icon: FileSpreadsheet },
    {
      id: 'driver_mgmt',
      label: 'حسابات السائقين والوايت',
      icon: UserCheck,
      badge: pendingDriversCount > 0 ? `${pendingDriversCount} للاعتماد` : undefined,
      badgeColor: 'bg-amber-100 text-amber-800',
    },
    { id: 'settings', label: 'إعدادات النظام والتتبع', icon: Settings },
    { id: 'manual', label: 'دليل المستخدم والتوثيق', icon: BookOpen },
  ];

  const handleSelectTab = (id: ManagerTab) => {
    setManagerTab(id);
    setIsMobileSidebarOpen(false);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white text-right">
      <div className="p-3 border-b border-slate-100 flex items-center justify-between md:hidden">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-sky-700 text-white flex items-center justify-center">
            <Droplet className="w-4 h-4 fill-white" />
          </div>
          <span className="font-bold text-sm text-slate-900">أقسام لوحة المدير</span>
        </div>
        <button
          onClick={() => setIsMobileSidebarOpen(false)}
          className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Truck Live Telemetry Widget */}
      <div className="p-4 border-b border-slate-100 bg-sky-50/50">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
          <span className="font-semibold text-slate-700">صهريج مياه مأرب</span>
          <span className="font-mono text-sky-700 font-bold">{truck.maxCapacityLiters.toLocaleString()}L</span>
        </div>
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-slate-600">السائق: {truck.driverName}</span>
          <span className="text-emerald-700 font-semibold">
            {activeTrip ? 'في رحلة توصيل' : 'جاهز بالمصنع'}
          </span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
          <div
            className="bg-sky-600 h-2 rounded-full transition-all duration-500"
            style={{
              width: `${
                activeTrip
                  ? (activeTrip.remainingLiters / truck.maxCapacityLiters) * 100
                  : 100
              }%`,
            }}
          />
        </div>
        <div className="flex justify-between text-[11px] text-slate-500 mt-1 font-mono">
          <span>
            الماء: {activeTrip ? activeTrip.remainingLiters.toLocaleString() : truck.maxCapacityLiters.toLocaleString()} لتر
          </span>
          <span>
            {activeTrip ? `${Math.round((activeTrip.remainingLiters / truck.maxCapacityLiters) * 100)}%` : '100%'}
          </span>
        </div>
      </div>

      {/* Nav Menu Items */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = managerTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-right ${
                isActive
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                <span className="truncate">{item.label}</span>
              </div>
              {item.badge && (
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
                    isActive ? 'bg-sky-900 text-sky-100' : item.badgeColor || 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Mobile Quick Action Buttons inside drawer */}
      <div className="p-3 border-t border-slate-100 md:hidden space-y-2 bg-slate-50">
        <button
          onClick={() => {
            setIsMobileSidebarOpen(false);
            setIsChangePinModalOpen(true);
          }}
          className="w-full py-2 px-3 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5"
        >
          <KeyRound className="w-3.5 h-3.5 text-sky-700" />
          <span>تغيير رمز دخول المدير</span>
        </button>
        <button
          onClick={() => {
            setIsMobileSidebarOpen(false);
            logoutToRoleSelection();
          }}
          className="w-full py-2 px-3 bg-amber-50 border border-amber-200 rounded-lg text-xs font-semibold text-amber-800 flex items-center justify-center gap-1.5"
        >
          <LogOut className="w-3.5 h-3.5 rotate-180" />
          <span>تبديل الحساب / خروج للشاشة الرئيسية</span>
        </button>
      </div>

      {/* Footer Branding */}
      <div className="p-3 border-t border-slate-100 text-[11px] text-slate-400 text-center">
        مياهنا v3.0 · مديرية مأرب · تتبع GPS ومزامنة تلقائية
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden md:flex w-64 bg-white border-l border-slate-200 flex-col shrink-0 min-h-[calc(100vh-65px)]">
        {sidebarContent}
      </aside>

      {isMobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 max-w-xs w-full bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
