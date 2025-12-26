import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrivacyScoreManager } from '@/background/privacy-score';
import { PRIVACY_SCORE, TIME } from '@/utils/constants';
import type { StorageData, DailyMetricsSnapshot } from '@/types';

const emitMock = vi.hoisted(() => vi.fn());
const onMock = vi.hoisted(() => vi.fn());

const shouldPenalizeMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ shouldPenalize: true, reason: 'allowed' })
);

let storageData: StorageData;
let occurrenceCount = 0;

const getMock = vi.hoisted(() => vi.fn(async () => storageData));
const saveMock = vi.hoisted(() =>
  vi.fn(async (data: StorageData) => {
    storageData = data;
    return data;
  })
);
const savePenalizedDomainsMock = vi.hoisted(() =>
  vi.fn(async (penalizedDomains: Record<string, number>) => {
    storageData.penalizedDomains = penalizedDomains;
    return penalizedDomains;
  })
);
const getDomainOccurrenceMock = vi.hoisted(() =>
  vi.fn(async () => occurrenceCount)
);
const incrementDomainOccurrenceMock = vi.hoisted(() =>
  vi.fn(async () => {
    occurrenceCount += 1;
    storageData.domainOccurrences['example.com'] = occurrenceCount;
    return occurrenceCount;
  })
);
const recordCleanSiteMock = vi.hoisted(() => vi.fn());
const recordNonCompliantSiteMock = vi.hoisted(() => vi.fn());
const updateScoreMock = vi.hoisted(() =>
  vi.fn(async (score: number) => {
    storageData.privacyScore.current = Math.max(0, Math.min(100, score));
    return storageData.privacyScore.current;
  })
);

vi.mock('@/background/event-emitter', () => ({
  backgroundEvents: {
    emit: emitMock,
    on: onMock,
  },
}));

vi.mock('@/utils/consent-validator', () => ({
  shouldPenalizeTracker: shouldPenalizeMock,
}));

vi.mock('@/background/storage', () => ({
  Storage: {
    get: getMock,
    save: saveMock,
    savePenalizedDomains: savePenalizedDomainsMock,
    getDomainOccurrence: getDomainOccurrenceMock,
    incrementDomainOccurrence: incrementDomainOccurrenceMock,
    recordCleanSite: recordCleanSiteMock,
    recordNonCompliantSite: recordNonCompliantSiteMock,
    updateScore: updateScoreMock,
  },
}));

function createStorageData(): StorageData {
  return {
    privacyScore: {
      current: PRIVACY_SCORE.MAX,
      daily: {
        trackersBlocked: 0,
        cleanSitesVisited: 0,
        nonCompliantSites: 0,
      },
      history: [],
    },
    alerts: [],
    trackers: {},
    settings: {
      protectionEnabled: true,
      showNotifications: true,
      theme: 'system',
      burnerEmailEnabled: false,
      telemetryEnabled: false,
    },
    lastReset: Date.now() - TIME.ONE_DAY_MS,
    penalizedDomains: {},
    consentStates: {},
    domainOccurrences: {},
    dailySnapshots: [],
    burnerEmailStats: { generated: 0, forwarded: 0 },
    complianceScores: [],
    onboarding: { hasCompletedOnboarding: false, currentStep: 0 },
  };
}

