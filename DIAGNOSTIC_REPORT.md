# Diagnostic Report - Email Forwarding Troubleshooting

**Date:** $(date)
**Domain:** burner.privaseer.co.uk

## Executive Summary

The diagnostic tools have identified several issues that need to be addressed for the email forwarding system to work properly:

1. ❌ **Critical**: Incorrect Supabase URL in documentation
2. ❌ **Critical**: Missing SPF record
3. ⚠️ **Warning**: Missing DMARC record
4. ✅ **Pass**: MX records correctly configured
5. ✅ **Pass**: DKIM record present
6. ✅ **Pass**: Supabase function endpoint is accessible (with correct URL)

---

## Detailed Findings

### 1. Supabase URL Mismatch ❌ CRITICAL

**Issue:** The diagnostic tools and setup documentation reference an incorrect Supabase project URL.

**Current (Incorrect) URL in docs:**
```
https://0ec90b57d6e95fcbda19832f.supabase.co/functions/v1/inbound-email
```
- This URL does not resolve (DNS lookup fails)

**Correct URL (from codebase):**
```
https://llffqxdhpgsqnpzeznaq.supabase.co/functions/v1/inbound-email
```
- This URL is accessible and the function responds correctly

**Impact:** 
- Webhook configuration in Resend may be pointing to the wrong endpoint
- Diagnostic scripts are testing the wrong endpoint
- Documentation may mislead users

**Action Required:**
1. Update all documentation files with the correct Supabase URL
2. Verify webhook configuration in Resend dashboard uses the correct URL
3. Update diagnostic scripts to use the correct URL

---

### 2. Missing SPF Record ❌ CRITICAL

**Issue:** No SPF (Sender Policy Framework) record found for `burner.privaseer.co.uk`

**Current Status:**
```bash
$ dig TXT burner.privaseer.co.uk +short
(empty - no SPF record)
```

**Expected:**
```
burner.privaseer.co.uk. 3600 IN TXT "v=spf1 include:amazonses.com ~all"
```

**Impact:**
- Email deliverability issues
- Emails may be marked as spam
- Email authentication failures
- Lower email reputation

**Action Required:**
1. Add SPF record in Hostinger DNS:
   ```
   Type: TXT
   Name: @ (or burner.privaseer.co.uk)
   Value: v=spf1 include:amazonses.com ~all
   TTL: 3600
   ```
2. Wait for DNS propagation (15 minutes to 48 hours)
3. Verify with: `dig TXT burner.privaseer.co.uk +short | grep spf`

---

### 3. Missing DMARC Record ⚠️ WARNING

**Issue:** No DMARC (Domain-based Message Authentication, Reporting & Conformance) record found

**Current Status:**
```bash
$ dig TXT _dmarc.burner.privaseer.co.uk +short
(empty - no DMARC record)
```

**Expected:**
```
_dmarc.burner.privaseer.co.uk. 3600 IN TXT "v=DMARC1; p=none; rua=mailto:dmarc@privaseer.co.uk"
```

**Impact:**
- No DMARC policy enforcement
- No reporting on email authentication failures
- Lower email security

**Action Required:**
1. Add DMARC record in Hostinger DNS:
   ```
   Type: TXT
   Name: _dmarc
   Value: v=DMARC1; p=none; rua=mailto:dmarc@privaseer.co.uk
   TTL: 3600
   ```
2. Note: Start with `p=none` (monitoring mode), then move to `p=quarantine` or `p=reject` after verifying everything works

---

### 4. MX Records ✅ PASS

**Status:** Correctly configured

**Current Configuration:**
```
10 inbound-smtp.eu-west-1.amazonaws.com.
```

**Analysis:** 
- Points to AWS SES (which Resend uses)
- Priority 10 is appropriate
- Record is properly formatted

**Action Required:** None

---

### 5. DKIM Record ✅ PASS

**Status:** Correctly configured

