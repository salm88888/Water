/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - System Operational Manual & Technical Architecture Guides (Offline-First GPS, Zero SMS)
 */

import React, { useState } from 'react';
import {
  BookOpen,
  Smartphone,
  Navigation,
  Database,
  ShieldCheck,
  Link2,
  Wifi,
  KeyRound,
  Cpu,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const DocumentationGuides: React.FC = () => {
  const { settings } = useApp();
  const [activeTab, setActiveTab] = useState<'linking' | 'manager' | 'driver' | 'gps' | 'offline' | 'database'>('linking');

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-lg font-bold text-slate-900">دليل المستخدم والتوثيق الفني لنظام مياهنا الذكي</h2>
        <p className="text-xs text-slate-500">
          تعليمات ربط الهاتفين، دورة مخطط الرحلة والاعتماد، التتبع التلقائي عبر GPS واكتشاف التوقفات، العمل دون إنترنت، ومتطلبات خدمة الخلفية على Android
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
          دليل المدير العام والاعتماد
        </button>
        <button
          onClick={() => setActiveTab('driver')}
          className={`px-3.5 py-2 rounded-lg font-semibold transition-all cursor-pointer ${
            activeTab === 'driver' ? 'bg-sky-700 text-white shadow-xs' : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          دليل تطبيق السائق (PWA)
        </button>
        <button
          onClick={() => setActiveTab('gps')}
          className={`px-3.5 py-2 rounded-lg font-semibold transition-all cursor-pointer ${
            activeTab === 'gps' ? 'bg-sky-700 text-white shadow-xs' : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          التتبع التلقائي GPS والتوقفات
        </button>
        <button
          onClick={() => setActiveTab('offline')}
          className={`px-3.5 py-2 rounded-lg font-semibold transition-all cursor-pointer ${
            activeTab === 'offline' ? 'bg-sky-700 text-white shadow-xs' : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          العمل دون إنترنت والمزامنة + Android
        </button>
        <button
          onClick={() => setActiveTab('database')}
          className={`px-3.5 py-2 rounded-lg font-semibold transition-all cursor-pointer ${
            activeTab === 'database' ? 'bg-sky-700 text-white shadow-xs' : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          بنية الجداول والبيانات
        </button>
      </div>

      {/* Tab 0: تعليمات ربط الهاتفين */}
      {activeTab === 'linking' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-5 text-xs leading-relaxed text-slate-700">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Link2 className="w-4 h-4 text-sky-700" />
            <h3 className="font-bold text-slate-900 text-sm">
              تعليمات ربط الهاتفين: تهيئة هاتف المدير وهاتف السائق للعمل مع نظام مياهنا الذكي
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl space-y-2.5">
              <div className="flex items-center gap-2 font-bold text-sky-900 text-sm">
                <KeyRound className="w-4 h-4 text-sky-700" />
                <span>الخطوة 1: تهيئة جهاز / هاتف المدير العام</span>
              </div>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-700">
                <li>افتح رابط النظام في متصفح Chrome أو Safari على هاتف المدير أو كمبيوتر المصنع.</li>
                <li>اختر <strong>«واجهة المدير العام»</strong> وأدخل رمز المرور السري المعتمد للمدير.</li>
                <li>اضغط زر <strong>«تثبيت التطبيق»</strong> بأعلى الشاشة لإضافته إلى الشاشة الرئيسية كتطبيق مستقل (PWA).</li>
                <li>تأكد من ضبط موقع المصنع الجغرافي من <strong>«إعدادات النظام»</strong> لضمان دقة رصد الانطلاق والعودة.</li>
              </ol>
            </div>

            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2.5">
              <div className="flex items-center gap-2 font-bold text-emerald-900 text-sm">
                <Smartphone className="w-4 h-4 text-emerald-700" />
                <span>الخطوة 2: تهيئة هاتف السائق (Android PWA)</span>
              </div>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-700">
                <li>افتح نفس الرابط على هاتف السائق عبر Chrome، ثم اختر <strong>«تطبيق السائق»</strong>.</li>
                <li>اضغط <strong>«تثبيت التطبيق»</strong> من الشريط العلوي لتخزين واجهة التطبيق محلياً على الجهاز.</li>
                <li>اسمح للتطبيق بصلاحية <strong>الموقع الجغرافي (GPS الدقيق)</strong> عند بدء أول رحلة.</li>
                <li>قبل انطلاق الوايت، يقوم السائق برفع الطلبات أو الزبائن الجدد للمدير، بينما يتولى المدير إعداد مخطط الرحلة وإرساله؛ وبعد استلام طلب الرحلة وموافقة السائق عليه، يعمل التتبع والحفظ بالكامل عبر GPS حتى عند انقطاع الإنترنت.</li>
              </ol>
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-2 text-slate-700">
            <Wifi className="w-4 h-4 text-sky-700 shrink-0" />
            <span>
              <strong>آلية التزامن المباشر:</strong> يعتمد النظام بالكامل على التتبع الجغرافي المحلي وقاعدة بيانات IndexedDB مع المزامنة التلقائية عبر HTTPS فور توفر الإنترنت (دون أي اعتماد على SMS).
            </span>
          </div>
        </div>
      )}

      {/* Tab 1: Manager Guide */}
      {activeTab === 'manager' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4 text-xs leading-relaxed text-slate-700">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-sky-700" />
            <span>دورة الموافقة الإلزامية ومراجعة الرحلات للمدير العام</span>
          </h3>
          <div className="space-y-3">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <strong className="text-slate-900 block mb-1">1. استلام طلبات الزبائن وإعداد مخططات الرحلات (مهام المدير)</strong>
              يرفع السائق الطلبات والزبائن فقط، بينما يتولى المدير من تبويب <strong>«إدارة الرحلات»</strong> أو <strong>«محرك التجميع الذكي»</strong> إعداد مخطط الوجهات، ترتيب الزبائن، تحديد السائق المكلف، واعتماد الرحلة وإرسالها للسائق.
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <strong className="text-slate-900 block mb-1">2. استجابة السائق والقرارات التشغيلية</strong>
              تظهر الرحلة المعتمدة في تطبيق السائق ليقوم بالموافقة عليها وبدئها، أو الاعتذار عنها مع كتابة السبب ليظهر فوراً للمدير مع إمكانية تعديل المخطط أو إعادة تكليفه.
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <strong className="text-slate-900 block mb-1">3. طلبات التعديل الطارئة بعد الاعتماد</strong>
              لا يمكن للسائق تعديل خطة رحلة معتمدة مباشرة؛ وفي الحالات الطارئة يرسل طلب تعديل يتضمن السبب ليوافق عليه المدير أولاً.
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <strong className="text-slate-900 block mb-1">4. المراجعة النهائية وإغلاق الرحلة</strong>
              بعد عودة الوايت للمصنع واكتمال المزامنة، تتحول الرحلة لحالة <strong>«مكتملة بانتظار المراجعة»</strong> ليتحقق المدير من المسار الفعلي على الخريطة وتقرير التوقفات قبل إغلاقها نهائياً.
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Driver Guide */}
      {activeTab === 'driver' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4 text-xs leading-relaxed text-slate-700">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-emerald-700" />
            <span>دليل السائق الميداني (رفع الطلبات والزبائن والتتبع التلقائي)</span>
          </h3>
          <ul className="list-disc list-inside space-y-2 pr-2">
            <li><strong>رفع الطلبات والزبائن فقط:</strong> من تبويب «طلب / زبون» يمكنك رفع طلب توصيل لزبون مسجل، أو تسجيل زبون جديد مع طلب مياه، أو حفظ بيانات زبون جديد ليظهر فوراً لدى المدير ويُدرج في مخططات الرحلات (ولا يحق للسائق إنشاء أو تعديل مخططات الرحلات).</li>
            <li><strong>استلام واعتماد طلبات الرحلات من المدير:</strong> فور قيام المدير بإعداد وإرسال رحلة إليك، تظهر في تبويب «الرحلات» للموافقة عليها أو الاعتذار عنها بكتابة السبب.</li>
            <li><strong>بدء الرحلة والتتبع التلقائي:</strong> بعد الموافقة على الرحلة المعتمدة، اضغط «بدء الرحلة» ليبدأ النظام تلقائياً بتسجيل مسار GPS دون الحاجة لرسم طريق مسبق.</li>
            <li><strong>تسجيل التسليمات:</strong> عند كل زبون، سجل الكمية المسلمة والمبلغ المحصل نقداً (التوقف وحده لا يُعد تسليماً).</li>
            <li><strong>العودة للمصنع:</strong> عند دخول نطاق المصنع الجغرافي ({settings.plantGeofenceMeters}م)، يظهر تنبيه إنهاء الرحلة وتأكيد العودة لإغلاق التسجيل.</li>
          </ul>
        </div>
      )}

      {/* Tab 3: GPS & Stop Detection */}
      {activeTab === 'gps' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4 text-xs leading-relaxed text-slate-700">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Navigation className="w-4 h-4 text-sky-700" />
            <span>آلية التتبع التلقائي عبر GPS واكتشاف التوقفات</span>
          </h3>
          <ul className="list-disc list-inside space-y-2 pr-2">
            <li><strong>تسجيل النقاط المتتابع:</strong> يسجل كل نقطة إحداثيات مع الوقت والسرعة والمسافة التراكمية بفاصل {settings.gpsSampleIntervalSeconds} ثوانٍ، وتُمنع تعديلاتها من السائق لحماية الموثوقية.</li>
            <li><strong>التمييز بين التوقف الفعلي والمروري:</strong> يُسجل التوقف الفعلي فقط عندما تقل السرعة عن <strong>{settings.minMovementSpeedKmH} كم/ساعة</strong> لمدة تتجاوز <strong>{settings.stopDetectionMinutes} دقائق</strong>؛ أما الإشارات والازدحام المؤقت فيتم تجاهلها.</li>
            <li><strong>الربط المحايد بمواقع الزبائن:</strong> تُربط التوقفات الطويلة بالزبائن المعتمدين ضمن نطاق <strong>{settings.stopRadiusMeters} متر</strong>، مع عرض واضح لأي توقف خارج مواقع الزبائن دون إصدار أحكام آلية.</li>
            <li><strong>فجوات الإشارة وضعف الدقة:</strong> إذا تجاوزت الدقة {settings.gpsWeakAccuracyMeters}م أو انقطعت الإشارة لأكثر من {settings.gpsGapSeconds} ثانية يتم توثيق الفجوة للمدير.</li>
          </ul>
        </div>
      )}

      {/* Tab 4: Offline-First + Native Android Foreground Service */}
      {activeTab === 'offline' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4 text-xs leading-relaxed text-slate-700">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-sky-700" />
            <span>العمل دون إنترنت (IndexedDB) + متطلبات التشغيل في الخلفية على Android</span>
          </h3>
          <div className="space-y-2">
            <p>
              يستخدم التطبيق قاعدة بيانات محلية دائمة <strong>IndexedDB</strong> تحفظ الرحلات ونقاط GPS والتوقفات والطلبات والتسليمات عند انقطاع الإنترنت أو إغلاق التطبيق أو إعادة تشغيل الهاتف، ولا تُحذف أي بيانات محلية إلا بعد وصول تأكيد صريح (ACK) من الخادم.
            </p>
            <p>
              عند عودة الإنترنت، يكتشف التطبيق الاتصال تلقائياً ويرسل البيانات بالتتابع الزمني وبشكل لا يقبل التكرار (Idempotent).
            </p>
          </div>

          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
            <div className="font-bold text-amber-900 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-amber-700" />
              <span>توضيح تقني صريح: التتبع في المتصفح مقابل خدمة الخلفية الأصلية على Android (Foreground Service)</span>
            </div>
            <ul className="list-disc list-inside space-y-1.5 text-slate-700">
              <li><strong>في متصفح الويب / PWA:</strong> يستمر GPS عبر <code className="bg-white px-1 rounded border font-mono">navigator.geolocation.watchPosition</code> مع تفعيل <em>WakeLock</em> لإبقاء الشاشة نشطة أثناء القيادة، لكن قيود نظام Android/iOS قد توقف تتبع المتصفح إذا أُغلقت الشاشة أو وُضع المتصفح في الخلفية لوقت طويل.</li>
              <li><strong>للتشغيل المستمر في الخلفية الكاملة (APK / Capacitor / Native Wrapper):</strong> يوفر النظام واجهة الجسر <code className="bg-white px-1 rounded border font-mono" dir="ltr">window.MiyahnaAndroidLocation</code> لربط خدمة أمامية أصلية <em>Android Foreground Service</em> بالإعدادات والصلاحيات التالية في <code className="bg-white px-1 rounded border font-mono" dir="ltr">AndroidManifest.xml</code>:
                <ul className="list-circle list-inside pr-4 mt-1 font-mono text-[11px]" dir="ltr">
                  <li>ACCESS_FINE_LOCATION & ACCESS_COARSE_LOCATION</li>
                  <li>ACCESS_BACKGROUND_LOCATION (Android 10+)</li>
                  <li>FOREGROUND_SERVICE & FOREGROUND_SERVICE_LOCATION (Android 14+)</li>
                  <li>POST_NOTIFICATIONS + persistent Foreground Notification during active trips</li>
                  <li>Battery Optimization Exemption (ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)</li>
                </ul>
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Tab 5: Database Schema */}
      {activeTab === 'database' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4 text-xs leading-relaxed text-slate-700">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Database className="w-4 h-4 text-slate-700" />
            <span>جداول وكيانات النظام المعتمدة (بعد إزالة SMS نهائياً)</span>
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
            <div className="p-2 bg-slate-50 border rounded font-semibold">1. Customers</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold">2. Orders</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold">3. Trucks & Driver</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold">4. Trips (10 States)</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold">5. Trip_Customer_Stops</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold">6. Trip_GPS_Points</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold">7. Detected_Stops</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold">8. GPS_Gaps</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold">9. Modification_Requests</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold">10. Trip_Audit_Logs</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold">11. Invoices</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold">12. Driver_Reconciliations</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold">13. Expenses</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold">14. IndexedDB_Offline_Queue</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold">15. Plant_Geofence</div>
            <div className="p-2 bg-slate-50 border rounded font-semibold">16. System_Settings</div>
          </div>
        </div>
      )}
    </div>
  );
};
