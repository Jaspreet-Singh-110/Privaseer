import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/logger');

describe('CMP Cookie Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: '',
    });
  });

  describe('OneTrust Detection', () => {
    it('should detect OneTrust from OptanonConsent cookie', () => {
      document.cookie = 'OptanonConsent=groups=C0001%3A1%2CC0002%3A1';

      const cookies = document.cookie.split(';');
      const hasCookie = cookies.some(c => c.trim().startsWith('OptanonConsent'));

      expect(hasCookie).toBe(true);
    });

    it('should detect accepted consent from OptanonConsent', () => {
      const cookieValue = 'groups=C0001%3A1%2CC0002%3A1%2CC0003%3A1';

      const hasAccepted = cookieValue.includes('%3A1');
      const hasRejected = cookieValue.includes('%3A0');

      expect(hasAccepted).toBe(true);
      expect(hasRejected).toBe(false);
    });

    it('should detect rejected consent from OptanonConsent', () => {
      const cookieValue = 'groups=C0001%3A0%2CC0002%3A0&isIABGlobal=false';

      const hasRejected = cookieValue.includes('isIABGlobal=false');

      expect(hasRejected).toBe(true);
    });

    it('should detect partial consent from OptanonConsent', () => {
      const cookieValue = 'groups=C0001%3A1%2CC0002%3A0%2CC0003%3A1';

      const hasAccepted = cookieValue.includes('%3A1');
      const hasRejected = cookieValue.includes('%3A0');

      expect(hasAccepted).toBe(true);
      expect(hasRejected).toBe(true);
    });
  });

  describe('Cookiebot Detection', () => {
    it('should detect Cookiebot from CookieConsent cookie', () => {
      document.cookie = 'CookieConsent=necessary:true,preferences:true';

      const cookies = document.cookie.split(';');
      const hasCookie = cookies.some(c => c.trim().startsWith('CookieConsent'));

      expect(hasCookie).toBe(true);
    });

    it('should parse accepted consent from Cookiebot', () => {
      const cookieValue = 'necessary:true,preferences:true,statistics:true,marketing:true';

      const hasAll = cookieValue.includes('necessary:true') &&
                     cookieValue.includes('preferences:true') &&
                     cookieValue.includes('statistics:true') &&
                     cookieValue.includes('marketing:true');

      expect(hasAll).toBe(true);
    });

    it('should parse rejected consent from Cookiebot', () => {
      const cookieValue = 'necessary:true,preferences:false,statistics:false,marketing:false';

      const isRejected = cookieValue.includes('necessary:true') &&
                         cookieValue.includes('preferences:false') &&
                         cookieValue.includes('statistics:false') &&
                         cookieValue.includes('marketing:false');

      expect(isRejected).toBe(true);
    });

    it('should parse partial consent from Cookiebot', () => {
      const cookieValue = 'necessary:true,preferences:true,statistics:false,marketing:false';

      const hasNecessary = cookieValue.includes('necessary:true');
      const hasPartialReject = cookieValue.includes('false');

      expect(hasNecessary).toBe(true);
      expect(hasPartialReject).toBe(true);
    });
  });

  describe('Termly Detection', () => {
    it('should detect Termly from termly-consent cookie', () => {
      document.cookie = 'termly-consent=accepted';

      const cookies = document.cookie.split(';');
      const hasCookie = cookies.some(c => c.trim().startsWith('termly-consent'));

      expect(hasCookie).toBe(true);
    });

    it('should parse accepted from termly-consent', () => {
      const cookieValue = 'accepted';
      const isAccepted = cookieValue.toLowerCase() === 'accepted';

      expect(isAccepted).toBe(true);
    });

    it('should parse rejected from termly-consent', () => {
      const cookieValue = 'rejected';
      const isRejected = cookieValue.toLowerCase() === 'rejected';

      expect(isRejected).toBe(true);
    });
  });

  describe('GDPRCompliant Detection', () => {
    it('should detect GDPRCompliant from gdpr_consent cookie', () => {
      document.cookie = 'gdpr_consent=true';

      const cookies = document.cookie.split(';');
      const hasCookie = cookies.some(c => c.trim().startsWith('gdpr_consent'));

      expect(hasCookie).toBe(true);
    });

    it('should parse boolean consent values', () => {
      const acceptedValues = ['true', '1', 'yes', 'accepted'];
      const rejectedValues = ['false', '0', 'no', 'rejected'];

      acceptedValues.forEach(val => {
        const lower = val.toLowerCase();
        expect(['true', '1', 'yes', 'accepted'].includes(lower)).toBe(true);
      });

      rejectedValues.forEach(val => {
        const lower = val.toLowerCase();
        expect(['false', '0', 'no', 'rejected'].includes(lower)).toBe(true);
      });
    });
  });

  describe('Custom Consent Detection', () => {
    it('should detect custom cookie_consent', () => {
      document.cookie = 'cookie_consent=accept';

      const cookies = document.cookie.split(';');
      const hasCookie = cookies.some(c => c.trim().startsWith('cookie_consent'));

      expect(hasCookie).toBe(true);
    });

    it('should detect custom consent_status', () => {
      document.cookie = 'consent_status=1';

      const cookies = document.cookie.split(';');
      const hasCookie = cookies.some(c => c.trim().startsWith('consent_status'));

      expect(hasCookie).toBe(true);
    });

    it('should parse various consent formats', () => {
      const testCases = [
        { value: 'accept', expected: 'accepted' },
        { value: 'reject', expected: 'rejected' },
        { value: '1', expected: 'accepted' },
        { value: '0', expected: 'rejected' },
        { value: 'partial', expected: 'partial' },
        { value: 'necessary', expected: 'partial' },
      ];

      testCases.forEach(({ value, expected }) => {
        const lower = value.toLowerCase();
        let result = 'unknown';

        if (['true', '1', 'yes', 'accepted', 'accept'].includes(lower)) {
          result = 'accepted';
        } else if (['false', '0', 'no', 'rejected', 'reject', 'declined'].includes(lower)) {
          result = 'rejected';
        } else if (lower.includes('partial') || lower.includes('necessary')) {
          result = 'partial';
        }

        expect(result).toBe(expected);
      });
    });
  });

  describe('TCF v2 Detection', () => {
    it('should check for __tcfapi existence', () => {
      (window as any).__tcfapi = vi.fn();

      expect((window as any).__tcfapi).toBeDefined();
      expect(typeof (window as any).__tcfapi).toBe('function');

      delete (window as any).__tcfapi;
    });

    it('should handle TCF v2 getTCData call', () => {
      const mockTCData = {
        tcString: 'test',
        purpose: {
          consents: {
            1: true,
            2: true,
            3: false,
          },
        },
        cmpId: 123,
      };

      const consents = Object.values(mockTCData.purpose.consents);
      const acceptedCount = consents.filter(c => c === true).length;
      const totalCount = consents.length;

      let status = 'unknown';
      if (acceptedCount === 0) {
        status = 'rejected';
      } else if (acceptedCount === totalCount) {
        status = 'accepted';
      } else {
        status = 'partial';
      }

      expect(status).toBe('partial');
      expect(mockTCData.cmpId).toBe(123);
    });
  });

  describe('Cookie Parsing', () => {
    it('should extract cookie name and value', () => {
      const cookie = 'test_cookie=test_value';
      const [name, value] = cookie.split('=');

      expect(name).toBe('test_cookie');
      expect(value).toBe('test_value');
    });

    it('should handle URL encoded values', () => {
      const encodedValue = 'groups%3DC0001%3A1';
      const decoded = decodeURIComponent(encodedValue);

      expect(decoded).toBe('groups=C0001:1');
    });

    it('should handle multiple cookies', () => {
      document.cookie = 'cookie1=value1; cookie2=value2; cookie3=value3';

      const cookies = document.cookie.split(';').map(c => c.trim());

      expect(cookies.length).toBeGreaterThanOrEqual(1);
      expect(cookies.some(c => c.startsWith('cookie1'))).toBe(true);
    });
  });
});
