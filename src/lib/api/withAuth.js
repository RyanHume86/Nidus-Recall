let _authenticated = false

/** Called by AuthProvider whenever isAuthenticated changes. */
export function setAuthState(isAuthenticated) {
  _authenticated = !!isAuthenticated
}

/**
 * Throws if the current session is not authenticated.
 * Call this before any Base44 entity write to prevent anonymous writes
 * that would land with created_by = "anonymous" instead of the user's email.
 */
export function requireAuth(label = 'write') {
  if (!_authenticated) {
    const err = new Error(`[Nidus] Not signed in — cannot ${label}. Please log in to save data.`)
    err.code = 'AUTH_REQUIRED'
    throw err
  }
}
