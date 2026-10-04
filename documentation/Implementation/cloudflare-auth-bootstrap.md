# Cloudflare private-family authentication

Provision the schema and seed before exposing the Worker. Initial setup is local and private; deployed setup/start and setup-token routes are disabled unconditionally because their upstream interactive transactions are not supported by D1. SaaS account linking and gift redemption are also disabled. A completed family needs no email account or billing integration.

Run `python3 scripts/cloudflare-bootstrap.py --profile /absolute/private/profile.json --hostname your-worker.your-subdomain.workers.dev --output /absolute/new/private/bootstrap` locally. Profile JSON contains `firstName`, `lastName`, `birthDate` as an ISO timestamp, and optional `familyName`. Never commit this profile or generated files. Output must be a new directory outside this repository; directory permissions are 0700 and files 0600.

The script creates:

- `worker-secrets.json`: random JWT and encryption secrets for Wrangler secret bulk upload.
- `bootstrap.sql`: initial AppConfig, completed Family, Settings, system Caretaker and Baby. Apply once through Wrangler D1 execute before deploying. It rejects an occupied database; it is not a restore or update tool.
- `bootstrap-identity.json`: private IDs, 10-digit family PIN, random administrator password and America/Toronto timezone. Use its IDs for initial history import. Share only the family PIN with intended caregivers; keep administrator credentials private.

Set Worker vars `COOKIE_SECURE=true`, `ALLOW_FAMILY_SETUP=false`, `ENABLE_LOG=false`; deployment mode must not be `saas`. Baby history and source exports remain outside the Git checkout. Shared PIN sessions are for this single family; caregivers can be created later through authenticated settings.

Authentication accepts signed HS256 bearer JWTs only. An unsigned `caretakerId` cookie never authenticates a request. Refresh cookies are HTTP-only, SameSite strict and secure in deployment. Login attempt counters and logout token revocations use the shared D1 `AuthSecurity` table, with SHA-256 hashes of client addresses/tokens. Cloudflare's client IP header takes precedence over forwarded headers. Counters lock after three failed attempts in a five-minute window. The public lockout endpoint cannot increment or reset state; login handlers manage it.

Verification: `npm test -- --run tests/cloudflare-auth.test.ts tests/cloudflare-lockout.test.ts` and `python3 scripts/test-cloudflare-bootstrap.py`. Tests use only synthetic profile/credentials, exercise actual SQL counters and seeded schema, and verify closed setup, rejected identity cookies, empty-admin fail-closed behavior, cross-request revocation and private filesystem permissions.
