import { startupBackground } from '../appearance.js'

/** Workbench dark palette (`histoire-app` tokens.pcss), so the handoff keeps the same colors. */
const darkTokens = `
  color-scheme: dark;
  --background: ${startupBackground.dark};
  --surface: rgb(22 23 27);
  --text: rgb(230 231 234);
  --muted: rgb(138 142 151);
  --line: rgb(38 40 45);
  --accent: rgb(52 211 153);
  --danger: rgb(248 113 113);
  --danger-soft: rgb(42 29 31);
`

/** Standalone document exception: must render before project CSS or Vue exists. */
export const startupStyles = `
/* Light palette mirrors workbench home tokens; dark follows the stored app choice, else the system. */
:root {
  color-scheme: light;
  --background: ${startupBackground.light};
  --surface: rgb(255 255 255);
  --text: rgb(24 24 27);
  --muted: rgb(95 99 112);
  --line: rgb(228 228 231);
  --accent: rgb(5 150 105);
  --danger: rgb(220 38 38);
  --danger-soft: rgb(254 242 242);
  --ease-out: cubic-bezier(.2, .8, .2, 1);
}
:root[data-scheme="dark"] {${darkTokens}}
@media (prefers-color-scheme: dark) {
  :root:not([data-scheme="light"]) {${darkTokens}}
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--background);
  color: var(--text);
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}
.startup {
  display: grid;
  place-content: center;
  justify-items: center;
  min-height: 100svh;
  padding: 32px;
  text-align: center;
  animation: startup-enter .4s var(--ease-out);
  transition: opacity .2s ease-in;
}
/* Handoff to the ready workbench fades the screen out before navigation. */
body[data-leaving] .startup { opacity: 0; }
@keyframes startup-enter { from { opacity: 0; } }
.startup h1 { margin: 0; font-size: 30px; font-weight: 600; letter-spacing: -1px; }

/* Wireframe logo: dashes march while working; failure freezes them where they are and greys the drawing. */
.mark { width: 140px; height: 140px; margin-bottom: 24px; overflow: visible; }
.mark rect, .mark path {
  fill: transparent;
  stroke: var(--accent);
  stroke-width: 4;
  stroke-dasharray: 14 10;
  animation: mark-march 1.2s linear infinite;
  transition: stroke .5s;
}
@keyframes mark-march { to { stroke-dashoffset: -24; } }
[data-status="failed"] .mark rect, [data-status="failed"] .mark path, [data-status="closed"] .mark rect, [data-status="closed"] .mark path {
  animation-play-state: paused;
  stroke: var(--muted);
}
/* Entering failure plays one small falter; the animation restarts whenever the state is re-entered. */
[data-status="failed"] .mark { animation: mark-falter .5s var(--ease-out); }
@keyframes mark-falter {
  20% { transform: translateX(-5px) rotate(-1.5deg); }
  45% { transform: translateX(4px) rotate(1deg); }
  70% { transform: translateX(-2px); }
}

/* Status headline: working states shimmer through a clipped gradient. */
#status { margin: 10px 0 0; font-size: 14px; line-height: 1.5; color: var(--muted); }
#status:not([data-tone="failed"]):not([data-tone="closed"]) {
  background: linear-gradient(90deg, var(--muted) 35%, var(--text) 50%, var(--muted) 65%) 0 0 / 300% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: status-shimmer 2s linear infinite;
}
@keyframes status-shimmer {
  from { background-position: 100% 0; }
  to { background-position: 0 0; }
}
#status[data-tone="failed"] { color: var(--danger); }

/* Failure outcome expands from zero height (grid row 0fr to 1fr) and collapses back on restart. */
#outcome {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  visibility: hidden;
  transition: grid-template-rows .4s var(--ease-out), opacity .25s, visibility 0s .4s;
}
[data-status="failed"] #outcome {
  grid-template-rows: 1fr;
  opacity: 1;
  visibility: visible;
  transition: grid-template-rows .4s var(--ease-out), opacity .3s .1s, visibility 0s;
}
#outcome > div { display: grid; justify-items: center; min-height: 0; overflow: hidden; }
#detail {
  max-width: 520px;
  margin: 16px 0 0;
  padding: 12px 14px;
  border: 1px solid var(--danger-soft);
  border-radius: 8px;
  background: var(--danger-soft);
  font: 12.5px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
  text-align: left;
  overflow-wrap: anywhere;
}
#detail:empty { display: none; }
#restart {
  margin: 14px 0 2px;
  padding: 7px 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.2;
  cursor: pointer;
}
#restart:hover { border-color: var(--accent); }
#restart:disabled { opacity: .6; cursor: default; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
`
