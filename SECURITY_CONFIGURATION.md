# Security Configuration Guide

Comprehensive security hardening checklist and best practices for Privaseer burner email system.

## Overview

This document outlines all security configurations, policies, and best practices required for production deployment.

## Database Security

### Row Level Security (RLS)

All tables MUST have RLS enabled:

```sql
-- Verify RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND rowsecurity = false;

-- Should return no rows
```

### RLS Policies Implemented

#### burner_emails Table

**Authenticated Users:**
- ✅ SELECT: Users can view own burner emails (filtered by installation_id)
- ✅ INSERT: Users can create burners with valid email formats
- ✅ UPDATE: Users can update only their own burners
- ✅ DELETE: Users can delete only their own burners

**Anonymous Role:**
- ✅ SELECT: Only active, non-expired burners (for webhook lookup)
- ✅ UPDATE: Counter updates only (cannot modify email addresses or settings)

**Restrictive Checks:**
- Email format validation via regex
- Cannot modify critical fields (email_address, real_email, installation_id)
- Paused burners cannot be updated by anonymous

#### email_logs Table

**Authenticated Users:**
- ✅ SELECT: Users can view logs for their own burner emails only

**Anonymous Role:**
- ✅ INSERT: Webhooks can log inbound emails

#### security_audit_log Table

**Authenticated Users:**
- ✅ SELECT: Users can view audit logs for their own burners

**Anonymous Role:**
- ✅ INSERT: System can log security events

### Database Constraints

**Email Validation:**
```sql
-- Burner email format
CHECK (email_address ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')

-- Real email format
CHECK (real_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
```

**Counter Validation:**
```sql
-- Non-negative counters
CHECK (emails_received >= 0 AND emails_forwarded >= 0)
CHECK (trackers_removed >= 0)
```

**Rate Limit Validation:**
```sql
-- Valid hourly limit
CHECK (hourly_limit > 0 AND hourly_limit <= 1000)
```

**Data Integrity:**
```sql
-- Non-empty from address
CHECK (from_address IS NOT NULL AND length(from_address) > 0)
```

### Audit Logging

**Security Events Logged:**
- ❄️ burner_paused - When burner is paused (with reason)
- ❄️ burner_unpaused - When burner is reactivated
- ❄️ burner_deactivated - When burner is deactivated
- ❄️ burner_deleted - When burner is deleted
- ❄️ rate_limit_exceeded - Rate limit violations
- ❄️ rate_limit_check_paused - Attempts to use paused burner

**Audit Log Fields:**
- event_type - Type of security event
- burner_email_id - Associated burner
- details - JSONB with event-specific data
- ip_address - Source IP (when available)
- user_agent - User agent string
- created_at - Timestamp

## Input Validation

### Edge Function Validation

All edge functions implement comprehensive input validation:

#### Email Validation

- ✅ Required field check
- ✅ Type validation (must be string)
- ✅ Format validation (RFC 5322 compliant)
- ✅ Length limits (local part ≤ 64, domain ≤ 255, total ≤ 254)
- ✅ Automatic lowercasing
- ✅ Trim whitespace

#### UUID Validation

- ✅ Required field check
- ✅ Type validation
- ✅ Format validation (8-4-4-4-12 hex)
- ✅ Case insensitive
- ✅ Automatic lowercasing

#### String Validation

- ✅ Type check
- ✅ Optional/required flag
- ✅ Min/max length enforcement
- ✅ Pattern matching (regex)
- ✅ Automatic trimming

#### Number Validation

- ✅ Type coercion and validation
- ✅ Min/max bounds
- ✅ Integer enforcement
- ✅ NaN detection

#### HTML Sanitization

**Removed Elements:**
- `<script>` tags and content
- `<iframe>` tags and content
- `<object>` tags and content
- `<embed>` tags
- `javascript:` pseudo-protocol
- Event handlers (`onclick`, `onload`, etc.)

#### Email Payload Validation

**Required Fields:**
- recipient (valid email)
- sender (valid email)

**Optional Fields:**
- subject (max 998 chars, sanitized)
- bodyPlain (max 1MB)
- bodyHtml (sanitized)

