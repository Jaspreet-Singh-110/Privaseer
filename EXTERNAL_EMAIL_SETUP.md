# External Email Forwarding Setup Guide

Complete guide for configuring Resend, Hostinger DNS, and webhooks to enable burner email forwarding.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Step 1: Resend Account Setup](#step-1-resend-account-setup)
4. [Step 2: Hostinger DNS Configuration](#step-2-hostinger-dns-configuration)
5. [Step 3: Supabase Environment Variables](#step-3-supabase-environment-variables)
6. [Step 4: Resend Webhook Configuration](#step-4-resend-webhook-configuration)
7. [Step 5: Verification and Testing](#step-5-verification-and-testing)
8. [Troubleshooting](#troubleshooting)

---

## Overview

The Privaseer burner email system uses external email forwarding to receive emails and forward them to users' real addresses. The complete flow works as follows:

```
External Email → Resend Inbound → Webhook → Supabase Function → Sanitize → Forward via Resend → User's Real Email
```

**Components:**
- **Resend**: Email service provider (handles both inbound routing and outbound forwarding)
- **Hostinger**: DNS provider (routes burner.privaseer.co.uk emails to Resend)
- **Supabase Edge Function**: `inbound-email` function processes webhooks, sanitizes content, and forwards emails

**What's Already Built:**
- ✅ Supabase Edge Function (`inbound-email`) - fully implemented with sanitization, rate limiting, spam detection
- ✅ Database schema - `burner_emails`, `email_logs`, RLS policies, audit functions
- ✅ Email sanitizer - removes tracking pixels, links, and generates reports
- ✅ Rate limiter - prevents abuse with configurable limits

**What You Need to Configure:**
- ⚠️ Resend account and API key
- ⚠️ Hostinger DNS records
- ⚠️ Resend webhook pointing to Supabase
- ⚠️ Supabase environment variables

---

## Prerequisites

Before starting, ensure you have:

1. **Domain Access**: Admin access to privaseer.co.uk DNS settings in Hostinger
2. **Supabase Project**: Access to your Supabase project dashboard
3. **Email Account**: A real email address to test forwarding
4. **Payment Method**: Resend requires payment information (free tier available)

---

## Step 1: Resend Account Setup

### 1.1 Create Resend Account

1. Go to [https://resend.com](https://resend.com)
2. Click "Sign Up" and create an account
3. Verify your email address
4. Complete account setup (billing info required, but free tier available)

### 1.2 Add Domain

1. In Resend dashboard, navigate to **Domains**
2. Click **"Add Domain"**
3. Enter domain: `burner.privaseer.co.uk`
4. Click **"Add"**

Resend will show you DNS records to configure (keep this page open for Step 2).

### 1.3 Generate API Key

1. In Resend dashboard, go to **API Keys**
2. Click **"Create API Key"**
3. Name it: `Privaseer Burner Email Forwarding`
4. Permissions: Select **"Sending access"** and **"Full access"**
5. Click **"Add"**
6. **IMPORTANT**: Copy the API key immediately (shown only once)
7. Save it securely - you'll need it for Step 3

**API Key Format**: Starts with `re_` followed by random characters (e.g., `re_123abc456def789ghi`)

---

## Step 2: Hostinger DNS Configuration

### 2.1 Access DNS Management

1. Log in to [Hostinger Control Panel](https://hpanel.hostinger.com)
2. Navigate to **Domains** → Select `privaseer.co.uk`
3. Click **DNS / Name Servers** → **Manage DNS Records**

### 2.2 Add MX Records

Resend provides specific MX records for your domain. Add these from the Resend dashboard:

**Example MX Records** (verify exact values in Resend):

| Type | Name | Priority | Points To | TTL |
|------|------|----------|-----------|-----|
| MX | burner | 10 | feedback-smtp.us-east-1.amazonses.com | 3600 |

**Steps:**
1. Click **"Add Record"**
2. Type: **MX**
3. Name: **burner**
4. Priority: **10** (or as shown in Resend)
5. Points To: (copy from Resend dashboard)
6. TTL: **3600** (1 hour)
7. Click **"Add Record"**

### 2.3 Add SPF Record

SPF authorizes Resend to send emails from your domain.

| Type | Name | Value | TTL |
|------|------|-------|-----|
| TXT | burner | `v=spf1 include:amazonses.com ~all` | 3600 |

**Steps:**
1. Click **"Add Record"**
2. Type: **TXT**
3. Name: **burner**
4. Value: `v=spf1 include:amazonses.com ~all`
5. TTL: **3600**
6. Click **"Add Record"**

### 2.4 Add DKIM Records

DKIM records authenticate emails sent from your domain. Resend provides these - copy from dashboard.

**Example** (exact values in Resend):

| Type | Name | Value | TTL |
|------|------|-------|-----|
| TXT | resend._domainkey.burner | `p=MIGfMA0GCSqGSIb3DQEBAQUAA...` | 3600 |

**Steps:**
1. Click **"Add Record"**
2. Type: **TXT**
3. Name: (copy from Resend - usually `resend._domainkey.burner`)
4. Value: (copy DKIM public key from Resend)
5. TTL: **3600**
6. Click **"Add Record"**

### 2.5 Add DMARC Record (Optional but Recommended)

DMARC defines email authentication policy.

| Type | Name | Value | TTL |
|------|------|-------|-----|
| TXT | _dmarc.burner | `v=DMARC1; p=none; rua=mailto:dmarc@privaseer.co.uk` | 3600 |

**Steps:**
1. Click **"Add Record"**
2. Type: **TXT**
3. Name: **_dmarc.burner**
4. Value: `v=DMARC1; p=none; rua=mailto:dmarc@privaseer.co.uk`
5. TTL: **3600**
6. Click **"Add Record"**

### 2.6 Verify DNS Propagation

DNS changes can take 15 minutes to 48 hours to propagate globally.

**Check propagation:**

```bash
# Check MX records
dig MX burner.privaseer.co.uk

# Check SPF
dig TXT burner.privaseer.co.uk

# Check DKIM
dig TXT resend._domainkey.burner.privaseer.co.uk

# Alternative: Use online tools
# https://mxtoolbox.com/SuperTool.aspx
# https://dnschecker.org/
```

**Expected Results:**
- MX record points to Resend's servers
- TXT records show SPF and DKIM values
- Status should be "NOERROR" (not "NXDOMAIN")

### 2.7 Verify Domain in Resend

1. Return to Resend dashboard → **Domains**
2. Click **"Verify"** next to burner.privaseer.co.uk
3. Wait for verification (may take several minutes)
4. Status should change to **"Verified"** with green checkmark

---

## Step 3: Supabase Environment Variables

### 3.1 Access Supabase Project Settings

1. Log in to [Supabase Dashboard](https://app.supabase.com)
2. Select your project: `privaseer`
3. Navigate to **Settings** → **Edge Functions**

### 3.2 Add Environment Variables

Add these variables for the `inbound-email` function:

| Variable Name | Value | Description |
|---------------|-------|-------------|
| `EMAIL_PROVIDER` | `resend` | Email service provider (use "resend") |
| `EMAIL_API_KEY` | `re_xxxxx...` | Your Resend API key from Step 1.3 |

**Steps:**
1. Click **"Add new secret"**
2. Name: **EMAIL_PROVIDER**
3. Value: **resend**
4. Click **"Save"**
5. Click **"Add new secret"** again
6. Name: **EMAIL_API_KEY**
7. Value: (paste your Resend API key)
8. Click **"Save"**

### 3.3 Restart Edge Function (if deployed)

If the `inbound-email` function is already deployed:

1. Navigate to **Edge Functions** in Supabase dashboard
2. Find `inbound-email` function
3. Click **"···"** menu → **"Redeploy"**
4. Wait for deployment to complete

This ensures the new environment variables are loaded.

---

## Step 4: Resend Webhook Configuration

### 4.1 Get Supabase Function URL

Your webhook URL is:
```
https://0ec90b57d6e95fcbda19832f.supabase.co/functions/v1/inbound-email
```

**URL Format:**
```
https://[PROJECT_ID].supabase.co/functions/v1/inbound-email
```

Where `[PROJECT_ID]` is from your `.env` file's `VITE_SUPABASE_URL`.

### 4.2 Configure Webhook in Resend

1. In Resend dashboard, go to **Webhooks**
2. Click **"Add Webhook"**
3. **Endpoint URL**: `https://0ec90b57d6e95fcbda19832f.supabase.co/functions/v1/inbound-email`
4. **Events to Subscribe**: Select **"email.received"**
5. **Status**: **Enabled**
6. Click **"Create Webhook"**

### 4.3 Configure Inbound Rules (Critical)

Resend needs to know to forward emails to your webhook:

1. In Resend dashboard, go to **Domains** → `burner.privaseer.co.uk`
2. Click **"Inbound"** tab
3. Click **"Add Inbound Rule"**
4. **Match Type**: **"All emails"** (or specify patterns if needed)
5. **Forward To**: Select **"Webhook"**
6. **Webhook URL**: `https://0ec90b57d6e95fcbda19832f.supabase.co/functions/v1/inbound-email`
7. Click **"Save"**

**IMPORTANT**: Without this inbound rule, emails will be received by Resend but NOT forwarded to your webhook!

### 4.4 Test Webhook Delivery (Optional)

Resend provides a webhook testing tool:

1. In **Webhooks** section, find your webhook
2. Click **"Test"** button
3. Resend will send a test payload to your endpoint
4. Check Supabase function logs for incoming request

---

## Step 5: Verification and Testing

### 5.1 Pre-Flight Checklist

Before testing, verify:

- [ ] Resend domain status is **"Verified"** (green checkmark)
- [ ] DNS records are propagated (use `dig` or online tools)
- [ ] Supabase environment variables are set (`EMAIL_PROVIDER`, `EMAIL_API_KEY`)
- [ ] Resend webhook is created and **enabled**
- [ ] Resend inbound rule is configured to forward to webhook
- [ ] Edge function `inbound-email` is deployed

### 5.2 Create Test Burner Email

**Option A: Using Extension**
1. Install the Privaseer extension (build and load from `dist/`)
2. Open popup → Settings
3. Enable "Burner Email Generation"
4. Set your real email address for forwarding
5. Generate a burner email (e.g., `swift-thunder@burner.privaseer.co.uk`)

**Option B: Using test-deployment.html**
1. Open `/test-deployment.html` in browser
2. Enter your real email in "Forwarding Email" field
3. Click "Generate Burner Email"
4. Copy the generated burner address

### 5.3 Send Test Email

1. From an external email account (Gmail, Outlook, etc.)
2. Send an email to your burner address
3. Subject: `Test Email - Burner Forwarding`
4. Body: Include some text (plain or HTML)

### 5.4 Monitor Supabase Logs

1. Go to Supabase Dashboard → **Edge Functions** → `inbound-email`
2. Click **"Logs"** tab
3. Look for recent entries showing:
   - `=== INBOUND EMAIL FUNCTION START ===`
   - `EMAIL_PROVIDER: resend`
   - `EMAIL_API_KEY: ✓ Set`
   - `Burner email found: { ... }`
   - `=== FORWARD EMAIL SUCCESS ===`

**Log Markers to Look For:**

**✅ Success Markers:**
```
EMAIL_API_KEY: ✓ Set (length: 40)
Burner email found: {...}
Resend API Response Status: 200
=== FORWARD EMAIL SUCCESS ===
Email forwarded successfully
```

**❌ Error Markers:**
```
EMAIL_API_KEY: ✗ Missing
Burner email not found or inactive
Resend API error - Status: 401
Rate limit exceeded
```

### 5.5 Check Your Real Email Inbox

Within 1-2 minutes, you should receive:

- **From**: `Privaseer Burner <noreply@burner.privaseer.co.uk>`
- **Subject**: `[Forwarded] Test Email - Burner Forwarding`
- **Body**: Original email content + sanitization report showing:
  - Tracking pixels removed
  - Remote images blocked
  - Tracking links sanitized

**Sanitization Report Example:**
```
========================================
PRIVASEER SECURITY REPORT
========================================

This email was scanned and sanitized by Privaseer.

Tracking Elements Removed:
- Tracking Pixels: 2
- Remote Images: 5
- Tracking Links: 3
Total Trackers Blocked: 10

Original Sender: sender@example.com
Received: 2024-12-14T10:30:00Z
```

### 5.6 Verify Database Logs

Check that the email was logged in the database:

```sql
-- Check email_logs table
SELECT
  burner_email_id,
  from_address,
  subject,
  forwarded,
  trackers_removed,
  received_at,
  forwarded_at,
  error_message
FROM email_logs
ORDER BY received_at DESC
LIMIT 5;

-- Check burner_emails counters
SELECT
  email_address,
  emails_received,
  emails_forwarded,
  last_received_at
FROM burner_emails
ORDER BY last_received_at DESC;
```

**Expected Results:**
- `email_logs` has new entry with `forwarded = true`
- `emails_received` and `emails_forwarded` counters incremented
- `error_message` is NULL
- `trackers_removed` shows count > 0 if email had trackers

### 5.7 Test Different Email Formats

Send additional test emails to verify:

1. **Plain text email** (no HTML)
2. **HTML email with images**
3. **Email with tracking links** (e.g., newsletter)
4. **Email with attachments** (not yet supported - check logs)

Monitor logs for each test to ensure proper handling.

---

## Troubleshooting

### Issue: "Burner email not found or inactive"

**Symptoms:**
- Logs show: `Burner email not found or inactive: xxx@burner.privaseer.co.uk`
- Email not forwarded
- Function returns 404 status

**Solutions:**
1. **Verify burner email exists in database:**
   ```sql
   SELECT email_address, is_active, expires_at
   FROM burner_emails
   WHERE email_address = 'xxx@burner.privaseer.co.uk';
   ```
2. **Check if burner email is active:** `is_active` should be `true`
3. **Check expiration:** If `expires_at` is set and in the past, email is expired
4. **Regenerate burner email** if needed

---

### Issue: "EMAIL_API_KEY not configured"

**Symptoms:**
- Logs show: `EMAIL_API_KEY: ✗ Missing`
- Function returns 500 status
- No forwarding attempted

**Solutions:**
1. **Verify environment variable is set in Supabase:**
   - Go to Settings → Edge Functions
   - Check if `EMAIL_API_KEY` exists
2. **If missing, add it** (see Step 3.2)
3. **Restart edge function** to load new variables
4. **Verify API key format:** Should start with `re_`

---

### Issue: "Resend API error - Status: 401"

**Symptoms:**
- Logs show: `Resend API Response Status: 401`
- Error: `Resend error: 401 - Unauthorized`

**Solutions:**
1. **API key is invalid or expired:**
   - Regenerate API key in Resend dashboard
   - Update `EMAIL_API_KEY` in Supabase
   - Redeploy function
2. **API key doesn't have send permissions:**
   - Check API key permissions in Resend
   - Ensure "Sending access" is enabled
3. **API key is for wrong environment:**
   - Verify you're using production API key (not test key)

---

### Issue: "Resend API error - Status: 403"

**Symptoms:**
- Logs show: `Resend API Response Status: 403`
- Error: `Resend error: 403 - Forbidden`

**Solutions:**
1. **Domain not verified:**
   - Check Resend dashboard → Domains
   - Verify `burner.privaseer.co.uk` shows green checkmark
   - Re-verify DNS records if needed
2. **Sender email doesn't match verified domain:**
   - Check function code uses `noreply@burner.privaseer.co.uk`
   - Ensure domain matches verified domain in Resend

---

### Issue: "Resend API error - Status: 422"

**Symptoms:**
- Logs show: `Resend API Response Status: 422`
- Error: `Resend error: 422 - Unprocessable Entity`

**Solutions:**
1. **Invalid email payload:**
   - Check function logs for payload details
   - Verify `to` email address is valid format
   - Ensure required fields (from, to, subject) are present
2. **Email content issues:**
   - HTML might be malformed
   - Subject line might contain invalid characters
   - Check sanitization didn't break email structure

---

### Issue: No email received at real address

**Symptoms:**
- Logs show: `=== FORWARD EMAIL SUCCESS ===`
- Status 200, no errors
- But email never arrives at real inbox

**Solutions:**
1. **Check spam folder** - forwarded emails might be filtered
2. **Verify real email address is correct:**
   ```sql
   SELECT real_email FROM burner_emails WHERE email_address = 'xxx@burner.privaseer.co.uk';
   ```
3. **Check Resend dashboard logs:**
   - Go to Resend → Emails
   - Look for sent emails to your real address
   - Check delivery status
4. **Whitelist sender:**
   - Add `noreply@burner.privaseer.co.uk` to contacts
   - Mark as "Not Spam" if found in spam

---

### Issue: Webhook not triggering

**Symptoms:**
- Sent email to burner address
- No logs appear in Supabase function
- No `=== INBOUND EMAIL FUNCTION START ===` entry

**Solutions:**
1. **Verify webhook is enabled in Resend:**
   - Go to Resend → Webhooks
   - Check status is "Enabled" (green)
2. **Verify inbound rule is configured:**
   - Go to Resend → Domains → burner.privaseer.co.uk → Inbound
   - Ensure rule forwards to webhook URL
3. **Check webhook URL is correct:**
   - Should match: `https://[PROJECT_ID].supabase.co/functions/v1/inbound-email`
   - No trailing slash
4. **Test webhook manually:**
   - Use Resend's webhook test feature
   - Check if test payload reaches function
5. **Verify DNS records:**
   - MX records must point to Resend
   - Use `dig MX burner.privaseer.co.uk` to verify

---

### Issue: Rate limit exceeded

**Symptoms:**
- Logs show: `Rate limit exceeded`
- Function returns 429 status
- Message: `Too many emails received`

**Solutions:**
1. **This is normal behavior** - protects against spam
2. **Rate limits:**
   - 10 emails per minute
   - 50 emails per hour
   - 200 emails per day
3. **Wait for cooldown period** (1 minute, 1 hour, or 1 day)
4. **If legitimate traffic:**
   - Consider adjusting limits in `rate-limiter.ts`
   - Review `email_logs` for unusual patterns

---

### Issue: Spam spike detected

**Symptoms:**
- Logs show: `Spam spike detected, auto-pausing`
- Burner email automatically paused
- Function returns 429 status

**Solutions:**
1. **Spam protection triggered** - too many emails too quickly
2. **Spike thresholds:**
   - 5 emails in 1 minute
   - 20 emails in 5 minutes
   - 50 emails in 1 hour
3. **Manually re-enable burner email:**
   ```sql
   UPDATE burner_emails
   SET is_active = true
   WHERE email_address = 'xxx@burner.privaseer.co.uk';
   ```
4. **Review email sources:**
   - Check `email_logs` for sender patterns
   - Consider deleting burner email if compromised
   - Generate new burner email for legitimate use

---

### Issue: DNS records not propagating

**Symptoms:**
- Added DNS records in Hostinger hours ago
- `dig` commands return empty or old results
- Resend can't verify domain

**Solutions:**
1. **Wait longer** - DNS can take up to 48 hours
2. **Check TTL values:**
   - Lower TTL (e.g., 300 seconds) = faster propagation
   - Higher TTL (e.g., 86400 seconds) = slower updates
3. **Verify records in Hostinger:**
   - Log in and double-check all records are saved
   - Look for typos in record names or values
4. **Use multiple DNS checker tools:**
   - [DNSChecker.org](https://dnschecker.org/)
   - [MXToolbox](https://mxtoolbox.com/)
   - [WhatsMyDNS](https://whatsmydns.net/)
5. **Try flushing local DNS cache:**
   ```bash
   # macOS
   sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder

   # Windows
   ipconfig /flushdns

   # Linux
   sudo systemd-resolve --flush-caches
   ```

---

### Issue: Function logs show "Unknown email provider"

**Symptoms:**
- Logs show: `Unknown email provider: xxx`
- Function returns error

**Solutions:**
1. **Check EMAIL_PROVIDER variable:**
   - Should be exactly: `resend` (lowercase)
   - Not: `Resend`, `RESEND`, or any other variant
2. **Update environment variable** if incorrect
3. **Restart function** after updating

---

### Getting Additional Help

If you're still experiencing issues:

1. **Capture complete logs:**
   - Copy full Supabase function logs
   - Include timestamps and request IDs
   - Note exact error messages

2. **Check configuration:**
   - Run diagnostic scripts (see `DIAGNOSTIC_TOOLS.md`)
   - Verify DNS records with `dig` commands
   - Check Resend dashboard for delivery logs

3. **Review documentation:**
   - Resend docs: [https://resend.com/docs](https://resend.com/docs)
   - Supabase Edge Functions: [https://supabase.com/docs/guides/functions](https://supabase.com/docs/guides/functions)

4. **Common debugging steps:**
   - Test with a fresh burner email
   - Send from different external email providers
   - Check Resend webhook delivery logs
   - Verify API key has proper permissions

---

## Next Steps

After successful setup:

1. **Monitor logs regularly** for errors or unusual patterns
2. **Set up alerts** for function failures in Supabase
3. **Test different email scenarios** (HTML, plain text, newsletters)
4. **Document your configuration** for team members
5. **Review rate limits** and adjust if needed for your use case
6. **Consider backup provider** (Mailgun support is already in code)

---

## Quick Reference

**Webhook URL:**
```
https://0ec90b57d6e95fcbda19832f.supabase.co/functions/v1/inbound-email
```

**Domain:**
```
burner.privaseer.co.uk
```

**Sender Address:**
```
noreply@burner.privaseer.co.uk
```

**Required Environment Variables:**
- `EMAIL_PROVIDER`: `resend`
- `EMAIL_API_KEY`: `re_xxxxx...`

**DNS Check Commands:**
```bash
dig MX burner.privaseer.co.uk
dig TXT burner.privaseer.co.uk
dig TXT resend._domainkey.burner.privaseer.co.uk
```

**Database Query - Check Recent Emails:**
```sql
SELECT * FROM email_logs ORDER BY received_at DESC LIMIT 10;
```

---

**Last Updated:** December 2024
**Version:** 1.0.0
