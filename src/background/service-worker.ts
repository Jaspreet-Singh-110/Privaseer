import { Storage } from './storage';
import { FirewallEngine } from './firewall-engine';
import { PrivacyScoreManager } from './privacy-score';
import { burnerEmailService } from './burner-email-service';
import { feedbackTelemetryService } from './feedback-telemetry-service';
import type { ConsentScanResult } from '../types';
import { logger } from '../utils/logger';
import { messageBus } from '../utils/message-bus';
import { tabManager } from '../utils/tab-manager';
import { backgroundEvents } from './event-emitter';
import { toError, isGetTrackerInfoData, isConsentScanResult } from '../utils/type-guards';
import { sanitizeUrl } from '../utils/sanitizer';
import { BADGE, TIME } from '../utils/constants';

let isInitialized = false;
let initializationPromise: Promise<void> | null = null;
const consentAlertCache = new Map<string, number>(); // Track consent alerts by domain

async function initializeExtension(): Promise<void> {
  // If already initialized, skip
  if (isInitialized) {
    return;
  }

  // If initialization is in progress, wait for it
  if (initializationPromise) {
    return initializationPromise;
  }

  // Start initialization
  initializationPromise = (async () => {
    try {

      // Initialize utilities first (logger auto-initializes on first use)
      await messageBus.initialize();
      await tabManager.initialize();

      // Initialize event-driven components (sets up event listeners)
      await PrivacyScoreManager.initialize();

      // Initialize core components
      await Storage.initialize();
      await FirewallEngine.initialize();
      await burnerEmailService.initialize();
      await feedbackTelemetryService.initialize();

      await chrome.action.setBadgeBackgroundColor({ color: BADGE.BACKGROUND_COLOR });

      setupMessageHandlers();
      setupStorageChangeListener();
      setupTabEventHandlers();
      setupCleanupInterval();
      isInitialized = true;
    } catch (error) {
      logger.error('ServiceWorker', 'Extension initialization failed', toError(error));
      initializationPromise = null; // Reset on error so retry is possible
      throw error;
    }
  })();

  return initializationPromise;
}

