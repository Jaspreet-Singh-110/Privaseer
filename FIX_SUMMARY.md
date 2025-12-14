# Burner Email Fix Summary

## Problem Identified ✓

**Database Schema Mismatch:**
- The database uses column name `email_address` (from migration)
- The edge function was using column name `email` (incorrect)
- This caused all lookups to fail when emails were sent to burner addresses

## Fix Applied ✓

**File: `supabase/functions/generate-burner-email/index.ts`**

Changes made:
1. Line 440-441: Fixed duplicate check to use `email_address`
2. Line 473: Fixed insert to use `email_address`
3. Lines 497-500: Added response mapping for frontend compatibility
4. Lines 542-545: Fixed GET endpoint response mapping

**Status:** Code fixed and ready to deploy ✅

## Deployment Required ⚠️

The fixed code needs to be deployed to Supabase. Choose one method:

### Method 1: Automated Script
```bash
./deploy-edge-functions.sh
```

### Method 2: Manual CLI
```bash
supabase functions deploy generate-burner-email --no-verify-jwt
```

### Method 3: Dashboard
Copy code from `supabase/functions/generate-burner-email/index.ts` to Supabase Dashboard

**📄 See DEPLOY_INSTRUCTIONS.md for detailed steps**

## Additional Setup Required

After deploying the function, you still need to configure:

### 1. DNS Records (Required for email receiving)
```
Type: MX
Name: burner
Value: inbound-mail.resend.com
Priority: 10
```

### 2. Resend Configuration
- Add domain `burner.privaseer.co.uk`
- Verify domain with DKIM and SPF records
- Configure inbound webhook to Supabase function
- Create API key with send permissions

### 3. Supabase Environment Variables
```
EMAIL_PROVIDER=resend
EMAIL_API_KEY=<your-resend-api-key>
```

**📄 See BURNER_EMAIL_SETUP.md for complete configuration guide**

## Files Created

| File | Purpose |
|------|---------|
| `FIX_SUMMARY.md` | This file - quick overview |
| `DEPLOY_INSTRUCTIONS.md` | Step-by-step deployment guide |
| `BURNER_EMAIL_SETUP.md` | Complete configuration and troubleshooting |
| `deploy-edge-functions.sh` | Automated deployment script |

## Quick Start

1. **Deploy the fix:**
   ```bash
   ./deploy-edge-functions.sh
   ```

2. **Configure DNS** (see BURNER_EMAIL_SETUP.md section: "Step 1: Configure Resend Domain")

3. **Configure Resend webhook** (see BURNER_EMAIL_SETUP.md section: "Step 2: Configure Resend Inbound Webhook")

4. **Set environment variables** (see BURNER_EMAIL_SETUP.md section: "Step 3: Configure Supabase Environment Variables")

5. **Test the flow:**
   - Generate a burner email in your extension
   - Send test email to it
   - Check your real inbox for forwarded email

## Testing Checklist

- [ ] Function deployed successfully
- [ ] Can generate new burner email in extension
- [ ] Database shows `email_address` column populated
- [ ] DNS MX record configured and propagated
- [ ] Resend domain verified
- [ ] Resend webhook configured
- [ ] Supabase environment variables set
- [ ] Test email sent to burner address
- [ ] Webhook called (check Resend logs)
- [ ] Function executed (check Supabase logs)
- [ ] Email received in real inbox

## Current Status

✅ **Fixed:** Database schema mismatch in generate-burner-email function
✅ **Built:** Project compiles successfully
⚠️ **Pending:** Deploy to Supabase (manual step required)
⏳ **Todo:** Configure DNS and Resend (see BURNER_EMAIL_SETUP.md)

## Getting Help

If you encounter issues:

1. Check **DEPLOY_INSTRUCTIONS.md** for deployment problems
2. Check **BURNER_EMAIL_SETUP.md** for configuration and email flow issues
3. Check Supabase Edge Function logs
4. Check Resend webhook logs

### Common Issues

**"Burner email not found"**
→ Function not deployed yet or database has old records

**"EMAIL_API_KEY not configured"**
→ Environment variable not set in Supabase

**"Resend API error"**
→ Domain not verified or API key lacks permissions

**No webhook calls**
→ DNS MX record not configured or webhook not set up

---

**Next Action:** Deploy the function using one of the methods in DEPLOY_INSTRUCTIONS.md