describe('PrivacyScoreManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageData = createStorageData();
    occurrenceCount = 0;
    PrivacyScoreManager.resetPenaltyTracking();
  });

  it('calculates score from tracker data', async () => {
    storageData.trackers = {
      'a.com': { domain: 'a.com', category: 'ads', isHighRisk: false, blockedCount: 3, lastBlocked: Date.now() },
      'b.com': { domain: 'b.com', category: 'analytics', isHighRisk: true, blockedCount: 2, lastBlocked: Date.now() },
    };

    const score = await PrivacyScoreManager.recalculateFromTrackers();

    expect(score).toBe(93);
    expect(updateScoreMock).toHaveBeenCalledWith(93);
    expect(emitMock).toHaveBeenCalledWith(
      'SCORE_UPDATED',
      expect.objectContaining({ newScore: 93, reason: expect.stringContaining('Recalculated') })
    );
  });

  it('applies tracker penalty and saves cooldown entry', async () => {
    const score = await PrivacyScoreManager.handleTrackerBlocked(
      'example.com',
      1,
      'ads',
      false,
      'https://example.com'
    );

    expect(score).toBe(99);
    expect(savePenalizedDomainsMock).toHaveBeenCalled();
    expect(updateScoreMock).toHaveBeenCalledWith(99);
    expect(emitMock).toHaveBeenCalledWith(
      'SCORE_UPDATED',
      expect.objectContaining({ newScore: 99, reason: expect.stringContaining('Tracker blocked') })
    );
    expect(occurrenceCount).toBe(1);
  });

  it('applies time-decayed penalty for repeated domain', async () => {
    const firstScore = await PrivacyScoreManager.handleTrackerBlocked('example.com', 1, 'ads', false);
    PrivacyScoreManager.resetPenaltyTracking();
    const secondScore = await PrivacyScoreManager.handleTrackerBlocked('example.com', 1, 'ads', false);

    expect(firstScore).toBeCloseTo(99);
    expect(secondScore).toBeCloseTo(98.5);
    expect(updateScoreMock).toHaveBeenNthCalledWith(1, expect.closeTo(99));
    expect(updateScoreMock).toHaveBeenNthCalledWith(2, expect.closeTo(98.5));
  });

  it('applies non-compliant site penalty with multiplier', async () => {
    storageData.privacyScore.current = 90;

    const score = await PrivacyScoreManager.handleNonCompliantSite('bad.com', 2);

    expect(score).toBe(80);
    expect(updateScoreMock).toHaveBeenCalledWith(80);
    expect(savePenalizedDomainsMock).toHaveBeenCalledWith(
      expect.objectContaining({ 'non-compliant:bad.com': expect.any(Number) })
    );
    expect(recordNonCompliantSiteMock).toHaveBeenCalled();
  });

  it('caps history at 30 entries', async () => {
    const totalEntries = 35;
    for (let i = 0; i < totalEntries; i++) {
      await PrivacyScoreManager.addHistoryEntry(
        `2024-01-${i.toString().padStart(2, '0')}`,
        PRIVACY_SCORE.MAX - i,
        i
      );
    }

    expect(storageData.privacyScore.history).toHaveLength(30);
    expect(storageData.privacyScore.history[0].date).toBe('2024-01-34');
    expect(storageData.privacyScore.history[29].date).toBe('2024-01-05');
  });

  it('creates daily snapshot with category breakdown and enforces limit', async () => {
    storageData.trackers = {
      'ads.com': { domain: 'ads.com', category: 'ads', isHighRisk: false, blockedCount: 3, lastBlocked: Date.now() },
      'analytics.com': { domain: 'analytics.com', category: 'analytics', isHighRisk: false, blockedCount: 1, lastBlocked: Date.now() },
    };
    storageData.privacyScore.daily = { trackersBlocked: 4, cleanSitesVisited: 2, nonCompliantSites: 1 };
    storageData.dailySnapshots = Array.from({ length: 30 }, (_, idx) => ({
      date: `2024-01-${idx}`,
      privacyScore: 50,
      trackersBlocked: 0,
      trackersByCategory: {},
      cleanSitesVisited: 0,
      nonCompliantSites: 0,
      complianceScores: [],
      burnerEmailsGenerated: 0,
      burnerEmailsForwarded: 0,
    })) as DailyMetricsSnapshot[];
    storageData.lastReset = new Date('2024-05-20T00:00:00Z').getTime();

    await PrivacyScoreManager.createDailySnapshot();

    expect(storageData.dailySnapshots).toHaveLength(30);
    const snapshot = storageData.dailySnapshots[0];
    expect(snapshot.date).toBe('2024-05-20');
    expect(snapshot.trackersBlocked).toBe(4);
    expect(snapshot.trackersByCategory).toMatchObject({ ads: 3, analytics: 1 });
    expect(snapshot.cleanSitesVisited).toBe(2);
    expect(snapshot.nonCompliantSites).toBe(1);
  });

  it('clamps scores to min and max for edge cases', async () => {
    storageData.privacyScore.current = 2;
    const lowScore = await PrivacyScoreManager.handleNonCompliantSite('worst.com', 50);
    expect(lowScore).toBe(0);

    storageData.privacyScore.current = 99;
    const highScore = await PrivacyScoreManager.handleCleanSite();
    expect(highScore).toBe(100);

    expect(updateScoreMock).toHaveBeenCalledWith(0);
    expect(updateScoreMock).toHaveBeenCalledWith(100);
  });
});

