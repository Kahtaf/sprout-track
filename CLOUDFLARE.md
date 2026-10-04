# Personal Cloudflare deployment

This derivative of Sprout Track runs on a Cloudflare Worker with static assets and one D1 database. Original copyright and [license](LICENSE.md) remain with John Overton and Oak and Sprout. Changes include the Worker runtime, D1 persistence, authentication safeguards, portable backups, and Babycare/Nara import adapters.

## Runtime

Next.js-compatible rendering uses vinext. Vite emits `.js` entries for both rendering environments and checks every relative emitted import during builds. Prisma clients explicitly use the edge entry points so their query compiler WASM is emitted as a static Worker module. Request-scoped clients avoid sharing D1 I/O across requests.

No containers, external database, AI, image transformations, Durable Objects, or R2 are configured. Cost depends on the account's existing plan and actual usage; deploying does not activate a paid plan. Inspect Cloudflare CPU/request and D1 row metrics rather than assuming the Free CPU limit can handle every SSR/export workload.

## First deployment

1. Install dependencies: `npm ci`.
2. Generate clients: `npm run prisma:generate` and `npm run prisma:generate:log`.
3. Configure your Worker/account/D1 binding in `wrangler.jsonc`. Apply `npx wrangler d1 migrations apply DB --remote` against a **new empty** database. These are D1 baseline migrations, not upstream Docker migration history.
4. Generate private bootstrap files outside this checkout with `scripts/cloudflare-bootstrap.py`; see its `--help`. Apply its one-shot SQL before publishing, then `npx wrangler secret bulk /private/path/worker-secrets.json`. Do not run upstream seed scripts with default credentials.
5. Keep `COOKIE_SECURE=true`, `ALLOW_FAMILY_SETUP=false`, and `ENABLE_LOG=false` for production. Public family setup, account linking and gift redemption are unavailable in this personal deployment.
6. Run `npm test`, `npm run typecheck`, and `npm run build:vinext`. Deploy with `npx wrangler deploy --config dist/server/wrangler.json`.

For local preview, use ignored `.dev.vars` with local secrets and `COOKIE_SECURE=false`. Apply migrations and bootstrap locally; `npm run start:vinext` shares the root `.wrangler/state`. Never copy actual secrets or history into tracked fixtures.

## History migration

The authenticated external import wizard offers Babycare JSON and Nara CSV alongside the upstream importer. Both profiles can map to the same existing child. Source IDs, raw fields and review flags are stored in `ExternalImportRecord`; deterministic target IDs and upserts allow safe retry without overwriting edits or resurrecting deleted targets.

For large files, `scripts/import-family-history.py` splits the original export locally into bounded requests. Start with `--dry-run`, then supply an HTTPS origin, the private bootstrap identity file, and a privately saved bearer token file. Invitations, source data and token values must never be committed. The original Babycare export JSON is the preferred input, not its generated CSV or PDF.

Babycare's literal `Z` means local wall-clock fields in the inspected app; its import uses the explicitly chosen timezone. Nara uses authoritative epoch milliseconds. Review questionable source units; the importer does not silently correct large `IN` values or invent unknown medication doses and feeding quantities. Fractional-minute pumping/bath durations retain exact seconds. Historic milk production/feeding does not change current milk inventory.

## Transactions and unavailable features

Prisma D1 rejects interactive callback transactions. Core related writes use explicit atomic D1 batches with optimistic guards; import is safely resumable per record and is not an all-file transaction. Concurrent conflicting writes may require retry.

Photos, vaccine/feedback documents and other file attachments are unavailable until durable object storage is implemented. Their authenticated endpoints explicitly reject writes rather than saving transient files. SQLite-file backup/restore and runtime shell migrations are unavailable. Complete authenticated JSON ZIP backups preserve all models, including deleted rows and import provenance; D1 restore is administrator-managed.

## Verification tools

- `scripts/cloudflare-local-smoke.py`: authentication, protected reads, historical note edits and full backups.
- `scripts/test-worker-core-logs.py`: real Worker core logging, linked pumping/feeding and sleep-location changes.
- `scripts/test-local-history-import.py`: both import adapters, timezone/seconds and replay/recovery with synthetic fixtures.

Read each script's help before use. Remote mutations require explicit script flags and only synthetic test records are cleaned up. Treat bootstrap identity and backup archives as private data.


## Custom domain

The production app is available at https://baby.kahtaf.com/my-family. `wrangler.jsonc` retains the custom domain route so redeployments preserve it. The original workers.dev address remains enabled. Cloudflare provisions the DNS record and HTTPS certificate for the Worker custom domain.
