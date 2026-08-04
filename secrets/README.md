# secrets/

**No credential is stored in this repository. By design.**

This directory holds documentation only. It exists so the `.gitignore` rules
guarding it have somewhere to live, and so this note is findable.

## Why not in git, even encrypted

An encrypted bundle in a public repo is a **single point of total compromise**:
one passphrase leak and every account goes at once — Apple, App Store Connect,
Google OAuth, Supabase. The blast radius is everything, simultaneously, from one
mistake. The ciphertext is also permanent — anyone who cloned it keeps their copy
regardless of what is deleted later.

Credentials therefore stay on the machine, and durability comes from an
encrypted archive kept **outside** version control.

## Where the credentials actually live

| What | Where |
|---|---|
| Working set | `~/Semora-Recovery/` (plaintext, this machine) |
| Sign in with Apple key | repo root `AuthKey_DQ64DU246B.p8` — gitignored |
| App Store Connect key | `~/.appstoreconnect/private_keys/` |
| Supabase config | repo root `.env.local` — gitignored |
| Service role key | Supabase's own environment. Never checked out anywhere. |

`~/Semora-Recovery/README.md` explains what each file is, which are one-shot
(Apple allows a `.p8` download exactly once), and the exact recovery path for
each that can be re-obtained.

## Making a durable offline copy

```bash
./scripts/secrets-backup.sh
```

Prompts for a passphrase and writes an encrypted archive to `~/Desktop`. Move it
to a password manager, an external drive, or encrypted cloud storage — anywhere
that is **not** this repo. The script decrypts its own output and checksums it
against the source before declaring success, so a corrupt archive is never
mistaken for a working backup.

Restore with:

```bash
./scripts/secrets-restore.sh ~/Desktop/semora-secrets.tar.gz.gpg
```

## The guardrails that stay

`.gitignore` ignores everything under `secrets/` except this README, and blocks
`*.p8`, `*.p12`, `*.mobileprovision` and `client_secret*.json` at any path in the
repo. GitHub **secret scanning and push protection are enabled**, so a credential
is rejected before it reaches the remote rather than after.

Verified: staging a plaintext `secrets/leaked.p8` adds zero files.
