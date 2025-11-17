import { Storage } from './storage';
import { logger } from '../utils/logger';
import { backgroundEvents } from './event-emitter';
import { toError } from '../utils/type-guards';
import { BADGE, TIME, PRIVACY_SCORE } from '../utils/constants';
import { shouldPenalizeTracker } from '../utils/consent-validator';

export class PrivacyScoreManager {
  private static listenersSetup = false;
  private static readonly TRACKER_PENALTY = PRIVACY_SCORE.TRACKER_PENALTY;
  private static readonly CLEAN_SITE_REWARD = PRIVACY_SCORE.CLEAN_SITE_REWARD;
  private static readonly NON_COMPLIANT_PENALTY = PRIVACY_SCORE.NON_COMPLIANT_PENALTY;
  private static readonly COOLDOWN_MS = TIME.ONE_DAY_MS;
  private static readonly CLEANUP_THRESHOLD = TIME.ONE_WEEK_MS;

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

      logger.debug('PrivacyScore', 'Applying penalty', {
        domain,
        reason: validationResult.reason,
        riskWeight,
      });

      // Apply penalty and remember
      this.penalizedDomains.set(domain, now);
      // Persist to storage so it survives service worker restarts
      await Storage.savePenalizedDomains(Object.fromEntries(this.penalizedDomains));

      const data = await Storage.get();
      const oldScore = data.privacyScore.current;
      // Apply risk-weighted penalty (e.g., fingerprinting = -5, analytics = -1)
      const penalty = this.TRACKER_PENALTY * riskWeight;
      const newScore = oldScore + penalty;

      // Emit score update event
      backgroundEvents.emit('SCORE_UPDATED', {
        oldScore,
        newScore,
        reason: `Tracker blocked: ${domain} (weight: ${riskWeight})`,
      });

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
      const newScore = oldScore + this.CLEAN_SITE_REWARD;

      // Emit score update event
      backgroundEvents.emit('SCORE_UPDATED', {
        oldScore,
        newScore,
        reason: 'Clean site detected',
      });

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
      const newScore = oldScore + penalty;

      // Emit score update event
      backgroundEvents.emit('SCORE_UPDATED', {
        oldScore,
        newScore,
        reason: `Non-compliant cookie banner detected (severity: ${severityMultiplier}x)`,
      });

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
}
