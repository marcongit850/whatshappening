export const CSS = `
:root {
  --ink: #101820;
  --navy: #13283a;
  --navy-deep: #0c1924;
  --gold: #8d7344;
  --gold-soft: #c6aa72;
  --teal: #1c5f5b;
  --paper: #f3f0e8;
  --paper-deep: #e7e1d6;
  --card: #fcfbf8;
  --line: rgba(16, 24, 32, 0.1);
  --text: #1a2330;
  --muted: #5c6976;
  --good: #1b6542;
  --good-bg: #e8f3ec;
  --warn: #8a5b12;
  --warn-bg: #f8f1de;
  --bad: #8c3030;
  --bad-bg: #f8e9e6;
  --gray: #5d6974;
  --gray-bg: #eef1f3;
  --shadow: 0 1px 1px rgba(16, 24, 32, 0.04), 0 18px 40px rgba(16, 24, 32, 0.05);
  --serif: "Fraunces", "Iowan Old Style", Palatino, "Palatino Linotype", serif;
  --sans: "IBM Plex Sans", "Segoe UI", Helvetica, Arial, sans-serif;
  --space: 8px;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  background:
    radial-gradient(1200px 480px at 10% -10%, rgba(198, 170, 114, 0.16), transparent 55%),
    var(--paper);
  color: var(--text);
  font-family: var(--sans);
  font-size: 17px;
  line-height: 1.5;
  font-variant-numeric: tabular-nums lining-nums;
}
a { color: var(--teal); text-decoration-thickness: 1px; text-underline-offset: 3px; }
a:hover { color: var(--navy); }
button, input, select { font: inherit; color: inherit; }
:focus-visible { outline: 2px solid var(--teal); outline-offset: 3px; }
.private-strip {
  background: var(--navy-deep);
  color: #d5dbe2;
  text-align: center;
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  padding: 8px 16px;
}
.banner { background: #f7f1e4; border-bottom: 1px solid #e3d5b8; }
.banner-inner {
  max-width: 1180px;
  margin: 0 auto;
  padding: 14px 28px;
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.banner-mark { width: 3px; align-self: stretch; background: var(--gold); border-radius: 2px; flex: none; }
.banner p { margin: 0; color: #3d3426; font-size: 15px; font-weight: 500; }
.site-header { background: var(--navy); color: #fff; }
.header-inner {
  max-width: 1180px;
  margin: 0 auto;
  padding: 22px 28px 10px;
}
.header-top { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; }
.brand { color: #fff; text-decoration: none; }
.brand:hover { color: #fff; }
.brand-kicker {
  display: block;
  color: var(--gold-soft);
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  font-weight: 600;
}
.brand-name { display: block; font-family: var(--serif); font-size: 32px; font-weight: 560; letter-spacing: -0.03em; line-height: 1.05; margin-top: 4px; }
.brand-sub { display: block; color: #c5d0da; font-size: 13px; margin-top: 6px; }
.nav-toggle { position: absolute; opacity: 0; pointer-events: none; }
.nav-btn { display: none; }
nav {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 22px;
  justify-content: flex-start;
  margin-top: 16px;
  padding: 8px 0 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}
nav a, nav button.linkish {
  color: #d5e0ea;
  text-decoration: none;
  background: none;
  border: 0;
  padding: 8px 0;
  font-size: 15px;
  cursor: pointer;
}
nav a.on { color: #fff; box-shadow: inset 0 -2px 0 var(--gold-soft); }
nav a:hover, nav button.linkish:hover { color: #fff; }
main { max-width: 1180px; margin: 0 auto; padding: 36px 28px 64px; }
h1 { font-family: var(--serif); font-weight: 560; font-size: clamp(34px, 5vw, 48px); letter-spacing: -0.03em; line-height: 1.08; margin: 0 0 8px; }
h2 { font-family: var(--serif); font-weight: 560; font-size: 28px; letter-spacing: -0.02em; margin: 0 0 6px; }
.lede { color: var(--muted); margin: 0 0 28px; max-width: 68ch; }
.crumb { color: var(--muted); font-size: 14px; margin-bottom: 10px; }
.crumb a { color: var(--muted); }
.metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 22px; }
.metric, .panel, .login-card, .answer {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 18px;
  box-shadow: var(--shadow);
}
.metric { padding: 18px 18px 16px; position: relative; overflow: hidden; }
.metric::before { content: ""; position: absolute; left: 18px; right: 18px; top: 0; height: 2px; background: linear-gradient(90deg, var(--gold), transparent); }
.metric-label { margin: 8px 0 0; color: var(--muted); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; }
.metric-value { margin: 6px 0 0; font-weight: 560; font-size: clamp(26px, 2.2vw, 34px); letter-spacing: -0.03em; line-height: 1.1; font-variant-numeric: tabular-nums lining-nums; }
.metric-note { margin: 8px 0 0; color: var(--muted); font-size: 14px; }
.panel { padding: 22px 22px 18px; margin-bottom: 18px; }
.hint { color: var(--muted); margin: 0 0 16px; font-size: 15px; }
.table-wrap { overflow: auto; border-top: 1px solid var(--line); margin: 0 -6px; }
table { width: 100%; border-collapse: collapse; min-width: 760px; }
th { text-align: left; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); font-weight: 600; padding: 12px 10px; border-bottom: 1px solid var(--line); position: sticky; top: 0; background: var(--card); }
td { padding: 13px 10px; border-bottom: 1px solid rgba(16, 24, 32, 0.06); vertical-align: middle; }
tbody tr:nth-child(even) td { background: #faf8f4; }
tbody tr:hover td { background: #f3efe6; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums lining-nums; }
.name { font-weight: 600; }
.code, .mono { font-variant-numeric: tabular-nums; color: var(--muted); font-size: 13px; }
.tag {
  display: inline-block;
  margin-left: 8px;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--gray-bg);
  color: var(--gray);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 600;
}
.pill { display: inline-flex; align-items: center; min-height: 26px; padding: 0 10px; border-radius: 999px; font-size: 12px; font-weight: 600; letter-spacing: 0.02em; }
.pill.green { background: var(--good-bg); color: var(--good); }
.pill.yellow { background: var(--warn-bg); color: var(--warn); }
.pill.red { background: var(--bad-bg); color: var(--bad); }
.pill.gray { background: var(--gray-bg); color: var(--gray); }
.bar { position: relative; height: 8px; background: #e6e1d8; border-radius: 999px; min-width: 140px; }
.bar-spent, .bar-enc, .bar-mark { position: absolute; top: 0; bottom: 0; }
.bar-spent { left: 0; border-radius: 999px; }
.bar-spent.green { background: #2f8f62; }
.bar-spent.yellow { background: #c4923a; }
.bar-spent.red { background: #b55252; }
.bar-spent.gray { background: #9aa6b0; }
.bar-enc { background: repeating-linear-gradient(135deg, rgba(16,24,32,0.45) 0 2px, transparent 2px 5px); }
.bar-mark { width: 1px; background: var(--ink); top: -4px; bottom: -4px; }
.split { display: grid; grid-template-columns: 1.6fr 0.9fr; gap: 18px; }
.note { background: #f4f7f6; border: 1px solid #d5e3df; border-radius: 12px; padding: 12px 14px; color: #243833; font-size: 14px; }
.filters { display: grid; grid-template-columns: 1.6fr 1fr 1fr 0.8fr 0.9fr 0.9fr auto; gap: 12px; align-items: end; }
label { display: block; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; }
input[type="text"], input[type="password"], input[type="date"], input[type="number"], input[type="search"], select, textarea {
  width: 100%;
  background: #fff;
  border: 1px solid #d5d0c6;
  border-radius: 12px;
  padding: 12px 14px;
  min-height: 48px;
}
textarea { min-height: 92px; resize: vertical; }
input:hover, select:hover, textarea:hover { border-color: #b7b1a6; }
.btn, button.btn {
  background: var(--navy);
  color: #fff;
  border: 0;
  border-radius: 12px;
  min-height: 48px;
  padding: 12px 20px;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.btn:hover { background: #1c3b54; color: #fff; }
.btn.secondary { background: transparent; color: var(--navy); border: 1px solid #cfc6b6; }
.btn.secondary:hover { background: #fff; }
.btn.gold { background: var(--gold); }
.btn.gold:hover { background: #745e34; }
.pager { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 14px; font-size: 14px; }
.pager a { text-decoration: none; font-weight: 600; }
.login-wrap { min-height: calc(100vh - 180px); display: grid; place-items: center; padding: 24px 16px 48px; }
.login-card { width: min(460px, 100%); padding: 36px 32px 28px; }
.login-card h1 { font-size: 40px; }
.stack { display: grid; gap: 14px; }
.drop {
  border: 1px dashed #c8bfae;
  border-radius: 16px;
  padding: 28px;
  background: #fbfaf6;
  text-align: center;
}
.drop strong { font-family: var(--serif); font-size: 24px; font-weight: 560; display: block; margin-bottom: 6px; }
.answer { padding: 22px; border-left: 3px solid var(--teal); }
.answer p { margin-top: 0; }
.warning { background: var(--warn-bg); color: #5c3d0a; border-radius: 12px; padding: 12px 14px; font-size: 14px; }
.empty { padding: 28px 8px; color: var(--muted); }
.footer { border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; }
.footer-inner { max-width: 1180px; margin: 0 auto; padding: 22px 28px 36px; }
.legend { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; }
.donut-row { display: flex; gap: 22px; align-items: center; flex-wrap: wrap; }
.icon { width: 18px; height: 18px; vertical-align: -3px; margin-right: 6px; }
.caption { color: var(--muted); margin: 6px 0 0; font-size: 15px; }
.what { margin: 8px 0 12px; }
.what summary { cursor: pointer; color: var(--teal); font-size: 14px; }
.what p { margin: 8px 0 0; max-width: 68ch; }
.explainer { background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: 16px 18px; margin: 14px 0 18px; }
.explainer summary { cursor: pointer; font-family: var(--serif); font-size: 24px; font-weight: 560; }
.explainer p { max-width: 68ch; }
.flow { display: flex; gap: 12px; align-items: center; margin: 12px 0; flex-wrap: wrap; }
.flow-pot { background: #f4f7f6; border: 1px solid #d5e3df; border-radius: 12px; padding: 10px 14px; font-weight: 600; }
.flow-move { color: var(--muted); font-size: 14px; }
.steps { margin: 8px 0 0; padding-left: 18px; max-width: 68ch; }
.fund-list { display: grid; gap: 4px; }
.fund-row { display: grid; grid-template-columns: minmax(160px, 1.1fr) minmax(140px, 1.4fr) auto; gap: 12px; align-items: center; text-decoration: none; color: inherit; padding: 8px 0; border-bottom: 1px solid rgba(16, 24, 32, 0.06); }
.fund-row:hover { color: var(--navy); }
.compare { position: relative; height: 14px; background: #e6e1d8; border-radius: 999px; min-width: 80px; }
.compare-spent { position: absolute; left: 0; top: 0; bottom: 0; background: #1c5f5b; border-radius: 999px; }
.compare-spent.over { background: #b55252; }
.compare-mark { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--ink); }
.budget-hero .compare { height: 18px; margin: 10px 0 4px; }
.transfer-row { margin-top: 14px; padding: 12px 14px; background: #f7f1e4; border-radius: 12px; }
.cat-row, .vendor-bars li { display: grid; grid-template-columns: minmax(140px, 1fr) minmax(120px, 1.3fr) auto; gap: 12px; align-items: center; margin: 8px 0; }
.vendor-bars { list-style: none; margin: 0; padding: 0; }
.vendor-track { display: block; height: 12px; background: #e6e1d8; border-radius: 999px; overflow: hidden; }
.vendor-fill { display: block; height: 100%; background: #1c5f5b; border-radius: 999px; }
.swatch { display: inline-block; width: 10px; height: 10px; border-radius: 99px; margin-right: 6px; }
.standout-list { margin: 8px 0 0; padding-left: 18px; }
.standout-list li { margin: 0 0 10px; }
.month-readout { display: none; list-style: none; margin: 10px 0 0; padding: 0; gap: 6px 16px; }
.month-readout li { display: flex; justify-content: space-between; gap: 8px; }
.pill.none { background: var(--gray-bg); color: var(--gray); }
.split { align-items: start; }
.split .panel { margin-bottom: 0; }
.panel, main, .table-wrap, .nav-scroller { min-width: 0; max-width: 100%; }
svg.chart { display: block; }
.scroll-hint { display: none; margin: 0 0 8px; color: var(--muted); font-size: 13px; }
nav a, nav button.linkish { white-space: nowrap; }
@media (max-width: 980px) {
  .metrics, .split, .filters { grid-template-columns: 1fr 1fr; }
  .filters { grid-template-columns: 1fr 1fr; }
  .header-top { align-items: flex-start; }
}
@media (max-width: 760px) {
  .nav-btn { display: none; }
  .nav-scroller { position: relative; }
  .nav-scroller::after {
    content: "";
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 28px;
    pointer-events: none;
    background: linear-gradient(90deg, rgba(19, 40, 58, 0), var(--navy));
  }
  nav {
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    width: 100%;
    overflow-x: auto;
    gap: 6px 18px;
    padding-bottom: 8px;
    scrollbar-width: thin;
  }
  nav a, nav button.linkish { flex: none; }
  .header-top { flex-wrap: wrap; }
  .metrics, .split, .filters { grid-template-columns: 1fr; }
  main, .banner-inner, .header-inner, .footer-inner { padding-left: 16px; padding-right: 16px; }
  .brand-name { font-size: 28px; }
  table { min-width: 680px; }
  table.stack-cards { min-width: 0; }
  table.stack-cards thead { display: none; }
  table.stack-cards, table.stack-cards tbody, table.stack-cards tr, table.stack-cards td { display: block; width: auto; }
  table.stack-cards tr { border: 1px solid var(--line); border-radius: 14px; margin: 0 0 12px; padding: 8px 12px; background: #fff; }
  table.stack-cards td { display: flex; justify-content: space-between; gap: 12px; border: 0; padding: 7px 0; }
  table.stack-cards td::before { content: attr(data-label); color: var(--muted); font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; }
  .panel:has(table.stack-cards) .scroll-hint { display: none; }
  .scroll-hint { display: block; }
  .month-readout { display: grid; grid-template-columns: 1fr 1fr; }
  .point-label { display: none; }
  .fund-row, .cat-row, .vendor-bars li { grid-template-columns: 1fr; }
  .donut-row { flex-direction: column; align-items: flex-start; }
  .nav-scroller.scrolled-end::after { display: none; }
}
`;

export const CLIENT_JS = `
(() => {
  const form = document.querySelector("[data-busy]");
  if (form) {
    form.addEventListener("submit", () => {
      const button = form.querySelector("button[type=submit]");
      if (button) {
        button.setAttribute("aria-busy", "true");
        button.textContent = "Working";
      }
    });
  }
  const scroller = document.querySelector(".nav-scroller");
  const nav = scroller ? scroller.querySelector("nav") : null;
  if (scroller && nav) {
    const update = () => {
      const more = nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 8;
      scroller.classList.toggle("scrolled-end", !more);
    };
    nav.addEventListener("scroll", update, { passive: true });
    update();
  }
})();
`;
