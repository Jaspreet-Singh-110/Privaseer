import { describe, it, expect, vi } from 'vitest';
import { backgroundEvents } from '@/background/event-emitter';

describe('EventEmitter', () => {
  it('should emit and receive events', () => {
    const callback = vi.fn();
    backgroundEvents.on('TRACKER_INCREMENT', callback);

    backgroundEvents.emit('TRACKER_INCREMENT', { domain: 'test.com', category: 'analytics', isHighRisk: false });

    expect(callback).toHaveBeenCalledWith({
      domain: 'test.com',
      category: 'analytics',
      isHighRisk: false,
    });
  });

  it('should support multiple listeners', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    backgroundEvents.on('SCORE_UPDATED', callback1);
    backgroundEvents.on('SCORE_UPDATED', callback2);

    backgroundEvents.emit('SCORE_UPDATED', { oldScore: 80, newScore: 85, reason: 'test' });

    expect(callback1).toHaveBeenCalledWith({ oldScore: 80, newScore: 85, reason: 'test' });
    expect(callback2).toHaveBeenCalledWith({ oldScore: 80, newScore: 85, reason: 'test' });
  });

  it('should remove listeners', () => {
    const callback = vi.fn();
    backgroundEvents.on('CLEAN_SITE_DETECTED', callback);
    backgroundEvents.off('CLEAN_SITE_DETECTED', callback);

    backgroundEvents.emit('CLEAN_SITE_DETECTED', { domain: 'example.com', tabId: 1, url: 'https://example.com' });

    expect(callback).not.toHaveBeenCalled();
  });

  it('should handle events with no listeners', () => {
    expect(() => {
      backgroundEvents.emit('TRACKER_INCREMENT' as any, { domain: 'test.com', category: 'analytics', isHighRisk: false });
    }).not.toThrow();
  });
});
