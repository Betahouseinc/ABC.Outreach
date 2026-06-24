import { supabase } from './supabase';

const BASE = import.meta.env.VITE_API_URL || '';

// Attaches the current Supabase access token to every request.
// Preserves caller-provided headers (e.g. Content-Type for JSON, or none for FormData).
export async function api(path, opts = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  const headers = { ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${BASE}${path}`, { ...opts, headers });
}
