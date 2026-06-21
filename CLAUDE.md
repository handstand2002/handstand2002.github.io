# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running locally

Requires Python 3. Start a local HTTP server from the repo root:

```bash
./server-start.sh
# or equivalently:
python3 -m http.server
```

Then open `http://localhost:8000` for the editor (`index.html`) or `http://localhost:8000/viewer.html` for the viewer.

There are no build steps, package managers, or tests — this is a static, vanilla-JS browser app.

## Architecture

The project is a browser-based animated diagram tool. The user writes YAML describing objects and their movements; the app renders them on an HTML5 Canvas and can export a GIF.

**Two pages:**
- `index.html` — editor: YAML textarea on the left, canvas preview in the center, action buttons (Load, Animate, Generate GIF) on the right. Loads local copies of js-yaml and gif.js from `lib/`.
- `viewer.html` — viewer-only: hides the editor UI, reads the YAML from the URL hash (gzip-compressed, base64-encoded), and animates in a loop forever. Loads js-yaml and gif.js from CDN.

**One script:** `script.js` is shared by both pages (loaded with `defer`). It handles all YAML parsing, canvas drawing, animation, and GIF export. There is no module system — everything is global.

**Two animation modes** (set by `mode:` in YAML):
- `PLAIN` — transitions have explicit `timeStart`/`timeEnd` in milliseconds.
- `STEP` — transitions are grouped into steps; timing is computed automatically based on `config.step.duration` and `config.step.interval` (with `objCountCoefficient` scaling duration/interval by the number of objects in the step).

**Key data flow in `script.js`:**
1. `parseYAML()` → dispatches to `parsePlain()` or `parseStep()` based on `mode`.
2. Both parsers call `preProcessElements()` which: applies object templates (merging named templates onto objects), resolves `anchor:` positions, sets property defaults via `EXPECTED_PROPERTIES`, and validates required/extraneous props.
3. `preProcessTransition()` applies transition templates and resolves anchor-based start/end positions.
4. `drawDiagram()` renders all objects sorted by `position.z` (then define order). Icons are drawn centered at `(x, y)`.
5. `animateDiagram()` drives a `requestAnimationFrame` loop. For each frame, active transitions mutate element properties in-place using `interpolate()` (linear, cosine, or a custom arrow-function strategy). After the animation duration, a repeat is scheduled via `setTimeout` when `runForever=true` (viewer mode).
6. Captured frames are stored in `frames[]` and can be exported to GIF via `createGIF()`.

**URL sharing:** "Load YAML" compresses the YAML (gzip + base64) into the URL hash and updates the viewer URL input. The viewer page decompresses the hash on load.

## YAML schema

See `README.md` for the full EBNF grammar. Key points:
- `mode: PLAIN | STEP` is required at the top level.
- Objects use `position.anchor` to reference named anchors (defined under `anchors:`), avoiding hardcoded coordinates.
- Color values can be CSS strings, hex codes, or palette shortcuts `p0`–`p8` referencing the active `color.palette`.
- Templates (under `template.object` and `template.transition`) are applied in order; a template named `default` is always applied last as a fallback.
- In STEP mode, `timeStart`/`timeEnd` on transitions are forbidden — they are computed automatically.

## Sample files

`samples/` contains runnable examples. `sample-step-full.yaml` is the most complete example, demonstrating anchors, templates, color palette shortcuts, and step-based animation.
