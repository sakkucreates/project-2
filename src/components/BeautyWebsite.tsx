'use client';

import React, { useState } from 'react';
import { Lock, RefreshCw, AlertCircle } from 'lucide-react';
import { APP_CONFIG } from '@/lib/config';

export interface BeautyWebsiteProps {
  onReset?: () => void;
  disguiseUrl?: string;
}

export default function BeautyWebsite({
  onReset,
  disguiseUrl = APP_CONFIG.defaultDisguiseUrl,
}: BeautyWebsiteProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  return (
    <div className="fixed inset-0 w-screen h-screen bg-black overflow-hidden z-50">
      {/* Loading indicator while disguise iframe loads */}
      {loading && !error && (
        <div className="absolute inset-0 bg-[#FDFBF7] flex flex-col items-center justify-center text-slate-800 z-10">
          <div className="w-10 h-10 border-3 border-[#C89B8C]/30 border-t-[#C89B8C] rounded-full animate-spin mb-4" />
          <p className="text-xs font-serif text-[#6E5D5A] tracking-widest uppercase">
            Loading Experience...
          </p>
        </div>
      )}

      {/* Error state if iframe fails to load */}
      {error && (
        <div className="absolute inset-0 bg-[#F8F7FF] flex flex-col items-center justify-center text-[#1E1B2E] z-10 p-6 text-center">
          <AlertCircle className="w-10 h-10 text-[#EF4444] mb-3" />
          <h2 className="text-base font-semibold text-[#1E1B2E] mb-1">Preview Unavailable</h2>
          <p className="text-xs text-[#797196] max-w-sm mb-4 leading-relaxed">
            Could not connect to the disguise target. The external page may be temporarily offline.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setError(false);
                setLoading(true);
              }}
              className="min-h-[44px] px-4 py-2 bg-white hover:bg-[#EDE9FE] text-[#4C3A8C] border border-[#D5CCF5] text-xs font-medium rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
            {onReset && (
              <button
                onClick={onReset}
                className="min-h-[44px] px-4 py-2 bg-[#7C5CFC] hover:bg-[#6C4AE8] text-white text-xs font-medium rounded-xl transition-colors shadow-md"
              >
                Return to Gate
              </button>
            )}
          </div>
        </div>
      )}

      {/* Embedded disguise site - kept completely untouched */}
      <iframe
        src={disguiseUrl}
        title="Disguise Camouflage Experience"
        className="w-full h-full border-0"
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setError(true);
        }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      />

      {/* Discreet Lock Button Overlay (Bottom Right) to return to Gate */}
      {onReset && (
        <button
          onClick={onReset}
          title="Return to Access Gate"
          aria-label="Return to Access Gate"
          className="fixed bottom-3 right-3 p-2 bg-black/40 hover:bg-black/80 text-white/50 hover:text-white rounded-full backdrop-blur-md z-50 transition-all opacity-40 hover:opacity-100 shadow-lg border border-white/10 group cursor-pointer"
        >
          <Lock className="w-4 h-4 group-hover:scale-110 transition-transform" />
        </button>
      )}
    </div>
  );
}
