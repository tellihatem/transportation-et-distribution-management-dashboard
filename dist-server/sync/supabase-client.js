"use strict";
/**
 * Supabase Client Initialization
 * Connects to Supabase using service role key for full write access.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSupabaseClient = getSupabaseClient;
exports.checkSupabaseConnection = checkSupabaseConnection;
const supabase_js_1 = require("@supabase/supabase-js");
let supabaseClient = null;
let isConfigured = false;
/**
 * Initialize the Supabase client from environment variables.
 * Returns null if credentials are not configured (offline-only mode).
 */
function getSupabaseClient() {
    if (supabaseClient)
        return supabaseClient;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key || url === 'https://your-project.supabase.co' || key === 'your-service-role-key') {
        if (!isConfigured) {
            console.log('[SUPABASE] ⚠️  Supabase credentials not configured. Running in offline-only mode.');
            console.log('[SUPABASE]    Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env to enable cloud sync.');
            isConfigured = true;
        }
        return null;
    }
    supabaseClient = (0, supabase_js_1.createClient)(url, key, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
    console.log('[SUPABASE] ✅ Client initialized successfully.');
    isConfigured = true;
    return supabaseClient;
}
/**
 * Check if Supabase is reachable
 */
async function checkSupabaseConnection() {
    const client = getSupabaseClient();
    if (!client)
        return false;
    try {
        // Simple health check — try to query a table
        const { error } = await client.from('client_trips').select('id').limit(1);
        return !error;
    }
    catch {
        return false;
    }
}
