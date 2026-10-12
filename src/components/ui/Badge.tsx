import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'purple' | 'success' | 'warning' | 'error' | 'neutral';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'purple',
  size = 'md',
  className = '',
  ...props
}) => {
  const sizeStyles = {
    sm: 'text-[10px] px-1.5 py-0.5 font-semibold',
    md: 'text-xs px-2.5 py-0.5 font-medium',
  }[size];

  const variantStyles = {
    purple: 'bg-[#EDE9FE] text-[#4C3A8C] border border-[#D5CCF5]',
    success: 'bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0]',
    warning: 'bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A]',
    error: 'bg-[#FEF2F2] text-[#991B1B] border border-[#FECACA]',
    neutral: 'bg-[#F3EFFE] text-[#4B4562] border border-[#E8E3FA]',
  }[variant];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border uppercase tracking-wider select-none ${sizeStyles} ${variantStyles} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};
