import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AllSettingsResponse } from '../types';
import { logger } from '../utils/logger';
import { toError } from '../utils/type-guards';
import '../index.css';
import { StepIndicator } from './components/StepIndicator';
import { NavigationButtons } from './components/NavigationButtons';
import { WelcomeStep } from './steps/WelcomeStep';
import { ProtectionStep } from './steps/ProtectionStep';
import { PrivacyScoreStep } from './steps/PrivacyScoreStep';
import { ConsentScannerStep } from './steps/ConsentScannerStep';
import { BurnerEmailStep } from './steps/BurnerEmailStep';
import { CompletionStep } from './steps/CompletionStep';
import type { StepContentProps } from './steps/types';

export type Theme = 'light' | 'dark';
type StepId =
  | 'welcome'
  | 'protection'
  | 'privacy-score'
  | 'consent'
  | 'burner-email'
  | 'completion';

interface StepDefinition {
  id: StepId;
  label: string;
  Component: (props: StepContentProps) => JSX.Element;
  primaryLabel?: string;
  showSkip?: boolean;
}

const steps: StepDefinition[] = [
  { id: 'welcome', label: 'Welcome', Component: WelcomeStep, primaryLabel: 'Get started' },
  { id: 'protection', label: 'Protection', Component: ProtectionStep },
  { id: 'privacy-score', label: 'Privacy Score', Component: PrivacyScoreStep },
  { id: 'consent', label: 'Consent Scanner', Component: ConsentScannerStep },
  { id: 'burner-email', label: 'Burner Email', Component: BurnerEmailStep },
  {
    id: 'completion',
    label: 'Finish',
    Component: CompletionStep,
    primaryLabel: 'Finish',
    showSkip: false,
  },
];

function WelcomeApp(): JSX.Element {
  const [themePreference, setThemePreference] = useState<'light' | 'dark' | 'system'>('system');
  const [resolvedTheme, setResolvedTheme] = useState<Theme>('dark');
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emailConfigured, setEmailConfigured] = useState(false);

  const totalSteps = steps.length;

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = (preference: 'light' | 'dark' | 'system', matches: boolean) => {
      const nextTheme = preference === 'system' ? (matches ? 'dark' : 'light') : preference;
      setResolvedTheme(nextTheme);
      document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    };

    applyTheme(themePreference, media.matches);

    const listener = (event: MediaQueryListEvent) => {
      if (themePreference === 'system') {
        applyTheme('system', event.matches);
      }
    };

    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [themePreference]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [onboardingResponse, settingsResponse] = await Promise.all([
          chrome.runtime.sendMessage({ type: 'GET_ONBOARDING_STATE' }),
          chrome.runtime.sendMessage({ type: 'GET_ALL_SETTINGS' }) as Promise<{
            success: boolean;
            settings: AllSettingsResponse;
          }>,
        ]);

        if (onboardingResponse?.success && onboardingResponse.onboarding) {
          setCurrentStep(
            Math.min(
              totalSteps - 1,
              Math.max(0, onboardingResponse.onboarding.currentStep ?? 0)
            )
          );
          setEmailConfigured(Boolean(onboardingResponse.onboarding.emailConfigured));
        }

        if (settingsResponse?.success) {
          const { settings } = settingsResponse;
          setEmailConfigured((prev) => prev || Boolean(settings.realEmail));
          setThemePreference(settings.theme ?? 'system');
        }
      } catch (err) {
        const errorObj = toError(err);
        setError(errorObj.message);
        logger.error('Welcome', 'Failed to load initial data', errorObj);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [totalSteps]);

  const goToStep = useCallback(
    async (nextStep: number) => {
      const clamped = Math.max(0, Math.min(totalSteps - 1, nextStep));
      setCurrentStep(clamped);
      try {
        await chrome.runtime.sendMessage({
          type: 'SET_ONBOARDING_STEP',
          data: { step: clamped },
        });
      } catch (err) {
        logger.warn('Welcome', 'Failed to persist onboarding step', toError(err));
      }
    },
    [totalSteps]
  );

  const completeOnboarding = useCallback(
    async (skip = false) => {
      try {
        if (skip) {
          await chrome.runtime.sendMessage({
            type: 'SKIP_ONBOARDING',
            data: { atStep: currentStep },
          });
        } else {
          await chrome.runtime.sendMessage({
            type: 'COMPLETE_ONBOARDING',
            data: { emailConfigured },
          });
        }
      } catch (err) {
        logger.warn('Welcome', 'Failed to update onboarding completion', toError(err));
      }
    },
    [currentStep, emailConfigured]
  );

  const handleNext = useCallback(async () => {
    const isLast = currentStep === totalSteps - 1;
    if (isLast) {
      await completeOnboarding(false);
      window.close();
      return;
    }
    await goToStep(currentStep + 1);
  }, [completeOnboarding, currentStep, goToStep, totalSteps]);

  const handleBack = useCallback(async () => {
    await goToStep(currentStep - 1);
  }, [currentStep, goToStep]);

  const handleSkip = useCallback(async () => {
    await completeOnboarding(true);
    window.close();
  }, [completeOnboarding]);

  const currentStepDefinition = steps[currentStep];
  const StepComponent = currentStepDefinition.Component;
  const labels = useMemo(() => steps.map((step) => step.label), []);

  const stepProps: StepContentProps = {
    theme: resolvedTheme,
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-gray-900">
        <p className="text-sm uppercase tracking-[0.3em] text-gray-400 dark:text-gray-500">Loading guide…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-gray-900">
        <div className="rounded-3xl border border-red-500/40 bg-red-500/10 px-8 py-6 text-center">
          <p className="text-lg font-semibold text-gray-900 dark:text-white">Unable to load onboarding</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-10">
        <StepIndicator
          currentStep={currentStep}
          totalSteps={totalSteps}
          labels={labels}
          theme={resolvedTheme}
        />
        <main className="flex flex-col gap-6">
          <StepComponent {...stepProps} />
          <NavigationButtons
            currentStep={currentStep}
            totalSteps={totalSteps}
            onBack={handleBack}
            onNext={handleNext}
            onSkip={handleSkip}
            primaryLabel={currentStepDefinition.primaryLabel}
            showSkip={currentStepDefinition.showSkip ?? true}
            theme={resolvedTheme}
          />
        </main>
      </div>
    </div>
  );
}

export { WelcomeApp };

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<WelcomeApp />);
}

