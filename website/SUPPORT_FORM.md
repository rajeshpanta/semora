# Support form — setup and operation

The contact form on `semoraai.com/support` and `semoraai.com/es/ayuda` sends on
the page. Nothing opens a mail app, and nothing depends on the visitor having
one.

Until August 2026 the form built a `mailto:` link and told the visitor "Your
email app is ready with your message." On a browser with no OS mail handler —
Gmail in a tab, which is most students — that click did nothing at all, and no
copy was kept anywhere. Every one of those messages was lost silently. This is
the replacement.

## The path a message takes

```
SupportForm (browser)
  └─ POST /api/support                    website/app/api/support/route.ts
       └─ POST <supabase>/functions/v1/submit-support
            ├─ 1. INSERT into public.support_requests   ← the message is now safe
            └─ 2. SMTP send to semora365@gmail.com      ← best effort, Reply-To = student
```

**Step 1 is what the visitor's confirmation is about.** If the email in step 2
fails, the row is already stored and gets `email_status = 'failed'` — an SMTP
outage becomes a visible queue in the dashboard instead of lost mail. It never
works the other way round.

The visitor sees: *"Your message has been emailed to our support team. Someone
will get back to you within 24 hours."* If the request cannot get through at
all, they are told plainly and handed `semora365@gmail.com` as a fallback —
never a success message for something that did not happen.

## Deployment status (2026-08-13)

| Step | State |
| --- | --- |
| Migration `064` | ✅ applied to `usglgeosqhtxbyxsugre` |
| `submit-support` edge function | ✅ deployed, `verify_jwt: false` |
| Vercel `SUPABASE_URL` | ✅ set (Production + Preview) |
| Vercel `SUPPORT_INGEST_SECRET` | ✅ set (Production + Preview) |
| Supabase secrets (7 of 8) | ✅ set |
| `SMTP_PASSWORD` | ❌ **outstanding — needs a Gmail App Password** |
| Website deploy | ❌ not yet pushed to `main` |

Verified against the live function on 2026-08-13: a request without the shared
secret is rejected `401`; a valid request stores a row and returns `200`; a
honeypot submission is discarded without storing; a malformed address is
rejected `400`. The stored IP is a SHA-256 hash, not the address. The test row
was deleted afterwards, so the table is empty.

Right now every message is **captured** and the visitor gets a real
confirmation, but `email_status` is `skipped` — nothing arrives in the inbox
until the App Password is set:

```bash
# put the 16-char App Password in the file first (see step 2 below)
npx supabase secrets set --env-file ~/Semora-Recovery/support-form-secrets.env
```

> A note for next time: the CLI's stored token needed refreshing via
> `npx supabase login` before `POST /v1/projects/{ref}/secrets` was permitted.
> Signing in to supabase.com in a browser does not update the CLI's credential.

## One-time setup

### 1. Apply the migration

```bash
supabase db push        # applies 064_support_requests.sql
```

### 2. Create a Gmail App Password

The notification is sent over Gmail's own SMTP, so there is no third-party
email service in the loop. Signed in as **semora365@gmail.com**:

1. Google Account → Security → turn on **2-Step Verification** (required before
   app passwords are offered at all).
2. Security → **App passwords** → app "Mail", device "Other" → name it
   `Semora support form`.
3. Copy the 16-character password. It is shown once. This is **not** the
   account password, and it is what goes in `SMTP_PASSWORD` below.

### 3. Set the Supabase secrets

```bash
supabase secrets set SUPPORT_INGEST_SECRET="$(openssl rand -hex 32)"
supabase secrets set SUPPORT_IP_SALT="$(openssl rand -hex 16)"
supabase secrets set SMTP_HOSTNAME=smtp.gmail.com
supabase secrets set SMTP_PORT=465
supabase secrets set SMTP_USERNAME=semora365@gmail.com
supabase secrets set SMTP_PASSWORD=<the 16-char app password, no spaces>
supabase secrets set SMTP_FROM=semora365@gmail.com
supabase secrets set SUPPORT_NOTIFY_TO=semora365@gmail.com
```

Keep the `SUPPORT_INGEST_SECRET` value — the website needs the same string in
step 5.

### 4. Deploy the edge function

```bash
supabase functions deploy submit-support --no-verify-jwt
```

> The flag is **required**. Auth here is the shared secret, not a
> Supabase-signed JWT, so without it the gateway 401s every call before the
> function's own code runs — the same trap documented for `send-push`.

### 5. Set the website environment variables

In the Vercel project **`semora-website`** (Production + Preview):

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | `https://usglgeosqhtxbyxsugre.supabase.co` |
| `SUPPORT_INGEST_SECRET` | the same string from step 3 |

Neither is `NEXT_PUBLIC_`; nothing about this reaches the browser bundle.
Redeploy after adding them — env vars are read at request time, but a
deployment that predates them will have logged the "not configured" error.

## Reading and answering requests

Supabase dashboard → Table Editor → `support_requests`, newest first.

The notification email sets **Reply-To to the student's address**, so answering
in Gmail goes straight back to them — no copy-pasting addresses.

Mark a request answered by setting `handled_at` to the current timestamp. That
is what keeps the "unhandled" index meaningful, and it is also what makes a row
eligible for the 180-day purge (`purge_old_support_requests()`); unanswered
rows are never deleted.

Worth watching occasionally:

```sql
-- Anything that failed to email out (the message itself is still safe here)
select id, created_at, name, email, email_error
from support_requests
where email_status = 'failed'
order by created_at desc;
```

## If SMTP is not configured

The function still stores every request and marks it `email_status = 'skipped'`.
The form still reports success, because the message genuinely was received —
you just have to read it in the dashboard rather than your inbox. This is the
degraded mode, not the intended one.

## Abuse controls

- **Shared secret** — the edge function refuses anything without
  `SUPPORT_INGEST_SECRET`, and refuses everything if the secret is unset. It is
  not an open endpoint.
- **Honeypot** — a hidden `company` field. Anything that fills it in gets a
  plain `200` and is discarded (telling a bot it failed just makes it retry).
- **Rate limit** — 5 per hour per source IP *and* per email address. IPs are
  stored only as `SHA-256(salt + ip)`.
- **Length caps** — enforced in the form, again in the function, and again as
  CHECK constraints on the table.

## Testing it without touching production

```bash
# terminal 1 — stand in for the edge function
node -e "require('http').createServer((q,s)=>{let b='';q.on('data',c=>b+=c);q.on('end',()=>{console.log(q.headers.authorization,b);s.end('{\"ok\":true}')})}).listen(5555)"

# terminal 2
cd website && npm run build
SUPABASE_URL=http://localhost:5555 SUPPORT_INGEST_SECRET=test npx next start -p 4321

# terminal 3
curl -X POST localhost:4321/api/support -H 'Content-Type: application/json' \
  -d '{"name":"Ana","email":"ana@example.com","message":"test","locale":"es"}'
```

To test the real function end to end, POST to it directly with the shared
secret; a row should appear in `support_requests` and an email in the inbox:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/submit-support" \
  -H "Authorization: Bearer $SUPPORT_INGEST_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test","email":"you@example.com","message":"hello","locale":"en"}'
```
