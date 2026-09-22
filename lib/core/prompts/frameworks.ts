/**
 * Framework guidance for builder agents.
 *
 * Two things here are easy to underestimate:
 *
 *  1. The multi-file rule. Agents run one after another over a shared
 *     filesystem; if two write the same file, one silently loses. Every feature
 *     gets its own file, and the scaffold task creates them all as stubs.
 *
 *  2. Concrete file layouts and script-tag wiring. Without them agents invent a
 *     different structure every run, and the code drawer becomes unreadable.
 *
 * `canvas` is the default: no dependencies, small output, and a child can
 * actually read the result — which is the whole point of the code drawer.
 */

import type { Framework, ProjectKind } from "../spec"

const MULTI_FILE = `### File ownership (important)
Agents work one at a time over the same project folder. If two agents write the same file, one silently overwrites the other and the project breaks. So:
- Every feature lives in its own file.
- The scaffold task creates ALL files, each with a working stub.
- Later tasks fill in the file they own. They never create files that already exist.
- Shared numbers and colours live in src/config.js. Nothing else duplicates them.`

const CANVAS = `## How to build this: plain HTML canvas
No libraries. Everything is hand-written, because the child will read this code.

${MULTI_FILE}

File layout:
\`\`\`
index.html         loads every script in order, holds the <canvas>
src/config.js      shared constants: colours, sizes, speeds
src/state.js       the game state object and reset()
src/input.js       keyboard handling, writes into state.keys
src/player.js      the player: update + draw
src/enemies.js     obstacles/enemies: spawn, update, draw, collide
src/hud.js         score, lives, game over screen
src/main.js        the loop: requestAnimationFrame, calls update then draw
\`\`\`

index.html wires them with plain script tags, in dependency order:
\`\`\`html
<canvas id="stage" width="480" height="360"></canvas>
<script src="src/config.js"></script>
<script src="src/state.js"></script>
<script src="src/input.js"></script>
<script src="src/player.js"></script>
<script src="src/enemies.js"></script>
<script src="src/hud.js"></script>
<script src="src/main.js"></script>
\`\`\`

Patterns:
- Each file attaches to the global scope: \`const Player = { update(){}, draw(ctx){} }\`.
- src/main.js owns the only requestAnimationFrame loop. Nothing else starts one.
- Clear the canvas once per frame at the top of draw, never inside a module.
- Keyboard: one keydown/keyup pair in src/input.js writing \`State.keys[e.key]\`. Call \`e.preventDefault()\` for arrow keys so the page does not scroll.
- Drawing only: \`ctx.fillRect\`, \`ctx.arc\`, \`ctx.fillText\`, \`ctx.roundRect\`. No image files — the sandbox has no art assets.
- Persistence: \`localStorage.getItem/setItem\`, wrapped in try/catch.

Anti-patterns:
- Do NOT put the whole game in one file.
- Do NOT add a bundler, npm package, or module system. Plain scripts only.
- Do NOT call getElementById at the top of a file that loads before the canvas — read it inside an init function that src/main.js calls.
- Do NOT reference a const declared later in the file from a function that runs at load time.`

