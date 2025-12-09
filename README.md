# Privaseer: Privacy-First Browser Extension

## Project Overview

Privaseer is a Manifest V3 browser extension built for Chrome and Chromium-based browsers. The project couples strict, local-first privacy controls with Supabase-powered edge functions for optional services such as burner-email generation, inbound email sanitization, telemetric insights, and feedback collection. The current codebase (TypeScript 5.5 strict + React 18.3 + Vite 7.2) ships two content scripts (consent scanner + burner email autofill), an event-driven service worker, and a Tailwind-powered popup UI that exposes privacy scoring, CMP compliance monitoring, and identity-protection workflows.

## Core Capabilities

### Privacy Protection Suite
- **Tracker Blocking**: DeclarativeNetRequest ruleset (`public/data/blocking-rules.json`) contains 30 curated rules covering analytics, advertising, social, fingerprinting, heatmap, beacons, and affiliate trackers (124 domains across 7 categories in `tracker-lists.json`)
- **Adaptive Risk Scoring**: `FirewallEngine` attaches weighted severity (1–20) per tracker, debounces badge updates, and prevents duplicate alerts per tab/site pair
- **Badge + Alerting**: Per-tab badge counts, in-popup alert feed, and event-emitter hooks keep popup/content scripts synchronized via the shared message bus

### Consent Intelligence & CMP Enforcement
- **CMP Scanner**: `content-scripts/consent-scanner.ts` inspects banners using the selectors, button patterns, and six deceptive-pattern definitions in `privacy-rules.json`
- **Persistent Compliance**: Consent outcomes and penalties are stored via `Storage.consentStates`, deduplicated for five minutes, and surfaced as non-compliant site alerts with severity multipliers
- **Cookie Persistence Tracking**: Local consent cache plus Supabase migration `20251114_create_consent_persistence.sql` keep CMP state auditable

### Identity Protection
- **Burner Email Platform**: `burner-email-service.ts` calls the Supabase `generate-burner-email` edge function, enforces forwarding-email validation, and keeps installation IDs scoped per device
- **Email Autofill Content Script**: `email-autofill.ts` injects a burner button into any detected email input, retries when the service worker is asleep, and respects the burner toggle persisted in storage
- **Popup Management**: `popup/burner-emails-section.tsx` shows generated aliases, usage stats, and deletion controls even when generation is disabled

### Telemetry & Feedback Controls
- **Opt-In Telemetry**: Defaults to disabled (`Storage.settings.telemetryEnabled`); toggled from the Settings page and enforced before events reach Supabase
- **Feedback Workflows**: `feedback-telemetry-service.ts` submits sanitized reports to the `submit-feedback` edge function, tagging installation IDs + extension versions while respecting local privacy toggles
- **Metrics Dashboards**: `metrics-aggregation.ts` exposes week/month/all-time snapshots, tracker category breakdowns, and compliance score distributions for the popup Insights view

## Technical Architecture

**Foundation**
- Manifest V3 service worker (`src/background/service-worker.ts`) orchestrates storage, firewall, burner email, telemetry, and tab lifecycles
- TypeScript 5.5 strict mode, React 18.3.1, Vite 7.2.2, vite-plugin-web-extension for ergonomics, Tailwind 3.4 for styling, Lucide React for icons
- Supabase Edge Functions (`supabase/functions/*`) and Postgres migrations provide burner-email, inbound-email, and feedback APIs secured via RLS + audit triggers (`supabase/security_enhancements.sql`)
- Event-driven architecture: custom `event-emitter`, type-safe `message-bus`, and shared constants/type guards to keep contexts loosely coupled
- Testing stack: Vitest + @testing-library/react (unit/integration suites under `src/tests`), Happy DOM, ESLint 9.x for linting, TypeScript project references for build-time safety

**Performance Characteristics**
- Declarative rules only (no background webRequest), keeping service-worker resume times sub-second and memory footprint minimal
- Tracker catalog: 124 domains across 7 categories + 11 high-risk overrides; `FirewallEngine` caches per-site alerts and cleans timers hourly (`TIME.ONE_HOUR_MS`)
- CMP scanner: 20 selectors, 10 accept/reject patterns, and 6 deceptive-pattern penalties; consent alerts deduplicated for five minutes
- Storage guardrails: max 100 alerts, 30-day privacy-score history, daily snapshots for metrics, and exponential backoff when writing (`STORAGE_RETRY`)
- Badge updates debounced to 300 ms per tab; cleanup scheduled hourly to release timers when tabs close

## Implementation Details

### Blocking Mechanism
- `FirewallEngine` loads the declarative ruleset at start-up, toggles it in sync with `Storage.settings.protectionEnabled`, and emits `TRACKER_INCREMENT` / `TRACKER_BLOCKED` events
- Risk weighting (analytics, advertising, fingerprinting, cryptomining, etc.) drives severity messaging, popup alerts, and privacy-score deltas
- Tab badge counts are tracked via `tabManager` with dedicated cleanup/lifecycle hooks (`TAB_REMOVED` listener + hourly sweeper)

