"use strict";
/**
 * Build identity — which build of the app is actually running.
 *
 * Written by scripts/write-dist-server-package.cjs at build time into
 * dist-server/build-info.json, which ships inside the asar. Exists so that a
 * running installation can state its own version: without it there is no way
 * to tell a current install from a months-old one, which is how stale builds
 * went unnoticed on a client machine.
 *
 * Read with fs rather than importing ../package.json on purpose: importing a
 * file outside server/ would pull it into the TypeScript rootDir and change
 * the emit layout to dist-server/server/*, breaking the __dirname-relative
 * lookups for migrations/ and ../dist in database.ts and index.ts.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BUILD_DIRTY = exports.GIT_COMMIT = exports.BUILD_TIME = exports.BUILD_ID = exports.APP_VERSION = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function readBuildInfo() {
    // Absent when running from source via tsx (npm run dev:server).
    const fallback = {
        version: 'dev',
        buildId: 'dev',
        buildTime: null,
        gitCommit: null,
        dirty: false,
    };
    try {
        const raw = fs_1.default.readFileSync(path_1.default.join(__dirname, 'build-info.json'), 'utf-8');
        return { ...fallback, ...JSON.parse(raw) };
    }
    catch {
        return fallback;
    }
}
const info = readBuildInfo();
/**
 * The installed app version. Electron sets APP_VERSION from app.getVersion(),
 * which is authoritative for what was actually installed — prefer it over the
 * value baked in at build time.
 */
exports.APP_VERSION = process.env.APP_VERSION || info.version;
exports.BUILD_ID = info.buildId;
exports.BUILD_TIME = info.buildTime;
exports.GIT_COMMIT = info.gitCommit;
exports.BUILD_DIRTY = info.dirty;
