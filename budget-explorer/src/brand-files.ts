import apple from "../assets/apple-touch-icon.v1.png";
import favicon from "../assets/favicon-32.v1.png";
import icon192 from "../assets/icon-192.v1.png";
import icon512 from "../assets/icon-512.v1.png";
import logoDark from "../assets/logo-full-dark.v1.png";
import logoLight from "../assets/logo-full-light.v1.png";
import logoIcon from "../assets/logo-icon.v1.png";
import { APPLE_TOUCH, FAVICON_PNG, ICON_192, ICON_512, LOGO_DARK, LOGO_ICON, LOGO_LIGHT } from "./chrome";

/** Wrangler Data modules are ArrayBuffers. The test loader returns a Uint8Array. */
export function brandBody(data: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  }
  return data;
}

export const BRAND_ASSETS: Record<string, ArrayBuffer | Uint8Array> = {
  [LOGO_LIGHT]: logoLight,
  [LOGO_DARK]: logoDark,
  [LOGO_ICON]: logoIcon,
  [FAVICON_PNG]: favicon,
  [APPLE_TOUCH]: apple,
  [ICON_192]: icon192,
  [ICON_512]: icon512,
};
