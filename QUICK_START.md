# Quick Start Guide - External Email Setup

**Time Required:** 50 minutes (excluding DNS propagation)

---

## Step 1: Resend Account (10 min)

1. Go to https://resend.com and create account
2. Add domain: `burner.privaseer.co.uk`
3. Generate API key (name: "Privaseer Burner Email")
4. **Save API key** - starts with `re_`

📋 **Copy this:** `re_________________________` (your API key)

--- 

## Step 2: Hostinger DNS (15 min)

Login to https://hpanel.hostinger.com → Domains → privaseer.co.uk → DNS

Add these records (get exact values from Resend dashboard):

### MX Record
- Type: `MX`
- Name: `burner`
- Priority: `10`
- Points To: `feedback-smtp.us-east-1.amazonses.com` (from Resend)
- TTL: `3600`

### SPF Record
- Type: `TXT`
- Name: `burner`
- Value: `v=spf1 include:amazonses.com ~all`
- TTL: `3600`

### DKIM Record
- Type: `TXT`
- Name: `resend._domainkey.burner` (from Resend)
- Value: `p=MIGfMA0GCSqGSIb3...` (copy from Resend)
- TTL: `3600`

### DMARC Record (Optional)
- Type: `TXT`
- Name: `_dmarc.burner`
- Value: `v=DMARC1; p=none; rua=mailto:dmarc@privaseer.co.uk`
- TTL: `3600`

**Wait for DNS propagation** (15 min - 48 hours)

Check with: `dig MX burner.privaseer.co.uk`

---

## Step 3: Verify Domain in Resend (2 min)

1. Return to Resend dashboard → Domains
2. Click "Verify" next to burner.privaseer.co.uk
3. Wait for green checkmark (may take several minutes)

**Don't proceed until verified!**

---

## Step 4: Supabase Environment Variables (5 min)

1. Go to https://app.supabase.com
2. Select your project
3. Navigate to Settings → Edge Functions
4. Add these variables:

| Variable | Value |
|----------|-------|
| `EMAIL_PROVIDER` | `resend` |
| `EMAIL_API_KEY` | `re_________________________` |

5. Go to Edge Functions → inbound-email → Click "···" → Redeploy

---

## Step 5: Resend Webhook (5 min)

### Configure Webhook
1. In Resend dashboard → Webhooks → Add Webhook
2. **Endpoint URL:**
   ```
   https://llffqxdhpgsqnpzeznaq.supabase.co/functions/v1/inbound-email
   ```
3. **Events:** Select `email.received`
4. **Status:** Enabled
5. Click "Create Webhook"

### Configure Inbound Rule (CRITICAL!)
1. Go to Domains → burner.privaseer.co.uk → Inbound tab
2. Click "Add Inbound Rule"
3. **Match Type:** All emails
4. **Forward To:** Webhook
5. **Webhook URL:** (same as above)
6. Click "Save"

**Without this inbound rule, emails won't be forwarded!**

---

## Step 6: Test End-to-End (15 min)

### Generate Test Burner
1. Build extension: `npm run build`
2. Load extension: chrome://extensions → Load unpacked → select `dist/`
3. Click extension icon → Settings
4. Enable "Burner Email Generation"
5. Enter your real email for forwarding
6. Generate a burner email
7. **Copy burner address:** `____________@burner.privaseer.co.uk`

### Send Test Email
1. From Gmail/Outlook, send email to burner address
2. Subject: "Test Email"
3. Body: Add some text and an image

### Monitor Logs
1. Open Supabase Dashboard → Edge Functions → inbound-email → Logs
2. Look for: `=== INBOUND EMAIL FUNCTION START ===`
3. Should see: `EMAIL_API_KEY: ✓ Set`
4. Should see: `=== FORWARD EMAIL SUCCESS ===`

### Check Your Inbox
Within 1-2 minutes, check your real email for:
- **From:** Privaseer Burner <noreply@burner.privaseer.co.uk>
- **Subject:** [Forwarded] Test Email
- **Body:** Original content + tracker removal report

### Verify Database
```sql
-- Run in Supabase SQL Editor
SELECT * FROM email_logs ORDER BY received_at DESC LIMIT 5;
```

Should show entry with `forwarded = true`

---

## Troubleshooting Quick Reference

### Issue: Email not forwarded

**Check Supabase logs for:**
```
EMAIL_API_KEY: ✗ Missing          → Add environment variable
Burner email not found            → Regenerate burner email
Resend API error: 401             → Invalid API key
Resend API error: 403             → Domain not verified
Rate limit exceeded               → Wait 1 minute
```

### Issue: Webhook not triggering

**Check:**
1. Resend webhook is enabled ✓
2. Inbound rule is configured ✓ (MOST COMMON ISSUE!)
3. Webhook URL is correct ✓
4. DNS MX record points to Resend ✓

### Issue: Domain not verifying

**Check DNS:**
```bash
dig MX burner.privaseer.co.uk
dig TXT burner.privaseer.co.uk
dig TXT resend._domainkey.burner.privaseer.co.uk
```

Wait longer for propagation (up to 48 hours)

---

## Verification Checklist

- [ ] Resend account created
- [ ] Domain added and **VERIFIED** (green checkmark)
- [ ] API key generated and saved
- [ ] DNS records added in Hostinger
- [ ] DNS propagated and verified with `dig`
- [ ] Supabase environment variables set
- [ ] Supabase function redeployed
- [ ] Resend webhook created and **ENABLED**
- [ ] Resend **inbound rule** configured (CRITICAL!)
- [ ] Test email sent to burner address
- [ ] Email forwarded to real inbox
- [ ] Tracker removal report visible
- [ ] Database logs show `forwarded = true`

---

## Success Indicators

**DNS Working:**
```bash
$ dig MX burner.privaseer.co.uk
burner.privaseer.co.uk. 3600 IN MX 10 feedback-smtp.us-east-1.amazonses.com.
```

**Webhook Working:**
```
Supabase logs show:
=== INBOUND EMAIL FUNCTION START ===
Burner email found: {...}
=== FORWARD EMAIL SUCCESS ===
```

**Email Forwarded:**
- Received in inbox within 1-2 minutes
- From: noreply@burner.privaseer.co.uk
- Subject has [Forwarded] prefix
- Body includes tracker removal report

---

## Important URLs

| Service | URL |
|---------|-----|
| Resend Dashboard | https://resend.com/dashboard |
| Hostinger DNS | https://hpanel.hostinger.com |
| Supabase Dashboard | https://app.supabase.com |

---

## Next Steps After Setup

1. Test with multiple email types (plain text, HTML, newsletters)
2. Verify tracker removal is working
3. Check database counters are incrementing
4. Set up daily monitoring (see OPERATIONAL_RUNBOOK.md)
5. Document any custom configurations

---

## Need More Help?

- **Full Setup Guide:** EXTERNAL_EMAIL_SETUP.md
- **Diagnostic Tools:** DIAGNOSTIC_TOOLS.md
- **Operations Manual:** OPERATIONAL_RUNBOOK.md
- **Complete Overview:** SETUP_SUMMARY.md

---

**Estimated Total Time:** 50 minutes (excluding DNS wait)

**Last Updated:** December 2024
