import React, { type InputHTMLAttributes, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export function PasswordInput({ className = '', ...props }: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);
  const toggleLabel = isVisible ? 'Hide password' : 'Show password';

  return (
    <div className="relative">
      <input
        {...props}
        type={isVisible ? 'text' : 'password'}
        className={`${className} pr-11`}
      />
      <button
        type="button"
        onClick={() => setIsVisible((visible) => !visible)}
        aria-label={toggleLabel}
        aria-pressed={isVisible}
        title={toggleLabel}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-slate-400 transition hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0866B1]"
      >
        {isVisible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </div>
  );
}
