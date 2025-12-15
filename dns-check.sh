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

echo "3. All TXT Records (including SPF, DMARC, etc.):"
dig TXT burner.privaseer.co.uk +short
echo ""

echo "4. DKIM Record:"
dig TXT resend._domainkey.burner.privaseer.co.uk +short
echo ""

echo "5. DMARC Record:"
dig TXT _dmarc.burner.privaseer.co.uk +short
echo ""

echo "=== END DNS VERIFICATION ==="
