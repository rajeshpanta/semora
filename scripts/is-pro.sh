#!/usr/bin/env bash
# Is this person Pro? — the honest answer, from the entitlements table.
#
#   ./scripts/is-pro.sh someone@example.com
#
# Reads the one row that actually gates the app. `is_pro` here is the same
# value the client reads, so this cannot disagree with what the user sees.
# Everything else in the output explains WHY: which biller owns the row, when
# it lapses, and whether they ever tried to restore. A person who paid on the
# App Store but never signed in and tapped Restore shows `false` with 0
# restore_attempts -- not a bug, just a purchase Semora has never been told about.
set -euo pipefail
EMAIL="${1:?usage: is-pro.sh <email>}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL="$(mktemp -t ispro).sql"
trap 'rm -f "$SQL"' EXIT

# The email is interpolated into SQL, so anything that could end the literal is
# refused outright rather than escaped -- an address is never legitimately
# shaped like this, and quoting bugs here would read the wrong person's row.
case "$EMAIL" in *"'"*|*';'*|*'\'*) echo "refusing suspicious email: $EMAIL" >&2; exit 2;; esac

cat > "$SQL" <<EOF
select u.email,
       u.created_at                             as account_created,
       u.last_sign_in_at,
       coalesce(e.is_pro, false)                as is_pro,
       coalesce(e.plan, '—')                    as plan,
       coalesce(e.platform, '—')                as billed_by,
       coalesce(e.expires_at::text, '—')        as expires,
       case when e.original_transaction_id is not null then 'apple txn on file'
            when e.stripe_subscription_id  is not null then 'stripe sub on file'
            else 'no purchase on file' end      as purchase,
       (select count(*) from public.promo_grants g
          where g.user_id = u.id)               as promo_grants,
       (select count(*) from public.receipt_validation_log l
          where l.user_id = u.id)               as restore_attempts
from auth.users u
left join public.entitlements e on e.user_id = u.id
where lower(u.email) = lower('$EMAIL');
EOF

cd "$DIR"
supabase db query --linked --file "$SQL" 2>/dev/null \
  | python3 -c '
import sys, json, re
t = sys.stdin.read()
m = re.search(r"\{.*\}", t, re.S)
if not m: print("query failed — is the Supabase CLI linked?"); raise SystemExit(1)
rows = json.loads(m.group(0)).get("rows", [])
if not rows:
    print("NO SEMORA ACCOUNT with that email."); raise SystemExit(0)
for r in rows:
    print(("PRO" if r["is_pro"] else "NOT PRO") + "  —  " + r["email"])
    for k in ("plan","billed_by","expires","purchase","promo_grants",
              "restore_attempts","account_created","last_sign_in_at"):
        print("  %-17s %s" % (k, r[k]))
'
