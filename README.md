# Fathom — Kindle

A bioluminescent deep-sea maze chase. Graze plankton, map the dark with sonar,
and outswim three hunters that follow light, sound, and their own burning flares.
Eating widens your circular view; explored terrain outside it disappears into
the abyss until you return. Clear every mote to descend into a deeper maze.

## Run

Requires Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

Open the local URL Vite prints. All art ships with the game; no account,
backend, remote font, or other service is needed.

## Production

```sh
npm run build
npm run preview
```

The complete static site is in `dist/`, with `index.html` at its root. Serve that
directory unchanged at a server root or beneath a sub-path. Asset URLs resolve
relative to the page.

## Controls

| Control | Action |
| --- | --- |
| Arrows / WASD | Swim; up/down selects menu items |
| Space | Sonar; confirm a menu item |
| Shift | Release ink |
| Enter | Confirm |
| P / Escape | Pause or resume |
| Escape | Return from instructions or game over |
| M | Toggle sound on any screen |
| Pointer / touch | Select and confirm menu items |
| Backtick | Toggle the engine's diagnostic overlay |

Touch devices also have the engine's four-way pad and two ability buttons.
Sonar has a short cooldown and can give your position away to the Gloamfin.
Ink blinds the Lanternjaw and Flarefish, but does not stop sound. Three spare
lives give you four attempts; eaten plankton and remembered terrain survive a
catch. Each cleared maze adds points and more hunters, up to six.

## Development checks

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The simulation runs at 120 fixed ticks per second independently of rendering.
Tests drive it directly and through Simple 2D over a native canvas and counted
frames. `game.initialize` returns the required debug surface; callers access it
through `engine.debug` and apply its immutable poses with `engine.apply`. Nothing
is exposed on the game page. The full game contract is in `specs/`, and engine
API documentation is in `engine/`.

Captured screenshots and a drawing replay are in `showcase/`.
