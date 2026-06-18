"use strict";
/**
 * Centralized Express error handling middleware
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
exports.createApiError = createApiError;
exports.asyncHandler = asyncHandler;
function errorHandler(err, _req, res, _next) {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal server error';
    console.error(`[ERROR] ${statusCode} — ${message}`, err.stack ? `\n${err.stack}` : '');
    res.status(statusCode).json({
        success: false,
        error: {
            message,
            code: err.code || 'INTERNAL_ERROR',
        },
    });
}
/**
 * Helper to create typed API errors
 */
function createApiError(message, statusCode, code) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
}
/**
 * Async route wrapper — catches async errors and forwards to error handler
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
