import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, beforeEach, expect, vi } from 'vitest';
import { WelcomeApp } from '@/welcome/welcome';

const sendMessageMock = chrome.runtime.sendMessage as unknown as vi.Mock;

describe('WelcomeApp', () => {
  beforeEach(() => {
    sendMessageMock.mockReset();
    sendMessageMock.mockImplementation((message: { type: string }) => {
      switch (message?.type) {
        case 'GET_ONBOARDING_STATE':
          return Promise.resolve({
            success: true,
            onboarding: {
              hasCompletedOnboarding: false,
              currentStep: 0,
            },
          });
        case 'GET_ALL_SETTINGS':
          return Promise.resolve({
            success: true,
            settings: {
              theme: 'system',
              burnerEmailEnabled: false,
              telemetryEnabled: false,
              realEmail: null,
            },
          });
        default:
          return Promise.resolve({ success: true });
      }
    });

    (chrome.tabs as any).create = vi.fn((_: unknown, callback?: () => void) => {
      callback?.();
      return 123 as any;
    });
  });

  it('renders welcome hero after initial load', async () => {
    render(<WelcomeApp />);

    expect(await screen.findByText(/privacy copilot/i)).toBeInTheDocument();
    expect(screen.getByText(/step 1/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /skip tour/i })).toBeInTheDocument();
  });

  it('advances to next step when continue is clicked', async () => {
    const user = userEvent.setup();
    render(<WelcomeApp />);
    await screen.findByText(/privacy copilot/i);

    const button = await screen.findByRole('button', { name: /get started/i });
    await user.click(button);

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith({
        type: 'SET_ONBOARDING_STEP',
        data: { step: 1 },
      });
    });
  });
});

