# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Privaseer is a Manifest V3 Chrome browser extension (TypeScript 5.5 + React 18.3 + Vite 7.2 + Tailwind CSS). It provides real-time tracker blocking, privacy scoring, consent banner scanning, and burner email aliases. The backend uses remote Supabase edge functions (no local database or Docker required for core development).

### Standard commands

All standard dev commands are in `package.json` scripts. Key ones:

- `npm run dev` — Vite dev server with HMR, outputs to `dist/` for extension loading
- `npm run build` — production build to `dist/`
- `npm run lint` — ESLint 9.x flat config
- `npm run typecheck` — TypeScript strict mode check (`tsc --noEmit`)
- `npm run test:run` — Vitest (601 tests, all self-contained with Chrome API mocks)
- `npm run test:coverage` — Vitest with V8 coverage
- `npm run test:e2e` — Playwright E2E (requires headed Chromium + built extension)

### Loading the extension in Chrome

1. Run `npm run build` (or keep `npm run dev` running for HMR)
2. Open `chrome://extensions`, enable Developer mode
3. Click "Load unpacked" and select the `dist/` directory
4. The extension popup opens when clicking the Privaseer icon on any http/https page

### Non-obvious notes

- **Unit tests are fully mocked**: `src/tests/setup.ts` mocks all Chrome APIs. No real browser, network, or Supabase connection is needed for `npm run test:run`.
- **E2E requires headed Chromium**: Playwright config sets `headless: false` because Manifest V3 extensions cannot run headlessly. The `tests/e2e/` directory is gitignored.
- **No `.env` file**: Supabase URL and anon key are hardcoded in `src/utils/constants.ts` and `src/manifest.json`. No secrets are needed for local dev or unit tests.
- **Supabase edge functions** (in `supabase/functions/`) run on Deno. They are deployed remotely and are not required for local UI/unit-test development.
- **`npm run dev` starts Vite in watch mode**: It rebuilds the `dist/` directory on file changes. The extension must be manually reloaded in Chrome after rebuilds (or use the built-in extension reloader from vite-plugin-web-extension).
- **CI uses Node.js 20.x** but Node.js 22.x works fine locally.
