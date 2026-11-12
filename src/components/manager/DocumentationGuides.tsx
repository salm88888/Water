/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - System Operational Manual & Field Technical Guides
 */

import React, { useState } from 'react';
import {
  BookOpen,
  Smartphone,
  Radio,
  Database,
  ShieldCheck,
  Truck,
  FileCode,
  CheckCircle,
  Link2,
  Wifi,
  KeyRound,
  Settings,
  Copy,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const DocumentationGuides: React.FC = () => {
  const { settings, setManagerTab } = useApp();
  const [activeTab, setActiveTab] = useState<'linking' | 'manager' | 'driver' | 'sms' | 'database' | 'offline'>('linking');
  const [copiedUrl, setCopiedUrl] = useState(false);

  const gatewayEndpoint =
    typeof window !== 'undefined' ? `${window.location.origin}/api/sms/receive` : '/api/sms/receive';

  const handleCopyEndpoint = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(gatewayEndpoint);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-slate-900">دليل المستخدم والتوثيق الفني لنظام مياهنا الذكي</h2>
        <p className="text-xs text-slate-500">
          تعليمات ربط الهاتفين، دليل المدير العام، دليل السائق، إعداد شريحة سبأفون وبوابة SMS، وبنية قواعد البيانات
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 text-xs border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('linking')}
          className={`px-3.5 py-2 rounded-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'linking' ? 'bg-sky-700 text-white shadow-xs' : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <Link2 className="w-3.5 h-3.5" />
          <span>تعليمات ربط الهاتفين</span>
        </button>
        <button
          onClick={() => setActiveTab('manager')}
          className={`px-3.5 py-2 rounded-lg font-semibold transition-all cursor-pointer ${
            activeTab === 'manager' ? 'bg-sky-700 text-white shadow-xs' : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          دليل المدير العام
        </button>
        <button
          onClick={() => setActiveTab('driver')}
          className={`px-3.5 py-2 rounded-lg font-semibold transition-all cursor-pointer ${
            activeTab === 'driver' ? 'bg-sky-700 text-white shadow-xs' : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          دليل تطبيق السائق (Android)
        </button>
        <button
          onClick={() => setActiveTab('sms')}
          className={`px-3.5 py-2 rounded-lg font-semibold transition-all cursor-pointer ${
            activeTab === 'sms' ? 'bg-sky-700 text-white shadow-xs' : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          إعداد سبأفون وبوابة SMS
        </button>
        <button
          onClick={() => setActiveTab('offline')}
          className={`px-3.5 py-2 rounded-lg font-semibold transition-all cursor-pointer ${
            activeTab === 'offline' ? 'bg-sky-700 text-white shadow-xs' : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          آلية العمل دون إنترنت (Offline-First)
        </button>
        <button
          onClick={() => setActiveTab('database')}
          className={`px-3.5 py-2 rounded-lg font-semibold transition-all cursor-pointer ${
            activeTab === 'database' ? 'bg-sky-700 text-white shadow-xs' : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          مخطط قاعدة البيانات (Schema)
        </button>
      </div>

      {/* Tab 0: تعليمات ربط الهاتفين */}
      {activeTab === 'linking' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-5 text-xs leading-relaxed text-slate-700">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Link2 className="w-4 h-4 text-sky-700" />
              <span>تعليمات ربط الهاتفين: تهيئة هاتف المدير وهاتف السائق للعمل مع نظام مياهنا الذكي</span>
            </h3>
            <button
              type="button"
              onClick={() => setManagerTab('driver_mgmt')}
              className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-800 rounded-lg font-bold text-[11px] flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>تعديل الأرقام المربوطة حالياً</span>
            </button>
          </div>

          {/* Live Linked Numbers Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-2.5">
              <span className="text-slate-600 font-semibold">رقم شريحة هاتف السائق المعتمد:</span>
              <span className="font-mono font-bold text-emerald-700 text-sm">{settings.driverSabafonNumber}</span>
            </div>
            <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-2.5">
              <span className="text-slate-600 font-semibold">رقم هاتف المدير / مركز الاستقبال:</span>
              <span className="font-mono font-bold text-sky-800 text-sm">{settings.sabafonCenterNumber}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl space-y-2.5">
              <div className="flex items-center gap-2 font-bold text-sky-900 text-sm">
                <KeyRound className="w-4 h-4 text-sky-700" />
                <span>الخطوة 1: تهيئة هاتف (أو جهاز) المدير العام</span>
              </div>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-700">
                <li>افتح رابط النظام في متصفح Chrome أو Safari على هاتف المدير ({settings.sabafonCenterNumber}) أو كمبيوتر المصنع.</li>
                <li>في شاشة البداية اضغط على زر <strong>«المدير»</strong> وأدخل رمز المرور (الافتراضي: <code className="bg-white px-1.5 py-0.5 rounded border font-mono font-bold text-sky-800">20262027</code> — ويمكن تغييره في أي وقت).</li>
                <li>سيحفظ المتصفح اختيارك تلقائياً لتفتح لوحة المدير مباشرة عند فتح الرابط مستقبلاً.</li>
                <li>من قائمة المتصفح اختر <strong>«إضافة إلى الشاشة الرئيسية» (Add to Home Screen)</strong> لتثبيت لوحة الإدارة كأيقونة تطبيق على الجوال.</li>
                <li>يمكنك تعديل أرقام الهواتف أو أسعار الديزل والمياه أو اعتماد الرحلات من لوحة المدير في أي وقت.</li>
              </ol>
            </div>

            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2.5">
              <div className="flex items-center gap-2 font-bold text-emerald-900 text-sm">
                <Smartphone className="w-4 h-4 text-emerald-700" />
                <span>الخطوة 2: تهيئة هاتف السائق (Android)</span>
              </div>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-700">
                <li>تأكد من تركيب شريحة سبأفون الخاصة بالعمل ({settings.driverSabafonNumber}) في هاتف السائق مع توفر رصيد رسائل SMS.</li>
                <li>وصّل هاتف السائق بشبكة واي فاي المصنع، وافتح نفس رابط النظام في متصفح Chrome.</li>
                <li>في شاشة البداية اضغط على زر <strong>«السائق»</strong> (يفتح مباشرة بدون رمز مرور)، وسيحفظ الجهاز هذا الوضع تلقائياً.</li>
                <li>أضف الصفحة إلى الشاشة الرئيسية لهاتف السائق واختر السماح بصلاحية الموقع (GPS) عند الطلب.</li>
                <li>قبل انطلاق كل رحلة معتمدة، يفتح السائق التطبيق وهو متصل بالإنترنت لتحميل خط السير والعملاء محلياً على جهازه.</li>
              </ol>
            </div>
          </div>

          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
            <div className="flex items-center gap-2 font-bold text-amber-900 text-sm">
              <Radio className="w-4 h-4 text-amber-700" />
              <span>الخطوة 3: ربط الإشعارات الميدانية عبر رسائل SMS سبأفون (دون إنترنت)</span>
            </div>
            <ul className="list-disc list-inside space-y-1.5 text-slate-700">
              <li>
                <strong>التحقق التلقائي من الأرقام:</strong> يتحقق الخادم من رقم مرسل الرسالة ومطابقته لرقم السائق المسجل في الإعدادات (ويمكن للمدير تعديل الرقمين في أي وقت من تبويب <strong>«السائق والوايت»</strong> أو <strong>«بوابة SMS»</strong> أو <strong>«إعدادات النظام»</strong>).
              </li>
              <li>
                <strong>توجيه الرسائل من هاتف المصنع/المدير إلى النظام:</strong> في الهاتف المستقبل للرسائل داخل المصنع (المتصل بالإنترنت)، ثبّت تطبيق توجيه رسائل (مثل <em>SMS Forwarder</em> أو <em>SMS Gateway</em>) ووجّه الرسائل التي تحتوي على <code className="bg-white px-1 rounded border font-mono">WATER TRACK</code> عبر طلب <code className="bg-white px-1 rounded border font-mono">POST</code> إلى الرابط التالي:
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="bg-white px-2.5 py-1.5 rounded-lg border border-amber-300 font-mono text-[11px] text-sky-900 select-all" dir="ltr">
                    {gatewayEndpoint}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyEndpoint}
                    className="px-2.5 py-1.5 bg-white hover:bg-amber-100 border border-amber-300 rounded-lg text-[11px] font-bold text-amber-900 flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedUrl ? 'تم النسخ ✓' : 'نسخ الرابط'}</span>
                  </button>
                </div>
              </li>
              <li>
                <strong>تحديث الموقع والمزامنة:</strong> أثناء سير الوايت دون إنترنت، تصل رسائل الوصول والمغادرة والنبضات الدورية كل {settings.periodicHeartbeatMinutes} دقائق لتحديث موقع الصهريج على خريطة المدير. وعند عودة الوايت للمصنع يضغط السائق على <strong>«مزامنة الآن»</strong> لرفع كافة الفواتير والطلبات المسجلة محلياً.
              </li>
            </ul>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-2 text-slate-700">
            <Wifi className="w-4 h-4 text-sky-700 shrink-0" />
            <span>
              <strong>تنبيه تشغيلي:</strong> كلا الهاتفين متصلان بنفس قاعدة البيانات السحابية المركزية؛ بمجرد اعتماد المدير لأي رحلة جديدة أو إضافة عميل، تظهر مباشرة على هاتف السائق بمجرد اتصال هاتفه بالإنترنت.
            </span>
          </div>
        </div>
      )}

      {/* Tab 1: Manager Guide */}
      {activeTab === 'manager' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4 text-xs leading-relaxed text-slate-700">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-sky-700" />
            <span>1. دورة العمل اليومية للمدير العام</span>
          </h3>

          <div className="space-y-3">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <strong className="text-slate-900 block mb-1">الخطوة 1: استقبال الطلبات ومنع التكرار</strong>
              تصل الطلبات من المكالمات الهاتفية، واتساب، أو تسجيل السائق. يقوم النظام بالتحقق الآلي من رقم الهاتف والعميل خلال الـ 24 ساعة الماضية، وينبه في حال وجود طلب مكرر لنفس الخزان.
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <strong className="text-slate-900 block mb-1">الخطوة 2: تشغيل خوارزمية التجميع الذكي</strong>
              يقوم النظام بدراسة الطلبات في أحياء مأرب (حي الروضة، الشركة، المجمع، السلام...)، وحساب المسافة الفعلية، والتأكد من عدم تجاوز سعة الوايت البالغة 6,000 لتر، وحساب تكلفة الديزل والإنتاج وهامش الربح.
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <strong className="text-slate-900 block mb-1">الخطوة 3: اعتماد الرحلة وتعبئة الصهريج</strong>
              اعتماد الرحلة حصري للمدير. بمجرد الضغط على "اعتماد الرحلة"، يتم حجز كمية المياه وتحديث تطبيق هاتف السائق.
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <strong className="text-slate-900 block mb-1">الخطوة 4: متابعة مسار الوايت عبر SMS والخريطة</strong>
              أثناء الرحلة، تصل رسائل الموقع الدورية ورسائل الوصول والمغادرة من هاتف السائق عبر شريحة سبأفون، وتظهر النقاط الحية على خريطة مأرب.
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <strong className="text-slate-900 block mb-1">الخطوة 5: عودة الوايت وتسوية العهدة النقدية</strong>
              عند عودة السائق للمصنع، يتم فتح شاشة "تسوية عهدة السائق"، ومطابقة إجمالي النقد المحصل مع المبالغ المسلمة فعلياً والمصروفات المخصومة (إن وجدت) لإنهاء الدورة المالية وبدء تعبئة الصهريج لرحلة جديدة.
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Driver Guide */}
      {activeTab === 'driver' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4 text-xs leading-relaxed text-slate-700">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-emerald-700" />
            <span>2. دليل السائق الميداني (وايت مأرب)</span>
          </h3>

          <div className="space-y-3">
            <p>
              تم تصميم تطبيق السائق ليعمل بالكامل دون إنترنت، وبأزرار لمسية كبيرة تناسب ضوء الشمس وأثناء القيادة:
            </p>

            <ul className="list-disc list-inside space-y-2 pr-2">
              <li>
                <strong>قبل الخروج من المصنع:</strong> التأكد من توصيل الهاتف بشبكة واي فاي المصنع ومزامنة الرحلة المعتمدة، والتأكد من وجود رصيد SMS في شريحة سبأفون.
              </li>
              <li>
                <strong>عند بدء الرحلة:</strong> الضغط على زر "بدء رحلة التوزيع"، فيقوم التطبيق بإرسال رسالة حركة أولى وتفعيل نبضات التتبع.
              </li>
              <li>
                <strong>عند الوصول لمنزل العميل:</strong> الضغط على زر "وصلت إلى العميل" لتسجيل وقت وإحداثيات الوصول وإرسال SMS.
              </li>
              <li>
                <strong>أثناء التفريغ والتسليم:</strong> إدخال كمية اللترات المسلمة فعلياً والمبلغ النقدي المستلم من العميل، ثم الضغط على "تأكيد التسليم والفاتورة".
              </li>
              <li>
                <strong>عند المغادرة:</strong> الضغط على "مغادرة العميل" للانتقال تلقائياً للعميل التالي في خط السير المحسوب.
              </li>
              <li>
                <strong>استقبال طلب في الطريق:</strong> إذا طلب أحد الجيران أو العملاء تعبئة، يمكن للسائق الضغط على "تسجيل طلب جديد" وسيحفظ محلياً في هاتفه ويزامن فور العودة للمصنع.
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Tab 3: Sabafon SMS Gateway */}
      {activeTab === 'sms' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4 text-xs leading-relaxed text-slate-700">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Radio className="w-4 h-4 text-amber-600" />
            <span>3. تعليمات إعداد شريحة سبأفون وبوابة استقبال SMS في المصنع</span>
          </h3>

          <div className="space-y-3">
            <p>
              نظراً لأن تغطية الإنترنت غير مستقرة أثناء رحلات التوزيع في مأرب بينما تغطية شبكة سبأفون للمكالمات والرسائل متوفرة، يعتمد النظام على بروتوكول SMS خفيف الوزن وعالي الاعتمادية:
            </p>

            <div className="bg-slate-900 text-emerald-400 font-mono p-3 rounded-lg text-xs" style={{ direction: 'ltr', textAlign: 'left' }}>
              WATER TRACK<br />
              TRIP: 2026-0002<br />
              EVENT: ARRIVAL<br />
              CUSTOMER: CUST-0001<br />
              LAT: 15.4712<br />
              LON: 45.3340<br />
              TIME: 10:45<br />
              SEQ: 0004
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <strong className="text-slate-900 block mb-1">عتاد الاستقبال في المصنع:</strong>
              1. هاتف Android مخصص مثبت بمكتب إدارة المصنع، أو مودم GSM 4G يدعم شرائح سبأفون.<br />
              2. تفعيل تطبيق Gateway بسيط (مثل SMS Gateway API أو برنامج مياهنا المدمج) لتوجيه الرسائل الواردة فوراً إلى الرابط:
              <code className="bg-white px-1.5 py-0.5 rounded border text-sky-700 font-bold mr-1">/api/sms/receive</code>.<br />
              3. يقوم الخادم المركزي بالتحقق من رقم المرسل، وتصفية أي رسائل مكررة بناءً على الرقم التسلسلي، وتحديث موقع الوايت فوراً.
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Offline-First */}
      {activeTab === 'offline' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4 text-xs leading-relaxed text-slate-700">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-sky-700" />
            <span>4. معمارية العمل دون إنترنت (Offline-First Architecture)</span>
          </h3>

          <div className="space-y-2">
            <p>
              تعتمد قاعدة بيانات تطبيق السائق على تخزين محلي مستقل (SQLite / LocalStorage) يضمن استمرارية العمل دون انقطاع:
            </p>
            <ul className="list-disc list-inside space-y-1.5 pr-2">
              <li>تحميل بيانات الرحلة المعتمدة، أسماء العملاء، أرقامهم، وسعات خزاناتهم محلياً على هاتف السائق.</li>
              <li>تسجيل كافة عمليات التفريغ والمبالغ المسددة في طابور العمليات المعلقة محلياً.</li>
              <li>الاحتفاظ بسجل GPS الكامل حتى في حال تعذر إرسال SMS مؤقتاً بسبب انعدام التغطية.</li>
              <li>عند عودة الوايت إلى نطاق شبكة المصنع، تتم المزامنة التلقائية الكاملة وتصفير الطابور دون أي تدخل يدوي.</li>
            </ul>
          </div>
        </div>
      )}

      {/* Tab 5: Database Schema */}
      {activeTab === 'database' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4 text-xs leading-relaxed text-slate-700">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Database className="w-4 h-4 text-slate-700" />
            <span>5. الجداول الـ 20 المعتمدة في قاعدة البيانات (PostgreSQL / SQLite)</span>
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
            <div className="p-2 bg-slate-50 border rounded font-semibold text-slate-800">1. Users</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold text-slate-800">2. Roles</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold text-slate-800">3. Customers</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold text-slate-800">4. Customer_Tanks</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold text-slate-800">5. Orders</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold text-slate-800">6. Trucks</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold text-slate-800">7. Drivers</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold text-slate-800">8. Trips</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold text-slate-800">9. Trip_Load_Cycles</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold text-slate-800">10. Trip_Customers</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold text-slate-800">11. Deliveries</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold text-slate-800">12. Invoices</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold text-slate-800">13. Payments</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold text-slate-800">14. Expenses</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold text-slate-800">15. Fuel_Records</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold text-slate-800">16. GPS_Events</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold text-slate-800">17. SMS_Messages</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold text-slate-800">18. Sync_Queue</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold text-slate-800">19. Audit_Logs</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold text-slate-800">20. System_Settings</div>
          </div>
        </div>
      )}
    </div>
  );
};
