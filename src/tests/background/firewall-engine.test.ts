import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FirewallEngine } from '@/background/firewall-engine';
import { CONSENT_VIOLATION } from '@/utils/constants';

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

const addAlertMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/background/storage', () => ({
  Storage: {
    addAlert: addAlertMock,
    get: vi.fn().mockResolvedValue({ settings: { protectionEnabled: true } }),
    toggleProtection: vi.fn(),
  },
}));

const broadcastMock = vi.hoisted(() => vi.fn());

vi.mock('@/utils/message-bus', () => ({
  messageBus: {
    broadcast: broadcastMock,
  },
}));

const emitMock = vi.hoisted(() => vi.fn());

vi.mock('@/background/event-emitter', () => ({
  backgroundEvents: {
    emit: emitMock,
  },
}));

vi.mock('@/utils/tab-manager', () => ({
  tabManager: {
    incrementBlockCount: vi.fn(),
    getBlockCount: vi.fn().mockReturnValue(0),
    resetBlockCount: vi.fn(),
    cleanup: vi.fn(),
  },
}));

describe('FirewallEngine post consent violation detection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    addAlertMock.mockClear();
    broadcastMock.mockClear();
    emitMock.mockClear();

    global.chrome = {
      tabs: {
        get: vi.fn().mockResolvedValue({ url: 'https://example.com/page' }),
      },
      action: {
        setBadgeText: vi.fn(),
        setBadgeBackgroundColor: vi.fn(),
      },
    } as unknown as typeof chrome;
  });

  afterEach(() => {
    vi.useRealTimers();
    FirewallEngine.setConsentRejectionProvider(null);
    FirewallEngine.cleanup();
  });

  it('creates a post consent violation alert when tracker loads after rejection', async () => {
    FirewallEngine.setConsentRejectionProvider(() => ({
      timestamp: Date.now(),
      tabId: 321,
    }));

    await FirewallEngine.handleBlockedRequest('https://tracker.example/script.js', 123);

    await vi.advanceTimersByTimeAsync(CONSENT_VIOLATION.AGGREGATION_DELAY_MS + 10);

    expect(addAlertMock).toHaveBeenCalledTimes(1);
    const alertPayload = addAlertMock.mock.calls[0][0];
    expect(alertPayload.type).toBe('post_consent_violation');
    expect(alertPayload.trackerCount).toBe(1);
    expect(alertPayload.blockedTrackers).toEqual(['tracker.example']);
    expect(broadcastMock).toHaveBeenCalledWith('STATE_UPDATE');
    expect(emitMock).toHaveBeenCalledWith('POST_CONSENT_VIOLATION', {
      domain: 'example.com',
      trackerCount: 1,
      trackers: ['tracker.example'],
    });
  });

  it('aggregates multiple trackers into a single violation alert', async () => {
    FirewallEngine.setConsentRejectionProvider(() => ({
      timestamp: Date.now(),
      tabId: 999,
    }));

    await FirewallEngine.handleBlockedRequest('https://tracker-one.com/a.js', 1);
    await FirewallEngine.handleBlockedRequest('https://tracker-two.com/b.js', 1);

    await vi.advanceTimersByTimeAsync(CONSENT_VIOLATION.AGGREGATION_DELAY_MS + 10);

    expect(addAlertMock).toHaveBeenCalledTimes(1);
    const alertPayload = addAlertMock.mock.calls[0][0];
    expect(alertPayload.trackerCount).toBe(2);
    expect(alertPayload.blockedTrackers).toEqual(expect.arrayContaining(['tracker-one.com', 'tracker-two.com']));
  });
});
