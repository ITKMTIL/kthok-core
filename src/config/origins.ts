export const ALLOWED_ORIGINS: (string | RegExp)[] = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(',')
  : ['http://localhost:3000', /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/];
