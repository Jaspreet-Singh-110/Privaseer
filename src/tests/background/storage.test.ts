import { describe, it, expect } from 'vitest';
import { Storage } from '@/background/storage';

describe('Storage', () => {
  it('should initialize with default data', async () => {
    await Storage.initialize();
    const data = await Storage.get();

    expect(data).toHaveProperty('privacyScore');
    expect(data.privacyScore.current).toBeGreaterThanOrEqual(0);
    expect(data.privacyScore.current).toBeLessThanOrEqual(100);
    expect(data).toHaveProperty('alerts');
    expect(data).toHaveProperty('trackers');
    expect(data).toHaveProperty('settings');
  });

  it('should update privacy score', async () => {
    await Storage.updateScore(75);
    const data = await Storage.get();
    expect(data.privacyScore.current).toBe(75);
  });

  it('should clamp score to 0-100 range', async () => {
    await Storage.updateScore(-10);
    let data = await Storage.get();
    expect(data.privacyScore.current).toBe(0);

    await Storage.updateScore(150);
    data = await Storage.get();
    expect(data.privacyScore.current).toBe(100);
  });

  it('should add alerts', async () => {
    const initialData = await Storage.get();
    const initialCount = initialData.alerts.length;

    const alert = {
      id: `alert-${Date.now()}`,
      type: 'tracker_blocked' as const,
      severity: 'high' as const,
      domain: `tracker-${Date.now()}.com`,
      message: 'Tracker blocked',
      timestamp: Date.now(),
    };

    await Storage.addAlert(alert);
    const data = await Storage.get();

    expect(data.alerts.length).toBeGreaterThan(initialCount);
  });

  it('should clear all alerts', async () => {
    await Storage.clearAlerts();
    const data = await Storage.get();
    expect(data.alerts.length).toBe(0);
  });

  it('should toggle protection', async () => {
    const initialState = (await Storage.get()).settings.protectionEnabled;
    const newState = await Storage.toggleProtection();
    expect(newState).toBe(!initialState);
  });

  it('should default telemetry to disabled and allow toggling', async () => {
    const defaultState = await Storage.getTelemetryEnabled();
    expect(defaultState).toBe(false);

    await Storage.setTelemetryEnabled(true);
    expect(await Storage.getTelemetryEnabled()).toBe(true);

    await Storage.setTelemetryEnabled(false);
    expect(await Storage.getTelemetryEnabled()).toBe(false);
  });

  it('should handle storage get operation', async () => {
    await expect(Storage.get()).resolves.toBeDefined();
  });
});
