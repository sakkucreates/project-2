import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string | boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ error, leftIcon, rightIcon, className = '', disabled, id, ...props }, ref) => {
    const hasError = Boolean(error);

    return (
      <div className="relative w-full">
        {leftIcon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#797196] pointer-events-none flex items-center justify-center">
            {leftIcon}
          </div>
        )}

        <input
          ref={ref}
          id={id}
          disabled={disabled}
          aria-invalid={hasError ? 'true' : undefined}
          aria-describedby={hasError && typeof error === 'string' && id ? `${id}-error` : undefined}
          className={`w-full min-h-[44px] py-2.5 bg-white text-[#1E1B2E] placeholder-[#9E96BE] text-sm rounded-xl border transition-all outline-none disabled:bg-[#F3EFFE]/50 disabled:text-[#797196] disabled:cursor-not-allowed ${
            leftIcon ? 'pl-10' : 'pl-4'
          } ${rightIcon ? 'pr-10' : 'pr-4'} ${
            hasError
              ? 'border-[#EF4444] focus:border-[#EF4444] focus:ring-2 focus:ring-[#EF4444]/20'
              : 'border-[#DCD6F7] hover:border-[#7C5CFC]/60 focus:border-[#7C5CFC] focus:ring-2 focus:ring-[#7C5CFC]/25 shadow-sm'
          } ${className}`}
          {...props}
        />

        {rightIcon && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#797196] flex items-center justify-center">
            {rightIcon}
          </div>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
