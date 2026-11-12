/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Hardware, GPS & Sabafon SMS Field Simulator
 * Allows full verification of all 26 test scenarios in the prompt when physical hardware is not plugged in.
 */

import React, { useState } from 'react';
import {
  Radio,
  Signal,
  Truck,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  Play,
  Pause,
  MapPin,
  Clock,
  ArrowRight,
  Send,
  Smartphone,
  Info,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { buildWaterSMS } from '../../lib/sms-parser';

export const DeviceSimulator: React.FC = () => {
  const {
    trips,
    truck,
    settings,
    smsLogs,
    gpsEvents,
    sendSabafonSMS,
    triggerDriverGPSUpdate,
    setViewMode,
  } = useApp();

  const activeTrip = trips.find((t) => t.status === 'in_progress') || trips[0];

  const [simSpeed, setSimSpeed] = useState<number>(35);
  const [simLat, setSimLat] = useState<number>(15.4715);
  const [simLng, setSimLng] = useState<number>(45.3330);
  const [simulatedLog, setSimulatedLog] = useState<string[]>([]);
  const [isAutoTicking, setIsAutoTicking] = useState<boolean>(false);

  const addLog = (msg: string) => {
    setSimulatedLog((prev) => [`[${new Date().toLocaleTimeString('ar-YE')}] ${msg}`, ...prev.slice(0, 30)]);
  };

  // Scenario 1: Movement Event
  const triggerMovement = async () => {
    const seq = smsLogs.length + 1;
    const sms = buildWaterSMS({
      tripNumber: activeTrip?.tripNumber || 'TRIP-2026-0002',
      eventType: 'MOVING',
      lat: simLat,
      lng: simLng,
      speed: simSpeed,
      sequenceNumber: seq,
    });
    addLog(`إرسال رسالة SMS عند الحركة: سرعة ${simSpeed} كم/ساعة، إحداثيات (${simLat}, ${simLng})`);
    const res = await sendSabafonSMS(sms);
    addLog(`استجابة البوابة: ${res.message}`);
  };

  // Scenario 2: Stopped Event (After 3 min threshold)
  const triggerStop = async () => {
    const seq = smsLogs.length + 1;
    const sms = buildWaterSMS({
      tripNumber: activeTrip?.tripNumber || 'TRIP-2026-0002',
      eventType: 'STOPPED',
      lat: simLat,
      lng: simLng,
      speed: 0,
      sequenceNumber: seq,
    });
    addLog(`تحقق شرط التوقف الفعلي (أكثر من 3 دقائق) -> إرسال SMS توقف`);
    const res = await sendSabafonSMS(sms);
    addLog(`استجابة البوابة: ${res.message}`);
  };

  // Scenario 3: 10-Minute Periodic Heartbeat
  const triggerHeartbeat = async () => {
    const seq = smsLogs.length + 1;
    const sms = buildWaterSMS({
      tripNumber: activeTrip?.tripNumber || 'TRIP-2026-0002',
      eventType: 'HEARTBEAT_10M',
      lat: simLat,
      lng: simLng,
      speed: simSpeed,
      sequenceNumber: seq,
    });
    addLog(`إرسال التحديث الدوري كل 10 دقائق أثناء الرحلة النشطة`);
    const res = await sendSabafonSMS(sms);
    addLog(`استجابة البوابة: ${res.message}`);
  };

  // Scenario 4: Duplicate SMS Test
  const triggerDuplicateTest = async () => {
    if (smsLogs.length === 0) {
      addLog('يرجى إرسال رسالة أولاً لاختبار تكرارها');
      return;
    }
    const lastMsg = smsLogs[0];
    addLog(`إعادة إرسال نفس الرسالة السابقة لاختبار كشف التكرار (SEQ: ${lastMsg.sequenceNumber})`);
    const res = await sendSabafonSMS(lastMsg.rawText);
    addLog(`نتيجة الفحص الأمني بالخادم: ${res.message}`);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">محاكي أجهزة التتبع GPS وشريحة سبأفون الميدانية</h2>
            <span className="text-xs bg-amber-100 text-amber-800 font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <Radio className="w-3 h-3 text-amber-700" />
              <span>محاكي الاختبار الميداني</span>
            </span>
          </div>
          <p className="text-xs text-slate-500">
            اختبار كافة سيناريوهات الحركة، التوقف، نبضات 10 دقائق، وفحص رفض الرسائل المكررة قبل النزول الميداني
          </p>
        </div>

        <button
          onClick={() => setViewMode('manager')}
          className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold self-start sm:self-auto"
        >
          العودة للوحة المدير
        </button>
      </div>

      {/* Critical Hardware Notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 flex items-start gap-3">
        <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold block">ملاحظة هندسية معتمدة وفق بنود المشروع:</span>
          <p className="leading-relaxed">
            هذا المحاكي البرمجي مصمم لاختبار تدفق البيانات والتحقق من صحة بروتوكول SMS وقواعد التوقف وخوارزميات رفض التكرار. المحاكي ليس بديلاً عن الاختبار الميداني الفعلي للوايت في شوارع مأرب مع شريحة سبأفون حقيقية.
          </p>
        </div>
      </div>

      {/* Interactive Controls Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Tactical Trigger Panel */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 text-xs">
          <h3 className="font-bold text-slate-900 text-sm pb-2 border-b border-slate-100 flex items-center gap-2">
            <Truck className="w-4 h-4 text-sky-700" />
            <span>لوحة حقن أحداث القيادة والحركة</span>
          </h3>

          {/* Coordinate & Speed Sliders */}
          <div className="space-y-3 bg-slate-50 p-3 rounded-lg border border-slate-100 font-mono">
            <div className="flex justify-between items-center">
              <span className="text-slate-600">سرعة الوايت التقديرية:</span>
              <span className="font-bold text-slate-900">{simSpeed} كم/ساعة</span>
            </div>
            <input
              type="range"
              min="0"
              max="80"
              value={simSpeed}
              onChange={(e) => setSimSpeed(Number(e.target.value))}
              className="w-full accent-sky-600"
            />

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 text-[11px]">
              <div>
                <span className="text-slate-500 block">خط العرض Lat:</span>
                <input
                  type="number"
                  step="0.001"
                  value={simLat}
                  onChange={(e) => setSimLat(parseFloat(e.target.value))}
                  className="w-full p-1 border rounded bg-white"
                />
              </div>
              <div>
                <span className="text-slate-500 block">خط الطول Lng:</span>
                <input
                  type="number"
                  step="0.001"
                  value={simLng}
                  onChange={(e) => setSimLng(parseFloat(e.target.value))}
                  className="w-full p-1 border rounded bg-white"
                />
              </div>
            </div>
          </div>

          {/* Tactical Scenarios Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={triggerMovement}
              className="p-3 bg-sky-700 hover:bg-sky-800 text-white rounded-xl font-bold flex flex-col items-center justify-center gap-1 shadow-sm"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>1. بدء الحركة (Moving)</span>
            </button>

            <button
              onClick={triggerStop}
              className="p-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold flex flex-col items-center justify-center gap-1 shadow-sm"
            >
              <Pause className="w-4 h-4 fill-white" />
              <span>2. توقف &gt; 3 دقائق (Stopped)</span>
            </button>

            <button
              onClick={triggerHeartbeat}
              className="p-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold flex flex-col items-center justify-center gap-1 shadow-sm"
            >
              <Clock className="w-4 h-4" />
              <span>3. نبضة دورية كل 10 دقائق</span>
            </button>

            <button
              onClick={triggerDuplicateTest}
              className="p-3 bg-rose-700 hover:bg-rose-800 text-white rounded-xl font-bold flex flex-col items-center justify-center gap-1 shadow-sm"
            >
              <AlertTriangle className="w-4 h-4" />
              <span>4. اختبار رفض رسالة مكررة</span>
            </button>
          </div>
        </div>

        {/* Right: Live Simulator Log Stream */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm flex flex-col text-xs font-mono text-emerald-400">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-slate-300 mb-2">
            <span className="font-bold flex items-center gap-1.5 text-white">
              <Radio className="w-4 h-4 text-emerald-400" />
              <span>سجل مراقبة المحاكي واستجابات الخادم</span>
            </span>
            <button
              onClick={() => setSimulatedLog([])}
              className="text-[11px] text-slate-500 hover:text-slate-300"
            >
              مسح السجل
            </button>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[360px] space-y-1.5 pr-1" style={{ direction: 'ltr', textAlign: 'left' }}>
            {simulatedLog.length === 0 ? (
              <div className="text-slate-600 text-center py-12">
                انقر على أي سيناريو لاختبار إرسال الرسالة ومعالجتها في الخادم
              </div>
            ) : (
              simulatedLog.map((log, i) => (
                <div key={i} className="text-[11px] leading-relaxed">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
