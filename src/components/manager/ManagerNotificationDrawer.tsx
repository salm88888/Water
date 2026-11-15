/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Manager Real-Time Notification Center & Driver Directive Drawer
 */

import React, { useMemo, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Clock,
  Navigation,
  Send,
  AlertTriangle,
  Truck,
  X,
  CheckCheck,
  Edit3,
  ExternalLink,
  Wifi,
  WifiOff,
  Radio,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface ManagerNotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ManagerNotificationDrawer: React.FC<ManagerNotificationDrawerProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    trips,
    driverAccounts,
    notifications,
    directives,
    presence,
    wsConnected,
    unreadManagerCount,
    markNotificationsRead,
    approveTrip,
    approveTripModification,
    rejectTripModification,
    approveDriverAccount,
    rejectDriverAccount,
    sendManagerDirective,
    setSelectedTrip,
    setManagerTab,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'required' | 'feed' | 'send'>('required');
  const [dirTitle, setDirTitle] = useState('');
  const [dirMessage, setDirMessage] = useState('');
  const [dirPriority, setDirPriority] = useState<'normal' | 'urgent'>('urgent');
  const [dirFeedback, setDirFeedback] = useState<string | null>(null);
  const [isSendingDir, setIsSendingDir] = useState(false);

  const pendingDriverAccounts = useMemo(
    () => driverAccounts.filter((d) => d.status === 'pending'),
    [driverAccounts]
  );
  const pendingApprovalTrips = useMemo(
    () => trips.filter((t) => t.status === 'pending_approval'),
    [trips]
  );
  const driverDeclinedTrips = useMemo(
    () => trips.filter((t) => t.driverAcceptanceStatus === 'declined'),
    [trips]
  );
  const driverAcceptedManagerTrips = useMemo(
    () =>
      trips.filter(
        (t) =>
          t.createdByRole === 'manager' &&
          t.status === 'approved' &&
          t.driverAcceptanceStatus === 'accepted'
      ),
    [trips]
  );
  const pendingReviewTrips = useMemo(
    () => trips.filter((t) => t.status === 'completed_pending_review' || t.status === 'synced'),
    [trips]
  );
  const pendingModRequests = useMemo(() => {
    const list: Array<{ tripId: string; tripNumber: string; request: NonNullable<typeof trips[0]['modificationRequests']>[0] }> = [];
    for (const t of trips) {
      for (const m of t.modificationRequests || []) {
        if (m.status === 'pending') {
          list.push({ tripId: t.id, tripNumber: t.tripNumber, request: m });
        }
      }
    }
    return list;
  }, [trips]);

  const managerNotifications = useMemo(
    () => notifications.filter((n) => n.targetRole === 'manager'),
    [notifications]
  );

  const totalActionItems =
    pendingDriverAccounts.length +
    pendingApprovalTrips.length +
    driverDeclinedTrips.length +
    pendingReviewTrips.length +
    pendingModRequests.length;

  const activeTrip = trips.find((t) => t.status === 'in_progress' || t.status === 'approved');

  if (!isOpen) return null;

  const handleOpenTrip = (tripId?: string) => {
    if (tripId) {
      const found = trips.find((t) => t.id === tripId);
      if (found) setSelectedTrip(found);
    }
    setManagerTab('trips');
    onClose();
  };

  const handleQuickDirectivePreset = (title: string, message: string, priority: 'normal' | 'urgent') => {
    setDirTitle(title);
    setDirMessage(message);
    setDirPriority(priority);
  };

  const handleSendDirective = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirTitle.trim() || !dirMessage.trim()) return;
    setIsSendingDir(true);
    setDirFeedback(null);
    const res = await sendManagerDirective({
      title: dirTitle.trim(),
      message: dirMessage.trim(),
      priority: dirPriority,
      tripId: activeTrip?.id,
      tripNumber: activeTrip?.tripNumber,
    });
    setIsSendingDir(false);
    if (res.success) {
      setDirTitle('');
      setDirMessage('');
      setDirFeedback('تم إرسال التوجيه فوراً إلى تطبيق السائق.');
      setTimeout(() => setDirFeedback(null), 4000);
    } else {
      setDirFeedback(res.error || 'تعذر الإرسال');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[1px]" dir="rtl">
      <div className="w-full max-w-md bg-white h-full shadow-2xl border-r border-slate-200 flex flex-col">
        {/* Drawer Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-600/30 border border-sky-400/40 flex items-center justify-center">
              <Bell className="w-5 h-5 text-sky-300" />
            </div>
            <div>
              <h2 className="font-bold text-sm">مركز الإشعارات والترابط الفوري</h2>
              <div className="flex items-center gap-2 text-[11px] text-slate-300 mt-0.5">
                <span className="flex items-center gap-1">
                  {wsConnected ? (
                    <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                  ) : (
                    <WifiOff className="w-3 h-3 text-rose-400" />
                  )}
                  {wsConnected ? 'مزامنة لحظية نشطة' : 'إعادة الاتصال...'}
                </span>
                <span>·</span>
                <span className={`flex items-center gap-1 ${presence.driverConnected ? 'text-emerald-300 font-semibold' : 'text-slate-400'}`}>
                  {presence.driverConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  {presence.driverConnected ? 'السائق متصل الآن' : 'السائق غير متصل حالياً'}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="إغلاق الإشعارات"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-Tabs */}
        <div className="grid grid-cols-3 gap-1 p-2 bg-slate-100 border-b border-slate-200 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('required')}
            className={`py-2 px-2 rounded-lg transition-all flex items-center justify-center gap-1 ${
              activeTab === 'required' ? 'bg-white text-sky-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>المطلوب ({totalActionItems})</span>
          </button>
          <button
            onClick={() => setActiveTab('feed')}
            className={`py-2 px-2 rounded-lg transition-all flex items-center justify-center gap-1 ${
              activeTab === 'feed' ? 'bg-white text-sky-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Truck className="w-3.5 h-3.5 text-emerald-600" />
            <span>السائق ({unreadManagerCount})</span>
          </button>
          <button
            onClick={() => setActiveTab('send')}
            className={`py-2 px-2 rounded-lg transition-all flex items-center justify-center gap-1 ${
              activeTab === 'send' ? 'bg-sky-700 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>توجيه للسائق</span>
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
          {/* TAB 1: REQUIRED MANAGER ACTIONS */}
          {activeTab === 'required' && (
            <div className="space-y-4">
              {totalActionItems === 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-slate-500 text-xs space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                  <p className="font-bold text-slate-700">لا توجد قرارات معلقة حالياً</p>
                  <p>سيظهر هنا فوراً أي مخطط رحلة أو طلب تعديل أو رحلة عائدة للمصنع بانتظار موافقتك.</p>
                </div>
              )}

              {/* Pending Driver Account Approvals */}
              {pendingDriverAccounts.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span>طلبات اعتماد حسابات سائقين ({pendingDriverAccounts.length})</span>
                  </h3>
                  {pendingDriverAccounts.map((acc) => (
                    <div
                      key={acc.id}
                      className="bg-white border-2 border-amber-300 rounded-xl p-3 space-y-2 shadow-xs text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">{acc.name}</span>
                        <span className="text-[11px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">
                          بانتظار الاعتماد
                        </span>
                      </div>
                      <p className="text-slate-600 text-[11px]">
                        الهاتف: <strong className="font-mono">{acc.phone}</strong> · اسم الدخول: <strong className="font-mono">{acc.username}</strong>
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => approveDriverAccount(acc.id)}
                          className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold"
                        >
                          اعتماد الحساب
                        </button>
                        <button
                          onClick={() => rejectDriverAccount(acc.id, 'مرفوض من مركز الإشعارات')}
                          className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg font-bold"
                        >
                          رفض
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Driver Written Decline / Reply on Manager Trips */}
              {driverDeclinedTrips.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <span>ردود السائق بالاعتذار عن رحلات الإدارة ({driverDeclinedTrips.length})</span>
                  </h3>
                  {driverDeclinedTrips.map((trip) => (
                    <div
                      key={trip.id}
                      className="bg-white border-2 border-rose-300 rounded-xl p-3 space-y-2 shadow-xs text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-slate-900">{trip.tripNumber}</span>
                        <span className="text-[11px] bg-rose-100 text-rose-800 px-2 py-0.5 rounded font-bold">
                          رد السائق: غير موافق
                        </span>
                      </div>
                      <p className="text-rose-900 bg-rose-50 border border-rose-200 rounded-lg p-2 font-medium">
                        <strong>السبب المكتوب:</strong> {trip.driverResponseReason}
                      </p>
                      <button
                        onClick={() => handleOpenTrip(trip.id)}
                        className="w-full py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold flex items-center justify-center gap-1"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>فتح ومراجعة الرحلة</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Recently Accepted Manager Trips */}
              {driverAcceptedManagerTrips.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>رحلات وافق عليها السائق ({driverAcceptedManagerTrips.length})</span>
                  </h3>
                  {driverAcceptedManagerTrips.map((trip) => (
                    <div
                      key={trip.id}
                      className="bg-white border border-emerald-200 rounded-xl p-3 space-y-1.5 shadow-xs text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-slate-900">{trip.tripNumber}</span>
                        <span className="text-[11px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">
                          ✓ وافق السائق
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600">
                        وافق {trip.driverName} على {trip.customerStops.length} وجهات ({trip.initialLoadLiters.toLocaleString()} لتر)
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Pending Trip Approvals */}
              {pendingApprovalTrips.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span>مخططات رحلات بانتظار اعتمادك ({pendingApprovalTrips.length})</span>
                  </h3>
                  {pendingApprovalTrips.map((trip) => (
                    <div
                      key={trip.id}
                      className="bg-white border border-amber-200 rounded-xl p-3 space-y-2 shadow-xs text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-slate-900">{trip.tripNumber}</span>
                        <span className="text-[11px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-semibold">
                          بانتظار الاعتماد
                        </span>
                      </div>
                      <p className="text-slate-600">
                        {trip.customerStops.length} وجهات · {trip.initialLoadLiters.toLocaleString()} لتر · السائق: {trip.driverName}
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => approveTrip(trip.id, 'اعتماد سريع من مركز الإشعارات')}
                          className="flex-1 py-1.5 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center justify-center gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>اعتماد فوري</span>
                        </button>
                        <button
                          onClick={() => handleOpenTrip(trip.id)}
                          className="py-1.5 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold flex items-center gap-1"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>مراجعة</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pending Modification Requests */}
              {pendingModRequests.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-sky-900 flex items-center gap-1.5">
                    <Edit3 className="w-4 h-4 text-sky-600" />
                    <span>طلبات تعديل من السائق ({pendingModRequests.length})</span>
                  </h3>
                  {pendingModRequests.map(({ tripId, tripNumber, request }) => (
                    <div
                      key={request.id}
                      className="bg-white border border-sky-200 rounded-xl p-3 space-y-2 shadow-xs text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-slate-900">{tripNumber}</span>
                        <span className="text-[11px] bg-sky-100 text-sky-800 px-2 py-0.5 rounded font-semibold">
                          طلب تعديل مسار
                        </span>
                      </div>
                      <p className="text-slate-700 font-medium">{request.reason}</p>
                      <p className="text-[11px] text-slate-500">
                        المقترح: {request.proposedStops.length} وجهات ({request.proposedTotalLiters.toLocaleString()} لتر)
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => approveTripModification(tripId, request.id)}
                          className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold"
                        >
                          موافقة على التعديل
                        </button>
                        <button
                          onClick={() => rejectTripModification(tripId, request.id)}
                          className="py-1.5 px-3 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg font-bold"
                        >
                          رفض
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Trips Returned & Pending Review */}
              {pendingReviewTrips.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                    <Navigation className="w-4 h-4 text-indigo-600" />
                    <span>رحلات مكتملة بانتظار المراجعة والإغلاق ({pendingReviewTrips.length})</span>
                  </h3>
                  {pendingReviewTrips.map((trip) => (
                    <div
                      key={trip.id}
                      className="bg-white border border-indigo-200 rounded-xl p-3 space-y-2 shadow-xs text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-slate-900">{trip.tripNumber}</span>
                        <span className="text-[11px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-semibold">
                          بانتظار المراجعة
                        </span>
                      </div>
                      <p className="text-slate-600">
                        سُلّم {trip.deliveredLiters.toLocaleString()} لتر · {(trip.gpsPoints || []).length} نقطة GPS · {(trip.detectedStops || []).length} توقفات
                      </p>
                      <button
                        onClick={() => handleOpenTrip(trip.id)}
                        className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold flex items-center justify-center gap-1"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>فتح خريطة المسار والتوقفات للإغلاق</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Active Manager Directives Status */}
              {directives.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <h3 className="text-xs font-bold text-slate-700">حالة التوجيهات المرسلة للسائق</h3>
                  {directives.slice(0, 5).map((d) => (
                    <div key={d.id} className="bg-white border border-slate-200 rounded-xl p-2.5 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800">{d.title}</span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                            d.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : d.status === 'acknowledged'
                              ? 'bg-sky-100 text-sky-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {d.status === 'completed'
                            ? 'أنجزها السائق'
                            : d.status === 'acknowledged'
                            ? 'استلمها السائق'
                            : 'بانتظار استلام السائق'}
                        </span>
                      </div>
                      <p className="text-slate-600 text-[11px]">{d.message}</p>
                      {d.driverReply && (
                        <p className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                          رد السائق: {d.driverReply}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: LIVE DRIVER ACTIONS FEED */}
          {activeTab === 'feed' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">
                  أحدث ما قام به السائق ({managerNotifications.length})
                </span>
                {unreadManagerCount > 0 && (
                  <button
                    onClick={() => markNotificationsRead({ markAll: true, role: 'manager' })}
                    className="text-[11px] text-sky-700 hover:text-sky-900 font-semibold flex items-center gap-1"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>تحديد الكل كمقروء</span>
                  </button>
                )}
              </div>

              {managerNotifications.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-slate-500 text-xs">
                  ستظهر هنا فورياً جميع إجراءات السائق (بدء الرحلة، التسليم، التوقفات، العودة للمصنع، والمزامنة).
                </div>
              ) : (
                managerNotifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => {
                      if (!n.isRead) markNotificationsRead({ ids: [n.id] });
                      if (n.tripId) {
                        handleOpenTrip(n.tripId);
                      } else if (n.actionTab === 'driver_mgmt') {
                        setManagerTab('driver_mgmt');
                        onClose();
                      } else if (n.actionTab === 'orders') {
                        setManagerTab('orders');
                        onClose();
                      }
                    }}
                    className={`p-3 rounded-xl border text-xs space-y-1 cursor-pointer transition-all ${
                      n.isRead
                        ? 'bg-white border-slate-200 text-slate-700'
                        : 'bg-sky-50/90 border-sky-300 text-slate-900 shadow-xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold leading-snug">{n.title}</span>
                      {!n.isRead && (
                        <span className="w-2 h-2 rounded-full bg-sky-600 shrink-0 mt-1" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">{n.message}</p>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                      <span>{n.actorName}</span>
                      <span>{new Date(n.createdAt).toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 3: SEND DIRECTIVE TO DRIVER */}
          {activeTab === 'send' && (
            <div className="space-y-4 text-xs">
              <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-sky-900 text-[11px] leading-relaxed">
                يصل التوجيه أو الطلب فوراً كتنبيه عاجل على شاشة تطبيق السائق، ويمكنه تأكيد الاستلام والإنجاز لتراه لحظياً هنا.
              </div>

              <div className="space-y-1.5">
                <span className="font-bold text-slate-700 block">قوالب سريعة:</span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      handleQuickDirectivePreset(
                        'توجه فوراً لطلب ماء عاجل',
                        'يرجى التوجه لتغطية الطلب العاجل وتحديث حالة التسليم فور الوصول.',
                        'urgent'
                      )
                    }
                    className="px-2.5 py-1 bg-white border border-slate-300 hover:border-sky-500 rounded-lg text-[11px] text-slate-700"
                  >
                    توجيه لطلب عاجل
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleQuickDirectivePreset(
                        'العودة إلى المصنع فوراً',
                        'يرجى إنهاء التوصيل الحالي والعودة إلى موقع المصنع لتعبئة شحنة جديدة.',
                        'urgent'
                      )
                    }
                    className="px-2.5 py-1 bg-white border border-slate-300 hover:border-sky-500 rounded-lg text-[11px] text-slate-700"
                  >
                    العودة للمصنع
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleQuickDirectivePreset(
                        'تأكيد التحصيل النقدي وتسوية العهدة',
                        'يرجى مراجعة مبالغ الفواتير المحصلة والتسوية عند العودة للمصنع.',
                        'normal'
                      )
                    }
                    className="px-2.5 py-1 bg-white border border-slate-300 hover:border-sky-500 rounded-lg text-[11px] text-slate-700"
                  >
                    مراجعة تحصيل
                  </button>
                </div>
              </div>

              <form onSubmit={handleSendDirective} className="space-y-3 bg-white p-3.5 rounded-xl border border-slate-200">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">عنوان المطلوب من السائق:</label>
                  <input
                    type="text"
                    required
                    value={dirTitle}
                    onChange={(e) => setDirTitle(e.target.value)}
                    placeholder="مثال: توصيل أولوية لحي الروضة"
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">التفاصيل والتعليمات:</label>
                  <textarea
                    required
                    rows={3}
                    value={dirMessage}
                    onChange={(e) => setDirMessage(e.target.value)}
                    placeholder="اكتب ما تريده من السائق بوضوح..."
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dirPriority === 'urgent'}
                      onChange={(e) => setDirPriority(e.target.checked ? 'urgent' : 'normal')}
                      className="rounded text-rose-600"
                    />
                    <span className="font-bold text-rose-700">تنبيه عاجل وفوري</span>
                  </label>
                  {activeTrip && (
                    <span className="text-[10px] font-mono text-slate-500">
                      مرتبط بـ {activeTrip.tripNumber}
                    </span>
                  )}
                </div>

                {dirFeedback && (
                  <div className="p-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-[11px] font-semibold">
                    {dirFeedback}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSendingDir}
                  className="w-full py-2.5 bg-sky-700 hover:bg-sky-800 text-white rounded-lg font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
                >
                  <Send className="w-4 h-4" />
                  <span>{isSendingDir ? 'جاري الإرسال...' : 'إرسال التوجيه فوراً للسائق'}</span>
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
