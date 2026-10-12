# ChatPass — Application Blueprint & Project Summary

> **Analysis Date:** 2026-10-11 | **Status:** Analysis only — no files were modified.

---

## 1. Application Overview

### Application Name and Purpose
**ChatPass** — a passwordless two-way direct messaging application. The admin creates user accounts with short passcodes; users open a single URL, type their passcode, and land directly in a WhatsApp-like chat interface. There is no traditional registration, email, or OAuth flow.

### Target Users and Main Use Cases
| Role | Description |
|---|---|
| **Admin** | A single trusted operator (hardcoded as `admin_root`). Creates and manages user accounts, monitors conversations, deletes accounts, resets data. |
| **User** | Any person given a passcode by the admin. Chats directly with the admin (or another user) without signing up. |

### Core Problem the App Solves
Allows a person (admin) to provide a completely frictionless, one-click messaging experience to clients, contacts, or students — no app installation, no account creation, no email verification. A short passcode or a direct URL is all that's needed.

### Main User Journey
```
Visit URL → Enter Passcode → See Contact List → Select Contact → Chat
```
For the admin, an additional Admin Control Center panel allows account management without leaving the app.

### Special "Disguise" Mode
Entering the special code `@1234` redirects the browser to an embedded beauty website iframe instead of the chat. A discreet lock icon lets the user return to the passcode gate. This is a privacy/camouflage feature.

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16.3.6 (App Router, `'use client'` components) |
| **React** | React 19.2.8 + React DOM 19.2.8 |
| **Language** | TypeScript 5 |
| **Styling** | Tailwind CSS v4 (`@tailwindcss/postcss`) |
| **Icons** | `lucide-react` ^1.47.0 |
| **Fonts** | `Geist` + `Geist Mono` via `next/font/google` |
| **Database / Storage** | **Primary:** Upstash Redis (Vercel KV) via REST HTTP. **Fallback 1:** Local JSON file at `data/db.json` or `/tmp/chat_db.json`. **Fallback 2:** In-process `memoryStore` module variable. |
| **Authentication** | Custom passcode-based. No JWT, no sessions, no cookies. State lives in `sessionStorage`. |
| **State Management** | React `useState` + `useCallback` + `useMemo` + `useRef`. No external state library. |
| **Data Fetching** | Native `fetch()` with polling intervals. AbortController for cancellation. `sessionStorage` for client-side message caching. |
| **Package Manager** | npm |
| **Build Tool** | Next.js / Turbopack (v16 default) |
| **Deployment** | Vercel (detected via `process.env.VERCEL`). Serverless functions for all API routes. |
| **External Services** | Upstash Redis (for persistence across serverless instances), Cloudflare Workers (`beauty-n-joy-demo.pixelworks.workers.dev` — disguise iframe target). |

---

## 3. Complete Project Structure

```
d:\project1\
├── src/
│   ├── app/
│   │   ├── globals.css              # Tailwind v4 base import + CSS variables
│   │   ├── layout.tsx               # Root HTML shell, Geist fonts, metadata, viewport
│   │   ├── page.tsx                 # Main orchestrator — all state, polling, routing logic
│   │   └── api/
│   │       ├── auth/verify/route.ts         # POST: Verify passcode → return User
│   │       ├── users/route.ts               # GET: List all users with unread/lastMessage
│   │       ├── users/status/route.ts        # POST: Update online/offline + lastSeen
│   │       ├── messages/route.ts            # GET: Fetch conversation | POST: Create message
│   │       ├── messages/read/route.ts       # POST: Mark messages as read
│   │       ├── messages/clear/route.ts      # POST: Delete conversation history
│   │       ├── messages/react/route.ts      # POST: Add/toggle emoji reaction
│   │       ├── admin/users/route.ts         # GET/POST/PUT/DELETE: Manage user accounts
│   │       └── admin/reset/route.ts         # POST: Wipe all non-admin data
│   ├── components/
│   │   ├── PasscodeModal.tsx         # Login gate (mode=gate) & account switcher (mode=switcher)
│   │   ├── ContactsSidebar.tsx       # Left panel: current user header, contact list, search
│   │   ├── ChatWindow.tsx            # Right panel: message thread, input bar, reactions
│   │   ├── AdminDashboard.tsx        # Full-screen modal: create/manage/edit user accounts
│   │   └── BeautyWebsite.tsx         # Disguise iframe + discreet lock button overlay
│   └── lib/
│       └── db.ts                     # All data models, KV/file/memory storage, helper functions
├── package.json
├── next.config.ts                    # Empty (default) Next.js config
└── APP_BLUEPRINT.md                  # This file
```

### Responsibility of Each Important File

