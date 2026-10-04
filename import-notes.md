# Babycare and Nara import

Status: adapters and authenticated preview/import UI implemented; no remote records imported by this agent.

- Provider `babycare`: recovered JSON (`documents`), 538 history events and one profile. Provider `nara`: complete CSV, 1623 activity rows and one profile.
- Sources are sequential; no date/content deduplication. Provider + category + source ID scopes provenance. Split records use stable side/measurement/medicine suffixes. Every mapped record retains full original source JSON/row; reviewFlags retain caveats.
- Babycare literal `Z` is removed: confirmed Toronto wall-clock, including milliseconds. Nara epoch milliseconds remain authoritative UTC instants.
- Nara expands to 1645 editable activity records; Babycare 538, plus two source profiles mapped to the same existing baby. Nara growth and multiple medicine/breast sides explain expansion.
- Incomplete mixed feeds keep known breastmilk amount/unit, leave unknown total null. Medicines missing dosage become editable notes, no dose invented. Original measurement tags (including large IN) retained with review flags. Family-level Nara pumps map only to the sole exported profile.
- Pumps are HISTORICAL; imported bottle feeds carry `history:` session IDs. Both excluded from current milk inventory. New tracked milk continues normal balance behavior.
- Pump duration minutes round for upstream display; exact durationSeconds preserves Nara seconds. Babycare pumps have unknown duration/end rather than invented times; bath milliseconds convert to exact durationSeconds.
- Deterministic target IDs plus upsert update={} recover records after partial D1/provenance failure without overwriting edits. Provenance upsert unique source identity prevents duplicate retries. Whole imports are intentionally chunked; D1 does not provide Prisma interactive transaction atomicity.

## Owner import

Use `scripts/import-family-history.py --provider nara|babycare --source /private/source --identity ../private/bootstrap/bootstrap-identity.json --dry-run` first. Remote execution adds `--base-url https://WORKER.workers.dev --token-file /private/owner-token.json`. Private token file accepts plain bearer token or JSON token/authToken. Avoid putting secrets in command arguments. Requests include sole source profile plus <=4 mapped records; Babycare <=2 events. Both profiles map to bootstrap babyId. No chunk writes a new baby. Network failures stop safely; rerunning preserves prior user edits.

Targeted synthetic tests exercise timestamps, unknown mixed quantities, ambiguous units, missing doses and family-level pump ambiguity. Executor tests updated for deterministic upsert writes. Independent QA owns additional real-local-data audit.
