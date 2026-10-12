import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'white' | 'lavender' | 'flat';
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ children, variant = 'white', className = '', ...props }, ref) => {
    const variantStyles = {
      white: 'bg-white border border-[#E8E3FA] shadow-lg shadow-[#4C3A8C]/5',
      lavender: 'bg-[#EDE9FE]/60 border border-[#D5CCF5] shadow-sm',
      flat: 'bg-[#F8F7FF] border border-[#E8E3FA]',
    }[variant];

    return (
      <div
        ref={ref}
        className={`rounded-2xl transition-all ${variantStyles} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