| File | Responsibility |
|---|---|
| `src/app/page.tsx` | Entire app state machine. Auth flow, polling timers, disguise mode, message optimistic updates, session restoration, mobile view toggle. |
| `src/app/layout.tsx` | HTML root — sets fonts, metadata, theme color, base CSS classes. |
| `src/lib/db.ts` | **Core data layer.** Defines `User` and `Message` interfaces. Implements a tri-level storage strategy (Upstash KV → local file → in-memory). Exports all CRUD helpers used by API routes. |
| `src/components/PasscodeModal.tsx` | Two-mode login UI. `gate` mode = minimal password card shown to new visitors. `switcher` mode = rich modal with account listing shown after logout. |
| `src/components/ContactsSidebar.tsx` | Fixed-width left panel. Displays logged-in user, logout/admin buttons, search box, scrollable contact list with online status dots and unread badges. |
| `src/components/ChatWindow.tsx` | Right-side chat area. Handles message rendering (WhatsApp style), image attachments, lightbox, emoji reactions (hover-to-reveal, picker, pill badges), quick emoji bar, image upload, send form, clear chat confirmation dialog. |
| `src/components/AdminDashboard.tsx` | Full-page modal overlay. Two tabs: `Create New User` (form + share card) and `Manage Accounts` (list with edit/delete/chat/copy-link actions). |
| `src/components/BeautyWebsite.tsx` | Full-screen iframe wrapper for the disguise URL. Shows a loading spinner while the iframe loads, and a hidden lock icon button. |

---

## 4. Complete Page and Route Inventory

### UI Screens (all rendered on `/`)

| Screen | Trigger Condition | Key UI Elements | User Actions |
|---|---|---|---|
| **Loading Screen** | `initialChecking === true` | Spinner, "Connecting to ChatPass…" | None — auto-resolves |
| **Disguise Screen** | `isDisguiseMode === true` (code `@1234`) | Full-screen beauty website iframe; discreet lock icon | Click lock → return to Gate |
| **Gate / Login Screen** | `!isLinkUnlocked` | Gradient background, minimal password input, Login button | Enter password, submit |
| **Account Switcher** | `isLinkUnlocked && !currentUser` | Account badge grid, passcode input | Click account badge or type passcode |
| **Main Chat App** | `currentUser !== null` | Sidebar + chat window side by side | Select contact, send message, open admin panel |
| **Empty Chat State** | `activeContact === null` | Icon, "Your Direct Messages" text, optional admin button | Click admin button (admin only) |
| **Admin Dashboard Modal** | `showAdminModal === true` | Tabbed modal with Create/Manage tabs | Create user, edit user, delete user, copy share link, open chat |

### API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/auth/verify` | POST | Verify passcode; marks user online; returns `User` object |
| `/api/users` | GET | Returns all users with `unreadCount` + `lastMessage`; also updates caller's heartbeat |
| `/api/users/status` | POST | Updates a user's `status` and `lastSeen`. Accepts JSON or plain text (for `sendBeacon`). |
| `/api/messages` | GET | Returns conversation messages (auto-marks received messages as read); merges reactions from separate KV key |
| `/api/messages` | POST | Creates a new message; returns the saved message object |
| `/api/messages/read` | POST | Marks all messages from `senderId` to `receiverId` as read |
| `/api/messages/clear` | POST | Deletes all messages between two users |
| `/api/messages/react` | POST | Adds or toggles an emoji reaction on a message (stored in `chatpass_reactions` KV key) |
| `/api/admin/users` | GET | Returns all users (used by admin dashboard + account switcher) |
| `/api/admin/users` | POST | Creates a new user account with passcode |
| `/api/admin/users` | PUT | Updates an existing user (name, code, avatar, notes, role) |
| `/api/admin/users` | DELETE | Deletes a user and their messages |
| `/api/admin/reset` | POST | Wipes all non-admin users and all messages |

---

## 5. Feature Inventory

