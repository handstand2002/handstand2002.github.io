---
name: diagram
description: Generate animated diagram YAML for this project from a plain-English description, then convert it to a shareable viewer/editor URL. Use when the user wants to create, animate, or share an animated diagram (e.g. "a message queue with two consumers").
argument-hint: "Description of the diagram to animate, or a path to an existing .yaml file"
allowed-tools: ["Bash(.claude/skills/diagram/yaml-to-url.sh:*)", "Bash(open:*)"]
---

You create animated diagram YAML for this project and turn it into a shareable URL.

## User's request

$ARGUMENTS

## What to do

- If the request is a **description**, generate a complete YAML file for it (see schema below), then produce the URL.
- If the request is a **path to an existing `.yaml` file**, skip generation and just produce the URL for it.
- If the request is **empty**, use the most recent YAML in the conversation.

To produce the URL, write the YAML to a temp file and run:

```
.claude/skills/diagram/yaml-to-url.sh /tmp/diagram.yaml
```

Print the resulting URL on its own line so it is easy to copy.

Then **open the URL in the user's default browser** by running `open "<url>"` (macOS), unless the user asked you not to open it (e.g. "don't open", "just give me the link", "no browser"). If you skip opening for this reason, note that you did so.

---

## YAML schema reference

### Top-level structure (all fields)

```yaml
mode: PLAIN | STEP          # required
canvas:
  width: <number>
  height: <number>
  background:
    color: <color>
config:                      # STEP mode only
  frameRate: <integer>
  step:
    duration:
      default: <ms>
      max: <ms>
      objCountCoefficient: <number>
    interval:
      default: <ms>
      max: <ms>
      objCountCoefficient: <number>
color:
  palette: <palette-name>    # e.g. spring-pastels
template:
  object:
    - name: <string>
      <ObjectProperties>
  transition:
    - name: <string>
      <TransitionProperties>
anchors:
  - name: <string>
    x: <number>
    y: <number>
objects:
  - name: <string>
    <ObjectProperties>
# PLAIN mode:
transitions:
  - name: <object-name>
    timeStart: <ms>
    timeEnd: <ms>
    <TransitionProperties>
# STEP mode:
steps:
  - durationMultiplier: <number>   # optional
    nextInterval: <number>         # optional
    transitions:
      - name: <object-name>
        <TransitionProperties>
```

### Object properties

```yaml
templates:            # list of template names to merge in
  - <string>
icon:
  shape: rectangle | star | cloud | database | line | line-arrow | arrow | cat | dog
  color: <color>
  outline:
    thickness: <number>
    color: <color>
  size: <number>      # star, cloud, cat, dog only
  width: <number>     # rectangle, database, line, line-arrow, arrow only
  height: <number>    # same
position:
  x: <number>
  y: <number>
  z: <number>         # drawing order; higher = on top
  anchor: <string>    # reference a named anchor instead of x/y
label:
  value: <string>
  offsetX: <number>
  offsetY: <number>
  font: <css-font>    # e.g. '17px Arial'
  style: bold | italic | ...
  color: <color>
```

### Transition properties

```yaml
strategy: linear | cosine | <t => expr>   # default linear
position:
  x.start: <number>   x.end: <number>
  y.start: <number>   y.end: <number>
  z.start: <number>   z.end: <number>
  anchor.start: <string>   anchor.end: <string>
icon:
  color.start: <color>      color.end: <color>
  size.start: <number>      size.end: <number>
  width.start: <number>     width.end: <number>
  height.start: <number>    height.end: <number>
  outline:
    thickness.start: <number>   thickness.end: <number>
    color.start: <color>        color.end: <color>
```

> ⚠️ **Label properties are NOT animatable.** The animation loop
> (`script.js` `animateDiagram`) only interpolates `position`, `icon.size/width/height`,
> `icon.color`, and `icon.outline.thickness/color`. It never touches `label` — so
> `label.value`, `label.color.*`, and `label.offset*.*` in a transition are **silently
> ignored**. An object's text and label color are fixed for the whole animation at
> whatever the object definition sets.
>
> **Implication:** you cannot morph text (e.g. animate `"cat"` → `4937` → a vector) by
> swapping `label.value` across steps — the box keeps its original text and only its
> shape/position/color will move. To show a value *changing*, give each value its own
> object with fixed text and reveal them in sequence (see design tip 7).

### Colors

- CSS strings: `"#RRGGBB"`, `"red"`, `"rgba(0,0,0,0.5)"`, etc.
- Palette shortcuts `p0`–`p8` reference the active `color.palette`.

---

## Mode choice guide

- **STEP** — preferred for most diagrams. Group related transitions into steps; the engine computes timing automatically. Use `objCountCoefficient` to scale duration/interval with the number of moving objects per step.
- **PLAIN** — use when you need precise millisecond control over overlapping or offset animations. Each transition needs explicit `timeStart`/`timeEnd`.

## Design tips

1. Define `anchors` for all meaningful positions — avoids hardcoded coordinates and makes templates reusable.
2. Use `template.object` with a `default` entry to set font/style once.
3. Moving elements (messages, packets, arrows) should start at their source anchor with `z: 999` so they render on top.
4. In STEP mode, each step should transition one logical "event." Concurrent events in the same step animate in parallel.
5. For smooth movement use `strategy: cosine`; for mechanical/digital use `strategy: linear`.
6. Keep canvas ≤ 600×600 for the default viewer window.
7. **Text is fixed per object** (see the label warning above). To depict a value transforming
   through stages, model each stage's value as a separate object with its own fixed text, then
   reveal them one per step — e.g. start them off-canvas (`x: -320`) and slide them into place
   with a `position: { x.end: ... }` transition. The label rides along with the position. This
   is how the "build up a pipeline" style diagrams work.
8. Keep the generated hash under ~1700 chars (compact YAML: trim comments and long unique
   strings). macOS `open` truncates URLs near ~2048 chars, which corrupts the gzip and yields
   "invalid distance too far back" in the viewer. For larger diagrams, hand the user the URL as
   copy-paste text instead of relying on `open`.

---

When you generate YAML, output it in a fenced ` ```yaml ` block, followed by a 2–3 sentence description of what the animation shows and how it loops, then the URL on its own line.
