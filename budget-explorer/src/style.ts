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
  --serif: "Fraunces", "Iowan Old Style", Palatino, "Palatino Linotype", serif;
  --sans: "IBM Plex Sans", "Segoe UI", Helvetica, Arial, sans-serif;
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
.filters { display: grid; grid-template-columns: 1.4fr 0.7fr 1fr 1fr 0.7fr 0.85fr 0.85fr auto; gap: 12px; align-items: end; }
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
.footer-report a { font-size: 20px; font-weight: 650; color: var(--navy); }
.legend { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; }
.donut-row { display: flex; gap: 22px; align-items: center; }
.icon { width: 18px; height: 18px; vertical-align: -3px; margin-right: 6px; }
.ask-hero h2 { font-size: 32px; }
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
.kpi { padding: 26px 28px; min-width: 0; overflow: hidden; }
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
.spend-row { grid-template-columns: minmax(0, 1.35fr) minmax(0, 0.95fr) minmax(0, 0.9fr); }
.spend-row > .card, .income-card, .source-block, .reserve-fund, .budget-year { min-width: 0; }
.income-card .donut { width: min(260px, 100%); }
.income-card .donutwrap { flex-direction: column; align-items: center; gap: 8px; }
.income-card .dn1 { font-size: 18px; }
.income-card .dn2 { font-size: 10px; }
.income-card .lgs { width: 100%; }
.income-card a.lg { grid-template-columns: 14px minmax(0, 1fr) auto; gap: 6px; font-size: 13px; padding: 4px 0; }
.income-card .donut-label { font-size: 13px; overflow-wrap: anywhere; }
.income-card .donut-amt { display: none; }
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
.more-links { display: flex; flex-wrap: wrap; gap: 8px 16px; margin: 12px 0 0; }
.more-links a { font-weight: 600; }
.holder-list { list-style: none; padding: 0; margin: 0; }
.holder-list li { display: flex; flex-wrap: wrap; gap: 6px 12px; justify-content: space-between; padding: 8px 0; border-top: 1px solid var(--line); min-width: 0; }
.holder-list b { overflow-wrap: anywhere; }
.holder-list span { flex-basis: 100%; color: var(--muted); font-size: 14px; }
.fund-savings { margin-bottom: 24px; }
@media (max-width: 1100px) {
  .spend-row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .spend-row .income-card { grid-column: 1 / -1; }
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
  .ask-hero h2 { font-size: 28px; }
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
  .income-card .donut { width: min(260px, 100%); }
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
.door-note { background: #14232f; color: #e4eaf0; text-align: center; font-size: 18px; line-height: 1.4; padding: 12px 16px; }
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
.florida-wrap { max-width: 720px; margin: 0 auto; }
.florida-map { max-width: 640px; margin: 14px auto 0; overflow: visible; }
.florida-map .county-map { width: min(640px, 100%); max-height: 360px; height: auto; margin: 0 auto; overflow: visible; }
.florida-map .map-note { margin-top: 20px; }
.florida-hero { padding-bottom: 16px; }
.florida-hero .map-action { max-width: 640px; margin: 12px auto 0; }
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
  .florida-map .county-map { max-height: 190px; }
  .florida-hero h1 { font-size: 34px; }
  .florida-hero .explainer { font-size: 18px; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  .us-map a path, .county-map a path { transition: none; }
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
