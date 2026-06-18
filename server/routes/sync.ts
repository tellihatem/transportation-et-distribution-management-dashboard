/**
 * Sync API Routes — /api/sync/*
 * Endpoints for monitoring and controlling the Supabase replication.
 */

import { Router, Request, Response } from 'express';
import { asyncHandler, createApiError } from '../middleware/error-handler';
import { getSyncStatus, fullPushSync, processSyncQueue } from '../sync/replicator';
import { restoreFromSupabase } from '../sync/restore';
import { checkSupabaseConnection } from '../sync/supabase-client';

const router = Router();

/**
 * GET /api/sync/status — Current sync health
 */
router.get('/status', asyncHandler(async (_req: Request, res: Response) => {
  const status = getSyncStatus();
  const connected = await checkSupabaseConnection();

  res.json({
    success: true,
    data: {
      ...status,
      supabaseReachable: connected,
    },
  });
}));

/**
 * POST /api/sync/push — Force full sync (local → Supabase)
 */
router.post('/push', asyncHandler(async (_req: Request, res: Response) => {
  const result = await fullPushSync();
  res.json({ success: true, data: result });
}));

/**
 * POST /api/sync/process-queue — Process pending sync queue items
 */
router.post('/process-queue', asyncHandler(async (_req: Request, res: Response) => {
  const result = await processSyncQueue();
  res.json({ success: true, data: result });
}));

/**
 * POST /api/sync/restore — Full restore from Supabase → local
 * Requires { confirm: true } in body for safety
 */
router.post('/restore', asyncHandler(async (req: Request, res: Response) => {
  if (!req.body.confirm) {
    throw createApiError(
      'Restore will REPLACE all local data with Supabase data. Send { "confirm": true } to proceed.',
      400,
      'CONFIRMATION_REQUIRED'
    );
  }

  const result = await restoreFromSupabase();

  if (!result.success) {
    throw createApiError(result.error || 'Restore failed', 500, 'RESTORE_FAILED');
  }

  res.json({ success: true, data: result });
}));

export default router;
