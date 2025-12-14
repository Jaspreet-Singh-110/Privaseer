/**
 * TEST FILE: Validation Utility Regression Tests
 *
 * Test Type: Unit
 * Contexts Tested: Background utility layer
 * Chrome APIs Mocked: None (pure functions)
 * Prerequisites:
 *   - None (relies on pure validation helpers)
 *
 * Coverage Target: `src/utils/validation.ts`
 */

import { describe, it, expect } from 'vitest';
import {
  validateFeedbackPayload,
  validateEventPayload,
  validateComplianceScore,
} from '@/utils/validation';

describe('validateFeedbackPayload', () => {
  it('accepts minimal valid feedback payload', () => {
    const result = validateFeedbackPayload({ feedbackText: '  Great job  ' });
    expect(result.valid).toBe(true);
    expect(result.sanitized).toEqual({ feedbackText: 'Great job' });
  });

  it('sanitizes optional url and domain when provided', () => {
    const result = validateFeedbackPayload({
      feedbackText: 'Needs work',
      url: 'https://example.com/path?tracking=1#section',
      domain: ' EXAMPLE.com ',
    });

    expect(result.valid).toBe(true);
    expect(result.sanitized).toEqual({
      feedbackText: 'Needs work',
      url: 'https://example.com/path',
      domain: 'example.com',
    });
  });

  it('rejects non-object payloads', () => {
    const result = validateFeedbackPayload('invalid');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid payload: expected object');
  });

  it('rejects missing or invalid feedbackText', () => {
    expect(validateFeedbackPayload({})).toMatchObject({
      valid: false,
      error: 'feedbackText must be a string',
    });

    expect(validateFeedbackPayload({ feedbackText: '   ' })).toMatchObject({
      valid: false,
      error: 'feedbackText cannot be empty',
    });
  });

  it('rejects feedback that exceeds length limits', () => {
    const longText = 'a'.repeat(5001);
    const result = validateFeedbackPayload({ feedbackText: longText });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceeds 5000 characters');
  });

  it('rejects invalid url or domain types', () => {
    expect(
      validateFeedbackPayload({ feedbackText: 'ok', url: 123 })
    ).toMatchObject({
      valid: false,
      error: 'url must be a string when provided',
    });

    expect(
      validateFeedbackPayload({ feedbackText: 'ok', domain: 123 })
    ).toMatchObject({
      valid: false,
      error: 'domain must be a string when provided',
    });
  });

  it('rejects invalid urls that fail sanitization', () => {
    const result = validateFeedbackPayload({
      feedbackText: 'bad url',
      url: 'not-a-url',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('url is invalid');
  });

  it('drops empty domains after trimming', () => {
    const result = validateFeedbackPayload({
      feedbackText: 'test',
      domain: '   ',
    });
    expect(result.valid).toBe(true);
    expect(result.sanitized?.domain).toBeUndefined();
  });
});

describe('validateEventPayload', () => {
  it('accepts valid event payload with sanitized data', () => {
    const result = validateEventPayload({
      eventType: '  click  ',
      eventData: { key: 'value' },
    });

    expect(result.valid).toBe(true);
    expect(result.sanitized).toEqual({
      eventType: 'click',
      eventData: { key: 'value' },
    });
  });

  it('rejects non-object payloads', () => {
    const result = validateEventPayload('invalid');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid payload: expected object');
  });

  it('rejects invalid eventType values', () => {
    expect(validateEventPayload({})).toMatchObject({
      valid: false,
      error: 'eventType must be a string',
    });

    expect(
      validateEventPayload({ eventType: '   ' })
    ).toMatchObject({
      valid: false,
      error: 'eventType cannot be empty',
    });

    const longType = 'a'.repeat(101);
    expect(
      validateEventPayload({ eventType: longType })
    ).toMatchObject({
      valid: false,
      error: 'eventType exceeds 100 characters',
    });
  });

  it('rejects non-object eventData', () => {
    const result = validateEventPayload({
      eventType: 'test',
      eventData: 'not-an-object',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('eventData must be a plain object');
  });

  it('rejects oversized eventData payloads', () => {
    const bigPayload = { data: 'x'.repeat(11 * 1024) };
    const result = validateEventPayload({
      eventType: 'big',
      eventData: bigPayload,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('eventData exceeds 10KB limit');
  });

  it('rejects non-serializable eventData', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const result = validateEventPayload({
      eventType: 'circular',
      eventData: circular,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('eventData must be serializable');
  });
});

describe('validateComplianceScore', () => {
  it('accepts valid scores including boundaries', () => {
    expect(validateComplianceScore({ score: 0 })).toMatchObject({
      valid: true,
      sanitized: { score: 0 },
    });
    expect(validateComplianceScore({ score: 100 })).toMatchObject({
      valid: true,
      sanitized: { score: 100 },
    });
    expect(validateComplianceScore({ score: 42 })).toMatchObject({
      valid: true,
      sanitized: { score: 42 },
    });
  });

  it('rejects non-object payloads or missing scores', () => {
    expect(validateComplianceScore('invalid')).toMatchObject({
      valid: false,
      error: 'Invalid payload: expected object',
    });
    expect(validateComplianceScore({})).toMatchObject({
      valid: false,
      error: 'score must be a finite number',
    });
  });

  it('rejects non-number, NaN, or infinite scores', () => {
    expect(
      validateComplianceScore({ score: 'not-a-number' as unknown as number })
    ).toMatchObject({
      valid: false,
      error: 'score must be a finite number',
    });

    expect(validateComplianceScore({ score: Number.NaN })).toMatchObject({
      valid: false,
      error: 'score must be a finite number',
    });

    expect(validateComplianceScore({ score: Number.POSITIVE_INFINITY })).toMatchObject({
      valid: false,
      error: 'score must be a finite number',
    });
  });

  it('enforces score boundaries between 0 and 100', () => {
    expect(validateComplianceScore({ score: -1 })).toMatchObject({
      valid: false,
      error: 'score must be between 0 and 100',
    });
    expect(validateComplianceScore({ score: 101 })).toMatchObject({
      valid: false,
      error: 'score must be between 0 and 100',
    });
  });
});
/**
 * TEST FILE: Validation Utilities
 *
 * Test Type: Unit
 * Contexts Tested: Background utility layer
 * Chrome APIs Mocked: None
 * Prerequisites:
 *   - None
 *
 * Coverage Target: feedback/event/compliance payload validation helpers
 */

import { describe, it, expect } from 'vitest';
import {
  validateFeedbackPayload,
  validateEventPayload,
  validateComplianceScore,
} from '@/utils/validation';

describe('validateFeedbackPayload', () => {
  it('should accept minimal valid payload', () => {
    const result = validateFeedbackPayload({ feedbackText: ' Great job ' });
    expect(result.valid).toBe(true);
    expect(result.sanitized?.feedbackText).toBe('Great job');
  });

  it('should sanitize optional url and domain fields', () => {
    const result = validateFeedbackPayload({
      feedbackText: 'Hello',
      url: 'https://example.com/path?query=1#hash',
      domain: ' Example.com ',
    });

    expect(result.valid).toBe(true);
    expect(result.sanitized?.url).toBe('https://example.com/path');
    expect(result.sanitized?.domain).toBe('example.com');
  });

  it('should reject payloads that are not objects', () => {
    const result = validateFeedbackPayload('oops');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('expected object');
  });

  it('should reject missing or non-string feedbackText', () => {
    expect(validateFeedbackPayload({})).toMatchObject({ valid: false });
    expect(validateFeedbackPayload({ feedbackText: 123 })).toMatchObject({ valid: false });
  });

  it('should reject empty or overly long feedback text', () => {
    expect(validateFeedbackPayload({ feedbackText: '   ' })).toMatchObject({ valid: false });
    const longText = 'a'.repeat(5001);
    expect(validateFeedbackPayload({ feedbackText: longText })).toMatchObject({ valid: false });
  });

  it('should reject invalid optional url or domain types', () => {
    expect(validateFeedbackPayload({ feedbackText: 'ok', url: 123 })).toMatchObject({ valid: false });
    expect(validateFeedbackPayload({ feedbackText: 'ok', domain: 123 })).toMatchObject({ valid: false });
  });

  it('should reject invalid optional url strings', () => {
    const result = validateFeedbackPayload({ feedbackText: 'ok', url: 'notaurl' });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('url is invalid');
  });
});

describe('validateEventPayload', () => {
  it('should accept minimal valid payload', () => {
    const result = validateEventPayload({ eventType: ' click ' });
    expect(result.valid).toBe(true);
    expect(result.sanitized?.eventType).toBe('click');
  });

  it('should accept valid payload with event data', () => {
    const result = validateEventPayload({ eventType: 'test', eventData: { nested: true } });
    expect(result.valid).toBe(true);
    expect(result.sanitized?.eventData).toEqual({ nested: true });
  });

  it('should reject payloads that are not objects', () => {
    const result = validateEventPayload('oops');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('expected object');
  });

  it('should reject missing or invalid eventType values', () => {
    expect(validateEventPayload({})).toMatchObject({ valid: false });
    expect(validateEventPayload({ eventType: 123 })).toMatchObject({ valid: false });
    expect(validateEventPayload({ eventType: '   ' })).toMatchObject({ valid: false });
  });

  it('should reject event types that exceed the maximum length', () => {
    const longType = 'a'.repeat(101);
    const result = validateEventPayload({ eventType: longType });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceeds');
  });

  it('should reject non-object eventData', () => {
    const result = validateEventPayload({ eventType: 'test', eventData: 'string data' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('plain object');
  });

  it('should reject eventData that exceeds size limits', () => {
    const oversized = { data: 'x'.repeat(10 * 1024 + 1) };
    const result = validateEventPayload({ eventType: 'test', eventData: oversized });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('10KB');
  });

  it('should reject non-serializable eventData', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const result = validateEventPayload({ eventType: 'test', eventData: circular });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('serializable');
  });
});

describe('validateComplianceScore', () => {
  it('should accept valid scores including edge values', () => {
    expect(validateComplianceScore({ score: 0 }).valid).toBe(true);
    expect(validateComplianceScore({ score: 50 }).valid).toBe(true);
    expect(validateComplianceScore({ score: 100 }).valid).toBe(true);
  });

  it('should reject payloads that are not objects', () => {
    const result = validateComplianceScore('oops');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('expected object');
  });

  it('should reject missing or non-number scores', () => {
    expect(validateComplianceScore({})).toMatchObject({ valid: false });
    expect(validateComplianceScore({ score: '50' })).toMatchObject({ valid: false });
  });

  it('should reject NaN or infinite scores', () => {
    expect(validateComplianceScore({ score: Number.NaN })).toMatchObject({ valid: false });
    expect(validateComplianceScore({ score: Number.POSITIVE_INFINITY })).toMatchObject({ valid: false });
  });

  it('should enforce score bounds', () => {
    expect(validateComplianceScore({ score: -1 })).toMatchObject({ valid: false });
    expect(validateComplianceScore({ score: 101 })).toMatchObject({ valid: false });
  });
});
