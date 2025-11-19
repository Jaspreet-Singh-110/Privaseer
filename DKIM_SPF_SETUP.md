# DKIM/SPF Email Authentication Setup

Complete guide for configuring email authentication to ensure reliable delivery of forwarded emails from Privaseer burner addresses.

## Overview

Email authentication prevents your forwarded emails from being marked as spam. DKIM (DomainKeys Identified Mail) and SPF (Sender Policy Framework) work together to verify that emails are legitimately sent from your domain.

## Why DKIM/SPF Matter

### Without Authentication
- Emails marked as spam
- Low deliverability rates
- Recipient servers reject messages
- Poor sender reputation

### With Authentication
- High deliverability (>98%)
- Trusted sender status
- Better inbox placement
- Professional reputation

## Prerequisites

- Domain ownership: `burner.privaseer.io`
- DNS management access
- Email provider account (Resend or Mailgun)
- SSL/TLS certificate (handled by provider)

## SPF (Sender Policy Framework)

### What is SPF?

SPF specifies which mail servers are authorized to send email on behalf of your domain.

### Setup for Resend

Add a TXT record to `burner.privaseer.io`:

```
Type: TXT
Name: burner.privaseer.io (or @)
Value: v=spf1 include:amazonses.com ~all
TTL: 3600
```

### Setup for Mailgun

Add a TXT record to `burner.privaseer.io`:

```
Type: TXT
Name: burner.privaseer.io (or @)
Value: v=spf1 include:mailgun.org ~all
TTL: 3600
```

### SPF Record Explained

- `v=spf1` - SPF version 1
- `include:amazonses.com` - Authorize Amazon SES (Resend)
- `include:mailgun.org` - Authorize Mailgun
- `~all` - Soft fail for others (recommended)
- `-all` - Hard fail for others (more strict)

### Verification

Check SPF record:

```bash
dig TXT burner.privaseer.io

# Or use online tool
nslookup -type=TXT burner.privaseer.io
```

Expected output:
```
burner.privaseer.io. 3600 IN TXT "v=spf1 include:amazonses.com ~all"
```

## DKIM (DomainKeys Identified Mail)

### What is DKIM?

DKIM adds a digital signature to emails, proving they haven't been tampered with and came from an authorized source.

### Setup for Resend

1. **Get DKIM Records from Resend Dashboard**
   - Navigate to Domains → burner.privaseer.io
   - Find DKIM records section
   - Copy the provided records

2. **Add CNAME Records to DNS**

Resend provides 3 CNAME records like:

```
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

### Setup for Mailgun

1. **Get DKIM Records from Mailgun Dashboard**
   - Navigate to Sending → Domains → burner.privaseer.io
   - Find DNS Records section
   - Copy the provided DKIM records

2. **Add TXT Records to DNS**

Mailgun provides 2 records like:

```
Type: TXT
Name: smtp._domainkey.burner.privaseer.io
Value: k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GN...
TTL: 3600

Type: TXT
Name: mailo._domainkey.burner.privaseer.io
Value: k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GN...
TTL: 3600
```

### DKIM Record Format

```
Type: TXT
Name: selector._domainkey.yourdomain.com
Value: k=rsa; p=<public-key>
```

- `k=rsa` - Key type
- `p=` - Public key (very long string)
- `selector` - Usually provider-specific (resend1, smtp, etc.)

### Verification

Check DKIM record:

```bash
dig TXT resend1._domainkey.burner.privaseer.io

