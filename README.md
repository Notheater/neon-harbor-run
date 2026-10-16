# NEON HARBOR RUN — Tokyo Night Runner

**Play now:** [https://notheater.github.io/neon-harbor-run/](https://notheater.github.io/neon-harbor-run/)

On a phone, open that link in Chrome or Safari and use **Add to Home Screen** — it installs like an app (no store account). Share the same link with anyone.

A Temple-Run-style endless runner built with plain JavaScript and Three.js. You have stolen the Crimson Lotus gang's data shards and they are right behind you. Sprint down endless rain-slick neon streets, switch lanes, jump barriers, slide under gates, take the 90° corners and grab shards. Two mistakes and the gang catches you.

> **Status:** early playable prototype (the open-world build is v0.3 and is kept separately). The gameplay logic is covered by automated headless tests, but visuals, frame rate and feel have **not** been checked in a real browser by the author of this build — see *Known limitations*.

## How to play
- You run automatically; speed ramps from 16 to 34 over about a minute.
- **Lanes:** `A`/`D` or `←`/`→` switch between 3 lanes.
- **Corners:** when a corner approaches, a big **TURN LEFT / TURN RIGHT** prompt appears. Press that direction key before the junction (within ~26 m). Missing it costs a stumble, then you auto-turn.
- **Jump** (`W`, `↑` or `Space`) over low barriers. **Slide** (`S`, `↓` or `Shift`) under overhead gates (in the air it fast-falls into a slide). **Switch lane** around walls.
- **Shards:** collect for +10 score each. **Score** = metres run + 10 per shard; your best is saved in the browser.
- **The gang:** each stumble closes the gap by 6 m (and slows you). Run clean for 3 s and they fall back again. If the gap reaches ~2 m you are caught.
- `Esc` / `P` pauses.
- **XP / levels:** shards +12, clean corner +15, every 200 m +60, no stumbles that stage +25. Level 2 is 220 XP, then +40% per level. Later levels pack denser obstacles and an extra chaser. The run starts faster and ramps harder.

## What is implemented
- Endless procedurally generated course of 40 m chunks with **90° left/right corners**, recycled as you run (only ~9 chunks exist at a time)
- Neon Tokyo street dressing: lit-window buildings, shop windows, awnings, lanterns, katakana/kanji signs, torii arches, wet reflective road, glow decals, rain, painted skyline ring, fog, magenta horizon glow; coloured lights travel with the runner
- Obstacles: low barriers (jump), overhead gates (slide), walls (change lane). Generation guarantees every row keeps a free lane and consecutive free lanes are at most one lane apart, so the course is always dodgeable
- 3 chasing enemies that close in and fall back; stumble/invulnerability/caught logic; score, best score, HUD with gang-distance and speed meters, pause, game-over, restart
- Human-proportioned runners (`human.js`): jointed player in techwear plus Crimson Lotus enforcers in suits, with run / jump / slide / stumble poses
- Simple Web Audio effects, no external assets beyond bundled Three.js

## Run locally
1. Unzip.
2. Double-click **`index.html`** (Chrome, Edge, Safari, or Firefox with WebGL). Three.js r149 is bundled in `vendor/`, so no internet, Python or server is needed.
3. On a phone, send someone the folder (or host it) and open the same `index.html` in the browser. Use the on-screen buttons or swipe. Keyboard and USB/Bluetooth gamepads work on computer. No account.

## Play online
**Live site:** [https://notheater.github.io/neon-harbor-run/](https://notheater.github.io/neon-harbor-run/)

This folder **is** the website: `index.html` at the root, plus `style.css`, `game.js`, `human.js`, and `vendor/`. Host it on any static file server.

**GitHub Pages:** already published from `main`. A custom domain (like neonharbor.run) can be pointed at Pages later if you buy one.

**itch.io:** zip so `index.html` is at the zip root, create an **HTML** project, tick *This file will be played in the browser*, ~1280×720 embed, fullscreen on.

## Testing
`tests/headless-test.js` loads the real `index.html`, `game.js` and Three.js in jsdom (no GPU) and drives the game loop. Run: `cd tests && npm install && npm test`.
It covers: speed ramp; lane switching and clamping; jump height/airtime; barrier/gate/wall rules (correct counter works, wrong or no action stumbles); stumble penalties, invulnerability window, gap recovery and game-over; shard pickup; corner prompt, correct/wrong/early turns and motion continuity through corners; street geometry (no building overlaps a road or another building over 150 chunks); the fairness invariant of every obstacle row; a **perfect-play bot** that runs 6 simulated minutes (≈11,700 m, all corners) with zero stumbles; chunk recycling and a draw-call budget (~420 meshes); pause, resume and restart; no JavaScript errors.
**Not covered:** real WebGL rendering and look, frame rate, audio, font availability for the Japanese signs, and how the controls *feel* to a human.

## Known limitations
- Not verified in a real browser: lighting/fog values are untuned guesses and may need adjusting.
- Neon signs use installed system fonts (Yu Gothic / Meiryo / MS Gothic / Noto CJK…); without a Japanese font they can show empty boxes.
- Keyboard only; no touch/gamepad controls yet. The turn window is generous (26 m) but untested with real players.
- Characters are primitive shapes; there are no hit-reaction or death animations beyond the pose/flash.
- Only one environment theme and three obstacle types so far.
- No licence has been chosen for this project's own code; Three.js (MIT) is bundled with its licence in `vendor/`.

## Roadmap
Real-browser tuning pass, touch/swipe and gamepad controls, power-ups (shield, magnet, dash), more obstacle types and gaps, branching streets, character/enemy animation, bloom/post-processing and better wet-road reflections, daily seeds and a leaderboard, sound and music.
