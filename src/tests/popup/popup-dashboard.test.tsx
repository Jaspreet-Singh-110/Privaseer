import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Popup } from '../../popup/popup';
import type { StorageData, Alert, CreditScoreResult } from '../../types';

// Mock BurnerEmailsSection to prevent heavy component render and memory issues
vi.mock('../../popup/burner-emails-section', () => ({
  BurnerEmailsSection: () => <div data-testid="mocked-burner-emails">Mocked Burner Emails</div>
}));

describe('Popup Dashboard Component', () => {
  const originalChrome = global.chrome;
  let mockSendMessage: ReturnType<typeof vi.fn>;
  let mockAddListener: ReturnType<typeof vi.fn>;
  let mockRemoveListener: ReturnType<typeof vi.fn>;
  let mockStorageGet: ReturnType<typeof vi.fn>;
  let mockStorageSet: ReturnType<typeof vi.fn>;
  let mockTabsQuery: ReturnType<typeof vi.fn>;

  const createMockCreditScore = (overrides?: Partial<CreditScoreResult>): CreditScoreResult => ({
    score: 650,
    label: 'Good',
    trend: 'stable',
    factors: {
      protectionConsistency: { value: 0.85, impact: 60 },
      cleanBrowsing: { value: 0.7, impact: 40 },
      highRiskExposure: { value: 0.15, impact: -30 },
      violations: { value: 0.1, impact: -20 },
    },
    lastCalculated: Date.now(),
    ...overrides,
  });

  const createMockStorageData = (overrides?: Partial<StorageData>): StorageData => ({
    privacyScore: {
      current: 75,
      daily: {
        trackersBlocked: 12,
        cleanSitesVisited: 5,
        nonCompliantSites: 2,
      },
      history: [],
    },
    creditScore: createMockCreditScore(),
    alerts: [],
    trackers: {},
    settings: {
      protectionEnabled: true,
      showNotifications: true,
      theme: 'system',
      burnerEmailEnabled: false,
      telemetryEnabled: false,
    },
    lastReset: Date.now(),
    consentStates: {},
    domainOccurrences: {},
    dailySnapshots: [],
    onboarding: {
      hasCompletedOnboarding: true,
      currentStep: 0,
    },
    ...overrides,
  });

  const createMockAlert = (overrides?: Partial<Alert>): Alert => ({
    id: `alert-${Date.now()}`,
    type: 'tracker_blocked',
    severity: 'medium',
    message: 'Blocked tracker.example.com',
    domain: 'example.com',
    timestamp: Date.now(),
    ...overrides,
  });

  // Helper to setup mock with custom storage data
  const setupMockWithData = (dataOverrides?: Partial<StorageData>) => {
    mockSendMessage.mockImplementation((message) => {
      if (message.type === 'GET_STATE') {
        return Promise.resolve({
          success: true,
          data: createMockStorageData(dataOverrides),
        });
      }
      if (message.type === 'GET_THEME') {
        return Promise.resolve({ success: true, theme: 'system' });
      }
      if (message.type === 'GET_ONBOARDING_STATE') {
        return Promise.resolve({
          success: true,
          onboarding: { hasCompletedOnboarding: true, currentStep: 0 },
        });
      }
      if (message.type === 'GET_BURNER_EMAIL_SETTING') {
        return Promise.resolve({ success: true, enabled: false });
      }
      if (message.type === 'GET_BURNER_EMAILS') {
        return Promise.resolve({ success: true, emails: [] });
      }
      if (message.type === 'GET_REAL_EMAIL') {
        return Promise.resolve({ success: true, email: null });
      }
      if (message.type === 'CLEAR_ALERTS') {
        return Promise.resolve({ success: true });
      }
      return Promise.resolve({ success: true });
    });
  };

  beforeEach(() => {
    mockSendMessage = vi.fn();
    mockAddListener = vi.fn();
    mockRemoveListener = vi.fn();
    mockStorageGet = vi.fn().mockResolvedValue({});
    mockStorageSet = vi.fn().mockResolvedValue(undefined);
    mockTabsQuery = vi.fn().mockResolvedValue([{ url: 'https://example.com', active: true }]);

    // Mock Chrome APIs
    global.chrome = {
      runtime: {
        sendMessage: mockSendMessage,
        onMessage: {
          addListener: mockAddListener,
          removeListener: mockRemoveListener,
        },
        getURL: vi.fn((path) => `chrome-extension://test/${path}`),
      },
      tabs: {
        query: mockTabsQuery,
        create: vi.fn(),
      },
      storage: {
        local: {
          get: mockStorageGet,
          set: mockStorageSet,
        },
      },
    } as unknown as typeof chrome;

    // Default mock implementation
    mockSendMessage.mockImplementation((message) => {
      if (message.type === 'GET_STATE') {
        return Promise.resolve({
          success: true,
          data: createMockStorageData(),
        });
      }
      if (message.type === 'GET_THEME') {
        return Promise.resolve({ success: true, theme: 'system' });
      }
      if (message.type === 'GET_ONBOARDING_STATE') {
        return Promise.resolve({
          success: true,
          onboarding: { hasCompletedOnboarding: true, currentStep: 0 },
        });
      }
      if (message.type === 'GET_BURNER_EMAIL_SETTING') {
        return Promise.resolve({ success: true, enabled: false });
      }
      if (message.type === 'GET_BURNER_EMAILS') {
        return Promise.resolve({ success: true, emails: [] });
      }
      if (message.type === 'GET_REAL_EMAIL') {
        return Promise.resolve({ success: true, email: null });
      }
      return Promise.resolve({ success: true });
    });
  });

  afterEach(() => {
    cleanup(); // Unmount React components
    vi.clearAllMocks();
    vi.useRealTimers();
    global.chrome = originalChrome;
  });

  describe('Tab Switching', () => {
    it('should display dashboard tab as active by default', async () => {
      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByText('Dashboard')).toBeInTheDocument();
      }, { timeout: 500 });

      const dashboardButton = screen.getByRole('button', { name: /dashboard/i });
      expect(dashboardButton).toHaveClass('bg-white');
    });

    it('should switch to Burner Emails tab and display BurnerEmailsSection', async () => {
      const user = userEvent.setup({ delay: null }); // Remove realistic delays

      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByText('Dashboard')).toBeInTheDocument();
      }, { timeout: 500 });

      const burnerButton = screen.getByRole('button', { name: /burner emails/i });
      await user.click(burnerButton);

      await waitFor(() => {
        expect(burnerButton).toHaveClass('bg-white');
        expect(screen.getByText('Burner Emails')).toBeInTheDocument();
        // Check for mocked BurnerEmailsSection
        expect(screen.getByTestId('mocked-burner-emails')).toBeInTheDocument();
      }, { timeout: 500 });
    });

    it('should switch back to Dashboard tab after viewing Burner Emails', async () => {
      const user = userEvent.setup({ delay: null });

      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByText('Dashboard')).toBeInTheDocument();
      }, { timeout: 500 });

      // Switch to Burner Emails
      const burnerButton = screen.getByRole('button', { name: /burner emails/i });
      await user.click(burnerButton);

      await waitFor(() => {
        expect(screen.getByTestId('mocked-burner-emails')).toBeInTheDocument();
      }, { timeout: 500 });

      // Switch back to Dashboard
      const dashboardButton = screen.getByRole('button', { name: /dashboard/i });
      await user.click(dashboardButton);

      await waitFor(() => {
        expect(dashboardButton).toHaveClass('bg-white');
        // Credit score should be visible
        expect(screen.getByText('Score: 650 / 850')).toBeInTheDocument();
      }, { timeout: 500 });
    });
  });

  describe('Privacy Score Display', () => {
    it('should render privacy score with correct value', async () => {
      setupMockWithData({
        creditScore: createMockCreditScore({ score: 780, label: 'Excellent' }),
      });

      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByText('Score: 780 / 850')).toBeInTheDocument();
      }, { timeout: 500 });
    });

    it('should display "Excellent" label for score >= 750', async () => {
      mockSendMessage.mockImplementation((message) => {
        if (message.type === 'GET_STATE') {
          return Promise.resolve({
            success: true,
            data: createMockStorageData({ creditScore: createMockCreditScore({ score: 780, label: 'Excellent' }) }),
          });
        }
        if (message.type === 'GET_THEME') {
          return Promise.resolve({ success: true, theme: 'system' });
        }
        if (message.type === 'GET_ONBOARDING_STATE') {
          return Promise.resolve({
            success: true,
            onboarding: { hasCompletedOnboarding: true, currentStep: 0 },
          });
        }
        return Promise.resolve({ success: true });
      });

      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByText('Excellent')).toBeInTheDocument();
      }, { timeout: 500 });
    });

    it('should display "Good" label for score >= 650 and < 750', async () => {
      mockSendMessage.mockImplementation((message) => {
        if (message.type === 'GET_STATE') {
          return Promise.resolve({
            success: true,
            data: createMockStorageData({ creditScore: createMockCreditScore({ score: 700, label: 'Good' }) }),
          });
        }
        if (message.type === 'GET_THEME') {
          return Promise.resolve({ success: true, theme: 'system' });
        }
        if (message.type === 'GET_ONBOARDING_STATE') {
          return Promise.resolve({
            success: true,
            onboarding: { hasCompletedOnboarding: true, currentStep: 0 },
          });
        }
        return Promise.resolve({ success: true });
      });

      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByText('Good')).toBeInTheDocument();
      }, { timeout: 500 });
    });

    it('should display "Fair" label for score >= 550 and < 650', async () => {
      mockSendMessage.mockImplementation((message) => {
        if (message.type === 'GET_STATE') {
          return Promise.resolve({
            success: true,
            data: createMockStorageData({ creditScore: createMockCreditScore({ score: 600, label: 'Fair' }) }),
          });
        }
        if (message.type === 'GET_THEME') {
          return Promise.resolve({ success: true, theme: 'system' });
        }
        if (message.type === 'GET_ONBOARDING_STATE') {
          return Promise.resolve({
            success: true,
            onboarding: { hasCompletedOnboarding: true, currentStep: 0 },
          });
        }
        return Promise.resolve({ success: true });
      });

      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByText('Fair')).toBeInTheDocument();
      }, { timeout: 500 });
    });

    it('should animate credit score to target value', async () => {
      mockSendMessage.mockImplementation((message) => {
        if (message.type === 'GET_STATE') {
          return Promise.resolve({
            success: true,
            data: createMockStorageData({ creditScore: createMockCreditScore({ score: 700, label: 'Good' }) }),
          });
        }
        if (message.type === 'GET_THEME') {
          return Promise.resolve({ success: true, theme: 'system' });
        }
        if (message.type === 'GET_ONBOARDING_STATE') {
          return Promise.resolve({
            success: true,
            onboarding: { hasCompletedOnboarding: true, currentStep: 0 },
          });
        }
        return Promise.resolve({ success: true });
      });

      render(<Popup />);

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByText('Score: 700 / 850')).toBeInTheDocument();
      }, { timeout: 500 });

      // Wait for animation to complete (1500ms + buffer)
      await new Promise(resolve => setTimeout(resolve, 1600));

      // Check final animated value
      await waitFor(() => {
        const scoreText = screen.getByText('700');
        expect(scoreText).toBeInTheDocument();
      }, { timeout: 500 });
    });

    it('should display daily trackers blocked count', async () => {
      mockSendMessage.mockImplementation((message) => {
        if (message.type === 'GET_STATE') {
          return Promise.resolve({
            success: true,
            data: createMockStorageData({ privacyScore: { current: 75, daily: { trackersBlocked: 42, cleanSitesVisited: 5, nonCompliantSites: 2 }, history: [] } }),
          });
        }
        if (message.type === 'GET_THEME') {
          return Promise.resolve({ success: true, theme: 'system' });
        }
        if (message.type === 'GET_ONBOARDING_STATE') {
          return Promise.resolve({
            success: true,
            onboarding: { hasCompletedOnboarding: true, currentStep: 0 },
          });
        }
        return Promise.resolve({ success: true });
      });

      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByText('42')).toBeInTheDocument();
        expect(screen.getByText('blocked today')).toBeInTheDocument();
      }, { timeout: 500 });
    });
  });

  describe('Alerts Rendering', () => {
    it('should display empty state when no alerts exist', async () => {
      mockSendMessage.mockImplementation((message) => {
        if (message.type === 'GET_STATE') {
          return Promise.resolve({
            success: true,
            data: createMockStorageData({ alerts: [] }),
          });
        }
        if (message.type === 'GET_THEME') {
          return Promise.resolve({ success: true, theme: 'system' });
        }
        if (message.type === 'GET_ONBOARDING_STATE') {
          return Promise.resolve({
            success: true,
            onboarding: { hasCompletedOnboarding: true, currentStep: 0 },
          });
        }
        return Promise.resolve({ success: true });
      });

      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByText('No activity yet')).toBeInTheDocument();
        expect(screen.getByText('Browse the web to see protection in action')).toBeInTheDocument();
      }, { timeout: 500 });
    });

    it('should render list of alerts with message, domain, and timestamp', async () => {
      const alerts = [
        createMockAlert({
          id: 'alert-1',
          message: 'Blocked tracker-one.com',
          domain: 'example.com',
          type: 'tracker_blocked',
          severity: 'medium',
        }),
        createMockAlert({
          id: 'alert-2',
          message: 'Blocked tracker-two.com',
          domain: 'test.com',
          type: 'high_risk',
          severity: 'high',
        }),
      ];

      mockSendMessage.mockImplementation((message) => {
        if (message.type === 'GET_STATE') {
          return Promise.resolve({
            success: true,
            data: createMockStorageData({ alerts }),
          });
        }
        if (message.type === 'GET_THEME') {
          return Promise.resolve({ success: true, theme: 'system' });
        }
        if (message.type === 'GET_ONBOARDING_STATE') {
          return Promise.resolve({
            success: true,
            onboarding: { hasCompletedOnboarding: true, currentStep: 0 },
          });
        }
        return Promise.resolve({ success: true });
      });

      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByText('Blocked tracker-one.com')).toBeInTheDocument();
        expect(screen.getByText('Blocked tracker-two.com')).toBeInTheDocument();
        expect(screen.getByText('example.com')).toBeInTheDocument();
        expect(screen.getByText('test.com')).toBeInTheDocument();
      }, { timeout: 500 });
    });

    it('should display different alert types correctly', async () => {
      const alerts = [
        createMockAlert({
          id: 'alert-1',
          message: 'Blocked tracker',
          domain: 'example.com',
          type: 'tracker_blocked',
          severity: 'low',
        }),
        createMockAlert({
          id: 'alert-2',
          message: 'Non-compliant cookie banner',
          domain: 'test.com',
          type: 'non_compliant_site',
          severity: 'medium',
        }),
        createMockAlert({
          id: 'alert-3',
          message: 'Post-consent violation detected',
          domain: 'bad.com',
          type: 'post_consent_violation',
          severity: 'high',
        }),
      ];

      mockSendMessage.mockImplementation((message) => {
        if (message.type === 'GET_STATE') {
          return Promise.resolve({
            success: true,
            data: createMockStorageData({ alerts }),
          });
        }
        if (message.type === 'GET_THEME') {
          return Promise.resolve({ success: true, theme: 'system' });
        }
        if (message.type === 'GET_ONBOARDING_STATE') {
          return Promise.resolve({
            success: true,
            onboarding: { hasCompletedOnboarding: true, currentStep: 0 },
          });
        }
        return Promise.resolve({ success: true });
      });

      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByText('Blocked tracker')).toBeInTheDocument();
        expect(screen.getByText('Non-compliant cookie banner')).toBeInTheDocument();
        expect(screen.getByText('Post-consent violation detected')).toBeInTheDocument();
      }, { timeout: 500 });
    });

    it('should expand alert to show deceptive patterns when clicked', async () => {
      const user = userEvent.setup({ delay: null });

      const alerts = [
        createMockAlert({
          id: 'alert-1',
          message: 'example.com may not follow privacy best practices',
          domain: 'example.com',
          type: 'non_compliant_site',
          severity: 'medium',
          deceptivePatterns: ['forcedConsent', 'acceptButtonProminence'],
        }),
      ];

      mockSendMessage.mockImplementation((message) => {
        if (message.type === 'GET_STATE') {
          return Promise.resolve({
            success: true,
            data: createMockStorageData({ alerts }),
          });
        }
        if (message.type === 'GET_THEME') {
          return Promise.resolve({ success: true, theme: 'system' });
        }
        if (message.type === 'GET_ONBOARDING_STATE') {
          return Promise.resolve({
            success: true,
            onboarding: { hasCompletedOnboarding: true, currentStep: 0 },
          });
        }
        return Promise.resolve({ success: true });
      });

      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByText('example.com may not follow privacy best practices')).toBeInTheDocument();
      }, { timeout: 500 });

      // Click the alert to expand
      const alertElement = screen.getByText('example.com may not follow privacy best practices').closest('div');
      if (alertElement) {
        await user.click(alertElement);
      }

      await waitFor(() => {
        expect(screen.getByText('Banner observations:')).toBeInTheDocument();
        expect(screen.getByText(/Limited consent options available/)).toBeInTheDocument();
        expect(screen.getByText(/Accept option appears more prominent/)).toBeInTheDocument();
      }, { timeout: 500 });
    });
  });

  describe('Clear All Alerts', () => {
    it('should not display Clear All button when no alerts exist', async () => {
      mockSendMessage.mockImplementation((message) => {
        if (message.type === 'GET_STATE') {
          return Promise.resolve({
            success: true,
            data: createMockStorageData({ alerts: [] }),
          });
        }
        if (message.type === 'GET_THEME') {
          return Promise.resolve({ success: true, theme: 'system' });
        }
        if (message.type === 'GET_ONBOARDING_STATE') {
          return Promise.resolve({
            success: true,
            onboarding: { hasCompletedOnboarding: true, currentStep: 0 },
          });
        }
        return Promise.resolve({ success: true });
      });

      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByText('No activity yet')).toBeInTheDocument();
      }, { timeout: 500 });

      expect(screen.queryByText('Clear All')).not.toBeInTheDocument();
    });

    it('should display Clear All button when alerts exist', async () => {
      const alerts = [
        createMockAlert({
          id: 'alert-1',
          message: 'Blocked tracker',
          domain: 'example.com',
        }),
      ];

      mockSendMessage.mockImplementation((message) => {
        if (message.type === 'GET_STATE') {
          return Promise.resolve({
            success: true,
            data: createMockStorageData({ alerts }),
          });
        }
        if (message.type === 'GET_THEME') {
          return Promise.resolve({ success: true, theme: 'system' });
        }
        if (message.type === 'GET_ONBOARDING_STATE') {
          return Promise.resolve({
            success: true,
            onboarding: { hasCompletedOnboarding: true, currentStep: 0 },
          });
        }
        return Promise.resolve({ success: true });
      });

      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByText('Clear All')).toBeInTheDocument();
      }, { timeout: 500 });
    });

    it('should send CLEAR_ALERTS message and reload data when Clear All is clicked', async () => {
      const user = userEvent.setup({ delay: null });

      const alerts = [
        createMockAlert({
          id: 'alert-1',
          message: 'Blocked tracker',
          domain: 'example.com',
        }),
      ];

      let callCount = 0;
      mockSendMessage.mockImplementation((message) => {
        if (message.type === 'GET_STATE') {
          callCount++;
          // First call returns alerts, second call (after clear) returns empty
          return Promise.resolve({
            success: true,
            data: createMockStorageData({ alerts: callCount === 1 ? alerts : [] }),
          });
        }
        if (message.type === 'GET_THEME') {
          return Promise.resolve({ success: true, theme: 'system' });
        }
        if (message.type === 'GET_ONBOARDING_STATE') {
          return Promise.resolve({
            success: true,
            onboarding: { hasCompletedOnboarding: true, currentStep: 0 },
          });
        }
        if (message.type === 'CLEAR_ALERTS') {
          return Promise.resolve({ success: true });
        }
        return Promise.resolve({ success: true });
      });

      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByText('Clear All')).toBeInTheDocument();
      }, { timeout: 500 });

      const clearButton = screen.getByText('Clear All');
      await user.click(clearButton);

      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith({ type: 'CLEAR_ALERTS' });
      }, { timeout: 500 });

      // After clearing, should reload data and show empty state
      await waitFor(() => {
        expect(screen.getByText('No activity yet')).toBeInTheDocument();
      }, { timeout: 500 });
    });
  });
});