| Feature | Status | Access Path | Relevant Files |
|---|---|---|---|
| **Passcode-based login (gate mode)** | ✅ Complete | Visit URL for the first time | `PasscodeModal.tsx`, `/api/auth/verify` |
| **Session persistence across refresh** | ✅ Complete | Automatic on page load | `page.tsx` (sessionStorage restore) |
| **Disguise mode (@1234)** | ✅ Complete | Enter `@1234` as password | `page.tsx`, `BeautyWebsite.tsx` |
| **Account switcher (post-logout)** | ✅ Complete | Click Logout | `PasscodeModal.tsx`, `/api/admin/users` |
| **Real-time contact list with online/offline** | ✅ Complete | Auto (polled every 2s) | `ContactsSidebar.tsx`, `page.tsx`, `/api/users` |
| **Presence: online/offline via heartbeat** | ✅ Complete | Auto while app is open | `/api/users/status`, `page.tsx` |
| **Tab close marks user offline** | ✅ Complete | `beforeunload` event | `page.tsx` (navigator.sendBeacon) |
| **Unread message badge on contacts** | ✅ Complete | Auto (polled) | `ContactsSidebar.tsx`, `/api/users` |
| **Real-time message polling (1s)** | ✅ Complete | Select a contact | `page.tsx` (setInterval + AbortController) |
| **Optimistic message sending (0ms UI)** | ✅ Complete | Send message | `page.tsx` (handleSendMessage) |
| **Message deduplication** | ✅ Complete | Automatic | `page.tsx` (mergeMessages), `db.ts` (RPUSH + dedup) |
| **SessionStorage message cache** | ✅ Complete | Automatic on contact switch or refresh | `page.tsx` (getCachedMessages/setCachedMessages) |
| **WhatsApp-style message bubbles** | ✅ Complete | View chat | `ChatWindow.tsx` |
| **Inline timestamp + read ticks** | ✅ Complete | View chat | `ChatWindow.tsx` (float-right spacer trick) |
| **Single ✓ / Double ✓✓ read receipts** | ✅ Complete | Message sent by current user | `ChatWindow.tsx`, `/api/messages/read` |
| **Image attachment (send)** | ✅ Complete | Click image icon in input bar | `ChatWindow.tsx` (FileReader, base64) |
| **Image lightbox (full-screen preview)** | ✅ Complete | Click image in message | `ChatWindow.tsx` |
| **Quick emoji bar (insert into text)** | ✅ Complete | Click 😊 in input bar | `ChatWindow.tsx` |
| **Emoji reactions (WhatsApp-style)** | ✅ Complete | Hover message → click ⌄ → pick emoji | `ChatWindow.tsx`, `/api/messages/react`, `db.ts` |
| **Reaction toggle (remove by re-clicking)** | ✅ Complete | Click the reaction pill | `ChatWindow.tsx` |
| **One reaction per user per message** | ✅ Complete | Automatic in handleReact | `ChatWindow.tsx` |
| **Reactions stored separately (no race)** | ✅ Complete | Automatic | `db.ts` (chatpass_reactions KV key) |
| **Clear chat (both sides)** | ✅ Complete | Click 🗑 Clear Chat → confirm modal | `ChatWindow.tsx`, `/api/messages/clear` |
| **Admin: Create user account** | ✅ Complete | Open Admin Panel → Create tab | `AdminDashboard.tsx`, `/api/admin/users` POST |
| **Admin: Auto-generate passcode** | ✅ Complete | Click "Auto Generate" in create form | `AdminDashboard.tsx` |
| **Admin: Share card + copy link** | ✅ Complete | After account creation | `AdminDashboard.tsx` |
| **Admin: Share via WhatsApp** | ✅ Complete | Click "Share on WhatsApp" button | `AdminDashboard.tsx` (`wa.me` deep link) |
| **Admin: Edit user (name/code/avatar)** | ✅ Complete | Manage tab → Edit button | `AdminDashboard.tsx`, `/api/admin/users` PUT |
| **Admin: Delete user account** | ✅ Complete | Manage tab → Delete button | `AdminDashboard.tsx`, `/api/admin/users` DELETE |
| **Admin: Purge all demo data** | ✅ Complete | Manage tab → "Purge Demo Chats" | `AdminDashboard.tsx`, `/api/admin/reset` |
| **Mobile responsive (single-panel view)** | ✅ Complete | On small screens | `page.tsx` (mobileView state), all components |
| **Search contacts** | ✅ Complete | Type in search box on sidebar | `ContactsSidebar.tsx` (client-side filter) |
| **Direct access link (`?code=`)** | ✅ Complete | Visit `/?code=<passcode>` | `page.tsx` (URL params on load, cleans URL after) |
| **Video/Voice call buttons** | ⚠️ Demo/Placeholder | Click Phone/Video icons in header | `ChatWindow.tsx` (buttons render, no functionality) |

---

## 6. UI/UX and Design System

### Color Palette (Current Theme: Dark / WhatsApp-inspired)

| Use | Color / Token |
|---|---|
| App background | `#0b141a` (WhatsApp dark green-black) |
| Sidebar background | `slate-900` (`#0f172a`) |
| Message bubble — sent | `#005c4b` (WhatsApp teal) |
| Message bubble — received | `#202c33` |
| Chat header / input bar | `#202c33` |
| Border / divider | `#2a3942` |
| Primary accent (buttons, badge, ring) | `indigo-500/600` (`#6366f1 / #4f46e5`) |
| Online status dot | `emerald-500` (`#10b981`) |
| Offline status dot | `slate-500` |
| Read receipt (double tick) | `#53bdeb` (WhatsApp blue) |
| Send button | `#00a884` (WhatsApp green) |
| Error / destructive | `rose-400/500/600` |
| Text primary | `slate-100` |
| Text muted | `slate-400`, `#8696a0` |
| Gate screen background | Gradient `#4b7ded → #635de6 → #7f46d9` |
| Gate screen card | `#f8f9fa` (light card on dark/gradient bg) |

