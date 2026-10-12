# LumaChat

> Fast, passwordless two-way direct messaging platform built with Next.js App Router, TypeScript, and Tailwind CSS v4. Rebuilt and modularized from ChatPass.

---

## 1. Overview

**LumaChat** provides a frictionless, zero-registration direct messaging experience. The administrator provisions user accounts with short passcodes. Users navigate to a single URL, enter their passcode, and immediately enter a WhatsApp-inspired real-time chat interface—with no OAuth, passwords, or emails required.

### Core Features Preserved from ChatPass
- **Passcode-based access gate:** Instant entry via short numeric or text code.
- **Camouflage / Disguise Mode:** Entering `@1234` presents a beauty website disguise overlay with a discreet return lock.
- **Real-Time Messaging:** Sub-second polling, optimistic message dispatch, and message deduplication.
- **Reactions & Media:** Emoji reactions stored without race conditions, and image attachments up to 5MB.
- **Admin Control Center:** Account provisioning, passcode auto-generation, and shareable link generator with WhatsApp deep linking.
- **Presence & Read Receipts:** Heartbeat-based online detection and single/double blue tick indicators.
- **Tri-Level Storage:** Upstash Redis KV (Cloud REST), local disk fallback (`data/db.json`), and in-memory cache.

---

## 2. Architecture & Layer Organization

The application is structured into clean modular layers:

```
d:\project 2\
├── src/
│   ├── app/                 # Next.js App Router (pages, layout, API endpoints)
│   │   ├── api/
│   │   │   └── health/      # Health status endpoint
│   │   ├── globals.css      # Tailwind v4 imports, theme variables, animations
│   │   ├── layout.tsx       # Root layout, metadata, fonts, viewport
│   │   └── page.tsx         # Foundation page and presentation orchestrator
│   ├── components/          # Reusable, decoupled UI components
│   │   ├── AdminDashboard.tsx # Account management and provisioning modal
│   │   ├── BeautyWebsite.tsx  # Disguise iframe overlay and discreet lock
│   │   ├── ChatWindow.tsx     # Message thread, input bar, image lightbox
│   │   ├── ContactsSidebar.tsx# Contact list, search, online status, badges
│   │   └── PasscodeModal.tsx  # Passcode gate and account switcher
│   ├── lib/                 # Core business logic and data access
│   │   ├── config.ts        # Centralized app metadata & branding configuration
│   │   └── db.ts            # Tri-level storage adapter (Upstash KV, local file, memory)
│   └── types/               # Shared TypeScript domain models & interfaces
│       └── index.ts         # User, Message, Reaction, DatabaseSchema, Config types
├── tests/                   # Automated test suites
│   └── foundation.test.mjs  # Layer integrity and security assertion tests
├── data/                    # Local JSON persistence directory (git-ignored)
├── .env.example             # Safe environment variable template with placeholders
├── next.config.ts           # Next.js configuration
├── postcss.config.mjs       # PostCSS Tailwind CSS v4 pipeline
├── tsconfig.json            # TypeScript configuration
└── APP_BLUEPRINT.md         # Source of truth specification
```

---

## 3. Technology Stack

| Layer | Technology | Version |
|---|---|---|
| **Framework** | Next.js (App Router, Turbopack) | `16.3.6` |
| **Language** | TypeScript | `^5` |
| **UI Library** | React & React DOM | `19.2.8` |
| **Styling** | Tailwind CSS (PostCSS plugin) | `^4` |
| **Icons** | Lucide React | `^1.47.0` |
| **Fonts** | Geist Sans & Geist Mono (`next/font/google`) | Bundled |
| **Storage** | Upstash Redis REST API / Local JSON / In-memory | Tri-level |

---

## 4. Commands Reference

### Dependency Installation
```bash
npm install
```

### Development Server
```bash
npm run dev
# Starts local development server at http://localhost:3000
```

### Automated Testing
```bash
npm test
# Executes the Node.js native test runner against tests/
```

### Type Checking
```bash
npm run type-check
# Runs TypeScript compiler in --noEmit mode to verify all types
```

### Linting
```bash
npm run lint
# Runs ESLint with Next.js core web vitals and typescript rules
```

### Production Build
```bash
npm run build
# Compiles an optimized production build using Turbopack
```

### Production Server
```bash
npm run start
# Launches the production server
```

---

## 5. Environment Configuration

Copy `.env.example` to `.env.local` to configure your environment:

```bash
cp .env.example .env.local
```

### Variables

| Variable | Description | Default / Example |
|---|---|---|
| `ADMIN_CODE` | Master passcode for the primary admin operator account | `ADMIN123` |
| `KV_REST_API_URL` | Upstash Redis REST URL endpoint | `https://your-endpoint.upstash.io` |
| `KV_REST_API_TOKEN` | Upstash Redis REST authorization token | `your_token_here` |
| `UPSTASH_REDIS_REST_URL` | Alternative alias for Upstash REST URL | Optional |
| `UPSTASH_REDIS_REST_TOKEN` | Alternative alias for Upstash REST Token | Optional |
| `NEXT_PUBLIC_DISGUISE_URL` | Camouflage website URL for disguise mode | Worker demo URL |

