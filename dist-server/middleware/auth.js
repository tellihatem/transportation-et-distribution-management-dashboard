"use strict";
/**
 * Shared-password auth gate — protects /api/* for the hosted client-review site.
 * Single trusted user (the client), not multi-user/RBAC.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.setSessionCookie = setSessionCookie;
exports.clearSessionCookie = clearSessionCookie;
exports.isAuthenticated = isAuthenticated;
const SESSION_COOKIE = 'session';
const SESSION_VALUE = 'ok';
function requireAuth(req, res, next) {
    if (req.signedCookies?.[SESSION_COOKIE] === SESSION_VALUE) {
        next();
        return;
    }
    res.status(401).json({
        success: false,
        error: { message: 'Authentication required', code: 'UNAUTHENTICATED' },
    });
}
function setSessionCookie(res) {
    res.cookie(SESSION_COOKIE, SESSION_VALUE, {
        httpOnly: true,
        signed: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
}
function clearSessionCookie(res) {
    res.clearCookie(SESSION_COOKIE);
}
function isAuthenticated(req) {
    return req.signedCookies?.[SESSION_COOKIE] === SESSION_VALUE;
}
