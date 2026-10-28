export const CSS = `
:root {
  --ink: #14232f;
  --navy: #14232f;
  --navy-deep: #0e1a23;
  --gold: #b78a2d;
  --gold-soft: #c9a24b;
  --teal: #17505c;
  --teal2: #2f7d8c;
  --teal3: #a9cdd3;
  --paper: #f6f4ee;
  --paper-deep: #efece2;
  --card: #fff;
  --line: #e3dfd3;
  --text: #14232f;
  --muted: #4d5d6a;
  --g: #2f7a55;
  --y: #b9821b;
  --r: #ab3a36;
  --good: #1b6542;
  --good-bg: #e8f3ec;
  --warn: #8a5b12;
  --warn-bg: #f8f1de;
  --bad: #8c3030;
  --bad-bg: #f8e9e6;
  --gray: #5d6974;
  --gray-bg: #eef1f3;
  --shadow: 0 1px 1px rgba(16, 24, 32, 0.04), 0 18px 40px rgba(16, 24, 32, 0.05);
  --serif: Inter, "Segoe UI", system-ui, -apple-system, Helvetica, Arial, sans-serif;
  --sans: Inter, "Segoe UI", system-ui, -apple-system, Helvetica, Arial, sans-serif;
  --space: 8px;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; overflow-x: clip; }
body {
  margin: 0;
  overflow-x: clip;
  max-width: 100%;
  background: var(--paper);
  color: var(--text);
  font-family: var(--sans);
  font-size: 17px;
  line-height: 1.5;
  font-variant-numeric: tabular-nums lining-nums;
}
a { color: var(--teal); text-decoration-thickness: 1px; text-underline-offset: 3px; }
a:hover { color: var(--navy); }
button, input, select { font: inherit; color: inherit; }
input[type="radio"], input[type="checkbox"] { accent-color: #b78a2d; }
:focus-visible { outline: 2px solid var(--teal); outline-offset: 3px; }
.private-strip {
  background: var(--navy-deep);
  color: #d5dbe2;
  text-align: center;
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  padding: 8px 16px;
  overflow: hidden;
}
.banner { background: #efe7d0; border-bottom: 1px solid #dccfa6; text-align: center; }
.banner-inner {
  max-width: 1240px;
  margin: 0 auto;
  padding: 11px 24px;
}
.banner-mark { display: none; }
.banner p { margin: 0; color: #4a3b10; font-size: 15px; font-weight: 500; }
.site-header { background: #fff; color: var(--ink); border-bottom: 1px solid var(--line); }
.header-inner {
  max-width: 1240px;
  margin: 0 auto;
  padding: 0 40px;
  min-height: 84px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-width: 0;
}
.nav-scroller { flex: 1; min-width: 0; overflow-x: auto; }
.header-top { display: flex; align-items: center; }
.brand { color: var(--teal); text-decoration: none; }
.brand:hover { color: var(--teal); }
.brand-kicker {
  display: block;
  color: var(--muted);
  font-size: 13px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-weight: 600;
}
.brand-name { display: block; font-family: var(--serif); font-size: 28px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.1; color: var(--teal); }
.brand-sub { display: block; color: var(--muted); font-size: 13px; margin-top: 3px; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 500; }
.nav-toggle { position: absolute; opacity: 0; pointer-events: none; }
.nav-btn { display: none; }
nav {
  display: flex;
  flex-wrap: nowrap;
  gap: 4px 22px;
  align-items: center;
  margin: 0;
  padding: 0;
  border: 0;
  overflow-x: auto;
}
nav a, nav button.linkish {
  color: var(--muted);
  text-decoration: none;
  background: none;
  border: 0;
  padding: 28px 0;
  font-size: 17px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}
@media (min-width: 761px) {
  .header-inner { align-items: flex-start; padding-top: 12px; padding-bottom: 8px; }
  .nav-scroller { overflow: visible; }
  nav { flex-wrap: wrap; justify-content: flex-end; column-gap: 14px; row-gap: 0; overflow: visible; }
  nav a, nav button.linkish { padding: 12px 0 10px; font-size: 15px; }
}
nav a.on { color: var(--ink); box-shadow: inset 0 -3px 0 var(--gold); }
nav a:hover, nav button.linkish:hover { color: var(--ink); }
main { max-width: 1240px; margin: 0 auto; padding: 36px 40px 48px; }
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
.metric { padding: 18px 18px 16px; position: relative; overflow: visible; }
.metric::before { content: ""; position: absolute; left: 18px; right: 18px; top: 0; height: 2px; background: linear-gradient(90deg, var(--gold), transparent); }
.metric-label { margin: 8px 0 0; color: var(--muted); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; }
.metric-value { margin: 6px 0 0; font-weight: 560; font-size: clamp(26px, 2.2vw, 34px); letter-spacing: -0.03em; line-height: 1.1; font-variant-numeric: tabular-nums lining-nums; overflow-wrap: anywhere; }
.metric-value a { color: inherit; text-decoration: none; }
.metric-note { margin: 8px 0 0; color: var(--muted); font-size: 14px; }
.panel { padding: 22px 22px 18px; margin-bottom: 18px; }
.about-source { margin-top: 20px; }
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
.pill.gray, .pill.none { background: var(--gray-bg); color: var(--gray); }
.pill.under { background: #e7eef2; color: #1d4e63; }
.bar-spent.under { background: var(--teal2); }
.metric-value.metric-text { font-family: var(--sans); font-size: 22px; line-height: 1.3; font-weight: 600; }
.transfer-row { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding: 12px 0; border-top: 1px solid var(--line); }
.transfer-row span { margin-right: 12px; }
.table-hint { display: none; }
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
.filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(170px, 100%), 1fr)); gap: 12px; align-items: end; }
label { display: block; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; }
input[type="text"], input[type="email"], input[type="password"], input[type="date"], input[type="number"], input[type="search"], select, textarea {
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
.footer { color: var(--muted); font-size: 14.5px; }
.footer-inner { max-width: 1240px; margin: 0 auto; padding: 12px 40px 56px; border-top: 1px solid var(--line); }
.footer-report { margin: 0 0 12px; }
.footer-book { font-size: 18px; margin: 0 0 12px; }
.footer-book a { font-weight: 650; color: var(--navy); }
.footer-report a { font-size: 20px; font-weight: 650; color: var(--navy); }
.legend { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; }
.donut-row { display: flex; gap: 22px; align-items: center; }
.icon { width: 18px; height: 18px; vertical-align: -3px; margin-right: 6px; }
.ask-hero h2 { font-size: 32px; }
.pay-find, .paid-list { margin-bottom: 22px; }
.pay-find h2 { font-size: clamp(32px, 4vw, 44px); }
.pay-find .btn, .sort-row .btn { min-height: 56px; font-size: 18px; padding: 14px 22px; }
.sort-row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
.paid-list .vv { font-family: var(--serif); font-size: clamp(22px, 3vw, 32px); line-height: 1.1; text-align: right; overflow-wrap: anywhere; }
.paid-list a.vrow { padding: 14px 0; }
.paid-list > .btn { margin-top: 16px; }
.row-cap { display: block; font-family: var(--sans); font-size: 14px; font-weight: 500; color: var(--muted); }
.book-link { font-size: 18px; margin: 10px 0 0; }
.book-link a { font-weight: 650; }
.book-caption { color: var(--muted); font-size: 16px; margin: 4px 0 12px; }
.ask-row { display: flex; gap: 12px; align-items: flex-end; }
.ask-row input { flex: 1; min-height: 56px; font-size: 18px; }
.ask-hero .cap { color: var(--muted); margin: 0 0 16px; }
.examples { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
.examples form { margin: 0; }
.examples .example {
  background: #f3f1ea;
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 10px 16px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}
.examples .example:hover { border-color: var(--teal2); color: var(--teal); }
.sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }
.hero { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 56px; align-items: center; margin: 28px 0 40px; min-width: 0; }
.hero h1 { font-size: clamp(28px, 3vw, 36px); line-height: 1.2; margin: 0 0 16px; }
.limit-note { font-size: 15.5px; color: var(--muted); margin: 14px 0 0; max-width: 68ch; }
.stackbar { position: relative; display: flex; height: 22px; border-radius: 8px; overflow: hidden; background: #ece8dc; margin: 4px 0 14px; }
.stackbar .adopted { background: var(--teal); height: 100%; }
.stackbar .added { background: #d5e4e8; height: 100%; }
.stackbar .paid { position: absolute; top: -5px; bottom: -5px; width: 2px; background: var(--ink); }
.checkline { display: flex; align-items: center; gap: 10px; margin-top: 14px; font-size: 15px; text-transform: none; letter-spacing: 0; color: var(--ink); }
.checkline input { width: auto; min-height: 0; }
.hero h1 em { font-style: normal; color: var(--teal); }
.hero h1 a { color: inherit; text-decoration: none; }
.hero h1 a:hover { text-decoration: underline; }
.lead { font-size: 19px; color: var(--muted); margin: 0; max-width: 560px; }
.page-intro { margin: 6px 0 32px; max-width: 68ch; }
.eyebrow { font-size: 13px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--teal2); font-weight: 600; margin-bottom: 10px; }
.warn-label { color: #8a5d00; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 32px; box-shadow: 0 1px 2px rgba(20,35,47,.04), 0 8px 28px rgba(20,35,47,.05); }
.card h2 { font-size: 26px; margin: 0 0 4px; }
.card .cap { color: var(--muted); font-size: 16px; margin: 0 0 24px; }
a.card { display: block; text-decoration: none; color: inherit; }
a.card:hover { border-color: #cfc6b4; }
.pace .row { margin-bottom: 22px; }
.pace .row:last-child { margin-bottom: 0; }
.pace .t { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; font-size: 16px; color: var(--muted); }
.pace .t b { font-family: var(--serif); font-weight: 500; font-size: 34px; color: var(--ink); }
.meter { height: 16px; background: #ece8dc; border-radius: 8px; overflow: hidden; }
.meter div { height: 100%; border-radius: 8px; }
.pace .note, .card .note { margin: 22px 0 0; font-size: 15px; color: var(--muted); border-top: 1px solid var(--line); padding-top: 16px; background: transparent; }
.kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 24px; margin-bottom: 32px; min-width: 0; }
.kpi { padding: 26px 28px; min-width: 0; overflow: visible; }
.kpi .l { font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
.kpi .n { font-family: var(--serif); font-size: 46px; font-weight: 500; line-height: 1.15; margin: 8px 0 4px; overflow-wrap: anywhere; max-width: 100%; }
.kpi .s { font-size: 15px; color: var(--muted); }
.kpi.k1 { border-top: 4px solid var(--teal); }
.kpi.k2 { border-top: 4px solid var(--teal2); }
.kpi.k3 { border-top: 4px solid var(--gold); }
.kpi.k4 { border-top: 4px solid #9aa7b0; }
.grid2 { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); gap: 24px; margin-bottom: 24px; min-width: 0; }
.g3 { grid-template-columns: 2fr 1fr; }
.grid2b { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 24px; margin-bottom: 24px; min-width: 0; }
.card .legend { display: flex; gap: 22px; flex-wrap: wrap; font-size: 15px; color: var(--muted); margin: -6px 0 20px; }
.card .legend span { display: flex; align-items: center; gap: 8px; }
.card .legend i { width: 16px; height: 12px; border-radius: 3px; display: inline-block; }
.swatch-enc { background: repeating-linear-gradient(135deg, var(--teal3) 0 4px, #d4e6e9 4px 8px); }
.swatch-hatch { background: repeating-linear-gradient(135deg, #777 0 3px, #eee 3px 7px); }
a.brow { display: block; padding: 15px 0; border-top: 1px solid #efece2; text-decoration: none; color: inherit; }
a.brow:first-of-type { border-top: 0; }
a.brow:hover { background: #fbfaf6; }
.btop { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 9px; gap: 12px; }
.blabel b { display: block; font-weight: 600; font-size: 16.5px; line-height: 1.25; }
.bval { text-align: right; }
.bval b { font-family: var(--serif); font-weight: 500; font-size: 22px; line-height: 1.2; margin-right: 4px; }
.bval span, .dname span, .blabel span { font-size: 14px; color: var(--muted); }
.btrack { position: relative; height: 24px; }
.btrack > div { position: absolute; top: 0; height: 100%; border-radius: 5px; }
.bbudget { left: 0; background: #e9e5d8; }
.bspent { left: 0; background: var(--teal); }
.benc { background: repeating-linear-gradient(135deg, var(--teal3) 0 4px, #d4e6e9 4px 8px); border-radius: 0 5px 5px 0; }
.donutwrap { display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 28px; }
.donut { width: min(360px, 100%); height: auto; aspect-ratio: 1; }
.donut-label { font-size: 18px; font-weight: 600; }
.dn1 { font-family: var(--serif); font-size: 21px; fill: var(--ink); }
.dn2 { font-size: 11px; fill: #4d5d6a; letter-spacing: 0.04em; }
.lgs { width: min(360px, 100%); margin-top: 0; }
a.lg { display: grid; grid-template-columns: 18px 1fr auto; gap: 10px; align-items: center; padding: 7px 0; font-size: 16px; border-top: 1px solid #efece2; text-decoration: none; color: inherit; }
a.lg i { width: 14px; height: 14px; border-radius: 4px; }
a.lg b { font-weight: 600; }
.pace-card { margin-bottom: 24px; }
a.drow { display: grid; grid-template-columns: minmax(0, 270px) minmax(0, 1fr) minmax(0, 170px) minmax(0, 140px); gap: 22px; align-items: center; padding: 13px 0; border-top: 1px solid #efece2; text-decoration: none; color: inherit; min-width: 0; }
a.drow:hover { background: #fbfaf6; }
.dname b { display: block; font-weight: 600; font-size: 16.5px; line-height: 1.25; }
.dplot { position: relative; height: 26px; }
.pm { position: absolute; top: -6px; bottom: -6px; width: 0; border-left: 3px solid var(--ink); z-index: 3; }
.dplot .dbar, .dplot .denc { position: absolute; top: 0; height: 100%; }
.dbar { left: 0; border-radius: 5px 0 0 5px; }
.dbar.green, .denc.green { --c: var(--g); }
.dbar.yellow, .denc.yellow { --c: var(--y); }
.dbar.red, .denc.red { --c: var(--r); }
.dbar.gray, .denc.gray, .dbar.none, .denc.none { --c: #9aa7b0; }
.dbar.under, .denc.under { --c: var(--teal2); }
.dbar { background: var(--c); }
.denc { background: repeating-linear-gradient(135deg, var(--c) 0 3px, rgba(255,255,255,.65) 3px 7px); opacity: .55; border-radius: 0 5px 5px 0; }
.dnum b { display: block; font-family: var(--serif); font-weight: 500; font-size: 24px; line-height: 1.1; }
.dnum span { font-size: 14px; color: var(--muted); }
.card .pill { font-style: normal; font-weight: 600; font-size: 14px; padding: 5px 12px; border-radius: 99px; white-space: normal; line-height: 1.3; text-align: center; max-width: 100%; }
.card .pill.green { background: #e1f0e8; color: #1c5a3b; border: 1px solid #a9d3bd; }
.card .pill.yellow { background: #fbefd0; color: #6e4b00; border: 1px solid #e3c36d; }
.card .pill.red { background: #f7e0df; color: #842b28; border: 1px solid #e1a9a7; }
.card .pill.gray, .card .pill.none { background: #eef1f3; color: #4d5d6a; border: 1px solid #d5dbe2; }
.card .pill.under { background: #e7eef2; color: #1d4e63; border: 1px solid #b7c9d4; }
.axis { position: relative; height: 30px; margin: 6px 314px 0 292px; }
.axis.top { height: 46px; margin-top: 0; margin-bottom: -8px; }
.axis u { position: absolute; top: 0; transform: translateX(-50%); font-size: 13px; color: var(--muted); text-decoration: none; }
.axis i { position: absolute; top: 22px; width: 1px; height: 6px; background: #b9b4a6; }
.plotarea { position: relative; }
.pacew { position: absolute; top: 0; bottom: 0; left: 292px; right: 314px; pointer-events: none; }
.pacew .tag { position: absolute; top: 0; transform: translateX(-50%); background: var(--ink); color: #fff; font-size: 13.5px; padding: 4px 10px; border-radius: 6px; white-space: nowrap; font-weight: 500; }
.pacew .gl { position: absolute; top: 36px; bottom: 34px; border-left: 1px dashed #d8d3c2; }
.mchart { display: flex; gap: 8px; align-items: flex-end; padding-top: 6px; }
a.mcol { flex: 1; min-width: 0; text-align: center; text-decoration: none; color: inherit; }
.mval { font-size: 13px; color: var(--muted); height: 20px; overflow-wrap: anywhere; }
.mstack { display: flex; flex-direction: column; justify-content: flex-end; }
.seg.v { background: var(--teal); border-radius: 4px 4px 0 0; }
.seg.p { background: var(--gold); }
.seg.o { background: #9aa7b0; }
.mstack .seg:first-child { border-radius: 4px 4px 0 0; }
.mlab { font-size: 15px; color: var(--muted); margin-top: 8px; border-top: 1px solid var(--line); padding-top: 6px; }
.short { display: none; }
.mnote { font-size: 14.5px; color: var(--muted); margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); }
a.vrow { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(48px, 1fr) auto; gap: 12px; align-items: center; padding: 9px 0; border-top: 1px solid #efece2; text-decoration: none; color: inherit; min-width: 0; }
a.vrow:first-of-type { border-top: 0; }
a.vrow:hover { background: #fbfaf6; }
.vn { font-weight: 500; font-size: 16px; line-height: 1.25; display: flex; gap: 10px; min-width: 0; }
.vn span:not(.rk) { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rk { color: var(--gold); font-family: var(--serif); font-weight: 600; width: 20px; flex: none; }
.vt { height: 20px; background: #f0ede3; border-radius: 5px; min-width: 0; }
.vb { height: 100%; background: var(--teal2); border-radius: 5px; }
.vv { text-align: right; font-weight: 600; font-family: var(--serif); font-size: 19px; white-space: nowrap; }
.look { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }
a.item { display: block; border-left: 4px solid var(--y); padding: 4px 0 4px 18px; text-decoration: none; color: inherit; }
a.item.i3 { border-color: var(--teal2); }
a.item h3 { font-size: 20px; margin: 0 0 6px; line-height: 1.25; color: var(--ink); }
a.item .vs { font-size: 16px; color: var(--ink); font-weight: 500; margin-bottom: 8px; }
a.item .big { font-family: var(--serif); font-size: 30px; line-height: 1.1; margin: 2px 0 8px; }
a.item p { margin: 0; font-size: 15.5px; color: var(--muted); }
a.item .tagl { display: inline-block; font-size: 12.5px; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 600; color: #6e4b00; background: #fbefd0; border-radius: 5px; padding: 2px 8px; margin-bottom: 8px; }
a.item.i3 .tagl { background: #dcecef; color: #17505c; }
.plat { background: linear-gradient(180deg, #17505c, #123f49); color: #fff; border: 0; }
.plat .eyebrow { color: #a9cdd3; }
.plat h2, .plat h2 a { color: #fff; text-decoration: none; }
.plat .cap, .plat .s { color: #c9dde1; }
.plat .n, .plat .n a { font-family: var(--serif); font-size: 50px; line-height: 1.1; color: #fff; text-decoration: none; }
.plat .s { font-size: 15.5px; }
.plat .meter { background: rgba(255,255,255,.18); }
.plat .meter div { background: #e6c46a; }
.pcs { display: flex; gap: 5px; align-items: flex-end; height: 96px; margin-top: 20px; }
a.pc { flex: 1; text-align: center; display: flex; flex-direction: column; justify-content: flex-end; height: 100%; text-decoration: none; }
a.pc div { background: #a9cdd3; border-radius: 3px 3px 0 0; }
a.pc span { font-size: 12px; color: #c9dde1; margin-top: 4px; }
a.plat-btn { display: inline-block; margin-top: 22px; background: #fff; color: #17505c; text-decoration: none; font-weight: 600; padding: 14px 26px; border-radius: 10px; font-size: 17px; }
.mobpace { display: none; margin-top: 12px; font-size: 15px; background: #f3f1ea; padding: 10px 14px; border-radius: 8px; }
.sources { color: var(--muted); font-size: 14.5px; margin: 8px 0 0; }
.spend-row { grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr); }
.spend-row > .card, .income-card, .source-block, .reserve-fund, .budget-year { min-width: 0; }
.pie-card .donut { width: min(260px, 100%); }
.pie-card .donutwrap { flex-direction: column; align-items: center; gap: 8px; }
.pie-card .dn1 { font-size: 18px; }
.pie-card .dn2 { font-size: 10px; }
.pie-card .lgs { width: 100%; }
.pie-card a.lg { grid-template-columns: 14px minmax(0, 1fr) auto; gap: 6px; font-size: 13px; padding: 4px 0; }
.pie-card .donut-label { font-size: 13px; overflow-wrap: anywhere; }
.pie-card .donut-amt { display: none; }
.donut-amt { display: block; font-weight: 500; color: var(--muted); font-size: 13px; }
.figure-n { font-family: var(--serif); font-size: clamp(32px, 4vw, 52px); font-weight: 500; line-height: 1.1; margin: 0 0 8px; overflow-wrap: anywhere; max-width: 100%; }
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(168px, 100%), 1fr)); gap: 14px; margin-top: 18px; min-width: 0; }
.stat-grid .kpi { padding: 18px 12px; }
.stat-grid .n { font-size: clamp(20px, 1.7vw, 28px); white-space: nowrap; overflow-wrap: normal; }
.splitbar { display: flex; height: 28px; border-radius: 8px; overflow: hidden; margin: 8px 0 12px; min-width: 0; }
.splitbar a { display: block; min-width: 2px; height: 100%; }
.class-legend { display: flex; flex-wrap: wrap; gap: 10px 16px; margin: 0 0 8px; }
.class-legend a { display: flex; align-items: center; gap: 8px; text-decoration: none; color: inherit; min-width: 0; }
.reserve-fund { border-top: 1px solid var(--line); padding: 16px 0; }
.reserve-link { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; text-decoration: none; color: inherit; min-width: 0; }
.reserve-name { min-width: 0; overflow-wrap: anywhere; font-weight: 600; }
.reserve-amt { font-family: var(--serif); font-size: clamp(22px, 2.4vw, 36px); line-height: 1.1; overflow-wrap: anywhere; }
.cmp { border-top: 1px solid var(--line); padding: 14px 0; min-width: 0; display: block; text-decoration: none; color: inherit; }
.cmp h3 { margin: 0 0 6px; font-size: 18px; font-family: var(--serif); font-weight: 500; }
.cmp p { margin: 4px 0; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.cmp .figure-n, .cmp .cap { display: block; }
.budget-year { margin-top: 22px; }
.trend { display: flex; align-items: flex-end; gap: 4px; height: 150px; min-width: 0; }
.trend a { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; height: 100%; text-decoration: none; color: var(--muted); font-size: 11px; }
.trend-bar { display: block; width: 100%; max-width: 28px; background: var(--teal); border-radius: 3px 3px 0 0; }
.src { color: var(--muted); font-size: 14px; margin: 12px 0 0; overflow-wrap: anywhere; }
.what { margin: 10px 0; }
.what summary { cursor: pointer; font-weight: 600; }
.tip { position: relative; display: inline-flex; align-items: center; justify-content: center; vertical-align: middle; width: 20px; height: 20px; margin-left: 2px; letter-spacing: 0; text-transform: none; flex: none; line-height: 1; }
.tip-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 20px;
  height: 20px;
  border: 1.5px solid #c9a24b;
  border-radius: 50%;
  background: #fff;
  color: var(--navy);
  font-family: var(--sans);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0;
  text-transform: none;
  padding: 0;
  margin: 0;
  cursor: pointer;
  flex: none;
}
.tip-btn::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 44px;
  height: 44px;
  transform: translate(-50%, -50%);
}
.tip-btn:hover,
.tip-btn:focus-visible,
.tip-btn[aria-expanded="true"] {
  background: #c9a24b;
  color: var(--navy);
  box-shadow: 0 0 0 4px rgba(201, 162, 75, 0.35);
}
.tip-pop {
  position: absolute;
  z-index: 80;
  top: calc(100% + 4px);
  left: 0;
  width: max-content;
  max-width: min(280px, calc(100vw - 24px));
  padding: 10px 12px;
  background: var(--navy-deep);
  color: #fff;
  font: 700 16px/1.35 var(--sans);
  letter-spacing: 0;
  text-transform: none;
  text-align: left;
  border: 1px solid #c9a24b;
  border-radius: 12px;
  box-shadow: 0 10px 28px rgba(14, 26, 35, 0.28);
  white-space: normal;
}
.tip-pop[hidden] { display: none; }
.kpi .l, .metric-label { display: flex; align-items: center; flex-wrap: wrap; gap: 2px 4px; }
.kpi a.n { color: inherit; text-decoration: none; display: block; }
.reserve-name a, a.reserve-amt { color: inherit; text-decoration: none; }
.legend-tip { display: inline-flex; align-items: center; gap: 2px; max-width: 100%; }
.more-links { display: flex; flex-wrap: wrap; gap: 8px 16px; margin: 12px 0 0; }
.more-links a { font-weight: 600; }
.holder-list { list-style: none; padding: 0; margin: 0; }
.holder-list li { display: flex; flex-wrap: wrap; gap: 6px 12px; justify-content: space-between; padding: 8px 0; border-top: 1px solid var(--line); min-width: 0; }
.holder-list b { overflow-wrap: anywhere; }
.holder-list span { flex-basis: 100%; color: var(--muted); font-size: 14px; }
.fund-savings { margin-bottom: 24px; }
@media (max-width: 1100px) {
  .spend-row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
}
@media (max-width: 980px) {
  .metrics, .split, .filters { grid-template-columns: 1fr 1fr; }
  .header-inner { padding-left: 20px; padding-right: 20px; }
}
@media (max-width: 760px) {
  .nav-btn { display: none; }
  nav { display: flex; width: 100%; }
  nav a, nav button.linkish { padding: 12px 0; font-size: 16px; }
  .header-inner { flex-wrap: wrap; min-height: 72px; padding: 14px 20px 0; align-items: flex-end; }
  .metrics, .split, .filters { grid-template-columns: 1fr; }
  main, .banner-inner, .footer-inner { padding-left: 18px; padding-right: 18px; }
  main { padding-top: 28px; }
  .brand-name { font-size: 24px; }
  table { min-width: 680px; }
  .donut-row { flex-direction: column; align-items: flex-start; }
  .hero { grid-template-columns: 1fr; gap: 26px; margin-bottom: 26px; }
  .hero h1 { font-size: 33px; }
  .lead { font-size: 17.5px; }
  .ask-hero h2, .pay-find h2 { font-size: 28px; }
  .sort-row .btn, .pay-find .btn { width: 100%; }
  .ask-row { flex-direction: column; align-items: stretch; }
  .card { padding: 22px 20px; }
  .kpis { grid-template-columns: 1fr 1fr; gap: 12px; }
  .kpi { padding: 18px 16px; }
  .kpi .n { font-size: 32px; }
  .kpi .l { font-size: 11.5px; }
  .kpi .s { font-size: 13.5px; }
  .grid2, .grid2b, .g3 { grid-template-columns: 1fr; gap: 18px; margin-bottom: 18px; }
  .btop { flex-direction: column; gap: 2px; }
  .bval { text-align: left; }
  .bval b { font-size: 20px; }
  a.drow { grid-template-columns: 1fr auto; gap: 10px 12px; padding: 16px 0; }
  .dname { grid-column: 1; min-width: 0; }
  .dstat { grid-column: 1 / -1; grid-row: 4; }
  .card .pill { justify-content: center; }
  .dplot { grid-column: 1 / 3; grid-row: 2; }
  .dnum { grid-column: 1 / 3; grid-row: 3; }
  .dnum b { display: inline; font-size: 21px; margin-right: 6px; }
  .axis, .axis.top, .pacew { display: none; }
  .mchart { gap: 4px; }
  .mval { font-size: 10px; height: auto; }
  .donutwrap { flex-direction: column; }
  .donut { width: min(300px, 100%); }
  .pie-card .donut { width: min(260px, 100%); }
  .reserve-link { flex-wrap: wrap; }
  .figure-n { font-size: 32px; }
  .table-hint { display: block; }
  .nav-scroller { width: 100%; }
  .long { display: none; }
  .short { display: inline; }
  .mlab { font-size: 14px; }
  a.vrow { grid-template-columns: 1fr auto; gap: 6px 10px; }
  .vt { grid-column: 1 / 3; grid-row: 2; }
  .look { grid-template-columns: 1fr; gap: 26px; }
  .plat .n, .plat .n a { font-size: 42px; }
  .mobpace { display: block; }
}
@media (max-width: 400px) {
  main, .banner-inner, .footer-inner { padding-left: 12px; padding-right: 12px; }
  .kpis { grid-template-columns: 1fr; }
  .kpi .n { font-size: 28px; }
  .card { padding: 16px 12px; }
  .hero h1 { font-size: 26px; }
  .banner p { overflow-wrap: anywhere; }
  .reserve-link { flex-direction: column; align-items: flex-start; }
  .cmp p { flex-direction: column; align-items: flex-start; }
  .figure-n { font-size: 28px; }
  .stat-grid { grid-template-columns: 1fr; }
}
body.door { background: var(--paper); font-size: 18px; }
body.door main { max-width: none; margin: 0; padding: 0; }
.door-bar { background: #0e1a23; color: #f6f4ee; }
.door-wrap { max-width: 1240px; margin: 0 auto; padding: 0 24px; }
.door-hero-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr); gap: 36px; align-items: center; }
.feature-panel { background: #fff; color: var(--ink); border-radius: 20px; padding: 28px 24px; min-width: 0; }
.feature-panel h2 { color: var(--ink); font-size: clamp(32px, 4vw, 46px); margin: 0 0 10px; }
.feature-panel p { font-size: 20px; line-height: 1.45; margin: 0; color: var(--ink); }
.feature-panel .eyebrow { color: #8a6420; font-size: 16px; }
.feature-panel .btn { margin-top: 22px; }
.card-row { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.info-card { background: #fff; border: 1px solid var(--line); border-radius: 20px; padding: 28px 24px; min-width: 0; box-shadow: var(--shadow); }
.info-card h2 { font-size: clamp(32px, 4vw, 44px); margin-bottom: 8px; }
.info-card p { font-size: 20px; line-height: 1.45; margin: 0; }
.info-card .eyebrow { font-size: 16px; letter-spacing: 0.08em; }
.info-card .btn { margin-top: 20px; }
.bar-inner { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; padding-top: 10px; padding-bottom: 10px; min-width: 0; }
.door-brand { font-family: var(--serif); font-size: clamp(26px, 3vw, 36px); font-weight: 560; line-height: 1.15; color: #f6f4ee; text-decoration: none; max-width: 100%; min-width: 0; min-height: 44px; display: inline-flex; align-items: center; overflow-wrap: anywhere; }
.door-bar a { color: #f6f4ee; }
.door-bar-link { font-size: 20px; font-weight: 600; text-decoration: none; min-height: 56px; display: inline-flex; align-items: center; }
.door-hero { background: #0e1a23; color: #f6f4ee; padding: 12px 0 32px; }
.hero-grid { display: grid; grid-template-columns: minmax(300px, 460px) minmax(0, 1fr); gap: 24px; align-items: stretch; }
.hero-copy { min-width: 0; display: flex; flex-direction: column; }
.door-hero h1 { color: #f6f4ee; font-size: clamp(36px, 3.6vw, 52px); max-width: 14em; line-height: 1.05; margin: 0 0 8px; }
.door-hero .hero-copy h1 { margin-bottom: 18px; }
.door-hero .eyebrow { color: #e6c46a; }
.door-hero .explainer { font-size: 20px; line-height: 1.35; max-width: 40rem; color: #e7e1d6; margin: 0; }
.door-section .body-copy { font-size: 22px; line-height: 1.45; max-width: 40rem; color: var(--ink); margin: 12px 0 0; }
.door-hero .caption, .door-section .caption { font-size: 20px; line-height: 1.4; margin: 12px 0 0; }
.door-hero .caption { color: #c9d3da; }
.door-section .caption { color: var(--muted); }
.door-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 28px; }
body.door .btn { max-width: 100%; min-height: 64px; padding: 16px 28px; font-size: 20px; border-radius: 14px; text-align: center; }
body.door .btn.gold { background: #b78a2d; color: #14232f; }
body.door .btn.gold:hover { background: #9a7424; color: #14232f; }
body.door .btn.line { background: transparent; color: #f6f4ee; border: 2px solid #f6f4ee; }
body.door .btn.line:hover { background: #f6f4ee; color: #14232f; }
.door-section { padding: 36px 0 8px; }
.door-section h2 { font-size: clamp(32px, 4vw, 48px); }
.door-section h3 { font-family: var(--serif); font-size: 28px; font-weight: 560; margin: 28px 0 0; }
.finder { display: grid; grid-template-columns: minmax(280px, 360px) minmax(0, 1fr); gap: 22px; align-items: start; margin-top: 28px; }
.picker { background: #fff; color: var(--ink); border-radius: 20px; padding: 14px 16px 16px; min-width: 0; margin-top: 12px; }
.hero-copy .picker { flex: 1; }
.picker h2 { color: var(--ink); font-size: 28px; margin: 0 0 4px; }
.picker label { display: block; font-size: 20px; font-weight: 650; margin: 10px 0 6px; color: var(--ink); }
.picker select { width: 100%; max-width: 100%; min-width: 0; min-height: 64px; font-size: 20px; background: #fff; color: var(--ink); border: 2px solid #c9c3b4; border-radius: 12px; padding: 0 14px; }
.picker .btn { width: 100%; margin-top: 12px; }
.picker .caption { color: var(--muted); }
.state-picker { margin-top: 18px; }
.see-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 18px; }
.door-nav { display: flex; flex-wrap: wrap; gap: 4px 18px; min-width: 0; }
.map-card { position: relative; background: #e7eef2; border: 1px solid var(--line); border-radius: 18px; padding: 12px 12px 14px; margin-top: 0; box-shadow: var(--shadow); overflow: hidden; max-width: 100%; }
.us-map, .county-map { width: 100%; max-width: 100%; height: auto; display: block; overflow: hidden; }
.us-map a, .county-map a { outline: none; }
.us-map a path, .county-map g path { fill: #7f97a6; stroke: #2f4553; stroke-width: 1.4px; vector-effect: non-scaling-stroke; transition: fill 160ms ease; }
.us-map a path, .county-map a path { fill: #7f97a6; stroke: #2f4553; stroke-width: 1.4px; vector-effect: non-scaling-stroke; transition: fill 160ms ease; }
.us-map a.live path, .county-map a.live path { fill: #e0b34d; }
.us-map a:hover path, .county-map a:hover path { fill: #8ea4b3; stroke: #14232f; stroke-width: 2px; }
.us-map a.live:hover path, .county-map a.live:hover path { fill: #f0cc6e; stroke: #14232f; }
.us-map a:focus-visible path, .county-map a:focus-visible path { stroke: #14232f; stroke-width: 3px; }
.us-map a.live:focus-visible path, .county-map a.live:focus-visible path { fill: #f0cc6e; stroke: #14232f; stroke-width: 3px; }
.us-map .hit, .county-map .hit { fill: transparent; stroke: none; }
.place-label { fill: #14232f; font-weight: 700; font-family: var(--sans); pointer-events: none; }
.place-leader { stroke: #14232f; stroke-width: 1.5px; fill: none; vector-effect: non-scaling-stroke; pointer-events: none; }
.florida-wrap { max-width: 920px; margin: 0 auto; }
.florida-map { max-width: 100%; margin: 14px auto 0; overflow: visible; }
.florida-map .county-map { width: 100%; height: auto; margin: 0 auto; overflow: visible; }
.florida-map .map-note { margin-top: 20px; }
.florida-hero { padding-bottom: 16px; }
.florida-hero .map-action { max-width: 100%; margin: 12px auto 0; }
.inset-frame { fill: rgba(255, 255, 255, 0.55); stroke: #5d7382; stroke-width: 1.5px; vector-effect: non-scaling-stroke; pointer-events: none; }
.inset-label { fill: #14232f; font-size: 20px; font-weight: 700; font-family: var(--sans); pointer-events: none; }
.map-label { min-height: 1.4em; margin: 10px 0 0; font-size: 20px; font-weight: 650; color: #14232f; }
.map-action { margin: 12px 0 0; }
.map-action .btn { width: 100%; }
.door-hero .map-card .map-note { color: #1b2a36; font-size: 20px; line-height: 1.45; }
.map-legend { display: flex; flex-wrap: wrap; gap: 8px 18px; align-items: center; margin-top: 12px; font-size: 18px; color: #14232f; }
.map-legend .swatch { width: 22px; height: 22px; border-radius: 6px; display: inline-block; }
.map-legend .swatch.live { background: #e0b34d; }
.map-legend .swatch.soon { background: #7f97a6; border: 1px solid #2f4553; }
.skip { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.skip:focus { position: fixed; left: 12px; top: 12px; z-index: 20; width: auto; height: auto; margin: 0; padding: 14px 18px; overflow: visible; clip: auto; background: #fff; color: #14232f; border-radius: 12px; font-size: 18px; font-weight: 700; text-decoration: none; outline: 3px solid #14232f; }
.state-pills, .county-list { list-style: none; padding: 0; margin: 16px 0 0; display: flex; flex-wrap: wrap; gap: 10px; }
.county-list { display: block; }
.county-list a, .state-pills a { display: inline-flex; align-items: center; min-height: 56px; padding: 12px 16px; border-radius: 14px; font-size: 18px; font-weight: 600; text-decoration: none; max-width: 100%; line-height: 1.3; overflow-wrap: anywhere; }
.state-pills a.open, .county-list a { background: #b78a2d; color: #14232f; }
.state-pills a.soon { background: #fff; color: #24343f; border: 1px solid #d9d3c6; }
.steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-top: 18px; }
.step { background: #fff; border: 1px solid var(--line); border-top: 6px solid #b78a2d; border-radius: 18px; padding: 28px 24px; min-width: 0; }
.step b { display: block; font-family: var(--serif); font-size: 28px; font-weight: 560; line-height: 1.2; margin-bottom: 8px; }
.coming-cta { margin: 18px 0 0; display: flex; justify-content: center; }
#coming { text-align: center; }
#coming .body-copy { margin-left: auto; margin-right: auto; }
.door-foot { text-align: center; }
.door-foot-nav { justify-content: center; }
.state-mark { width: 220px; height: 150px; margin: 0 0 16px; background: #e7eef2; border: 1px solid #d5dde3; border-radius: 16px; padding: 10px; }
.state-mark svg { width: 100%; height: 100%; display: block; }
.state-mark path { fill: #c5d3dc; stroke: #5d7382; stroke-width: 2px; vector-effect: non-scaling-stroke; }
body.door .eyebrow { font-size: 16px; letter-spacing: 0.08em; }
.door-bar a:focus-visible { outline: 3px solid #e6c46a; outline-offset: 3px; border-radius: 8px; }
.door-login { display: grid; gap: 16px; width: 100%; max-width: none; background: #fff; border: 1px solid var(--line); border-radius: 18px; padding: 28px 24px; margin-top: 18px; }
body.door .door-login label, body.door .door-login legend { font-size: 20px; letter-spacing: 0; text-transform: none; color: var(--ink); font-weight: 600; }
.state-finder { margin-top: 18px; max-width: 720px; }
.state-finder label { font-size: 20px; letter-spacing: 0; text-transform: none; color: var(--ink); font-weight: 600; }
.state-finder input { min-height: 64px; font-size: 22px; }
.state-empty { font-size: 22px; line-height: 1.45; margin: 16px 0 0; max-width: 40rem; }
body.door .door-login legend { font-family: var(--serif); font-size: 32px; font-weight: 560; }
body.door .door-login fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
body.door .door-login input[type="text"], body.door .door-login input[type="email"], body.door .door-login input[type="password"], body.door .door-login select, body.door .door-login textarea { min-height: 64px; min-width: 0; width: 100%; font-size: 20px; max-width: 100%; }
.choice { display: grid; gap: 12px; }
.choice label { display: grid; grid-template-columns: 28px minmax(0, 1fr); align-items: center; gap: 14px; min-height: 72px; padding: 14px 16px; border: 2px solid var(--line); border-radius: 16px; background: #fff; font-size: 22px; line-height: 1.3; overflow-wrap: anywhere; }
.choice input { width: 28px; height: 28px; min-height: 28px; margin: 0; }
.report-form .idea-fields { display: none; }
.report-form:has(input[name="kind"][value="idea"]:checked) .problem-fields { display: none; }
.report-form:has(input[name="kind"][value="idea"]:checked) .idea-fields { display: block; }
.locked { margin: 8px 0 0; font-size: 18px; font-weight: 600; }
.locked-value { margin: 0 0 8px; font-size: 22px; }
.hp { position: absolute; width: 1px; height: 1px; margin: 0; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
body.door .door-login .hp input[type="text"] { width: 1px; min-height: 0; height: 1px; padding: 0; border: 0; }
.door-foot { color: var(--muted); font-size: 18px; line-height: 1.45; }
.door-foot .door-wrap { padding-top: 28px; padding-bottom: 64px; }
.door-foot-nav { display: flex; flex-wrap: wrap; gap: 12px 22px; margin: 0 0 14px; }
.door-foot-nav a { font-size: 20px; font-weight: 650; color: var(--navy); text-decoration: none; }
.door-foot-link { margin: 0 0 12px; }
.door-foot-link a { font-size: 22px; font-weight: 650; color: var(--navy); }
.county-list a.soon { background: #fff; color: #24343f; border: 1px solid #d9d3c6; }
body.door .warning { font-size: 20px; }
@media (min-width: 801px) {
  .door-hero .door-wrap:has(.state-mark) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 240px;
    column-gap: 32px;
    align-items: center;
  }
  .door-hero .door-wrap:has(.state-mark) .state-mark {
    grid-column: 2;
    grid-row: 1 / span 4;
    justify-self: end;
    margin: 0;
  }
  .state-pills { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .state-pills a { width: 100%; }
  .county-list { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
}
@media (max-width: 800px) {
  .steps, .card-row, .door-hero-grid, .see-grid, .finder, .hero-grid { grid-template-columns: 1fr; }
  .door-wrap { padding-left: 16px; padding-right: 16px; }
  .door-hero { padding-top: 12px; }
  .door-hero h1 { font-size: 40px; }
  .state-pills { display: grid; grid-template-columns: 1fr 1fr; }
  .state-pills li { min-width: 0; }
  .state-pills a { width: 100%; justify-content: center; min-height: 72px; font-size: 18px; text-align: center; }
  .county-list a { width: 100%; }
  .door-actions .btn { width: 100%; }
  .florida-hero h1 { font-size: 34px; }
  .florida-hero .explainer { font-size: 18px; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  .us-map a path, .county-map a path { transition: none; }
}

:root {
  --sans: Inter, "Segoe UI", system-ui, -apple-system, Helvetica, Arial, sans-serif;
  --serif: Inter, "Segoe UI", system-ui, -apple-system, Helvetica, Arial, sans-serif;
  --line: #e0e6e4;
  --shadow: none;
  --up: #1b6542;
  --down: #8c3030;
}
body { font-size: 16px; line-height: 1.5; }
h1, h2, h3, .figure-n, .kpi .n, .plat .n, .plat .n a, .dn1, .dnum b, .vv, .bval b, .pace .t b, .drop strong, .cmp h3, .reserve-amt, .door-section h3, .step b, body.door .door-login legend, .rk {
  font-family: var(--sans);
  font-weight: 700;
}
h1 { font-size: clamp(28px, 3vw, 36px); letter-spacing: -0.02em; line-height: 1.15; color: var(--navy); }
h2 { font-size: 22px; letter-spacing: -0.015em; color: var(--navy); }
.hero h1 { font-size: clamp(26px, 2.6vw, 32px); }
.door-hero h1 { color: #f6f4ee; font-size: clamp(30px, 4vw, 40px); line-height: 1.15; }
.kpi .n, .plat .n, .plat .n a { font-size: 32px; }
.figure-n { font-size: clamp(26px, 3vw, 34px); }
.eyebrow {
  color: var(--up);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.door-hero .eyebrow { color: #b7e4c7; }
.metric, .panel, .login-card, .answer, .card, .info-card, .feature-panel, .picker, .step, .door-login, .map-card {
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: none;
  background: #f7f8f6;
}
.card, .panel, .metric, .info-card, .login-card { padding: 14px 16px; }
.kpi { padding: 12px 14px; }
.kpis, .grid2, .grid2b { gap: 14px; }
main { padding: 24px 28px 40px; }
.site-header {
  position: sticky;
  top: 0;
  z-index: 30;
  background: #fff;
  border-bottom: 1px solid var(--line);
}
.header-inner { min-height: 64px; padding: 8px 28px; align-items: center; }
.brand { min-height: 44px; display: inline-flex; align-items: center; }
.brand-logo { height: 40px; width: auto; display: block; }
.nav-toggle {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
.nav-btn {
  display: none;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  min-width: 44px;
  margin: 0;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  color: var(--navy);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: none;
  cursor: pointer;
}
.site-header form { display: inline; margin: 0; }
.site-header nav a, .site-header nav button.linkish { color: var(--navy); }
a.vrow, a.brow, .reserve-link { position: relative; padding-right: 22px; }
a.drow { position: relative; }
a.drow .pill { margin-right: 18px; }
a.drow::after, a.vrow::after, a.brow::after, .reserve-link::after {
  content: "\\2192";
  position: absolute;
  right: 2px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--up);
  font-weight: 700;
  font-size: 16px;
  line-height: 1;
  pointer-events: none;
}
.cmp p:has(> span):has(> b) {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  margin: 0;
  padding: 8px 0;
  border-top: 1px solid var(--line);
}
.cmp p:has(> span):has(> b) > span {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 700;
}
.cmp p:has(> span):has(> b) > b { font-weight: 700; text-align: right; color: var(--navy); }
.holder-list b { margin-left: auto; font-weight: 700; text-align: right; }
.chg-up { color: var(--up); font-weight: 700; }
.chg-down { color: var(--down); font-weight: 700; }
.info-card p { font-size: 16px; line-height: 1.45; margin: 0; }
.see-grid { gap: 12px; }
.site-footer { background: var(--navy); color: #d7e0e6; }
.site-footer .footer-inner { max-width: 1240px; margin: 0 auto; padding: 28px 28px 40px; border-top: 0; }
.footer-grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, auto); gap: 22px 28px; }
.footer-col { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-width: 0; }
.footer-logo img { height: 48px; width: auto; display: block; }
.footer-mission { margin: 8px 0 0; font-size: 16px; line-height: 1.45; max-width: 36ch; color: #d7e0e6; }
.footer-label { margin: 0 0 4px; color: #b7e4c7; font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
.site-footer a { color: #fff; text-decoration: none; font-weight: 600; }
.site-footer a:hover { text-decoration: underline; }
.footer-built, .footer-asof { margin: 18px 0 0; font-size: 16px; color: #d7e0e6; }
.door-section .body-copy { font-size: 18px; }
body.door .btn { min-height: 48px; font-size: 16px; border-radius: 8px; }
.picker select, body.door .door-login input, body.door .door-login select, body.door .door-login textarea { min-height: 48px; font-size: 16px; }
@media (max-width: 760px) {
  .brand-logo { height: 32px; }
  .header-inner { flex-wrap: wrap; padding: 8px 16px; }
  .nav-btn { display: inline-flex; }
  .nav-scroller { display: none; width: 100%; flex-basis: 100%; }
  .nav-toggle:checked ~ .nav-scroller { display: block; }
  .site-header nav { flex-direction: column; align-items: stretch; width: 100%; }
  .site-header nav a, .site-header nav button.linkish { min-height: 44px; display: flex; align-items: center; padding: 10px 0; font-size: 16px; }
  .footer-grid { grid-template-columns: 1fr; }
  .site-footer .footer-col a { min-height: 44px; display: flex; align-items: center; }
  main { padding: 20px 16px 32px; }
  .kpi .n { font-size: 28px; }
}
@media (max-width: 400px) {
  .card, .panel, .metric { padding: 12px; }
}

/* Compact rows and list amounts. Footer rules above are unchanged. */
.card, .panel, .metric, .info-card, .login-card, .feature-panel, .step, .picker, body.door .door-login { padding: 12px 14px; }
.kpi { padding: 10px 12px; }
.card .cap, .ask-hero .cap { margin: 0 0 8px; }
.hero { gap: 24px; margin: 8px 0 16px; }
.hero h1 { font-size: clamp(22px, 2.4vw, 28px); }
.kpis, .grid2, .grid2b, .metrics { gap: 10px; margin-bottom: 14px; }
.pace .row { margin-bottom: 10px; }
.page-intro { margin: 4px 0 14px; }
.look { gap: 12px; }
.login-card h1 { font-size: 28px; }
.pay-find h2, .ask-hero h2 { font-size: 22px; }
.pay-find .btn, .ask-row input { min-height: 44px; font-size: 16px; padding: 8px 14px; }
.feature-panel h2, .info-card h2 { font-size: clamp(22px, 3vw, 28px); }
.feature-panel p, .door-section .body-copy { font-size: 16px; }
.door-section { padding: 20px 0 4px; }
.door-section h2 { font-size: clamp(24px, 3vw, 32px); }
.choice label { min-height: 48px; font-size: 16px; padding: 8px 12px; }
.county-list a, .state-pills a { min-height: 44px; font-size: 16px; padding: 8px 12px; }
.steps, .card-row, .see-grid, .finder, .door-hero-grid { gap: 12px; }
.step { padding: 14px 16px; }
.step b { font-size: 18px; }
.kpi .n, .kpi a.n, .plat .n, .plat .n a, .figure-n, .metric-value, .pace .t b, a.item .big { font-size: 24px; font-weight: 650; line-height: 1.15; }
.stat-grid .n, .stat-grid .kpi .n, .cmp .figure-n { font-size: 16px; font-weight: 600; }
a.item h3 { font-size: 16px; margin: 0 0 4px; }
a.item .big { margin: 0 0 4px; }
.vv, .paid-list .vv, .vv b, .paid-list .vv b, .bval b, .dnum b, td.num, .holder-list b, .reserve-amt, .transfer-row b {
  font-family: var(--sans);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: 0;
}
.paid-list .vv, .vv { overflow-wrap: normal; white-space: nowrap; text-align: right; }
.vv { display: flex; align-items: baseline; justify-content: flex-end; gap: 6px; }
.row-cap { display: inline; margin: 0; font-family: var(--sans); font-size: 12px; font-weight: 500; line-height: 1.2; color: var(--muted); white-space: nowrap; }
.cmp p:has(> span):has(> b) > b { font-size: 16px; font-weight: 600; }
a.vrow {
  grid-template-columns: minmax(16rem, 2.1fr) minmax(36px, 0.55fr) max-content 1rem;
  gap: 4px 10px;
  align-items: center;
  min-height: 40px;
  padding: 2px 0;
  padding-right: 0;
}
.paid-list a.vrow { padding: 2px 0; min-height: 40px; }
.vn { font-size: 15px; line-height: 1.2; gap: 8px; }
.vt, .btrack, .dplot { height: 8px; }
.meter, .stackbar, .splitbar { height: 8px; }
a.brow {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 1rem;
  column-gap: 8px;
  align-items: center;
  min-height: 40px;
  padding: 4px 0;
  padding-right: 0;
}
a.brow > .btop, a.brow > .btrack, a.brow > .cap { grid-column: 1; }
a.brow .cap { margin: 0; font-size: 13px; }
a.brow::after { grid-column: 2; grid-row: 1 / span 3; }
.btop { margin-bottom: 4px; gap: 8px; }
.bval { display: flex; align-items: baseline; justify-content: flex-end; gap: 6px; flex-wrap: wrap; }
a.drow {
  grid-template-columns: minmax(12rem, 1.35fr) minmax(48px, 1fr) max-content auto 1rem;
  gap: 4px 10px;
  min-height: 40px;
  padding: 4px 0;
}
.dname b { font-size: 15px; line-height: 1.2; }
.dname span { display: block; font-size: 12px; line-height: 1.2; }
.dnum b { display: inline; margin-right: 6px; }
.dnum span, .bval span { font-size: 12px; line-height: 1.2; }
a.drow .pill { margin-right: 0; }
a.drow::after { grid-column: 5; grid-row: 1; }
.reserve-link { padding-right: 0; align-items: center; min-height: 40px; gap: 8px; }
.reserve-fund, .cmp { padding: 6px 0; }
a.lg { min-height: 36px; padding: 2px 0; }
.holder-list li { align-items: baseline; min-height: 40px; padding: 4px 0; gap: 4px 8px; }
.holder-list span { flex-basis: auto; font-size: 12px; }
th { padding: 8px 10px; }
td { padding: 8px 10px; line-height: 1.2; }
a.vrow::after, a.brow::after, a.drow::after, .reserve-link::after {
  position: static;
  top: auto;
  right: auto;
  transform: none;
  justify-self: end;
  align-self: center;
  flex: none;
}
@media (max-width: 760px) {
  .paid-list a.vrow, a.vrow, a.brow, a.drow, .reserve-link, .holder-list li, .transfer-row, a.lg, .cmp, .pager a {
    min-height: 44px;
  }
  a.vrow {
    grid-template-columns: minmax(0, 1fr) max-content 1rem;
    gap: 4px 8px;
    padding-right: 0;
  }
  .vt { grid-column: 1 / -1; grid-row: 2; height: 6px; }
  .vv { grid-column: 2; grid-row: 1; }
  a.vrow::after { grid-column: 3; grid-row: 1; }
  a.drow { grid-template-columns: minmax(0, 1fr) max-content 1rem; gap: 4px 8px; }
  .dname { grid-column: 1; grid-row: 1; }
  .dnum { grid-column: 2; grid-row: 1; }
  a.drow::after { grid-column: 3; grid-row: 1; }
  .dplot { grid-column: 1 / -1; grid-row: 2; }
  .dstat { grid-column: 1 / -1; grid-row: 3; }
  .btop { flex-direction: row; align-items: baseline; }
  .bval { text-align: right; }
  .kpi .n, .figure-n, .plat .n, .plat .n a { font-size: 22px; }
  .state-pills a, .county-list a, .pay-find .btn, .ask-row input, .btn { min-height: 44px; }
}
@media (max-width: 800px) {
  .state-pills a { min-height: 44px; font-size: 16px; }
}
`;

