import type { FalsePositiveReport } from '../types';
import { SUPABASE } from '../utils/constants';
import { logger } from '../utils/logger';
import { sanitizeUrl } from '../utils/sanitizer';
import { toError } from '../utils/type-guards';

const REPORT_FALSE_POSITIVE_ENDPOINT = `${SUPABASE.URL}/functions/v1/report-false-positive`;

export class FalsePositiveService {
  static async reportFalsePositive(report: FalsePositiveReport): Promise<boolean> {
    try {
      const payload: FalsePositiveReport = {
        ...report,
        url: sanitizeUrl(report.url) || '',
      };

      const response = await fetch(REPORT_FALSE_POSITIVE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE.ANON_KEY}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.warn('FalsePositiveService', 'Failed to report false positive', {
          domain: report.domain,
          status: response.status,
          error: errorText,
        });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('FalsePositiveService', 'Error reporting false positive', toError(error));
      return false;
    }
  }
}
