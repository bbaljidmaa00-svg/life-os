/**
 * Creates the Supabase client — only when config.js has a URL and anon key.
 *
 * The supabase-js library is loaded on demand from a CDN, so the app still
 * works offline in session mode. If you later add a bundler (Vite etc.),
 * replace the dynamic import with:  import { createClient } from '@supabase/supabase-js'
 */
import { SUPABASE_URL, SUPABASE_ANON_KEY, TABLES, isSupabaseConfigured } from '../config.js';

const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
let clientPromise = null;

/** Refuse to run with a secret key in the browser. */
function assertPublicKey(key) {
  if (key.startsWith('sb_secret_')) {
    throw new Error('js/config.js-д Supabase-ийн SECRET түлхүүр байна. Үүнийг publishable/anon түлхүүрээр солино уу — secret түлхүүрийг хөтөч рүү хэзээ ч илгээж болохгүй.');
  }
  const parts = key.split('.');
  if (parts.length === 3) {
    let role = null;
    try {
      role = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))).role;
    } catch { /* not a JWT we can read — fine */ }
    if (role === 'service_role') {
      throw new Error('js/config.js-д service_role түлхүүр байна. Оронд нь anon public түлхүүр ашиглана уу — service_role нь Row Level Security-г тойрч гардаг.');
    }
  }
}

export function getSupabase() {
  if (!isSupabaseConfigured()) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = (async () => {
      assertPublicKey(SUPABASE_ANON_KEY.trim());
      const { createClient } = await import(SUPABASE_JS);
      return createClient(SUPABASE_URL.trim(), SUPABASE_ANON_KEY.trim(), {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
    })();
  }
  return clientPromise;
}

/** Used by Settings → "Test connection". Makes one lightweight, real request. */
export async function testConnection() {
  const sb = await getSupabase();
  if (!sb) return { ok: false, message: 'Supabase хараахан тохируулаагүй. js/config.js-д URL болон anon түлхүүрээ оруулна уу.' };
  const { error, count } = await sb.from(TABLES.tasks).select('id', { count: 'exact', head: true });
  if (error) return { ok: false, message: `${TABLES.tasks}: ${error.message}` };
  return { ok: true, message: `Холбогдлоо. "${TABLES.tasks}" хүснэгтэд танд харагдах ${count ?? 0} мөр байна.` };
}
