export const MAX_UPLOAD_BYTES = 20_000_000;

/** True only when Content-Length is present and within the upload cap. */
export function uploadAllowed(contentLength: string | null | undefined, max = MAX_UPLOAD_BYTES): boolean {
  if (contentLength == null) return false;
  const text = contentLength.trim();
  if (!/^\d+$/.test(text)) return false;
  const value = Number(text);
  return value <= max;
}
