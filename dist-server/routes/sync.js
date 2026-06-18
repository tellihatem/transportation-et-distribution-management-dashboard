"use strict";
/**
 * Sync API Routes — /api/sync/*
 * Endpoints for monitoring and controlling the Supabase replication.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const error_handler_1 = require("../middleware/error-handler");
const replicator_1 = require("../sync/replicator");
const restore_1 = require("../sync/restore");
const supabase_client_1 = require("../sync/supabase-client");
const router = (0, express_1.Router)();
/**
 * GET /api/sync/status — Current sync health
 */
router.get('/status', (0, error_handler_1.asyncHandler)(async (_req, res) => {
    const status = (0, replicator_1.getSyncStatus)();
    const connected = await (0, supabase_client_1.checkSupabaseConnection)();
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
router.post('/push', (0, error_handler_1.asyncHandler)(async (_req, res) => {
    const result = await (0, replicator_1.fullPushSync)();
    res.json({ success: true, data: result });
}));
/**
 * POST /api/sync/process-queue — Process pending sync queue items
 */
router.post('/process-queue', (0, error_handler_1.asyncHandler)(async (_req, res) => {
    const result = await (0, replicator_1.processSyncQueue)();
    res.json({ success: true, data: result });
}));
/**
 * POST /api/sync/restore — Full restore from Supabase → local
 * Requires { confirm: true } in body for safety
 */
router.post('/restore', (0, error_handler_1.asyncHandler)(async (req, res) => {
    if (!req.body.confirm) {
        throw (0, error_handler_1.createApiError)('Restore will REPLACE all local data with Supabase data. Send { "confirm": true } to proceed.', 400, 'CONFIRMATION_REQUIRED');
    }
    const result = await (0, restore_1.restoreFromSupabase)();
    if (!result.success) {
        throw (0, error_handler_1.createApiError)(result.error || 'Restore failed', 500, 'RESTORE_FAILED');
    }
    res.json({ success: true, data: result });
}));
exports.default = router;