### Typography
- **Sans-serif body:** Geist (`var(--font-geist-sans)`)
- **Mono (passcodes, links):** Geist Mono (`var(--font-geist-mono)`)
- Font sizes: `text-[10px]`, `text-xs` (12px), `text-sm` (14px), `text-base` (16px)

### Spacing and Layout
- Sidebar: fixed `w-80 lg:w-96` on desktop, full-width on mobile
- Border radius: `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-3xl`, `rounded-full`
- Chat bubbles: `rounded-lg` with one corner removed (`rounded-tr-none` sent, `rounded-tl-none` received)
- Message padding: `p-2.5 sm:p-3`

### Navigation Structure
- **No traditional nav bar.** Single-page app. All "navigation" is state-driven:
  - `mobileView: 'contacts' | 'chat'` toggles visibility on small screens
  - `showAdminModal` overlays the admin dashboard
  - `isDisguiseMode` / `isLinkUnlocked` / `currentUser` control which screen renders

### Empty States
- No contacts: icon + explanation text in sidebar
- No chat selected: large icon + prompt + optional admin button
- No messages in conversation: large emoji 💬 + prompt text

### Error States
- Auth error: red banner inside passcode form
- Form validation: inline error message in admin form
- All API errors: silently ignored in polling hooks; shown to user only in forms

### What Can Be Changed Without Affecting Functionality
- All Tailwind color classes
- All padding/margin/border-radius values
- Font family (in `layout.tsx` and `globals.css`)
- Avatar emoji set in `AdminDashboard.tsx`
- Any icon from `lucide-react`
- The gate screen gradient background and card colors
- The "WhatsApp" hardcoded colors (`#0b141a`, `#005c4b`, `#202c33`, etc.)
- The "Passcode Encrypted" label text and all copy/labels

---

## 7. Data and Backend Workflows

### Data Models

#### `User`
```typescript
interface User {
  id: string;           // "admin_root" or "usr_<random>"
  name: string;
  code: string;         // Passcode used to log in (e.g., "0796", "@2021")
  role: 'admin' | 'user';
  avatar: string;       // Emoji string
  status: 'online' | 'offline'; // Computed dynamically from lastSeen
  lastSeen: string;     // ISO 8601 timestamp
  createdAt: string;    // ISO 8601 timestamp
  notes?: string;       // Admin-only internal notes
}
```

#### `Message`
```typescript
interface Message {
  id: string;           // "msg_<random>_<timestamp>"
  senderId: string;
  receiverId: string;
  text: string;
  image?: string;       // base64 data URI
  createdAt: string;    // ISO 8601 timestamp
  read: boolean;
  reactions?: { emoji: string; userId: string }[];
}
```

### Storage Architecture (tri-level)

```
Priority 1: Upstash Redis (KV_REST_API_URL + KV_REST_API_TOKEN)
  ├── chatpass_users      → SET/GET (JSON array of User[])
  ├── chatpass_messages   → RPUSH/LRANGE (Redis list, each item is JSON Message)
  └── chatpass_reactions  → SET/GET (JSON object: { [messageId]: [{emoji, userId}][] })

Priority 2: Local file system
  ├── /tmp/chat_db.json   (when process.env.VERCEL is set)
  └── data/db.json        (local development)

Priority 3: In-process module variable (memoryStore)
  └── Lost on process restart
```

### Key Database Functions (`src/lib/db.ts`)

| Function | Description |
|---|---|
| `getDb()` | Reads full DB from KV (preferred) → file → memory |
| `saveDb(data)` | Writes users to KV + writes full DB to file; sets memoryStore |
| `findUserByCode(code)` | Looks up user by passcode; `@2021`/`2021` always resolves to admin |
| `getAllUsers()` | Returns all users with dynamically computed `status` (based on `lastSeen` < 6s ago) |
| `createUser(data)` | Creates user with auto ID, saves to DB |
| `updateUser(id, updates)` | Partial update, saves to DB |
| `deleteUser(id)` | Removes user + their messages |
| `getConversationMessages(user1, user2)` | Returns filtered+sorted messages, merged with KV reactions |
| `createMessage(data)` | Creates message with dedup, saves via RPUSH to KV |
| `markMessagesAsRead(sender, receiver)` | Bulk marks messages read, saves to KV |
| `clearConversationMessages(u1, u2)` | Deletes all messages between two users |
| `addReactionToMessage(msgId, userId, emoji)` | Reads/writes ONLY `chatpass_reactions` KV key (no message list touch) |
| `resetDatabase()` | Wipes all users (keeps admin), deletes all messages |

### Presence / Online Status Logic
- **Heartbeat:** Every 2 seconds, `GET /api/users` is called. The route updates the caller's `lastSeen` on each call.
- **Online threshold:** A user is considered `online` if their `lastSeen` is within the last **6 seconds** (computed in `getAllUsers()` in `db.ts`).
- **Offline on tab close:** `beforeunload` event fires `navigator.sendBeacon('/api/users/status', {status:'offline'})`.
- **Offline on logout:** Direct `fetch('/api/users/status', {status:'offline'})`.

