/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Sabafon SMS Gateway Monitor & Ingestion Console
 * Real-time monitoring of Sabafon SMS messages, duplicate filtering, sequence tracking, and manual test injector.
 */

import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Signal,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Send,
  Radio,
  FileCode,
  Smartphone,
  Info,
  Edit2,
  Save,
  X,
  ClipboardPaste,
  Inbox,
  Copy,
  Check,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { buildWaterSMS, extractMultipleWaterSMS } from '../../lib/sms-parser';

export const SmsGatewayMonitor: React.FC = () => {
  const { smsLogs, settings, trips, sendSabafonSMS, importSabafonSMSBatch, updateSettings } = useApp();

  const [isEditingPhones, setIsEditingPhones] = useState(false);
  const [driverPhoneInput, setDriverPhoneInput] = useState(settings.driverSabafonNumber);
  const [centerPhoneInput, setCenterPhoneInput] = useState(settings.sabafonCenterNumber);

  // Manager Phone SMS Inbox Reader State
  const [inboxPasteText, setInboxPasteText] = useState('');
  const [inboxSenderInput, setInboxSenderInput] = useState(settings.driverSabafonNumber);
  useEffect(() => {
    setInboxSenderInput(settings.driverSabafonNumber);
  }, [settings.driverSabafonNumber]);
  const [isImportingInbox, setIsImportingInbox] = useState(false);
  const [inboxResult, setInboxResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showForwarderGuide, setShowForwarderGuide] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [testRawSMS, setTestRawSMS] = useState<string>(() => {
    const activeTrip = trips.find((t) => t.status === 'in_progress');
    return buildWaterSMS({
      tripNumber: activeTrip?.tripNumber || 'TRIP-2026-0002',
      eventType: 'MOVING',
      lat: 15.4705,
      lng: 45.3320,
      speed: 36,
      sequenceNumber: (smsLogs.length || 0) + 1,
    });
  });

  const [injectResult, setInjectResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSending, setIsSending] = useState(false);

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/sms/receive`
      : '/api/sms/receive';

  const forwarderJsonTemplate = `{\n  "from": "%from%",\n  "text": "%text%"\n}`;

  const handleCopySnippet = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handlePasteFromClipboard = async () => {
    setInboxResult(null);
    if (!navigator.clipboard?.readText) {
      setInboxResult({
        success: false,
        message: 'المتصفح لا يدعم القراءة المباشرة من الحافظة، قم باللصق يدوياً داخل الصندوق أدناه.',
      });
      return;
    }
    try {
      const clipText = await navigator.clipboard.readText();
      if (!clipText.trim()) {
        setInboxResult({
          success: false,
          message: 'الحافظة فارغة. انسخ رسالة السائق من تطبيق الرسائل أولاً ثم اضغط هنا.',
        });
        return;
      }
      setInboxPasteText(clipText);
      const extracted = extractMultipleWaterSMS(clipText);
      setIsImportingInbox(true);
      const res = await importSabafonSMSBatch(clipText, inboxSenderInput || settings.driverSabafonNumber);
      setInboxResult({
        success: res.success,
        message: `${res.message} (تم رصد ${extracted.length} رسالة تتبع)`,
      });
    } catch {
      setInboxResult({
        success: false,
        message: 'يرجى السماح باللصق أو لصق نص الرسالة يدوياً في المربع بالأسفل.',
      });
    } finally {
      setIsImportingInbox(false);
    }
  };

  const handleImportManualInbox = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inboxPasteText.trim()) return;
    setIsImportingInbox(true);
    setInboxResult(null);
    try {
      const res = await importSabafonSMSBatch(
        inboxPasteText,
        inboxSenderInput || settings.driverSabafonNumber
      );
      setInboxResult(res);
      if (res.success && (res.processedCount || 0) > 0) {
        setInboxPasteText('');
      }
    } finally {
      setIsImportingInbox(false);
    }
  };

  const handleReadAndroidBridgeInbox = async () => {
    setInboxResult(null);
    const bridge = typeof window !== 'undefined' ? window.MiyahnaAndroidSMS : undefined;
    if (!bridge || typeof bridge.readInbox !== 'function') {
      setInboxResult({
        success: false,
        message:
          'المتصفح القياسي (Chrome/Safari) يحظر قراءة صندوق الرسائل تلقائياً لأسباب أمنية. استخدم زر "لصق وقراءة من الحافظة" أعلاه أو فعّل الربط التلقائي بتطبيق SMS Forwarder بالأسفل.',
      });
      setShowForwarderGuide(true);
      return;
    }

    try {
      setIsImportingInbox(true);
      const raw = bridge.readInbox(settings.driverSabafonNumber);
      const blob = Array.isArray(raw) ? raw.join('\n\n') : String(raw || '');
      if (!blob.trim()) {
        setInboxResult({
          success: true,
          message: `لا توجد رسائل جديدة في جوال المدير من رقم السائق (${settings.driverSabafonNumber}).`,
        });
        return;
      }
      const res = await importSabafonSMSBatch(blob, settings.driverSabafonNumber);
      setInboxResult(res);
    } catch {
      setInboxResult({
        success: false,
        message: 'تعذر قراءة الرسائل عبر جسر Android WebView.',
      });
    } finally {
      setIsImportingInbox(false);
    }
  };

  const handleInjectSMS = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testRawSMS.trim()) return;

    setIsSending(true);
    setInjectResult(null);

    try {
      const res = await sendSabafonSMS(testRawSMS);
      setInjectResult(res);
      // Auto increment sequence for next test
      const nextSeq = smsLogs.length + 2;
      const activeTrip = trips.find((t) => t.status === 'in_progress');
      setTestRawSMS(
        buildWaterSMS({
          tripNumber: activeTrip?.tripNumber || 'TRIP-2026-0002',
          eventType: 'HEARTBEAT_10M',
          lat: 15.4715,
          lng: 45.3335,
          speed: 25,
          sequenceNumber: nextSeq,
        })
      );
    } catch (err) {
      console.error(err);
      setInjectResult({ success: false, message: 'فشل إرسال الرسالة إلى البوابة' });
    } finally {
      setIsSending(false);
    }
  };

  const processedCount = smsLogs.filter((s) => s.status === 'processed').length;
  const duplicateCount = smsLogs.filter((s) => s.status === 'duplicate_rejected').length;
  const invalidCount = smsLogs.filter((s) => s.status === 'invalid_format').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">بوابة استقبال رسائل SMS وتتبع الوايت (سبأفون)</h2>
            <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
              <Signal className="w-3 h-3 text-emerald-700" />
              <span>البوابة متصلة</span>
            </span>
          </div>
          <p className="text-xs text-slate-500">
            استقبال وتدقيق رسائل التتبع المشفرة من شريحة السائق سبأفون عبر مودم المصنع دون الحاجة للإنترنت
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          {!isEditingPhones ? (
            <>
              <div className="bg-sky-50 border border-sky-200 px-3 py-1.5 rounded-lg text-sky-900 flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-sky-700" />
                <span>رقم السائق:</span>
                <span className="font-bold text-sky-950">{settings.driverSabafonNumber}</span>
              </div>
              <div className="bg-slate-100 px-3 py-1.5 rounded-lg text-slate-700">
                <span>رقم المدير:</span>
                <span className="font-bold text-sky-700 mr-1">{settings.sabafonCenterNumber}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDriverPhoneInput(settings.driverSabafonNumber);
                  setCenterPhoneInput(settings.sabafonCenterNumber);
                  setIsEditingPhones(true);
                }}
                className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-sky-800 rounded-lg font-sans font-bold flex items-center gap-1 cursor-pointer shadow-xs"
                title="تعديل أرقام السائق والمدير"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>تعديل الأرقام</span>
              </button>
            </>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await updateSettings({
                  driverSabafonNumber: driverPhoneInput.trim(),
                  sabafonCenterNumber: centerPhoneInput.trim(),
                });
                setIsEditingPhones(false);
              }}
              className="flex flex-wrap items-center gap-2 bg-sky-50 border border-sky-300 p-2 rounded-xl font-sans"
            >
              <label className="flex items-center gap-1 text-[11px] font-bold text-sky-900">
                <span>السائق:</span>
                <input
                  type="text"
                  required
                  value={driverPhoneInput}
                  onChange={(e) => setDriverPhoneInput(e.target.value)}
                  className="w-28 px-2 py-1 bg-white border border-sky-200 rounded font-mono text-xs"
                />
              </label>
              <label className="flex items-center gap-1 text-[11px] font-bold text-slate-800">
                <span>المدير:</span>
                <input
                  type="text"
                  required
                  value={centerPhoneInput}
                  onChange={(e) => setCenterPhoneInput(e.target.value)}
                  className="w-28 px-2 py-1 bg-white border border-slate-200 rounded font-mono text-xs"
                />
              </label>
              <button
                type="submit"
                className="px-2.5 py-1 bg-sky-700 hover:bg-sky-800 text-white rounded font-bold flex items-center gap-1 cursor-pointer"
              >
                <Save className="w-3 h-3" />
                <span>حفظ</span>
              </button>
              <button
                type="button"
                onClick={() => setIsEditingPhones(false)}
                className="p-1 text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </form>
          )}
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
          <span className="text-slate-500 block text-[11px]">إجمالي الرسائل المستلمة</span>
          <span className="font-bold font-mono text-slate-900 text-base">{smsLogs.length}</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
          <span className="text-slate-500 block text-[11px]">رسائل مقبولة وموثقة</span>
          <span className="font-bold font-mono text-emerald-700 text-base">{processedCount}</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
          <span className="text-slate-500 block text-[11px]">رسائل مكررة تم رفضها</span>
          <span className="font-bold font-mono text-amber-700 text-base">{duplicateCount}</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
          <span className="text-slate-500 block text-[11px]">تنسيق غير صالح / مشوه</span>
          <span className="font-bold font-mono text-rose-700 text-base">{invalidCount}</span>
        </div>
      </div>

      {/* Manager Phone SMS Reader & Automatic Forwarder Integration */}
      <div className="bg-white border border-sky-200 rounded-2xl p-4 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700 shrink-0">
              <Inbox className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                قراءة رسائل جوال المدير الواردة من السائق ({settings.driverSabafonNumber})
              </h3>
              <p className="text-[11px] text-slate-500">
                استيراد رسائل التتبع الواردة لجوال المدير ({settings.sabafonCenterNumber}) وتحديث موقع الوايت والمحطات على الخريطة فوراً
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePasteFromClipboard}
              disabled={isImportingInbox}
              className="px-3 py-2 bg-sky-700 hover:bg-sky-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            >
              <ClipboardPaste className="w-4 h-4" />
              <span>لصق وقراءة من حافظة الجوال</span>
            </button>

            <button
              type="button"
              onClick={handleReadAndroidBridgeInbox}
              disabled={isImportingInbox}
              className="px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className="w-4 h-4" />
              <span>مزامنة صندوق رسائل الجهاز (Android)</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleImportManualInbox} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label className="font-bold text-slate-700">
                ألصق رسالة أو عدة رسائل SMS وصلت لجوالك من السائق:
              </label>
              <span className="text-[11px] text-slate-500 font-mono">
                يستخرج النظام تلقائياً أي عدد من رسائل WATER TRACK
              </span>
            </div>
            <textarea
              rows={4}
              value={inboxPasteText}
              onChange={(e) => setInboxPasteText(e.target.value)}
              placeholder={`انسخ رسالة أو عدة رسائل من تطبيق الرسائل في جوال المدير وألصقها هنا...\nمثال:\nWATER TRACK\nTRIP: 2026-0002\nEVENT: ARRIVAL\nLAT: 15.4712\nLON: 45.3340\nSEQ: 0014`}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
              style={{ direction: 'ltr', textAlign: 'left' }}
            />
          </div>

          <div className="flex flex-col justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                رقم مرسل الرسالة للتحقق الأمني:
              </label>
              <input
                type="text"
                value={inboxSenderInput}
                onChange={(e) => setInboxSenderInput(e.target.value)}
                placeholder={settings.driverSabafonNumber}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-mono text-xs text-slate-900"
              />
              <p className="text-[10px] text-slate-500 leading-relaxed">
                يتم قبول الرسائل الواردة من رقم السائق المعتمد ({settings.driverSabafonNumber}) ورفض أي أرقام غريبة أو رسائل مكررة تلقائياً.
              </p>
            </div>

            <button
              type="submit"
              disabled={isImportingInbox || !inboxPasteText.trim()}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
            >
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>{isImportingInbox ? 'جاري قراءة الرسائل...' : 'قراءة وتحديث الخريطة الآن'}</span>
            </button>
          </div>
        </form>

        {inboxResult && (
          <div
            className={`p-3 rounded-xl text-xs font-semibold flex items-start gap-2 ${
              inboxResult.success
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                : 'bg-amber-50 text-amber-900 border border-amber-200'
            }`}
          >
            {inboxResult.success ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            )}
            <span>{inboxResult.message}</span>
          </div>
        )}

        {/* Automatic Background SMS Reading via Android SMS Forwarder or APK WebView Bridge */}
        <div className="border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => setShowForwarderGuide(!showForwarderGuide)}
            className="flex items-center justify-between w-full text-xs font-bold text-sky-800 hover:text-sky-950 cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <FileCode className="w-4 h-4 text-sky-600" />
              <span>إعداد القراءة التلقائية بالخلفية من جوال المدير (تطبيق SMS Forwarder / Android APK)</span>
            </span>
            {showForwarderGuide ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showForwarderGuide && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] bg-slate-50 border border-slate-200 rounded-xl p-3">
              <div className="space-y-2">
                <div className="font-bold text-slate-800">
                  الخيار الأسرع (تلقائي بدون لصق): تطبيق SMS Forwarder على جوال المدير
                </div>
                <p className="text-slate-600 leading-relaxed">
                  ثبّت تطبيق <span className="font-mono font-bold">SMS Forwarder</span> على هاتف المدير، وأنشئ قاعدة تحوّل أي رسالة SMS واردة من رقم السائق <span className="font-mono font-bold text-sky-800">{settings.driverSabafonNumber}</span> تلقائياً إلى رابط النظام:
                </p>
                <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg p-2">
                  <code className="text-[10px] font-mono text-sky-800 flex-1 truncate" style={{ direction: 'ltr', textAlign: 'left' }}>
                    {webhookUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopySnippet('webhook', webhookUrl)}
                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-[10px] font-bold flex items-center gap-1 shrink-0"
                  >
                    {copiedKey === 'webhook' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>نسخ</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">قالب JSON الجاهز للتطبيق (POST):</span>
                  <button
                    type="button"
                    onClick={() => handleCopySnippet('json', forwarderJsonTemplate)}
                    className="px-2 py-0.5 bg-white border border-slate-200 hover:bg-slate-100 rounded text-[10px] font-bold flex items-center gap-1"
                  >
                    {copiedKey === 'json' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>نسخ القالب</span>
                  </button>
                </div>
                <pre
                  className="bg-slate-900 text-emerald-400 p-2 rounded-lg font-mono text-[10px] overflow-x-auto"
                  style={{ direction: 'ltr', textAlign: 'left' }}
                >
                  {forwarderJsonTemplate}
                </pre>
                <p className="text-[10px] text-slate-500">
                  وفي حال تغليف التطبيق كـ Android APK، يتصل مباشرة بدالة الجسر <code className="font-mono bg-white px-1 rounded">window.MiyahnaAndroidSMS.readInbox()</code>.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Grid: Injection Simulator & Live Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Test SMS Injector */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <Radio className="w-4 h-4 text-sky-600" />
            <h3 className="font-bold text-slate-900 text-xs">محاكي حقن رسائل SMS سبأفون ميدانياً</h3>
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            يمكنك اختبار استلام الرسائل من شريحة سبأفون التابعة للسائق عبر إرسال رسالة تجريبية بالتنسيق المعتمد لاختبار التتبع وتحديث موقع الوايت مباشرة.
          </p>

          <form onSubmit={handleInjectSMS} className="space-y-3">
            <div>
              <label className="block text-slate-700 text-xs font-semibold mb-1">
                نص الرسالة الخام (Sabafon SMS Payload)
              </label>
              <textarea
                rows={9}
                value={testRawSMS}
                onChange={(e) => setTestRawSMS(e.target.value)}
                className="w-full p-2.5 bg-slate-900 text-emerald-400 font-mono text-xs rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                style={{ direction: 'ltr', textAlign: 'left' }}
              />
            </div>

            {injectResult && (
              <div
                className={`p-2.5 rounded-lg text-xs font-semibold flex items-center gap-2 ${
                  injectResult.success
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {injectResult.success ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                <span>{injectResult.message}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSending}
              className="w-full py-2.5 bg-sky-700 text-white rounded-lg text-xs font-bold hover:bg-sky-800 transition-colors shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSending ? 'جاري المعالجة...' : 'إرسال الرسالة إلى البوابة'}</span>
            </button>
          </form>

          {/* GSM Modem Info Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] text-slate-600 space-y-1">
            <div className="font-bold text-slate-800 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-sky-600" />
              <span>تعليمات استقبال SMS في المصنع:</span>
            </div>
            <p>1. هاتف Android مخصص أو مودم GSM 4G مع شريحة سبأفون.</p>
            <p>2. إرسال الرسائل إلى رابط الويب: <code className="bg-white px-1 py-0.5 rounded border">/api/sms/receive</code></p>
            <p>3. النظام يتحقق من رقم الشريحة ويسقط أي رسالة مكررة تلقائياً.</p>
          </div>
        </div>

        {/* Right 2 Columns: Live SMS Received Stream */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-sky-600" />
              <h3 className="font-bold text-slate-900 text-xs">سجل رسائل SMS المستلمة في المصنع</h3>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">آخر تحديث مباشر</span>
          </div>

          <div className="divide-y divide-slate-100 overflow-y-auto max-h-[520px]">
            {smsLogs.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                لا توجد رسائل مستلمة بعد في هذا السجل
              </div>
            ) : (
              smsLogs.map((log) => {
                const isSuccess = log.status === 'processed';
                const isDup = log.status === 'duplicate_rejected';

                return (
                  <div key={log.id} className="py-3 text-xs space-y-1.5 hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${isSuccess ? 'bg-emerald-500' : isDup ? 'bg-amber-500' : 'bg-rose-500'}`} />
                        <span className="font-mono font-bold text-slate-900">{log.tripNumber}</span>
                        <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded">
                          SEQ: {String(log.sequenceNumber).padStart(4, '0')}
                        </span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                          log.eventType === 'ARRIVAL'
                            ? 'bg-emerald-100 text-emerald-800'
                            : log.eventType === 'DEPARTURE'
                            ? 'bg-blue-100 text-blue-800'
                            : log.eventType === 'STOPPED'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-sky-100 text-sky-800'
                        }`}>
                          {log.eventType}
                        </span>
                        {log.customerId && (
                          <span className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded font-mono">
                            {log.customerId}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {new Date(log.receivedAt).toLocaleTimeString('ar-YE')}
                      </div>
                    </div>

                    <div className="font-mono text-[11px] text-slate-600 bg-slate-50 p-2 rounded border border-slate-100 whitespace-pre-line" style={{ direction: 'ltr', textAlign: 'left' }}>
                      {log.rawText}
                    </div>

                    {log.statusReason && (
                      <div className="text-[10px] text-amber-700 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span>{log.statusReason}</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
