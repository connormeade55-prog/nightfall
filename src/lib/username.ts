const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,30}$/;
const SYNTHETIC_EMAIL_DOMAIN = "app.local";

/** Lowercase, email-safe form of a typed username. */
export function normalizeUsername(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._-]/g, "");
}

/** Human-readable reason a normalized username cannot be used, or null when it can. */
export function usernameError(username: string): string | null {
  if (!username) return "Enter a username.";
  if (!USERNAME_PATTERN.test(username))
    return "Use 2-31 characters: letters, numbers, dot, dash or underscore, starting with a letter or number.";
  return null;
}

/**
 * Accounts are username-only, so every auth call uses this deterministic address.
 * It cannot receive mail, which is why email sign-up confirmation is auto-confirmed
 * and password reset by email is not offered.
 */
export function emailForUsername(username: string): string {
  return `${username}@${SYNTHETIC_EMAIL_DOMAIN}`;
}
