import { Storage } from './storage';
import { logger } from '../utils/logger';
import { backgroundEvents } from './event-emitter';
import { toError } from '../utils/type-guards';
import { BADGE, TIME, PRIVACY_SCORE } from '../utils/constants';
import { shouldPenalizeTracker } from '../utils/consent-validator';
import { calculateDecayedPenalty, calculateDecayFactor } from '../utils/penalty-decay';
import type { DailyMetricsSnapshot, StorageData, TrackerData } from '../types';

export class PrivacyScoreManager {
  private static listenersSetup = false;
  private static readonly TRACKER_PENALTY = PRIVACY_SCORE.TRACKER_PENALTY;
  private static readonly CLEAN_SITE_REWARD = PRIVACY_SCORE.CLEAN_SITE_REWARD;
  private static readonly NON_COMPLIANT_PENALTY = PRIVACY_SCORE.NON_COMPLIANT_PENALTY;
  private static readonly COOLDOWN_MS = TIME.ONE_DAY_MS;
  private static readonly CLEANUP_THRESHOLD = TIME.ONE_WEEK_MS;
  private static readonly HISTORY_LIMIT = 30;
  private static readonly SNAPSHOT_LIMIT = 30;

  // Track penalized domains with timestamps (domain -> timestamp)
  private static penalizedDomains = new Map<string, number>();

  static async initialize(): Promise<void> {
    // Load persisted penalties from storage
    const data = await Storage.get();

    if (data.penalizedDomains) {
      this.penalizedDomains = new Map(Object.entries(data.penalizedDomains));
    }

    if (!this.listenersSetup) {
      this.setupEventListeners();
      this.listenersSetup = true;
    }
  }

  private static setupEventListeners(): void {
    // Listen to tracker blocked events
    backgroundEvents.on('TRACKER_BLOCKED', async (data) => {
      await this.handleTrackerBlocked(
        data.domain,
        data.riskWeight,
        data.category,
        data.isHighRisk,
        data.url
      );
    });

    // Listen to clean site detected events
    backgroundEvents.on('CLEAN_SITE_DETECTED', async () => {
      await this.handleCleanSite();
    });

    // Listen to non-compliant site events
    backgroundEvents.on('NON_COMPLIANT_SITE', async (data) => {
      await this.handleNonCompliantSite(data.domain, data.severityMultiplier || 1.0);
    });
  }

  static async handleTrackerBlocked(
    domain: string,
    riskWeight: number = 1,
    category: string = 'unknown',
    isHighRisk: boolean = false,
    pageUrl?: string
  ): Promise<number> {
    try {
      const now = Date.now();
      const lastPenalty = this.penalizedDomains.get(domain);

      // Check if we penalized this domain recently (24 hours)
      if (lastPenalty && (now - lastPenalty) < this.COOLDOWN_MS) {
        return await this.getCurrentScore();
      }

      // Validate if tracker should be penalized based on consent
      const validationResult = await shouldPenalizeTracker(
        pageUrl || domain,
        category,
        isHighRisk
      );

      if (!validationResult.shouldPenalize) {
        logger.info('PrivacyScore', 'Skipping penalty due to consent', {
          domain,
          reason: validationResult.reason,
          consentStatus: validationResult.consentState?.consentStatus,
        });
        return await this.getCurrentScore();
      }

      // Get domain occurrence count and increment it
      const pageDomain = pageUrl ? new URL(pageUrl).hostname : domain;
      const occurrenceCount = await Storage.getDomainOccurrence(pageDomain);
      await Storage.incrementDomainOccurrence(pageDomain);

      // Calculate decay factor based on occurrence count
      const decayFactor = calculateDecayFactor(occurrenceCount);
      const decayedPenalty = calculateDecayedPenalty(riskWeight, occurrenceCount);

      logger.debug('PrivacyScore', 'Applying time-decayed penalty', {
        domain,
        pageDomain,
        reason: validationResult.reason,
        riskWeight,
        occurrenceCount,
        decayFactor: decayFactor.toFixed(3),
        decayedPenalty: decayedPenalty.toFixed(3),
      });

      // Apply penalty and remember
      this.penalizedDomains.set(domain, now);
      // Persist to storage so it survives service worker restarts
      await Storage.savePenalizedDomains(Object.fromEntries(this.penalizedDomains));

      const data = await Storage.get();
      const oldScore = data.privacyScore.current;
      // Apply time-decayed risk-weighted penalty
      const penalty = this.TRACKER_PENALTY * decayedPenalty;
      const unclampedNewScore = oldScore + penalty;

      const newScore = await this.updateScoreWithReason(
        oldScore,
        unclampedNewScore,
        `Tracker blocked: ${domain} (weight: ${riskWeight.toFixed(2)}, decay: ${(decayFactor * 100).toFixed(0)}%)`
      );

      // Cleanup old entries periodically (every 100 penalties)
      if (this.penalizedDomains.size % 100 === 0) {
        this.cleanupOldPenalties();
      }

      return newScore;
    } catch (error) {
      logger.error('PrivacyScore', 'Error handling tracker block', toError(error));
      return 100;
    }
  }

  private static cleanupOldPenalties(): void {
    const cutoff = Date.now() - this.CLEANUP_THRESHOLD;

    for (const [domain, timestamp] of this.penalizedDomains.entries()) {
      if (timestamp < cutoff) {
        this.penalizedDomains.delete(domain);
      }
    }
  }

  static resetPenaltyTracking(): void {
    this.penalizedDomains.clear();
  }