> **Note:** Without KV credentials, LumaChat automatically falls back to local disk storage (`data/db.json`), making local setup zero-friction.

---

## 6. Implementation Checklist (Reconciled 8-Phase Plan)

### Phase 1: Foundation (Complete)
- [x] Inspect existing project vs fresh project migration approach
- [x] Establish Next.js App Router project with React 19, TypeScript 5, Tailwind CSS v4
- [x] Preserve compatible dependencies and use `lucide-react`
- [x] Create modular layered architecture (`src/app`, `src/components`, `src/lib`, `src/types`, `tests`)
- [x] Establish centralized app metadata and configuration (`src/lib/config.ts`)
- [x] Define shared type models (`src/types/index.ts`)
- [x] Create safe `.env.example` with zero leaked secrets
- [x] Implement initial automated test suite (`tests/foundation.test.mjs`)

### Phase 2: Backend, Persistence, API Validation and Authorization (Complete)
- [x] Harden `src/lib/db.ts` with strict production persistence enforcement (no silent in-memory fallback)
- [x] Refactor Redis command execution to handle network errors, bounded retries, and accurate error reporting
- [x] Implement atomic temporary key replacement + `RENAME` strategy to eliminate dangerous empty-read windows
- [x] Preserve backward compatibility with `lumachat_*` and legacy `chatpass_*` storage keys
- [x] Implement shared server-side authentication (`src/lib/auth.ts`) with HMAC-SHA256 signed session tokens
- [x] Implement rate limiting for passcode verification attempts (5 attempts per minute)
- [x] Implement comprehensive input validation (`src/lib/validation.ts`) for users, passcodes, messages, reactions
- [x] Implement `POST /api/auth/verify` with disguise code handling and session token generation
- [x] Implement `GET /api/users` with caller presence update, unread aggregation, and sanitization
- [x] Implement `POST /api/users/status` with self-or-admin authorization guard and sendBeacon support
- [x] Implement `GET /api/messages` with participant authorization and auto-mark read
- [x] Implement `POST /api/messages` with sender spoofing rejection and content validation
- [x] Implement `POST /api/messages/read` with receiver authorization
- [x] Implement `POST /api/messages/clear` with conversation participant authorization
- [x] Implement `POST /api/messages/react` with emoji validation and identity enforcement
- [x] Implement `GET/POST/PUT/DELETE /api/admin/users` with admin authorization and `admin_root` protection
- [x] Implement `POST /api/admin/reset` with admin authorization
- [x] Implement comprehensive automated runtime integration tests (`tests/backend.test.mjs`) — 31 passing tests

### Phase 3: Authentication and Application Shell (Complete)
- [x] Connect Passcode gate with server-managed HttpOnly, SameSite=Lax session cookies
- [x] Implement CSRF protection for cookie-authenticated state-changing requests
- [x] Implement server session check (`GET /api/auth/session`) for page refresh restoration
- [x] Implement server logout (`POST /api/auth/logout`) with session cookie clearing and presence update
- [x] Direct URL access parameter handling (`?code=`) with immediate browser history cleanup
- [x] Disguise mode integration (`@1234`) with full-screen iframe overlay and discreet lock return
- [x] Post-logout account switcher screen without exposing passcodes in API responses
- [x] Explicit application states (`loading`, `gate`, `switcher`, `authenticated`, `disguise`) in `src/app/page.tsx`
- [x] 38 automated tests passing across Phase 1, Phase 2, and Phase 3 suites

### Phase 4: Lavender & White Design System (Upcoming)
- [ ] Apply Lavender & White color palette and theme variables
- [ ] Refine typography, borders, and modern layout aesthetics

### Phase 5: Contacts and Core Messaging (Upcoming)
- [ ] Connect client-side contact polling (2s interval) and online presence indicators
- [ ] Connect client-side message polling (1s interval) with AbortController
- [ ] WhatsApp-style message bubbles, timestamps, and read receipts

### Phase 6: Advanced Chat Features (Upcoming)
- [ ] Optimistic message dispatch with temporary ID resolution
- [ ] Emoji reactions UI with 4-second polling protection guard
- [ ] Image attachment handling and full-screen lightbox preview

### Phase 7: Admin Dashboard (Upcoming)
- [ ] Account creation form with auto-generated passcode
- [ ] WhatsApp deep-link sharing (`wa.me`) and direct access links
- [ ] User editing, deletion, and database reset triggers

### Phase 8: Final QA and Deployment (Upcoming)
- [ ] Multi-tab real-time polling validation
- [ ] End-to-end verification across user and admin roles
- [ ] Production deployment verification with Upstash Redis KV credentials
