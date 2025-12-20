export interface Alert {
  id: string;
  type: 'tracker_blocked' | 'non_compliant_site' | 'high_risk' | 'post_consent_violation';
  severity: 'low' | 'medium' | 'high';
  message: string;
  domain: string;
  timestamp: number;
  url?: string;
  deceptivePatterns?: string[];
  trackerCount?: number;
  blockedTrackers?: string[];
}

export interface PrivacyScore {
  current: number;
  daily: {
    trackersBlocked: number;
    cleanSitesVisited: number;
    nonCompliantSites: number;
  };
  history: Array<{
    date: string;
    score: number;
    trackersBlocked: number;
  }>;
}

export interface TrackerData {
  domain: string;
  category: string;
  isHighRisk: boolean;
  blockedCount: number;
  lastBlocked: number;
}

export interface DeceptivePatternRule {
  id: string;
  name: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  penalty: number;
}

export interface DeceptivePatternViolation {
  id: string;
  name: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  penalty: number;
}

export interface PrivacyRules {
  version: string;
  cookieBannerSelectors: string[];
  rejectButtonPatterns: string[];
  acceptButtonPatterns: string[];
  complianceChecks: {
    rejectButtonRequired: boolean;
    rejectButtonVisibleWithoutScroll: boolean;
    equalProminence: boolean;
    noPreCheckedBoxes: boolean;
    explicitConsent: boolean;
  };
  deceptivePatterns: DeceptivePatternRule[];
}

export interface ConsentScanResult {
  url: string;
  hasBanner: boolean;
  hasRejectButton: boolean;
  isCompliant: boolean;
  deceptivePatterns: string[];
  violations?: DeceptivePatternViolation[];
  complianceScore?: number;
  timestamp: number;
  cmpDetection?: CMPDetectionResult;
  hasPersistedConsent?: boolean;
}

export interface CMPDetectionResult {
  detected: boolean;
  cmpType: string;
  detectionMethod: 'cookie' | 'api' | 'banner' | 'hybrid';
  confidenceScore: number;
  consentStatus?: 'accepted' | 'rejected' | 'partial' | 'unknown';
  cookieNames: string[];
  tcfVersion?: string;
  hasRejectButton?: boolean;
}

export interface ConsentState {
  id: string;
  installationId: string;
  domain: string;
  cmpType: string;
  consentStatus: 'accepted' | 'rejected' | 'partial' | 'unknown';
  hasRejectButton: boolean;
  isCompliant: boolean;
  cookieNames: string[];
  tcfVersion?: string;
  firstSeen: string;
  lastVerified: string;
  createdAt: string;
}

export interface LocalConsentState {
  domain: string;
  consentStatus: 'accepted' | 'rejected' | 'dismissed' | 'unknown';
  cmpId: string;
  timestamp: number;
  choice: 'explicit' | 'implied' | 'none';
  expiresAt?: number;
}

export interface DailyMetricsSnapshot {
  date: string;
  privacyScore: number;
  trackersBlocked: number;
  trackersByCategory: Record<string, number>;
  cleanSitesVisited: number;
  nonCompliantSites: number;
  complianceScores: number[];
  burnerEmailsGenerated: number;
  burnerEmailsForwarded: number;
}

export interface MetricsAggregation {
  period: 'week' | 'month' | 'all-time';
  totalTrackersBlocked: number;
  trackersByCategory: Record<string, number>;
  averagePrivacyScore: number;
  averageComplianceScore: number;
  cleanSitesVisited: number;
  nonCompliantSites: number;
  burnerEmailsGenerated: number;
  burnerEmailsForwarded: number;
  topBlockedDomains: Array<{ domain: string; count: number }>;
}

export interface TelemetryReport {
  installationId: string;
  reportDate: string;
  dailyMetrics: DailyMetricsSnapshot;
  weeklyAggregation: MetricsAggregation;
  extensionVersion: string;
  privacyScoreTrend: Array<{ date: string; score: number }>;
}

export interface StorageData {
  privacyScore: PrivacyScore;
  alerts: Alert[];
  trackers: Record<string, TrackerData>;
  settings: {
    protectionEnabled: boolean;
    showNotifications: boolean;
    theme: 'light' | 'dark' | 'system';
    burnerEmailEnabled: boolean;
    telemetryEnabled: boolean;
  };
  lastReset: number;
  penalizedDomains?: Record<string, number>;
  consentStates: Record<string, LocalConsentState>;
  domainOccurrences: Record<string, number>;
  dailySnapshots?: DailyMetricsSnapshot[];
  burnerEmailStats?: {
    generated: number;
    forwarded: number;
  };
  complianceScores?: number[];
  realEmail?: string; // User's real email for forwarding
}

