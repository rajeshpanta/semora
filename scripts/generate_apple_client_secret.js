// Generate the Apple "Client Secret" JWT required by Supabase's
// Apple OAuth provider. Apple's spec: ES256 JWT signed with the
// .p8 private key, valid for max 6 months.
//
// Re-run this every 6 months (Apple expires it; users on web will
// stop being able to sign in until you regenerate and paste the new
// JWT into Supabase → Auth → Providers → Apple → Secret Key).
//
// Usage:
//   node scripts/generate_apple_client_secret.js | pbcopy
// Then paste into Supabase.
//
// All inputs are constants — change them if your bundle ID, team ID,
// or key ID change.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TEAM_ID = '7T9897GFKH';
const KEY_ID = 'DQ64DU246B';
const SERVICE_ID = 'com.rajeshpanta.syllabussnap'; // bundle ID — works for native iOS sign-in
const P8_PATH = path.join(__dirname, '..', `AuthKey_${KEY_ID}.p8`);

if (!fs.existsSync(P8_PATH)) {
  console.error(`p8 file not found at ${P8_PATH}`);
  process.exit(1);
}

const privateKey = fs.readFileSync(P8_PATH, 'utf8');

const now = Math.floor(Date.now() / 1000);
const sixMonths = 60 * 60 * 24 * 180; // Apple max

const header = { alg: 'ES256', kid: KEY_ID, typ: 'JWT' };
const payload = {
  iss: TEAM_ID,
  iat: now,
  exp: now + sixMonths,
  aud: 'https://appleid.apple.com',
  sub: SERVICE_ID,
};

const b64url = (data) =>
  Buffer.from(data).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;

const keyObj = crypto.createPrivateKey(privateKey);
const signatureRaw = crypto.sign('sha256', Buffer.from(signingInput), {
  key: keyObj,
  dsaEncoding: 'ieee-p1363', // JWT spec requires raw r||s, not the default DER
});

process.stdout.write(`${signingInput}.${b64url(signatureRaw)}`);
