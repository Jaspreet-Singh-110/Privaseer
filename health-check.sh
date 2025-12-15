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
WEBHOOK_URL="https://llffqxdhpgsqnpzeznaq.supabase.co/functions/v1/inbound-email"

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
MX_RESULT=$(dig MX $DOMAIN +short 2>/dev/null || echo "")
if [[ $MX_RESULT == *"amazonses.com"* ]] || [[ $MX_RESULT == *"amazonaws.com"* ]]; then
    check_pass "MX records point to Resend (AWS SES)"
    echo "   $MX_RESULT"
elif [[ -z "$MX_RESULT" ]]; then
    check_fail "No MX records found"
else
    check_warn "MX records exist but may not point to Resend"
    echo "   $MX_RESULT"
fi

# Check SPF record
echo -n "Checking SPF record... "
SPF_RESULT=$(dig TXT $DOMAIN +short 2>/dev/null | grep spf || echo "")
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
DKIM_RESULT=$(dig TXT resend._domainkey.$DOMAIN +short 2>/dev/null || echo "")
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
OPTIONS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "$WEBHOOK_URL" 2>/dev/null || echo "000")
if [[ "$OPTIONS_STATUS" == "200" ]]; then
    check_pass "OPTIONS request returns 200"
else
    check_fail "OPTIONS request returned $OPTIONS_STATUS (expected 200)"
fi

# Test POST with invalid payload (should reject gracefully)
echo -n "Testing endpoint accessibility... "
POST_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d '{"test": "invalid"}' 2>/dev/null || echo "000")
if [[ "$POST_STATUS" =~ ^(200|401|404|422|500)$ ]]; then
    check_pass "Endpoint is accessible (HTTP $POST_STATUS)"
    if [[ "$POST_STATUS" == "401" ]]; then
        echo "   Note: 401 is expected - endpoint requires authentication"
    fi
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
