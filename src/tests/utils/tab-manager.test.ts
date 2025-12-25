import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tabManager } from '@/utils/tab-manager';

const broadcastMock = vi.hoisted(() => vi.fn());
const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('@/utils/message-bus', () => ({
  messageBus: {
    broadcast: broadcastMock,
  },
}));

vi.mock('@/utils/logger', () => ({
  logger: loggerMock,
}));

type ChromeTabListener<T extends (...args: any[]) => void> = T[];

describe('tabManager integration', () => {
  let createdListeners: ChromeTabListener<(tab: chrome.tabs.Tab) => void>;
  let updatedListeners: ChromeTabListener<
    (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => void
  >;
  let removedListeners: ChromeTabListener<(tabId: number) => void>;

  const resetTabManagerState = (): void => {
    const internal = tabManager as unknown as {
      tabs: Map<number, unknown>;
      activeTabId: number | null;
      initialized: boolean;
    };
    internal.tabs.clear();
    internal.activeTabId = null;
    internal.initialized = false;
  };

  const setupChromeTabs = (initialTabs: chrome.tabs.Tab[]): void => {
    createdListeners = [];
    updatedListeners = [];
    removedListeners = [];

    const tabsApi = {
      query: vi.fn().mockResolvedValue(initialTabs),
      onCreated: { addListener: vi.fn((cb) => createdListeners.push(cb)) },
      onUpdated: { addListener: vi.fn((cb) => updatedListeners.push(cb)) },
      onActivated: { addListener: vi.fn() },
      onRemoved: { addListener: vi.fn((cb) => removedListeners.push(cb)) },
    };

    (globalThis as unknown as { chrome?: unknown }).chrome = {
      tabs: tabsApi,
    } as unknown as typeof chrome;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetTabManagerState();
    setupChromeTabs([
      {
        id: 1,
        url: 'https://example.com/page?ref=1',
        title: 'Example',
        active: true,
        status: 'complete',
      } as chrome.tabs.Tab,
    ]);
  });

  afterEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome;
  });

  it('tracks block counts across navigation updates', async () => {
    await tabManager.initialize();

    expect(tabManager.getBlockCount(1)).toBe(0);

    tabManager.incrementBlockCount(1);
    tabManager.incrementBlockCount(1);

    expect(tabManager.getBlockCount(1)).toBe(2);

    updatedListeners[0]?.(
      1,
      { status: 'loading' } as chrome.tabs.TabChangeInfo,
      {
        id: 1,
        url: 'https://example.com/next',
        title: 'Next',
        active: true,
        status: 'loading',
      } as chrome.tabs.Tab
    );

    expect(tabManager.getBlockCount(1)).toBe(0);
    expect(broadcastMock).toHaveBeenCalledWith(
      'TAB_UPDATED',
      expect.objectContaining({
        tabId: 1,
        tab: expect.objectContaining({ status: 'loading' }),
      })
    );

    tabManager.resetBlockCount(1);
    expect(tabManager.getBlockCount(1)).toBe(0);
  });

  it('cleans up state when tabs close', async () => {
    await tabManager.initialize();

    createdListeners[0]?.({
      id: 2,
      url: 'https://second.example',
      title: 'Second',
      active: false,
      status: 'complete',
    } as chrome.tabs.Tab);

    expect(tabManager.getTab(1)).toBeDefined();
    expect(tabManager.getTab(2)).toBeDefined();

    removedListeners.forEach((listener) => listener(1));

    expect(tabManager.getTab(1)).toBeUndefined();
    expect(tabManager.getActiveTab()).toBeUndefined();
    expect(broadcastMock).toHaveBeenCalledWith('TAB_REMOVED', { tabId: 1 });

    const stats = tabManager.getStats();
    expect(stats.totalTabs).toBe(1);
    expect(stats.totalBlocks).toBe(0);
  });
});
