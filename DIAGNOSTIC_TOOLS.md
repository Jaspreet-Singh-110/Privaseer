# Diagnostic Tools and Verification Scripts

Tools and commands to verify and troubleshoot the external email forwarding setup.

## Table of Contents

1. [DNS Verification](#dns-verification)
2. [Supabase Function Testing](#supabase-function-testing)
3. [Database Queries](#database-queries)
4. [Resend API Testing](#resend-api-testing)
5. [Webhook Testing](#webhook-testing)
6. [Log Analysis](#log-analysis)
7. [Health Check Script](#health-check-script)

---

## DNS Verification

### Check MX Records

Verify that burner.privaseer.co.uk MX records point to Resend:

```bash
# Check MX records
dig MX burner.privaseer.co.uk

# Expected output includes:
# burner.privaseer.co.uk. 3600 IN MX 10 feedback-smtp.us-east-1.amazonses.com.
```

### Check SPF Record

Verify SPF record authorizes Resend:

```bash
# Check SPF
dig TXT burner.privaseer.co.uk

# Expected output includes:
# burner.privaseer.co.uk. 3600 IN TXT "v=spf1 include:amazonses.com ~all"
```

### Check DKIM Record

Verify DKIM authentication record:

```bash
# Check DKIM (replace with actual selector from Resend)
dig TXT resend._domainkey.burner.privaseer.co.uk

# Expected output includes:
# resend._domainkey.burner.privaseer.co.uk. 3600 IN TXT "p=MIGfMA0GCS..."
```

### Check DMARC Record

Verify DMARC policy:

```bash
# Check DMARC
dig TXT _dmarc.burner.privaseer.co.uk

# Expected output includes:
# _dmarc.burner.privaseer.co.uk. 3600 IN TXT "v=DMARC1; p=none; ..."
```

### Check All Records at Once

```bash
#!/bin/bash
# dns-check.sh - Check all DNS records for burner email setup

echo "=== DNS VERIFICATION FOR BURNER.PRIVASEER.CO.UK ==="
echo ""

echo "1. MX Records:"
dig MX burner.privaseer.co.uk +short
echo ""

echo "2. SPF Record:"
dig TXT burner.privaseer.co.uk +short | grep spf
echo ""

echo "3. DKIM Record:"
dig TXT resend._domainkey.burner.privaseer.co.uk +short
echo ""

echo "4. DMARC Record:"
dig TXT _dmarc.burner.privaseer.co.uk +short
echo ""

echo "=== END DNS VERIFICATION ==="
```

### Online DNS Checkers

Use these web tools for comprehensive checks:

- **MX Toolbox**: https://mxtoolbox.com/SuperTool.aspx?action=mx%3aburner.privaseer.co.uk
- **DNS Checker**: https://dnschecker.org/#MX/burner.privaseer.co.uk
- **WhatsMyDNS**: https://whatsmydns.net/#MX/burner.privaseer.co.uk

---

## Supabase Function Testing

### Test Function Directly with curl

Send a test webhook payload to your Supabase function:

```bash
# test-inbound-email.sh
#!/bin/bash

FUNCTION_URL="https://0ec90b57d6e95fcbda19832f.supabase.co/functions/v1/inbound-email"

# Test payload (simulating Resend webhook)
curl -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient": "test-burner@burner.privaseer.co.uk",
    "sender": "sender@example.com",
    "from": "sender@example.com",
    "subject": "Test Email",
    "bodyPlain": "This is a test email body.",
    "bodyHtml": "<p>This is a test email body.</p>",
    "timestamp": '$(date +%s000)'
  }'

echo ""
```

### Test with Form Data (Resend format)

```bash
# test-inbound-email-form.sh
#!/bin/bash

FUNCTION_URL="https://0ec90b57d6e95fcbda19832f.supabase.co/functions/v1/inbound-email"

curl -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "recipient=test-burner@burner.privaseer.co.uk" \
  -d "sender=sender@example.com" \
  -d "from=sender@example.com" \
  -d "subject=Test Email" \
  -d "body-plain=This is a test email body." \
  -d "body-html=<p>This is a test email body.</p>"

echo ""
```

### Expected Responses

**Success (200):**
```json
{
  "success": true,
  "message": "Email forwarded successfully",
  "trackersRemoved": 0
}
```

**Burner Not Found (404):**
```json
{
  "error": "Burner email not found or inactive",
  "message": "Email rejected"
}
```

**Rate Limited (429):**
```json
{
  "error": "Rate limit exceeded",
  "message": "Too many emails received. Please try again in 1 minute."
}
```

**Configuration Error (500):**
```json
{
  "error": "Email forwarding not configured"
}
```

---

## Database Queries

### Check Burner Email Status

```sql
-- Check if burner email exists and is active
SELECT
  id,
  email_address,
  real_email,
  is_active,
  expires_at,
  emails_received,
  emails_forwarded,
  created_at,
  last_received_at
FROM burner_emails
WHERE email_address = 'YOUR_BURNER@burner.privaseer.co.uk';
```

### View Recent Email Logs

```sql
-- View last 10 emails received and forwarding status
SELECT
  el.id,
  be.email_address AS burner_email,
  el.from_address,
  el.subject,
  el.forwarded,
  el.trackers_removed,
  el.received_at,
  el.forwarded_at,
  el.error_message
FROM email_logs el
JOIN burner_emails be ON be.id = el.burner_email_id
ORDER BY el.received_at DESC
LIMIT 10;
```

### Check Rate Limit Status

```sql
-- Check recent email rate for a burner email
SELECT
  burner_email_id,
  COUNT(*) as email_count,
  MIN(received_at) as first_email,
  MAX(received_at) as last_email,
  MAX(received_at) - MIN(received_at) as time_span
FROM email_logs
WHERE burner_email_id = 'YOUR_BURNER_ID'
  AND received_at > NOW() - INTERVAL '1 hour'
GROUP BY burner_email_id;
```

### Check Forwarding Success Rate

```sql
-- Calculate forwarding success rate per burner email
SELECT
  be.email_address,
  COUNT(*) as total_emails,
  SUM(CASE WHEN el.forwarded THEN 1 ELSE 0 END) as forwarded_count,
  SUM(CASE WHEN NOT el.forwarded THEN 1 ELSE 0 END) as failed_count,
  ROUND(
    100.0 * SUM(CASE WHEN el.forwarded THEN 1 ELSE 0 END) / COUNT(*),
    2
  ) as success_rate
FROM burner_emails be
LEFT JOIN email_logs el ON el.burner_email_id = be.id
GROUP BY be.email_address
ORDER BY total_emails DESC;
```

### Check Tracker Removal Stats

```sql
-- Tracker removal statistics
SELECT
  DATE(received_at) as date,
  COUNT(*) as total_emails,
  SUM(trackers_removed) as total_trackers_removed,
  AVG(trackers_removed) as avg_trackers_per_email,
  MAX(trackers_removed) as max_trackers_in_email
FROM email_logs
WHERE received_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(received_at)
ORDER BY date DESC;
```

### Find Failed Forwards

```sql
-- Find emails that failed to forward
SELECT
  be.email_address,
  el.from_address,
  el.subject,
  el.received_at,
  el.error_message
FROM email_logs el
JOIN burner_emails be ON be.id = el.burner_email_id
WHERE el.forwarded = false
  AND el.received_at > NOW() - INTERVAL '7 days'
ORDER BY el.received_at DESC;
```

### Check Expired Burner Emails

```sql
-- Find burner emails that have expired
SELECT
  email_address,
  real_email,
  expires_at,
  is_active,
  emails_received,
  emails_forwarded
FROM burner_emails
WHERE expires_at IS NOT NULL
  AND expires_at < NOW()
  AND is_active = true
ORDER BY expires_at DESC;
```

---

## Resend API Testing

### Test Resend API Authentication

```bash
# test-resend-auth.sh
#!/bin/bash

RESEND_API_KEY="re_your_api_key_here"

curl -X GET "https://api.resend.com/domains" \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json"

echo ""
```

**Expected Response:**
```json
{
  "data": [
    {
      "id": "...",
      "name": "burner.privaseer.co.uk",
      "status": "verified",
      "created_at": "..."
    }
  ]
}
```

### Send Test Email via Resend

```bash
# test-resend-send.sh
#!/bin/bash

RESEND_API_KEY="re_your_api_key_here"
TO_EMAIL="your-real-email@example.com"

curl -X POST "https://api.resend.com/emails" \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "Privaseer Burner <noreply@burner.privaseer.co.uk>",
    "to": "'"$TO_EMAIL"'",
    "subject": "Test Email from Resend API",
    "text": "This is a test email sent directly via Resend API.",
    "html": "<p>This is a test email sent directly via Resend API.</p>"
  }'

echo ""
```

### Check Resend Email Status

```bash
# check-resend-email.sh
#!/bin/bash

RESEND_API_KEY="re_your_api_key_here"
EMAIL_ID="email_id_from_send_response"

curl -X GET "https://api.resend.com/emails/$EMAIL_ID" \
  -H "Authorization: Bearer $RESEND_API_KEY"

echo ""
```

---

## Webhook Testing

### Send Mock Webhook from Command Line

```bash
# test-webhook.sh
#!/bin/bash

WEBHOOK_URL="https://0ec90b57d6e95fcbda19832f.supabase.co/functions/v1/inbound-email"
BURNER_EMAIL="YOUR_BURNER@burner.privaseer.co.uk"

echo "Testing webhook with burner email: $BURNER_EMAIL"
echo ""

RESPONSE=$(curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -w "\nHTTP_STATUS:%{http_code}" \
  -d '{
    "recipient": "'"$BURNER_EMAIL"'",
    "sender": "test-sender@example.com",
    "from": "Test Sender <test-sender@example.com>",
    "subject": "Webhook Test Email",
    "bodyPlain": "This is a plain text test body.",
    "bodyHtml": "<p>This is an <strong>HTML</strong> test body.</p><img src=\"https://tracker.example.com/pixel.gif\" />",
    "timestamp": '$(date +%s000)'
  }')

HTTP_STATUS=$(echo "$RESPONSE" | grep HTTP_STATUS | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v HTTP_STATUS)

echo "Response Status: $HTTP_STATUS"
echo "Response Body:"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
echo ""
```

### Test with Tracking Elements

```bash
# test-webhook-trackers.sh
#!/bin/bash

WEBHOOK_URL="https://0ec90b57d6e95fcbda19832f.supabase.co/functions/v1/inbound-email"
BURNER_EMAIL="YOUR_BURNER@burner.privaseer.co.uk"

# Email with multiple tracking elements
HTML_BODY='<html><body>
<p>Test email with trackers</p>
<img src="https://tracker.example.com/pixel.gif" width="1" height="1" />
<img src="https://analytics.example.com/open.png" />
<a href="https://click.example.com/track?url=example.com">Click here</a>
<img src="https://email-spy.com/track/123.gif" />
</body></html>'

curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient": "'"$BURNER_EMAIL"'",
    "sender": "newsletter@example.com",
    "from": "Newsletter <newsletter@example.com>",
    "subject": "Test with Trackers",
    "bodyPlain": "Test email with tracking elements",
    "bodyHtml": '"$(echo "$HTML_BODY" | jq -Rs .)"',
    "timestamp": '$(date +%s000)'
  }' | jq '.'

echo ""
```

---

## Log Analysis

### Search Supabase Logs for Specific Burner

You can search Supabase function logs using the dashboard, but here are patterns to look for:

**Successful Forward Pattern:**
```
=== INBOUND EMAIL FUNCTION START ===
EMAIL_PROVIDER: resend
EMAIL_API_KEY: ✓ Set (length: 40)
Inbound email received (validated): {...}
Looking up burner email: xxx@burner.privaseer.co.uk
Burner email found: {...}
=== STARTING EMAIL FORWARD ===
Forwarding email to: real@example.com
Resend API Response Status: 200
=== FORWARD EMAIL SUCCESS ===
```

**Failed Forward Pattern:**
```
=== INBOUND EMAIL FUNCTION START ===
Looking up burner email: xxx@burner.privaseer.co.uk
Burner email not found or inactive: xxx@burner.privaseer.co.uk
```

**API Error Pattern:**
```
Resend API Response Status: 401
Resend API error - Status: 401
Resend API error - Body: {"error": "Invalid API key"}
=== EMAIL FORWARD FAILED ===
```

### Log Search Queries

If using Supabase logs API or CLI:

```bash
# Search for specific burner email
supabase functions logs inbound-email --filter "burner_email=xxx@burner.privaseer.co.uk"

# Search for errors
supabase functions logs inbound-email --filter "level=error"

# Search for successful forwards
supabase functions logs inbound-email --filter "FORWARD EMAIL SUCCESS"
```

---

## Health Check Script

### Comprehensive Health Check

Save this as `health-check.sh`:

```bash
#!/bin/bash

# Privaseer Email Forwarding Health Check
# Run this script to verify all components are properly configured

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║   PRIVASEER EMAIL FORWARDING HEALTH CHECK                  ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Configuration
DOMAIN="burner.privaseer.co.uk"
WEBHOOK_URL="https://0ec90b57d6e95fcbda19832f.supabase.co/functions/v1/inbound-email"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check functions
check_pass() {
    echo -e "${GREEN}✓ PASS${NC} - $1"
}

check_fail() {
    echo -e "${RED}✗ FAIL${NC} - $1"
}

check_warn() {
    echo -e "${YELLOW}⚠ WARN${NC} - $1"
}

# 1. Check DNS Records
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. DNS RECORDS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check MX record
echo -n "Checking MX records... "
MX_RESULT=$(dig MX $DOMAIN +short)
if [[ $MX_RESULT == *"amazonses.com"* ]]; then
    check_pass "MX records point to Resend"
    echo "   $MX_RESULT"
elif [[ -z "$MX_RESULT" ]]; then
    check_fail "No MX records found"
else
    check_warn "MX records exist but may not point to Resend"
    echo "   $MX_RESULT"
fi

# Check SPF record
echo -n "Checking SPF record... "
SPF_RESULT=$(dig TXT $DOMAIN +short | grep spf)
if [[ $SPF_RESULT == *"include:amazonses.com"* ]]; then
    check_pass "SPF record authorizes Resend"
    echo "   $SPF_RESULT"
elif [[ -z "$SPF_RESULT" ]]; then
    check_fail "No SPF record found"
else
    check_warn "SPF record exists but may not include Resend"
    echo "   $SPF_RESULT"
fi

# Check DKIM record
echo -n "Checking DKIM record... "
DKIM_RESULT=$(dig TXT resend._domainkey.$DOMAIN +short)
if [[ $DKIM_RESULT == *"p="* ]]; then
    check_pass "DKIM record found"
    echo "   ${DKIM_RESULT:0:50}..."
elif [[ -z "$DKIM_RESULT" ]]; then
    check_fail "No DKIM record found"
else
    check_warn "DKIM record may be malformed"
    echo "   $DKIM_RESULT"
fi

echo ""

# 2. Check Webhook Endpoint
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2. WEBHOOK ENDPOINT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test OPTIONS request (CORS preflight)
echo -n "Testing CORS preflight... "
OPTIONS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "$WEBHOOK_URL")
if [[ "$OPTIONS_STATUS" == "200" ]]; then
    check_pass "OPTIONS request returns 200"
else
    check_fail "OPTIONS request returned $OPTIONS_STATUS (expected 200)"
fi

# Test POST with invalid payload (should reject gracefully)
echo -n "Testing endpoint accessibility... "
POST_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d '{"test": "invalid"}')
if [[ "$POST_STATUS" =~ ^(200|404|422|500)$ ]]; then
    check_pass "Endpoint is accessible (HTTP $POST_STATUS)"
else
    check_fail "Endpoint returned unexpected status: $POST_STATUS"
fi

echo ""

# 3. Check Database (requires database connection)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3. DATABASE CHECK"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

check_warn "Database checks require manual verification"
echo "   Run these SQL queries in Supabase SQL Editor:"
echo "   - SELECT COUNT(*) FROM burner_emails WHERE is_active = true;"
echo "   - SELECT COUNT(*) FROM email_logs WHERE received_at > NOW() - INTERVAL '24 hours';"

echo ""

# 4. Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4. SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "Next steps:"
echo "  1. If DNS checks fail, verify records in Hostinger"
echo "  2. If webhook fails, check Supabase function deployment"
echo "  3. Send a test email to verify end-to-end flow"
echo "  4. Check Supabase function logs for detailed error messages"
echo ""

echo "Documentation:"
echo "  - Setup Guide: EXTERNAL_EMAIL_SETUP.md"
echo "  - Troubleshooting: OPERATIONAL_RUNBOOK.md"
echo ""
```

Make it executable:

```bash
chmod +x health-check.sh
./health-check.sh
```

---

## Quick Diagnostic Checklist

Run through this checklist to diagnose issues:

- [ ] **DNS Records**
  - [ ] MX record points to Resend
  - [ ] SPF record includes amazonses.com
  - [ ] DKIM record exists
  - [ ] Records have propagated (wait 15min-48hrs)

- [ ] **Resend Configuration**
  - [ ] Domain verified (green checkmark)
  - [ ] API key generated
  - [ ] Webhook created and enabled
  - [ ] Inbound rule configured to forward to webhook

- [ ] **Supabase Configuration**
  - [ ] Edge function `inbound-email` deployed
  - [ ] Environment variables set (EMAIL_PROVIDER, EMAIL_API_KEY)
  - [ ] Function has no errors in logs

- [ ] **Database**
  - [ ] Burner email exists in `burner_emails` table
  - [ ] Burner email `is_active = true`
  - [ ] Burner email not expired (`expires_at` is null or future)
  - [ ] Real email address is valid

- [ ] **Testing**
  - [ ] Send test email to burner address
  - [ ] Check Supabase function logs for webhook receipt
  - [ ] Verify email appears in `email_logs` table
  - [ ] Check real email inbox (including spam folder)

---

## Environment Variable Checker

Create a simple Node.js script to verify environment variables:

```javascript
// check-env.js
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

console.log('=== ENVIRONMENT VARIABLES CHECK ===\n');

console.log('VITE_SUPABASE_URL:', supabaseUrl ? '✓ Set' : '✗ Missing');
if (supabaseUrl) {
  console.log('  Value:', supabaseUrl);
  console.log('  Valid URL:', /^https:\/\/.+\.supabase\.co$/.test(supabaseUrl) ? 'Yes' : 'No');
}

console.log('\nVITE_SUPABASE_ANON_KEY:', supabaseKey ? '✓ Set' : '✗ Missing');
if (supabaseKey) {
  console.log('  Length:', supabaseKey.length);
  console.log('  Format:', supabaseKey.split('.').length === 3 ? 'Valid JWT' : 'Invalid');
}

console.log('\n=== Supabase Edge Function Environment ===');
console.log('Note: EMAIL_PROVIDER and EMAIL_API_KEY must be configured');
console.log('in Supabase Dashboard → Settings → Edge Functions');
console.log('\nRequired values:');
console.log('  EMAIL_PROVIDER: "resend"');
console.log('  EMAIL_API_KEY: "re_xxxxx..." (from Resend dashboard)');
```

Run with:
```bash
node check-env.js
```

---

**Last Updated:** December 2024
