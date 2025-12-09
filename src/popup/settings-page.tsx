import React, { useState, useEffect, useRef } from 'react';
import { X, MessageSquare, Send, Info, Palette, Mail, ChevronRight, ArrowLeft, Sun, Moon, Monitor, BarChart2 } from 'lucide-react';
import { logger } from '../utils/logger';
import { toError } from '../utils/type-guards';
import { ThemeManager } from '../utils/theme-manager';
import { validateEmail } from '../utils/validation';

export type SettingsSection = 'menu' | 'feedback' | 'theme' | 'burner-services' | 'telemetry' | 'about';
type ThemeOption = 'light' | 'dark' | 'system';

interface SettingsPageProps {
  isOpen: boolean;
  onClose: () => void;
  currentTab: chrome.tabs.Tab | null;
  onFeedbackSuccess: () => void;
  deepLinkSection?: SettingsSection | null;
  highlightBurnerToggle?: boolean;
  onBurnerHighlightComplete?: () => void;
}

export function SettingsPage({
  isOpen,
  onClose,
  currentTab,
  onFeedbackSuccess,
  deepLinkSection,
  highlightBurnerToggle = false,
  onBurnerHighlightComplete,
}: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('menu');
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<ThemeOption>('system');
  const [isNavigatingForward, setIsNavigatingForward] = useState(true);
  const [isApplyingTheme, setIsApplyingTheme] = useState(false);
  const [isBurnerEmailEnabled, setIsBurnerEmailEnabled] = useState(true);
  const [isTogglingBurnerEmail, setIsTogglingBurnerEmail] = useState(false);
  const [shouldHighlightBurnerToggle, setShouldHighlightBurnerToggle] = useState(false);
  const [isTelemetryEnabled, setIsTelemetryEnabled] = useState(false);
  const [isTogglingTelemetry, setIsTogglingTelemetry] = useState(false);
  const [realEmail, setRealEmail] = useState<string>('');
  const [realEmailInput, setRealEmailInput] = useState<string>('');
  const [isSavingRealEmail, setIsSavingRealEmail] = useState(false);
  const [realEmailError, setRealEmailError] = useState<string | null>(null);
  const burnerToggleRef = useRef<HTMLButtonElement | null>(null);
  const isTogglingRef = useRef(false);

  useEffect(() => {
    loadCurrentTheme();
    loadBurnerEmailSetting();
    loadTelemetrySetting();
    loadRealEmail();

    const messageListener = (message: { type: string }) => {
      if (message.type === 'STATE_UPDATE') {
        logger.debug('Settings', 'STATE_UPDATE received, reloading burner email setting');
        loadBurnerEmailSetting();
        // Don't reload email - let user control the input
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  // Reload state when settings modal opens to ensure consistency
  useEffect(() => {
    if (isOpen) {
      logger.info('Settings', 'Modal opened, reloading state', { currentBurnerEnabled: isBurnerEmailEnabled });

      // When arriving via burner deep-link (highlightBurnerToggle), skip the initial
      // burner setting fetch to avoid immediately overwriting the user's intent.
      if (!highlightBurnerToggle) {
        loadBurnerEmailSetting();
      } else {
        logger.info('Settings', 'Modal opened via deep-link, skipping initial burner setting fetch');
      }

      loadRealEmail();
    }
  }, [isOpen, highlightBurnerToggle]);

  // Reload burner email setting when navigating to burner-services section
  useEffect(() => {
    if (isOpen && activeSection === 'burner-services' && !highlightBurnerToggle) {
      logger.info('Settings', 'Navigated to burner-services, reloading state', { currentBurnerEnabled: isBurnerEmailEnabled });
      loadBurnerEmailSetting();
      // Don't reload email - it's already loaded when modal opened
    }
  }, [isOpen, activeSection, highlightBurnerToggle]);

  const loadCurrentTheme = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_THEME' });
      if (response.success && response.theme) {
        setSelectedTheme(response.theme);
      }
    } catch (error) {
      logger.error('Settings', 'Failed to load current theme', toError(error));
    }
  };

  const loadBurnerEmailSetting = async () => {
    // If a toggle is in progress, don't fetch. The toggle handler is the source of truth.
    if (isTogglingRef.current) {
      logger.debug('Settings', 'loadBurnerEmailSetting: Skipped fetch, toggle in progress');
      return;
    }
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_BURNER_EMAIL_SETTING' });
      if (response.success) {
        logger.info('Settings', 'loadBurnerEmailSetting: Setting isBurnerEmailEnabled state', { enabled: response.enabled });
        // Only update state if it's different, to avoid unnecessary re-renders
        if (response.enabled !== isBurnerEmailEnabled) {
          setIsBurnerEmailEnabled(response.enabled);
        }
      } else {
        logger.warn('Settings', 'loadBurnerEmailSetting: Response was not successful', { response });
      }
    } catch (error) {
      logger.error('Settings', 'Failed to load burner email setting', toError(error));
    }
  };

  const loadTelemetrySetting = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_TELEMETRY_SETTING' });
      if (response.success) {
        setIsTelemetryEnabled(response.enabled);
      }
    } catch (error) {
      logger.error('Settings', 'Failed to load telemetry setting', toError(error));
    }
  };

  const loadRealEmail = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_REAL_EMAIL' });
      if (response.success) {
        const email = response.email || '';
        logger.info('Settings', 'loadRealEmail: Setting email state', { email: email ? 'present' : 'empty' });
        setRealEmail(email);
        setRealEmailInput(email);
      } else {
        logger.warn('Settings', 'loadRealEmail: Response was not successful', { response });
      }
    } catch (error) {
      logger.error('Settings', 'Failed to load real email', toError(error));
    }
  };

  const handleSaveRealEmail = async () => {
    if (isSavingRealEmail) return;

    // Use shared validation module for consistent validation
    const validation = validateEmail(realEmailInput);
    if (!validation.valid) {
      setRealEmailError(validation.error || 'Please enter a valid email address');
      return;
    }

    setIsSavingRealEmail(true);
    setRealEmailError(null);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SET_REAL_EMAIL',
        data: { email: validation.sanitized }
      });

      if (response.success) {
        setRealEmail(validation.sanitized!);
        setRealEmailInput(validation.sanitized!);
        logger.info('Settings', 'Real email saved successfully');
      } else {
        setRealEmailError(response.error || 'Failed to save email');
        logger.error('Settings', 'Failed to save real email', new Error(response.error || 'Unknown error'));
      }
    } catch (error) {
      const err = toError(error);
      setRealEmailError('Failed to save email. Please try again.');
      logger.error('Settings', 'Failed to save real email', err);
    } finally {
      setIsSavingRealEmail(false);
    }
  };

  const maskEmail = (email: string): string => {
    if (!email) return '';
    const [local, domain] = email.split('@');
    if (!domain) return email;
    if (local.length <= 1) return `***@${domain}`;
    return `${local[0]}***@${domain}`;
  };

  /**
   * Handles toggling the burner email feature on/off.
   * 
   * This function manages the toggle state and coordinates with the service worker
   * to update the burner email setting. It includes race condition protection and
   * error recovery mechanisms.
   * 
   * @remarks
   * Race Condition Handling:
   * - Uses `isTogglingBurnerEmail` flag to prevent concurrent toggle operations
   * - Returns early with a warning log if a toggle is already in progress
   * - The message bus in the service worker also processes requests sequentially
   * 
   * Error Recovery:
   * - On failure, reloads the current setting from storage to restore accurate state
   * - Logs detailed error information including attempted and previous values
   * - Always resets the toggle flag in finally block to prevent stuck state
   * 
   * Logging:
   * - Debug log when toggle starts (with current and new values)
   * - Info log on successful update (with previous and new values)
   * - Error logs on failure (with attempted and previous values)
   * - Warning log when blocked due to concurrent operation
   */
  const handleBurnerEmailToggle = async () => {
    if (isTogglingBurnerEmail) {
      logger.warn('Settings', 'Burner email toggle blocked - operation already in progress');
      return;
    }

    // Any explicit interaction with the toggle should clear the highlight state
    if (shouldHighlightBurnerToggle) {
      setShouldHighlightBurnerToggle(false);
      if (burnerToggleRef.current) {
        burnerToggleRef.current.blur();
      }
      onBurnerHighlightComplete?.();
    }

    const previousValue = isBurnerEmailEnabled;
    const newValue = !previousValue;

    // Optimistically update the UI to feel responsive
    setIsBurnerEmailEnabled(newValue);
    setIsTogglingBurnerEmail(true);
    isTogglingRef.current = true;
    logger.info('Settings', 'handleBurnerEmailToggle: Starting toggle', { previousValue, newValue });

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SET_BURNER_EMAIL_SETTING',
        data: { enabled: newValue }
      });

      if (response.success && typeof response.enabled === 'boolean') {
        // The service worker has confirmed the new state. We can be confident in this value.
        logger.info('Settings', 'Burner email setting updated successfully', { verifiedValue: response.enabled });
        setIsBurnerEmailEnabled(response.enabled);
        
        // After successfully enabling, also reload the real email
        if (response.enabled) {
          await loadRealEmail();
        }
      } else {
        // If the update fails, roll back to the previous state
        logger.error('Settings', 'Failed to update burner email setting, rolling back UI', new Error(response.error || 'Unknown error'));
        setIsBurnerEmailEnabled(previousValue);
      }
    } catch (error) {
      // If the message fails to send, roll back to the previous state
      logger.error('Settings', 'Error toggling burner email setting, rolling back UI', toError(error));
      setIsBurnerEmailEnabled(previousValue);
    } finally {
      setIsTogglingBurnerEmail(false);
      isTogglingRef.current = false;
    }
  };

  const handleTelemetryToggle = async () => {
    if (isTogglingTelemetry) {
      logger.warn('Settings', 'Telemetry toggle blocked - operation already in progress');
      return;
    }

    setIsTogglingTelemetry(true);
    const newValue = !isTelemetryEnabled;
    logger.debug('Settings', 'Starting telemetry toggle', { currentValue: isTelemetryEnabled, newValue });

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SET_TELEMETRY_SETTING',
        data: { enabled: newValue }
      });

      if (response.success) {
        setIsTelemetryEnabled(newValue);
        logger.info('Settings', 'Telemetry setting updated', { previousValue: isTelemetryEnabled, newValue });
      } else {
        logger.error('Settings', 'Failed to update telemetry setting', new Error(response.error || 'Unknown error'), { attemptedValue: newValue, previousValue: isTelemetryEnabled });
        await loadTelemetrySetting();
      }
    } catch (error) {
      logger.error('Settings', 'Failed to toggle telemetry setting', toError(error), { attemptedValue: newValue, previousValue: isTelemetryEnabled });
      await loadTelemetrySetting();
    } finally {
      setIsTogglingTelemetry(false);
    }
  };

  const handleThemeChange = async (theme: ThemeOption) => {
    if (isApplyingTheme) return;

    setIsApplyingTheme(true);
    setSelectedTheme(theme);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SET_THEME',
        data: { theme }
      });

      if (response.success) {
        ThemeManager.updatePreference(theme);
        logger.info('Settings', 'Theme updated successfully', { theme });
      } else {
        logger.error('Settings', 'Failed to set theme', new Error(response.error || 'Unknown error'));
        await loadCurrentTheme();
      }
    } catch (error) {
      logger.error('Settings', 'Failed to apply theme', toError(error));
      await loadCurrentTheme();
    } finally {
      setIsApplyingTheme(false);
    }
  };

  useEffect(() => {
    if (isOpen && deepLinkSection) {
      setIsNavigatingForward(deepLinkSection !== 'menu');
      setActiveSection(deepLinkSection);
    }
  }, [deepLinkSection, isOpen, highlightBurnerToggle]);

  useEffect(() => {
    if (!isOpen || !highlightBurnerToggle) return;
    if (activeSection !== 'burner-services') return;
    if (!burnerToggleRef.current) return;

    setShouldHighlightBurnerToggle(true);
    burnerToggleRef.current.focus({ preventScroll: false });

    const timer = window.setTimeout(() => {
      setShouldHighlightBurnerToggle(false);
      if (burnerToggleRef.current) {
        burnerToggleRef.current.blur();
      }
      onBurnerHighlightComplete?.();
    }, 2500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [highlightBurnerToggle, activeSection, isOpen, onBurnerHighlightComplete]);

  useEffect(() => {
    if (!isOpen) {
      setShouldHighlightBurnerToggle(false);
      if (burnerToggleRef.current) {
        burnerToggleRef.current.blur();
      }
    }
  }, [isOpen]);

  // Ensure toggle loses focus when highlightBurnerToggle becomes false
  useEffect(() => {
    if (!highlightBurnerToggle && shouldHighlightBurnerToggle) {
      setShouldHighlightBurnerToggle(false);
      if (burnerToggleRef.current) {
        burnerToggleRef.current.blur();
      }
    }
  }, [highlightBurnerToggle, shouldHighlightBurnerToggle]);


  if (!isOpen) return null;

  const navigateToSection = (section: SettingsSection) => {
    setIsNavigatingForward(section !== 'menu');
    setActiveSection(section);
  };

  const navigateBack = () => {
    setIsNavigatingForward(false);
    setActiveSection('menu');
  };

  const handleFeedbackSubmit = async () => {
    if (!feedbackText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const getDomain = (url?: string): string => {
        if (!url) return 'unknown';
        try {
          return new URL(url).hostname;
        } catch {
          return 'unknown';
        }
      };

      const response = await chrome.runtime.sendMessage({
        type: 'SUBMIT_FEEDBACK',
        data: {
          feedbackText,
          url: currentTab?.url || 'unknown',
          domain: getDomain(currentTab?.url),
        },
      });

      if (response.success) {
        logger.info('Popup', 'User feedback submitted', { domain: getDomain(currentTab?.url) });
        setFeedbackText('');
        onClose();
        onFeedbackSuccess();
      } else {
        logger.error('Popup', 'Failed to submit feedback', new Error(response.error || 'Unknown error'));
      }
    } catch (error) {
      logger.error('Popup', 'Failed to submit feedback', toError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md transform transition-all animate-fade-in">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {activeSection !== 'menu' && (
              <button
                onClick={navigateBack}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all hover:scale-110"
                aria-label="Back to menu"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
            )}
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {activeSection === 'menu' && 'Settings'}
              {activeSection === 'feedback' && 'Feedback'}
              {activeSection === 'theme' && 'Theme'}
              {activeSection === 'burner-services' && 'Burner Email Services'}
              {activeSection === 'about' && 'About'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all hover:scale-110"
            aria-label="Close settings"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="p-6 max-h-96 overflow-y-auto">
          {activeSection === 'menu' && (
            <div className="space-y-3 animate-slide-in-left">
              <button
                onClick={() => navigateToSection('theme')}
                className="w-full flex items-center justify-between p-4 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg hover:border-blue-300 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-gray-600 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg group-hover:bg-blue-200 dark:group-hover:bg-blue-800/60 transition-colors">
                    <Palette className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Theme</h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Customize appearance</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
              </button>

              <button
                onClick={() => navigateToSection('feedback')}
                className="w-full flex items-center justify-between p-4 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg hover:border-blue-300 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-gray-600 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg group-hover:bg-blue-200 dark:group-hover:bg-blue-800/60 transition-colors">
                    <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Feedback</h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Share your thoughts</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
              </button>

              <button
                onClick={() => navigateToSection('burner-services')}
                className="w-full flex items-center justify-between p-4 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg hover:border-blue-300 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-gray-600 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg group-hover:bg-blue-200 dark:group-hover:bg-blue-800/60 transition-colors">
                    <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Burner Email Services</h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Manage email settings</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
              </button>

              <button
                onClick={() => navigateToSection('telemetry')}
                className="w-full flex items-center justify-between p-4 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg hover:border-blue-300 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-gray-600 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg group-hover:bg-blue-200 dark:group-hover:bg-blue-800/60 transition-colors">
                    <BarChart2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Telemetry & Improvements</h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Opt into anonymous insights</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
              </button>

              <button
                onClick={() => navigateToSection('about')}
                className="w-full flex items-center justify-between p-4 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg hover:border-blue-300 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-gray-600 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg group-hover:bg-blue-200 dark:group-hover:bg-blue-800/60 transition-colors">
                    <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">About</h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400">App information</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
              </button>
            </div>
          )}

          {activeSection === 'feedback' && (
            <div className={isNavigatingForward ? 'animate-slide-in-right' : 'animate-slide-in-left'}>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Help us improve Privaseer. Share your thoughts, report issues, or suggest features.
              </p>
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Type your feedback here..."
                className="w-full h-32 px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent resize-none text-sm transition-all"
              />
              <button
                onClick={handleFeedbackSubmit}
                disabled={!feedbackText.trim() || isSubmitting}
                className="mt-3 w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
              </button>
            </div>
          )}

          {activeSection === 'theme' && (
            <div className={isNavigatingForward ? 'animate-slide-in-right' : 'animate-slide-in-left'}>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Choose your preferred color theme for the extension.
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => handleThemeChange('light')}
                  disabled={isApplyingTheme}
                  className={`w-full flex items-center justify-between p-4 border-2 rounded-lg transition-all ${
                    selectedTheme === 'light'
                      ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'
                  } ${isApplyingTheme ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      selectedTheme === 'light' ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-gray-100 dark:bg-gray-600'
                    }`}>
                      <Sun className={`w-5 h-5 ${
                        selectedTheme === 'light' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'
                      }`} />
                    </div>
                    <div className="text-left">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Light</h3>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Bright and clear appearance</p>
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    selectedTheme === 'light'
                      ? 'border-blue-500 dark:border-blue-400'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}>
                    {selectedTheme === 'light' && (
                      <div className="w-3 h-3 rounded-full bg-blue-500 dark:bg-blue-400" />
                    )}
                  </div>
                </button>

                <button
                  onClick={() => handleThemeChange('dark')}
                  disabled={isApplyingTheme}
                  className={`w-full flex items-center justify-between p-4 border-2 rounded-lg transition-all ${
                    selectedTheme === 'dark'
                      ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'
                  } ${isApplyingTheme ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      selectedTheme === 'dark' ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-gray-100 dark:bg-gray-600'
                    }`}>
                      <Moon className={`w-5 h-5 ${
                        selectedTheme === 'dark' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'
                      }`} />
                    </div>
                    <div className="text-left">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Dark</h3>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Easy on the eyes at night</p>
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    selectedTheme === 'dark'
                      ? 'border-blue-500 dark:border-blue-400'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}>
                    {selectedTheme === 'dark' && (
                      <div className="w-3 h-3 rounded-full bg-blue-500 dark:bg-blue-400" />
                    )}
                  </div>
                </button>

                <button
                  onClick={() => handleThemeChange('system')}
                  disabled={isApplyingTheme}
                  className={`w-full flex items-center justify-between p-4 border-2 rounded-lg transition-all ${
                    selectedTheme === 'system'
                      ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'
                  } ${isApplyingTheme ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      selectedTheme === 'system' ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-gray-100 dark:bg-gray-600'
                    }`}>
                      <Monitor className={`w-5 h-5 ${
                        selectedTheme === 'system' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'
                      }`} />
                    </div>
                    <div className="text-left">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">System</h3>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Match your system settings</p>
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    selectedTheme === 'system'
                      ? 'border-blue-500 dark:border-blue-400'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}>
                    {selectedTheme === 'system' && (
                      <div className="w-3 h-3 rounded-full bg-blue-500 dark:bg-blue-400" />
                    )}
                  </div>
                </button>
              </div>
            </div>
          )}

          {activeSection === 'burner-services' && (
            <div className={isNavigatingForward ? 'animate-slide-in-right' : 'animate-slide-in-left'}>
              <div className="p-4 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg transition-colors">
                      <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="text-left">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Burner Email Protection</h3>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Control disposable email generation for untrusted sites
                      </p>
                    </div>
                  </div>
                  <button
                    ref={burnerToggleRef}
                    onClick={handleBurnerEmailToggle}
                    disabled={isTogglingBurnerEmail}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 ${
                      isBurnerEmailEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                    } ${isTogglingBurnerEmail ? 'opacity-50 cursor-not-allowed' : ''} ${
                      shouldHighlightBurnerToggle ? 'ring-4 ring-blue-300 dark:ring-blue-700 ring-offset-2 dark:ring-offset-gray-800' : ''
                    }`}
                    aria-label="Toggle burner email protection"
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        isBurnerEmailEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                <div
                  className="sr-only"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  Burner email protection is {isBurnerEmailEnabled ? 'enabled' : 'disabled'}
                </div>
                <p className="mt-4 text-xs text-gray-600 dark:text-gray-400">
                  Burner email capabilities power the in-page autofill experience and the burner emails tab. Disabling
                  this feature blocks future email generation but keeps existing addresses accessible.
                </p>

                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-600">
                  <label htmlFor="real-email-input" className={`block text-sm font-medium mb-2 ${
                    !isBurnerEmailEnabled
                      ? 'text-gray-400 dark:text-gray-500'
                      : 'text-gray-900 dark:text-white'
                  }`}>
                    Forwarding Email Address
                  </label>
                  <p className={`text-xs mb-3 ${
                    !isBurnerEmailEnabled
                      ? 'text-gray-400 dark:text-gray-500'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}>
                    Emails sent to your burner addresses will be forwarded to this address. Your email is stored locally and never shared.
                  </p>
                  
                  {!isBurnerEmailEnabled && (
                    <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <p className="text-xs text-amber-800 dark:text-amber-300">
                        Enable Burner Email Protection above to configure your forwarding email address.
                      </p>
                    </div>
                  )}
                  
                  {realEmail && (
                    <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Current: <span className="font-mono text-gray-900 dark:text-white">{maskEmail(realEmail)}</span>
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <input
                      id="real-email-input"
                      type="email"
                      value={realEmailInput}
                      onChange={(e) => {
                        setRealEmailInput(e.target.value);
                        setRealEmailError(null);
                      }}
                      placeholder="your.email@example.com"
                      className={`w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-all ${
                        !isBurnerEmailEnabled
                          ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-600 cursor-not-allowed'
                          : realEmailError
                          ? 'border-red-300 dark:border-red-600'
                          : 'border-gray-300 dark:border-gray-600'
                      }`}
                      disabled={isSavingRealEmail || !isBurnerEmailEnabled}
                      aria-disabled={!isBurnerEmailEnabled}
                    />
                    {realEmailError && (
                      <p className="text-xs text-red-600 dark:text-red-400">{realEmailError}</p>
                    )}
                    <button
                      onClick={handleSaveRealEmail}
                      disabled={isSavingRealEmail || !isBurnerEmailEnabled || realEmailInput.trim() === realEmail}
                      className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors"
                      aria-disabled={!isBurnerEmailEnabled}
                    >
                      {isSavingRealEmail ? 'Saving...' : realEmail ? 'Update Email' : 'Save Email'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'about' && (
            <div className={isNavigatingForward ? 'animate-slide-in-right' : 'animate-slide-in-left'}>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Privaseer helps you protect your privacy online by blocking trackers and managing cookie consent.
              </p>
              <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Version</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">1.0.0</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Extension Name</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">Privaseer</span>
                  </div>
                </div>

                <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Features</h3>
                  <ul className="space-y-2 text-xs text-gray-600 dark:text-gray-400">
                    <li className="flex items-start gap-2">
                      <span className="text-blue-600 dark:text-blue-400 mt-0.5">•</span>
                      <span>Automatic tracker blocking and privacy protection</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-600 dark:text-blue-400 mt-0.5">•</span>
                      <span>Smart cookie consent management</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-600 dark:text-blue-400 mt-0.5">•</span>
                      <span>Burner email services for enhanced privacy</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-600 dark:text-blue-400 mt-0.5">•</span>
                      <span>Real-time privacy score tracking</span>
                    </li>
                  </ul>
                </div>

                <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                    Built with privacy in mind
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'telemetry' && (
            <div className={isNavigatingForward ? 'animate-slide-in-right' : 'animate-slide-in-left'}>
              <div className="p-4 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg transition-colors">
                      <BarChart2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="text-left">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Telemetry & Improvements</h3>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Share anonymous usage patterns to help Privaseer improve. No personal data is collected.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleTelemetryToggle}
                    disabled={isTogglingTelemetry}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
                      isTelemetryEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                    } ${isTogglingTelemetry ? 'opacity-50 cursor-not-allowed' : ''}`}
                    aria-label="Toggle telemetry collection"
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        isTelemetryEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                <div
                  className="sr-only"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  Telemetry collection is {isTelemetryEnabled ? 'enabled' : 'disabled'}
                </div>
                <p className="mt-4 text-xs text-gray-600 dark:text-gray-400">
                  Telemetry helps us understand which features are useful so we can prioritize improvements. It never
                  includes page contents, form data, or personally identifiable information.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 rounded-b-xl">
          <button
            onClick={activeSection === 'menu' ? onClose : navigateBack}
            className="w-full px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
          >
            {activeSection === 'menu' ? 'Close' : 'Back'}
          </button>
        </div>
      </div>
    </div>
  );
}