**Current Configuration:**
```
resend._domainkey.burner.privaseer.co.uk. 3600 IN TXT "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCj6VDU7Ba..."
```

**Analysis:**
- DKIM public key is present
- Selector `resend` matches Resend configuration
- Key format appears valid

**Action Required:** None

---

### 6. Webhook Endpoint ✅ PASS (with correct URL)

**Status:** Function is accessible and responding

**Test Results:**
- OPTIONS request: ✅ Works (CORS preflight)
- POST request: ✅ Responds (401 without auth, expected behavior)

**Function URL:**
```
https://llffqxdhpgsqnpzeznaq.supabase.co/functions/v1/inbound-email
```

**Action Required:**
- Verify Resend webhook configuration uses this correct URL
- Ensure Resend inbound rules forward to this endpoint

---

## Immediate Action Items

### Priority 1 (Critical - Fix Immediately)

1. **Update Documentation URLs**
   - [ ] Update `DIAGNOSTIC_TOOLS.md` with correct Supabase URL
   - [ ] Update `EXTERNAL_EMAIL_SETUP.md` with correct Supabase URL
   - [ ] Update any other docs referencing the old URL

2. **Add SPF Record**
   - [ ] Log into Hostinger DNS management
   - [ ] Add TXT record: `v=spf1 include:amazonses.com ~all`
   - [ ] Wait for propagation and verify

3. **Verify Resend Configuration**
   - [ ] Check Resend webhook URL matches: `https://llffqxdhpgsqnpzeznaq.supabase.co/functions/v1/inbound-email`
   - [ ] Verify inbound rules are configured correctly

### Priority 2 (Important - Fix Soon)

4. **Add DMARC Record**
   - [ ] Add DMARC TXT record in Hostinger
   - [ ] Start with monitoring mode (`p=none`)
   - [ ] Monitor reports before tightening policy

### Priority 3 (Verification)

5. **Test End-to-End Flow**
   - [ ] Send test email to a burner address
   - [ ] Check Supabase function logs
   - [ ] Verify email appears in email_logs table
   - [ ] Confirm email is forwarded to real email address

---

## Testing Commands

### Verify DNS Records
```bash
# Run the DNS check script
./dns-check.sh

# Or check individually:
dig MX burner.privaseer.co.uk +short
dig TXT burner.privaseer.co.uk +short | grep spf
dig TXT resend._domainkey.burner.privaseer.co.uk +short
dig TXT _dmarc.burner.privaseer.co.uk +short
```

### Test Webhook Endpoint
```bash
# Test with correct URL
curl -X OPTIONS "https://llffqxdhpgsqnpzeznaq.supabase.co/functions/v1/inbound-email"

# Test POST (should return 401 without auth, which is expected)
curl -X POST "https://llffqxdhpgsqnpzeznaq.supabase.co/functions/v1/inbound-email" \
  -H "Content-Type: application/json" \
  -d '{"test": "invalid"}'
```

### Run Full Health Check
```bash
# After updating the URL in health-check.sh
./health-check.sh
```

---

## Files That Need Updating

Based on grep results, these files reference the incorrect URL and need updating:

1. `DIAGNOSTIC_TOOLS.md` - Multiple references
2. `EXTERNAL_EMAIL_SETUP.md` - Webhook URL references
3. `SETUP_SUMMARY.md` - Webhook URL reference
4. `QUICK_START.md` - Webhook URL reference
5. `OPERATIONAL_RUNBOOK.md` - Webhook URL reference

---

## Next Steps

1. **Immediate**: Fix the Supabase URL in all documentation
2. **Immediate**: Add SPF record to DNS
3. **Within 24 hours**: Add DMARC record
4. **After DNS propagation**: Re-run health check and verify all tests pass
5. **After fixes**: Send test email and verify end-to-end flow works

---

**Report Generated:** $(date)
**Diagnostic Tools Used:** health-check.sh, dns-check.sh, curl