### Privacy Scoring Algorithm
- Constants in `PRIVACY_SCORE` and `DAILY_RECOVERY` govern +/- deltas: −1 per tracker, +2 for tracker-free visits, −5 for deceptive banners, automatic recovery on “clean” days
- `Storage` maintains daily aggregates, 30-entry history, and daily snapshots (trackers per category, clean sites, CMP scores, burner email stats) used by `MetricsAggregationService`
- Rolling trends (7/30/all-time), compliance score distributions, and tracker-category breakdowns are computed serverlessly in the service worker and rendered in the popup

### Consent Scanner & Persistence
- `consent-scanner.ts` runs at `document_idle`, analyzes DOM mutations, and forwards CMP verdicts via `messageBus` (`CONSENT_SCAN_RESULT`) for storage + alerting
- Storage caches the last consent alert per domain, ensuring users get actionable—but not noisy—warnings about deceptive banners
- Migrations (`20251112_create_feedback_system.sql`, `20251114_create_consent_persistence.sql`) lay down the persistent schema for consent telemetry + feedback auditability

### Burner Email Platform
- `burner-email-service.ts` enforces feature toggles, forwarding-email validation (`utils/validation.ts`), request sanitization, Supabase auth headers, and resilient retries
- Supabase edge functions:
  - `generate-burner-email`: validated Deno function that assembles adjective–noun aliases, enforces rate limits, and persists to Postgres with audit trails
  - `inbound-email`: sanitizes inbound payloads, applies rate limiting (`rate-limiter.ts`), and logs tracker removal metadata
  - `submit-feedback`: stores optional feedback + telemetry events with browser/extension metadata
- Content script (`email-autofill.ts`) positions a burner button near active email inputs, handles SW sleep retries, and provides in-page toast notifications for success/error

### Metrics & Insights
- `metrics-aggregation.ts` rolls up snapshots for week/month/all-time, top blocked domains, category percentages, burner email stats, and compliance averages
- Popup surfaces these insights in dashboard cards, while Settings deep links (e.g., highlight burner toggle) reuse shared state hooks

### Feedback & Telemetry Service
- `feedback-telemetry-service.ts` reuses the installation ID, extension version, and optional URL/domain context to send sanitized payloads to Supabase functions
- Telemetry respects `SET_TELEMETRY_SETTING`/`GET_TELEMETRY_SETTING` message handlers; when disabled the service short-circuits tracking calls

### User Interface
- React popup (`popup.tsx`) renders real-time score, tracker feed, CMP alerts, and burner email controls
- Settings modal (`settings-page.tsx`) handles theme switching (light/dark/system via `ThemeManager`), telemetry and burner toggles (with race-condition guards), forwarding-email persistence, and in-popup feedback submission
- `burner-emails-section.tsx` + `BurnerEmailDisabled.tsx` manage alias lists, copy/delete actions, and highlight flows when the feature is disabled

## Project Structure

```
privaseer/
├── src/
│   ├── background/
│   │   ├── burner-email-service.ts
│   │   ├── event-emitter.ts
│   │   ├── feedback-telemetry-service.ts
│   │   ├── firewall-engine.ts
│   │   ├── metrics-aggregation.ts
│   │   ├── privacy-score.ts
│   │   ├── service-worker.ts
│   │   └── storage.ts
│   ├── content-scripts/
│   │   ├── consent-scanner.ts
│   │   └── email-autofill.ts
│   ├── popup/
│   │   ├── BurnerEmailDisabled.tsx
│   │   ├── burner-emails-section.tsx
│   │   ├── popup.html
│   │   ├── popup.tsx
│   │   └── settings-page.tsx
│   ├── utils/
│   │   ├── cmp-detector.ts
│   │   ├── consent-validator.ts
│   │   ├── constants.ts
│   │   ├── logger.ts
│   │   ├── message-bus.ts
│   │   ├── penalty-decay.ts
│   │   ├── sanitizer.ts
│   │   ├── tab-manager.ts
│   │   ├── theme-helper.ts
│   │   ├── theme-manager.ts
│   │   ├── type-guards.ts
│   │   └── validation.ts
│   ├── tests/ (Vitest suites mirroring background, content scripts, popup, utils, Supabase helpers)
│   ├── types/
│   │   └── index.ts
│   ├── index.css
│   └── manifest.json
├── public/
│   ├── data/
│   │   ├── blocking-rules.json
│   │   ├── privacy-rules.json
│   │   └── tracker-lists.json
│   └── icons/
├── supabase/
│   ├── functions/
│   │   ├── generate-burner-email/
│   │   ├── inbound-email/
│   │   └── submit-feedback/
│   ├── migrations/
│   │   ├── 20251112_create_feedback_system.sql
│   │   ├── 20251114_create_consent_persistence.sql
│   │   ├── 20251119_create_burner_email_system.sql
│   │   ├── 20251205_add_expires_at_column.sql
│   │   └── 20251205_fix_function_search_paths.sql
│   └── security_enhancements.sql
├── eslint.config.js
├── vite.config.ts / vitest.config.ts / tailwind.config.js / tsconfig*.json
└── .github/workflows/ci.yml
```