export type MessageType =
  | 'STATE_UPDATE'
  | 'GET_STATE'
  | 'TOGGLE_PROTECTION'
  | 'CONSENT_SCAN_RESULT'
  | 'GET_TRACKER_INFO'
  | 'TRACKER_BLOCKED'
  | 'POST_CONSENT_VIOLATION'
  | 'TAB_ACTIVATED'
  | 'TAB_UPDATED'
  | 'TAB_REMOVED'
  | 'CLEAR_ALERTS'
  | 'EXTENSION_READY'
  | 'GENERATE_BURNER_EMAIL'
  | 'GET_BURNER_EMAILS'
  | 'DELETE_BURNER_EMAIL'
  | 'GET_BURNER_EMAIL_SETTING'
  | 'SET_BURNER_EMAIL_SETTING'
  | 'BURNER_EMAIL_SETTING_CHANGED'
  | 'GET_TELEMETRY_SETTING'
  | 'SET_TELEMETRY_SETTING'
  | 'TELEMETRY_SETTING_CHANGED'
  | 'SUBMIT_FEEDBACK'
  | 'TRACK_EVENT'
  | 'RECORD_COMPLIANCE_SCORE'
  | 'GET_METRICS_AGGREGATION'
  | 'GET_PRIVACY_SCORE_TREND'
  | 'SET_THEME'
  | 'GET_THEME'
  | 'THEME_CHANGED'
  | 'GET_REAL_EMAIL'
  | 'SET_REAL_EMAIL';

// Message data types for type-safe messaging
export interface GetTrackerInfoData {
  domain: string;
}

export interface GetTrackerInfoResponse {
  success: boolean;
  info?: {
    description: string;
    alternative: string;
  };
  error?: string;
}

export interface GetStateResponse {
  success: boolean;
  data?: StorageData;
  error?: string;
}

export interface ToggleProtectionResponse {
  success: boolean;
  enabled?: boolean;
  error?: string;
}

export interface MessageResponse {
  success: boolean;
  error?: string;
  [key: string]: unknown;
}

// Map of message types to their data types
export interface TabSummary {
  id: number;
  url?: string;
  title?: string;
  active: boolean;
  blockCount: number;
  lastUpdate: number;
  status?: 'loading' | 'complete';
}

export interface MessageDataMap {
  STATE_UPDATE: undefined;
  GET_STATE: undefined;
  TOGGLE_PROTECTION: undefined;
  CONSENT_SCAN_RESULT: ConsentScanResult;
  GET_TRACKER_INFO: GetTrackerInfoData;
  TRACKER_BLOCKED: undefined;
  POST_CONSENT_VIOLATION: { domain: string; count: number; trackers: string[] };
  TAB_ACTIVATED: { tabId: number; tab?: TabSummary };
  TAB_UPDATED: { tabId: number; changeInfo?: Record<string, unknown>; tab?: TabSummary };
  TAB_REMOVED: { tabId: number };
  CLEAR_ALERTS: undefined;
  EXTENSION_READY: undefined;
  GENERATE_BURNER_EMAIL: { domain: string; url?: string; label?: string };
  GET_BURNER_EMAILS: undefined;
  DELETE_BURNER_EMAIL: { emailId: string };
  SUBMIT_FEEDBACK: { feedbackText: string; url?: string; domain?: string };
  GET_BURNER_EMAIL_SETTING: undefined;
  SET_BURNER_EMAIL_SETTING: { enabled: boolean };
  BURNER_EMAIL_SETTING_CHANGED: { enabled: boolean };
  GET_METRICS_AGGREGATION: { period?: 'week' | 'month' | 'all-time' } | undefined;
  GET_PRIVACY_SCORE_TREND: undefined;
  GET_TELEMETRY_SETTING: undefined;
  SET_TELEMETRY_SETTING: { enabled: boolean };
  TELEMETRY_SETTING_CHANGED: { enabled: boolean };
  GET_REAL_EMAIL: undefined;
  SET_REAL_EMAIL: { email: string };
  SET_THEME: { theme: 'light' | 'dark' | 'system' };
  GET_THEME: undefined;
  THEME_CHANGED: { theme: 'light' | 'dark' | 'system' };
  TRACK_EVENT: { eventType: string; eventData?: Record<string, unknown> };
  RECORD_COMPLIANCE_SCORE: { score: number };
}

export interface Message<T extends MessageType = MessageType> {
  type: T;
  data?: MessageDataMap[T];
  requestId?: string;
  timestamp?: number;
}

export interface MessageHandler<T extends MessageType = MessageType> {
  (data: MessageDataMap[T], sender: chrome.runtime.MessageSender): Promise<unknown> | unknown;
}

// Backward compatibility alias
export type MessagePayload = Message;

export interface TrackerLists {
  version: string;
  lastUpdated: string;
  categories: {
    analytics: string[];
    advertising: string[];
    social: string[];
    fingerprinting: string[];
    beacons: string[];
  };
  highRisk: string[];
}

export interface BurnerEmail {
  id: string;
  email_address: string;
  domain: string;
  url?: string;
  label?: string;
  is_active: boolean;
  times_used: number;
  created_at: string;
}

export type BurnerEmailError =
  | 'disabled'
  | 'no_real_email'
  | 'auth_failed'
  | 'rate_limited'
  | 'blocked'
  | 'unknown';
