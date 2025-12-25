import { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Shield, ShieldOff, Activity, AlertTriangle, CheckCircle2, XCircle, Info, Mail, Settings } from 'lucide-react';
import type { StorageData, Alert as AlertType, Message, OnboardingState } from '../types';
import { logger } from '../utils/logger';
import { toError } from '../utils/type-guards';
import { BurnerEmailsSection } from './burner-emails-section';
import { SettingsPage, type SettingsSection, type SettingsPageProps } from './settings-page';
import { ThemeManager } from '../utils/theme-manager';
import { ONBOARDING } from '../utils/constants';
import '../index.css';

type ReportableSettingsPageProps = SettingsPageProps & {
  reportContext?: AlertType | null;
  onReportClear?: () => void;
};

const ReportableSettingsPage = SettingsPage as (props: ReportableSettingsPageProps) => JSX.Element;

function PrivacyScoreMeter({ score }: { score: number }) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const animationRef = useRef<number>();
  const pathRef = useRef<SVGPathElement>(null);

  const scoreColor = score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626';
  const scoreColorLight = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
  const radius = 80;
  const strokeWidth = 12;
  const normalizedRadius = radius - strokeWidth / 2;
  // Semi-circle arc length - increase to account for rounded caps filling to 100%
  const circumference = normalizedRadius * Math.PI * 1.10;

  useEffect(() => {
    // Set initial state immediately
    if (pathRef.current) {
      pathRef.current.style.strokeDashoffset = `${circumference}`;
    }

    let startTime: number;
    const duration = 1500; // 1.5 seconds animation

    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function for smooth animation
      const easeOutCubic = 1 - Math.pow(1 - progress, 3);
      const currentScore = Math.floor(easeOutCubic * score);

      setAnimatedScore(currentScore);

      // Update path directly
      if (pathRef.current) {
        const offset = circumference - (currentScore / 100) * circumference;
        pathRef.current.style.strokeDashoffset = `${offset}`;
      }

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [score, circumference]);

  return (
    <div className="relative flex flex-col items-center" style={{ height: '110px' }}>
      <svg
        height={radius + strokeWidth + 10}
        width={(radius + strokeWidth) * 2}
        style={{ overflow: 'visible' }}
      >
        {/* Background arc */}
        <path
          d={`M ${strokeWidth / 2} ${radius + strokeWidth / 2} A ${normalizedRadius} ${normalizedRadius} 0 0 1 ${radius * 2 + strokeWidth / 2} ${radius + strokeWidth / 2}`}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Animated score arc */}
        <path
          ref={pathRef}
          d={`M ${strokeWidth / 2} ${radius + strokeWidth / 2} A ${normalizedRadius} ${normalizedRadius} 0 0 1 ${radius * 2 + strokeWidth / 2} ${radius + strokeWidth / 2}`}
          fill="none"
          stroke={`url(#gradient-${score})`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeLinecap="round"
          style={{
            strokeDashoffset: circumference,
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))'
          }}
        />
        {/* Gradient definition */}
        <defs>
          <linearGradient id={`gradient-${score}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style={{ stopColor: scoreColor, stopOpacity: 0.8 }} />
            <stop offset="100%" style={{ stopColor: scoreColorLight, stopOpacity: 1 }} />
          </linearGradient>
        </defs>
      </svg>

      {/* Score display in center */}
      <div className="absolute" style={{ top: '45px', left: '50%', transform: 'translateX(-50%)' }}>
        <div className="flex flex-col items-center">
          <div className="flex items-baseline">
            <span className="text-4xl font-bold" style={{ color: scoreColor }}>
              {animatedScore}
            </span>
            <span className="text-lg font-medium text-gray-400 ml-1">/100</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Popup() {
  const [data, setData] = useState<StorageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedAlerts, setExpandedAlerts] = useState<Set<string>>(new Set());
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null);
  const [showProtectionToast, setShowProtectionToast] = useState(false);
  const [protectionToastMessage, setProtectionToastMessage] = useState('');
  const [protectionToastState, setProtectionToastState] = useState(false);
  const [isTogglingProtection, setIsTogglingProtection] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'burner'>('dashboard');
  const [settingsDeepLink, setSettingsDeepLink] = useState<SettingsSection | null>(null);
  const [highlightBurnerToggle, setHighlightBurnerToggle] = useState(false);
  const [reportingAlert, setReportingAlert] = useState<AlertType | null>(null);
  const [onboardingState, setOnboardingState] = useState<OnboardingState | null>(null);

  useEffect(() => {
    checkCurrentTab();
    loadData();
    loadOnboardingState();

    const listener = (message: Message) => {
      if (message.type === 'STATE_UPDATE') {
        loadData();
        loadOnboardingState();
      } else if (message.type === 'THEME_CHANGED') {
        const { theme } = message.data as { theme: 'light' | 'dark' | 'system' };
        if (theme) {
          ThemeManager.updatePreference(theme);
        }
      }
    };

    chrome.runtime.onMessage.addListener(listener);

    const interval = setInterval(() => {
      if (!data) {
        loadData();
      }
    }, 2000);

    return () => {
      chrome.runtime.onMessage.removeListener(listener);
      clearInterval(interval);
    };
  }, [data]);

  useEffect(() => {
    initializeTheme();

    return () => {
      ThemeManager.cleanup();
    };
  }, []);

  const initializeTheme = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_THEME' });
      if (response.success && response.theme) {
        ThemeManager.initialize(response.theme);
      } else {
        ThemeManager.initialize('system');
      }
    } catch (error) {
      logger.error('Popup', 'Failed to initialize theme', toError(error));
      ThemeManager.initialize('system');
    }
  };

  const checkCurrentTab = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      setCurrentTab(tab);
    } catch (error) {
      logger.error('Popup', 'Failed to get current tab', toError(error));
    }
  };

  const loadData = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
      if (response && response.success) {
        setData(response.data);
      }
    } catch (error) {
      const err = toError(error);
      const errorMessage = err.message;
      if (errorMessage.includes('Could not establish connection') ||
          errorMessage.includes('Receiving end does not exist')) {
        logger.debug('Popup', 'Service worker not ready yet');
      } else {
        logger.error('Popup', 'Failed to load data', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadOnboardingState = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_ONBOARDING_STATE' });
      if (response?.success && response.onboarding) {
        setOnboardingState(response.onboarding);
      }
    } catch (error) {
      logger.error('Popup', 'Failed to load onboarding state', toError(error));
    }
  };

  const openWelcomeGuide = () => {
    chrome.tabs.create(
      {
        url: chrome.runtime.getURL(ONBOARDING.WELCOME_PAGE_PATH),
        active: true,
      },
      () => {
        if (chrome.runtime.lastError) {
          logger.warn('Popup', 'Unable to open welcome guide', {
            error: chrome.runtime.lastError.message,
          });
        } else {
          window.close();
        }
      }
    );
  };

  const openSettingsToBurner = () => {
    setSettingsDeepLink('burner-services');
    setHighlightBurnerToggle(true);
    setShowSettings(true);
  };

  const toggleProtection = async () => {
    if (isTogglingProtection) return;

    setIsTogglingProtection(true);

    const timeout = setTimeout(() => {
      setIsTogglingProtection(false);
      logger.warn('Popup', 'Toggle protection timed out');
    }, 5000);

    try {
      const response = await chrome.runtime.sendMessage({ type: 'TOGGLE_PROTECTION' });
      clearTimeout(timeout);

      if (response && response.success) {
        const newState = response.enabled;

        await loadData();

        setProtectionToastState(newState);
        setProtectionToastMessage(newState ? 'Protection Enabled' : 'Protection Paused');
        setShowProtectionToast(true);
        setTimeout(() => setShowProtectionToast(false), 3000);

        logger.info('Popup', 'Protection toggled', { enabled: newState });
      }
    } catch (error) {
      clearTimeout(timeout);
      const err = toError(error);
      const errorMessage = err.message;
      if (errorMessage.includes('Could not establish connection') ||
          errorMessage.includes('Receiving end does not exist')) {
        logger.debug('Popup', 'Service worker not ready for toggle');
      } else {
        logger.error('Popup', 'Failed to toggle protection', err);
      }
    } finally {
      setIsTogglingProtection(false);
    }
  };

  const toggleExpanded = (alertId: string) => {
    setExpandedAlerts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(alertId)) {
        newSet.delete(alertId);
      } else {
        newSet.add(alertId);
      }
      return newSet;
    });
  };

  const handleFeedbackSuccess = () => {
    setShowSuccessBanner(true);
    setTimeout(() => setShowSuccessBanner(false), 3000);
  };

  /**
   * Opens the settings modal to the feedback tab with alert context so the user can report violations.
   */
  const openReportDialog = (alert: AlertType) => {
    setReportingAlert(alert);
    setSettingsDeepLink('feedback');
    setShowSettings(true);
  };

  if (loading || !data) {
    return (
      <div className="w-full h-[500px] flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Activity className="w-6 h-6 animate-spin text-blue-600 dark:text-blue-400" />
      </div>
    );
  }

  const isValidWebPage = currentTab?.url &&
    (currentTab.url.startsWith('http://') || currentTab.url.startsWith('https://'));

  if (!isValidWebPage) {
    return (
      <div className="w-full h-[500px] flex flex-col bg-white dark:bg-gray-900">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Privaseer</h1>
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-8 flex flex-col items-center justify-center flex-1">
          <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4">
            <Shield className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Welcome</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center max-w-xs mb-6">
            Open this extension on a website to see privacy insights and tracker blocking.
          </p>
          <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 px-4 py-2 rounded-lg">
            Navigate to any http:// or https:// website
          </div>
        </div>

        {showSettings && (
          <ReportableSettingsPage
            isOpen={showSettings}
            onClose={() => setShowSettings(false)}
            currentTab={currentTab}
            onFeedbackSuccess={handleFeedbackSuccess}
          />
        )}

        {showSuccessBanner && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in">
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white px-6 py-3 rounded-lg shadow-2xl flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5" />
              <div>
                <p className="font-semibold text-sm">Feedback Submitted!</p>
                <p className="text-xs text-green-100">Thank you for helping us improve</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const score = data.privacyScore.current;
  const scoreColor = score >= 80 ? 'text-green-600' : score >= 60 ? 'text-amber-600' : 'text-red-600';
  const scoreBg = score >= 80 ? 'bg-green-50' : score >= 60 ? 'bg-amber-50' : 'bg-red-50';
  const scoreLabel = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Poor';

  return (
    <div className="w-full h-[600px] flex flex-col bg-white dark:bg-gray-900">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Privaseer</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={toggleProtection}
              disabled={isTogglingProtection}
              className={`p-2 rounded-lg transition-colors ${
                isTogglingProtection
                  ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                  : data.settings.protectionEnabled
                  ? 'bg-blue-600 dark:bg-blue-500 text-white hover:bg-blue-700 dark:hover:bg-blue-600'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
              title={isTogglingProtection ? 'Processing...' : data.settings.protectionEnabled ? 'Protection Enabled' : 'Protection Paused'}
            >
              {isTogglingProtection ? (
                <Activity className="w-4 h-4 animate-spin" />
              ) : data.settings.protectionEnabled ? (
                <Shield className="w-4 h-4" />
              ) : (
                <ShieldOff className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        <div className="flex gap-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'dashboard'
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Activity className="w-4 h-4" />
              <span>Dashboard</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('burner')}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'burner'
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Mail className="w-4 h-4" />
              <span>Burner Emails</span>
            </div>
          </button>
        </div>
      </div>

      {!onboardingState?.hasCompletedOnboarding && (
        <div className="mx-6 mt-4 flex items-center justify-between rounded-lg border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-900 shadow-sm dark:border-sky-900/50 dark:bg-sky-900/30 dark:text-sky-100">
          <div>
            <p className="font-semibold">Complete setup</p>
            <p className="text-xs text-sky-700 dark:text-sky-300">
              Finish the 2-minute welcome tour to unlock tips and shortcuts.
            </p>
          </div>
          <button
            onClick={openWelcomeGuide}
            className="rounded-md bg-sky-600 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white shadow hover:bg-sky-500"
          >
            Resume
          </button>
        </div>
      )}

      {activeTab === 'burner' && (
        <div className="flex-1 overflow-y-auto">
          <BurnerEmailsSection 
            onOpenSettings={openSettingsToBurner}
            isActive={true}
          />
        </div>
      )}
      {activeTab === 'dashboard' && (
        <>
      <div className={`px-6 py-5 ${scoreBg} border-b border-gray-200`}>

        <div className="flex items-center justify-center mb-3">
          <PrivacyScoreMeter score={score} />
        </div>

        <div className="text-center mb-3">
          <span className={`text-sm font-semibold ${scoreColor}`}>{scoreLabel} Privacy</span>
        </div>

        <div className="flex items-center justify-center gap-4 text-sm text-gray-600">
          <div className="flex items-center gap-1">
            <XCircle className="w-4 h-4" />
            <span className="font-semibold">{data.privacyScore.daily.trackersBlocked}</span>
            <span>blocked today</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Recent Activity</h2>
          {data.alerts.length > 0 && (
            <button
              onClick={async () => {
                try {
                  await chrome.runtime.sendMessage({ type: 'CLEAR_ALERTS' });
                  await loadData();
                } catch (error) {
                  logger.error('Popup', 'Failed to clear alerts', toError(error));
                }
              }}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 font-medium transition-colors"
            >
              Clear All
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {data.alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500 px-6 text-center">
              <CheckCircle2 className="w-12 h-12 mb-3" />
              <p className="text-sm">No activity yet</p>
              <p className="text-xs mt-1">Browse the web to see protection in action</p>
            </div>
          ) : (
            data.alerts.map((alert) => (
                <AlertItem
                key={alert.id}
                alert={alert}
                isExpanded={expandedAlerts.has(alert.id)}
                  onToggleExpanded={() => toggleExpanded(alert.id)}
                  onReport={openReportDialog}
              />
            ))
          )}
        </div>
      </div>
        </>
      )}

      {showSettings && (
        <ReportableSettingsPage
          isOpen={showSettings}
          onClose={() => {
            setShowSettings(false);
            setSettingsDeepLink(null);
            setHighlightBurnerToggle(false);
            setReportingAlert(null);
          }}
          currentTab={currentTab}
          onFeedbackSuccess={handleFeedbackSuccess}
          deepLinkSection={settingsDeepLink}
          highlightBurnerToggle={highlightBurnerToggle}
          onBurnerHighlightComplete={() => {
            setHighlightBurnerToggle(false);
            setSettingsDeepLink(null);
          }}
          reportContext={reportingAlert}
          onReportClear={() => setReportingAlert(null)}
        />
      )}

      {showSuccessBanner && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in">
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white px-6 py-3 rounded-lg shadow-2xl flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5" />
            <div>
              <p className="font-semibold text-sm">Feedback Submitted!</p>
              <p className="text-xs text-green-100">Thank you for helping us improve</p>
            </div>
          </div>
        </div>
      )}

      {showProtectionToast && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in">
          <div className={`${protectionToastState ? 'bg-gradient-to-r from-blue-500 to-blue-600' : 'bg-gradient-to-r from-gray-500 to-gray-600'} text-white px-6 py-3 rounded-lg shadow-2xl flex items-center gap-3`}>
            {protectionToastState ? (
              <Shield className="w-5 h-5" />
            ) : (
              <ShieldOff className="w-5 h-5" />
            )}
            <div>
              <p className="font-semibold text-sm">{protectionToastMessage}</p>
              <p className="text-xs opacity-90">
                {protectionToastState ? 'Trackers are now being blocked' : 'Trackers are not being blocked'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function AlertItem({
  alert,
  isExpanded,
  onToggleExpanded,
  onReport,
}: {
  alert: AlertType;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onReport: (alert: AlertType) => void;
}) {
  const [trackerInfo, setTrackerInfo] = useState<{ description: string; alternative: string } | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);

  const getSeverityIcon = () => {
    switch (alert.severity) {
      case 'high':
        return <div className="w-2 h-2 rounded-full bg-red-500" />;
      case 'medium':
        return <div className="w-2 h-2 rounded-full bg-amber-500" />;
      default:
        return <div className="w-2 h-2 rounded-full bg-green-500" />;
    }
  };

  const getTypeIcon = () => {
    switch (alert.type) {
      case 'high_risk':
        return <AlertTriangle className="w-4 h-4 text-red-600" />;
      case 'non_compliant_site':
        return <XCircle className="w-4 h-4 text-amber-600" />;
      case 'post_consent_violation':
        return <AlertTriangle className="w-4 h-4 text-red-600" />;
      default:
        return <Shield className="w-4 h-4 text-blue-600" />;
    }
  };

  const timeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const loadTrackerInfo = async () => {
    if (trackerInfo) {
      onToggleExpanded();
      return;
    }

    setLoadingInfo(true);
    try {
      const trackerDomain = alert.message.replace('Blocked ', '').trim();
      const response = await chrome.runtime.sendMessage({
        type: 'GET_TRACKER_INFO',
        data: { domain: trackerDomain }
      });

      if (response.success && response.info) {
        setTrackerInfo(response.info);
        onToggleExpanded();
      }
    } catch (error) {
      logger.error('Popup', 'Failed to load tracker info', toError(error));
    } finally {
      setLoadingInfo(false);
    }
  };

  const isTrackerAlert = alert.type === 'tracker_blocked' || alert.type === 'high_risk';
  const isCookieBannerAlert = alert.type === 'non_compliant_site';
  const isPostConsentViolation = alert.type === 'post_consent_violation';
  const isReportable = isCookieBannerAlert || isPostConsentViolation;
  const hasBannerDetails = isCookieBannerAlert && Boolean(alert.deceptivePatterns?.length);
  const hasViolationDetails = isPostConsentViolation && Boolean(alert.blockedTrackers?.length);

  const handleAlertClick = () => {
    if (isTrackerAlert) {
      loadTrackerInfo();
    } else if (hasBannerDetails || hasViolationDetails) {
      onToggleExpanded();
    }
  };

  const hasExpandableInfo = isTrackerAlert || hasBannerDetails || hasViolationDetails;

  return (
    <div className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-b border-gray-100 dark:border-gray-700">
      <div className="px-6 py-3 cursor-pointer" onClick={handleAlertClick}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5">{getSeverityIcon()}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 mb-1">
              <div className="mt-0.5">{getTypeIcon()}</div>
              <span className={`text-xs font-medium text-gray-900 dark:text-gray-100 flex-1 ${isExpanded ? '' : 'truncate'}`}>
                {alert.message}
              </span>
              {hasExpandableInfo && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAlertClick();
                  }}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors flex-shrink-0"
                  title={
                    isTrackerAlert
                      ? 'Show tracker info'
                      : isPostConsentViolation
                        ? 'Show violation details'
                        : 'Show banner details'
                  }
                  disabled={loadingInfo}
                >
                  {loadingInfo ? (
                    <Activity className="w-3 h-3 animate-spin text-gray-400" />
                  ) : (
                    <Info className="w-3 h-3 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400" />
                  )}
                </button>
              )}
              {isReportable && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onReport(alert);
                  }}
                  className="text-xs text-red-600 dark:text-red-400 hover:underline font-medium ml-2"
                >
                  Report
                </button>
              )}
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span className="truncate">{alert.domain}</span>
              <span className="ml-2 whitespace-nowrap">{timeAgo(alert.timestamp)}</span>
            </div>
          </div>
        </div>
      </div>

      {isExpanded && trackerInfo && isTrackerAlert && (
        <div className="px-6 pb-3">
          <div className="ml-5 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs">
            <div className="mb-2">
              <span className="font-semibold text-blue-900 dark:text-blue-300">What it does: </span>
              <span className="text-blue-800 dark:text-blue-400">{trackerInfo.description}</span>
            </div>
            <div>
              <span className="font-semibold text-blue-900 dark:text-blue-300">Alternative: </span>
              <span className="text-blue-800 dark:text-blue-400">{trackerInfo.alternative}</span>
            </div>
          </div>
        </div>
      )}

      {isExpanded && isCookieBannerAlert && alert.deceptivePatterns && alert.deceptivePatterns.length > 0 && (
        <div className="px-6 pb-3">
          <div className="ml-5 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs">
            <div className="mb-2">
              <span className="font-semibold text-amber-900 dark:text-amber-300">Banner Issues:</span>
            </div>
            <ul className="space-y-1 text-amber-800 dark:text-amber-400">
              {alert.deceptivePatterns.map((pattern, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-amber-600 dark:text-amber-500 mt-0.5">•</span>
                  <span>
                    {pattern === 'Forced Consent' && 'No reject button available - you must accept tracking'}
                    {pattern === 'Dark Pattern' && 'Accept button is more prominent than reject button'}
                    {pattern === 'Hidden Reject' && 'Reject button is hidden below the fold'}
                  </span>
                </li>
              ))}
            </ul>
            {alert.url && (
              <div className="mt-2 pt-2 border-t border-amber-200 dark:border-amber-800">
                <span className="font-semibold text-amber-900 dark:text-amber-300">URL: </span>
                <span className="text-amber-800 dark:text-amber-400 break-all">{alert.url}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {isExpanded && hasViolationDetails && alert.blockedTrackers && (
        <div className="px-6 pb-3">
          <div className="ml-5 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs">
            <div className="mb-2">
              <span className="font-semibold text-red-900 dark:text-red-300">GDPR Violation Detected</span>
            </div>
            <p className="text-red-800 dark:text-red-400 mb-2">
              This site loaded tracking scripts after you explicitly denied consent.
            </p>
            <div className="mt-2">
              <span className="font-semibold text-red-900 dark:text-red-300">Trackers loaded:</span>
              <ul className="mt-1 space-y-1 text-red-800 dark:text-red-400">
                {alert.blockedTrackers.map((tracker, idx) => (
                  <li key={`${tracker}-${idx}`} className="flex items-start gap-2">
                    <span className="text-red-600 dark:text-red-500 mt-0.5">•</span>
                    <span>{tracker}</span>
                  </li>
                ))}
              </ul>
            </div>
            {typeof alert.trackerCount === 'number' && (
              <div className="mt-2 text-red-900 dark:text-red-300">
                Total trackers detected after denial: <span className="font-semibold">{alert.trackerCount}</span>
              </div>
            )}
            {alert.url && (
              <div className="mt-2 pt-2 border-t border-red-200 dark:border-red-800">
                <span className="font-semibold text-red-900 dark:text-red-300">URL: </span>
                <span className="text-red-800 dark:text-red-400 break-all">{alert.url}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<Popup />);
}
