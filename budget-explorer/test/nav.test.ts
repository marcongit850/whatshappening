import { describe, expect, it } from "vitest";
import { siteHeader } from "../src/chrome";

function primary(html: string): string {
  const start = html.indexOf('aria-label="Primary"');
  const end = html.indexOf("</nav>");
  return html.slice(start, end);
}

describe("dashboard Ask AI nav", () => {
  it("places Ask AI last, before Admin and Log out, and highlights it only on the question page", () => {
    const overview = siteHeader({ mode: "dashboard", active: "overview", reportHref: "/report", csrf: "tok", admin: true });
    const nav = primary(overview);
    expect(nav).toContain('href="/ask">Ask AI</a>');
    expect(nav).not.toContain('class="on" href="/ask"');
    expect(nav.indexOf('href="/about">About</a>')).toBeLessThan(nav.indexOf('href="/ask">Ask AI</a>'));
    expect(nav.indexOf('href="/ask">Ask AI</a>')).toBeLessThan(nav.indexOf('href="/admin">Admin</a>'));
    expect(nav.indexOf('href="/admin">Admin</a>')).toBeLessThan(nav.indexOf(">Log out<"));
    expect(overview).not.toMatch(/\u2014|\u2013/);

    const current = siteHeader({ mode: "dashboard", active: "ask", reportHref: "/report", csrf: "tok" });
    const askNav = primary(current);
    expect(askNav).toContain('class="on" href="/ask">Ask AI</a>');
    expect(askNav).not.toContain(">Admin<");
    expect(askNav.indexOf('class="on" href="/ask">Ask AI</a>')).toBeLessThan(askNav.indexOf(">Log out<"));
  });

  it("leaves Ask AI off the public header", () => {
    const pub = siteHeader({ mode: "public", active: "home", reportHref: "/report" });
    expect(pub).toContain(">Home<");
    expect(pub).toContain(">Request your county<");
    expect(pub).not.toContain("Ask AI");
    expect(pub).not.toContain('href="/ask"');
    expect(pub).not.toContain(">Log out<");
  });
});
