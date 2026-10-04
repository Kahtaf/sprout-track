-- Retain exact imported durations without changing existing minute-based UI.
ALTER TABLE "PumpLog" ADD COLUMN "durationSeconds" INTEGER;
ALTER TABLE "BathLog" ADD COLUMN "durationSeconds" INTEGER;
