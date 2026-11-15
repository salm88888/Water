/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Written District / Area Input Field (No Dropdown)
 */

import React from 'react';
import { MapPin } from 'lucide-react';

interface DistrictSelectFieldProps {
  value: string;
  onChange: (district: string) => void;
  districts?: string[];
  label?: string;
  required?: boolean;
  disabled?: boolean;
  theme?: 'light' | 'dark';
  inputClassName?: string;
  placeholder?: string;
}

export const DistrictSelectField: React.FC<DistrictSelectFieldProps> = ({
  value,
  onChange,
  label = 'المنطقة / الحي (مديرية الوادي - مأرب)',
  required = true,
  disabled = false,
  theme = 'light',
  inputClassName,
  placeholder = 'اكتب اسم المنطقة أو الحي (مثال: حصون آل جلال)',
}) => {
  const defaultInputCls =
    theme === 'dark'
      ? 'w-full p-2.5 bg-slate-900 border border-slate-700 focus:border-sky-500 rounded-lg text-white placeholder:text-slate-500 disabled:opacity-60'
      : 'w-full p-2.5 border border-slate-200 focus:border-sky-500 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 disabled:opacity-60';

  const labelCls =
    theme === 'dark'
      ? 'block text-slate-300 font-semibold mb-1'
      : 'block text-slate-700 font-semibold mb-1';

  return (
    <div className="space-y-1">
      <label className={labelCls}>
        {label}
        {required ? ' *' : ''}
      </label>
      <div className="relative">
        <MapPin
          className={`w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${
            theme === 'dark' ? 'text-sky-400' : 'text-sky-600'
          }`}
        />
        <input
          type="text"
          required={required}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`pr-8 ${inputClassName || defaultInputCls}`}
        />
      </div>
      <p className={`text-[10px] ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
        اكتب اسم المنطقة يدوياً كما تريد؛ ولن يتغير هذا الاسم عند تحديد الدبوس على الخريطة.
      </p>
    </div>
  );
};