function setupMessageHandlers(): void {
  messageBus.on('GET_STATE', async () => {
    const data = await Storage.getFresh();
    return { success: true, data };
  });

  messageBus.on('TOGGLE_PROTECTION', async () => {
    const enabled = await FirewallEngine.toggleProtection();
    feedbackTelemetryService.trackEvent({
      eventType: 'protection_toggled',
      eventData: { enabled },
    }).catch(err => logger.debug('ServiceWorker', 'Telemetry failed', err));
    return { success: true, enabled };
  });

  messageBus.on('CLEAR_ALERTS', async () => {
    await Storage.clearAlerts();
    return { success: true };
  });

  messageBus.on('GET_TRACKER_INFO', async (data: unknown) => {
    if (!isGetTrackerInfoData(data)) {
      return { success: false, error: 'Invalid data: domain not provided' };
    }
    const info = FirewallEngine.getTrackerInfo(data.domain);
    return { success: true, info };
  });

  messageBus.on('CONSENT_SCAN_RESULT', async (data: unknown) => {
    if (!isConsentScanResult(data)) {
      return { success: false, error: 'Invalid consent scan result data' };
    }
    const result = data as ConsentScanResult;

    const urlObj = new URL(result.url);
    const domain = urlObj.hostname;

    if (result.hasPersistedConsent) {
      logger.info('ServiceWorker', 'Site has valid persisted consent, skipping penalty', {
        domain,
        cmpType: result.cmpDetection?.cmpType,
        consentStatus: result.cmpDetection?.consentStatus,
      });
      return { success: true };
    }

    if (!result.isCompliant) {

      // Check if we've already alerted about this domain recently (within 5 minutes)
      const lastAlertTime = consentAlertCache.get(domain);
      const now = Date.now();

      // If we've alerted within 5 minutes, skip
      if (lastAlertTime && now - lastAlertTime < 300000) {
        return { success: true };
      }

      // Also check if there's already a recent alert in storage
      const storageData = await Storage.get();
      const recentAlert = storageData.alerts.find(
        a => a.domain === domain &&
        a.message.includes('deceptive cookie banner') &&
        now - a.timestamp < 300000 // 5 minutes
      );

      if (recentAlert) {
        // Update cache to prevent future checks
        consentAlertCache.set(domain, now);
        return { success: true };
      }

      // Set cache BEFORE creating alert to prevent race conditions
      consentAlertCache.set(domain, now);

      // Calculate severity based on deceptive patterns
      let severity: 'low' | 'medium' | 'high' = 'medium';
      let severityMultiplier = 1.0;

      if (result.deceptivePatterns && result.deceptivePatterns.length > 0) {
        if (result.deceptivePatterns.includes('Forced Consent')) {
          severity = 'high';
          severityMultiplier = 2.0;
        } else if (result.deceptivePatterns.includes('Hidden Reject')) {
          severity = 'high';
          severityMultiplier = 1.5;
        } else if (result.deceptivePatterns.includes('Dark Pattern')) {
          severity = 'medium';
          severityMultiplier = 1.0;
        }
      }

      // Emit non-compliant site event with severity multiplier
      backgroundEvents.emit('NON_COMPLIANT_SITE', {
        domain,
        url: result.url,
        deceptivePatterns: result.deceptivePatterns || [],
        severityMultiplier,
      });

      await Storage.addAlert({
        id: `${Date.now()}-${Math.random()}`,
        type: 'non_compliant_site',
        severity,
        message: `${domain} has deceptive cookie banner`,
        domain,
        timestamp: Date.now(),
        url: result.url,
        deceptivePatterns: result.deceptivePatterns || [],
      });

      messageBus.broadcast('STATE_UPDATE');
    }

    return { success: true };
  });

  // Only new email generation is blocked when the feature is disabled.
  // Existing emails remain fully accessible - users can still view, copy, and delete
  // their previously generated burner emails even when generation is disabled.
  messageBus.on('GENERATE_BURNER_EMAIL', async (data: unknown) => {
    try {
      // Guard to ensure only generation is affected by the feature toggle; existing emails remain accessible
      const isEnabled = await Storage.getBurnerEmailEnabled();

      if (!isEnabled) {
        const { domain } = data as { domain?: string };
        logger.info('ServiceWorker', 'Burner email generation blocked - feature is disabled', { domain: domain || 'unknown' });
        return { success: false, error: 'Burner email feature is disabled' };
      }

      const { domain, url, label } = data as { domain: string; url?: string; label?: string };
      const email = await burnerEmailService.generateEmail(domain, url, label);
      logger.debug('ServiceWorker', 'Email generated successfully', { email });
      feedbackTelemetryService.trackEvent({
        eventType: 'burner_email_generated',
        eventData: { domain },
      }).catch(err => logger.debug('ServiceWorker', 'Telemetry failed', err));
      return { success: true, email };
    } catch (error) {
      const err = toError(error);
      logger.error('ServiceWorker', 'Failed to generate burner email', err);
      return { success: false, error: err.message };
    }
  });

  // GET_BURNER_EMAILS intentionally has no feature check - existing emails remain accessible
  // even when generation is disabled, allowing users to view and manage previously created burner emails
  messageBus.on('GET_BURNER_EMAILS', async () => {
    try {
      const emails = await burnerEmailService.getEmails();
      return { success: true, emails };
    } catch (error) {
      logger.error('ServiceWorker', 'Failed to fetch burner emails', toError(error));
      return { success: false, error: 'Failed to fetch burner emails' };
    }
  });

  // DELETE_BURNER_EMAIL works regardless of feature state - users can delete emails even when generation is disabled
  messageBus.on('DELETE_BURNER_EMAIL', async (data: unknown) => {
    try {
      const { emailId } = data as { emailId: string };
      await burnerEmailService.deleteEmail(emailId);
      return { success: true };
    } catch (error) {
      logger.error('ServiceWorker', 'Failed to delete burner email', toError(error));
      return { success: false, error: 'Failed to delete burner email' };
    }
  });

  messageBus.on('SUBMIT_FEEDBACK', async (data: unknown) => {
    try {
      const { feedbackText, url, domain } = data as { feedbackText: string; url?: string; domain?: string };
      const result = await feedbackTelemetryService.submitFeedback({ feedbackText, url, domain });
      return result;
    } catch (error) {
      logger.error('ServiceWorker', 'Failed to submit feedback', toError(error));
      return { success: false, error: 'Failed to submit feedback' };
    }
  });

  /**
   * Handles burner email setting toggles originating from the popup UI.
   *
   * Behavior:
   * - Processes requests sequentially through the message bus, eliminating race conditions
   *   when multiple toggle requests occur back-to-back.
   * - Persists the new enabled state and returns the updated value to the caller.
   *
   * Validation:
   * - Ensures the incoming payload includes a boolean `enabled` flag.
   * - Rejects invalid payloads early with a descriptive error response.
   *
   * Broadcast:
   * - After persisting the new value, broadcasts `STATE_UPDATE` to all extension contexts
   *   so UI components (popup.tsx, burner-emails-section.tsx) can refresh their state.
   */
  messageBus.on('SET_BURNER_EMAIL_SETTING', async (data: unknown) => {
    try {
      const { enabled } = data as { enabled: boolean };
      logger.debug('ServiceWorker', 'SET_BURNER_EMAIL_SETTING request received', { enabled });
      if (typeof enabled !== 'boolean') {
        return { success: false, error: 'Invalid enabled value' };
      }
      const previousValue = await Storage.getBurnerEmailEnabled();
      await Storage.setBurnerEmailEnabled(enabled);

      // Broadcast BURNER_EMAIL_SETTING_CHANGED to all content scripts
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, {
              type: 'BURNER_EMAIL_SETTING_CHANGED',
              data: { enabled }
            }).catch(() => {
              // Content script may not be loaded, ignore
            });
          }
        });
      });

      // Broadcast STATE_UPDATE to notify all UI components to refresh their state
      messageBus.broadcast('STATE_UPDATE');

      logger.info('ServiceWorker', 'Burner email setting updated and broadcasted', { previousValue, newValue: enabled });
      return { success: true, enabled };
    } catch (error) {
      logger.error('ServiceWorker', 'Failed to set burner email setting', toError(error));
      return { success: false, error: 'Failed to set burner email setting' };
    }
  });

  messageBus.on('SET_THEME', async (data: unknown) => {
    try {
      const { theme } = data as { theme: 'light' | 'dark' | 'system' };
      if (!theme || !['light', 'dark', 'system'].includes(theme)) {
        return { success: false, error: 'Invalid theme value' };
      }
      await Storage.setTheme(theme);

      chrome.runtime.sendMessage({
        type: 'THEME_CHANGED',
        data: { theme }
      }).catch(() => {});

      return { success: true, theme };
    } catch (error) {
      logger.error('ServiceWorker', 'Failed to set theme', toError(error));
      return { success: false, error: 'Failed to set theme' };
    }
  });

  /**
   * Responds to burner email setting queries from UI contexts.
   *
   * Behavior:
   * - Reads the latest persisted toggle state from Storage.
   * - Does not perform additional validation because no payload is expected.
   *
   * Returns:
   * - `{ success: true, enabled: boolean }` when retrieval succeeds.
   * - `{ success: false, error: string }` when an unexpected error occurs.
   */
  messageBus.on('GET_BURNER_EMAIL_SETTING', async () => {
    try {
      const enabled = await Storage.getBurnerEmailEnabled();
      logger.debug('ServiceWorker', 'Burner email setting retrieved', { enabled });
      return { success: true, enabled };
    } catch (error) {
      logger.error('ServiceWorker', 'Failed to get burner email setting', toError(error));
      return { success: false, error: 'Failed to get burner email setting' };
    }
  });

  messageBus.on('SET_TELEMETRY_SETTING', async (data: unknown) => {
    try {
      const { enabled } = data as { enabled: boolean };
      logger.debug('ServiceWorker', 'SET_TELEMETRY_SETTING request received', { enabled });
      if (typeof enabled !== 'boolean') {
        return { success: false, error: 'Invalid enabled value' };
      }
      const previousValue = await Storage.getTelemetryEnabled();
      await Storage.setTelemetryEnabled(enabled);

      // Broadcast STATE_UPDATE to notify all UI components to refresh their state
      messageBus.broadcast('STATE_UPDATE');

      logger.info('ServiceWorker', 'Telemetry setting updated and broadcasted', { previousValue, newValue: enabled });
      return { success: true, enabled };
    } catch (error) {
      logger.error('ServiceWorker', 'Failed to set telemetry setting', toError(error));
      return { success: false, error: 'Failed to set telemetry setting' };
    }
  });

  messageBus.on('GET_TELEMETRY_SETTING', async () => {
    try {
      const enabled = await Storage.getTelemetryEnabled();
      logger.debug('ServiceWorker', 'Telemetry setting retrieved', { enabled });
      return { success: true, enabled };
    } catch (error) {
      logger.error('ServiceWorker', 'Failed to get telemetry setting', toError(error));
      return { success: false, error: 'Failed to get telemetry setting' };
    }
  });

  messageBus.on('GET_THEME', async () => {
    try {
      const data = await Storage.get();
      const theme = data.settings.theme;
      return { success: true, theme };
    } catch (error) {
      logger.error('ServiceWorker', 'Failed to get theme', toError(error));
      return { success: false, error: 'Failed to get theme' };
    }
  });

  messageBus.on('TRACK_EVENT', async (data: unknown) => {
    try {
      const { eventType, eventData } = data as { eventType: string; eventData?: Record<string, unknown> };
      await feedbackTelemetryService.trackEvent({ eventType, eventData });
      return { success: true };
    } catch (error) {
      logger.error('ServiceWorker', 'Failed to track event', toError(error));
      return { success: false, error: 'Failed to track event' };
    }
  });

  messageBus.on('RECORD_COMPLIANCE_SCORE', async (data: unknown) => {
    try {
      const { score } = data as { score: number };
      await Storage.recordComplianceScore(score);
      return { success: true };
    } catch (error) {
      logger.error('ServiceWorker', 'Failed to record compliance score', toError(error));
      return { success: false, error: 'Failed to record compliance score' };
    }
  });
}

