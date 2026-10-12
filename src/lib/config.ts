import { AppMetadataConfig } from '@/types';

/**
 * Centralized Configuration for LumaChat
 * Houses app metadata, branding names, timing constants, storage keys, and defaults.
 */
export const APP_CONFIG: AppMetadataConfig = {
  name: 'LumaChat',
  shortName: 'LumaChat',
  tagline: 'Passwordless Direct Messaging',
  description: 'Fast, secure, passwordless two-way direct messaging platform rebuilt with Next.js.',
  version: '1.0.0',
  adminRootId: 'admin_root',
  defaultAdminCode: 'ADMIN123',
  disguiseCode: '@1234',
  defaultDisguiseUrl: process.env.NEXT_PUBLIC_DISGUISE_URL || 'https://beauty-n-joy-demo.pixelworks.workers.dev/',
  storageKeys: {
    disguiseMode: 'lumachat_disguise',
    linkUnlocked: 'lumachat_link_unlocked',
    userCode: 'lumachat_user_code',
    messageCachePrefix: 'lumachat_msg_cache_',
  },
  polling: {
    messageIntervalMs: 1000,
    userPresenceIntervalMs: 2000,
    onlineThresholdMs: 6000,
    pendingReactionGuardMs: 4000,
  },
  limits: {
    maxImageSizeBytes: 5 * 1024 * 1024, // 5MB
  },
};

export default APP_CONFIG;
