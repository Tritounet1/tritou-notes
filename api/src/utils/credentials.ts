// Shared input rules for accounts (admin creation, invitation, first admin, password change).

/** 8 characters minimum; bcrypt silently ignores what lies beyond 72 bytes. */
export const validPassword = (password: unknown): password is string =>
  typeof password === "string" && password.length >= 8 && Buffer.byteLength(password, "utf8") <= 72;

export const PASSWORD_RULE = "Le mot de passe doit contenir au moins 8 caractères et au maximum 72 octets.";

export const validUsername = (username: unknown): username is string =>
  typeof username === "string" && username.trim().length > 0 && username.trim().length <= 50;

export const validEmail = (email: unknown): email is string =>
  typeof email === "string" && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
