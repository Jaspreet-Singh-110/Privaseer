import type { ConsentScanResult, PrivacyRules, CMPDetectionResult, DeceptivePatternViolation } from '../types';
import { logger } from '../utils/logger';
import { toError } from '../utils/type-guards';
import { sanitizeUrl } from '../utils/sanitizer';
import { SCANNER, CONSENT_BANNER } from '../utils/constants';
import { detectCMP, hasValidPersistedConsent } from '../utils/cmp-detector';

class ConsentScanner {
  private rules: PrivacyRules | null = null;
  private scanTimeout: NodeJS.Timeout | null = null;
  private hasScanned: boolean = false;
  private scannedBanners: Set<string> = new Set();

  async initialize(): Promise<void> {
    try {
      const response = await fetch(chrome.runtime.getURL('data/privacy-rules.json'));
      this.rules = await response.json();

      this.scanTimeout = setTimeout(() => this.scanPage(), SCANNER.INITIAL_SCAN_DELAY_MS);

      const observer = new MutationObserver(() => {
        if (this.scanTimeout) {
          clearTimeout(this.scanTimeout);
        }
        this.scanTimeout = setTimeout(() => this.scanPage(), SCANNER.MUTATION_DEBOUNCE_MS);
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
      
      logger.debug('ConsentScanner', 'Initialized successfully', { url: sanitizeUrl(window.location.href) });
    } catch (error) {
      logger.error('ConsentScanner', 'Failed to initialize consent scanner', toError(error));
    }
  }

  private async scanPage(): Promise<void> {
    if (!this.rules || !document.body) return;

    try {
      const cmpDetection = await detectCMP();
      const hasPersistedConsent = hasValidPersistedConsent(cmpDetection);

      if (hasPersistedConsent && cmpDetection.consentStatus !== 'unknown') {
        logger.info('ConsentScanner', 'Valid persisted consent detected, skipping compliance check', {
          domain: window.location.hostname,
          cmpType: cmpDetection.cmpType,
          consentStatus: cmpDetection.consentStatus,
          confidenceScore: cmpDetection.confidenceScore,
        });

        const result: ConsentScanResult = {
          url: sanitizeUrl(window.location.href) || '',
          hasBanner: false,
          hasRejectButton: true,
          isCompliant: true,
          deceptivePatterns: [],
          timestamp: Date.now(),
          cmpDetection,
          hasPersistedConsent: true,
        };

        try {
          await chrome.runtime.sendMessage({
            type: 'CONSENT_SCAN_RESULT',
            data: result,
          });
        } catch (error) {
          logger.debug('ConsentScanner', 'Service worker not ready, skipping message');
        }

        return;
      }

      const banner = this.findCookieBanner();

      if (!banner) {
        if (cmpDetection.detected && cmpDetection.cookieNames.length > 0) {
          logger.debug('ConsentScanner', 'CMP cookies found but no banner visible (likely already dismissed)', {
            domain: window.location.hostname,
            cmpType: cmpDetection.cmpType,
          });
        }
        return;
      }

      const bannerText = banner.textContent?.substring(0, 100) || '';
      const bannerIdentifier = `${window.location.hostname}-${bannerText}`;

      if (this.scannedBanners.has(bannerIdentifier)) {
        return;
      }

      this.scannedBanners.add(bannerIdentifier);

      const hasRejectButton = this.findRejectButton(banner);
      const isCompliant = this.checkCompliance(banner, hasRejectButton);
      const deceptivePatterns = this.detectDeceptivePatterns(banner, hasRejectButton);
      const violations = this.getViolationDetails(deceptivePatterns);
      const complianceScore = this.calculateComplianceScore(violations);

      const result: ConsentScanResult = {
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
      };

      try {
        await chrome.runtime.sendMessage({
          type: 'CONSENT_SCAN_RESULT',
          data: result,
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
      } catch (error) {
        logger.debug('ConsentScanner', 'Service worker not ready, skipping message');
      }
    } catch (error) {
      logger.error('ConsentScanner', 'Error scanning page', toError(error));
    }
  }

  private findCookieBanner(): Element | null {
    if (!this.rules) return null;

    for (const selector of this.rules.cookieBannerSelectors) {
      try {
        const element = document.querySelector(selector);
        if (element && this.isVisible(element)) {
          return element;
        }
      } catch (error) {
        continue;
      }
    }

    const allElements = document.querySelectorAll('div, section, aside');
    for (const element of allElements) {
      const text = element.textContent?.toLowerCase() || '';
      if (
        (text.includes('cookie') || text.includes('privacy') || text.includes('consent')) &&
        text.length < CONSENT_BANNER.MAX_TEXT_LENGTH &&
        this.isVisible(element)
      ) {
        return element;
      }
    }

    return null;
  }

  private findRejectButton(banner: Element): boolean {
    if (!this.rules) return false;

    const buttons = banner.querySelectorAll('button, a, [role="button"]');

    for (const button of buttons) {
      const text = (button.textContent || '').toLowerCase().trim();
      const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';

      for (const pattern of this.rules.rejectButtonPatterns) {
        if (text.includes(pattern) || ariaLabel.includes(pattern)) {
          return this.isVisible(button);
        }
      }
    }

    return false;
  }

  private checkCompliance(banner: Element, hasRejectButton: boolean): boolean {
    if (!this.rules) return true;

    if (!hasRejectButton) {
      return false;
    }

    const acceptButtons = this.findAcceptButtons(banner);
    const rejectButtons = this.findRejectButtonElements(banner);

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

  private detectDeceptivePatterns(banner: Element, hasRejectButton: boolean): string[] {
    const patterns: string[] = [];

    if (!hasRejectButton) {
      patterns.push('forcedConsent');
      return patterns;
    }

    const acceptButtons = this.findAcceptButtons(banner);
    const rejectButtons = this.findRejectButtonElements(banner);

    if (acceptButtons.length > 0 && rejectButtons.length > 0) {
      const acceptButton = acceptButtons[0];
      const rejectButton = rejectButtons[0];

      const acceptStyle = window.getComputedStyle(acceptButton);
      const rejectStyle = window.getComputedStyle(rejectButton);
      const acceptRect = acceptButton.getBoundingClientRect();
      const rejectRect = rejectButton.getBoundingClientRect();

      if (rejectRect.bottom > window.innerHeight) {
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
      if ((checkbox as HTMLInputElement).checked) {
        patterns.push('preCheckedBoxes');
        break;
      }
    }

    return patterns;
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

  private findAcceptButtons(banner: Element): Element[] {
    if (!this.rules) return [];

    const buttons = banner.querySelectorAll('button, a, [role="button"]');
    const acceptButtons: Element[] = [];

    for (const button of buttons) {
      const text = (button.textContent || '').toLowerCase().trim();
      const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';

      for (const pattern of this.rules.acceptButtonPatterns) {
        if (text.includes(pattern) || ariaLabel.includes(pattern)) {
          acceptButtons.push(button);
          break;
        }
      }
    }

    return acceptButtons;
  }

  private findRejectButtonElements(banner: Element): Element[] {
    if (!this.rules) return [];

    const buttons = banner.querySelectorAll('button, a, [role="button"]');
    const rejectButtons: Element[] = [];

    for (const button of buttons) {
      const text = (button.textContent || '').toLowerCase().trim();
      const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';

      for (const pattern of this.rules.rejectButtonPatterns) {
        if (text.includes(pattern) || ariaLabel.includes(pattern)) {
          rejectButtons.push(button);
          break;
        }
      }
    }

    return rejectButtons;
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
}

const scanner = new ConsentScanner();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => scanner.initialize());
} else {
  scanner.initialize();
}