const PHASER = `## How to build this: Phaser 3
Phaser is already vendored at lib/phaser.min.js. Do not install anything.

${MULTI_FILE}

File layout:
\`\`\`
index.html              loads Phaser, then every scene, then creates the game
src/config.js           shared constants
scenes/BootScene.js     creates simple shapes/textures, then starts GameScene
scenes/GameScene.js     the gameplay
scenes/UIScene.js       HUD overlay, runs alongside GameScene
scenes/GameOverScene.js game over and restart
\`\`\`

index.html:
\`\`\`html
<script src="lib/phaser.min.js"></script>
<script src="src/config.js"></script>
<script src="scenes/BootScene.js"></script>
<script src="scenes/GameScene.js"></script>
<script src="scenes/UIScene.js"></script>
<script src="scenes/GameOverScene.js"></script>
<script>
  new Phaser.Game({
    width: 480, height: 360, parent: 'game',
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 } } },
    scene: [BootScene, GameScene, UIScene, GameOverScene],
  });
</script>
\`\`\`

Patterns:
- One scene class per file, on the global scope: \`class GameScene extends Phaser.Scene { constructor(){ super('GameScene') } }\`.
- Switch scenes with \`this.scene.start('GameScene')\`; run the HUD in parallel with \`this.scene.launch('UIScene')\`.
- Talk between scenes with events: \`this.events.emit('scoreChanged', v)\`.
- Use built-in shapes (\`this.add.rectangle\`, \`this.add.circle\`) — there are no image assets.
- Input: \`this.cursors = this.input.keyboard.createCursorKeys()\`.

Anti-patterns:
- Do NOT put two scenes in one file.
- Do NOT use a raw canvas element; Phaser creates its own.
- Do NOT load external images or audio.`

const P5 = `## How to build this: p5.js
p5 is already vendored at lib/p5.min.js. Do not install anything.

${MULTI_FILE}

File layout:
\`\`\`
index.html        loads p5, then every module in order
src/config.js     shared constants
src/player.js     Player class
src/enemies.js    enemy/obstacle classes
src/hud.js        score and menus
src/sketch.js     setup() and draw(), orchestrates the modules — LOADS LAST
\`\`\`

Patterns:
- p5 calls global \`setup()\` and \`draw()\`; both live only in src/sketch.js.
- Other files define classes or plain objects and do not call p5 functions at load time.
- \`createCanvas(480, 360)\` goes in setup(), never at module scope.
- Input: \`keyIsDown(LEFT_ARROW)\` inside draw().

Anti-patterns:
- Do NOT define setup() or draw() in more than one file.
- Do NOT call p5 drawing functions before setup() has run.`

const WEBSITE = `## How to build this: a plain website
No framework, no build step. Hand-written HTML, CSS and JavaScript, because the child will read it.

${MULTI_FILE}

File layout:
\`\`\`
index.html        the whole page structure
styles/base.css   variables, reset, layout
styles/theme.css  colours, fonts, the chosen mood
src/main.js       interactions (buttons, counters, small animations)
\`\`\`

index.html links them plainly:
\`\`\`html
<link rel="stylesheet" href="styles/base.css">
<link rel="stylesheet" href="styles/theme.css">
<script defer src="src/main.js"></script>
\`\`\`

Patterns:
- Semantic HTML: header, nav, main, section, footer. One h1 per page.
- CSS custom properties in :root for every colour and size, so the theme file can change the whole feel.
- Responsive by default: a single \`grid-template-columns: repeat(auto-fit, minmax(150px, 1fr))\` beats media queries here.
- Accessibility is not optional: every image needs alt text, every input needs a label, buttons must be real <button> elements, and focus styles must stay visible.
- \`defer\` on the script so the DOM exists before it runs.
- Persistence: localStorage in a try/catch.

Anti-patterns:
- Do NOT use React, Tailwind, or any CDN dependency.
- Do NOT put styles inline in the HTML.
- Do NOT use a div with a click handler where a <button> belongs.
- Do NOT ask for a real name, address, school, or photo.`

