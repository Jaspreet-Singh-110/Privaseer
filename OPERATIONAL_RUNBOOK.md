# Operational Runbook for Burner Email Forwarding

Procedures for operating, maintaining, and troubleshooting the Privaseer burner email forwarding system.

## Table of Contents

1. [System Overview](#system-overview)
2. [Daily Operations](#daily-operations)
3. [Troubleshooting Workflows](#troubleshooting-workflows)
4. [Emergency Procedures](#emergency-procedures)
5. [Maintenance Tasks](#maintenance-tasks)
6. [Monitoring and Alerts](#monitoring-and-alerts)
7. [Security Incident Response](#security-incident-response)

---

## System Overview

### Architecture
 
```
┌─────────────┐
│   External  │
│   Sender    │
└──────┬──────┘
       │
       │ Email to burner@burner.privaseer.co.uk
       ▼
┌─────────────────────┐
│  Hostinger DNS      │
│  MX → Resend        │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│  Resend Inbound     │
│  Receives email     │
└──────┬──────────────┘
       │
       │ Webhook POST
       ▼
┌─────────────────────────────────────────┐
│  Supabase Edge Function: inbound-email │
│  1. Validate payload                    │
│  2. Lookup burner email in DB           │
│  3. Check rate limits                   │
│  4. Sanitize content (remove trackers)  │
│  5. Forward via Resend API              │
│  6. Log to database                     │
└──────┬──────────────────────────────────┘
       │
       │ Forward via Resend API
       ▼
┌─────────────────────┐
│  User's Real Email  │
└─────────────────────┘
```

### Key Components

1. **DNS (Hostinger)**: Routes emails to Resend
2. **Resend**: Email service provider (inbound + outbound)
3. **Supabase Edge Function**: Processing and forwarding logic
4. **PostgreSQL**: Stores burner emails, logs, and metadata
5. **Browser Extension**: UI for generating and managing burner emails

### Critical Dependencies

- **Resend Service**: Must be operational for receiving and sending
- **Supabase Platform**: Function hosting and database
- **DNS Resolution**: Proper MX records for email routing
- **API Key**: Valid Resend API key in environment variables

---

## Daily Operations

### Morning Health Check (5 minutes)

Run daily to ensure system is operational:

1. **Check Recent Email Logs**
   ```sql
   -- View last 24 hours of activity
   SELECT
     COUNT(*) as total_emails,
     SUM(CASE WHEN forwarded THEN 1 ELSE 0 END) as forwarded,
     SUM(CASE WHEN NOT forwarded THEN 1 ELSE 0 END) as failed
   FROM email_logs
   WHERE received_at > NOW() - INTERVAL '24 hours';
   ```

   **Expected**: Forwarded count should be close to total_emails.
   **Alert if**: Failed count > 10% of total emails.

2. **Check Function Logs**
   - Open Supabase Dashboard → Edge Functions → inbound-email → Logs
   - Look for error patterns in last 24 hours
   - **Alert if**: Multiple 500 errors or API failures

3. **Verify Active Burner Emails**
   ```sql
   -- Count active burner emails
   SELECT
     COUNT(*) as active_burners,
     COUNT(CASE WHEN expires_at < NOW() THEN 1 END) as expired_but_active
   FROM burner_emails
   WHERE is_active = true;
   ```

   **Alert if**: `expired_but_active` > 0 (indicates cleanup issue)

4. **Check Rate Limit Violations**
   ```sql
   -- Check for rate limited emails in last 24 hours
   SELECT COUNT(*)
   FROM email_logs
   WHERE error_message LIKE '%rate limit%'
     AND received_at > NOW() - INTERVAL '24 hours';
   ```

   **Alert if**: Count > 100 (may indicate abuse or attack)

### Weekly Review (15 minutes)

1. **Review Forwarding Success Rate**
   ```sql
   -- Weekly success rate per burner email
   SELECT
     be.email_address,
     COUNT(*) as total,
     SUM(CASE WHEN el.forwarded THEN 1 ELSE 0 END) as succeeded,
     ROUND(100.0 * SUM(CASE WHEN el.forwarded THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
   FROM burner_emails be
   JOIN email_logs el ON el.burner_email_id = be.id
   WHERE el.received_at > NOW() - INTERVAL '7 days'
   GROUP BY be.email_address
   HAVING COUNT(*) > 10
   ORDER BY success_rate ASC
   LIMIT 10;
   ```

   **Action**: Investigate burner emails with < 95% success rate

2. **Review Tracker Removal Stats**
   ```sql
   -- Tracker blocking effectiveness
   SELECT
     DATE(received_at) as date,
     COUNT(*) as emails,
     SUM(trackers_removed) as total_trackers,
     ROUND(AVG(trackers_removed), 2) as avg_per_email
   FROM email_logs
   WHERE received_at > NOW() - INTERVAL '7 days'
   GROUP BY DATE(received_at)
   ORDER BY date DESC;
   ```

   **Action**: Note trends in tracker prevalence

3. **Clean Up Expired Burner Emails**
   ```sql
   -- Deactivate expired burner emails
   UPDATE burner_emails
   SET is_active = false
   WHERE expires_at IS NOT NULL
     AND expires_at < NOW()
     AND is_active = true;
   ```

### Monthly Maintenance (30 minutes)

1. **Database Cleanup**
   ```sql
   -- Archive old email logs (optional - adjust retention policy)
   -- Delete logs older than 90 days
   DELETE FROM email_logs
   WHERE received_at < NOW() - INTERVAL '90 days';
   ```

2. **Review Resend Usage**
   - Log in to Resend Dashboard
   - Check email sending volume vs. plan limits
   - Review any delivery issues or bounces

3. **Verify DNS Records**
   ```bash
   # Run DNS health check
   ./health-check.sh
   ```

4. **Update Documentation**
   - Review and update runbooks if procedures have changed
   - Document any recurring issues discovered

---

## Troubleshooting Workflows

### Workflow 1: Email Not Forwarded

**Symptom**: User reports not receiving forwarded email

**Investigation Steps:**

1. **Verify email was received by webhook**
   ```sql
   SELECT *
   FROM email_logs
   WHERE from_address = 'sender@example.com'
     AND received_at > NOW() - INTERVAL '1 day'
   ORDER BY received_at DESC;
   ```

   - **If no record**: Webhook not triggered (see Workflow 2)
   - **If record exists**: Continue investigation

2. **Check forwarding status**
   - Look at `forwarded` column
   - If `false`, check `error_message`

3. **Common Error Messages and Solutions**

   | Error Message | Cause | Solution |
   |---------------|-------|----------|
   | `Resend error: 401` | Invalid API key | Regenerate and update API key |
   | `Resend error: 403` | Domain not verified | Verify domain in Resend dashboard |
   | `Resend error: 422` | Invalid payload | Check logs for malformed data |
   | `Rate limit exceeded` | Too many emails | Wait for cooldown or adjust limits |
   | `Burner email not found` | Email doesn't exist in DB | User may have deleted it |

4. **Check Resend Dashboard**
   - Go to Resend → Emails
   - Search for emails sent to user's real address
   - Check delivery status (sent, delivered, bounced, etc.)

5. **Check User's Spam Folder**
   - Forwarded emails may be filtered
   - Advise user to whitelist `noreply@burner.privaseer.co.uk`

### Workflow 2: Webhook Not Triggering

**Symptom**: No logs in Supabase function, no database entries

**Investigation Steps:**

1. **Test webhook manually**
   ```bash
   # Use test script from DIAGNOSTIC_TOOLS.md
   ./test-webhook.sh
   ```

   - **If works**: Issue is with Resend webhook configuration
   - **If fails**: Issue with Supabase function

2. **Check Resend Webhook Configuration**
   - Go to Resend → Webhooks
   - Verify webhook is **enabled**
   - Verify URL matches: `https://[PROJECT_ID].supabase.co/functions/v1/inbound-email`
   - Check webhook logs for delivery attempts

3. **Check Resend Inbound Rules**
   - Go to Resend → Domains → burner.privaseer.co.uk → Inbound
   - Verify rule exists to forward to webhook
   - **Critical**: Without inbound rule, emails won't trigger webhook!

4. **Check DNS Records**
   ```bash
   dig MX burner.privaseer.co.uk
   ```

   - Verify MX points to Resend servers
   - If not, DNS not configured correctly

5. **Check Supabase Function Status**
   - Go to Supabase → Edge Functions
   - Verify `inbound-email` is deployed
   - Check for deployment errors

### Workflow 3: High Error Rate

**Symptom**: Multiple forwarding failures in short time

**Investigation Steps:**

1. **Check error pattern**
   ```sql
   SELECT
     error_message,
     COUNT(*) as occurrence_count
   FROM email_logs
   WHERE forwarded = false
     AND received_at > NOW() - INTERVAL '1 hour'
   GROUP BY error_message
   ORDER BY occurrence_count DESC;
   ```

2. **Common Patterns:**

   **All errors are "Invalid API key" (401)**
   - **Action**: API key expired or invalid
   - **Solution**: Regenerate API key in Resend, update in Supabase

   **All errors are "Rate limit exceeded"**
   - **Action**: Legitimate rate limit or abuse
   - **Solution**: Check if single burner email is targeted; may be spam attack

   **Mix of different errors**
   - **Action**: May be Resend service issue
   - **Solution**: Check Resend status page: https://resend.com/status

3. **Check Resend Service Status**
   - Visit https://resend.com/status
   - Look for ongoing incidents

4. **Check Supabase Status**
   - Visit https://status.supabase.com
   - Look for Edge Function issues

### Workflow 4: Rate Limit Investigation

**Symptom**: Rate limit triggered for burner email

**Investigation Steps:**

1. **Check email frequency**
   ```sql
   SELECT
     from_address,
     COUNT(*) as email_count,
     MIN(received_at) as first,
     MAX(received_at) as last
   FROM email_logs
   WHERE burner_email_id = 'BURNER_ID'
     AND received_at > NOW() - INTERVAL '1 hour'
   GROUP BY from_address
   ORDER BY email_count DESC;
   ```

2. **Determine if legitimate or abuse:**
   - **Legitimate**: User signed up for high-volume service (e.g., social media notifications)
   - **Abuse**: Spam attack or burner email compromised

3. **Actions for Legitimate Traffic:**
   - Consider increasing rate limits (edit `rate-limiter.ts`)
   - Advise user to use separate burner emails for high-volume services

4. **Actions for Abuse:**
   - Leave burner email paused (automatic)
   - User can manually re-enable or delete and create new one
   - Monitor for continued abuse

---

## Emergency Procedures

### Emergency 1: Mass Spam Attack

**Indicators:**
- Sudden spike in email volume (100+ emails/minute)
- Multiple burner emails affected
- High rate limit trigger rate

**Immediate Actions:**

1. **Disable burner email generation temporarily** (optional)
   - Update feature flag in extension if available
   - Or communicate to users via announcements

2. **Identify affected burner emails**
   ```sql
   SELECT
     be.email_address,
     COUNT(*) as email_count
   FROM email_logs el
   JOIN burner_emails be ON be.id = el.burner_email_id
   WHERE el.received_at > NOW() - INTERVAL '10 minutes'
   GROUP BY be.email_address
   HAVING COUNT(*) > 50
   ORDER BY email_count DESC;
   ```

3. **Auto-pause is already active** (via spam spike detection)
   - Verify affected burners are paused:
   ```sql
   UPDATE burner_emails
   SET is_active = false
   WHERE id IN (
     SELECT burner_email_id
     FROM email_logs
     WHERE received_at > NOW() - INTERVAL '10 minutes'
     GROUP BY burner_email_id
     HAVING COUNT(*) > 50
   );
   ```

4. **Monitor function logs** for errors or overload

5. **Communicate with affected users**
   - Notify them their burner email received spam attack
   - Advise to delete compromised burner and create new one

### Emergency 2: Resend API Key Compromised

**Indicators:**
- Unexpected emails sent from your domain
- Resend dashboard shows unauthorized activity
- API key exposed in logs or code

**Immediate Actions:**

1. **Revoke compromised API key**
   - Go to Resend → API Keys
   - Delete the compromised key immediately

2. **Generate new API key**
   - Create replacement key with same permissions
   - Copy new key

3. **Update Supabase environment variables**
   - Go to Supabase → Settings → Edge Functions
   - Update `EMAIL_API_KEY` with new key

4. **Redeploy edge function**
   - Force redeploy to load new environment variables

5. **Test email forwarding**
   - Send test email to verify system operational

6. **Audit logs**
   - Check Resend email logs for unauthorized sends
   - Document incident for review

### Emergency 3: Database Breach

**Indicators:**
- Unauthorized access to Supabase database
- Suspicious queries in audit logs
- Data exfiltration detected

**Immediate Actions:**

1. **Rotate database credentials**
   - Change Supabase project passwords
   - Regenerate anon and service role keys

2. **Review RLS policies**
   - Verify Row Level Security is enabled on all tables
   - Check for policy bypasses

3. **Audit affected data**
   ```sql
   SELECT * FROM burner_emails ORDER BY created_at DESC LIMIT 100;
   SELECT * FROM email_logs ORDER BY received_at DESC LIMIT 100;
   ```

4. **Notify affected users**
   - If burner emails or real emails were exposed
   - Advise to delete and regenerate burner emails

5. **Enable additional logging**
   - Review `supabase/security_enhancements.sql`
   - Ensure audit triggers are active

### Emergency 4: Service Completely Down

**Indicators:**
- No emails being forwarded
- Function returning 500 errors
- Database unreachable

**Immediate Actions:**

1. **Check Supabase status**
   - Visit https://status.supabase.com
   - If incident, wait for resolution

2. **Check Resend status**
   - Visit https://resend.com/status
   - If incident, wait for resolution

3. **Verify DNS**
   ```bash
   dig MX burner.privaseer.co.uk
   ```
   - If DNS issue, contact Hostinger support

4. **Test function manually**
   ```bash
   curl https://llffqxdhpgsqnpzeznaq.supabase.co/functions/v1/inbound-email
   ```
   - If timeout, may be function issue
   - Check Supabase logs for errors

5. **Communicate downtime**
   - Update status page if available
   - Notify users via extension or website

---

## Maintenance Tasks

### Rotate API Keys (Quarterly)

**Purpose**: Security best practice to regularly rotate credentials

**Procedure:**

1. **Generate new Resend API key**
   - Name it with rotation date: `Privaseer Burner - 2024 Q1`
   - Copy new key

2. **Update Supabase environment**
   - Add new `EMAIL_API_KEY` value
   - Do not delete old key yet

3. **Test with new key**
   - Send test email
   - Verify forwarding works

4. **Delete old API key**
   - Remove previous key from Resend

5. **Document rotation**
   - Note date and new key name in internal docs

### Database Optimization (Monthly)

**Purpose**: Keep database performant and clean

**Procedure:**

1. **Analyze table sizes**
   ```sql
   SELECT
     schemaname,
     tablename,
     pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
   FROM pg_tables
   WHERE schemaname = 'public'
   ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
   ```

2. **Archive old logs** (if email_logs is large)
   ```sql
   -- Consider archiving logs older than 90 days
   -- Option A: Delete
   DELETE FROM email_logs WHERE received_at < NOW() - INTERVAL '90 days';

   -- Option B: Move to archive table (recommended)
   CREATE TABLE IF NOT EXISTS email_logs_archive (LIKE email_logs INCLUDING ALL);

   INSERT INTO email_logs_archive
   SELECT * FROM email_logs WHERE received_at < NOW() - INTERVAL '90 days';

   DELETE FROM email_logs WHERE received_at < NOW() - INTERVAL '90 days';
   ```

3. **Clean up inactive burners** (optional)
   ```sql
   -- Delete burner emails inactive for 1 year with no emails
   DELETE FROM burner_emails
   WHERE is_active = false
     AND created_at < NOW() - INTERVAL '1 year'
     AND NOT EXISTS (
       SELECT 1 FROM email_logs WHERE burner_email_id = burner_emails.id
     );
   ```

4. **Vacuum and analyze**
   ```sql
   VACUUM ANALYZE burner_emails;
   VACUUM ANALYZE email_logs;
   ```

### DNS Records Verification (Quarterly)

**Purpose**: Ensure DNS hasn't drifted or been misconfigured

**Procedure:**

1. **Run health check script**
   ```bash
   ./health-check.sh
   ```

2. **Verify each record type:**
   - MX record points to Resend
   - SPF includes amazonses.com
   - DKIM record is present
   - DMARC policy is configured

3. **Check from multiple locations**
   - Use online DNS checkers to verify global propagation
   - https://dnschecker.org/

4. **Document any changes**
   - Note if records had to be fixed
   - Update runbook if Resend changed server addresses

---

## Monitoring and Alerts

### Key Metrics to Monitor

1. **Email Volume**
   - Total emails received per hour/day
   - Sudden spikes may indicate abuse

2. **Forwarding Success Rate**
   - Should be > 95%
   - Drop indicates API or configuration issue

3. **Rate Limit Triggers**
   - Track how often rate limits are hit
   - High rate may need limit adjustment

4. **Function Error Rate**
   - 5xx errors should be < 1%
   - Spike indicates function or API issue

5. **Tracker Removal Stats**
   - Track average trackers removed per email
   - Indicates effectiveness of sanitization

### Recommended Alerts

Set up alerts for these conditions:

1. **Critical: Function Error Rate > 10% (last 5 minutes)**
   - May indicate API key issue or service outage
   - Requires immediate investigation

2. **Critical: No Emails Received (last 1 hour during business hours)**
   - May indicate DNS or webhook issue
   - Check if legitimate or just low traffic

3. **Warning: Forwarding Success Rate < 95% (last hour)**
   - Check for API errors or rate limiting
   - May need configuration adjustment

4. **Warning: Rate Limit Triggers > 100 (last hour)**
   - May indicate spam attack
   - Review affected burner emails

5. **Info: Database Size > 80% of quota**
   - Time to archive old logs
   - Consider upgrading plan

### Setting Up Alerts in Supabase

1. **Using Supabase Logs API** (if available)
   - Set up external monitoring tool (e.g., Datadog, New Relic)
   - Query logs API for error patterns
   - Trigger alerts based on thresholds

2. **Using SQL Scheduled Jobs** (if supported)
   - Create monitoring function that checks metrics
   - Schedule to run every 5-15 minutes
   - Send notifications via webhook if thresholds exceeded

3. **Manual Monitoring**
   - Bookmark Supabase function logs page
   - Check daily as part of morning routine
   - Review email_logs table for errors

---

## Security Incident Response

### Data Exposure Incident

**If burner emails or real emails are exposed:**

1. **Assess scope**
   - How many emails affected?
   - What data was exposed?
   - How was it exposed?

2. **Contain breach**
   - Revoke compromised credentials
   - Close security hole

3. **Notify affected users**
   - Be transparent about what happened
   - Advise to delete and regenerate burner emails
   - Provide timeline and remediation steps

4. **Document incident**
   - Root cause analysis
   - Timeline of events
   - Lessons learned
   - Preventive measures implemented

### API Key Leak

**If EMAIL_API_KEY is exposed in code, logs, or public:**

1. **Immediate revocation** (see Emergency Procedure 2)
2. **Check Resend logs** for unauthorized usage
3. **Audit code** to find how leak occurred
4. **Implement safeguards**:
   - Never log API keys
   - Use environment variables only
   - Add linting rules to detect secrets in code

### Spam/Abuse Response

**If system is being used for spam or abuse:**

1. **Identify abuse pattern**
   - Which burner emails are involved?
   - Who are the recipients?
   - What content is being sent?

2. **Disable affected burner emails**
   ```sql
   UPDATE burner_emails SET is_active = false WHERE id IN (...);
   ```

3. **Block sender if possible**
   - If abuse comes from specific sender domain
   - Add to blocklist (would require code change)

4. **Report to Resend** if needed
   - If abuse violates Resend terms
   - Coordinate with Resend support

---

## Escalation Paths

### Level 1: First Response (Developer/On-Call)
- Run diagnostic scripts
- Check logs and database
- Apply common fixes from runbook
- Escalate if not resolved in 30 minutes

### Level 2: System Owner (Tech Lead)
- Review more complex issues
- Make configuration changes
- Coordinate with external vendors (Resend, Supabase)
- Escalate if vendor issue or major incident

### Level 3: Management
- Handle security incidents
- Make decisions on service interruptions
- Communicate with users
- Coordinate with legal if data exposure

---

## Contact Information

### External Services

**Resend**
- Dashboard: https://resend.com/dashboard
- Status: https://resend.com/status
- Support: support@resend.com
- Docs: https://resend.com/docs

**Supabase**
- Dashboard: https://app.supabase.com
- Status: https://status.supabase.com
- Support: support@supabase.com
- Docs: https://supabase.com/docs

**Hostinger**
- Control Panel: https://hpanel.hostinger.com
- Support: https://www.hostinger.com/contact

---

## Revision History

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2024-12-14 | 1.0.0 | Initial runbook | Privaseer Team |

---

**Last Updated:** December 2024
**Next Review:** March 2025
