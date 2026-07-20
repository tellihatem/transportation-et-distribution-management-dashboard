/**
 * Auth API Routes — /api/auth/*
 * Shared-password login for the hosted client-review site.
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { asyncHandler, createApiError } from '../middleware/error-handler';
import { setSessionCookie, clearSessionCookie, isAuthenticated } from '../middleware/auth';

const router = Router();

function passwordMatches(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * POST /api/auth/login — body { password }
 */
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const { password } = req.body;
  const expected = process.env.APP_PASSWORD;

  if (!expected) {
    throw createApiError('APP_PASSWORD is not configured on the server', 500, 'AUTH_NOT_CONFIGURED');
  }

  if (typeof password !== 'string' || !passwordMatches(password, expected)) {
    throw createApiError('Incorrect password', 401, 'INVALID_CREDENTIALS');
  }

  setSessionCookie(res);
  res.json({ success: true, data: { authenticated: true } });
}));

/**
 * POST /api/auth/logout
 */
router.post('/logout', (req: Request, res: Response) => {
  clearSessionCookie(res);
  res.json({ success: true, data: { authenticated: false } });
});

/**
 * GET /api/auth/me
 */
router.get('/me', (req: Request, res: Response) => {
  res.json({ success: true, data: { authenticated: isAuthenticated(req) } });
});

export default router;
