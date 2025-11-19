# Burner Email Infrastructure Setup Guide

This guide provides step-by-step instructions for configuring the burner email system for Privaseer.

## Overview

The burner email system allows users to generate temporary email addresses that forward to their real email. All inbound emails are processed through Supabase Edge Functions and can be forwarded using either Resend or Mailgun.

## Architecture

```
Inbound Email → MX Records → Email Provider Webhook →
  Supabase Edge Function (inbound-email) →
    Database Lookup → Forward to Real Email
```

## Prerequisites

- Supabase project with database access
- Domain name (e.g., `burner.privaseer.io`)
- Email provider account (Resend or Mailgun)
- DNS management access

## Step 1: Database Setup

The database schema is defined in `supabase/migrations/20251119_create_burner_email_system.sql`.

### Tables Created

1. **burner_emails**
   - Stores burner email addresses with their mappings to real emails
   - Tracks usage statistics (emails received/forwarded)
   - Supports expiration dates
   - RLS enabled for security

2. **email_logs**
   - Logs all inbound emails
   - Tracks forwarding status and errors
   - References burner_emails table

### Apply Migration

```bash
# Using Supabase CLI
supabase db push

# Or execute the SQL file directly in Supabase dashboard
```

## Step 2: Domain Configuration

### Configure DNS Records for burner.privaseer.io

#### For Resend

1. Add MX record:
   ```
   Type: MX
   Name: burner.privaseer.io
   Value: feedback-smtp.us-east-1.amazonses.com
   Priority: 10
   ```

2. Add TXT record for SPF:
   ```
   Type: TXT
   Name: burner.privaseer.io
   Value: "v=spf1 include:amazonses.com ~all"
   ```

3. Add DKIM records (provided by Resend dashboard)

#### For Mailgun

1. Add MX records:
   ```
   Type: MX
   Name: burner.privaseer.io
   Value: mxa.mailgun.org
   Priority: 10

   Type: MX
   Name: burner.privaseer.io
   Value: mxb.mailgun.org
   Priority: 10
   ```

2. Add TXT record for SPF:
   ```
   Type: TXT
   Name: burner.privaseer.io
   Value: "v=spf1 include:mailgun.org ~all"
   ```

3. Add DKIM records (provided by Mailgun dashboard)

## Step 3: Email Provider Setup

### Option A: Resend (Recommended)