## Development Guide

### Prerequisites
- Node.js 18+
- npm 9+
- Chrome 115+ recommended (Manifest V3 stable channel)

### Building, Testing, and Tooling

```bash
# Install dependencies
npm install

# Development server with hot reload + extension reloader
npm run dev

# Production build (outputs to dist/)
npm run build

# Preview the production build
npm run preview

# Type-only compilation check
npm run typecheck

# ESLint 9.x flat config
npm run lint

# Vitest suites (watch mode / UI / coverage)
npm run test
npm run test:ui
npm run test:coverage
```

### Loading in Browser
1. Run `npm run build` to populate `dist/`
2. Open `chrome://extensions`
3. Enable “Developer mode”
4. Click “Load unpacked” and select the `dist` directory

### Testing & CI
- Vitest suites live under `src/tests/` (background, content-scripts, popup, utils, Supabase edge helpers, and Supabase inbound-email sanitizers/rate limiters)
- `.github/workflows/ci.yml` runs lint + test pipelines on every push
- Use `npm run test:coverage` to generate V8 coverage for popup components and background services

## Privacy and Security Considerations

### Data Handling
- Core privacy telemetry, tracker stats, CMP verdicts, and settings stay in `chrome.storage.local` (`Storage` enforces 30-day retention and async flush with retries)
- Supabase is only used for burner-email aliases, inbound-email forwarding, and optional telemetry/feedback; requests carry installation IDs + hashed emails and route through access-controlled edge functions with strict validation
- Telemetry defaults to disabled; toggling it on simply allows anonymized event envelopes to hit the Supabase endpoint

### Permission Justification
- `storage`: Persist privacy metrics, CMP states, and burner-email settings locally
- `activeTab` + `tabs`: Required for badge management, per-tab tracker counts, and popup context
- `declarativeNetRequest` + `declarativeNetRequestFeedback`: Foundation of tracker blocking and statistics
- `<all_urls>` host permission: Required for consent scanning + burner email autofill content scripts

### Supabase Security
- `supabase/security_enhancements.sql` hardens RLS policies, adds audit logging (`security_audit_log`), enforces email formatting, positive counters, and rate limits for burner-email tables
- Migrations add consent persistence, feedback tables, burner email schema, and search-path fixes for edge functions

## Maintenance and Extension

### Enhancement Opportunities
1. **Tracker Catalog Expansion**: Update `tracker-lists.json` and `blocking-rules.json` with additional domains/categories or per-region rules
2. **CMP Detection Coverage**: Extend selectors/deceptive-pattern definitions and add ML-backed heuristics to `privacy-rules.json`
3. **Internationalization**: Localize popup + settings copy, CMP detectors, and toast notifications
4. **Supabase Observability**: Add dashboards for rate-limiter triggers, inbound-email audit logs, and burner-email lifecycle analytics
5. **Automation**: Integrate browser-based end-to-end tests (Playwright) to validate popup flows and content-script injections

### Troubleshooting Guidelines

**Extension Loading Issues**
- Confirm Chrome is up to date and Developer Mode is enabled
- If manifest validation fails, run `npm run build` again to regenerate `dist/`

**Tracking & CMP Issues**
- Ensure “Protection” is enabled from the popup (badge will be empty if disabled)
- Reload the target page so content scripts can rescan banners
- Check if the tracker domain is listed under exceptions/never-block lists

**Burner Email / Supabase Connectivity**
- Burner generation requires the feature toggle + a saved forwarding email in Settings
- Errors mentioning Supabase typically indicate missing network access or expired anon key; regenerate the anon key if running against a different project
- Inbound email throttling is enforced server-side; see `rate-limiter.ts` for limits

## License and Attribution

Privaseer is distributed under the MIT License. Key dependencies include React, React DOM, TypeScript, Vite, Tailwind CSS, Lucide React, Supabase JS client, and Vitest + Testing Library.

## Version Information

**Current Release**: 1.0.0  
**Release Date**: December 2025  
**Browser Target**: Chrome/Chromium (Manifest V3)  
**Primary Technologies**: TypeScript 5.5.3, React 18.3.1, Vite 7.2.2, Tailwind CSS 3.4.1, vite-plugin-web-extension 4.5.0  
**Backend Services**: Supabase Edge Functions (`generate-burner-email`, `inbound-email`, `submit-feedback`) + five migrations + security hardening script  
**Code Metrics**: 8 background modules, 2 content scripts, 5 popup components, 11 shared utilities, 3 Supabase edge functions, 5 migrations, 30 declarative rules, 124 tracked domains

---

*This document summarizes the current implementation of Privaseer. For finer details, reference inline TypeScript documentation, Vitest specs, and Supabase migration files.*