export const CLIENT_JS = `
(() => {
  document.querySelectorAll("[data-report]").forEach((link) => {
    try {
      const url = new URL(link.getAttribute("href") || "/report", location.origin);
      url.searchParams.set("from", location.pathname + location.search);
      link.setAttribute("href", url.pathname + url.search);
    } catch {
      /* Keep the server-rendered link. */
    }
  });
  const statePick = document.querySelector("#pick-state");
  const countyPick = document.querySelector("#pick-county");
  const countyWrap = document.querySelector("#pick-county-wrap");
  if (statePick instanceof HTMLSelectElement && countyPick instanceof HTMLSelectElement && countyWrap instanceof HTMLElement) {
    const syncCounty = () => {
      const florida = statePick.value === "florida";
      countyWrap.hidden = !florida;
      countyPick.disabled = !florida;
      if (!florida) countyPick.value = "";
    };
    statePick.addEventListener("change", syncCounty);
    syncCounty();
  }
  const map = document.querySelector("[data-us-map]");
  const mapLabel = document.querySelector("[data-map-label]");
  if (map && mapLabel instanceof HTMLElement) {
    const showName = (event) => {
      const target = event.target instanceof Element ? event.target.closest("a") : null;
      const name = target?.getAttribute("data-name");
      if (name) mapLabel.textContent = name;
    };
    map.addEventListener("mouseover", showName);
    map.addEventListener("focusin", showName);
    map.addEventListener("mouseleave", () => {
      mapLabel.textContent = mapLabel.getAttribute("data-default") || "";
    });
    const openLink = document.querySelector("#map-open");
    let fromTouch = false;
    map.addEventListener("pointerdown", (event) => {
      fromTouch = event.pointerType === "touch";
    });
    map.addEventListener("click", (event) => {
      if (!fromTouch || !(openLink instanceof HTMLAnchorElement)) return;
      const target = event.target instanceof Element ? event.target.closest("a") : null;
      const href = target?.getAttribute("href") || "";
      const raw = target?.getAttribute("data-name") || "";
      if (!href.startsWith("/") || href.startsWith("//")) return;
      event.preventDefault();
      const name = raw.replace(/, live$/, "").replace(/, coming soon$/, "");
      openLink.setAttribute("href", href);
      openLink.textContent = name ? "Open " + name : "Open";
    });
  }
  let touchAt = 0;
  let pinned = null;
  const tipPop = (button) => {
    const id = button.getAttribute("aria-describedby") || button.getAttribute("aria-controls") || "";
    const pop = id ? document.getElementById(id) : null;
    return pop instanceof HTMLElement ? pop : null;
  };
  const buttonForPop = (pop) => {
    const buttons = document.querySelectorAll(".tip-btn");
    for (const button of buttons) {
      const id = button.getAttribute("aria-describedby") || button.getAttribute("aria-controls");
      if (id && pop.id && id === pop.id && button instanceof HTMLButtonElement) return button;
    }
    return null;
  };
  const buttonFrom = (node) => {
    if (!(node instanceof Element)) return null;
    const direct = node.closest(".tip-btn");
    if (direct instanceof HTMLButtonElement) return direct;
    const pop = node.closest(".tip-pop");
    if (pop instanceof HTMLElement) return buttonForPop(pop);
    return null;
  };
  const ownsTip = (button, node) => {
    if (!(node instanceof Node)) return false;
    const tip = button.closest(".tip");
    if (tip?.contains(node)) return true;
    const pop = tipPop(button);
    return !!pop && (pop === node || pop.contains(node));
  };
  const closeTip = (button) => {
    if (pinned === button) pinned = null;
    button.setAttribute("aria-expanded", "false");
    const pop = tipPop(button);
    if (!pop) return;
    pop.hidden = true;
  };
  const closeTips = () => {
    document.querySelectorAll(".tip-btn[aria-expanded='true']").forEach((button) => {
      if (button instanceof HTMLButtonElement) closeTip(button);
    });
    pinned = null;
  };
  const placeTip = (button, pop) => {
    if (pop.parentNode !== document.body) document.body.appendChild(pop);
    pop.hidden = false;
    pop.style.position = "fixed";
    pop.style.zIndex = "80";
    pop.style.right = "auto";
    pop.style.bottom = "auto";
    pop.style.transform = "none";
    pop.style.margin = "0";
    const pad = 8;
    const maxWidth = Math.min(280, Math.max(0, window.innerWidth - pad * 2));
    pop.style.maxWidth = maxWidth + "px";
    pop.style.width = maxWidth + "px";
    pop.style.maxHeight = "";
    pop.style.overflow = "visible";
    const anchor = button.getBoundingClientRect();
    let left = anchor.left;
    if (left + maxWidth > window.innerWidth - pad) left = window.innerWidth - pad - maxWidth;
    if (left < pad) left = pad;
    pop.style.left = left + "px";
    let top = anchor.bottom + 6;
    pop.style.top = top + "px";
    const box = pop.getBoundingClientRect();
    if (box.bottom > window.innerHeight - pad) top = anchor.top - box.height - 6;
    if (top < pad) top = pad;
    const room = Math.max(0, window.innerHeight - pad - top);
    if (room > 0 && box.height > room) {
      pop.style.maxHeight = room + "px";
      pop.style.overflow = "auto";
    }
    pop.style.top = top + "px";
    const placed = pop.getBoundingClientRect();
    if (placed.left < pad) pop.style.left = pad + "px";
    if (placed.right > window.innerWidth - pad) pop.style.left = Math.max(pad, window.innerWidth - pad - placed.width) + "px";
  };
  const openTip = (button, pin) => {
    document.querySelectorAll(".tip-btn[aria-expanded='true']").forEach((other) => {
      if (other !== button && other instanceof HTMLButtonElement) closeTip(other);
    });
    const pop = tipPop(button);
    if (!pop) return;
    if (pin) pinned = button;
    else if (pinned !== button) pinned = null;
    button.setAttribute("aria-expanded", "true");
    placeTip(button, pop);
  };
  const onScroll = () => {
    if (document.querySelector(".tip-btn[aria-expanded='true']")) closeTips();
  };
  document.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") touchAt = Date.now();
  });
  document.addEventListener("pointerover", (event) => {
    if (event.pointerType !== "mouse" || Date.now() - touchAt < 700) return;
    const button = buttonFrom(event.target);
    if (button) openTip(button, false);
  });
  document.addEventListener("pointerout", (event) => {
    if (event.pointerType !== "mouse" || Date.now() - touchAt < 700) return;
    const button = buttonFrom(event.target);
    if (!button || button === pinned) return;
    if (ownsTip(button, event.relatedTarget)) return;
    closeTip(button);
  });
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest(".tip-btn");
    if (button instanceof HTMLButtonElement) {
      event.preventDefault();
      if (button === pinned) closeTip(button);
      else openTip(button, true);
      return;
    }
    if (target?.closest(".tip") || target?.closest(".tip-pop")) return;
    closeTips();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const open = document.querySelector(".tip-btn[aria-expanded='true']");
    if (!(open instanceof HTMLButtonElement)) return;
    closeTips();
    open.focus();
  });
  window.addEventListener("scroll", onScroll, true);
  document.addEventListener("scroll", onScroll, true);
  const form = document.querySelector("[data-busy]");
  if (!form) return;
  form.addEventListener("submit", () => {
    const button = form.querySelector("button[type=submit]");
    if (button) {
      button.setAttribute("aria-busy", "true");
      button.textContent = "Working";
    }
  });
})();
`;