  static getPenalizedDomainCount(): number {
    return this.penalizedDomains.size;
  }

  static isDomainInCooldown(domain: string): boolean {
    const lastPenalty = this.penalizedDomains.get(domain);
    if (!lastPenalty) return false;

    const now = Date.now();
    return (now - lastPenalty) < this.COOLDOWN_MS;
  }

  static async handleCleanSite(): Promise<number> {
    try {
      const data = await Storage.get();
      const oldScore = data.privacyScore.current;
      const newScore = await this.updateScoreWithReason(
        oldScore,
        oldScore + this.CLEAN_SITE_REWARD,
        'Clean site detected'
      );

      await Storage.recordCleanSite();
      return newScore;
    } catch (error) {
      logger.error('PrivacyScore', 'Error handling clean site', toError(error));
      return 100;
    }
  }

  static async handleNonCompliantSite(domain: string, severityMultiplier: number = 1.0): Promise<number> {
    try {
      const now = Date.now();
      const penaltyKey = `non-compliant:${domain}`;
      const lastPenalty = this.penalizedDomains.get(penaltyKey);

      // Check if we penalized this domain recently (24 hours)
      if (lastPenalty && (now - lastPenalty) < this.COOLDOWN_MS) {
        return await this.getCurrentScore();
      }

      // Apply penalty and remember
      this.penalizedDomains.set(penaltyKey, now);
      await Storage.savePenalizedDomains(Object.fromEntries(this.penalizedDomains));

      const data = await Storage.get();
      const oldScore = data.privacyScore.current;
      const penalty = this.NON_COMPLIANT_PENALTY * severityMultiplier;
      const newScore = await this.updateScoreWithReason(
        oldScore,
        oldScore + penalty,
        `Non-compliant cookie banner detected (severity: ${severityMultiplier}x)`
      );

      await Storage.recordNonCompliantSite();
      return newScore;
    } catch (error) {
      logger.error('PrivacyScore', 'Error handling non-compliant site', toError(error));
      return 100;
    }
  }

  static async getCurrentScore(): Promise<number> {
    try {
      const data = await Storage.get();
      return data.privacyScore.current;
    } catch (error) {
      logger.error('PrivacyScore', 'Error getting current score', toError(error));
      return 100;
    }
  }

  static getScoreColor(score: number): string {
    if (score >= 80) return '#10B981';
    if (score >= 60) return '#F59E0B';
    return BADGE.BACKGROUND_COLOR;
  }

  static getScoreLabel(score: number): string {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Poor';
  }

  static async recalculateFromTrackers(): Promise<number> {
    const data = await Storage.get();
    const trackers = Object.values(data.trackers || {}) as TrackerData[];

    const totalPenaltyMagnitude = trackers.reduce((sum, tracker) => {
      const riskMultiplier = tracker.isHighRisk ? 2 : 1;
      return sum + Math.abs(this.TRACKER_PENALTY) * riskMultiplier * tracker.blockedCount;
    }, 0);

    const oldScore = data.privacyScore.current;
    const recalculatedScore = PRIVACY_SCORE.MAX - totalPenaltyMagnitude;

    return this.updateScoreWithReason(
      oldScore,
      recalculatedScore,
      'Recalculated from tracker history'
    );
  }

  static async addHistoryEntry(date: string, score: number, trackersBlocked: number): Promise<void> {
    const data = await Storage.get();
    const history = data.privacyScore.history || [];

    history.unshift({ date, score, trackersBlocked });
    data.privacyScore.history = history.slice(0, this.HISTORY_LIMIT);

    await Storage.save(data);
  }

  static async createDailySnapshot(): Promise<void> {
    const data = await Storage.get();
    const snapshot = this.buildDailySnapshot(data);

    if (!data.dailySnapshots) {
      data.dailySnapshots = [];
    }

    data.dailySnapshots.unshift(snapshot);
    data.dailySnapshots = data.dailySnapshots.slice(0, this.SNAPSHOT_LIMIT);

    await Storage.save(data);
  }

  private static buildDailySnapshot(data: StorageData): DailyMetricsSnapshot {
    const trackersByCategory: Record<string, number> = {};

    for (const tracker of Object.values(data.trackers || {})) {
      const { category, blockedCount } = tracker as TrackerData;
      trackersByCategory[category] = (trackersByCategory[category] || 0) + blockedCount;
    }

    const snapshotDate = new Date(data.lastReset || Date.now()).toISOString().split('T')[0];

    return {
      date: snapshotDate,
      privacyScore: data.privacyScore.current,
      trackersBlocked: data.privacyScore.daily.trackersBlocked,
      trackersByCategory,
      cleanSitesVisited: data.privacyScore.daily.cleanSitesVisited,
      nonCompliantSites: data.privacyScore.daily.nonCompliantSites,
      complianceScores: data.complianceScores || [],
      burnerEmailsGenerated: data.burnerEmailStats?.generated ?? 0,
      burnerEmailsForwarded: data.burnerEmailStats?.forwarded ?? 0,
    };
  }

  private static clampScore(score: number): number {
    return Math.max(PRIVACY_SCORE.MIN, Math.min(PRIVACY_SCORE.MAX, score));
  }

  private static async updateScoreWithReason(
    oldScore: number,
    newScore: number,
    reason: string
  ): Promise<number> {
    const clampedScore = this.clampScore(newScore);

    backgroundEvents.emit('SCORE_UPDATED', {
      oldScore,
      newScore: clampedScore,
      reason,
    });

    await Storage.updateScore(clampedScore);

    return clampedScore;
  }
}
