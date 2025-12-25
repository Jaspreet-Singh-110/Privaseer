import { describe, it, expect, beforeAll } from 'vitest';
import { Storage } from '@/background/storage';
import { ONBOARDING } from '@/utils/constants';

describe('Onboarding storage', () => {
  beforeAll(async () => {
    await Storage.initialize();
  });

  it('clamps onboarding step within bounds', async () => {
    const state = await Storage.setOnboardingStep(ONBOARDING.TOTAL_STEPS + 5);
    expect(state.currentStep).toBe(ONBOARDING.TOTAL_STEPS - 1);
    expect(state.hasCompletedOnboarding).toBe(false);
  });

  it('marks onboarding as complete with metadata', async () => {
    const state = await Storage.completeOnboarding(true);
    expect(state.hasCompletedOnboarding).toBe(true);
    expect(state.emailConfigured).toBe(true);
    expect(state.completedAt).toBeTypeOf('number');
  });

  it('records skipped onboarding state', async () => {
    const state = await Storage.skipOnboarding(2);
    expect(state.hasCompletedOnboarding).toBe(true);
    expect(state.skippedAt).toBeTypeOf('number');
    expect(state.currentStep).toBe(2);
  });
});