### Authentication Flow
1. User visits `/`
2. `page.tsx` checks `sessionStorage.chatpass_disguise` → Disguise mode
3. Checks `sessionStorage.chatpass_link_unlocked` → skip gate if already unlocked
4. Checks URL `?code=` param OR `sessionStorage.chatpass_user_code` → verify with `/api/auth/verify`
5. If all fail → render `<PasscodeModal mode="gate" />`
6. User types passcode → `handleLogin()` → `POST /api/auth/verify`
7. On success: store code in sessionStorage, set `currentUser`, set `isLinkUnlocked=true`
8. On `@1234`: set `isDisguiseMode=true`, store in sessionStorage

---

## 8. End-to-End User Flows

### Flow A: First Visit (New User with Passcode)
1. User visits `https://your-app.vercel.app/`
2. Gate screen renders (dark gradient + white card login form)
3. User types their passcode (e.g., `0796`)
4. `POST /api/auth/verify` verifies code, marks user online
5. Session stored in `sessionStorage`
6. Contact sidebar renders with contacts + online status
7. User clicks a contact → messages load (cached instantly, then fresh from server)
8. User types and sends messages; seen in real-time by both parties (1s poll)

### Flow B: Returning User (Session Restore)
1. User refreshes page
2. `sessionStorage.chatpass_user_code` exists → auto-verify without showing gate
3. App opens directly to main chat view
4. Cached messages display instantly before server responds

### Flow C: Direct Link Access
1. Admin shares link `/?code=0796`
2. Page loads → detects `?code=0796` in URL → auto-verifies
3. URL cleaned (`history.replaceState`) → no code visible in address bar
4. App opens directly to main chat

### Flow D: Disguise Mode
1. User enters `@1234` as password
2. `handleLogin` detects disguise code → sets `isDisguiseMode=true`, stores in sessionStorage
3. `<BeautyWebsite />` renders with full-screen iframe of beauty website
4. User sees nothing of the chat app
5. To return: click the subtle lock icon (bottom-right, semi-transparent)

### Flow E: Admin Creates a New User
1. Admin logs in with `@2021`
2. Clicks Admin Shield icon in sidebar or "Admin Control Center" button
3. `<AdminDashboard />` modal opens
4. Fills in name, optional passcode (or generates), picks emoji avatar, optionally adds notes
5. Clicks "Generate & Save Account"
6. Success card shows: name, passcode, direct link, "Share on WhatsApp" button
7. Admin copies link / sends via WhatsApp
8. Admin switches to "Manage Accounts" tab to see all users

### Flow F: Send a Message with Image
1. User clicks image icon (📷) in the input bar
2. File picker opens; user selects an image (max 5MB)
3. Image converted to base64 via `FileReader`
4. Preview bar appears above input
5. User optionally types text, clicks Send
6. Message (with base64 image) sent to `POST /api/messages`
7. Message appears instantly (optimistic), confirmed on server response

### Flow G: React to a Message
1. User hovers over a message bubble
2. `⌄` (ChevronDown) button appears to the right of the bubble
3. User clicks it → emoji picker popup appears: `❤️ 👍 😂 😮 😢 🙏`
4. User clicks an emoji → local state updates instantly (optimistic)
5. `POST /api/messages/react` saves to `chatpass_reactions` KV key
6. Reaction pill appears below the bubble
7. Clicking the same emoji again removes the reaction
8. Other user sees the reaction on their next poll (within 1–2s)

### Flow H: Clear Chat
1. User clicks 🗑 "Clear Chat" in the chat header
2. Confirmation modal appears: "Are you sure?"
3. User clicks "Clear Chat" → `POST /api/messages/clear`
4. All messages deleted from DB; local state cleared; sessionStorage cache cleared

---

## 9. Dependencies and Environment Setup

### Runtime Dependencies
| Package | Version | Purpose |
|---|---|---|
| `next` | 16.3.6 | Framework: routing, SSR, API routes |
| `react` | 19.2.8 | UI library |
| `react-dom` | 19.2.8 | DOM rendering |
| `lucide-react` | ^1.47.0 | Icon components |

### Dev Dependencies
| Package | Purpose |
|---|---|
| `tailwindcss` ^4 | Utility CSS framework |
| `@tailwindcss/postcss` ^4 | PostCSS integration for Tailwind v4 |
| `typescript` ^5 | Type checking |
| `@types/node`, `@types/react`, `@types/react-dom` | TypeScript definitions |
| `eslint`, `eslint-config-next` | Linting |

### Commands
```bash
npm install          # Install dependencies
npm run dev          # Start development server
npm run build        # Production build
npm run start        # Start production server
npm run lint         # Run ESLint
```

### Required Environment Variables