function setupStorageChangeListener(): void {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.privacyData) {
      const newData = changes.privacyData.newValue;
      const oldData = changes.privacyData.oldValue;
      
      if (newData?.settings?.burnerEmailEnabled !== oldData?.settings?.burnerEmailEnabled) {
        const enabled = newData.settings.burnerEmailEnabled ?? false;
        
        logger.debug('ServiceWorker', 'Burner email setting changed via storage', { enabled });
        
        // Broadcast to tabs
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, {
                type: 'BURNER_EMAIL_SETTING_CHANGED',
                data: { enabled }
              }).catch(() => {
                // Content script may not be loaded, ignore
              });
            }
          });
        });
        
        // Broadcast to popup
        messageBus.broadcast('STATE_UPDATE');
      }
    }
  });
}

function setupTabEventHandlers(): void {
  // Tab events are now handled by tabManager, but we still need to handle specific logic
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading' && tab.url && !tab.url.startsWith('chrome://')) {
      tabManager.resetBlockCount(tabId);
      await FirewallEngine.updateCurrentTabBadge(tabId);
    }

    if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
      try {
        await FirewallEngine.checkPageForTrackers(tabId, tab.url);
      } catch (error) {
        logger.error('ServiceWorker', 'Error checking page', toError(error), { tabId, url: sanitizeUrl(tab.url) });
      }
    }
  });

  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
      await FirewallEngine.updateCurrentTabBadge(activeInfo.tabId);
    } catch (error) {
      logger.error('ServiceWorker', 'Error updating badge', toError(error), { tabId: activeInfo.tabId });
    }
  });

  // Listen for tab removal to clean up badge timers immediately
  messageBus.on('TAB_REMOVED', async (data: unknown) => {
    const tabId = (data as { tabId: number })?.tabId;
    if (typeof tabId === 'number') {
      FirewallEngine.clearTabTimer(tabId);
    }
  });
}