**Validation Response:**
- 400 Bad Request on validation failure
- Clear error messages
- No processing of invalid data

## Rate Limiting

### Per-Burner Rate Limits

**Default Limit:** 50 emails per hour

**Implementation:**
- Database function: `check_rate_limit()`
- Checked before every email forward
- Returns allowed/denied with reason
- Tracks rolling 1-hour window

**Response Codes:**
- 429 Too Many Requests - Rate limit exceeded
- Clear user-facing error message

### Spam Spike Detection

**Multi-Timeframe Analysis:**
- 5 minutes: ≥10 emails → Immediate spike
- 15 minutes: ≥25 emails → Sustained attack
- 1 hour: ≥100 emails → Excessive volume

**Auto-Pause Triggers:**
- Any spike detection → Automatic pause
- Reason logged in database
- 429 response to webhook
- User notification required

### API Rate Limiting

**Per-IP Rate Limiting:**
- Implemented at infrastructure level
- Supabase Edge Functions have built-in limits
- Additional CloudFlare rate limiting recommended

**Recommended Limits:**
- Webhook endpoint: 100 req/min per IP
- Generate email: 10 req/min per IP
- List emails: 60 req/min per IP

## Email Authentication

### SPF Records

**For burner.privaseer.io:**

```dns
Type: TXT
Name: burner.privaseer.io
Value: v=spf1 include:amazonses.com ~all
TTL: 3600
```

**For privaseer.io:**

```dns
Type: TXT
Name: privaseer.io
Value: v=spf1 include:_spf.google.com ~all
TTL: 3600
```

**Validation:**
```bash
dig TXT burner.privaseer.io
nslookup -type=TXT burner.privaseer.io
```

### DKIM Signing

**Resend DKIM Records:**

```dns
Type: CNAME
Name: resend1._domainkey.burner.privaseer.io
Value: resend1.dkim.amazonses.com
TTL: 3600

Type: CNAME
Name: resend2._domainkey.burner.privaseer.io
Value: resend2.dkim.amazonses.com
TTL: 3600

Type: CNAME
Name: resend3._domainkey.burner.privaseer.io
Value: resend3.dkim.amazonses.com
TTL: 3600
```

**Validation:**
```bash
dig CNAME resend1._domainkey.burner.privaseer.io
```

### DMARC Policy

**Recommended DMARC Record:**

```dns
Type: TXT
Name: _dmarc.burner.privaseer.io
Value: v=DMARC1; p=quarantine; rua=mailto:dmarc@privaseer.io; pct=100
TTL: 3600
```

**Validation:**
```bash
dig TXT _dmarc.burner.privaseer.io
```

**Policy Progression:**
1. Start: `p=none` (monitoring only)
2. Week 2: `p=quarantine` (spam folder)
3. Month 2: `p=reject` (full enforcement)

## API Security

### Authentication

**Authenticated Endpoints:**
- generate-burner-email (requires auth)
- List burner emails (requires auth)
- Update burner email (requires auth)
- Delete burner email (requires auth)

**Anonymous Endpoints:**
- inbound-email webhook (uses ANON_KEY)

**Key Management:**
- ANON_KEY: Public, embedded in webhook config
- SERVICE_ROLE_KEY: Secret, server-side only
- Never expose SERVICE_ROLE_KEY in client code

### CORS Configuration

**All Endpoints:**
```typescript
corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
}
```

**Production Hardening:**
- Restrict Allow-Origin to specific domains
- Implement preflight request handling
- Set appropriate cache headers

### Environment Variables

**Required Variables:**
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- EMAIL_PROVIDER (resend or mailgun)
- EMAIL_API_KEY

**Security Requirements:**
- Never commit to version control
- Use Supabase secrets management
- Rotate keys quarterly
- Audit access logs monthly

## Data Protection

### Encryption at Rest

**Supabase Default:**
- All data encrypted at rest (AES-256)
- Managed by Supabase infrastructure
- Key rotation handled automatically

