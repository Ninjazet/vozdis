export const USERNAME_REGEX = /^[a-z0-9_-]{3,20}$/;

export function normalizeUsername(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function isValidUsername(username) {
  return typeof username === 'string' && USERNAME_REGEX.test(username);
}

export function isValidPassword(password, min = 8, max = 128) {
  return typeof password === 'string' && password.length >= min && password.length <= max;
}

