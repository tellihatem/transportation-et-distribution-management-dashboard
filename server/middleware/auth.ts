/**
 * Shared-password auth gate — protects /api/* for the hosted client-review site.
 * Single trusted user (the client), not multi-user/RBAC.
 */

import { Request, Response, NextFunction } from 'express';

const SESSION_COOKIE = 'session';
const SESSION_VALUE = 'ok';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.signedCookies?.[SESSION_COOKIE] === SESSION_VALUE) {
    next();
    return;
  }
  res.status(401).json({
    success: false,
    error: { message: 'Authentication required', code: 'UNAUTHENTICATED' },
  });
}

export function setSessionCookie(res: Response): void {
  res.cookie(SESSION_COOKIE, SESSION_VALUE, {
    httpOnly: true,
    signed: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE);
}

export function isAuthenticated(req: Request): boolean {
  return req.signedCookies?.[SESSION_COOKIE] === SESSION_VALUE;
}