| Variable | Purpose |
|---|---|
| `KV_REST_API_URL` | Upstash Redis REST endpoint (primary storage) |
| `KV_REST_API_TOKEN` | Upstash Redis auth token |
| `UPSTASH_REDIS_REST_URL` | Alternative name accepted by db.ts for the same URL |
| `UPSTASH_REDIS_REST_TOKEN` | Alternative name accepted by db.ts for the same token |
| `ADMIN_CODE` | Admin passcode (defaults to `ADMIN123` if not set) |
| `VERCEL` | Set automatically by Vercel; switches tmp path for file fallback |

> **Note:** Without KV credentials, the app falls back to a local JSON file (dev) or in-process memory (production — data lost on restart). For production use, Upstash KV is **required**.

---

## 10. Existing Issues and Limitations

| Area | Issue | Severity |
|---|---|---|
| **Video/Voice call** | Phone and Video icons in chat header render but have zero functionality. | Low (cosmetic) |
| **Image storage** | Images are stored as base64 data URIs directly inside message objects and KV store. Makes KV payloads very large for image-heavy chats. | High (scalability) |
| **No real-time push** | App uses HTTP polling every 1s (messages) and 2s (users). No WebSockets or SSE. | Medium |
| **One admin only** | Only one `admin_root` account. Creating a second admin via API PUT is possible but not exposed in UI. | Low |
| **Passcode visible in switcher** | In `mode=switcher`, user passcodes are visible in the quick-switch badges. | Medium (privacy) |
| **No message pagination** | All conversation messages loaded at once. Large conversations may hit KV response size limits. | Medium |
| **`animate-fadeIn` undefined** | `animate-fadeIn` class used in several components, but no `@keyframes` definition exists in `globals.css`. May silently fail. | Low |
| **No CSRF protection** | All API routes accept any POST request with no origin checks or CSRF tokens. | Low (by design) |
| **KV DEL+RPUSH not atomic** | `saveKvMessages` deletes then re-pushes all messages. A concurrent read during this window returns an empty list. | Medium |
| **sessionStorage (not localStorage)** | Session lost when browser tab is closed (not just navigated away). Users must re-enter passcode in a new tab. | Low (by design) |

---

## 11. Recreation Blueprint

### Features That Must Remain the Same (Behavior-Critical)
1. **Two-password gate:** `@2021` → chat app; `@1234` → disguise/iframe redirect
2. **Passcode-based auth** — no email, no OAuth, no cookies
3. **Session restore from `sessionStorage`** — no re-login on refresh
4. **Direct URL access** (`?code=<passcode>`) — auto-verifies and cleans URL
5. **One admin user** with special powers; multiple regular users
6. **1-second message polling** with AbortController cancellation
7. **2-second user/presence polling** with heartbeat-based online/offline detection
8. **`beforeunload` beacon** to mark user offline on tab close
9. **Optimistic message sending** (temp ID, replace with server ID)
10. **Message deduplication** (ID + content+time signature)
11. **sessionStorage cache** for instant message display on refresh
12. **Emoji reactions** stored in separate KV key (`chatpass_reactions`)
13. **Pending reaction protection** (4s lock against polling overwrite)
14. **Read receipts** (single ✓ / double ✓✓ with blue color)
15. **Image upload** (base64, 5MB limit, lightbox)
16. **Clear chat** (both-sides delete)
17. **Admin dashboard** with all CRUD operations + share card + WhatsApp share
18. **Tri-level storage** (KV → file → memory)

### Pages / Components to Recreate
| Component | Notes |
|---|---|
| `PasscodeModal` | Two modes (`gate`, `switcher`). Same props interface. |
| `ContactsSidebar` | Online dots, unread badges, search, admin button. Same props. |
| `ChatWindow` | Full feature set: bubbles, timestamp, read ticks, reactions, image, emoji bar, lightbox, clear chat modal. |
| `AdminDashboard` | Full CRUD + share card. Can simplify edit modal if desired. |
| `BeautyWebsite` | Iframe + lock button. URL is configurable. |

### What Can Be Replaced Purely at Design Level
- All Tailwind color classes, gradients, backgrounds
- Font family (replace Geist with any Google Font)
- Icon set (replace lucide-react with any icon library)
- Border radius values
- Avatar emoji set in `AdminDashboard`
- App name ("ChatPass") in `layout.tsx`
- Login screen layout and gradient
- Sidebar width
- Message bubble colors and shapes
- Send button color and style
- Header bar style
- All label and placeholder text

### What Depends on Existing Services or Credentials
- **Upstash KV:** New project needs its own KV database and env vars
- **Disguise URL:** `https://beauty-n-joy-demo.pixelworks.workers.dev/` is a Cloudflare Worker — keep or replace with any public URL

---

## 12. Final Implementation Checklist

### Project Setup
- [ ] Create new Next.js 16 project with TypeScript + Tailwind v4 (`create-next-app`)
- [ ] Install `lucide-react` (or chosen icon library)
- [ ] Configure fonts in `layout.tsx`
- [ ] Set up Upstash KV database, add env vars
- [ ] Configure `ADMIN_CODE` env var
- [ ] Set app metadata (title, description, themeColor, viewport) in `layout.tsx`

