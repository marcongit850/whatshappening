export interface AppEnv {
  DB: D1Database;
  AI: Ai;
  SITE_PASSWORD?: string;
  SESSION_SECRET?: string;
  ADMIN_PASSWORD?: string;
  PUBLIC_BASE_URL?: string;
}

export function adminPasswordSet(env: AppEnv): boolean {
  return Boolean(env.ADMIN_PASSWORD && env.ADMIN_PASSWORD.trim());
}

export function publicBase(env: AppEnv): string {
  const value = (env.PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(value)) return "";
  return value;
}
