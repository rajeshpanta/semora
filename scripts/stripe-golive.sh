#!/usr/bin/env bash
#
# Switch Semora's web billing from the Stripe sandbox to LIVE.
#
#   ./scripts/stripe-golive.sh sk_live_xxxxxxxxxxxx
#
# Everything created during testing lives in the sandbox and does NOT carry
# over: a live account has its own products, prices and webhook endpoints. This
# recreates all of them against the live key, writes the resulting ids into
# Supabase secrets, and redeploys the functions that read them.
#
# Run it only AFTER Stripe has activated the account (charges_enabled = true),
# otherwise the products are created against an account that cannot take money.
set -euo pipefail

SK="${1:-}"
if [ -z "$SK" ]; then echo "usage: $0 sk_live_..." >&2; exit 1; fi
case "$SK" in
  sk_live_*) ;;
  *) echo "error: expected a LIVE secret key (sk_live_...). Refusing to run." >&2; exit 1;;
esac

api() { curl -sS -m 40 -u "$SK:" "$@"; }
jqid() { python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id') or ('ERROR: '+str(d.get('error',{}).get('message'))))"; }

echo "==> checking the account can actually charge"
api https://api.stripe.com/v1/account | python3 -c "
import json,sys
d=json.load(sys.stdin)
if 'error' in d: print('  ERROR:', d['error'].get('message')); sys.exit(1)
print('  account:', d.get('id'), '| country:', d.get('country'), '| charges_enabled:', d.get('charges_enabled'))
if not d.get('charges_enabled'):
    print('  REFUSING: Stripe has not enabled charges yet. Finish activation first.'); sys.exit(1)
"

echo "==> creating product + prices (\$3.99/mo, \$19.99/yr)"
PROD=$(api https://api.stripe.com/v1/products \
  -d name="Semora Pro" \
  -d description="Unlimited syllabus scans, courses and lectures, plus Smart Plan, flashcards, the AI tutor, grade forecasting and calendar sync." \
  --data-urlencode "url=https://semoraai.com/pricing" \
  -d "metadata[app]=semora" | jqid)
echo "  product: $PROD"

MONTHLY=$(api https://api.stripe.com/v1/prices -d product="$PROD" -d unit_amount=399 -d currency=usd \
  -d "recurring[interval]=month" -d nickname="Semora Pro Monthly" -d "metadata[plan]=monthly" | jqid)
ANNUAL=$(api https://api.stripe.com/v1/prices -d product="$PROD" -d unit_amount=1999 -d currency=usd \
  -d "recurring[interval]=year" -d nickname="Semora Pro Annual" -d "metadata[plan]=annual" | jqid)
echo "  monthly: $MONTHLY"
echo "  annual:  $ANNUAL"

echo "==> creating the webhook endpoint"
WH=$(api https://api.stripe.com/v1/webhook_endpoints \
  --data-urlencode "url=https://usglgeosqhtxbyxsugre.supabase.co/functions/v1/stripe-webhook" \
  -d "enabled_events[]=customer.subscription.created" \
  -d "enabled_events[]=customer.subscription.updated" \
  -d "enabled_events[]=customer.subscription.deleted" \
  -d "enabled_events[]=invoice.payment_failed" \
  -d description="Semora entitlement sync (live)")
WHSEC=$(echo "$WH" | python3 -c "import json,sys; print(json.load(sys.stdin).get('secret',''))")
echo "  endpoint: $(echo "$WH" | jqid)"
if [ -z "$WHSEC" ]; then echo "  ERROR: no signing secret returned" >&2; exit 1; fi

ENVFILE="$(mktemp -t semora-stripe-live)"
trap 'rm -f "$ENVFILE"' EXIT INT TERM
umask 077
cat > "$ENVFILE" <<ENV
STRIPE_SECRET_KEY=$SK
STRIPE_WEBHOOK_SECRET=$WHSEC
STRIPE_PRICE_MONTHLY=$MONTHLY
STRIPE_PRICE_ANNUAL=$ANNUAL
WEB_APP_URL=https://app.semoraai.com
ENV

echo "==> writing Supabase secrets"
npx --yes supabase secrets set --env-file "$ENVFILE" >/dev/null
echo "  set: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_ANNUAL, WEB_APP_URL"

echo "==> applying pending migrations"
# 074 separates stripe_subscription_id from Apple's original_transaction_id.
# Without it the webhook writes to a column that does not exist yet.
npx --yes supabase db push >/dev/null && echo "  migrations applied"

echo "==> redeploying the functions that read them"
# --no-verify-jwt on the webhook is REQUIRED: Supabase demands a JWT by default
# and Stripe never sends one, so without this every delivery 401s and no one
# who pays ever receives Pro.
npx --yes supabase functions deploy stripe-webhook --no-verify-jwt >/dev/null && echo "  stripe-webhook (no-verify-jwt)"
npx --yes supabase functions deploy stripe-checkout >/dev/null && echo "  stripe-checkout"
npx --yes supabase functions deploy stripe-portal   >/dev/null && echo "  stripe-portal"
# validate-receipt carries the guard that stops an Apple validation from
# downgrading a web-billed row. It must ship with the rest or a Stripe
# subscriber who opens the iOS app gets a 500 on every launch.
npx --yes supabase functions deploy validate-receipt >/dev/null && echo "  validate-receipt"

echo
echo "LIVE. Next: deploy the web app (npm run deploy:web:production) so the paywall"
echo "can reach checkout, and merge the marketing copy to main."
