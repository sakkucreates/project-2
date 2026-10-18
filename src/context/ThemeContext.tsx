'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export type WhatsAppTheme = 'dark' | 'light';

interface ThemeContextType {
  theme: WhatsAppTheme;
  toggleTheme: () => void;
  setTheme: (theme: WhatsAppTheme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  toggleTheme: () => {},
  setTheme: () => {},
});

function applyThemeToDom(t: WhatsAppTheme) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', t);
  if (t === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // WhatsApp Dark theme is default as requested
  const [theme, setThemeState] = useState<WhatsAppTheme>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('whatsapp_theme');
        if (saved === 'light' || saved === 'dark') {
          return saved;
        }
      } catch {
        // Storage unavailable fallback
      }
    }
    return 'dark';
  });

  useEffect(() => {
    applyThemeToDom(theme);
  }, [theme]);

  const setTheme = (t: WhatsAppTheme) => {
    setThemeState(t);
    try {
      localStorage.setItem('whatsapp_theme', t);
    } catch {
      // Storage unavailable fallback
    }
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