### Data Layer (`src/lib/db.ts`)
- [ ] Define `User` and `Message` interfaces (with `reactions` field)
- [ ] Implement `getKvMessages()` with deduplication logic
- [ ] Implement `saveKvMessages()` (DEL + RPUSH)
- [ ] Implement `getKvReactions()` and `saveKvReaction()` (separate KV key)
- [ ] Implement `getKvUsers()` and `saveKvUsers()`
- [ ] Implement `getDb()` with tri-level fallback
- [ ] Implement all CRUD helpers: `findUserByCode`, `getAllUsers`, `createUser`, `updateUser`, `deleteUser`
- [ ] `getAllUsers()` computes online status dynamically from `lastSeen` (<6s threshold)
- [ ] `getConversationMessages()` merges reactions from separate KV key at read time
- [ ] `createMessage()` with in-memory dedup (`recentSentSignatures`) and RPUSH
- [ ] `markMessagesAsRead()`, `clearConversationMessages()`, `addReactionToMessage()`, `resetDatabase()`
- [ ] Seed `INITIAL_DATA` with admin user

### API Routes
- [ ] `POST /api/auth/verify`
- [ ] `GET /api/users` (heartbeat + stats)
- [ ] `POST /api/users/status` (JSON + sendBeacon support)
- [ ] `GET /api/messages` (fetch + auto-mark-read + merge reactions)
- [ ] `POST /api/messages`
- [ ] `POST /api/messages/read`
- [ ] `POST /api/messages/clear`
- [ ] `POST /api/messages/react`
- [ ] `GET/POST/PUT/DELETE /api/admin/users`
- [ ] `POST /api/admin/reset`

### Main Orchestrator (`src/app/page.tsx`)
- [ ] Disguise mode state + sessionStorage persistence
- [ ] `isLinkUnlocked` gate state
- [ ] `currentUser` state + session restore on mount (`useEffect`)
- [ ] `handleLogin()` with disguise/real-auth branching
- [ ] `handleLogout()` with offline beacon + state clear
- [ ] `fetchUsers()` with 2s polling interval
- [ ] `fetchMessages()` with 1s polling, AbortController, dedup+cache
- [ ] `handleSendMessage()` with optimistic update + temp ID replacement
- [ ] `handleSelectContact()` with cache load + fresh fetch
- [ ] `handleClearChat()` with cache invalidation
- [ ] `beforeunload` event listener for offline beacon
- [ ] Mobile view toggle (`mobileView: 'contacts' | 'chat'`)
- [ ] All 7 conditional render paths

### Components
- [ ] `PasscodeModal` — `gate` mode (minimal) + `switcher` mode (rich with account badges)
- [ ] `ContactsSidebar` — header, admin bar, search, contact list with status dots and badges
- [ ] `ChatWindow` — header, messages, reactions, input bar, emoji bar, lightbox, clear modal
- [ ] `AdminDashboard` — tabbed modal, create form, manage list, edit modal, share card
- [ ] `BeautyWebsite` — iframe + loading state + lock button

### Features and Interactions
- [ ] Passcode gate with gradient background + login card
- [ ] Account switcher with user badges (showing passcodes or hidden, per design choice)
- [ ] Online/offline indicator dots on contacts and in chat header
- [ ] Unread message count badges (animated pulse)
- [ ] Last message preview in contact list with relative time
- [ ] Message timestamp formatted as `HH:MM`
- [ ] Float-right timestamp with invisible trailing spacer (prevents text overlap)
- [ ] Single ✓ (unread) / double ✓✓ blue (read) tick marks
- [ ] Image attachment selection + base64 conversion + 5MB check + preview bar
- [ ] Image lightbox on click
- [ ] Hover-reveal reaction arrow + emoji picker popup (6 emojis)
- [ ] Reaction pill badges below bubble (with count if > 1)
- [ ] Pending reaction guard (4s protection from polling overwrite)
- [ ] Quick emoji bar (12 emojis to insert into text)
- [ ] Enter to send, Shift+Enter for new line
- [ ] Smooth scroll-to-bottom on new messages
- [ ] Clear chat confirmation modal
- [ ] Admin: emoji avatar picker grid
- [ ] Admin: auto-generate passcode button
- [ ] Admin: success share card with copy-link and WhatsApp share
- [ ] Admin: "Purge Demo Chats" button with confirm dialog
- [ ] Disguise mode with full-screen iframe
- [ ] Discreet lock button on disguise screen
- [ ] Direct URL access (`?code=`) with URL auto-clean

### Responsive Design
- [ ] Sidebar full-width on mobile, fixed-width on desktop
- [ ] `mobileView` toggle hides one panel at a time on mobile
- [ ] Back button in chat header on mobile only
- [ ] Admin dashboard modal uses responsive padding/grid

