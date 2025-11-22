import { describe, it, expect } from 'vitest';
import { tabManager } from '@/utils/tab-manager';

describe('tabManager', () => {
  it('should return 0 for unknown tabs', () => {
    expect(tabManager.getBlockCount(999)).toBe(0);
  });

  it('should provide stats', () => {
    const stats = tabManager.getStats();
    expect(stats).toHaveProperty('totalTabs');
    expect(stats).toHaveProperty('activeTabs');
    expect(stats).toHaveProperty('totalBlocks');
  });

  it('should get all tabs', () => {
    const allTabs = tabManager.getAllTabs();
    expect(allTabs).toBeInstanceOf(Array);
  });
});