1. Sign up at [resend.com](https://resend.com)
2. Verify your domain `burner.privaseer.io`
3. Create an API key with send permissions
4. Configure webhook:
   - URL: `https://[your-project].supabase.co/functions/v1/inbound-email`
   - Events: `email.received`
   - Headers: Add your Supabase anon key as `apikey`

### Option B: Mailgun

1. Sign up at [mailgun.com](https://mailgun.com)
2. Add and verify domain `burner.privaseer.io`
3. Create an API key
4. Configure webhook:
   - URL: `https://[your-project].supabase.co/functions/v1/inbound-email`
   - Event: `incoming`

## Step 4: Deploy Edge Functions

### Deploy inbound-email function

```bash
# Using Supabase CLI
supabase functions deploy inbound-email

# Or use the mcp__supabase__deploy_edge_function tool
```

### Configure Environment Variables

In Supabase Dashboard → Edge Functions → Settings, add:

```bash
# Email provider (resend or mailgun)
EMAIL_PROVIDER=resend

# API key from your email provider
EMAIL_API_KEY=your_api_key_here

# For Mailgun, also add:
MAILGUN_DOMAIN=burner.privaseer.io
```

### Deploy generate-burner-email function

```bash
supabase functions deploy generate-burner-email
```

## Step 5: Test the System

### Test Email Generation

```bash
curl -X POST 'https://[your-project].supabase.co/functions/v1/generate-burner-email' \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{
    "installationId": "test-install-123",
    "realEmail": "your-real-email@example.com",
    "description": "Test burner",
    "expiresInDays": 7
  }'
```

Expected response:
```json
{
  "success": true,
  "email": {
    "id": "uuid",
    "email_address": "swiftpanda1234@burner.privaseer.io",
    "real_email": "your-real-email@example.com",
    "is_active": true,
    "expires_at": "2025-01-26T...",
    "emails_received": 0,
    "emails_forwarded": 0
  }
}
```

### Test Email Forwarding

1. Send a test email to the generated burner address
2. Check your real email inbox for the forwarded message
3. Verify in Supabase dashboard:
   - `burner_emails` table: `emails_received` and `emails_forwarded` incremented
   - `email_logs` table: New log entry created

### Test Email Lookup

```bash
curl -X POST 'https://[your-project].supabase.co/functions/v1/inbound-email' \
  -H "Content-Type: application/json" \
  -H "apikey: YOUR_ANON_KEY" \
  -d '{
    "recipient": "swiftpanda1234@burner.privaseer.io",
    "sender": "test@example.com",
    "from": "Test Sender <test@example.com>",
    "subject": "Test Email",
    "bodyPlain": "This is a test email"
  }'
```

## Step 6: Extension Integration

The extension automatically uses the burner email system through:

1. **Generate Burner Email**: Uses `generate-burner-email` edge function
2. **Record Stats**: Calls `Storage.recordBurnerEmailGenerated()`
3. **Webhook Processing**: Inbound emails trigger `inbound-email` function
4. **Forwarding Tracking**: Function calls `Storage.recordBurnerEmailForwarded()`

## Monitoring and Maintenance

### View Email Logs

```sql
-- Recent emails received
SELECT
  be.email_address,
  el.from_address,
  el.subject,
  el.forwarded,
  el.received_at
FROM email_logs el
JOIN burner_emails be ON be.id = el.burner_email_id
ORDER BY el.received_at DESC
LIMIT 50;
```

### Check Active Burner Emails

```sql
SELECT
  email_address,
  real_email,
  emails_received,
  emails_forwarded,
  created_at,
  expires_at
FROM burner_emails
WHERE is_active = true
ORDER BY created_at DESC;
```

### Cleanup Expired Emails

```sql
-- Run periodically (e.g., daily cron job)
SELECT cleanup_expired_burner_emails();
```

## Security Considerations

1. **RLS Policies**: All tables have Row Level Security enabled
2. **Anonymous Access**: Webhook endpoint has limited permissions (lookup + insert logs)
3. **API Keys**: Never expose email provider API keys in client code
4. **Rate Limiting**: Implement rate limiting on Edge Functions
5. **Email Validation**: Real emails should be validated before storage

## Troubleshooting

### Emails Not Being Received

1. Verify MX records are correctly configured:
   ```bash
   dig MX burner.privaseer.io
   ```

2. Check email provider webhook logs
3. Review Supabase Edge Function logs
4. Ensure burner email is active and not expired

### Emails Not Being Forwarded

1. Check `email_logs` table for error messages
2. Verify `EMAIL_API_KEY` environment variable is set
3. Test email provider API credentials
4. Check forwarding rate limits

### Database Lookup Failures

1. Verify RLS policies allow anonymous select
2. Check burner email is active: `is_active = true`
3. Verify not expired: `expires_at > now()`
4. Review Edge Function logs for detailed errors

## Production Checklist

- [ ] DNS records configured and propagated
- [ ] Email provider domain verified
- [ ] Edge functions deployed with correct environment variables
- [ ] Database migration applied successfully
- [ ] Test email generation working
- [ ] Test email forwarding working
- [ ] Monitoring and alerting configured
- [ ] Rate limiting implemented
- [ ] Backup and recovery plan documented
- [ ] User documentation updated

## API Reference

### Generate Burner Email

**Endpoint**: `POST /functions/v1/generate-burner-email`

**Request**:
```json
{
  "installationId": "string (required)",
  "realEmail": "string (required)",
  "description": "string (optional)",
  "expiresInDays": "number (optional)"
}
```

**Response**:
```json
{
  "success": true,
  "email": {
    "id": "uuid",
    "email_address": "string",
    "real_email": "string",
    "description": "string",
    "is_active": boolean,
    "expires_at": "ISO8601 | null",
    "emails_received": number,
    "emails_forwarded": number,
    "created_at": "ISO8601"
  }
}
```

### Inbound Email Webhook

**Endpoint**: `POST /functions/v1/inbound-email`

**Request** (from email provider):
```json
{
  "recipient": "burner@burner.privaseer.io",
  "sender": "sender@example.com",
  "from": "Sender Name <sender@example.com>",
  "subject": "Email Subject",
  "bodyPlain": "Plain text content",
  "bodyHtml": "<html>HTML content</html>"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Email forwarded successfully"
}
```

## Support

For issues or questions:
- Check Edge Function logs in Supabase dashboard
- Review email provider webhook logs
- Consult database logs in `email_logs` table
- File an issue in the project repository
