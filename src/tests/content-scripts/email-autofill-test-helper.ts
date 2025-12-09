import { logger } from '../../utils/logger';
import { toError } from '../../utils/type-guards';

export class EmailAutofill {
  private burnerEmailButton: HTMLElement | null = null;
  private isEnabled: boolean = false;
  private focusinHandler: ((event: Event) => void) | null = null;
  private focusoutHandler: ((event: Event) => void) | null = null;
  private mutationObserver: MutationObserver | null = null;

  async initialize(): Promise<void> {
    try {
      const enabled = await this.checkIfEnabled();
      this.isEnabled = enabled;

      if (this.isEnabled) {
        this.setupInputDetection();
      }

      this.setupSettingListener();
      logger.debug('EmailAutofill', 'Initialized successfully', { url: window.location.href, enabled: this.isEnabled });
    } catch (error) {
      logger.error('EmailAutofill', 'Failed to initialize', toError(error));
    }
  }

  private async checkIfEnabled(): Promise<boolean> {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_BURNER_EMAIL_SETTING' });
      return response?.success && response?.enabled === true;
    } catch (error) {
      logger.error('EmailAutofill', 'Failed to check if enabled', toError(error));
      return false;
    }
  }

  private setupSettingListener(): void {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'BURNER_EMAIL_SETTING_CHANGED') {
        const enabled = message.data?.enabled === true;
        logger.debug('EmailAutofill', 'Setting changed', { enabled });

        if (enabled && !this.isEnabled) {
          this.enable();
        } else if (!enabled && this.isEnabled) {
          this.disable();
        }
      }
    });
  }

  enable(): void {
    this.isEnabled = true;
    this.setupInputDetection();
    logger.info('EmailAutofill', 'Burner email feature enabled');
  }

  disable(): void {
    this.isEnabled = false;
    this.cleanup();
    logger.info('EmailAutofill', 'Burner email feature disabled');
  }

  private setupInputDetection(): void {
    if (this.focusinHandler || this.focusoutHandler) {
      return;
    }

    this.focusinHandler = (event: Event) => {
      if (!this.isEnabled) return;

      const target = event.target as HTMLElement;

      if (this.isEmailInput(target)) {
        this.showBurnerEmailButton();
      }
    };

    this.focusoutHandler = (event: Event) => {
      if (!this.isEnabled) return;

      const target = event.target as HTMLElement;

      if (this.isEmailInput(target)) {
        setTimeout(() => {
          const relatedTarget = (event as FocusEvent).relatedTarget as HTMLElement;
          if (relatedTarget !== this.burnerEmailButton && !this.burnerEmailButton?.contains(relatedTarget)) {
            this.hideBurnerEmailButton();
          }
        }, 200);
      }
    };

    document.addEventListener('focusin', this.focusinHandler);
    document.addEventListener('focusout', this.focusoutHandler);

    this.mutationObserver = new MutationObserver(() => {
      if (this.isEnabled) {
        this.detectNewEmailInputs();
      }
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    logger.debug('EmailAutofill', 'Input detection setup complete');
  }

  cleanup(): void {
    if (this.focusinHandler) {
      document.removeEventListener('focusin', this.focusinHandler);
      this.focusinHandler = null;
    }

    if (this.focusoutHandler) {
      document.removeEventListener('focusout', this.focusoutHandler);
      this.focusoutHandler = null;
    }

    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }

    this.hideBurnerEmailButton();

    logger.debug('EmailAutofill', 'Cleanup complete');
  }

  private isEmailInput(element: HTMLElement): boolean {
    if (!(element instanceof HTMLInputElement)) return false;

    const type = element.type?.toLowerCase();
    const name = element.name?.toLowerCase();
    const id = element.id?.toLowerCase();
    const placeholder = element.placeholder?.toLowerCase();
    const autocomplete = element.autocomplete?.toLowerCase();

    return (
      type === 'email' ||
      autocomplete === 'email' ||
      name?.includes('email') ||
      id?.includes('email') ||
      placeholder?.includes('email') ||
      placeholder?.includes('e-mail')
    );
  }

  private detectNewEmailInputs(): void {
    const inputs = document.querySelectorAll('input[type="email"], input[name*="email" i], input[id*="email" i]');

    inputs.forEach((input) => {
      if (input instanceof HTMLInputElement && !input.dataset.burnerEmailReady) {
        input.dataset.burnerEmailReady = 'true';
      }
    });
  }

  showBurnerEmailButton(): void {
    if (this.burnerEmailButton) {
      this.hideBurnerEmailButton();
    }

    const button = document.createElement('div');
    button.id = 'privaseer-burner-email-btn';
    button.innerHTML = '<span>Generate Burner Email</span>';
    button.style.cssText = 'position: absolute; z-index: 999999;';

    document.body.appendChild(button);
    this.burnerEmailButton = button;
  }

  private hideBurnerEmailButton(): void {
    if (this.burnerEmailButton) {
      this.burnerEmailButton.remove();
      this.burnerEmailButton = null;
    }
  }

  getIsEnabled(): boolean {
    return this.isEnabled;
  }

  hasFocusinHandler(): boolean {
    return this.focusinHandler !== null;
  }

  hasFocusoutHandler(): boolean {
    return this.focusoutHandler !== null;
  }

  hasMutationObserver(): boolean {
    return this.mutationObserver !== null;
  }

  getFocusinHandler(): ((event: Event) => void) | null {
    return this.focusinHandler;
  }
}
