'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Image as ImageIcon,
  Video as VideoIcon,
  ArrowLeft,
  CheckCheck,
  Check,
  AlertCircle,
  RefreshCw,
  MessageSquare,
  Smile,
  X,
  Trash2,
  ChevronDown,
  Reply,
  Pin,
  Star,
  Plus,
  Sun,
  Moon,
  ShieldAlert,
  Video,
  Phone,
  Lock,
  Mic,
  Play,
  Pause,
} from 'lucide-react';
import { User, Message, Reaction } from '@/types';
import { Avatar, Spinner } from '@/components/ui';
import { compressAndResizeImage } from '@/lib/imageCompression';
import { APP_CONFIG } from '@/lib/config';
import EmojiPicker from './EmojiPicker';
import { isDifferentCalendarDay, formatDateDivider } from '@/lib/dateUtils';
import { useTheme } from '@/context/ThemeContext';

export const REACTION_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '🙏'] as const;

export interface ChatMessageItem extends Message {
  isOptimistic?: boolean;
  failed?: boolean;
}

/**
 * WhatsApp-Style Voice Note Audio Bubble Player
 */
function AudioBubblePlayer({
  src,
  isMe,
  isDark,
}: {
  src: string;
  isMe: boolean;
  isDark: boolean;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('durationchange', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('durationchange', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const time = parseFloat(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
  };

  const formatAudioTime = (seconds: number) => {
    if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="flex items-center gap-3 py-1 px-0.5 min-w-[210px] sm:min-w-[250px]">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        type="button"
        onClick={togglePlay}
        className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-transform active:scale-95 shadow-xs cursor-pointer ${
          isMe
            ? 'bg-[#00a884] text-white hover:bg-[#02906f]'
            : 'bg-[#00a884] text-white hover:bg-[#02906f]'
        }`}
        title={isPlaying ? 'Pause voice note' : 'Play voice note'}
        aria-label={isPlaying ? 'Pause voice note' : 'Play voice note'}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 fill-white text-white" />
        ) : (
          <Play className="w-4 h-4 fill-white text-white ml-0.5" />
        )}
      </button>

      <div className="flex-1 flex flex-col justify-center min-w-0">
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-[#00a884] ${
            isDark ? 'bg-black/40' : 'bg-black/15'
          }`}
        />
        <div className="flex justify-between items-center text-[10px] mt-1 text-inherit opacity-75 font-mono">
          <span>{formatAudioTime(currentTime)}</span>
          <span>{formatAudioTime(duration || 0)}</span>
        </div>
      </div>

      <div className="flex-shrink-0 opacity-80">
        <Mic className="w-4 h-4 text-[#00a884]" />
      </div>
    </div>
  );
}

export interface ChatWindowProps {
  currentUser: User;
  contact: User;
  messages: ChatMessageItem[];
  isContactTyping?: boolean;
  onSendMessage: (
    text: string,
    image?: string,
    video?: string,
    replyTo?: Message['replyTo'],
    audio?: string
  ) => Promise<boolean>;
  onRetryMessage?: (
    messageId: string,
    text: string,
    image?: string,
    video?: string,
    audio?: string
  ) => Promise<void>;
  onReactToMessage?: (messageId: string, emoji: string) => Promise<void>;
  onDeleteMessage?: (messageId: string, mode?: 'everyone' | 'forMe') => Promise<boolean>;
  onClearChat?: () => Promise<boolean>;
  onPanic?: () => void;
  onBack: () => void;
  loading: boolean;
  error?: string | null;
}

export default function ChatWindow({
  currentUser,
  contact,
  messages,
  isContactTyping = false,
  onSendMessage,
  onRetryMessage,
  onReactToMessage,
  onDeleteMessage,
  onClearChat,
  onPanic,
  onBack,
  loading,
  error = null,
}: ChatWindowProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [compressingImage, setCompressingImage] = useState(false);
  const [readingVideo, setReadingVideo] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [deleteTargetMsg, setDeleteTargetMsg] = useState<ChatMessageItem | null>(null);
  const [hiddenMsgIds, setHiddenMsgIds] = useState<Set<string>>(() => new Set());
  const [previewLightbox, setPreviewLightbox] = useState<string | null>(null);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);
  const [activeMenuMsgId, setActiveMenuMsgId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessageItem | null>(null);
  const [pinnedMsgIds, setPinnedMsgIds] = useState<Set<string>>(() => new Set());
  const [starredMsgIds, setStarredMsgIds] = useState<Set<string>>(() => new Set());
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Feature 1: Voice Notes / Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Feature 2: Typing Heartbeat Tracking Refs
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingSentRef = useRef<number>(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const lastActiveImageTriggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Sends typing heartbeat to server and debounces reset after 2.5s
  const sendTypingHeartbeat = (isTyping: boolean) => {
    if (!currentUser || !contact) return;
    const now = Date.now();

    if (!isTyping) {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      fetch('/api/users/typing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, receiverId: null, isTyping: false }),
      }).catch(() => {});
      return;
    }

    // Throttle heartbeat to at most once per 1.5s
    if (now - lastTypingSentRef.current > 1500) {
      lastTypingSentRef.current = now;
      fetch('/api/users/typing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, receiverId: contact.id, isTyping: true }),
      }).catch(() => {});
    }

    // Automatic reset: clears 2.5 seconds after typing stops
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }
    typingTimerRef.current = setTimeout(() => {
      fetch('/api/users/typing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, receiverId: null, isTyping: false }),
      }).catch(() => {});
    }, 2500);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Voice recording handlers
  const startRecording = async () => {
    setImageError(null);
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setImageError('Audio recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      audioChunksRef.current = [];

      let mimeType = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined') {
        if (!MediaRecorder.isTypeSupported('audio/webm')) {
          if (MediaRecorder.isTypeSupported('audio/mp4')) {
            mimeType = 'audio/mp4';
          } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
            mimeType = 'audio/ogg';
          }
        }
      }

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start(200);
      setIsRecording(true);
      setRecordingDuration(0);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch {
      setImageError('Microphone permission denied or device unavailable.');
    }
  };

  const cancelRecording = () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordingDuration(0);
  };

  const stopAndSendRecording = () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      cancelRecording();
      return;
    }

    recorder.onstop = () => {
      const mime = recorder.mimeType || 'audio/webm';
      const audioBlob = new Blob(audioChunksRef.current, { type: mime });
      const reader = new FileReader();
      reader.onloadend = async () => {
        const dataUrl = reader.result as string;
        if (dataUrl) {
          const replyToData = replyingTo
            ? {
                id: replyingTo.id,
                text: replyingTo.text,
                senderName: replyingTo.senderId === currentUser.id ? currentUser.name : contact.name,
              }
            : undefined;
          setReplyingTo(null);
          await onSendMessage('', undefined, undefined, replyToData, dataUrl);
        }
      };
      reader.readAsDataURL(audioBlob);

      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
      }
      setIsRecording(false);
      setRecordingDuration(0);
    };

    try {
      recorder.stop();
    } catch {
      cancelRecording();
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Close message options menu on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenuMsgId(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveMenuMsgId(null);
      }
    };
    if (activeMenuMsgId) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeMenuMsgId]);

  const prevMsgCountRef = useRef(0);
  const prevLastMsgIdRef = useRef<string | null>(null);
  const isInitialScrollRef = useRef(true);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    const lastMsgId = lastMsg?.id || null;
    const countChanged = messages.length !== prevMsgCountRef.current;
    const lastMsgChanged = lastMsgId !== prevLastMsgIdRef.current;

    prevMsgCountRef.current = messages.length;
    prevLastMsgIdRef.current = lastMsgId;

    if (!countChanged && !lastMsgChanged) return;

    if (isInitialScrollRef.current) {
      isInitialScrollRef.current = false;
      scrollToBottom('auto');
    } else {
      scrollToBottom('smooth');
    }
  }, [messages]);

  // Adjust textarea height dynamically & trigger live typing
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    sendTypingHeartbeat(true);
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
      setSelectedVideo(null); // Keep one media attachment per message
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Failed to process image attachment.');
    } finally {
      setCompressingImage(false);
      e.target.value = '';
    }
  };

  // Video file selection & validation
  const handleVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > APP_CONFIG.limits.maxVideoSizeBytes) {
      setImageError('Video exceeds 15MB limit. Please choose a smaller video clip.');
      e.target.value = '';
      return;
    }

    const allowedVideo = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-matroska'];
    if (!allowedVideo.includes(file.type.toLowerCase()) && !file.type.startsWith('video/')) {
      setImageError('Unsupported format. Please select an MP4, WebM, OGG, or MOV video.');
      e.target.value = '';
      return;
    }

    setReadingVideo(true);
    try {
      const reader = new FileReader();
      reader.onload = () => {
        setSelectedVideo(reader.result as string);
        setSelectedImage(null); // Keep one media attachment per message
        setReadingVideo(false);
      };
      reader.onerror = () => {
        setImageError('Failed to read video file.');
        setReadingVideo(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setImageError('Failed to process video attachment.');
      setReadingVideo(false);
    } finally {
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
    if ((!trimmed && !selectedImage && !selectedVideo) || submitting || readingVideo) return;

    setSubmitting(true);
    sendTypingHeartbeat(false);
    setImageError(null);
    setShowEmojiPicker(false);
    const textToSend = trimmed;
    const imageToSend = selectedImage || undefined;
    const videoToSend = selectedVideo || undefined;
    const replyToData = replyingTo
      ? {
          id: replyingTo.id,
          text: replyingTo.text,
          senderName: replyingTo.senderId === currentUser.id ? currentUser.name : contact.name,
        }
      : undefined;

    setReplyingTo(null);
    setInputText('');
    setSelectedImage(null);
    setSelectedVideo(null);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const success = await onSendMessage(textToSend, imageToSend, videoToSend, replyToData);
      if (!success) {
        // Restore input if message failed entirely to dispatch
        setInputText(textToSend);
        if (imageToSend) setSelectedImage(imageToSend);
        if (videoToSend) setSelectedVideo(videoToSend);
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
  const renderReactionSummary = (reactions?: Reaction[], messageId?: string) => {
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
              onClick={() => onReactToMessage?.(messageId || activeReactionMsgId || '', emoji)}
              title={`${count} ${emoji}`}
              aria-label={`${count} ${emoji} reaction`}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors border shadow-xs ${
                userHasReacted
                  ? isDark
                    ? 'bg-[#262d31] border-[#3b4a54] text-[#e9edef] font-semibold'
                    : 'bg-[#EDE9FE] border-[#7C5CFC] text-[#4C3A8C] font-semibold'
                  : isDark
                    ? 'bg-[#1e2428] border-[#2a3136] text-[#8696a0] hover:border-[#3b4a54] hover:text-[#d1d7db]'
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

  const visibleMessages = messages.filter((m) => !hiddenMsgIds.has(m.id));

  return (
    <div
      className={`flex-1 flex flex-col h-full relative overflow-hidden transition-colors duration-200 ${
        isDark ? 'bg-[#0b141a]' : 'bg-[#efeae2]'
      }`}
    >
      {/* Chat Conversation Header */}
      <header
        className={`h-16 px-4 flex items-center justify-between border-b z-10 shadow-xs transition-colors duration-200 ${
          isDark
            ? 'bg-[#202c33] border-[#222d34] text-[#e9edef]'
            : 'bg-[#f0f2f5] border-[#d1d7db] text-[#111b21]'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className={`md:hidden p-2 -ml-1 rounded-xl transition-colors ${
              isDark
                ? 'text-[#aebac1] hover:text-[#e9edef] hover:bg-[#111b21]'
                : 'text-[#54656f] hover:text-[#111b21] hover:bg-[#e9edef]'
            }`}
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
            <h2 className={`text-sm font-semibold truncate ${isDark ? 'text-[#e9edef]' : 'text-[#111b21]'}`}>
              {contact.name}
            </h2>
            <p className="text-[11px] font-medium flex items-center gap-1">
              {isContactTyping || contact.typingTo === currentUser.id ? (
                <span className="text-[#00a884] font-medium animate-pulse">typing...</span>
              ) : (
                <>
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      contact.status === 'online' ? 'bg-[#00a884]' : isDark ? 'bg-[#8696a0]' : 'bg-[#9E96BE]'
                    }`}
                  ></span>
                  <span
                    className={
                      contact.status === 'online'
                        ? 'text-[#00a884]'
                        : isDark
                        ? 'text-[#8696a0]'
                        : 'text-[#667781]'
                    }
                  >
                    {contact.status === 'online' ? 'Online' : 'Offline'}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {/* Emergency Panic Button - Opens Beauty and Joy Camouflage */}
          {onPanic && (
            <button
              type="button"
              onClick={onPanic}
              title="Panic: Open Beauty and Joy Camouflage"
              aria-label="Panic: Open Beauty and Joy Camouflage"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border border-[#eab308] text-[#eab308] bg-[#ca8a04]/10 hover:bg-[#ca8a04]/20 transition-all cursor-pointer shadow-xs active:scale-95"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-[#eab308]" />
              <span>Panic</span>
            </button>
          )}

          {/* Video Call Icon */}
          <button
            type="button"
            onClick={() => alert('Video calling is not available at the moment.')}
            title="Start video call"
            aria-label="Start video call"
            className={`p-2 rounded-xl transition-colors ${
              isDark
                ? 'text-[#aebac1] hover:text-[#e9edef] hover:bg-[#111b21]'
                : 'text-[#54656f] hover:text-[#111b21] hover:bg-[#e9edef]'
            }`}
          >
            <Video className="w-5 h-5" />
          </button>

          {/* Voice Call Icon */}
          <button
            type="button"
            onClick={() => alert('Voice calling is not available at the moment.')}
            title="Start voice call"
            aria-label="Start voice call"
            className={`p-2 rounded-xl transition-colors ${
              isDark
                ? 'text-[#aebac1] hover:text-[#e9edef] hover:bg-[#111b21]'
                : 'text-[#54656f] hover:text-[#111b21] hover:bg-[#e9edef]'
            }`}
          >
            <Phone className="w-5 h-5" />
          </button>

          {/* Clear Chat Button */}
          {onClearChat && (
            <button
              onClick={() => setShowClearConfirm(true)}
              title="Clear conversation history"
              aria-label="Clear conversation history"
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                isDark
                  ? 'text-[#ef4444] hover:bg-[#ef4444]/10'
                  : 'text-[#ef4444] hover:bg-[#fee2e2]'
              }`}
            >
              <Trash2 className="w-4 h-4 text-[#ef4444]" />
              <span className="hidden sm:inline">Clear Chat</span>
            </button>
          )}

          {/* Passcode Encrypted Badge */}
          <div
            className={`hidden lg:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
              isDark
                ? 'border-[#00a884]/40 bg-[#00a884]/10 text-[#00a884]'
                : 'border-[#00a884]/40 bg-[#d9fdd3] text-[#008069]'
            }`}
          >
            <Lock className="w-3 h-3 text-[#00a884]" />
            <span>Passcode Encrypted</span>
          </div>

          {/* Header Theme Switcher Toggle */}
          <button
            onClick={toggleTheme}
            title={isDark ? 'Switch to WhatsApp Light' : 'Switch to WhatsApp Dark'}
            aria-label={isDark ? 'Switch to WhatsApp Light' : 'Switch to WhatsApp Dark'}
            className={`p-2 rounded-xl transition-colors ${
              isDark
                ? 'text-[#aebac1] hover:text-[#00a884] hover:bg-[#111b21]'
                : 'text-[#54656f] hover:text-[#008069] hover:bg-[#e9edef]'
            }`}
          >
            {isDark ? (
              <Sun className="w-5 h-5 text-[#f59e0b] hover:scale-110 transition-transform" />
            ) : (
              <Moon className="w-5 h-5 text-[#54656f] hover:scale-110 transition-transform" />
            )}
          </button>
        </div>
      </header>

      {/* End-to-end / Direct & Private encryption banner (WhatsApp Style) */}
      <div className="flex justify-center pt-2 px-4 select-none z-10">
        <div
          className={`max-w-md text-center px-4 py-1.5 rounded-lg text-[11px] leading-relaxed flex items-center justify-center gap-1.5 shadow-xs border ${
            isDark
              ? 'bg-[#182229] border-[#222d34] text-[#ffd279]'
              : 'bg-[#fff5c4] border-[#ffe885] text-[#54656f]'
          }`}
        >
          <Lock className="w-3.5 h-3.5 flex-shrink-0 text-[#eab308]" />
          <span>
            Messages are direct &amp; private to <strong>{contact.name}</strong>. No login required.
          </span>
        </div>
      </div>

      {/* Network or Sync Error Banner */}
      {error && (
        <div className="px-4 py-2 bg-[#FEF2F2] border-b border-[#FECACA] flex items-center gap-2 text-xs text-[#991B1B]">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      {/* Messages Scroll Area with WhatsApp Doodle Wallpaper */}
      <div className={`flex-1 overflow-y-auto p-4 space-y-3 wa-chat-bg select-text transition-colors duration-200 ${
        isDark ? 'bg-[#0b141a]' : 'bg-[#efeae2]'
      }`}>
        {loading && visibleMessages.length === 0 ? (
          <div className={`h-full flex flex-col items-center justify-center ${isDark ? 'text-[#8696a0]' : 'text-[#667781]'}`}>
            <Spinner size="md" className="mb-2 text-[#00a884]" />
            <p className="text-xs">Loading conversation history...</p>
          </div>
        ) : visibleMessages.length === 0 ? (
          <div className={`h-full flex flex-col items-center justify-center text-center p-6 ${isDark ? 'text-[#8696a0]' : 'text-[#667781]'}`}>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 shadow-xs border ${
              isDark
                ? 'bg-[#202c33] border-[#2a3942] text-[#00a884]'
                : 'bg-white border-[#e9edef] text-[#00a884]'
            }`}>
              <MessageSquare className="w-6 h-6" />
            </div>
            <p className={`text-sm font-semibold ${isDark ? 'text-[#e9edef]' : 'text-[#111b21]'}`}>
              No messages yet
            </p>
            <p className="text-xs mt-0.5 max-w-xs opacity-80">
              Say hello or attach an image to start chatting with {contact.name}.
            </p>
          </div>
        ) : (
          visibleMessages.map((msg, idx) => {
            const isMe = msg.senderId === currentUser.id;
            const isPickerOpen = activeReactionMsgId === msg.id;
            const isMenuOpen = activeMenuMsgId === msg.id;
            const isPinned = pinnedMsgIds.has(msg.id) || Boolean(msg.pinned);
            const isStarred = starredMsgIds.has(msg.id) || Boolean(msg.starred);
            const showDateDivider = isDifferentCalendarDay(
              msg.createdAt,
              visibleMessages[idx - 1]?.createdAt
            );

            return (
              <React.Fragment key={msg.id}>
                {showDateDivider && (
                  <div className="flex justify-center my-3 select-none">
                    <span className={`text-[11px] font-semibold px-3 py-1 rounded-full shadow-xs border ${
                      isDark
                        ? 'bg-[#182229] border-[#222d34] text-[#8696a0]'
                        : 'bg-white border-[#e9edef] text-[#54656f]'
                    }`}>
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
                      onClick={() => {
                        setActiveMenuMsgId(null);
                        setActiveReactionMsgId(isPickerOpen ? null : msg.id);
                      }}
                      title="Add reaction"
                      aria-label="Add reaction"
                      className={`absolute -top-3 ${
                        isMe ? '-left-7' : '-right-7'
                      } opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded-full border transition-opacity shadow-xs z-10 ${
                        isDark
                          ? 'bg-[#202c33] border-[#2a3942] text-[#8696a0] hover:text-[#00a884]'
                          : 'bg-white border-[#e9edef] text-[#54656f] hover:text-[#00a884]'
                      }`}
                    >
                      <Smile className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Reaction Picker Overlay */}
                  {isPickerOpen && onReactToMessage && (
                    <div
                      className={`absolute -top-10 ${
                        isMe ? 'right-0' : 'left-0'
                      } flex items-center gap-1.5 p-1.5 rounded-full shadow-lg z-20 animate-fadeIn border ${
                        isDark
                          ? 'bg-[#202c33] border-[#2a3942] text-[#e9edef]'
                          : 'bg-white border-[#e9edef] text-[#111b21]'
                      }`}
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

                  {/* WhatsApp-Style Message Options Menu */}
                  {isMenuOpen && (
                    <div
                      ref={menuRef}
                      onClick={(e) => e.stopPropagation()}
                      className={`absolute z-30 top-8 ${
                        isMe ? 'right-0' : 'right-0 sm:left-auto'
                      } flex flex-col items-start animate-fadeIn drop-shadow-xl`}
                    >
                      {/* 1. Quick Emoji Reaction Bar */}
                      <div className={`flex items-center gap-1 px-2.5 py-1.5 mb-1.5 rounded-full shadow-lg border ${
                        isDark ? 'bg-[#202c33] border-[#2a3942]' : 'bg-white border-[#e9edef]'
                      }`}>
                        {['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={async () => {
                              setActiveMenuMsgId(null);
                              if (onReactToMessage) {
                                await onReactToMessage(msg.id, emoji);
                              }
                            }}
                            className="hover:scale-125 transition-transform p-1 text-base leading-none"
                            title={`React with ${emoji}`}
                            aria-label={`React with ${emoji}`}
                          >
                            {emoji}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuMsgId(null);
                            setActiveReactionMsgId(msg.id);
                          }}
                          className={`p-1 rounded-full transition-colors leading-none ${
                            isDark
                              ? 'text-[#aebac1] hover:text-[#00a884] hover:bg-[#111b21]'
                              : 'text-[#54656f] hover:text-[#008069] hover:bg-[#e9edef]'
                          }`}
                          title="More reactions"
                          aria-label="More reactions"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* 2. Vertical Action Menu Options */}
                      <div className={`w-44 rounded-2xl shadow-2xl py-1.5 overflow-hidden text-sm border ${
                        isDark ? 'bg-[#233138] border-[#2a3942] text-[#e9edef]' : 'bg-white border-[#e9edef] text-[#111b21]'
                      }`}>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuMsgId(null);
                            setReplyingTo(msg);
                            textareaRef.current?.focus();
                          }}
                          className={`w-full flex items-center gap-3 px-3.5 py-2 transition-colors text-left ${
                            isDark ? 'hover:bg-[#182229] hover:text-[#00a884]' : 'hover:bg-[#f5f6f6] hover:text-[#00a884]'
                          }`}
                        >
                          <Reply className={`w-4 h-4 ${isDark ? 'text-[#8696a0]' : 'text-[#667781]'}`} />
                          <span>Reply</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuMsgId(null);
                            setActiveReactionMsgId(msg.id);
                          }}
                          className={`w-full flex items-center gap-3 px-3.5 py-2 transition-colors text-left ${
                            isDark ? 'hover:bg-[#182229] hover:text-[#00a884]' : 'hover:bg-[#f5f6f6] hover:text-[#00a884]'
                          }`}
                        >
                          <Smile className={`w-4 h-4 ${isDark ? 'text-[#8696a0]' : 'text-[#667781]'}`} />
                          <span>React</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuMsgId(null);
                            setPinnedMsgIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(msg.id)) next.delete(msg.id);
                              else next.add(msg.id);
                              return next;
                            });
                          }}
                          className={`w-full flex items-center gap-3 px-3.5 py-2 transition-colors text-left ${
                            isDark ? 'hover:bg-[#182229] hover:text-[#00a884]' : 'hover:bg-[#f5f6f6] hover:text-[#00a884]'
                          }`}
                        >
                          <Pin className={`w-4 h-4 ${isDark ? 'text-[#8696a0]' : 'text-[#667781]'}`} />
                          <span>{isPinned ? 'Unpin' : 'Pin'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuMsgId(null);
                            setStarredMsgIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(msg.id)) next.delete(msg.id);
                              else next.add(msg.id);
                              return next;
                            });
                          }}
                          className={`w-full flex items-center gap-3 px-3.5 py-2 transition-colors text-left ${
                            isDark ? 'hover:bg-[#182229] hover:text-[#00a884]' : 'hover:bg-[#f5f6f6] hover:text-[#00a884]'
                          }`}
                        >
                          <Star className={`w-4 h-4 ${isStarred ? 'fill-[#EAB308] text-[#EAB308]' : isDark ? 'text-[#8696a0]' : 'text-[#667781]'}`} />
                          <span>{isStarred ? 'Unstar' : 'Star'}</span>
                        </button>

                        <div className={`my-1 border-t ${isDark ? 'border-[#2a3942]' : 'border-[#e9edef]'}`} />

                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuMsgId(null);
                            setDeleteTargetMsg(msg);
                          }}
                          className="w-full flex items-center gap-3 px-3.5 py-2 text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors text-left font-medium cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4 text-[#EF4444]" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Chat Message Bubble */}
                  <div
                    className={`relative rounded-2xl px-4 py-2.5 text-sm shadow-xs transition-all group/bubble ${
                      isMe
                        ? isDark
                          ? 'bg-[#005c4b] text-[#e9edef] rounded-br-none'
                          : 'bg-[#d9fdd3] text-[#111b21] rounded-br-none shadow-xs'
                        : isDark
                        ? 'bg-[#202c33] text-[#e9edef] border border-[#2a3942] rounded-bl-none shadow-xs'
                        : 'bg-white text-[#111b21] border border-[#e9edef] rounded-bl-none shadow-xs'
                    } ${msg.failed ? 'border-2 border-[#EF4444] bg-[#FEF2F2] text-[#991B1B]' : ''}`}
                  >
                    {/* Message Options Chevron Down Button (WhatsApp Style) */}
                    {!msg.isOptimistic && !msg.failed && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveReactionMsgId(null);
                          setActiveMenuMsgId(isMenuOpen ? null : msg.id);
                        }}
                        title="Message options"
                        aria-label="Message options"
                        className={`absolute top-1.5 right-1.5 p-1 rounded-full transition-all z-10 ${
                          isMenuOpen
                            ? 'opacity-100 scale-100'
                            : 'opacity-0 group-hover/bubble:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-70 hover:opacity-100'
                        } ${
                          isMe
                            ? isDark
                              ? 'text-white/70 hover:text-white hover:bg-black/20'
                              : 'text-[#111b21]/60 hover:text-[#111b21] hover:bg-black/10'
                            : isDark
                            ? 'text-[#8696a0] hover:text-[#e9edef] hover:bg-[#111b21]'
                            : 'text-[#667781] hover:text-[#111b21] hover:bg-[#e9edef]'
                        }`}
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Quick Hover Delete Button (Feature 4: Delete for Everyone / for Me) */}
                    {!msg.isOptimistic && !msg.failed && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTargetMsg(msg);
                        }}
                        title="Delete message"
                        aria-label="Delete message"
                        className={`absolute top-1.5 right-6 p-1 rounded-full transition-all z-10 opacity-0 group-hover/bubble:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-70 hover:opacity-100 ${
                          isMe
                            ? isDark
                              ? 'text-white/70 hover:text-[#ef4444] hover:bg-black/20'
                              : 'text-[#111b21]/60 hover:text-[#ef4444] hover:bg-black/10'
                            : isDark
                            ? 'text-[#8696a0] hover:text-[#ef4444] hover:bg-[#111b21]'
                            : 'text-[#667781] hover:text-[#ef4444] hover:bg-[#e9edef]'
                        }`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Quoted Reply Header */}
                    {msg.replyTo && (
                      <div
                        className={`mb-2 px-2.5 py-1.5 rounded-lg border-l-4 text-xs select-none ${
                          isMe
                            ? isDark
                              ? 'bg-black/20 border-l-[#25d366] text-[#e9edef]'
                              : 'bg-black/5 border-l-[#00a884] text-[#111b21]'
                            : isDark
                            ? 'bg-black/25 border-l-[#00a884] text-[#e9edef]'
                            : 'bg-[#f0f2f5] border-l-[#00a884] text-[#111b21]'
                        }`}
                      >
                        <span className="font-semibold block text-[11px] mb-0.5 text-[#00a884]">
                          {msg.replyTo.senderName || 'Replied message'}
                        </span>
                        <span className="truncate block opacity-85">
                          {msg.replyTo.text || 'Attachment'}
                        </span>
                      </div>
                    )}

                    {/* Image Attachment Preview */}
                    {msg.image && (
                      <button
                        type="button"
                        onClick={(e) => {
                          lastActiveImageTriggerRef.current = e.currentTarget;
                          setPreviewLightbox(msg.image || null);
                        }}
                        className="mb-2 block overflow-hidden rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00a884]"
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

                    {/* Video Attachment Preview */}
                    {msg.video && (
                      <div className="mb-2 block overflow-hidden rounded-xl bg-black/10">
                        <video
                          src={msg.video}
                          controls
                          playsInline
                          preload="metadata"
                          className="max-h-64 max-w-full rounded-xl object-contain bg-black shadow-xs"
                        />
                      </div>
                    )}

                    {/* Voice Note Audio Bubble */}
                    {msg.audio && (
                      <div className="mb-2 block">
                        <AudioBubblePlayer src={msg.audio} isMe={isMe} isDark={isDark} />
                      </div>
                    )}

                    {/* Text Content */}
                    {msg.text && (
                      <p className="whitespace-pre-wrap break-words leading-relaxed select-text pr-5">
                        {msg.text}
                      </p>
                    )}

                    {/* Metadata & Status Badges */}
                    <div
                      className={`flex items-center justify-end gap-1.5 mt-1 text-[10px] select-none ${
                        isMe
                          ? msg.failed
                            ? 'text-[#EF4444]'
                            : isDark
                            ? 'text-white/75'
                            : 'text-[#667781]'
                          : isDark
                          ? 'text-[#8696a0]'
                          : 'text-[#667781]'
                      }`}
                    >
                      {isPinned && (
                        <span title="Pinned message" className="inline-flex items-center opacity-75">
                          <Pin className="w-3 h-3 text-current rotate-45" />
                        </span>
                      )}

                      {isStarred && (
                        <span title="Starred message" className="inline-flex items-center">
                          <Star className="w-3 h-3 fill-[#EAB308] text-[#EAB308]" />
                        </span>
                      )}

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
                            <Spinner size="sm" className="text-current opacity-70 w-3 h-3" />
                          ) : msg.read ? (
                            <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
                          ) : (
                            <Check className="w-3.5 h-3.5 text-current opacity-70" />
                          )}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Reaction Summary Pills */}
                  {renderReactionSummary(msg.reactions, msg.id)}

                  {/* Failed Message Retry */}
                  {msg.failed && onRetryMessage && (
                    <div className="flex items-center justify-end gap-1.5 mt-1 text-[11px] text-[#EF4444]">
                      <span>Failed to send.</span>
                      <button
                        onClick={() => onRetryMessage(msg.id, msg.text, msg.image, msg.video)}
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
        <div className={`px-4 py-2 border-t flex items-center justify-between ${
          isDark ? 'bg-[#202c33] border-[#222d34]' : 'bg-white border-[#e9edef]'
        }`}>
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedImage}
              alt="Attachment preview"
              className="w-12 h-12 object-cover rounded-xl border border-[#00a884]/30"
            />
            <div>
              <span className={`text-xs font-medium block ${isDark ? 'text-[#e9edef]' : 'text-[#111b21]'}`}>
                Image attached
              </span>
              <span className={`text-[10px] ${isDark ? 'text-[#8696a0]' : 'text-[#667781]'}`}>Ready to send</span>
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

      {/* Selected Video Preview Staging */}
      {selectedVideo && (
        <div className={`px-4 py-2 border-t flex items-center justify-between animate-fadeIn ${
          isDark ? 'bg-[#202c33] border-[#222d34]' : 'bg-white border-[#e9edef]'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-black/20 border border-[#00a884]/30 flex items-center justify-center overflow-hidden relative">
              <video
                src={selectedVideo}
                className="w-full h-full object-cover"
                muted
                playsInline
              />
            </div>
            <div>
              <span className={`text-xs font-medium block ${isDark ? 'text-[#e9edef]' : 'text-[#111b21]'}`}>
                Video attached
              </span>
              <span className={`text-[10px] ${isDark ? 'text-[#8696a0]' : 'text-[#667781]'}`}>Ready to send</span>
            </div>
          </div>
          <button
            onClick={() => setSelectedVideo(null)}
            className="p-1.5 text-[#797196] hover:text-[#EF4444] rounded-lg transition-colors"
            title="Cancel video attachment"
            aria-label="Cancel video attachment"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Selected Reply Preview Staging */}
      {replyingTo && (
        <div className={`px-4 py-2 border-t flex items-center justify-between animate-fadeIn ${
          isDark ? 'bg-[#202c33] border-[#222d34]' : 'bg-[#f0f2f5] border-[#d1d7db]'
        }`}>
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-1 self-stretch bg-[#00a884] rounded-full min-h-[28px]" />
            <div className="text-xs truncate">
              <span className="font-semibold text-[#00a884] flex items-center gap-1.5">
                <Reply className="w-3.5 h-3.5" />
                Replying to {replyingTo.senderId === currentUser.id ? 'yourself' : contact.name}
              </span>
              <span className={`truncate block ${isDark ? 'text-[#8696a0]' : 'text-[#667781]'}`}>
                {replyingTo.text || (replyingTo.image ? '📷 Image' : replyingTo.video ? '🎥 Video' : 'Attachment')}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            className={`p-1.5 hover:text-[#EF4444] rounded-lg transition-colors ${isDark ? 'text-[#8696a0]' : 'text-[#667781]'}`}
            title="Cancel reply"
            aria-label="Cancel reply"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Image / Video Error Alert */}
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

        {isRecording ? (
          /* Live Recording Bar */
          <div
            className={`p-3 border-t flex items-center justify-between z-10 shadow-xs transition-colors duration-200 ${
              isDark ? 'bg-[#202c33] border-[#222d34]' : 'bg-[#f0f2f5] border-[#d1d7db]'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
              <span className="text-sm font-mono font-bold text-red-500">{formatTimer(recordingDuration)}</span>
              <span className={`text-xs font-medium truncate hidden sm:inline ${isDark ? 'text-[#8696a0]' : 'text-[#667781]'}`}>
                Recording voice note...
              </span>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={cancelRecording}
                title="Discard voice note"
                aria-label="Discard voice note"
                className="p-2 text-[#ef4444] hover:bg-[#ef4444]/20 rounded-full transition-colors cursor-pointer"
              >
                <Trash2 className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={stopAndSendRecording}
                title="Send voice note"
                aria-label="Send voice note"
                className="min-h-[42px] min-w-[42px] flex items-center justify-center p-2.5 bg-[#00a884] hover:bg-[#02906f] active:bg-[#008069] text-white rounded-full transition-all shadow-md cursor-pointer active:scale-95"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSend}
            className={`p-3 border-t flex items-end gap-2 z-10 shadow-xs transition-colors duration-200 ${
              isDark ? 'bg-[#202c33] border-[#222d34]' : 'bg-[#f0f2f5] border-[#d1d7db]'
            }`}
          >
            {/* Hidden File Input for Image Upload */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleFileSelect}
            />

            {/* Hidden File Input for Video Upload */}
            <input
              ref={videoInputRef}
              type="file"
              accept="video/mp4,video/webm,video/ogg,video/quicktime,video/*"
              className="hidden"
              onChange={handleVideoSelect}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={compressingImage || readingVideo || submitting}
              title="Attach image"
              aria-label="Attach image"
              className={`min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-xl transition-colors flex-shrink-0 disabled:opacity-50 ${
                isDark
                  ? 'text-[#aebac1] hover:text-[#00a884] hover:bg-[#111b21]'
                  : 'text-[#54656f] hover:text-[#008069] hover:bg-[#e9edef]'
              }`}
            >
              {compressingImage ? (
                <Spinner size="sm" className="text-[#00a884]" />
              ) : (
                <ImageIcon className="w-5 h-5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              disabled={readingVideo || compressingImage || submitting}
              title="Attach video"
              aria-label="Attach video"
              className={`min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-xl transition-colors flex-shrink-0 disabled:opacity-50 ${
                isDark
                  ? 'text-[#aebac1] hover:text-[#00a884] hover:bg-[#111b21]'
                  : 'text-[#54656f] hover:text-[#008069] hover:bg-[#e9edef]'
              }`}
            >
              {readingVideo ? (
                <Spinner size="sm" className="text-[#00a884]" />
              ) : (
                <VideoIcon className="w-5 h-5" />
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
                  ? 'text-[#00a884] bg-[#00a884]/15'
                  : isDark
                  ? 'text-[#aebac1] hover:text-[#00a884] hover:bg-[#111b21]'
                  : 'text-[#54656f] hover:text-[#008069] hover:bg-[#e9edef]'
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
                    : selectedVideo
                    ? 'Add an optional caption for video... (Enter to send)'
                    : `Type a message... (Enter to send)`
                }
                aria-label={`Message ${contact.name}`}
                disabled={submitting}
                className={`w-full resize-none min-h-[44px] max-h-32 py-2.5 px-4 rounded-xl text-sm transition-all leading-normal outline-none ${
                  isDark
                    ? 'bg-[#2a3942] text-[#e9edef] placeholder-[#8696a0] border border-transparent focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884]'
                    : 'bg-white text-[#111b21] placeholder-[#8696a0] border border-transparent focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884]'
                }`}
              />
            </div>

            {/* When input box is empty, show WhatsApp-style green Mic button */}
            {!inputText.trim() && !selectedImage && !selectedVideo ? (
              <button
                type="button"
                onClick={startRecording}
                title="Record voice note"
                aria-label="Record voice note"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2.5 bg-[#00a884] hover:bg-[#02906f] active:bg-[#008069] text-white rounded-full transition-all shadow-md flex-shrink-0 cursor-pointer active:scale-95"
              >
                <Mic className="w-5 h-5" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting || compressingImage || readingVideo}
                aria-label="Send message"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2.5 bg-[#00a884] hover:bg-[#02906f] active:bg-[#008069] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full transition-all shadow-md flex-shrink-0 cursor-pointer"
              >
                {submitting ? (
                  <Spinner size="sm" className="text-white" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            )}
          </form>
        )}
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
            className={`border rounded-2xl p-6 max-w-sm w-full shadow-2xl transition-all ${
              isDark
                ? 'bg-[#202c33] border-[#2a3942] text-[#e9edef]'
                : 'bg-white border-[#E8E3FA] text-[#1E1B2E]'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="clear-chat-title" className={`text-base font-bold mb-2 ${isDark ? 'text-[#e9edef]' : 'text-[#1E1B2E]'}`}>
              Clear this conversation?
            </h3>
            <p className={`text-xs mb-5 leading-relaxed ${isDark ? 'text-[#8696a0]' : 'text-[#797196]'}`}>
              This action permanently deletes all messages in this conversation for both participants. Cleared messages cannot be recovered.
            </p>
            <div className="flex justify-end gap-2.5">
              <button
                disabled={clearing}
                onClick={() => setShowClearConfirm(false)}
                className={`min-h-[40px] px-4 py-2 text-xs font-semibold rounded-xl transition-colors border ${
                  isDark
                    ? 'text-[#8696a0] hover:text-[#e9edef] hover:bg-[#111b21] border-[#2a3942]'
                    : 'text-[#4B4562] hover:bg-[#F8F7FF] border-[#D5CCF5]'
                }`}
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
                className="min-h-[40px] px-4 py-2 text-xs font-semibold bg-[#EF4444] hover:bg-[#DC2626] text-white rounded-xl transition-colors shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                {clearing ? <Spinner size="sm" className="text-white" /> : null}
                <span>Clear Chat</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Style Delete Message Confirmation Modal */}
      {deleteTargetMsg && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-msg-title"
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setDeleteTargetMsg(null)}
        >
          <div
            className={`w-full max-w-sm rounded-2xl p-6 shadow-2xl transition-all border ${
              isDark
                ? 'bg-[#202c33] border-[#2a3942] text-[#e9edef]'
                : 'bg-white border-[#e9edef] text-[#111b21]'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="delete-msg-title" className={`text-base font-bold mb-2 ${isDark ? 'text-[#e9edef]' : 'text-[#111b21]'}`}>
              Delete message?
            </h3>
            <p className={`text-xs mb-6 leading-relaxed ${isDark ? 'text-[#8696a0]' : 'text-[#667781]'}`}>
              You can delete this message for everyone or delete it from your devices only.
            </p>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  const id = deleteTargetMsg.id;
                  // Instant optimistic removal from UI with 0ms delay
                  setHiddenMsgIds((prev) => new Set(prev).add(id));
                  setDeleteTargetMsg(null);
                  onDeleteMessage?.(id, 'everyone');
                }}
                className="w-full min-h-[40px] px-4 py-2.5 rounded-xl text-xs font-semibold text-[#ef4444] bg-[#ef4444]/10 hover:bg-[#ef4444]/20 transition-all text-center cursor-pointer active:scale-[0.99]"
              >
                Delete for everyone
              </button>

              <button
                type="button"
                onClick={() => {
                  const id = deleteTargetMsg.id;
                  // Instant optimistic removal from UI with 0ms delay
                  setHiddenMsgIds((prev) => new Set(prev).add(id));
                  setDeleteTargetMsg(null);
                  onDeleteMessage?.(id, 'forMe');
                }}
                className={`w-full min-h-[40px] px-4 py-2.5 rounded-xl text-xs font-semibold transition-all text-center cursor-pointer active:scale-[0.99] ${
                  isDark
                    ? 'bg-[#111b21] hover:bg-[#2a3942] text-[#e9edef]'
                    : 'bg-[#f0f2f5] hover:bg-[#e9edef] text-[#111b21]'
                }`}
              >
                Delete for me
              </button>

              <button
                type="button"
                onClick={() => setDeleteTargetMsg(null)}
                className={`w-full min-h-[38px] px-4 py-2 rounded-xl text-xs font-medium transition-all text-center cursor-pointer ${
                  isDark
                    ? 'text-[#8696a0] hover:text-[#e9edef] hover:bg-[#111b21]/50'
                    : 'text-[#667781] hover:text-[#111b21] hover:bg-[#f0f2f5]'
                }`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
