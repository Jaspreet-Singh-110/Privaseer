#!/bin/bash

# Burner Email Edge Functions Deployment Script
# This script deploys the fixed generate-burner-email function to Supabase

set -e

echo "🚀 Deploying Burner Email Edge Functions..."
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found!"
    echo ""
    echo "Please install it first:"
    echo "  npm install -g supabase"
    echo "  or"
    echo "  brew install supabase/tap/supabase"
    echo ""
    exit 1
fi

# Check if logged in
if ! supabase projects list &> /dev/null; then
    echo "❌ Not logged in to Supabase!"
    echo ""
    echo "Please login first:"
    echo "  supabase login"
    echo ""
    exit 1
fi

echo "✅ Supabase CLI found and authenticated"
echo ""

# Deploy generate-burner-email function (the one with the fix)
echo "📦 Deploying generate-burner-email function..."
supabase functions deploy generate-burner-email --no-verify-jwt

if [ $? -eq 0 ]; then
    echo "✅ generate-burner-email deployed successfully!"
else
    echo "❌ Failed to deploy generate-burner-email"
    exit 1
fi

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Verify deployment in Supabase Dashboard > Edge Functions"
echo "2. Configure DNS records (see BURNER_EMAIL_SETUP.md)"
echo "3. Configure Resend webhook"
echo "4. Set environment variables in Supabase"
echo "   - EMAIL_PROVIDER=resend"
echo "   - EMAIL_API_KEY=<your-resend-api-key>"
echo ""
echo "For detailed setup instructions, see BURNER_EMAIL_SETUP.md"
