import type { BurnerEmail } from '../types';
import { logger } from '../utils/logger';
import { toError } from '../utils/type-guards';
import { SUPABASE } from '../utils/constants';
import { Storage } from './storage';

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
    try {
      const isEnabled = await Storage.getBurnerEmailEnabled();
      if (!isEnabled) {
        logger.info('BurnerEmailService', 'Generation blocked - feature disabled', { domain });
        throw new Error('Burner email feature is disabled');
      }

      if (!this.installationId) {
        await this.initialize();
      }

      logger.debug('BurnerEmailService', 'Making API request', {
        apiUrl: this.apiUrl,
        domain,
        installationId: this.installationId,
        hasUrl: !!url,
        hasLabel: !!label
      });

      const requestBody = {
        installationId: this.installationId,
        domain,
        url: url || undefined,
        label: label || undefined,
      };

      logger.debug('BurnerEmailService', 'Request body', requestBody);

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.supabaseAnonKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      logger.debug('BurnerEmailService', 'Response received', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      });

      const responseText = await response.text();
      logger.debug('BurnerEmailService', 'Response text', { text: responseText.substring(0, 500) });

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        logger.error('BurnerEmailService', 'JSON parse error', toError(parseError), { responseText });
        throw new Error(`Invalid JSON response from server: ${responseText.substring(0, 100)}`);
      }

      logger.debug('BurnerEmailService', 'Parsed response', { success: data.success, hasEmail: !!data.email });

      if (!response.ok) {
        const errorMsg = data.error || data.details || `HTTP ${response.status}: ${response.statusText}`;
        logger.error('BurnerEmailService', 'HTTP error', new Error(errorMsg), { data });
        throw new Error(errorMsg);
      }

      if (!data.success) {
        const errorMsg = data.error || data.details || 'Server returned success=false';
        logger.error('BurnerEmailService', 'API error', new Error(errorMsg), { data });
        throw new Error(errorMsg);
      }

      if (!data.email || !data.email.email) {
        logger.error('BurnerEmailService', 'Missing email in response', new Error('No email field'), { data });
        throw new Error('Server did not return an email address');
      }

      logger.info('BurnerEmailService', 'Success', {
        domain,
        email: data.email.email,
      });

      return data.email.email;
    } catch (error) {
      const err = toError(error);
      logger.error('BurnerEmailService', 'Generate email failed', err, { domain });
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
      logger.debug('BurnerEmailService', 'Email copied to clipboard', { email });
    } catch (error) {
      logger.error('BurnerEmailService', 'Failed to copy email', toError(error));
      throw error;
    }
  }
}

export const burnerEmailService = new BurnerEmailService();
