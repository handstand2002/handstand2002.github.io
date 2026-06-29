---
name: diagram
description: Generate animated diagram YAML for this project from a plain-English description, then convert it to a shareable viewer/editor URL. Use when the user wants to create, animate, or share an animated diagram (e.g. "a message queue with two consumers").
argument-hint: "Description of the diagram to animate, or a path to an existing .yaml file"
allowed-tools: ["Bash(.claude/skills/diagram/yaml-to-url.sh:*)", "Bash(open:*)"]
---

You create animated diagram YAML for this project and turn it into a shareable URL.

## Purpose: diagrams should teach

The goal of every diagram is to be **instructive**. The user is trying to understand
or explain *how something works*, so prioritize the details that matter to them:

- Show the real moving parts and the data/messages that flow between them, with labels
  that name what each thing actually is (don't leave boxes generic — name the queue, the
  request, the ack, etc.).
- Favor concrete, specific labels over abstract ones. If the user mentions a protocol,
  payload, or field, surface it in the animation.
- The animation itself carries the explanation — use motion to show *order* and
  *causality*, not just decoration.

**Avoid sequence diagrams.** Classic UML-style sequence diagrams (lifelines + arrows down
the page) are less intuitive here precisely because they're static; we have animation that
makes the timing obvious without the reader decoding a grid. When you'd reach for a
sequence diagram, build the [communication pattern](#communication-between-objects) below
instead.

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
  align: center | left | right | start | end   # horizontal alignment; default center
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

> ⚠️ **Label text and offset are NOT animatable; label color IS.** The animation loop
> (`script.js` `animateDiagram`) interpolates `position`, `icon.size/width/height`,
> `icon.color`, `icon.outline.thickness/color`, **and `label.color`**. It does **not** touch
> `label.value` or `label.offset*` — those in a transition are **silently ignored**, so an
> object's text and label offset are fixed for the whole animation.
>
> **Implication:** you cannot morph text (e.g. animate `"cat"` → `4937` → a vector) by
> swapping `label.value` across steps — the box keeps its original text and only its
> shape/position/color (including label *color*) will move. To show a value *changing*, give
> each value its own object with fixed text and reveal them in sequence (see design tip 7). To
> recolor text in place (e.g. turn a checklist line green when done), animate
> `label: { color.end: <color> }` on that object.

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

## Communication between objects

When the user wants to illustrate two (or more) things talking to each other — a client
and server, a producer and consumer, two services exchanging messages — **do not** use a
sequence diagram. Build a simple spatial diagram instead:

1. Draw the **participants** as a small number of clearly-labeled objects (e.g. two boxes
   or a box + a database), placed at fixed anchors and held still for the whole animation.
2. Model each **message** as its own object (label it with what the message *is* — e.g.
   `"SYN"`, `"request"`, `"ack"`, `"row data"`). Give messages `z: 999` so they ride on
   top of the participants.
3. In STEP mode, each step moves one message from its sender's anchor to its receiver's
   anchor (`position.anchor.end`). Messages travel back and forth between the participants,
   one logical exchange per step. Use `strategy: cosine` for a natural send/receive feel.

This reads as "objects exchanging messages over time," which the animation makes
self-explanatory.

### Step checklist

For these communication diagrams (and any multi-step explanation), **include a step
checklist** so the viewer can follow exactly which step is happening at any moment, can see
which steps are already done, and can tell when the loop restarts.

**Default placement: bottom-left** of the canvas, as a vertical list (one text object per
step). Reserve a narrow left "gutter" column for the running/done indicators and center the
step text just to the right of it. Move it elsewhere only if the user asks (e.g. "put the
checklist on the right"). For a tidy left edge on a column of differing-length lines, set
`label.align: left` on the step text and anchor each line at the same x — otherwise labels
default to center-aligned and the column will be ragged.

The checklist has three moving pieces:

1. **Running indicator** — a single marker icon (a `star` works well; amber/`#fbbf24`) that
   sits in the gutter next to the step currently animating. Keep it **firmly parked** on the
   active item while that step's action plays — don't slide it concurrently with the message
   (a drifting marker reads as "in between" rather than "on this step"). Instead **teleport**
   it to the new item *at the start of the **next** step*, so it jumps the instant the previous
   step completes and then holds still. To teleport with no interpolation, give the marker
   transition the same `anchor.start` **and** `anchor.end` (both = the destination slot): the
   transition's first frame is already at the target, so there's no slide. The marker therefore
   has **no** transition in the first action step (it's already parked there); a final cleanup
   step teleports it off-canvas to a `park` anchor so the finished list shows no "running" step.

   > 💡 **Instant snap trick:** setting `anchor.start` == `anchor.end` (or `x.start` == `x.end`,
   > etc.) makes any object jump to a position with zero interpolation at the moment its
   > transition begins. Handy for state changes that should be discrete, not animated.
2. **Completed-text recolor** — the "turn the line green when done" effect. Because
   `label.color` **is** animatable, recolor the line *in place* on the step's own text object
   when the step completes. **Snap it instantly** by default — set `label: { color.start: <green>,
   color.end: <green> }` (the start==end snap trick) so the line flips to green discretely,
   matching the teleported marker and checkmark. (A `cosine` fade via `color.end` alone also
   works if you specifically want a gradual gray→green transition, but instant is the cleaner
   default for a discrete "done" state.) Don't overlay a green duplicate that slides in from
   off-canvas — the slide looks bad and is no longer necessary.
3. **Done checkmark** — a green `✓` *label* object per step (there is no checkmark icon
   shape, so the check is a green text glyph on an invisible `line` carrier). Its text can't
   animate, so park it just off the left edge and **teleport** it into the gutter when its step
   completes using the instant-snap trick (`anchor.start` == `anchor.end` == its gutter slot) —
   again, no slide.

**Timing — "complete" means the message arrived.** Recolor step *N*'s line and reveal its
checkmark in step *N+1* (not during step *N*), so a line only goes green once its exchange has
actually landed. The last step therefore needs a trailing cleanup step that recolors the
final line, reveals its checkmark, and parks the running marker.

Because the engine re-clones the original objects every loop (`animateDiagram` in
`script.js`), all of this **resets automatically when the animation restarts** — the marker
jumps back to step 1, every line returns to gray, and every checkmark snaps back off-canvas.
That reset is the visual cue that the loop has started over; no extra step is needed to undo it.

Sketch of the mechanic (STEP mode, gutter `g*` = indicator slots, `t*` = text left edges):

```yaml
template:
  object:
    - name: step                                   # pending line (gray, left-aligned column)
      icon: { shape: line, width: 0, height: 0 }
      label: { font: '14px Arial', color: '#94a3b8', align: left }
    - name: done                                   # checkmark glyph (green)
      icon: { shape: line, width: 0, height: 0 }
      label: { font: 'bold 18px Arial', color: '#22c55e', align: left }
anchors:
  - { name: t1, x: 55, y: 222 }    # ...t2, t3: text left edges, bottom-left (shared x)
  - { name: g1, x: 35, y: 222 }    # ...g2, g3: gutter slots
  - { name: park, x: 700, y: 180 } # off-canvas parking for the running marker
objects:
  - { name: line1, templates: [step], position: { anchor: t1, z: 1 }, label: { value: '1. Client -> Server: SYN' } }
  # ...line2, line3
  - { name: check1, templates: [done], position: { x: -60, y: 222, z: 6 }, label: { value: '✓' } }
  # ...check2, check3 (parked off-canvas left, teleport into g*)
  - { name: marker, icon: { shape: star, size: 15, color: '#fbbf24' }, position: { anchor: g1, z: 1000 } }
steps:
  - transitions:                                   # step 1 runs (SYN flies); marker already parked on line 1, no marker transition
      # ...syn message transition
  - transitions:                                   # step 2 runs; step 1 is now DONE
      - { name: marker, position: { anchor.start: g2, anchor.end: g2 } }                 # teleport marker to line 2
      - { name: line1, label: { color.start: '#22c55e', color.end: '#22c55e' } }         # snap line 1 to green in place
      - { name: check1, position: { anchor.start: g1, anchor.end: g1 } }                 # teleport check into gutter
      # ...synack message transition
  # ...step 3 recolors line2 + reveals check2, then a final cleanup step recolors line3,
  #    reveals check3, and teleports marker to park
```

---

When you generate YAML, output it in a fenced ` ```yaml ` block, followed by a 2–3 sentence description of what the animation shows and how it loops, then the URL on its own line.
