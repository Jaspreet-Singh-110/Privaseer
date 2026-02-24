import type {
  ConsentScanResultV2,
  PrivacyRules,
  DeceptivePatternViolation,
  ScanConfidence,
  CMPDetectionResult,
} from '../types';
import { logger } from '../utils/logger';
import { toError } from '../utils/type-guards';
import { sanitizeUrl } from '../utils/sanitizer';
import { SCANNER, CONSENT_BANNER, SCAN_PHASES } from '../utils/constants';
import { detectCMP, hasValidPersistedConsent } from '../utils/cmp-detector';
import { calculateConfidence } from '../utils/scan-confidence';
import { detectPageLanguage, getLocalizedPatterns, matchesAnyPattern } from '../utils/i18n-patterns';

class ConsentScanner {
  private rules: PrivacyRules | null = null;
  private scanTimeout: NodeJS.Timeout | null = null;
  private bannerScanHistory = new Map<string, { confidence: number; phase: 'quick' | 'interaction' | 'delayed' }>();
  private scanTimers = new Map<'quick' | 'interaction' | 'delayed', number>();

  async initialize(): Promise<void> {
    try {
      const response = await fetch(chrome.runtime.getURL('data/privacy-rules.json'));
      this.rules = await response.json();

      this.scheduleScans();

      const observer = new MutationObserver(() => {
        if (this.scanTimeout) {
          clearTimeout(this.scanTimeout);
        }
        this.scanTimeout = setTimeout(() => this.scheduleScans(), SCANNER.MUTATION_DEBOUNCE_MS);
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
      
      // Stryker disable next-line all: logging only
      logger.debug('ConsentScanner', 'Initialized successfully', { url: sanitizeUrl(window.location.href) });
    } catch (error) {
      logger.error('ConsentScanner', 'Failed to initialize consent scanner', toError(error));
    }
  }

  private scheduleScans(): void {
    this.clearScanTimers();
    this.scheduleScanPhase('quick', SCAN_PHASES.QUICK_DELAY_MS);
    this.scheduleScanPhase('interaction', SCAN_PHASES.INTERACTION_DELAY_MS);
    this.scheduleScanPhase('delayed', SCAN_PHASES.DELAYED_DELAY_MS);
  }

  private clearScanTimers(): void {
    for (const timer of this.scanTimers.values()) {
      clearTimeout(timer);
    }
    this.scanTimers.clear();
  }

  private scheduleScanPhase(phase: 'quick' | 'interaction' | 'delayed', delayMs: number): void {
    const timer = setTimeout(() => void this.scanPage(phase), delayMs) as unknown as number;
    this.scanTimers.set(phase, timer);
  }

  async scanPage(phase: 'quick' | 'interaction' | 'delayed'): Promise<void> {
    if (!this.rules || !document.body) return;

    try {
      const pageLanguage = detectPageLanguage();
      const localizedPatterns = getLocalizedPatterns(pageLanguage);
      const cmpDetection = await detectCMP();
      const hasPersistedConsent = hasValidPersistedConsent(cmpDetection);

      if (hasPersistedConsent && cmpDetection.consentStatus !== 'unknown') {
        logger.info('ConsentScanner', 'Valid persisted consent detected, skipping compliance check', {
          domain: window.location.hostname,
          cmpType: cmpDetection.cmpType,
          consentStatus: cmpDetection.consentStatus,
          confidenceScore: cmpDetection.confidenceScore,
        });

        const confidence = this.buildPersistedConsentConfidence(cmpDetection);
        const result: ConsentScanResultV2 = {
          url: sanitizeUrl(window.location.href) || '',
          hasBanner: false,
          hasRejectButton: true,
          isCompliant: true,
          deceptivePatterns: [],
          timestamp: Date.now(),
          cmpDetection,
          hasPersistedConsent: true,
          confidence,
          pageLanguage,
          scanPhase: phase,
        };

        try {
          await this.sendMessageWithRetry({
            type: 'CONSENT_SCAN_RESULT',
            data: result,
          });
        } catch {
          // Stryker disable next-line all: logging only
          logger.debug('ConsentScanner', 'Service worker not ready, skipping message');
        }

        return;
      }

      const banner = this.findCookieBanner();

      if (!banner) {
        if (cmpDetection.detected && cmpDetection.cookieNames.length > 0) {
          // Stryker disable next-line all: logging only
          logger.debug('ConsentScanner', 'CMP cookies found but no banner visible (likely already dismissed)', {
            domain: window.location.hostname,
            cmpType: cmpDetection.cmpType,
          });
        }
        return;
      }

      const bannerText = banner.textContent?.substring(0, 100) || '';
      const bannerIdentifier = `${window.location.hostname}-${bannerText}`;

      const acceptButtons = this.findButtonsByPatterns(banner, localizedPatterns.accept);
      const rejectButtons = this.findButtonsByPatterns(banner, localizedPatterns.reject);
      const preferenceButtons = this.findButtonsByPatterns(banner, localizedPatterns.preferences);

      const hasRejectButton = rejectButtons.length > 0;
      const isCompliant = this.checkCompliance(hasRejectButton, acceptButtons, rejectButtons);
      const deceptivePatterns = this.detectDeceptivePatterns(
        banner,
        hasRejectButton,
        acceptButtons,
        rejectButtons
      );
      const violations = this.getViolationDetails(deceptivePatterns);
      const complianceScore = this.calculateComplianceScore(violations);
      const confidence = this.calculateScanConfidence(banner, {
        acceptButtons,
        rejectButtons,
        preferenceButtons,
        cmpDetection,
      });

      const previousScan = this.bannerScanHistory.get(bannerIdentifier);
      if (previousScan && previousScan.confidence >= confidence.overall) {
        return;
      }
      this.bannerScanHistory.set(bannerIdentifier, { confidence: confidence.overall, phase });

      if (!confidence.shouldAlert) {
        // Stryker disable next-line all: logging only
        logger.debug('ConsentScanner', 'Low confidence scan, skipping alert', {
          domain: window.location.hostname,
          confidence: confidence.overall,
          phase,
        });
        return;
      }

      const result: ConsentScanResultV2 = {
        url: sanitizeUrl(window.location.href) || '',
        hasBanner: true,
        hasRejectButton,
        isCompliant,
        deceptivePatterns,
        violations,
        complianceScore,
        timestamp: Date.now(),
        cmpDetection,
        hasPersistedConsent: false,
        confidence,
        pageLanguage,
        scanPhase: phase,
      };

      try{
        await this.sendMessageWithRetry({
          type: 'CONSENT_SCAN_RESULT',
          data: result,
        });

        await this.sendMessageWithRetry({
          type: 'RECORD_COMPLIANCE_SCORE',
          data: { score: complianceScore },
        });

        if (!result.isCompliant) {
          logger.warn('ConsentScanner', 'Non-compliant cookie banner detected', {
            url: sanitizeUrl(window.location.href),
            hasRejectButton: result.hasRejectButton,
            complianceScore: result.complianceScore,
            violations: result.violations?.map(v => ({
              id: v.id,
              severity: v.severity,
              penalty: v.penalty,
            })),
            cmpType: cmpDetection.cmpType,
          });
        } else {
          logger.info('ConsentScanner', 'Compliant cookie banner detected', {
            url: sanitizeUrl(window.location.href),
            complianceScore: result.complianceScore,
            cmpType: cmpDetection.cmpType,
          });
        }
      } catch {
        // Stryker disable next-line all: logging only
        logger.debug('ConsentScanner', 'Service worker not ready, skipping message');
      }
    } catch (error) {
      logger.error('ConsentScanner', 'Error scanning page', toError(error));
    }
  }

  private async sendMessageWithRetry<T>(
    message: { type: string; data?: unknown },
    maxRetries = 2
  ): Promise<T> {
    let retries = 0;

    while (retries <= maxRetries) {
      try {
        const response = await chrome.runtime.sendMessage(message);
        return response as T;
      } catch (err) {
        const error = toError(err);
        if (error.message.includes('Receiving end does not exist') && retries < maxRetries) {
          retries += 1;
          await new Promise((resolve) => setTimeout(resolve, 500));
        } else {
          throw error;
        }
      }
    }

    throw new Error('Failed to send message after max retries');
  }

  private buildPersistedConsentConfidence(cmpDetection: CMPDetectionResult): ScanConfidence {
    return calculateConfidence({
      bannerSignals: {
        hasKeywordMatch: false,
        hasButtons: false,
        isViewportEdge: false,
        isOverlay: false,
        matchesCmpSelector: false,
      },
      buttonSignals: {
        hasAccept: false,
        hasReject: false,
        hasPreferences: false,
        acceptRejectSimilar: false,
      },
      cmpSignals: {
        detected: cmpDetection.detected,
        detectionMethod: cmpDetection.detectionMethod ?? 'none',
        confidenceScore: cmpDetection.confidenceScore ?? 0,
      },
      contextSignals: {
        firstVisit: false,
        isDialogRole: false,
        isModal: false,
        textDensity: 'high',
      },
    });
  }

  private calculateScanConfidence(
    banner: Element,
    context: {
      acceptButtons: Element[];
      rejectButtons: Element[];
      preferenceButtons: Element[];
      cmpDetection: CMPDetectionResult;
    }
  ): ScanConfidence {
    const bannerText = this.getElementText(banner);
    const bannerRect = banner.getBoundingClientRect();
    const hasKeywordMatch = this.containsConsentKeywords(bannerText);
    const hasButtons =
      context.acceptButtons.length > 0 ||
      context.rejectButtons.length > 0 ||
      context.preferenceButtons.length > 0;
    const isViewportEdge = this.isViewportEdge(bannerRect);
    const isOverlay = this.isOverlay(banner);
    const matchesCmpSelector =
      this.rules?.cookieBannerSelectors.some((selector) => {
        try {
          return banner.matches(selector);
        } catch {
          return false;
        }
      }) ?? false;

    const acceptRejectSimilar = this.acceptRejectSimilar(context.acceptButtons, context.rejectButtons);
    const textDensity = bannerText.length < 600 ? 'low' : bannerText.length < 1500 ? 'medium' : 'high';

    return calculateConfidence({
      bannerSignals: {
        hasKeywordMatch,
        hasButtons,
        isViewportEdge,
        isOverlay,
        matchesCmpSelector,
      },
      buttonSignals: {
        hasAccept: context.acceptButtons.length > 0,
        hasReject: context.rejectButtons.length > 0,
        hasPreferences: context.preferenceButtons.length > 0,
        acceptRejectSimilar,
      },
      cmpSignals: {
        detected: context.cmpDetection.detected,
        detectionMethod: context.cmpDetection.detectionMethod ?? 'none',
        confidenceScore: context.cmpDetection.confidenceScore ?? 0,
      },
      contextSignals: {
        firstVisit: document.referrer.length === 0,
        isDialogRole: banner.getAttribute('role')?.toLowerCase().includes('dialog') ?? false,
        isModal: isOverlay,
        textDensity,
      },
    });
  }

  private containsConsentKeywords(text: string): boolean {
    const normalized = text.toLowerCase();
    return (
      normalized.includes('cookie') ||
      normalized.includes('consent') ||
      normalized.includes('privacy') ||
      normalized.includes('tracking') ||
      normalized.includes('gdpr')
    );
  }

  private isViewportEdge(rect: DOMRect): boolean {
    const edgeThreshold = 80;
    return (
      rect.top <= edgeThreshold ||
      rect.bottom >= window.innerHeight - edgeThreshold ||
      rect.left <= edgeThreshold ||
      rect.right >= window.innerWidth - edgeThreshold
    );
  }

  private isOverlay(element: Element): boolean {
    const style = window.getComputedStyle(element);
    const zIndex = parseInt(style.zIndex || '0', 10);
    return (
      style.position === 'fixed' ||
      style.position === 'sticky' ||
      zIndex >= 1000
    );
  }

  private getElementText(element: Element): string {
    return (element.textContent || '').trim();
  }

  private findButtonsByPatterns(banner: Element, patterns: string[]): Element[] {
    const buttons = banner.querySelectorAll('button, a, [role="button"]');
    const matches: Element[] = [];

    for (const button of buttons) {
      const text = this.getButtonText(button);
      if (matchesAnyPattern(text, patterns)) {
        if (this.isVisible(button)) {
          matches.push(button);
        }
      }
    }

    return matches;
  }

  private getButtonText(button: Element): string {
    const text = (button.textContent || '').trim();
    const ariaLabel = button.getAttribute('aria-label')?.trim() || '';
    return `${text} ${ariaLabel}`.trim();
  }

  private acceptRejectSimilar(acceptButtons: Element[], rejectButtons: Element[]): boolean {
    if (acceptButtons.length === 0 || rejectButtons.length === 0) {
      return false;
    }

    const acceptRect = acceptButtons[0].getBoundingClientRect();
    const rejectRect = rejectButtons[0].getBoundingClientRect();
    const acceptArea = acceptRect.width * acceptRect.height;
    const rejectArea = rejectRect.width * rejectRect.height;
    const areaRatio = acceptArea / Math.max(1, rejectArea);

    const acceptStyle = window.getComputedStyle(acceptButtons[0]);
    const rejectStyle = window.getComputedStyle(rejectButtons[0]);
    const fontRatio =
      parseFloat(acceptStyle.fontSize) / Math.max(1, parseFloat(rejectStyle.fontSize));

    return areaRatio <= CONSENT_BANNER.BUTTON_SIZE_PROMINENCE_THRESHOLD && fontRatio <= CONSENT_BANNER.FONT_SIZE_PROMINENCE_THRESHOLD;
  }
  private findCookieBanner(): Element | null {
    if (!this.rules) return null;

    for (const selector of this.rules.cookieBannerSelectors) {
      try {
        const element = document.querySelector(selector);
        if (element && this.isVisible(element)) {
          return element;
        }
      } catch {
        continue;
      }
    }

    const allElements = document.querySelectorAll('div, section, aside');
    for (const element of allElements) {
      const text = this.getElementText(element);
      if (
        this.containsConsentKeywords(text) &&
        text.length < CONSENT_BANNER.MAX_TEXT_LENGTH &&
        this.isVisible(element)
      ) {
        return element;
      }
    }

    return null;
  }

  private checkCompliance(
    hasRejectButton: boolean,
    acceptButtons: Element[] = [],
    rejectButtons: Element[] = []
  ): boolean {
    if (!this.rules) return true;

    if (!hasRejectButton) {
      return false;
    }

    if (acceptButtons.length > 0 && rejectButtons.length > 0) {
      const acceptButton = acceptButtons[0];
      const rejectButton = rejectButtons[0];

      const acceptRect = acceptButton.getBoundingClientRect();
      const rejectRect = rejectButton.getBoundingClientRect();

      const acceptArea = acceptRect.width * acceptRect.height;
      const rejectArea = rejectRect.width * rejectRect.height;

      if (acceptArea > rejectArea * CONSENT_BANNER.BUTTON_SIZE_PROMINENCE_THRESHOLD) {
        return false;
      }
    }

    return true;
  }

  private detectDeceptivePatterns(
    banner: Element,
    hasRejectButton: boolean,
    acceptButtons: Element[] = [],
    rejectButtons: Element[] = []
  ): string[] {
    const patterns: string[] = [];

    if (!hasRejectButton) {
      patterns.push('forcedConsent');
      return patterns;
    }

    if (acceptButtons.length > 0 && rejectButtons.length > 0) {
      const acceptButton = acceptButtons[0];
      const rejectButton = rejectButtons[0];

      const acceptStyle = window.getComputedStyle(acceptButton);
      const rejectStyle = window.getComputedStyle(rejectButton);
      const acceptRect = acceptButton.getBoundingClientRect();
      const rejectRect = rejectButton.getBoundingClientRect();

      if (window.scrollY === 0 && rejectRect.bottom > window.innerHeight) {
        patterns.push('hiddenRejectButton');
      }

      const acceptArea = acceptRect.width * acceptRect.height;
      const rejectArea = rejectRect.width * rejectRect.height;

      if (
        parseFloat(acceptStyle.fontSize) > parseFloat(rejectStyle.fontSize) * CONSENT_BANNER.FONT_SIZE_PROMINENCE_THRESHOLD ||
        acceptArea > rejectArea * CONSENT_BANNER.BUTTON_SIZE_PROMINENCE_THRESHOLD
      ) {
        patterns.push('acceptButtonProminence');
      }
    }

    const checkboxes = banner.querySelectorAll('input[type="checkbox"]');
    for (const checkbox of checkboxes) {
      if ((checkbox as HTMLInputElement).checked && !this.isNecessaryOnlyCheckbox(checkbox)) {
        patterns.push('preCheckedBoxes');
        break;
      }
    }

    return patterns;
  }

  private isNecessaryOnlyCheckbox(checkbox: Element): boolean {
    const ariaLabel = checkbox.getAttribute('aria-label') || '';
    const label = checkbox.closest('label')?.textContent || '';
    const combined = `${ariaLabel} ${label}`.toLowerCase();
    return combined.includes('necessary') || combined.includes('essential') || combined.includes('required');
  }

  private getViolationDetails(patternIds: string[]): DeceptivePatternViolation[] {
    if (!this.rules) return [];

    const violations: DeceptivePatternViolation[] = [];
    const patternMap = new Map(this.rules.deceptivePatterns.map(p => [p.id, p]));

    for (const id of patternIds) {
      const rule = patternMap.get(id);
      if (rule) {
        violations.push({
          id: rule.id,
          name: rule.name,
          description: rule.description,
          severity: rule.severity,
          penalty: rule.penalty,
        });
      }
    }

    return violations;
  }

  private calculateComplianceScore(violations: DeceptivePatternViolation[]): number {
    const totalPenalty = violations.reduce((sum, v) => sum + v.penalty, 0);
    const score = Math.max(0, 100 - totalPenalty);
    return score;
  }


  private isVisible(element: Element): boolean {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }

    return true;
  }

  /**
   * Resets scanner state for testing purposes.
   * Clears scanned banners and cancels pending scans.
   */
  reset(): void {
    this.bannerScanHistory.clear();
    this.clearScanTimers();
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = null;
    }
    this.rules = null;
  }
}

export const scanner = new ConsentScanner();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => scanner.initialize());
} else {
  scanner.initialize();
}
