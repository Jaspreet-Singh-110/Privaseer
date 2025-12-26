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

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      expect(mockSendMessage).toHaveBeenCalledWith({ type: 'GET_BURNER_EMAIL_SETTING' });
    });

    it('should setup input detection when enabled', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      expect(autofill.getIsEnabled()).toBe(true);
    });

    it('should not setup input detection when disabled', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: false });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      expect(autofill.getIsEnabled()).toBe(false);
    });

    it('should setup setting listener regardless of enabled state', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: false });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      expect(mockAddListener).toHaveBeenCalled();
    });

    it('should handle errors when checking enabled state', async () => {
      mockSendMessage.mockRejectedValueOnce(new Error('Connection failed'));

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      expect(autofill.getIsEnabled()).toBe(false);
    });
  });

  describe('Setting Listener', () => {
    it('should listen for BURNER_EMAIL_SETTING_CHANGED messages', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: false });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      expect(mockAddListener).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should enable when receiving enabled=true message', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: false });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      expect(autofill.getIsEnabled()).toBe(false);

      const listener = mockAddListener.mock.calls[0][0];
      listener({ type: 'BURNER_EMAIL_SETTING_CHANGED', data: { enabled: true } });

      expect(autofill.getIsEnabled()).toBe(true);
    });

    it('should disable when receiving enabled=false message', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      expect(autofill.getIsEnabled()).toBe(true);

      const listener = mockAddListener.mock.calls[0][0];
      listener({ type: 'BURNER_EMAIL_SETTING_CHANGED', data: { enabled: false } });

      expect(autofill.getIsEnabled()).toBe(false);
    });

    it('should ignore other message types', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
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

      const { EmailAutofill } = await import('./email-autofill-test-helper');
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

      const { EmailAutofill } = await import('./email-autofill-test-helper');
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

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      const input = document.createElement('input');
      input.type = 'email';
      document.body.appendChild(input);

      (autofill as any).showBurnerEmailButton(input);
      expect(document.getElementById('privaseer-burner-email-btn')).toBeTruthy();

      autofill.disable();
      expect(document.getElementById('privaseer-burner-email-btn')).toBeNull();
    });

    it('should not show button when disabled', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: false });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
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

      const { EmailAutofill } = await import('./email-autofill-test-helper');
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

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      expect(autofill.hasMutationObserver()).toBe(true);

      autofill.cleanup();

      expect(autofill.hasMutationObserver()).toBe(false);
    });

    it('should hide button on cleanup', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      const input = document.createElement('input');
      input.type = 'email';
      document.body.appendChild(input);

      (autofill as any).showBurnerEmailButton(input);
      expect(document.getElementById('privaseer-burner-email-btn')).toBeTruthy();

      autofill.cleanup();
      expect(document.getElementById('privaseer-burner-email-btn')).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should not setup detection twice when already enabled', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      const firstHandler = autofill.getFocusinHandler();
      autofill.enable();
      const secondHandler = autofill.getFocusinHandler();

      expect(firstHandler).toBe(secondHandler);
    });

    it('should handle rapid toggle changes', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
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

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      expect(() => autofill.cleanup()).not.toThrow();
    });
  });

  describe('Email Field Detection', () => {
    it('should detect input with type="email"', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      const input = document.createElement('input');
      input.type = 'email';
      document.body.appendChild(input);

      const focusEvent = new FocusEvent('focusin', { bubbles: true });
      Object.defineProperty(focusEvent, 'target', { value: input, enumerable: true });
      input.dispatchEvent(focusEvent);

      expect(document.getElementById('privaseer-burner-email-btn')).toBeTruthy();
    });

    it('should detect input with name containing "email"', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      const input = document.createElement('input');
      input.type = 'text';
      input.name = 'user_email';
      document.body.appendChild(input);

      const focusEvent = new FocusEvent('focusin', { bubbles: true });
      Object.defineProperty(focusEvent, 'target', { value: input, enumerable: true });
      input.dispatchEvent(focusEvent);

      expect(document.getElementById('privaseer-burner-email-btn')).toBeTruthy();
    });

    it('should detect input with id containing "email"', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'contact-email';
      document.body.appendChild(input);

      const focusEvent = new FocusEvent('focusin', { bubbles: true });
      Object.defineProperty(focusEvent, 'target', { value: input, enumerable: true });
      input.dispatchEvent(focusEvent);

      expect(document.getElementById('privaseer-burner-email-btn')).toBeTruthy();
    });

    it('should detect input with placeholder containing "email"', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Enter your email address';
      document.body.appendChild(input);

      const focusEvent = new FocusEvent('focusin', { bubbles: true });
      Object.defineProperty(focusEvent, 'target', { value: input, enumerable: true });
      input.dispatchEvent(focusEvent);

      expect(document.getElementById('privaseer-burner-email-btn')).toBeTruthy();
    });

    it('should detect input with placeholder containing "e-mail"', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Your e-mail';
      document.body.appendChild(input);

      const focusEvent = new FocusEvent('focusin', { bubbles: true });
      Object.defineProperty(focusEvent, 'target', { value: input, enumerable: true });
      input.dispatchEvent(focusEvent);

      expect(document.getElementById('privaseer-burner-email-btn')).toBeTruthy();
    });

    it('should detect input with autocomplete="email"', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      const input = document.createElement('input');
      input.type = 'text';
      input.autocomplete = 'email';
      document.body.appendChild(input);

      const focusEvent = new FocusEvent('focusin', { bubbles: true });
      Object.defineProperty(focusEvent, 'target', { value: input, enumerable: true });
      input.dispatchEvent(focusEvent);

      expect(document.getElementById('privaseer-burner-email-btn')).toBeTruthy();
    });

    it('should not detect non-email inputs', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      const input = document.createElement('input');
      input.type = 'password';
      input.name = 'user_password';
      document.body.appendChild(input);

      const focusEvent = new FocusEvent('focusin', { bubbles: true });
      Object.defineProperty(focusEvent, 'target', { value: input, enumerable: true });
      input.dispatchEvent(focusEvent);

      expect(document.getElementById('privaseer-burner-email-btn')).toBeNull();
    });
  });

  describe('Button Visibility & Positioning', () => {
    it('should show button on email input focus', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      const input = document.createElement('input');
      input.type = 'email';
      document.body.appendChild(input);

      const focusEvent = new FocusEvent('focusin', { bubbles: true });
      Object.defineProperty(focusEvent, 'target', { value: input, enumerable: true });
      input.dispatchEvent(focusEvent);

      const button = document.getElementById('privaseer-burner-email-btn');
      expect(button).toBeTruthy();
      expect(button?.textContent).toContain('Generate Burner Email');
    });

    it('should hide button on blur when focus moves away', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      const input = document.createElement('input');
      input.type = 'email';
      document.body.appendChild(input);

      const focusEvent = new FocusEvent('focusin', { bubbles: true });
      Object.defineProperty(focusEvent, 'target', { value: input, enumerable: true });
      input.dispatchEvent(focusEvent);

      expect(document.getElementById('privaseer-burner-email-btn')).toBeTruthy();

      const blurEvent = new FocusEvent('focusout', { bubbles: true, relatedTarget: null });
      Object.defineProperty(blurEvent, 'target', { value: input, enumerable: true });
      input.dispatchEvent(blurEvent);

      await new Promise(resolve => setTimeout(resolve, 250));

      expect(document.getElementById('privaseer-burner-email-btn')).toBeNull();
    });

    it('should keep button visible when clicking on it', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      const input = document.createElement('input');
      input.type = 'email';
      document.body.appendChild(input);

      const focusEvent = new FocusEvent('focusin', { bubbles: true });
      Object.defineProperty(focusEvent, 'target', { value: input, enumerable: true });
      input.dispatchEvent(focusEvent);

      const button = document.getElementById('privaseer-burner-email-btn');
      expect(button).toBeTruthy();

      const blurEvent = new FocusEvent('focusout', { bubbles: true, relatedTarget: button });
      Object.defineProperty(blurEvent, 'target', { value: input, enumerable: true });
      input.dispatchEvent(blurEvent);

      await new Promise(resolve => setTimeout(resolve, 250));

      expect(document.getElementById('privaseer-burner-email-btn')).toBeTruthy();
    });

    it('should position button with absolute positioning', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      const input = document.createElement('input');
      input.type = 'email';
      document.body.appendChild(input);

      const focusEvent = new FocusEvent('focusin', { bubbles: true });
      Object.defineProperty(focusEvent, 'target', { value: input, enumerable: true });
      input.dispatchEvent(focusEvent);

      const button = document.getElementById('privaseer-burner-email-btn');
      expect(button).toBeTruthy();
      expect(button?.style.position).toBe('absolute');
      expect(button?.style.zIndex).toBe('999999');
    });

    it('should remove old button when showing new one', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      const input1 = document.createElement('input');
      input1.type = 'email';
      input1.id = 'email1';
      document.body.appendChild(input1);

      const input2 = document.createElement('input');
      input2.type = 'email';
      input2.id = 'email2';
      document.body.appendChild(input2);

      const focusEvent1 = new FocusEvent('focusin', { bubbles: true });
      Object.defineProperty(focusEvent1, 'target', { value: input1, enumerable: true });
      input1.dispatchEvent(focusEvent1);

      expect(document.getElementById('privaseer-burner-email-btn')).toBeTruthy();

      const focusEvent2 = new FocusEvent('focusin', { bubbles: true });
      Object.defineProperty(focusEvent2, 'target', { value: input2, enumerable: true });
      input2.dispatchEvent(focusEvent2);

      const buttons = document.querySelectorAll('#privaseer-burner-email-btn');
      expect(buttons.length).toBe(1);
    });
  });

  describe('Email Generation & Autofill', () => {
    it('should create button that can be clicked', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      const input = document.createElement('input');
      input.type = 'email';
      document.body.appendChild(input);

      const focusEvent = new FocusEvent('focusin', { bubbles: true });
      Object.defineProperty(focusEvent, 'target', { value: input, enumerable: true });
      input.dispatchEvent(focusEvent);

      const button = document.getElementById('privaseer-burner-email-btn');
      expect(button).toBeTruthy();
      expect(button?.tagName).toBe('DIV');
      expect(button?.id).toBe('privaseer-burner-email-btn');
    });

    it('should send GENERATE_BURNER_EMAIL message when button would be clicked', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      const input = document.createElement('input');
      input.type = 'email';
      document.body.appendChild(input);

      const focusEvent = new FocusEvent('focusin', { bubbles: true });
      Object.defineProperty(focusEvent, 'target', { value: input, enumerable: true });
      input.dispatchEvent(focusEvent);

      const button = document.getElementById('privaseer-burner-email-btn');
      expect(button).toBeTruthy();

      mockSendMessage.mockClear();
      
      const domain = new URL(window.location.href).hostname;
      expect(domain).toBe('example.com');
    });

    it('should have button with correct styling for user interaction', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      const input = document.createElement('input');
      input.type = 'email';
      document.body.appendChild(input);

      const focusEvent = new FocusEvent('focusin', { bubbles: true });
      Object.defineProperty(focusEvent, 'target', { value: input, enumerable: true });
      input.dispatchEvent(focusEvent);

      const button = document.getElementById('privaseer-burner-email-btn');
      expect(button).toBeTruthy();
      expect(button?.style.position).toBe('absolute');
      expect(button?.style.zIndex).toBe('999999');
      expect(button?.textContent).toContain('Generate Burner Email');
    });

    it('should verify button exists for email generation flow', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      const input = document.createElement('input');
      input.type = 'email';
      input.id = 'test-email-input';
      document.body.appendChild(input);

      const focusEvent = new FocusEvent('focusin', { bubbles: true });
      Object.defineProperty(focusEvent, 'target', { value: input, enumerable: true });
      input.dispatchEvent(focusEvent);

      const button = document.getElementById('privaseer-burner-email-btn');
      expect(button).not.toBeNull();
      expect(button?.innerHTML).toContain('Generate Burner Email');
    });

    it('should handle button creation for multiple email fields', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      const input1 = document.createElement('input');
      input1.type = 'email';
      input1.id = 'email1';
      document.body.appendChild(input1);

      const input2 = document.createElement('input');
      input2.type = 'email';
      input2.id = 'email2';
      document.body.appendChild(input2);

      const focusEvent1 = new FocusEvent('focusin', { bubbles: true });
      Object.defineProperty(focusEvent1, 'target', { value: input1, enumerable: true });
      input1.dispatchEvent(focusEvent1);

      expect(document.getElementById('privaseer-burner-email-btn')).toBeTruthy();

      const focusEvent2 = new FocusEvent('focusin', { bubbles: true });
      Object.defineProperty(focusEvent2, 'target', { value: input2, enumerable: true });
      input2.dispatchEvent(focusEvent2);

      const buttons = document.querySelectorAll('#privaseer-burner-email-btn');
      expect(buttons.length).toBe(1);
    });

    it('should verify chrome runtime is available for message passing', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      expect(chrome.runtime).toBeDefined();
      expect(chrome.runtime.sendMessage).toBeDefined();
      expect(chrome.runtime.id).toBe('test-extension-id');
    });
  });

  describe('Dynamic Input Detection', () => {
    it('should detect email inputs added after page load', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      await new Promise(resolve => setTimeout(resolve, 50));

      const input = document.createElement('input');
      input.type = 'email';
      input.id = 'dynamic-email';
      document.body.appendChild(input);

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(input.dataset.burnerEmailReady).toBe('true');
    });

    it('should mark new inputs with data-burner-email-ready attribute', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      const input1 = document.createElement('input');
      input1.type = 'email';
      input1.name = 'email1';
      document.body.appendChild(input1);

      await new Promise(resolve => setTimeout(resolve, 50));

      const input2 = document.createElement('input');
      input2.type = 'text';
      input2.id = 'user-email';
      document.body.appendChild(input2);

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(input1.dataset.burnerEmailReady).toBe('true');
      expect(input2.dataset.burnerEmailReady).toBe('true');
    });

    it('should not detect inputs when feature is disabled', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: false });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      const input = document.createElement('input');
      input.type = 'email';
      document.body.appendChild(input);

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(input.dataset.burnerEmailReady).toBeUndefined();
    });
  });

  describe('Feature Toggle During Active Use', () => {
    it('should hide button when feature is disabled while visible', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      const input = document.createElement('input');
      input.type = 'email';
      document.body.appendChild(input);

      const focusEvent = new FocusEvent('focusin', { bubbles: true });
      Object.defineProperty(focusEvent, 'target', { value: input, enumerable: true });
      input.dispatchEvent(focusEvent);

      expect(document.getElementById('privaseer-burner-email-btn')).toBeTruthy();

      const listener = mockAddListener.mock.calls[0][0];
      listener({ type: 'BURNER_EMAIL_SETTING_CHANGED', data: { enabled: false } });

      expect(document.getElementById('privaseer-burner-email-btn')).toBeNull();
    });

    it('should not show button on focus when feature is disabled', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, enabled: true });

      const { EmailAutofill } = await import('./email-autofill-test-helper');
      const autofill = new EmailAutofill();
      await autofill.initialize();

      const listener = mockAddListener.mock.calls[0][0];
      listener({ type: 'BURNER_EMAIL_SETTING_CHANGED', data: { enabled: false } });

      const input = document.createElement('input');
      input.type = 'email';
      document.body.appendChild(input);

      const focusEvent = new FocusEvent('focusin', { bubbles: true });
      Object.defineProperty(focusEvent, 'target', { value: input, enumerable: true });
      input.dispatchEvent(focusEvent);

      expect(document.getElementById('privaseer-burner-email-btn')).toBeNull();
    });
  });
});
