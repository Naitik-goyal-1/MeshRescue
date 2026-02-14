
import { createClient } from '@supabase/supabase-js';

// Access environment variables securely
// We safely destructure to avoid crashes if import.meta.env is undefined
const meta = import.meta as any;
const env = meta.env || {};

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;

let client = null;

if (supabaseUrl && supabaseKey) {
  try {
    // Validate URL format to prevent createClient from throwing "Invalid URL"
    // This catches malformed URLs or placeholders before the library attempts to use them
    new URL(supabaseUrl);
    client = createClient(supabaseUrl, supabaseKey);
  } catch (e) {
    console.warn("Supabase configuration invalid or missing. Running in offline-only mode.", e);
    client = null;
  }
}

export const supabase = client;

export const isSupabaseConfigured = () => !!supabase;
