import { getDatabaseBinding } from '@/src/lib/cloudflare/runtime';

// Explicit SQL write plans: D1.batch is atomic; Prisma interactive transactions
// are unsupported. Reads used to plan mutations must be protected by guards when
// an unchanged snapshot is necessary (for example read/modify/write settings).
const models = new Set(['PumpLog', 'FeedLog', 'Settings', 'Family', 'FoodLog', 'Food', 'SleepLog', 'CalendarEvent', 'BabyEvent', 'CaretakerEvent', 'ContactEvent']);
const timestamped = new Set(['PumpLog', 'FeedLog', 'Settings', 'Family', 'FoodLog', 'Food', 'SleepLog', 'CalendarEvent']);
const createdTimestamp = new Set(['PumpLog', 'FeedLog', 'Settings', 'Family', 'FoodLog', 'Food', 'SleepLog', 'CalendarEvent']);
function identifier(value: string) {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(value)) throw new Error('Invalid SQL identifier');
  return `"${value}"`;
}
function model(name: string) {
  if (!models.has(name)) throw new Error(`Unsupported batch model ${name}`);
  return identifier(name);
}
function parameter(value: unknown): string | number | null {
  if (value == null) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string' || typeof value === 'number') return value;
  throw new Error('Batch values must be scalar');
}
export type WritePlan = { sql: string; values: (string | number | null)[] };
export function insertRow(table: string, data: Record<string, unknown>): WritePlan {
  const values = { ...data };
  if (timestamped.has(table) && values.updatedAt === undefined) values.updatedAt = new Date();
  if (createdTimestamp.has(table) && values.createdAt === undefined) values.createdAt = new Date();
  const entries = Object.entries(values).filter(([, value]) => value !== undefined);
  return {
    sql: `INSERT INTO ${model(table)} (${entries.map(([key]) => identifier(key)).join(', ')}) VALUES (${entries.map(() => '?').join(', ')})`,
    values: entries.map(([, value]) => parameter(value)),
  };
}
export function updateRows(table: string, data: Record<string, unknown>, predicate: string, values: unknown[]): WritePlan {
  const updated = { ...data };
  if (timestamped.has(table) && updated.updatedAt === undefined) updated.updatedAt = new Date();
  const entries = Object.entries(updated).filter(([, value]) => value !== undefined);
  return {
    sql: `UPDATE ${model(table)} SET ${entries.map(([key]) => `${identifier(key)} = ?`).join(', ')} WHERE ${predicate}`,
    values: [...entries.map(([, value]) => parameter(value)), ...values.map(parameter)],
  };
}
export function deleteRows(table: string, predicate: string, values: unknown[]): WritePlan {
  return { sql: `DELETE FROM ${model(table)} WHERE ${predicate}`, values: values.map(parameter) };
}
/** Abort the complete batch if another request changed this settings snapshot. */
export function settingsGuard(settings: { id: string; sleepLocationSettings: string | null; updatedAt: Date }): WritePlan {
  return {
    sql: `SELECT CASE WHEN EXISTS (SELECT 1 FROM "Settings" WHERE "id" = ? AND "sleepLocationSettings" IS ?) THEN 1 ELSE json('concurrent-settings-change') END`,
    values: [settings.id, settings.sleepLocationSettings],
  };
}
export function snapshotGuard(table: string, predicate: string, values: unknown[]): WritePlan {
  return { sql: `SELECT CASE WHEN EXISTS (SELECT 1 FROM ${model(table)} WHERE ${predicate}) THEN 1 ELSE json('concurrent-record-change') END`, values: values.map(parameter) };
}
export class D1ConflictError extends Error {
  constructor() { super('This record changed while saving. Reload and try again.'); this.name = 'D1ConflictError'; }
}
export async function executeWriteBatch(plans: WritePlan[]) {
  if (!plans.length) return [];
  const db = getDatabaseBinding();
  try {
    return await db.batch(plans.map(plan => db.prepare(plan.sql).bind(...plan.values)));
  } catch (error) {
    // These plans only use json() to assert snapshots; a malformed-JSON error
    // therefore indicates concurrent state change, not malformed user content.
    if (error instanceof Error && /malformed JSON/i.test(error.message) && plans.some(plan => /json\('(concurrent|location-in-use)/.test(plan.sql))) {
      throw new D1ConflictError();
    }
    throw error;
  }
}