const ARDUINO = `## How to build this: an ESP32 sketch
This project runs on a microcontroller, not in a browser. There is no screen, no
DOM and no window. Write an Arduino sketch a child can open and upload.

${MULTI_FILE}

File layout:
\`\`\`
sketch/sketch.ino    setup() and loop() - the only file the Arduino IDE opens
sketch/pins.h        every pin number, named once
sketch/README.md     what to wire where, and how to upload it
\`\`\`

The .ino file must be inside a folder of the same name. The Arduino IDE requires
that, and a child double-clicks it.

Patterns:
- Put every pin in pins.h as \`const int LED_PIN = 13;\`. Never repeat a raw pin
  number anywhere else.
- \`setup()\` calls \`pinMode\` for every pin, then \`Serial.begin(115200)\`.
- Print what is happening with \`Serial.println\` so a child can watch it in the
  Serial Monitor. This is the only way they can see inside a board.
- Read a button with \`INPUT_PULLUP\` and treat LOW as pressed. Say so in a comment,
  because it surprises everyone the first time.
- Debounce a button by remembering the last change time in a \`unsigned long\`.
- Keep \`loop()\` short and readable: one named function per behaviour.

Anti-patterns:
- Do NOT use \`delay()\` for anything a child will wait on. It freezes the whole
  board, including buttons. Use \`millis()\` to check whether enough time has
  passed.
- Do NOT use WiFi, Bluetooth, HTTP or MQTT unless a brick explicitly asks for it.
- Do NOT write to pins the child did not list. Extra pins may have something else
  attached, and writing to the wrong one can damage a board.
- Do NOT use pins 6-11 on a classic ESP32 board; they are wired to flash memory.
- Do NOT invent a library. Only the Arduino core and what the child listed.

README.md must contain, in plain language a 10-year-old can follow: a wiring list
(one line per part, naming the pin), and the upload steps (open the folder in the
Arduino IDE, pick the ESP32 board, pick the port, press upload).`

const BY_FRAMEWORK: Record<Framework, string> = {
  canvas: CANVAS,
  phaser: PHASER,
  p5: P5,
  arduino: ARDUINO,
  none: WEBSITE,
}

/**
 * The error bridge.
 *
 * The project runs on a different origin from the studio, so a crash inside it
 * is invisible to us — which means Dr. Bug has nothing to explain. Five lines in
 * index.html fix that, and they are five lines a child can read and understand.
 */
const ERROR_BRIDGE = `### Report errors to the helpers
Put this in the <head> of index.html, before any other script. It lets Dr. Bug see crashes and explain them to the child.
\`\`\`html
<script>
  window.onerror = function (message, source, line) {
    parent.postMessage({ type: 'lamine:error', message: message + ' (line ' + line + ')' }, '*');
  };
</script>
\`\`\`
Do not add any other postMessage call, and do not send anything else to the parent page.`

/** Guidance block to append to a builder's system prompt. */
export function frameworkGuidance(
  framework: Framework,
  kind: ProjectKind
): string {
  // A board has no window.onerror to report from, so the browser error bridge
  // would be instructions for an API that does not exist there.
  if (kind === "device") return ARDUINO

  // A website never wants game-loop guidance even if the block said "canvas".
  const base =
    kind === "website" ? WEBSITE : (BY_FRAMEWORK[framework] ?? CANVAS)
  return `${base}\n\n${ERROR_BRIDGE}`
}

/** Files the scaffold task is expected to create, used to sanity-check plans. */
export function expectedScaffold(
  framework: Framework,
  kind: ProjectKind
): string[] {
  if (kind === "device") {
    return ["sketch/sketch.ino", "sketch/pins.h", "sketch/README.md"]
  }
  if (kind === "website") {
    return ["index.html", "styles/base.css", "styles/theme.css", "src/main.js"]
  }
  switch (framework) {
    case "phaser":
      return [
        "index.html",
        "src/config.js",
        "scenes/BootScene.js",
        "scenes/GameScene.js",
        "scenes/UIScene.js",
        "scenes/GameOverScene.js",
      ]
    case "p5":
      return [
        "index.html",
        "src/config.js",
        "src/player.js",
        "src/enemies.js",
        "src/hud.js",
        "src/sketch.js",
      ]
    default:
      return [
        "index.html",
        "src/config.js",
        "src/state.js",
        "src/input.js",
        "src/player.js",
        "src/enemies.js",
        "src/hud.js",
        "src/main.js",
      ]
  }
}
