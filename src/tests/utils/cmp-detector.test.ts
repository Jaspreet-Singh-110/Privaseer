import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { detectCMP } from '@/utils/cmp-detector';

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('@/utils/logger', () => ({
  logger: loggerMock,
}));

describe('CMP detector', () => {
  const resetCookies = (): void => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: '',
    });
  };

  const clearCmpGlobals = (): void => {
    delete (window as { OneTrust?: unknown }).OneTrust;
    delete (window as { Cookiebot?: unknown }).Cookiebot;
    delete (window as { termly?: unknown }).termly;
    delete (window as { __tcfapi?: unknown }).__tcfapi;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetCookies();
    clearCmpGlobals();
  });

  afterEach(() => {
    clearCmpGlobals();
    resetCookies();
  });

  describe('CMP cookie detection', () => {
    it('detects OneTrust consent from cookies', async () => {
      document.cookie = 'OptanonConsent=groups=C0001%3A1%2CC0002%3A1';

      const result = await detectCMP();

      expect(result.detected).toBe(true);
      expect(result.cmpType).toBe('onetrust');
      expect(result.detectionMethod).toBe('cookie');
      expect(result.cookieNames).toContain('OptanonConsent');
      expect(result.consentStatus).toBe('accepted');
    });

    it('detects Cookiebot acceptance from cookies', async () => {
      document.cookie = 'CookieConsent=necessary:true,preferences:true,statistics:true,marketing:true';

      const result = await detectCMP();

      expect(result.detected).toBe(true);
      expect(result.cmpType).toBe('cookiebot');
      expect(result.detectionMethod).toBe('cookie');
      expect(result.cookieNames).toContain('CookieConsent');
      expect(result.consentStatus).toBe('accepted');
    });

    it('detects TCF consent presence from euconsent-v2 cookie', async () => {
      document.cookie = 'euconsent-v2=BOEFEAyOEFEAyAHABDENAI4AAAB9vABAASA';

      const result = await detectCMP();

      expect(result.detected).toBe(true);
      expect(result.cmpType).toBe('quantcast');
      expect(result.detectionMethod).toBe('cookie');
      expect(result.cookieNames).toContain('euconsent-v2');
      expect(result.consentStatus).toBe('unknown');
    });
  });

  describe('CMP API detection', () => {
    it('detects TCF v2 CMP via __tcfapi (e.g. Didomi)', async () => {
      (window as { __tcfapi?: unknown }).__tcfapi = vi.fn(
        (_command: string, _version: number, callback: (data: unknown, success: boolean) => void) => {
          callback(
            {
              cmpId: 300,
              purpose: { consents: { 1: true, 2: false, 3: true } },
            },
            true
          );
        }
      );

      const result = await detectCMP();

      expect(result.detected).toBe(true);
      expect(result.detectionMethod).toBe('api');
      expect(result.cmpType).toBe('tcfv2-300');
      expect(result.consentStatus).toBe('partial');
      expect(result.cookieNames).toContain('euconsent-v2');
    });

    it('falls back to unknown when __tcfapi returns no data', async () => {
      (window as { __tcfapi?: unknown }).__tcfapi = vi.fn(
        (_command: string, _version: number, callback: (data: unknown, success: boolean) => void) => {
          callback(null, false);
        }
      );

      const result = await detectCMP();

      expect(result.detected).toBe(false);
      expect(result.cmpType).toBe('unknown');
      expect(result.cookieNames).toHaveLength(0);
    });
  });
});
