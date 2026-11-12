/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Driver Android PWA & Offline-First Interface
 * Dedicated tactical app for water truck drivers in Marib with high-contrast UI,
 * large touch targets, offline queueing, GPS/SMS status, and step-by-step delivery workflow.
 */

import React, { useState } from 'react';
import {
  Smartphone,
  Truck,
  Wifi,
  WifiOff,
  Signal,
  MapPin,
  Play,
  CheckCircle,
  Phone,
  DollarSign,
  Plus,
  RotateCcw,
  RefreshCw,
  Droplet,
  ArrowRight,
  Send,
  Radio,
  Clock,
  Home,
  User,
  LogOut,
  Lock,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { TripCustomerStop } from '../../types';
import { ManagerPinModal } from '../auth/ManagerPinModal';
import { LocationPickerMapModal } from '../common/LocationPickerMapModal';

export const DriverApp: React.FC = () => {
  const {
    trips,
    truck,
    customers,
    isOnline,
    setIsOnline,
    offlineState,
    logDeliveryStop,
    startTrip,
    completeTrip,
    addOrder,
    syncOfflineData,
    triggerDriverGPSUpdate,
    settings,
    setViewMode,
    logoutToRoleSelection,
    selectRole,
  } = useApp();

  const [showManagerPinModal, setShowManagerPinModal] = useState(false);

  // Active Trip
  const activeTrip = trips.find((t) => t.status === 'in_progress' || t.status === 'approved') || trips[0];

  const [activeTab, setActiveTab] = useState<'current_trip' | 'new_order' | 'offline_queue'>('current_trip');
  const [selectedStopIndex, setSelectedStopIndex] = useState(0);

  // Delivery Form State
  const [deliveredInput, setDeliveredInput] = useState<number>(0);
  const [paidInput, setPaidInput] = useState<number>(0);
  const [deliveryNotes, setDeliveryNotes] = useState<string>('');
  const [unloadingActive, setUnloadingActive] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
  const [hasPickedFromMap, setHasPickedFromMap] = useState(false);

  // Quick Offline Order Form
  const [newOrderForm, setNewOrderForm] = useState({
    customerName: '',
    phone: '',
    district: 'حي الروضة',
    addressDetails: '',
    tankCapacity: 2000,
    requestedLiters: 1500,
    lat: 15.4712,
    lng: 45.3340,
    notes: '',
  });

  const currentStop: TripCustomerStop | undefined = activeTrip?.customerStops[selectedStopIndex];

  // Initialize stop input values when selecting a stop
  const handleSelectStop = (index: number) => {
    setSelectedStopIndex(index);
    const stop = activeTrip?.customerStops[index];
    if (stop) {
      setDeliveredInput(stop.deliveredLiters > 0 ? stop.deliveredLiters : stop.requestedLiters);
      setPaidInput(stop.paidAmount > 0 ? stop.paidAmount : stop.totalAmount);
      setDeliveryNotes(stop.notes || '');
      setUnloadingActive(stop.status === 'unloading');
    }
  };

  // Step 1: Arrive at Customer
  const handleArriveAtCustomer = () => {
    if (!currentStop) return;
    triggerDriverGPSUpdate('ARRIVAL', currentStop.lat, currentStop.lng, 0);
  };

  // Step 2: Start Unloading
  const handleStartUnloading = () => {
    setUnloadingActive(true);
  };

  // Step 3: Confirm Delivery
  const handleConfirmDelivery = async () => {
    if (!activeTrip || !currentStop) return;
    setIsSubmitting(true);
    try {
      const remainingAmount = Math.max(0, deliveredInput * currentStop.pricePerLiter - paidInput);

      await logDeliveryStop({
        tripId: activeTrip.id,
        orderId: currentStop.orderId,
        deliveredLiters: Number(deliveredInput),
        paidAmount: Number(paidInput),
        remainingAmount,
        notes: deliveryNotes,
      });

      setUnloadingActive(false);

      // Advance to next stop if available
      if (selectedStopIndex < activeTrip.customerStops.length - 1) {
        handleSelectStop(selectedStopIndex + 1);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 4: Depart from Customer
  const handleDepartCustomer = () => {
    if (!currentStop) return;
    triggerDriverGPSUpdate('DEPARTURE', currentStop.lat, currentStop.lng, 15);
  };

  // Handle Quick Offline Order Submission
  const handleSaveOfflineOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrderForm.customerName || !newOrderForm.phone) return;

    await addOrder({
      customerName: newOrderForm.customerName,
      phone: newOrderForm.phone,
      district: newOrderForm.district,
      addressDetails: newOrderForm.addressDetails,
      tankCapacity: Number(newOrderForm.tankCapacity),
      requestedLiters: Number(newOrderForm.requestedLiters),
      pricePerLiter: settings.defaultSellingPricePerLiter,
      totalAmount: Number(newOrderForm.requestedLiters) * settings.defaultSellingPricePerLiter,
      source: 'driver_manual',
      notes: newOrderForm.notes,
    });

    setNewOrderForm({
      customerName: '',
      phone: '',
      district: 'حي الروضة',
      addressDetails: '',
      tankCapacity: 2000,
      requestedLiters: 1500,
      lat: 15.4712,
      lng: 45.3340,
      notes: '',
    });
    setHasPickedFromMap(false);
    setActiveTab('current_trip');
  };

  // Pending items count
  const pendingQueueCount =
    offlineState.pendingDeliveries.length +
    offlineState.pendingOrders.length +
    offlineState.pendingGpsEvents.length;

  return (
    <div className="w-full min-h-screen sm:max-w-md sm:mx-auto bg-slate-900 text-white flex flex-col font-sans pb-12 sm:my-3 sm:rounded-2xl sm:border sm:border-slate-800 shadow-2xl overflow-hidden">
      {/* Top Android Bar: Network & Hardware Status */}
      <div className="bg-slate-950 px-3 py-2 flex items-center justify-between text-xs border-b border-slate-800">
        <div className="flex items-center gap-2">
          {/* Switch Role / Exit to Main Screen */}
          <button
            onClick={logoutToRoleSelection}
            title="تبديل الحساب أو الرجوع لشاشة الاختيار"
            className="p-1 text-slate-400 hover:text-white rounded bg-slate-800/80 hover:bg-slate-700 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5 rotate-180" />
          </button>
          <span className="font-bold text-sky-400 text-xs">مياهنا · السائق</span>
          <span className="text-slate-400 font-mono text-[10px] hidden xs:inline">{truck.driverName}</span>
        </div>

        {/* Network Toggle Simulator for Field Testing & Switch to Manager */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowManagerPinModal(true)}
            title="دخول لوحة المدير العام"
            className="px-2 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1"
          >
            <Lock className="w-3 h-3 text-amber-400" />
            <span>المدير</span>
          </button>

          <button
            onClick={() => setIsOnline(!isOnline)}
            title="تبديل محاكاة اتصال الإنترنت"
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
              isOnline ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
            }`}
          >
            {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            <span>{isOnline ? 'متصل' : 'دون نت'}</span>
          </button>

          <div className="flex items-center gap-1 text-slate-400 text-[10px]">
            <Signal className="w-3 h-3 text-sky-400" />
            <span>سبأفون</span>
          </div>
        </div>
      </div>

      {/* Main Truck Water Gauge Strip */}
      <div className="bg-slate-800/80 p-3 border-b border-slate-700">
        <div className="flex items-center justify-between text-xs mb-1">
          <div className="flex items-center gap-1.5 text-slate-300">
            <Truck className="w-4 h-4 text-sky-400" />
            <span>وايت مياه 6,000L ({truck.plateNumber})</span>
          </div>
          <span className="font-mono text-emerald-400 font-bold">
            {activeTrip ? activeTrip.remainingLiters.toLocaleString() : '6,000'} لتر متبقي
          </span>
        </div>

        {/* Gauge bar */}
        <div className="w-full bg-slate-700 rounded-full h-2.5 overflow-hidden">
          <div
            className="bg-sky-500 h-2.5 rounded-full transition-all duration-500"
            style={{
              width: `${activeTrip ? (activeTrip.remainingLiters / 6000) * 100 : 100}%`,
            }}
          />
        </div>
      </div>

      {/* Driver Tabs (Large tactile buttons) */}
      <div className="grid grid-cols-3 gap-1 p-2 bg-slate-950 border-b border-slate-800 text-xs">
        <button
          onClick={() => setActiveTab('current_trip')}
          className={`py-2 rounded-lg font-bold transition-all ${
            activeTab === 'current_trip' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          الرحلة الحالية
        </button>
        <button
          onClick={() => setActiveTab('new_order')}
          className={`py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1 ${
            activeTab === 'new_order' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>طلب جديد</span>
        </button>
        <button
          onClick={() => setActiveTab('offline_queue')}
          className={`py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1 ${
            activeTab === 'offline_queue' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <RefreshCw className="w-3 h-3" />
          <span>المزامنة ({pendingQueueCount})</span>
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 p-3 overflow-y-auto space-y-4">
        {/* Tab 1: Current Trip & Delivery Workflow */}
        {activeTab === 'current_trip' && (
          <div className="space-y-4">
            {/* Trip Status Banner */}
            {activeTrip ? (
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sky-400">{activeTrip.tripNumber}</span>
                    <span className="text-[10px] bg-sky-900/60 text-sky-200 px-2 py-0.5 rounded font-semibold">
                      {activeTrip.status === 'in_progress' ? 'قيد التوزيع' : 'معتمدة'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {activeTrip.customerStops.length} عملاء · تم توزيع {activeTrip.deliveredLiters.toLocaleString()}L
                  </div>
                </div>

                {activeTrip.status === 'approved' && (
                  <button
                    onClick={() => startTrip(activeTrip.id)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 shadow"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>انطلاق الوايت</span>
                  </button>
                )}

                {activeTrip.status === 'in_progress' && (
                  <button
                    onClick={() => completeTrip(activeTrip.id)}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-lg"
                  >
                    إنهاء والعودة
                  </button>
                )}
              </div>
            ) : (
              <div className="p-6 text-center text-slate-500 text-xs">
                لا توجد رحلة معتمدة حالياً للوايت. بانتظار اعتماد المدير.
              </div>
            )}

            {/* Customer Stop Queue Selector */}
            {activeTrip && (
              <div className="space-y-2">
                <div className="text-xs text-slate-400 font-semibold flex justify-between">
                  <span>محطات العملاء في خط السير:</span>
                  <span className="font-mono">{selectedStopIndex + 1} من {activeTrip.customerStops.length}</span>
                </div>

                {/* Horizontal Scroll of Stops */}
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {activeTrip.customerStops.map((stop, idx) => {
                    const isSelected = selectedStopIndex === idx;
                    const isDone = stop.status === 'delivered';
                    const isArrived = stop.status === 'arrived';

                    return (
                      <button
                        key={stop.orderId}
                        onClick={() => handleSelectStop(idx)}
                        className={`p-2.5 rounded-xl text-right min-w-[140px] shrink-0 border transition-all ${
                          isSelected
                            ? 'bg-sky-600 border-sky-400 text-white shadow-lg'
                            : isDone
                            ? 'bg-emerald-950/60 border-emerald-800 text-emerald-200'
                            : 'bg-slate-800 border-slate-700 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-bold text-[10px]">#{stop.stopSequence}</span>
                          <span className="text-[10px] font-mono">{stop.requestedLiters}L</span>
                        </div>
                        <div className="font-bold text-xs truncate">{stop.customerName}</div>
                        <div className="text-[10px] opacity-80 truncate">{stop.district}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Active Stop Tactical Card */}
            {currentStop && (
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 space-y-4">
                {/* Customer Identity */}
                <div className="flex items-start justify-between pb-3 border-b border-slate-700">
                  <div>
                    <span className="text-xs text-sky-400 font-bold block mb-0.5">
                      المحطة #{currentStop.stopSequence} · {currentStop.district}
                    </span>
                    <h3 className="font-bold text-base text-white">{currentStop.customerName}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{currentStop.addressDetails}</p>
                  </div>
                  <a
                    href={`tel:${currentStop.phone}`}
                    className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-500 shadow-lg"
                  >
                    <Phone className="w-5 h-5" />
                  </a>
                </div>

                {/* Tank Specs */}
                <div className="grid grid-cols-2 gap-2 text-xs bg-slate-900/60 p-3 rounded-xl border border-slate-700/60 font-mono">
                  <div>
                    <span className="text-slate-400 block text-[10px]">الكمية المطلوبة:</span>
                    <span className="text-sky-400 font-bold text-sm">{currentStop.requestedLiters.toLocaleString()} لتر</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">سعة خزان العميل:</span>
                    <span className="text-slate-300 font-bold text-sm">{currentStop.tankCapacity.toLocaleString()} لتر</span>
                  </div>
                </div>

                {/* Big Tactical Action Buttons (Step-by-step Flow) */}
                <div className="space-y-2.5 pt-2">
                  {/* Step 1: Arrival */}
                  <button
                    onClick={handleArriveAtCustomer}
                    className="w-full py-3.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg active:scale-98 transition-transform"
                  >
                    <MapPin className="w-5 h-5" />
                    <span>1. وصلت إلى العميل (إرسال SMS وصول)</span>
                  </button>

                  {/* Step 2: Unloading */}
                  {!unloadingActive ? (
                    <button
                      onClick={handleStartUnloading}
                      className="w-full py-3.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg active:scale-98 transition-transform"
                    >
                      <Droplet className="w-5 h-5 fill-white" />
                      <span>2. بدء تفريغ المياه بالخزان</span>
                    </button>
                  ) : (
                    /* Delivery Confirmation Form */
                    <div className="bg-slate-900 p-4 rounded-xl border border-sky-500 space-y-3">
                      <div className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                        <Droplet className="w-4 h-4 fill-sky-400" />
                        <span>تسجيل الكمية المسلمة والمبلغ المحصل نقداً</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">الكمية المسلمة (لتر) *</label>
                          <input
                            type="number"
                            value={deliveredInput}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setDeliveredInput(val);
                              setPaidInput(val * currentStop.pricePerLiter);
                            }}
                            className="w-full p-2.5 bg-slate-800 border border-slate-600 rounded-lg text-sm font-mono font-bold text-white text-center"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">المبلغ المستلم نقداً (ر.ي) *</label>
                          <input
                            type="number"
                            value={paidInput}
                            onChange={(e) => setPaidInput(Number(e.target.value))}
                            className="w-full p-2.5 bg-slate-800 border border-slate-600 rounded-lg text-sm font-mono font-bold text-emerald-400 text-center"
                          />
                        </div>
                      </div>

                      <button
                        onClick={handleConfirmDelivery}
                        disabled={isSubmitting}
                        className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg active:scale-98 transition-transform disabled:opacity-50"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>{isSubmitting ? 'جاري الحفظ...' : 'تأكيد التسليم وإصدار الفاتورة'}</span>
                      </button>
                    </div>
                  )}

                  {/* Step 3: Departure */}
                  <button
                    onClick={handleDepartCustomer}
                    className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold rounded-xl text-xs flex items-center justify-center gap-2 active:scale-98 transition-transform"
                  >
                    <ArrowRight className="w-4 h-4 rotate-180" />
                    <span>3. مغادرة العميل (إرسال SMS مغادرة)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: New Order Quick Entry (On the road) */}
        {activeTab === 'new_order' && (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 space-y-4 text-xs">
            <h3 className="font-bold text-sm text-sky-400 flex items-center gap-2">
              <Plus className="w-4 h-4" />
              <span>تسجيل طلب مياه جديد من الميدان</span>
            </h3>
            <p className="text-slate-400 text-[11px]">
              إذا طلب منك أحد العملاء في مأرب تعبئة، سجله هنا وسيتم حفظه محلياً ومزامنته فور توفر الإنترنت.
            </p>

            <form onSubmit={handleSaveOfflineOrder} className="space-y-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">اسم العميل *</label>
                <input
                  type="text"
                  required
                  value={newOrderForm.customerName}
                  onChange={(e) => setNewOrderForm({ ...newOrderForm, customerName: e.target.value })}
                  placeholder="مثال: صالح العبيدي"
                  className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">رقم هاتف سبأفون *</label>
                <input
                  type="text"
                  required
                  value={newOrderForm.phone}
                  onChange={(e) => setNewOrderForm({ ...newOrderForm, phone: e.target.value })}
                  placeholder="71xxxxxxx"
                  className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">الحي بمأرب</label>
                  <select
                    value={newOrderForm.district}
                    onChange={(e) => setNewOrderForm({ ...newOrderForm, district: e.target.value })}
                    className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
                  >
                    <option value="حي الروضة">حي الروضة</option>
                    <option value="حي الشركة">حي الشركة</option>
                    <option value="المجمع الحكومي">المجمع الحكومي</option>
                    <option value="حي السلام">حي السلام</option>
                    <option value="حي المطار">حي المطار</option>
                    <option value="حي الفاو">حي الفاو</option>
                    <option value="الخسيف">الخسيف</option>
                    <option value="حصون آل جلال">حصون آل جلال</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">الكمية المطلوبة (لتر)</label>
                  <input
                    type="number"
                    value={newOrderForm.requestedLiters}
                    onChange={(e) => setNewOrderForm({ ...newOrderForm, requestedLiters: Number(e.target.value) })}
                    className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">العنوان أو علامة بارزة</label>
                <input
                  type="text"
                  value={newOrderForm.addressDetails}
                  onChange={(e) => setNewOrderForm({ ...newOrderForm, addressDetails: e.target.value })}
                  placeholder="خلف المسجد / جوار البقالة"
                  className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
                />
              </div>

              {/* Map Pin Selector Card */}
              <div className="bg-slate-900/90 border border-slate-700 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-rose-500" />
                    <span className="text-slate-200 font-bold text-xs">موقع خزان العميل الجغرافي</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMapPickerOpen(true)}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{hasPickedFromMap ? 'تعديل الدبوس' : 'تحديد بالدبوس على الخريطة'}</span>
                  </button>
                </div>
                {hasPickedFromMap ? (
                  <div className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1.5 bg-emerald-950/40 p-2 rounded-lg border border-emerald-800/40">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>تم تثبيت الدبوس في: {newOrderForm.district} ({newOrderForm.lat?.toFixed(5)}, {newOrderForm.lng?.toFixed(5)})</span>
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400">
                    ضع دبوس على الخريطة لمساعدة خوارزمية التجميع وترتيب محطات الوايت.
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 mt-2 shadow"
              >
                <CheckCircle className="w-4 h-4" />
                <span>حفظ الطلب محلياً في الهاتف</span>
              </button>
            </form>
          </div>
        )}

        {/* Tab 3: Offline Queue & Sync */}
        {activeTab === 'offline_queue' && (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 space-y-4 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-700">
              <h3 className="font-bold text-sm text-sky-400 flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                <span>طابور المزامنة المحلي (Offline Queue)</span>
              </h3>
              <span className="font-mono bg-slate-900 text-sky-400 px-2 py-0.5 rounded font-bold">
                {pendingQueueCount} عمليات معلقة
              </span>
            </div>

            <p className="text-slate-400 text-[11px] leading-relaxed">
              عند التواجد في المصنع وتوفر شبكة الواي فاي أو الإنترنت، اضغط زر المزامنة لنقل كافة عمليات التسليم والطلبات ونقاط GPS تلقائياً إلى خادم المصنع.
            </p>

            <button
              onClick={async () => {
                const count = await syncOfflineData();
                alert(`تم بنجاح مزامنة ${count} عمليات مع خادم المصنع المركزي!`);
              }}
              disabled={pendingQueueCount === 0}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow disabled:opacity-40"
            >
              <RefreshCw className="w-4 h-4" />
              <span>مزامنة كافة البيانات المعلقة الآن</span>
            </button>

            {/* List of Pending Items */}
            <div className="space-y-2 pt-2">
              <div className="text-slate-400 font-semibold text-[11px]">العمليات المحفوظة في الهاتف:</div>
              {offlineState.pendingDeliveries.map((d) => (
                <div key={d.id} className="p-2 bg-slate-900/80 rounded border border-slate-700 flex justify-between font-mono text-[11px]">
                  <span>تسليم: {d.deliveredLiters}L</span>
                  <span className="text-emerald-400">+{d.paidAmount} ر.ي</span>
                </div>
              ))}
              {offlineState.pendingOrders.map((o) => (
                <div key={o.id} className="p-2 bg-slate-900/80 rounded border border-slate-700 flex justify-between font-mono text-[11px]">
                  <span>طلب جديد: {o.customerName}</span>
                  <span className="text-sky-400">{o.requestedLiters}L</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Switch & Logout Controls */}
      <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-2 text-xs">
        <button
          onClick={logoutToRoleSelection}
          className="text-slate-400 hover:text-white flex items-center gap-1 font-semibold"
        >
          <LogOut className="w-3.5 h-3.5 rotate-180" />
          <span>تبديل الحساب / خروج</span>
        </button>

        <button
          onClick={() => setShowManagerPinModal(true)}
          className="text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1"
        >
          <Lock className="w-3.5 h-3.5 text-amber-400" />
          <span>لوحة المدير (برمز دخول)</span>
        </button>
      </div>

      {/* Manager PIN Modal when accessed from Driver */}
      <ManagerPinModal
        isOpen={showManagerPinModal}
        onClose={() => setShowManagerPinModal(false)}
        onSuccess={() => {
          selectRole('manager');
          setShowManagerPinModal(false);
        }}
      />

      {/* Driver Location Picker Map Modal */}
      <LocationPickerMapModal
        isOpen={isMapPickerOpen}
        onClose={() => setIsMapPickerOpen(false)}
        customerName={newOrderForm.customerName || 'عميل جديد'}
        initialLat={newOrderForm.lat}
        initialLng={newOrderForm.lng}
        initialDistrict={newOrderForm.district}
        existingCustomers={customers}
        settings={settings}
        onSelectLocation={({ lat, lng, district }) => {
          setNewOrderForm((prev) => ({
            ...prev,
            lat,
            lng,
            district: district || prev.district,
          }));
          setHasPickedFromMap(true);
        }}
      />
    </div>
  );
};
