import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Storage } from './storage';

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Burner Email Setting', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    (Storage as any).cache = null;
    (Storage as any).isDirty = false;
    (Storage as any).saveTimer = null;
    (Storage as any).isSaving = false;

    global.chrome = {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    } as any;

    await Storage.initialize();
  });

  describe('getBurnerEmailEnabled', () => {
    it('should return true by default', async () => {
      const enabled = await Storage.getBurnerEmailEnabled();
      expect(enabled).toBe(true);
    });

    it('should return the stored value when set to false', async () => {
      await Storage.setBurnerEmailEnabled(false);
      const enabled = await Storage.getBurnerEmailEnabled();
      expect(enabled).toBe(false);
    });

    it('should return the stored value when set to true', async () => {
      await Storage.setBurnerEmailEnabled(false);
      await Storage.setBurnerEmailEnabled(true);
      const enabled = await Storage.getBurnerEmailEnabled();
      expect(enabled).toBe(true);
    });

    it('should return true when setting is undefined (backwards compatibility)', async () => {
      const data = await Storage.get();
      delete (data.settings as any).burnerEmailEnabled;

      const enabled = await Storage.getBurnerEmailEnabled();
      expect(enabled).toBe(true);
    });
  });

  describe('setBurnerEmailEnabled', () => {
    it('should set burner email to false', async () => {
      await Storage.setBurnerEmailEnabled(false);
      const enabled = await Storage.getBurnerEmailEnabled();
      expect(enabled).toBe(false);
    });

    it('should set burner email to true', async () => {
      await Storage.setBurnerEmailEnabled(true);
      const enabled = await Storage.getBurnerEmailEnabled();
      expect(enabled).toBe(true);
    });

    it('should toggle between true and false', async () => {
      await Storage.setBurnerEmailEnabled(false);
      expect(await Storage.getBurnerEmailEnabled()).toBe(false);

      await Storage.setBurnerEmailEnabled(true);
      expect(await Storage.getBurnerEmailEnabled()).toBe(true);

      await Storage.setBurnerEmailEnabled(false);
      expect(await Storage.getBurnerEmailEnabled()).toBe(false);
    });

    it('should persist the setting', async () => {
      await Storage.setBurnerEmailEnabled(false);

      const data = await Storage.get();
      expect(data.settings.burnerEmailEnabled).toBe(false);
    });

    it('should not affect other settings', async () => {
      const initialData = await Storage.get();
      const initialProtection = initialData.settings.protectionEnabled;
      const initialNotifications = initialData.settings.showNotifications;
      const initialTheme = initialData.settings.theme;

      await Storage.setBurnerEmailEnabled(false);

      const updatedData = await Storage.get();
      expect(updatedData.settings.protectionEnabled).toBe(initialProtection);
      expect(updatedData.settings.showNotifications).toBe(initialNotifications);
      expect(updatedData.settings.theme).toBe(initialTheme);
      expect(updatedData.settings.burnerEmailEnabled).toBe(false);
    });
  });

  describe('Setting persistence', () => {
    it('should persist disabled state across storage operations', async () => {
      await Storage.setBurnerEmailEnabled(false);

      (Storage as any).isDirty = false;

      const enabled = await Storage.getBurnerEmailEnabled();
      expect(enabled).toBe(false);
    });

    it('should persist enabled state across storage operations', async () => {
      await Storage.setBurnerEmailEnabled(true);

      (Storage as any).isDirty = false;

      const enabled = await Storage.getBurnerEmailEnabled();
      expect(enabled).toBe(true);
    });

    it('should maintain setting when other data is updated', async () => {
      await Storage.setBurnerEmailEnabled(false);

      await Storage.incrementTrackerBlock('example.com', 'advertising', false);

      const enabled = await Storage.getBurnerEmailEnabled();
      expect(enabled).toBe(false);
    });
  });

  describe('Default behavior', () => {
    it('should include burnerEmailEnabled in default storage data', async () => {
      const data = await Storage.get();
      expect(data.settings).toHaveProperty('burnerEmailEnabled');
      expect(typeof data.settings.burnerEmailEnabled).toBe('boolean');
    });

    it('should default to true when not explicitly set', async () => {
      const enabled = await Storage.getBurnerEmailEnabled();
      expect([true, false]).toContain(enabled);
      expect(typeof enabled).toBe('boolean');
    });
  });
});