function setupCleanupInterval(): void {
  // Run cleanup every hour
  setInterval(() => {
    tabManager.cleanup();
    FirewallEngine.cleanup();
  }, TIME.ONE_HOUR_MS);
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await initializeExtension();
  if (details.reason === 'install') {
    feedbackTelemetryService.trackEvent({
      eventType: 'extension_installed',
    }).catch(err => logger.debug('ServiceWorker', 'Telemetry failed', err));
  } else if (details.reason === 'update') {
    feedbackTelemetryService.trackEvent({
      eventType: 'extension_updated',
      eventData: { previousVersion: details.previousVersion },
    }).catch(err => logger.debug('ServiceWorker', 'Telemetry failed', err));
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await initializeExtension();
});

chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(async (details) => {
  if (details.request.tabId > 0) {
    await FirewallEngine.handleBlockedRequest(
      details.request.url,
      details.request.tabId
    );
  }
});

chrome.action.onClicked.addListener(() => {
  // Extension icon clicked - popup will open automatically
});

chrome.runtime.onSuspend.addListener(async () => {
  await Storage.ensureSaved();
});

// Initialize extension when service worker starts/wakes up
// This ensures proper initialization even after suspension
initializeExtension().catch(error => {
  logger.error('ServiceWorker', 'Initial startup failed', toError(error));
});
