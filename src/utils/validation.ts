/**
 * Shared validation utilities for the Privaseer extension.
 * These functions mirror the validation logic in supabase/functions/shared/input-validation.ts
 * to ensure consistency between client-side and server-side validation.
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: string;
}

/**
 * Validates an email address with comprehensive checks.
 * 
 * @param email - The email address to validate (can be unknown type for safety)
 * @returns ValidationResult with valid flag, optional error message, and sanitized email
 * 
 * @example
 * const result = validateEmail('User@Example.COM');
 * if (result.valid) {
 *   console.log(result.sanitized); // 'user@example.com'
 * } else {
 *   console.error(result.error);
 * }
 */
export function validateEmail(email: unknown): ValidationResult {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email is required and must be a string' };
  }

  const trimmed = email.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Email cannot be empty' };
  }

  if (trimmed.length > 254) {
    return { valid: false, error: 'Email is too long (max 254 characters)' };
  }

  // Standard email regex that matches the server-side validation
  const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: 'Invalid email format' };
  }

  const [localPart, domain] = trimmed.split('@');

  if (localPart.length > 64) {
    return { valid: false, error: 'Email local part is too long (max 64 characters)' };
  }

  if (domain.length > 255) {
    return { valid: false, error: 'Email domain is too long (max 255 characters)' };
  }

  return { valid: true, sanitized: trimmed.toLowerCase() };
}

/**
 * Sanitizes a URL before sending it to the backend for burner email metadata.
 *
 * Behavior:
 * - Strips query string and hash fragment to avoid leaking tracking IDs or tokens
 * - Returns only protocol + '//' + hostname + pathname
 * - Returns null if the URL is invalid or cannot be parsed
 *
 * This mirrors the privacy-first behavior we want for all outbound URLs.
 */
export function sanitizeUrlForBurner(url: string | undefined | null): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
  } catch {
    // If the URL cannot be parsed, treat it as unusable metadata
    return null;
  }
}
