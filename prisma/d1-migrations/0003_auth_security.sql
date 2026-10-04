-- Shared login lockouts and revoked token hashes across Worker isolates.
CREATE TABLE "AuthSecurity" (
  "key" TEXT PRIMARY KEY NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "AuthSecurity_expiresAt_idx" ON "AuthSecurity"("expiresAt");
