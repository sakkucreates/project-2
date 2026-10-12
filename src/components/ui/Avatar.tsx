import React from 'react';

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name?: string;
  avatar?: string;
  size?: 'sm' | 'md' | 'lg';
  isOnline?: boolean;
}

export const Avatar: React.FC<AvatarProps> = ({
  name = '',
  avatar = '',
  size = 'md',
  isOnline,
  className = '',
  ...props
}) => {
  const sizeClasses = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-base',
    lg: 'w-14 h-14 text-2xl',
  }[size];

  const dotSizes = {
    sm: 'w-2.5 h-2.5 border',
    md: 'w-3 h-3 border-2',
    lg: 'w-3.5 h-3.5 border-2',
  }[size];

  // Helper to determine display: emoji/character or initials
  const isEmojiOrChar = avatar && avatar.length <= 4;
  const initial = !avatar && name ? name.trim().charAt(0).toUpperCase() : '';

  return (
    <div className={`relative inline-block ${className}`} {...props}>
      <div
        className={`${sizeClasses} rounded-2xl bg-[#EDE9FE] text-[#4C3A8C] border border-[#D5CCF5] flex items-center justify-center font-semibold select-none shadow-sm transition-transform`}
      >
        {isEmojiOrChar ? avatar : initial || '👤'}
      </div>
      {typeof isOnline === 'boolean' && (
        <span
          title={isOnline ? 'Online' : 'Offline'}
          aria-label={isOnline ? 'Online' : 'Offline'}
          className={`absolute bottom-0 right-0 ${dotSizes} rounded-full border-white ${
            isOnline ? 'bg-[#10B981]' : 'bg-[#9E96BE]'
          }`}
        />
      )}
    </div>
  );
};
