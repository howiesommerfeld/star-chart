#!/usr/bin/env bash
# One-time production env setup. Run manually: bash scripts/setup-prod-env.sh
# Mints the Turso auth token and generates the family URL token, session
# secret, and parent PIN, then stores them as Vercel production env vars.
# Writes the family URL + PIN to .family-secrets.txt (gitignored) so you can
# find them again.
set -euo pipefail
cd "$(dirname "$0")/.."

DB_URL="libsql://star-chart-howiesommerfeld.aws-eu-west-1.turso.io"
FAMILY_TOKEN=$(openssl rand -hex 16)
SESSION_SECRET=$(openssl rand -hex 32)
read -r -p "Choose a parent PIN (4-6 digits): " PARENT_PIN

turso db tokens create star-chart | vercel env add TURSO_AUTH_TOKEN production
printf '%s' "$FAMILY_TOKEN" | vercel env add FAMILY_TOKEN production
printf '%s' "$SESSION_SECRET" | vercel env add SESSION_SECRET production
printf '%s' "$PARENT_PIN" | vercel env add PARENT_PIN production

{
  echo "Production family URL path: /f/$FAMILY_TOKEN"
  echo "Parent PIN: $PARENT_PIN"
} > .family-secrets.txt

echo
echo "Done. Family URL path and PIN saved to .family-secrets.txt"
