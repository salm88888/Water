/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - PWA Install Button & Standalone Status Detector
 */

import React, { useEffect, useState } from 'react';
import { Download, CheckCircle, Smartphone, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const PWAInstallButton: React.FC<{ variant?: 'light' | 'dark' }> = ({ variant = 'light' }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((window.navigator as { standalone?: boolean }).standalone);
    setIsInstalled(standalone);

    const ua = window.navigator.userAgent || '';
    setIsIos(/iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  if (isInstalled) {
    return (
      <div
        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold ${
          variant === 'dark'
            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
        }`}
      >
        <CheckCircle className="w-3 h-3" />
        <span className="hidden sm:inline">مثبت كتطبيق</span>
      </div>
    );
  }

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
      }
    } else if (isIos) {
      setShowIosGuide(true);
    } else {
      setShowIosGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        title="تثبيت تطبيق مياهنا على الهاتف للعمل دون إنترنت"
        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
          variant === 'dark'
            ? 'bg-sky-700 hover:bg-sky-600 text-white border border-sky-500'
            : 'bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200'
        }`}
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">تثبيت التطبيق</span>
      </button>

      {showIosGuide && (
        <div className="fixed inset-0 bg-slate-950/70 z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white text-slate-900 rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 text-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Smartphone className="w-4 h-4 text-sky-700" />
                <span>تثبيت تطبيق مياهنا (PWA)</span>
              </div>
              <button onClick={() => setShowIosGuide(false)} className="text-slate-400 hover:text-slate-700 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            {isIos ? (
              <p className="text-slate-600 leading-relaxed">
                على أجهزة iPhone / iPad في Safari: اضغط زر <strong>المشاركة</strong> أسفل الشاشة ثم اختر{' '}
                <strong>«إضافة إلى الشاشة الرئيسية» (Add to Home Screen)</strong> للعمل دون إنترنت.
              </p>
            ) : (
              <p className="text-slate-600 leading-relaxed">
                من قائمة متصفح Chrome أعلى الشاشة (⋮)، اختر <strong>«تثبيت التطبيق»</strong> أو{' '}
                <strong>«الإضافة إلى الشاشة الرئيسية»</strong> ليحفظ النظام محلياً ويعمل دون إنترنت.
              </p>
            )}
            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              className="w-full py-2 bg-sky-700 text-white font-bold rounded-lg hover:bg-sky-800"
            >
              تم الفهم
            </button>
          </div>
        </div>
      )}
    </>
  );
};
