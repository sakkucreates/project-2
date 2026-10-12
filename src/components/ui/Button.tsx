import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled,
      className = '',
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium rounded-xl transition-all select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C5CFC]/40 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]';

    const sizeStyles = {
      sm: 'text-xs px-3 py-1.5 min-h-[36px] gap-1.5',
      md: 'text-sm px-4 py-2.5 min-h-[44px] gap-2',
      lg: 'text-base px-5 py-3 min-h-[48px] gap-2.5',
    }[size];

    const variantStyles = {
      primary:
        'bg-[#7C5CFC] hover:bg-[#6C4AE8] active:bg-[#5E3CD8] text-white shadow-md shadow-[#7C5CFC]/20 border border-transparent',
      secondary:
        'bg-[#EDE9FE] hover:bg-[#E4DEFD] active:bg-[#D9D0FB] text-[#4C3A8C] border border-[#D5CCF5]',
      outline:
        'bg-white hover:bg-[#F8F7FF] active:bg-[#EDE9FE] text-[#1E1B2E] border border-[#DCD6F7] shadow-sm',
      ghost:
        'bg-transparent hover:bg-[#EDE9FE]/50 active:bg-[#EDE9FE] text-[#4C3A8C] border border-transparent',
      destructive:
        'bg-[#FEF2F2] hover:bg-[#FEE2E2] active:bg-[#FECACA] text-[#991B1B] border border-[#FECACA]',
    }[variant];

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${sizeStyles} ${variantStyles} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
