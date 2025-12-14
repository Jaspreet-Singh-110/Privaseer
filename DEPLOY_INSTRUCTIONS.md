# Edge Function Deployment Instructions

The `generate-burner-email` function has been fixed to resolve the database schema mismatch. You need to deploy it to Supabase for the fix to take effect.

## Option 1: Using Deployment Script (Recommended)

We've created a deployment script for you:

```bash
# From the project root directory
./deploy-edge-functions.sh
```

**Prerequisites:**
- Supabase CLI installed (`npm install -g supabase`)
- Logged into Supabase CLI (`supabase login`)

---

## Option 2: Using Supabase CLI Manually

```bash
# Navigate to project directory
cd /tmp/cc-agent/58040027/project

# Link to your Supabase project (one time only)
supabase link --project-ref 0ec90b57d6e95fcbda19832f

# Deploy the fixed function
supabase functions deploy generate-burner-email --no-verify-jwt

# Verify deployment
supabase functions list
```

---

## Option 3: Using Supabase Dashboard (No CLI Required)

If you prefer to deploy through the web interface:

### Step 1: Access Edge Functions

1. Go to https://supabase.com/dashboard
2. Select your project
3. Navigate to **Edge Functions** in the left sidebar
4. Click on `generate-burner-email` function

### Step 2: Update the Function Code

1. Delete the existing code in the editor
2. Copy the entire contents of `supabase/functions/generate-burner-email/index.ts`
3. Paste into the Supabase editor

### Step 3: Deploy

1. Click the **Deploy** button
2. Wait for deployment to complete
3. Verify the function appears as "Active"

---

## What Was Fixed?

The function was using `email` as the column name when it should use `email_address` to match the database schema:

**Before (Broken):**
```typescript
.insert({
  email: emailAddress,  // ❌ Wrong column name
  ...
})
```

**After (Fixed):**
```typescript
.insert({
  email_address: emailAddress,  // ✅ Correct column name
  ...
})
```

This fix also includes:
- Updated duplicate check query to use `email_address`
- Added response mapping to maintain frontend compatibility
- Both `GET` and `POST` endpoints now return the correct format

---

## Verifying the Deployment

### Using Supabase Dashboard

1. Go to **Edge Functions** > `generate-burner-email`
2. Check that the "Last deployed" timestamp is recent
3. Click **Logs** to see if there are any errors

### Using Your Extension

1. Open the extension popup
2. Go to Settings
3. Ensure "Burner Email" is enabled
4. Ensure your real email is configured
5. Try generating a new burner email
6. It should succeed without errors

### Check the Database

After generating a burner email, verify it's stored correctly:

1. Go to Supabase Dashboard > **Table Editor**
2. Select `burner_emails` table
3. Find your newly created email
4. Verify the `email_address` column is populated (not `email`)

Example query:
```sql
SELECT id, email_address, real_email, is_active, created_at
FROM burner_emails
ORDER BY created_at DESC
LIMIT 5;
```

---

## Next Steps After Deployment

Once the function is deployed, you still need to:

1. **Configure DNS Records** (See BURNER_EMAIL_SETUP.md)
   - Add MX record pointing to Resend
   - Add DKIM record for sending
   - Add SPF record

2. **Configure Resend**
   - Add domain `burner.privaseer.co.uk`
   - Verify domain
   - Configure inbound webhook
   - Create API key

3. **Set Environment Variables in Supabase**
   - Go to **Edge Functions** > **Settings**
   - Add secrets:
     - `EMAIL_PROVIDER=resend`
     - `EMAIL_API_KEY=<your-resend-key>`

---

## Troubleshooting Deployment

### Error: "Supabase CLI not found"

Install the CLI:
```bash
npm install -g supabase
```

Or using Homebrew (macOS):
```bash
brew install supabase/tap/supabase
```

### Error: "Not logged in"

Login to Supabase:
```bash
supabase login
```

This will open a browser window for authentication.

### Error: "Project not linked"

Link your project:
```bash
supabase link --project-ref 0ec90b57d6e95fcbda19832f
```

### Error: "Permission denied"

Make the deployment script executable:
```bash
chmod +x deploy-edge-functions.sh
```

### Deployment succeeds but errors still occur

1. **Check environment variables** are set in Supabase Dashboard
2. **Clear old burner emails** that were created before the fix:
   ```sql
   DELETE FROM burner_emails WHERE email_address IS NULL;
   ```
3. **Generate a fresh burner email** after deployment

---

## Testing the Complete Flow

After deployment and configuration:

1. **Generate a burner email**
   ```
   Example: happy-dolphin-1234@burner.privaseer.co.uk
   ```

2. **Send a test email to it**
   - From Gmail, Outlook, or any email service
   - Subject: "Test"
   - Body: "Testing burner email forwarding"

3. **Check logs in Supabase**
   - Go to **Edge Functions** > `inbound-email` > **Logs**
   - Look for "Inbound email received"
   - Look for "Email forwarded successfully"

4. **Check your real inbox**
   - You should receive the forwarded email
   - Subject will be: `[Forwarded] Test`
   - From will be: `Privaseer Burner <noreply@burner.privaseer.co.uk>`

---

## Quick Reference

**Your Supabase Project:**
- Project Ref: `0ec90b57d6e95fcbda19832f`
- URL: `https://0ec90b57d6e95fcbda19832f.supabase.co`

**Functions to Deploy:**
- `generate-burner-email` (FIXED - must deploy)
- `inbound-email` (already correct, no changes needed)

**Environment Variables Needed:**
- `EMAIL_PROVIDER` = `resend`
- `EMAIL_API_KEY` = Your Resend API key

**Domain to Configure:**
- `burner.privaseer.co.uk`

For complete setup instructions including DNS and Resend configuration, see **BURNER_EMAIL_SETUP.md**.