# Or
nslookup -type=TXT resend1._domainkey.burner.privaseer.io
```

## DMARC (Optional but Recommended)

### What is DMARC?

DMARC (Domain-based Message Authentication, Reporting & Conformance) tells receiving servers what to do if SPF or DKIM checks fail.

### Basic DMARC Record

Add a TXT record:

```
Type: TXT
Name: _dmarc.burner.privaseer.io
Value: v=DMARC1; p=quarantine; rua=mailto:dmarc@privaseer.io
TTL: 3600
```

### DMARC Policies

- `p=none` - Monitor only (recommended for testing)
- `p=quarantine` - Send to spam folder (recommended)
- `p=reject` - Reject email completely (strict)

### DMARC Record Explained

```
v=DMARC1;              # Version
p=quarantine;          # Policy for failures
rua=mailto:email;      # Aggregate reports destination
ruf=mailto:email;      # Forensic reports destination (optional)
pct=100;              # Percentage of emails to apply policy (optional)
adkim=r;              # DKIM alignment (r=relaxed, s=strict)
aspf=r;               # SPF alignment (r=relaxed, s=strict)
```

## Complete DNS Configuration

### Minimum Required Records

For Resend:

```dns
; SPF
burner.privaseer.io.           TXT  "v=spf1 include:amazonses.com ~all"

; DKIM (get actual values from Resend)
resend1._domainkey.burner.privaseer.io.  CNAME  resend1.dkim.amazonses.com.
resend2._domainkey.burner.privaseer.io.  CNAME  resend2.dkim.amazonses.com.
resend3._domainkey.burner.privaseer.io.  CNAME  resend3.dkim.amazonses.com.

; DMARC (optional)
_dmarc.burner.privaseer.io.    TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@privaseer.io"
```

For Mailgun:

```dns
; SPF
burner.privaseer.io.           TXT  "v=spf1 include:mailgun.org ~all"

; DKIM (get actual values from Mailgun)
smtp._domainkey.burner.privaseer.io.     TXT  "k=rsa; p=<public-key>"
mailo._domainkey.burner.privaseer.io.    TXT  "k=rsa; p=<public-key>"

; DMARC (optional)
_dmarc.burner.privaseer.io.    TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@privaseer.io"
```

## Email Headers Configuration

### Proper From/Reply-To Headers

The inbound-email function sets these headers automatically:

```typescript
// Resend
headers: {
  "X-Original-From": payload.from,
  "X-Original-To": payload.recipient,
  "X-Privaseer-Trackers-Removed": trackersRemoved.toString(),
}
reply_to: payload.sender

// Mailgun
"h:Reply-To": payload.sender,
"h:X-Original-From": payload.from,
"h:X-Original-To": payload.recipient,
"h:X-Privaseer-Trackers-Removed": trackersRemoved.toString(),
```

### From Address

Always uses:
```
from: "Privaseer Burner <noreply@burner.privaseer.io>"
```

This ensures:
- DKIM signature matches domain
- SPF passes for authorized sender
- Professional appearance
- No spoofing flags

### Reply-To Address

Set to original sender:
```
reply_to: payload.sender
```

This allows users to reply directly to the original sender while maintaining privacy.

## Testing Authentication

### 1. Send Test Email

```bash
curl -X POST 'https://your-project.supabase.co/functions/v1/inbound-email' \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient": "test@burner.privaseer.io",
    "sender": "sender@example.com",
    "from": "Sender <sender@example.com>",
    "subject": "Test Email",
    "bodyPlain": "This is a test"
  }'
```

### 2. Check Email Headers

In received email, view full headers and look for:

```
Authentication-Results: spf=pass smtp.mailfrom=burner.privaseer.io;
  dkim=pass header.d=burner.privaseer.io;
  dmarc=pass (p=QUARANTINE)

Received-SPF: pass

DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed;
  d=burner.privaseer.io; s=resend1;
  h=from:to:subject:date:message-id;
