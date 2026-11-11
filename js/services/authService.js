/**
 * Нэвтрэлт — зөвхөн Supabase Auth.
 *
 * There is deliberately no local or fake login. When Supabase isn't
 * configured, nobody is signed in and the app runs in session mode.
 */
import { getSupabase } from '../lib/supabaseClient.js';
import { isSupabaseConfigured } from '../config.js';

const redirectTo = () => `${location.origin}${location.pathname}`;

async function client() {
  const sb = await getSupabase();
  if (!sb) throw new Error('Supabase тохируулаагүй байна. js/config.js-д төслийн URL болон anon түлхүүрээ оруулна уу.');
  return sb;
}

export const authService = {
  user: null,

  /** Restores an existing session and reloads the app when the user signs in/out. */
  async init() {
    if (!isSupabaseConfigured()) return null;
    const sb = await client();
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    this.user = data.session?.user || null;
    sb.auth.onAuthStateChange((_event, session) => {
      const before = this.user?.id || null;
      const after = session?.user?.id || null;
      this.user = session?.user || null;
      if (before !== after) location.reload();
    });
    return this.user;
  },

  async signIn(email, password) {
    const sb = await client();
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },

  /** Returns true when Supabase requires e-mail confirmation before signing in. */
  async signUp(email, password) {
    const sb = await client();
    const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } });
    if (error) throw error;
    return !data.session;
  },

  async sendMagicLink(email) {
    const sb = await client();
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
    if (error) throw error;
  },

  async signOut() {
    const sb = await client();
    const { error } = await sb.auth.signOut();
    if (error) throw error;
  },

  /** JWT for calling your own endpoints (e.g. the AI Edge Function). */
  async accessToken() {
    if (!isSupabaseConfigured()) return null;
    const sb = await client();
    const { data } = await sb.auth.getSession();
    return data.session?.access_token || null;
  },
};