**PII Handling:**
- real_email column contains sensitive data
- Consider additional encryption for real_email
- Implement column-level encryption if needed

### Encryption in Transit

**TLS Requirements:**
- All API calls over HTTPS
- TLS 1.2 minimum
- Strong cipher suites only

**Certificate Validation:**
- Valid SSL/TLS certificates required
- Certificate pinning for mobile apps
- HSTS headers enabled

### Data Retention

**Email Logs:**
- Retain for 90 days
- Automatic cleanup recommended
- GDPR compliance required

**Audit Logs:**
- Retain for 1 year minimum
- Export for long-term archival
- Compliance with regulations

**Cleanup Queries:**
```sql
-- Delete old email logs (90 days)
DELETE FROM email_logs
WHERE received_at < NOW() - INTERVAL '90 days';

-- Archive old audit logs (1 year)
INSERT INTO security_audit_log_archive
SELECT * FROM security_audit_log
WHERE created_at < NOW() - INTERVAL '1 year';

DELETE FROM security_audit_log
WHERE created_at < NOW() - INTERVAL '1 year';
```

## Security Best Practices

### Principle of Least Privilege

- ✅ Anonymous role has minimal permissions
- ✅ RLS policies enforce data isolation
- ✅ Service functions use SECURITY DEFINER carefully
- ✅ API keys scoped to minimum required access

### Defense in Depth

Multiple security layers:
1. Input validation at edge functions
2. Database constraints for data integrity
3. RLS policies for access control
4. Rate limiting for abuse prevention
5. Audit logging for detection
6. Email authentication for deliverability

### Security Monitoring

**Daily Checks:**
- Review rate limit violations
- Check for paused burners
- Monitor spam spike incidents
- Review failed authentications

**Weekly Checks:**
- Analyze audit logs for patterns
- Review error rates
- Check email deliverability metrics
- Update blocklists/allowlists

**Monthly Checks:**
- Security audit log review
- RLS policy effectiveness
- Key rotation assessment
- Vulnerability scanning

### Incident Response

**Security Incident Types:**
1. Spam flood attack
2. Data breach attempt
3. API abuse
4. Authentication bypass
5. Email spoofing

**Response Procedure:**
1. Detect via monitoring/alerts
2. Log incident in audit system
3. Auto-pause affected burners
4. Investigate scope and impact
5. Apply immediate mitigations
6. Report to stakeholders
7. Post-mortem analysis

## Production Deployment Checklist

### Database

- [ ] All tables have RLS enabled
- [ ] RLS policies tested and verified
- [ ] Database constraints applied
- [ ] Audit logging enabled
- [ ] Indexes created for performance
- [ ] Backup strategy configured

### DNS

- [ ] SPF records configured and verified
- [ ] DKIM records configured and verified
- [ ] DMARC policy implemented
- [ ] MX records pointing correctly
- [ ] DNS propagation confirmed (48 hours)

### Edge Functions

- [ ] Input validation on all endpoints
- [ ] Rate limiting implemented
- [ ] Error handling comprehensive
- [ ] Logging configured
- [ ] Environment variables set
- [ ] Secrets properly managed

### Monitoring

- [ ] Error tracking enabled
- [ ] Rate limit monitoring
- [ ] Audit log analysis automated
- [ ] Alert thresholds configured
- [ ] On-call rotation established

### Documentation

- [ ] Security policies documented
- [ ] Incident response plan created
- [ ] Runbooks for common issues
- [ ] API documentation updated
- [ ] User security guidance provided

## Compliance

### GDPR

- ✅ User data minimization
- ✅ Data retention policies
- ✅ Right to deletion supported
- ✅ Data export capability
- ✅ Privacy by design
- ✅ Breach notification process

### CAN-SPAM

- ✅ Unsubscribe mechanism (burner deletion)
- ✅ Accurate from addresses
- ✅ No deceptive headers
- ✅ Forwarding transparency

## Security Contact

For security issues, contact:
- Email: security@privaseer.io
- PGP Key: [public key]
- Bug Bounty: [program details]

## Version History

- v1.0 (2025-01-19): Initial security configuration
- Future: Add security updates here
