/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Change Manager Passcode Modal
 * Allows updating the Manager entry PIN with old PIN verification.
 */

import React, { useState } from 'react';
import {
  KeyRound,
  X,
  Lock,
  CheckCircle,
  AlertCircle,
  Save,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const ChangePinModal: React.FC = () => {
  const {
    isChangePinModalOpen,
    setIsChangePinModalOpen,
    verifyManagerPin,
    updateManagerPin,
  } = useApp();

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isChangePinModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!verifyManagerPin(currentPin)) {
      setError('رمز الدخول الحالي غير صحيح!');
      return;
    }

    if (newPin.trim().length < 4) {
      setError('يجب أن يتكون الرمز الجديد من 4 أرقام على الأقل.');
      return;
    }

    if (newPin !== confirmPin) {
      setError('الرمز الجديد وتأكيد الرمز غير متطابقين!');
      return;
    }

    setIsSubmitting(true);
    try {
      const ok = await updateManagerPin(newPin);
      if (ok) {
        setSuccess('تم تغيير رمز دخول المدير بنجاح وتطبيقه!');
        setTimeout(() => {
          setIsChangePinModalOpen(false);
          setCurrentPin('');
          setNewPin('');
          setConfirmPin('');
          setSuccess(null);
        }, 1800);
      } else {
        setError('تعذر حفظ الرمز، يرجى المحاولة لاحقاً.');
      }
    } catch (err) {
      console.error(err);
      setError('حدث خطأ أثناء حفظ الرمز.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-slate-800 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
              <KeyRound className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-slate-900">تغيير رمز دخول المدير العام</h3>
          </div>
          <button
            onClick={() => setIsChangePinModalOpen(false)}
            className="text-slate-400 hover:text-slate-600 p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-700 font-semibold mb-1">
              رمز الدخول الحالي *
            </label>
            <input
              type="password"
              required
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value)}
              placeholder="الرمز الحالي (الافتراضي 20262027)"
              className="w-full p-2.5 border border-slate-200 rounded-lg font-mono tracking-widest text-left"
              style={{ direction: 'ltr' }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                الرمز الجديد *
              </label>
              <input
                type="password"
                required
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder="الرمز الجديد"
                className="w-full p-2.5 border border-slate-200 rounded-lg font-mono tracking-widest text-left"
                style={{ direction: 'ltr' }}
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                تأكيد الرمز الجديد *
              </label>
              <input
                type="password"
                required
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                placeholder="تأكيد الرمز"
                className="w-full p-2.5 border border-slate-200 rounded-lg font-mono tracking-widest text-left"
                style={{ direction: 'ltr' }}
              />
            </div>
          </div>

          <p className="text-[11px] text-slate-500 pt-1">
            سيتم حفظ الرمز الجديد واستخدامه لحماية الدخول لوضع المدير على هذا الجهاز وفي النظام.
          </p>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsChangePinModalOpen(false)}
              className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-medium"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-sky-700 text-white rounded-lg hover:bg-sky-800 font-semibold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSubmitting ? 'جاري الحفظ...' : 'حفظ الرمز الجديد'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
