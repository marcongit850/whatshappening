/** Shared response policy. Public pages and the password-protected app use the same sources. */
export const CSP = [
  "default-src 'none'",
  "script-src 'self' https://static.cloudflareinsights.com",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "manifest-src 'self'",
  "connect-src 'self' https://cloudflareinsights.com",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "style-src-attr 'unsafe-inline'",
].join("; ");
