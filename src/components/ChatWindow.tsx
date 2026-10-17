'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Image as ImageIcon,
  ArrowLeft,
  CheckCheck,
  Check,
  AlertCircle,
  RefreshCw,
  MessageSquare,
  Smile,
  X,
  Trash2,
} from 'lucide-react';
import { User, Message, Reaction } from '@/types';
import { Avatar, Spinner } from '@/components/ui';
import { compressAndResizeImage } from '@/lib/imageCompression';
import EmojiPicker from './EmojiPicker';
import { isDifferentCalendarDay, formatDateDivider } from '@/lib/dateUtils';

export const REACTION_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '🙏'] as const;

export interface ChatMessageItem extends Message {
  isOptimistic?: boolean;
  failed?: boolean;
}

export interface ChatWindowProps {
  currentUser: User;
  contact: User;
  messages: ChatMessageItem[];
  onSendMessage: (text: string, image?: string) => Promise<boolean>;
  onRetryMessage?: (messageId: string, text: string, image?: string) => Promise<void>;
  onReactToMessage?: (messageId: string, emoji: string) => Promise<void>;
  onClearChat?: () => Promise<boolean>;
  onBack: () => void;
  loading: boolean;
  error?: string | null;
}

export default function ChatWindow({
  currentUser,
  contact,
  messages,
  onSendMessage,
  onRetryMessage,
  onReactToMessage,
  onClearChat,
  onBack,
  loading,
  error = null,
}: ChatWindowProps) {
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [compressingImage, setCompressingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [previewLightbox, setPreviewLightbox] = useState<string | null>(null);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastActiveImageTriggerRef = useRef<HTMLButtonElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Adjust textarea height dynamically
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  // Image file selection & validation with client-side compression
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Check allowed MIME types: raster only (jpeg, png, webp, gif)
    const allowedMime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedMime.includes(file.type.toLowerCase())) {
      setImageError('Unsupported format. Please select a JPEG, PNG, WebP, or GIF image.');
      e.target.value = '';
      return;
    }

    setCompressingImage(true);
    try {
      const { dataUrl } = await compressAndResizeImage(file);
      setSelectedImage(dataUrl);
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Failed to process image attachment.');
    } finally {
      setCompressingImage(false);
      e.target.value = '';
    }
  };

  const handleInsertEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart ?? inputText.length;
      const end = textarea.selectionEnd ?? inputText.length;
      const before = inputText.substring(0, start);
      const after = inputText.substring(end);
      const nextText = `${before}${emoji}${after}`;
      setInputText(nextText);

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
          textareaRef.current.focus();
          const nextPos = start + emoji.length;
          textareaRef.current.setSelectionRange(nextPos, nextPos);
        }
      }, 0);
    } else {
      setInputText((prev) => prev + emoji);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if ((!trimmed && !selectedImage) || submitting) return;

    setSubmitting(true);
    setImageError(null);
    setShowEmojiPicker(false);
    const textToSend = trimmed;
    const imageToSend = selectedImage || undefined;

    setInputText('');
    setSelectedImage(null);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const success = await onSendMessage(textToSend, imageToSend);
      if (!success) {
        // Restore input if message failed entirely to dispatch
        setInputText(textToSend);
        if (imageToSend) setSelectedImage(imageToSend);
      }
    } finally {
      setSubmitting(false);
      textareaRef.current?.focus();
    }
  };

  // Keyboard navigation: Enter to submit, Shift+Enter for newline
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Lightbox close & focus restoration
  const closeLightbox = () => {
    setPreviewLightbox(null);
    if (lastActiveImageTriggerRef.current) {
      lastActiveImageTriggerRef.current.focus();
    }
  };

  // Keyboard support for Lightbox
  useEffect(() => {
    if (!previewLightbox) return;
    const handleLightboxKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeLightbox();
      }
    };
    window.addEventListener('keydown', handleLightboxKeyDown);
    return () => window.removeEventListener('keydown', handleLightboxKeyDown);
  }, [previewLightbox]);

  // Aggregate message reactions by emoji count
  const renderReactionSummary = (reactions?: Reaction[]) => {
    if (!reactions || reactions.length === 0) return null;

    const counts = reactions.reduce((acc, r) => {
      acc[r.emoji] = (acc[r.emoji] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return (
      <div className="flex flex-wrap gap-1 mt-1.5 select-none">
        {Object.entries(counts).map(([emoji, count]) => {
          const userHasReacted = reactions.some(
            (r) => r.userId === currentUser.id && r.emoji === emoji
          );
          return (
            <button
              key={emoji}
              onClick={() => onReactToMessage?.(activeReactionMsgId || '', emoji)}
              title={`${count} ${emoji}`}
              aria-label={`${count} ${emoji} reaction`}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors border ${
                userHasReacted
                  ? 'bg-[#EDE9FE] border-[#7C5CFC] text-[#4C3A8C] font-semibold'
                  : 'bg-white border-[#E8E3FA] text-[#1E1B2E] hover:border-[#D5CCF5]'
              }`}
            >
              <span>{emoji}</span>
              {count > 1 && <span className="text-[10px]">{count}</span>}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F8F7FF] relative overflow-hidden">
      {/* Chat Conversation Header */}
      <header className="h-16 px-4 flex items-center justify-between bg-white border-b border-[#E8E3FA] z-10 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="md:hidden p-2 -ml-1 text-[#797196] hover:text-[#4C3A8C] hover:bg-[#EDE9FE]/50 rounded-xl transition-colors"
            title="Back to contacts"
            aria-label="Back to contacts"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Avatar
            name={contact.name}
            avatar={contact.avatar}
            size="md"
            isOnline={contact.status === 'online'}
          />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[#1E1B2E] truncate">
              {contact.name}
            </h2>
            <p className="text-[11px] font-medium flex items-center gap-1">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  contact.status === 'online' ? 'bg-[#10B981]' : 'bg-[#9E96BE]'
                }`}
              />
              <span
                className={contact.status === 'online' ? 'text-[#10B981]' : 'text-[#797196]'}
              >
                {contact.status === 'online' ? 'Online' : 'Offline'}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {onClearChat && (
            <button
              onClick={() => setShowClearConfirm(true)}
              title="Clear conversation history"
              aria-label="Clear conversation history"
              className="p-2 text-[#797196] hover:text-[#EF4444] hover:bg-[#FEF2F2] rounded-xl transition-colors"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>

      {/* Network or Sync Error Banner */}
      {error && (
        <div className="px-4 py-2 bg-[#FEF2F2] border-b border-[#FECACA] flex items-center gap-2 text-xs text-[#991B1B]">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F8F7FF]">
        {loading && messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-[#797196]">
            <Spinner size="md" className="mb-2" />
            <p className="text-xs">Loading conversation history...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-[#797196] text-center p-6">
            <div className="w-12 h-12 rounded-2xl bg-[#EDE9FE] border border-[#D5CCF5] flex items-center justify-center text-[#7C5CFC] mb-3 shadow-sm">
              <MessageSquare className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-[#1E1B2E]">No messages yet</p>
            <p className="text-xs text-[#797196] mt-0.5 max-w-xs">
              Say hello or attach an image to start chatting with {contact.name}.
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.senderId === currentUser.id;
            const isPickerOpen = activeReactionMsgId === msg.id;
            const showDateDivider = isDifferentCalendarDay(
              msg.createdAt,
              messages[idx - 1]?.createdAt
            );

            return (
              <React.Fragment key={msg.id}>
                {showDateDivider && (
                  <div className="flex justify-center my-3 select-none">
                    <span className="bg-white/90 border border-[#E8E3FA] text-[#797196] text-[11px] font-semibold px-3 py-1 rounded-full shadow-xs">
                      {formatDateDivider(msg.createdAt)}
                    </span>
                  </div>
                )}
                <div
                  className={`flex flex-col group relative ${isMe ? 'items-end' : 'items-start'}`}
                >
                  <div className="relative max-w-[85%] sm:max-w-md">
                  {/* Reaction Button (Hover / Touch Action) */}
                  {!msg.isOptimistic && !msg.failed && onReactToMessage && (
                    <button
                      onClick={() => setActiveReactionMsgId(isPickerOpen ? null : msg.id)}
                      title="Add reaction"
                      aria-label="Add reaction"
                      className={`absolute -top-3 ${
                        isMe ? '-left-7' : '-right-7'
                      } opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded-full bg-white border border-[#E8E3FA] text-[#797196] hover:text-[#7C5CFC] transition-opacity shadow-sm z-10`}
                    >
                      <Smile className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Reaction Picker Overlay */}
                  {isPickerOpen && onReactToMessage && (
                    <div
                      className={`absolute -top-10 ${
                        isMe ? 'right-0' : 'left-0'
                      } flex items-center gap-1.5 p-1.5 bg-white border border-[#E8E3FA] rounded-full shadow-lg z-20 animate-fadeIn`}
                    >
                      {REACTION_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={async () => {
                            setActiveReactionMsgId(null);
                            await onReactToMessage(msg.id, emoji);
                          }}
                          className="hover:scale-125 transition-transform p-1 text-base leading-none"
                          title={emoji}
                          aria-label={`React with ${emoji}`}
                        >
                          {emoji}
                        </button>
                      ))}
                      <button
                        onClick={() => setActiveReactionMsgId(null)}
                        className="p-1 text-[#797196] hover:text-[#1E1B2E]"
                        title="Close reaction picker"
                        aria-label="Close reaction picker"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {/* Chat Message Bubble */}
                  <div
                    className={`rounded-2xl px-4 py-2.5 text-sm shadow-sm transition-all ${
                      isMe
                        ? 'bg-[#7C5CFC] text-white rounded-br-none'
                        : 'bg-white text-[#1E1B2E] border border-[#E8E3FA] rounded-bl-none shadow-md shadow-[#4C3A8C]/5'
                    } ${msg.failed ? 'border-2 border-[#EF4444] bg-[#FEF2F2] text-[#991B1B]' : ''}`}
                  >
                    {/* Image Attachment Preview */}
                    {msg.image && (
                      <button
                        type="button"
                        onClick={(e) => {
                          lastActiveImageTriggerRef.current = e.currentTarget;
                          setPreviewLightbox(msg.image || null);
                        }}
                        className="mb-2 block overflow-hidden rounded-xl focus:outline-none focus:ring-2 focus:ring-[#EDE9FE]"
                        title="Click to expand image"
                        aria-label="View enlarged image"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={msg.image}
                          alt="Image message attachment"
                          className="max-h-60 max-w-full rounded-xl object-cover hover:opacity-95 transition-opacity"
                        />
                      </button>
                    )}

                    {/* Text Content */}
                    {msg.text && (
                      <p className="whitespace-pre-wrap break-words leading-relaxed select-text">
                        {msg.text}
                      </p>
                    )}

                    {/* Metadata & Status Badges */}
                    <div
                      className={`flex items-center justify-end gap-1 mt-1 text-[10px] select-none ${
                        isMe
                          ? msg.failed
                            ? 'text-[#EF4444]'
                            : 'text-white/80'
                          : 'text-[#797196]'
                      }`}
                    >
                      <span>
                        {new Date(msg.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>

                      {isMe && (
                        <span>
                          {msg.failed ? (
                            <AlertCircle className="w-3.5 h-3.5 text-[#EF4444]" />
                          ) : msg.isOptimistic ? (
                            <Spinner size="sm" className="text-white/80 w-3 h-3" />
                          ) : msg.read ? (
                            <CheckCheck className="w-3.5 h-3.5 text-[#EDE9FE]" />
                          ) : (
                            <Check className="w-3.5 h-3.5 text-white/70" />
                          )}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Reaction Summary Pills */}
                  {renderReactionSummary(msg.reactions)}

                  {/* Failed Message Retry */}
                  {msg.failed && onRetryMessage && (
                    <div className="flex items-center justify-end gap-1.5 mt-1 text-[11px] text-[#EF4444]">
                      <span>Failed to send.</span>
                      <button
                        onClick={() => onRetryMessage(msg.id, msg.text, msg.image)}
                        className="font-semibold underline flex items-center gap-0.5 hover:text-[#DC2626]"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Retry</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </React.Fragment>
          );
        })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Selected Image Preview Staging */}
      {selectedImage && (
        <div className="px-4 py-2 bg-white border-t border-[#E8E3FA] flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedImage}
              alt="Attachment preview"
              className="w-12 h-12 object-cover rounded-xl border border-[#D5CCF5]"
            />
            <div>
              <span className="text-xs font-medium text-[#1E1B2E] block">Image attached</span>
              <span className="text-[10px] text-[#797196]">Ready to send</span>
            </div>
          </div>
          <button
            onClick={() => setSelectedImage(null)}
            className="p-1.5 text-[#797196] hover:text-[#EF4444] rounded-lg transition-colors"
            title="Cancel image attachment"
            aria-label="Cancel image attachment"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Image Error Alert */}
      {imageError && (
        <div className="px-4 py-2 bg-[#FEF2F2] border-t border-[#FECACA] flex items-center justify-between text-xs text-[#991B1B]">
          <span>{imageError}</span>
          <button
            onClick={() => setImageError(null)}
            className="text-[11px] font-semibold underline ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Composer Input Area */}
      <div className="relative">
        {showEmojiPicker && (
          <EmojiPicker
            onSelectEmoji={handleInsertEmoji}
            onClose={() => setShowEmojiPicker(false)}
          />
        )}

        <form
          onSubmit={handleSend}
          className="p-3 bg-white border-t border-[#E8E3FA] flex items-end gap-2 z-10 shadow-sm"
        >
          {/* Hidden File Input for Image Upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={handleFileSelect}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={compressingImage || submitting}
            title="Attach image"
            aria-label="Attach image"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 text-[#797196] hover:text-[#7C5CFC] hover:bg-[#EDE9FE]/50 rounded-xl transition-colors flex-shrink-0 disabled:opacity-50"
          >
            {compressingImage ? (
              <Spinner size="sm" className="text-[#7C5CFC]" />
            ) : (
              <ImageIcon className="w-5 h-5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowEmojiPicker((prev) => !prev)}
            disabled={submitting}
            title={showEmojiPicker ? 'Close emoji picker' : 'Add emoji'}
            aria-label={showEmojiPicker ? 'Close emoji picker' : 'Add emoji'}
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-xl transition-colors flex-shrink-0 disabled:opacity-50 ${
              showEmojiPicker
                ? 'text-[#7C5CFC] bg-[#EDE9FE]'
                : 'text-[#797196] hover:text-[#7C5CFC] hover:bg-[#EDE9FE]/50'
            }`}
          >
            <Smile className="w-5 h-5" />
          </button>

          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                selectedImage
                  ? 'Add an optional caption... (Enter to send)'
                  : `Message ${contact.name}... (Enter to send)`
              }
              aria-label={`Message ${contact.name}`}
              disabled={submitting}
              className="w-full resize-none min-h-[44px] max-h-32 py-2.5 px-4 bg-[#F8F7FF] border border-[#DCD6F7] rounded-xl text-sm text-[#1E1B2E] placeholder-[#9E96BE] focus:outline-none focus:border-[#7C5CFC] focus:ring-2 focus:ring-[#7C5CFC]/20 transition-all leading-normal"
            />
          </div>

          <button
            type="submit"
            disabled={(!inputText.trim() && !selectedImage) || submitting || compressingImage}
            aria-label="Send message"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2.5 bg-[#7C5CFC] hover:bg-[#6C4AE8] active:bg-[#5E3CD8] disabled:bg-[#EDE9FE] disabled:text-[#8E82B2] disabled:cursor-not-allowed text-white rounded-xl transition-all shadow-md shadow-[#7C5CFC]/20 flex-shrink-0"
          >
            {submitting ? (
              <Spinner size="sm" className="text-white" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </form>
      </div>

      {/* Accessible Image Lightbox Modal */}
      {previewLightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={closeLightbox}
          className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn"
        >
          <button
            onClick={closeLightbox}
            title="Close image preview (Escape)"
            aria-label="Close image preview"
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-white"
          >
            <X className="w-6 h-6" />
          </button>
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-4xl max-h-[90vh] flex items-center justify-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewLightbox}
              alt="Enlarged conversation attachment"
              className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl select-none"
            />
          </div>
        </div>
      )}

      {/* Clear Chat Accessible Confirmation Modal */}
      {showClearConfirm && onClearChat && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-chat-title"
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn"
        >
          <div
            className="bg-white border border-[#E8E3FA] rounded-2xl p-6 max-w-sm w-full shadow-2xl text-[#1E1B2E]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="clear-chat-title" className="text-base font-bold text-[#1E1B2E] mb-2">
              Clear this conversation?
            </h3>
            <p className="text-xs text-[#797196] mb-5 leading-relaxed">
              This action permanently deletes all messages in this conversation for both participants. Cleared messages cannot be recovered.
            </p>
            <div className="flex justify-end gap-2.5">
              <button
                disabled={clearing}
                onClick={() => setShowClearConfirm(false)}
                className="min-h-[40px] px-4 py-2 text-xs font-semibold text-[#4B4562] hover:bg-[#F8F7FF] border border-[#D5CCF5] rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={clearing}
                onClick={async () => {
                  setClearing(true);
                  try {
                    const success = await onClearChat();
                    if (success) {
                      setShowClearConfirm(false);
                    }
                  } finally {
                    setClearing(false);
                  }
                }}
                className="min-h-[40px] px-4 py-2 text-xs font-semibold bg-[#EF4444] hover:bg-[#DC2626] text-white rounded-xl transition-colors shadow-md flex items-center gap-1.5"
              >
                {clearing ? <Spinner size="sm" className="text-white" /> : null}
                <span>Clear Chat</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
