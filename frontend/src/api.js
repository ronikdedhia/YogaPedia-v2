export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';

// Wraps fetch with the Clerk session token attached — used for the auth-protected
// /api/schedule and /api/sessions routes. getToken comes from Clerk's useAuth().
export function makeAuthFetch(getToken) {
  return async function authFetch(path, options = {}) {
    const token = await getToken();
    const headers = { ...(options.headers || {}), Authorization: `Bearer ${token}` };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    return fetch(`${API_BASE}${path}`, { ...options, headers });
  };
}
