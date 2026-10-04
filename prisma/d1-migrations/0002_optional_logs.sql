-- CreateTable
CREATE TABLE "api_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" INTEGER,
    "durationMs" INTEGER,
    "ip" TEXT,
    "userAgent" TEXT,
    "caretakerId" TEXT,
    "familyId" TEXT,
    "error" TEXT,
    "requestBody" TEXT,
    "responseBody" TEXT
);

-- CreateIndex
CREATE INDEX "api_logs_timestamp_idx" ON "api_logs"("timestamp");

-- CreateIndex
CREATE INDEX "api_logs_status_idx" ON "api_logs"("status");

-- CreateIndex
CREATE INDEX "api_logs_familyId_idx" ON "api_logs"("familyId");

-- CreateIndex
CREATE INDEX "api_logs_path_idx" ON "api_logs"("path");
