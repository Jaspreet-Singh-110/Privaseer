export interface Alert {
  id: string;
  type: 'tracker_blocked' | 'non_compliant_site' | 'high_risk';
  severity: 'low' | 'medium' | 'high';
  message: string;
  domain: string;
  timestamp: number;
  url?: string;
  deceptivePatterns?: string[];
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
}

export type MessageType =
  | 'STATE_UPDATE'
  | 'GET_STATE'
  | 'TOGGLE_PROTECTION'
  | 'CONSENT_SCAN_RESULT'
  | 'GET_TRACKER_INFO'
  | 'TRACKER_BLOCKED'
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
  | 'THEME_CHANGED';

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
export interface MessageDataMap {
  STATE_UPDATE: undefined;
  GET_STATE: undefined;
  TOGGLE_PROTECTION: undefined;
  CONSENT_SCAN_RESULT: ConsentScanResult;
  GET_TRACKER_INFO: GetTrackerInfoData;
  TRACKER_BLOCKED: undefined;
  TAB_ACTIVATED: undefined;
  TAB_UPDATED: undefined;
  TAB_REMOVED: undefined;
  CLEAR_ALERTS: undefined;
  EXTENSION_READY: undefined;
}

export interface Message<T = unknown> {
  type: MessageType;
  data?: T;
  requestId?: string;
  timestamp?: number;
}

export interface MessageHandler<T = unknown> {
  (data: T, sender: chrome.runtime.MessageSender): Promise<unknown> | unknown;
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
  deceptivePatterns: Array<{
    name: string;
    description: string;
    severity: string;
    penalty: number;
  }>;
}

export interface BurnerEmail {
  id: string;
  email: string;
  domain: string;
  url?: string;
  label?: string;
  is_active: boolean;
  times_used: number;
  created_at: string;
}
