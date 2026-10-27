const CONTROL = /[\u0000-\u001F\u007F]/;

function decodedForms(value: string): string[] | null {
  const forms = [value];
  let current = value;
  for (let pass = 0; pass < 3; pass += 1) {
    if (!/%[0-9a-fA-F]{2}/.test(current)) break;
    let next: string;
    try {
      next = decodeURIComponent(current);
    } catch {
      return null;
    }
    if (next === current) break;
    forms.push(next);
    current = next;
  }
  return forms;
}

function protocolRelative(value: string): boolean {
  return CONTROL.test(value) || value.includes("\\") || value.startsWith("//") || value.startsWith("\\");
}

/** True when a request path, or a decoding of it, would be a scheme-relative or protocol-relative URL. */
export function unsafeRequestPath(pathname: string): boolean {
  if (typeof pathname !== "string" || pathname.length === 0 || pathname.length > 2048) return true;
  const forms = decodedForms(pathname);
  if (!forms) return true;
  return forms.some(protocolRelative);
}

function collapsePath(pathname: string): string | null {
  const forms = decodedForms(pathname);
  if (!forms) return null;
  const decoded = forms[forms.length - 1];
  if (!decoded || CONTROL.test(decoded)) return null;
  if (!decoded.startsWith("/") && !decoded.startsWith("\\")) return null;
  const rest = decoded.replace(/^[/\\]+/, "").replace(/\\/g, "/");
  if (!rest || rest.startsWith("/") || rest.startsWith("\\")) return null;
  const collapsed = `/${rest}`;
  if (unsafeRequestPath(collapsed)) return null;
  return collapsed;
}

function queryUnsafe(query: string): boolean {
  const forms = decodedForms(query);
  if (!forms) return true;
  return forms.some((form) => CONTROL.test(form) || form.includes("\\"));
}

/**
 * A same-origin Location. Leading slashes and backslashes collapse to one slash
 * so the header cannot be scheme-relative or protocol-relative.
 */
export function safeRedirectLocation(location: string): string {
  if (typeof location !== "string") return "/";
  const trimmed = location.trim();
  if (!trimmed || trimmed.length > 2048 || CONTROL.test(trimmed)) return "/";
  const queryAt = trimmed.indexOf("?");
  const rawPath = queryAt >= 0 ? trimmed.slice(0, queryAt) : trimmed;
  const query = queryAt >= 0 ? trimmed.slice(queryAt) : "";
  const safeQuery = query && !queryUnsafe(query) ? query : "";
  if (rawPath.startsWith("/") && !rawPath.startsWith("//") && !unsafeRequestPath(rawPath)) {
    return `${rawPath}${safeQuery}`;
  }
  const collapsed = collapsePath(rawPath);
  if (!collapsed) return "/";
  return `${collapsed}${safeQuery}`;
}
