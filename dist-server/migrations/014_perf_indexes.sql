-- Indexes for the name-keyed lookups the ledgers live on
--
-- The supplier ledger (010) indexed its work-table lookups from day one;
-- the client and driver ledgers indexed only their PAYMENT tables (005) and
-- left every client_trips / material_resales name lookup as a full scan.
-- Those scans sit inside per-party loops in the summary endpoints and inside
-- the credit sweeps that run on every write — and because the server shares
-- the Electron main process's thread, each one blocks keyboard input for its
-- duration. These five indexes turn the hottest paths in the app from
-- O(parties × rows) into indexed lookups.
--
-- sync_queue(retry_count): the background sync tick filters on it; without
-- an index each tick full-scans and sorts the queue, dead rows included.
--
-- CREATE INDEX IF NOT EXISTS — reruns on every boot are free.

CREATE INDEX IF NOT EXISTS idx_trips_client_name   ON client_trips(client_name);
CREATE INDEX IF NOT EXISTS idx_trips_driver_name   ON client_trips(driver_name);
CREATE INDEX IF NOT EXISTS idx_resales_end_client  ON material_resales(end_client);
CREATE INDEX IF NOT EXISTS idx_resales_driver_name ON material_resales(driver_name);
CREATE INDEX IF NOT EXISTS idx_sync_queue_retry    ON sync_queue(retry_count);
