"use strict";
/**
 * Auth API Routes — /api/auth/*
 * Shared-password login for the hosted client-review site.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const error_handler_1 = require("../middleware/error-handler");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
function passwordMatches(candidate, expected) {
    const a = Buffer.from(candidate);
    const b = Buffer.from(expected);
    if (a.length !== b.length)
        return false;
    return crypto_1.default.timingSafeEqual(a, b);
}
/**
 * POST /api/auth/login — body { password }
 */
router.post('/login', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const { password } = req.body;
    const expected = process.env.APP_PASSWORD;
    if (!expected) {
        throw (0, error_handler_1.createApiError)('APP_PASSWORD is not configured on the server', 500, 'AUTH_NOT_CONFIGURED');
    }
    if (typeof password !== 'string' || !passwordMatches(password, expected)) {
        throw (0, error_handler_1.createApiError)('Incorrect password', 401, 'INVALID_CREDENTIALS');
    }
    (0, auth_1.setSessionCookie)(res);
    res.json({ success: true, data: { authenticated: true } });
}));
/**
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
    (0, auth_1.clearSessionCookie)(res);
    res.json({ success: true, data: { authenticated: false } });
});
/**
 * GET /api/auth/me
 */
router.get('/me', (req, res) => {
    res.json({ success: true, data: { authenticated: (0, auth_1.isAuthenticated)(req) } });
});
exports.default = router;
