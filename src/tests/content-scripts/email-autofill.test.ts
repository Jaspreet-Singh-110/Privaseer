import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('EmailAutofill Toggle Integration', () => {
  let dom: JSDOM;
  let mockSendMessage: ReturnType<typeof vi.fn>;
  let mockAddListener: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'https://example.com',
      runScripts: 'outside-only',
    });

    global.window = dom.window as any;
    global.document = dom.window.document;
    global.HTMLElement = dom.window.HTMLElement;
    global.HTMLInputElement = dom.window.HTMLInputElement;
    global.MutationObserver = dom.window.MutationObserver;
    global.Event = dom.window.Event;
    global.FocusEvent = dom.window.FocusEvent;

    mockSendMessage = vi.fn();
    mockAddListener = vi.fn();

    global.chrome = {
      runtime: {
        sendMessage: mockSendMessage,
        onMessage: {
          addListener: mockAddListener,
        },
        id: 'test-extension-id',
      },
    } as any;
  });

  describe('Initialization', () => {
    it('should check if feature is enabled on initialization', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('@/content-scripts/email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      expect(mockSendMessage).toHaveBeenCalledWith({ type: 'GET_BURNER_EMAIL_SETTING' });
    });

    it('should setup input detection when enabled', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('@/content-scripts/email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      expect(autofill.getIsEnabled()).toBe(true);
    });

    it('should not setup input detection when disabled', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: false });

      const { EmailAutofill } = await import('@/content-scripts/email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      expect(autofill.getIsEnabled()).toBe(false);
    });

    it('should setup setting listener regardless of enabled state', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: false });

      const { EmailAutofill } = await import('@/content-scripts/email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      expect(mockAddListener).toHaveBeenCalled();
    });

    it('should handle errors when checking enabled state', async () => {
      mockSendMessage.mockRejectedValueOnce(new Error('Connection failed'));

      const { EmailAutofill } = await import('@/content-scripts/email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      expect(autofill.getIsEnabled()).toBe(false);
    });
  });

  describe('Setting Listener', () => {
    it('should listen for BURNER_EMAIL_SETTING_CHANGED messages', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: false });

      const { EmailAutofill } = await import('@/content-scripts/email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      expect(mockAddListener).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should enable when receiving enabled=true message', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: false });

      const { EmailAutofill } = await import('@/content-scripts/email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      expect(autofill.getIsEnabled()).toBe(false);

      const listener = mockAddListener.mock.calls[0][0];
      listener({ type: 'BURNER_EMAIL_SETTING_CHANGED', data: { enabled: true } });

      expect(autofill.getIsEnabled()).toBe(true);
    });

    it('should disable when receiving enabled=false message', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('@/content-scripts/email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      expect(autofill.getIsEnabled()).toBe(true);

      const listener = mockAddListener.mock.calls[0][0];
      listener({ type: 'BURNER_EMAIL_SETTING_CHANGED', data: { enabled: false } });

      expect(autofill.getIsEnabled()).toBe(false);
    });

    it('should ignore other message types', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('@/content-scripts/email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      const initialState = autofill.getIsEnabled();

      const listener = mockAddListener.mock.calls[0][0];
      listener({ type: 'SOME_OTHER_MESSAGE', data: { enabled: false } });

      expect(autofill.getIsEnabled()).toBe(initialState);
    });
  });

  describe('Enable/Disable Functionality', () => {
    it('should setup input detection when enabled', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: false });

      const { EmailAutofill } = await import('@/content-scripts/email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      autofill.enable();

      expect(autofill.getIsEnabled()).toBe(true);
      expect(autofill.hasFocusinHandler()).toBe(true);
      expect(autofill.hasFocusoutHandler()).toBe(true);
      expect(autofill.hasMutationObserver()).toBe(true);
    });

    it('should cleanup when disabled', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('@/content-scripts/email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      expect(autofill.hasFocusinHandler()).toBe(true);

      autofill.disable();

      expect(autofill.getIsEnabled()).toBe(false);
      expect(autofill.hasFocusinHandler()).toBe(false);
      expect(autofill.hasFocusoutHandler()).toBe(false);
      expect(autofill.hasMutationObserver()).toBe(false);
    });

    it('should remove button when disabled', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('@/content-scripts/email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      const input = document.createElement('input');
      input.type = 'email';
      document.body.appendChild(input);

      autofill.showBurnerEmailButton(input);
      expect(document.getElementById('privaseer-burner-email-btn')).toBeTruthy();

      autofill.disable();
      expect(document.getElementById('privaseer-burner-email-btn')).toBeNull();
    });

    it('should not show button when disabled', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: false });

      const { EmailAutofill } = await import('@/content-scripts/email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      const input = document.createElement('input');
      input.type = 'email';
      document.body.appendChild(input);

      const focusEvent = new FocusEvent('focusin', { bubbles: true });
      Object.defineProperty(focusEvent, 'target', { value: input, enumerable: true });
      input.dispatchEvent(focusEvent);

      expect(document.getElementById('privaseer-burner-email-btn')).toBeNull();
    });
  });

  describe('Cleanup', () => {
    it('should remove all event listeners on cleanup', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('@/content-scripts/email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      expect(autofill.hasFocusinHandler()).toBe(true);
      expect(autofill.hasFocusoutHandler()).toBe(true);

      autofill.cleanup();

      expect(autofill.hasFocusinHandler()).toBe(false);
      expect(autofill.hasFocusoutHandler()).toBe(false);
    });

    it('should disconnect mutation observer on cleanup', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('@/content-scripts/email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      expect(autofill.hasMutationObserver()).toBe(true);

      autofill.cleanup();

      expect(autofill.hasMutationObserver()).toBe(false);
    });

    it('should hide button on cleanup', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('@/content-scripts/email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      const input = document.createElement('input');
      input.type = 'email';
      document.body.appendChild(input);

      autofill.showBurnerEmailButton(input);
      expect(document.getElementById('privaseer-burner-email-btn')).toBeTruthy();

      autofill.cleanup();
      expect(document.getElementById('privaseer-burner-email-btn')).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should not setup detection twice when already enabled', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('@/content-scripts/email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      const firstHandler = autofill.getFocusinHandler();
      autofill.enable();
      const secondHandler = autofill.getFocusinHandler();

      expect(firstHandler).toBe(secondHandler);
    });

    it('should handle rapid toggle changes', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('@/content-scripts/email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      autofill.disable();
      autofill.enable();
      autofill.disable();
      autofill.enable();

      expect(autofill.getIsEnabled()).toBe(true);
      expect(autofill.hasFocusinHandler()).toBe(true);
    });

    it('should handle cleanup when nothing is setup', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: false });

      const { EmailAutofill } = await import('@/content-scripts/email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      expect(() => autofill.cleanup()).not.toThrow();
    });
  });
});
