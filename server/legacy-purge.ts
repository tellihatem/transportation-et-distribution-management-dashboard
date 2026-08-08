/**
 * Legacy seed-row purge — shared by every path that can (re)introduce data.
 *
 * Builds before August 2026 seeded 15 demo records into empty databases.
 * Migration 007 deletes them at boot, but rows can also arrive through a
 * backup import or a Supabase cloud restore, and the Supabase mirror itself
 * may still hold them (seed-era pushes uploaded everything). So:
 *
 *  - purgeLegacySeedRows() runs the exact 007 SQL over the live database, so
 *    import and restore cannot hand the rows back to the UI.
 *  - queueCloudSeedDeletes() queues Supabase deletes for the canonical seed
 *    ids, actively cleaning the mirror the next time sync runs. Deleting an
 *    absent row is a no-op, and with Supabase unconfigured queueSync does
 *    nothing, so this is always safe to call.
 *
 * The id lists mirror migration 007 and must change together with it.
 */

import path from 'path';
import fs from 'fs';
import type { Database } from 'better-sqlite3';
import { queueSync } from './sync/replicator';

export const LEGACY_SEED_IDS: Record<string, string[]> = {
  client_trips: ['TR-202', 'TR-203', 'TR-204', 'TR-205', 'TR-206'],
  material_resales: ['RS-801', 'RS-802', 'RS-803', 'RS-804'],
  expenses: ['EXP-101', 'EXP-102', 'EXP-103', 'EXP-104', 'EXP-105', 'EXP-106'],
};

/** Absolute path of the purge migration (works in dev and compiled layouts). */
export function purgeSqlFile(): string {
  return path.resolve(__dirname, 'migrations', '007_purge_legacy_seed_data.sql');
}

/**
 * Delete the known seed rows from the given database, using the identical
 * SQL that runs at every boot (id AND name AND date matching, so genuine
 * records that merely reuse an id survive).
 *
 * Throws if the migration file is missing — callers must treat that as
 * "cannot guarantee a clean result" and refuse the operation, not shrug.
 */
export function purgeLegacySeedRows(db: Database): void {
  db.exec(fs.readFileSync(purgeSqlFile(), 'utf-8'));
}

/**
 * Queue Supabase deletes for every canonical seed id, so the cloud mirror is
 * cleaned rather than left as a permanent reinfection source. Local deletes
 * in 007 never propagate (they are raw SQL, not route handlers), so without
 * this the mirror would keep the rows forever.
 */
export function queueCloudSeedDeletes(): void {
  for (const [table, ids] of Object.entries(LEGACY_SEED_IDS)) {
    for (const id of ids) {
      queueSync(table, id, 'delete', null);
    }
  }
}
