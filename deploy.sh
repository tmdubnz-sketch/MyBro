#!/bin/bash
# deploy.sh — Deploy Gemini Live relay to Supabase
# Run this from the project root

set -e

PROJECT_REF="hduqmgzcpazehngrkemo"

echo "🔗 Linking to Supabase project..."
supabase link --project-ref $PROJECT_REF

echo ""
echo "🔑 Setting GEMINI_API_KEY secret..."
echo "   (You'll be prompted to enter your Gemini API key)"
read -s -p "   GEMINI_API_KEY: " GEMINI_KEY
echo ""
supabase secrets set GEMINI_API_KEY="$GEMINI_KEY"

echo ""
echo "📝 Setting SYSTEM_PROMPT (optional — press Enter to use default)..."
read -p "   SYSTEM_PROMPT: " SYSTEM_PROMPT
if [ -n "$SYSTEM_PROMPT" ]; then
  supabase secrets set SYSTEM_PROMPT="$SYSTEM_PROMPT"
fi

echo ""
echo "🚀 Deploying gemini-live Edge Function..."
supabase functions deploy gemini-live --no-verify-jwt

echo ""
echo "✅ Done! Your WebSocket relay is live at:"
echo "   wss://$PROJECT_REF.supabase.co/functions/v1/gemini-live"
echo ""
echo "🧪 Test the health endpoint:"
echo "   curl https://$PROJECT_REF.supabase.co/functions/v1/gemini-live"
