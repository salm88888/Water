/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Manager Passcode PIN Verification Modal
 * Protects Manager Mode with default passcode '20262027', featuring an on-screen keypad and keyboard input.
 */

import React, { useState } from 'react';
import {
  Lock,
  X,
  KeyRound,
  AlertCircle,
  CheckCircle,
  Delete,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface ManagerPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ManagerPinModal: React.FC<ManagerPinModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { verifyManagerPin, managerPin } = useApp();

  const [pinInput, setPinInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);

  if (!isOpen) return null;

  const handleVerify = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pinInput) return;

    if (verifyManagerPin(pinInput)) {
      setErrorMessage(null);
      setPinInput('');
      onSuccess();
    } else {
      setErrorMessage('رمز الدخول غير صحيح، يرجى إعادة المحاولة.');
    }
  };

  const handleKeypadPress = (num: string) => {
    setErrorMessage(null);
    if (pinInput.length < 12) {
      const next = pinInput + num;
      setPinInput(next);
      // Optional: Auto verify if exact length matches
      if (next.length === managerPin.length && verifyManagerPin(next)) {
        setTimeout(() => {
          setPinInput('');
          onSuccess();
        }, 150);
      }
    }
  };

  const handleBackspace = () => {
    setErrorMessage(null);
    setPinInput((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setErrorMessage(null);
    setPinInput('');
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl text-white text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center">
              <Lock className="w-4 h-4" />
            </div>
            <span className="font-bold text-sm text-white">دخول المدير العام</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Prompt */}
        <div className="space-y-1">
          <h3 className="font-bold text-base text-slate-100">أدخل رمز مرور المدير</h3>
          <p className="text-xs text-slate-400">
            الرمز الافتراضي: <span className="font-mono text-sky-400 font-bold tracking-wider">20262027</span>
          </p>
        </div>

        {/* PIN Input Display */}
        <form onSubmit={handleVerify} className="space-y-3">
          <div className="relative">
            <input
              type={showPin ? 'text' : 'password'}
              autoFocus
              value={pinInput}
              onChange={(e) => {
                setErrorMessage(null);
                setPinInput(e.target.value);
              }}
              placeholder="••••••••"
              className="w-full py-3 px-4 bg-slate-950 border border-slate-700 rounded-xl font-mono text-xl tracking-widest text-center text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 placeholder:text-slate-600"
            />
            <button
              type="button"
              onClick={() => setShowPin(!showPin)}
              className="absolute left-3 top-3.5 text-slate-400 hover:text-slate-200"
            >
              {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {errorMessage && (
            <div className="text-rose-400 text-xs flex items-center justify-center gap-1.5 font-medium animate-shake">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* On-Screen Numeric Keypad */}
          <div className="grid grid-cols-3 gap-2 pt-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => handleKeypadPress(String(n))}
                className="py-3 bg-slate-800 hover:bg-slate-750 active:bg-sky-600 active:text-white rounded-xl font-mono text-lg font-bold transition-colors shadow-sm"
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              className="py-3 bg-slate-800/60 hover:bg-slate-750 text-slate-400 hover:text-slate-200 rounded-xl text-xs font-semibold transition-colors"
            >
              مسح
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress('0')}
              className="py-3 bg-slate-800 hover:bg-slate-750 active:bg-sky-600 active:text-white rounded-xl font-mono text-lg font-bold transition-colors shadow-sm"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="py-3 bg-slate-800/60 hover:bg-slate-750 text-slate-400 hover:text-slate-200 rounded-xl flex items-center justify-center transition-colors"
            >
              <Delete className="w-5 h-5 rotate-180" />
            </button>
          </div>

          {/* Submit Action */}
          <button
            type="submit"
            className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs transition-colors shadow-lg active:scale-98 flex items-center justify-center gap-2 mt-2"
          >
            <KeyRound className="w-4 h-4" />
            <span>تأكيد والدخول للوحة التحكم</span>
          </button>
        </form>
      </div>
    </div>
  );
};
