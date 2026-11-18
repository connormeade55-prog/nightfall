export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;
export const PASSWORD_HINT = `At least ${PASSWORD_MIN} characters, with a letter and a number.`;

/** Reason a new password is not allowed, or null when it is. Existing sign-ins are not re-checked. */
export function passwordError(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Passwords need at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Passwords can be at most ${PASSWORD_MAX} characters.`;
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password))
    return "Passwords need at least one letter and one number.";
  return null;
}