### Testing and Validation
- [ ] Test gate with valid/invalid passcodes
- [ ] Test disguise mode and lock-icon return
- [ ] Test direct URL access (`?code=`)
- [ ] Test session restore after page refresh
- [ ] Test online/offline status transitions (open/close tab)
- [ ] Test unread badges appear and clear when chat opened
- [ ] Test optimistic message sending and dedup
- [ ] Test image upload, send, and lightbox
- [ ] Test emoji reactions (add, change, remove, persistence after 4s+ polling)
- [ ] Test clear chat (both sides see empty)
- [ ] Test admin create → share → login with new account
- [ ] Test admin edit and delete
- [ ] Test mobile breakpoints

---

## 13. Suggested Implementation Order

### Phase 1: Foundation
1. Create Next.js project, configure Tailwind, install lucide-react
2. Implement `src/lib/db.ts` (models, KV helpers, all CRUD)
3. Implement all API routes (backend first)
4. Test API routes via browser fetch or Postman

### Phase 2: Auth + Shell
5. Implement `layout.tsx` with fonts and metadata
6. Implement `page.tsx` — state machine, session restore, login handler, 7 render paths
7. Implement `PasscodeModal.tsx` (both modes)
8. Implement `BeautyWebsite.tsx` (disguise)
9. Verify login → main app transition works end-to-end

### Phase 3: Core Chat UI
10. Implement `ContactsSidebar.tsx`
11. Wire up polling for users + presence in `page.tsx`
12. Implement `ChatWindow.tsx` — header, bubble rendering, timestamp, read ticks
13. Wire up message polling + optimistic send in `page.tsx`
14. Implement image upload + lightbox

### Phase 4: Advanced Chat Features
15. Implement emoji reactions (hover button, picker, pills, pending guard)
16. Implement quick emoji bar
17. Implement clear chat with confirmation modal
18. Implement `beforeunload` offline beacon

### Phase 5: Admin Panel
19. Implement `AdminDashboard.tsx` (create tab, manage tab, edit modal)
20. Wire up admin to `page.tsx` (open/close, chat redirect)

### Phase 6: Visual Theme
21. Apply new visual design (colors, fonts, border-radius, layout tweaks)
22. Ensure all existing functionality still works after restyling

### Phase 7: QA and Deployment
23. Test all flows end-to-end
24. Test on mobile breakpoints
25. Deploy to Vercel with real KV credentials
26. Verify reactions persist correctly after polling cycles
27. Verify online/offline status works with multiple browser tabs

---

## 14. Essential File Reference

| Feature | Primary Files to Inspect |
|---|---|
| Auth / session | `src/app/page.tsx` (handleLogin, session restore useEffect), `src/app/api/auth/verify/route.ts`, `src/lib/db.ts` (findUserByCode) |
| Presence / online status | `src/app/page.tsx` (fetchUsers, beforeunload), `src/app/api/users/route.ts`, `src/app/api/users/status/route.ts`, `src/lib/db.ts` (getAllUsers, 6s threshold) |
| Message polling + dedup | `src/app/page.tsx` (fetchMessages, mergeMessages, getCachedMessages), `src/lib/db.ts` (getKvMessages dedup logic) |
| Optimistic send | `src/app/page.tsx` (handleSendMessage with tempId), `src/lib/db.ts` (createMessage + recentSentSignatures) |
| Message rendering + timestamps | `src/components/ChatWindow.tsx` (messages.map block, float-right spacer) |
| Read receipts | `src/components/ChatWindow.tsx` (CheckCheck/Check icons), `src/app/api/messages/route.ts` (auto-mark on GET), `src/lib/db.ts` (markMessagesAsRead) |
| Image attachment | `src/components/ChatWindow.tsx` (handleImageSelect, FileReader, lightbox state) |
| Emoji reactions | `src/components/ChatWindow.tsx` (handleReact, REACTION_EMOJIS, localReactions, pendingReactionMsgIds), `src/app/api/messages/react/route.ts`, `src/lib/db.ts` (addReactionToMessage, getKvReactions, saveKvReaction) |
| Disguise mode | `src/app/page.tsx` (handleLogin @1234 branch, isDisguiseMode), `src/components/BeautyWebsite.tsx` |
| Admin panel | `src/components/AdminDashboard.tsx`, `src/app/api/admin/users/route.ts`, `src/app/api/admin/reset/route.ts` |
| Database / KV storage | `src/lib/db.ts` (entire file — all storage logic, CRUD, interfaces) |
| Mobile layout | `src/app/page.tsx` (mobileView state, CSS conditional visibility), `src/components/ChatWindow.tsx` (ArrowLeft onBack button) |
| Clear chat | `src/components/ChatWindow.tsx` (showClearConfirm modal), `src/app/page.tsx` (handleClearChat), `src/app/api/messages/clear/route.ts` |