```

### 3. Use Mail-Tester

Send test email to address provided by:
- [https://www.mail-tester.com/](https://www.mail-tester.com/)
- Should score 9/10 or higher

### 4. Check Authentication Tools

- [MxToolbox SPF Check](https://mxtoolbox.com/spf.aspx)
- [DKIM Validator](https://dkimvalidator.com/)
- [DMARC Analyzer](https://dmarcian.com/dmarc-inspector/)

## Troubleshooting

### SPF Fails

**Symptoms:**
- `Received-SPF: fail`
- Emails in spam folder

**Solutions:**
1. Verify SPF record exists: `dig TXT burner.privaseer.io`
2. Check include domain is correct
3. Wait for DNS propagation (up to 48 hours)
4. Ensure only one SPF record exists

### DKIM Fails

**Symptoms:**
- `dkim=fail` in headers
- "Unsigned" or "Invalid signature" warnings

**Solutions:**
1. Verify DKIM records exist: `dig TXT resend1._domainkey.burner.privaseer.io`
2. Check selector matches provider's requirement
3. Ensure public key is complete (very long string)
4. Verify domain is verified in provider dashboard
5. Wait for DNS propagation

### DMARC Fails

**Symptoms:**
- `dmarc=fail` in headers
- Quarantined or rejected emails

**Solutions:**
1. Ensure SPF and DKIM pass first
2. Verify DMARC record: `dig TXT _dmarc.burner.privaseer.io`
3. Check alignment (domain match between From and DKIM/SPF)
4. Start with `p=none` for monitoring
5. Review DMARC reports

### Common Issues

**Issue: Multiple SPF Records**
```
Error: Multiple TXT records containing SPF
```
Solution: Combine into single record using include:

```
v=spf1 include:amazonses.com include:mailgun.org ~all
```

**Issue: SPF Too Long**
```
Error: SPF record exceeds 255 characters
```
Solution: Use fewer includes or split into subdomains

**Issue: DKIM Signature Invalid**
```
dkim=neutral (signature verification failed)
```
Solution: Ensure From domain matches DKIM signature domain

## Best Practices

1. **Start with monitoring**
   - Use DMARC `p=none` initially
   - Review reports for 2-4 weeks
   - Gradually increase to `p=quarantine`

2. **Keep records updated**
   - Monitor provider changes
   - Update DNS when switching providers
   - Maintain record documentation

3. **Regular testing**
   - Send test emails weekly
   - Monitor authentication failures
   - Check sender reputation

4. **DNS management**
   - Use low TTL (3600) for flexibility
   - Keep backup of all records
   - Document changes

5. **Email headers**
   - Always set proper From address
   - Use Reply-To for original sender
   - Include authentication headers

## Provider-Specific Guides

### Resend

- [Resend DKIM Setup](https://resend.com/docs/dashboard/domains/introduction)
- [SPF Configuration](https://resend.com/docs/knowledge-base/spf-setup)

### Mailgun

- [Mailgun Domain Verification](https://documentation.mailgun.com/en/latest/user_manual.html#verifying-your-domain)
- [DKIM Setup](https://documentation.mailgun.com/en/latest/user_manual.html#dkim)

## Monitoring

### Track Authentication Status

Query database for delivery issues:

```sql
SELECT
  COUNT(*) as total_emails,
  SUM(CASE WHEN forwarded = true THEN 1 ELSE 0 END) as forwarded,
  SUM(CASE WHEN forwarded = false THEN 1 ELSE 0 END) as failed
FROM email_logs
WHERE received_at >= NOW() - INTERVAL '24 hours';
```

### Check Error Messages

```sql
SELECT
  error_message,
  COUNT(*) as count
FROM email_logs
WHERE forwarded = false
  AND error_message IS NOT NULL
GROUP BY error_message
ORDER BY count DESC;
```

## Maintenance Checklist

- [ ] SPF record configured and verified
- [ ] DKIM records added (all selectors)
- [ ] DMARC policy set (start with p=none)
- [ ] Domain verified in email provider dashboard
- [ ] Test emails sent and authenticated
- [ ] Mail-tester score 9/10 or higher
- [ ] Headers properly configured in edge function
- [ ] From address uses authenticated domain
- [ ] Reply-To allows direct responses
- [ ] Monitoring in place for failures
- [ ] DMARC reports configured and reviewed

## Support Resources

- [RFC 7208 - SPF](https://tools.ietf.org/html/rfc7208)
- [RFC 6376 - DKIM](https://tools.ietf.org/html/rfc6376)
- [RFC 7489 - DMARC](https://tools.ietf.org/html/rfc7489)
- [Google Email Authentication](https://support.google.com/a/answer/33786)
- [Microsoft Email Authentication](https://docs.microsoft.com/en-us/microsoft-365/security/office-365-security/email-authentication-about)
