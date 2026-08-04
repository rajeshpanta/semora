# secrets/

**This repository is public.** Nothing in plaintext may ever be committed here.

`semora-secrets.tar.gz.gpg` is the encrypted recovery bundle: the credentials
that exist nowhere else and cannot be re-downloaded. It is gpg symmetric
AES-256, so committing it to a public repo is safe — the ciphertext is opaque
without the passphrase, and a wrong passphrase yields nothing.

The **passphrase is the one thing that must never be in git.** Keep it in a
password manager. Lose it and the bundle is unrecoverable, which is the point.

## Getting the credentials back on a new machine

```bash
git clone https://github.com/rajeshpanta/semora.git
cd semora
./scripts/secrets-open.sh
```

That prompts for the passphrase and restores `~/Semora-Recovery/`, whose own
README explains what each file is and where it belongs. The script prints the
`cp` commands to put the keys back in the paths the tooling expects.

## Updating it after adding or rotating a credential

```bash
./scripts/secrets-seal.sh
git commit -m "Update encrypted secrets bundle" && git push
```

`secrets-seal.sh` decrypts its own output and compares checksums against the
source before staging anything. If the round-trip does not match byte for byte
it deletes the archive and exits non-zero, so a corrupt bundle can never be
committed looking like a working backup.

## Why the whole `secrets/` directory is gitignored

`.gitignore` ignores `secrets/*` and re-allows only this README and the `.gpg`
file. A plaintext key dropped in here is invisible to `git add`, and
`secrets-seal.sh` uses `git add -f` on exactly the one permitted path. `*.p8`,
`*.p12`, `*.mobileprovision` and `client_secret*.json` are also blocked
repo-wide, at any path.

Verified: staging a plaintext `secrets/leaked.p8` adds zero files.

## What is NOT in here

Anything rebuildable from a clone — `dist/`, `ios/`, `node_modules/`,
`.next/`, `.vercel/`. Also not the Supabase **service role** key: that lives
only in Supabase's own edge-function environment and is never checked out
anywhere. Edge functions read it with `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`,
which is a variable name, not a value.
