/** Drop C0 controls other than tab, line feed, and carriage return. A NUL truncates sqlite3 .read. */
export function stripC0Controls(value: string): string {
  let dirty = false;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      dirty = true;
      break;
    }
  }
  if (!dirty) return value;
  let out = "";
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) continue;
    out += value[i];
  }
  return out;
}
