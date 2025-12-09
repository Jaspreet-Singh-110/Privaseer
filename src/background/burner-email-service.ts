import type { BurnerEmail } from '../types';
import { logger } from '../utils/logger';
import { toError } from '../utils/type-guards';
import { SUPABASE } from '../utils/constants';
import { Storage } from './storage';
import { validateEmail } from '../utils/validation';

class BurnerEmailService {
  private installationId: string | null = null;
  private supabaseUrl: string = SUPABASE.URL;
  private supabaseAnonKey: string = SUPABASE.ANON_KEY;
  private apiUrl: string;

  constructor() {
    this.apiUrl = `${this.supabaseUrl}/functions/v1/generate-burner-email`;
  }

  async initialize(): Promise<void> {
    this.installationId = await this.getOrCreateInstallationId();
    logger.debug('BurnerEmailService', 'Initialized', {
      installationId: this.installationId,
      apiUrl: this.apiUrl
    });
  }

  private async getOrCreateInstallationId(): Promise<string> {
    const stored = await chrome.storage.local.get('installationId');

    if (stored.installationId) {
      return stored.installationId;
    }

    const newId = crypto.randomUUID();
    await chrome.storage.local.set({ installationId: newId });
    return newId;
  }

  async generateEmail(domain: string, url?: string, label?: string): Promise<string> {
    logger.debug('BurnerEmailService', 'generateEmail called with:', { domain, url, label });
    try {
      const isEnabled = await Storage.getBurnerEmailEnabled();
      logger.debug('BurnerEmailService', 'Feature enabled check:', { isEnabled });
      if (!isEnabled) {
        logger.info('BurnerEmailService', 'Generation blocked - feature disabled', { domain });
        throw new Error('Burner email feature is disabled');
      }

      // Check if real email is configured
      const realEmail = await Storage.getRealEmail();
      logger.debug('BurnerEmailService', 'Real email configured check', { hasEmail: !!realEmail });
      if (!realEmail) {
        logger.info('BurnerEmailService', 'Generation blocked - real email not configured', { domain });
        throw new Error('Real email not configured. Please set your real email in Settings > Burner Email Services.');
      }

      // Validate the stored real email before making API request
      // This handles cases where invalid email might be in storage from older versions
      const emailValidation = validateEmail(realEmail);
      if (!emailValidation.valid) {
        logger.error('BurnerEmailService', 'Invalid real email in storage', new Error(emailValidation.error || 'Invalid email'), { realEmail });
        throw new Error(`Your saved forwarding email is invalid. Please update it in Settings > Burner Email Services. Error: ${emailValidation.error}`);
      }
      const sanitizedRealEmail = emailValidation.sanitized!;

      if (!this.installationId) {
        await this.initialize();
      }

      // Sanitize URL and enforce length limit as a safety net
      // The content script should have already sanitized it, but this prevents errors
      // if another part of the extension calls this service directly.
      let finalUrl = url;
      if (finalUrl && finalUrl.length > 2048) {
        logger.warn('BurnerEmailService', 'URL too long, omitting', { urlLength: finalUrl.length, domain });
        finalUrl = undefined;
      }

      const requestBody = {
        installationId: this.installationId,
        realEmail: sanitizedRealEmail,
        domain,
        url: finalUrl || undefined,
        label: label || undefined,
      };

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.supabaseAnonKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      logger.debug('BurnerEmailService', 'Response received', { status: response.status, ok: response.ok });

      const responseText = await response.text();

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        logger.error('BurnerEmailService', 'JSON parse error', toError(parseError), { responseText });
        throw new Error(`Invalid JSON response from server: ${responseText.substring(0, 100)}`);
      }

      if (!response.ok) {
        // Include the detailed message from server validation errors for better debugging
        const errorMsg = data.message 
          ? `${data.error}: ${data.message}` 
          : (data.error || data.details || `HTTP ${response.status}: ${response.statusText}`);
        logger.error('BurnerEmailService', 'HTTP error', new Error(errorMsg), { data });
        throw new Error(errorMsg);
      }

      if (!data.success) {
        // Include the detailed message from server validation errors for better debugging
        const errorMsg = data.message 
          ? `${data.error}: ${data.message}` 
          : (data.error || data.details || 'Server returned success=false');
        logger.error('BurnerEmailService', 'API error', new Error(errorMsg), { data });
        throw new Error(errorMsg);
      }

      if (!data.email || !data.email.email) {
        logger.error('BurnerEmailService', 'Missing email in response', new Error('No email field'), { data });
        throw new Error('Server did not return an email address');
      }

      logger.info('BurnerEmailService', 'Success! Generated email');

      return data.email.email;
    } catch (error) {
      const err = toError(error);
      logger.error('BurnerEmailService', 'generateEmail FAILED', err, { domain });
      throw new Error(`Failed to generate burner email: ${err.message}`);
    }
  }

  async getEmails(): Promise<BurnerEmail[]> {
    try {
      if (!this.installationId) {
        await this.initialize();
      }

      const response = await fetch(
        `${this.apiUrl}?installationId=${this.installationId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.supabaseAnonKey}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch burner emails');
      }

      return data.emails || [];
    } catch (error) {
      logger.error('BurnerEmailService', 'Failed to fetch burner emails', toError(error));
      throw error;
    }
  }

  async deleteEmail(emailId: string): Promise<void> {
    try {
      if (!this.installationId) {
        await this.initialize();
      }

      const response = await fetch(
        `${this.apiUrl}?emailId=${emailId}&installationId=${this.installationId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${this.supabaseAnonKey}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete burner email');
      }

      logger.info('BurnerEmailService', 'Burner email deleted', { emailId });
    } catch (error) {
      logger.error('BurnerEmailService', 'Failed to delete burner email', toError(error));
      throw error;
    }
  }

  async copyToClipboard(email: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(email);
      logger.debug('BurnerEmailService', 'Email copied to clipboard');
    } catch (error) {
      logger.error('BurnerEmailService', 'Failed to copy email', toError(error));
      throw error;
    }
  }
}

export const burnerEmailService = new BurnerEmailService();
