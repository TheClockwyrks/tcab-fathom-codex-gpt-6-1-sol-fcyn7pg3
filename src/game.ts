import "./viewport.css";
import type { Game, UpdateApi } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";
import { render } from "./render";
export const BACKGROUND = "#03060c";
export type Direction = "up" | "down" | "left" | "right";
export type Screen =
  | "title"
  | "howto"
  | "countdown"
  | "playing"
  | "paused"
  | "cleared"
  | "gameover";
export interface Body {
  x: number;
  y: number;
  tx: number;
  ty: number;
  dir: Direction;
  moving: boolean;
}
export interface Drifter extends Body {
  lit: boolean;
  mind: boolean;
  travel: boolean;
}
export interface Predator extends Drifter {
  kind: C.PredatorKind;
  state: "den" | "wander" | "chase" | "search";
  released: boolean;
  speed: number;
  alert: boolean;
  detectRange: number | null;
  hearingRange: number | null;
  hearingLock: boolean | null;
  flareCharging: boolean | null;
  flaring: boolean | null;
  flareRadius: number | null;
  fix: [number, number] | null;
  linger: number;
  alertLeft: number;
  mark: number;
  pingIn: number;
  pingGap: number;
  searchTime: number;
  searchPing: boolean;
  chaseSpeed: number;
  flareIn: number;
  flareTime: number;
  fade: number;
  slot: number | null;
}
export interface Pulse {
  source: "forager" | "gloamfin";
  tint: "cyan" | "violet" | "orange";
  ox: number;
  oy: number;
  front: number;
  range: number;
  owner: number | null;
  caught: boolean;
  marks: number[];
}
export interface InkCloud {
  x: number;
  y: number;
  radius: number;
  remaining: number;
}
export interface FathomState {
  version: number;
  screen: Screen;
  menuIndex: number | null;
  titleIndex: number;
  depth: number;
  score: number;
  lives: number;
  muted: boolean;
  planktonRemaining: number;
  drifterIn: number;
  brightness: number;
  brightHold: number;
  visionRadius: number;
  windowRadius: number;
  sonar: { ready: boolean; cooldown: number; range: number };
  ink: { ready: boolean; cooldown: number };
  grid: {
    cols: number;
    rows: number;
    tile: number;
    originX: number;
    originY: number;
  };
  tiles: string[];
  plankton: string[];
  visibility: string[];
  forager: Body;
  drifters: Drifter[];
  predators: Predator[];
  pulses: Pulse[];
  inkClouds: InkCloud[];
  simTime: number;
  accumulator: number;
  screenTime: number;
  playTime: number;
  desired: Direction;
  held: Direction[];
  pendingSonar: boolean;
  pendingInk: boolean;
  rng: number;
  pointerDown: Record<number, number>;
  assets: Record<string, ImageBitmap[]>;
}
type S = DeepReadonly<FathomState>;
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const directions: Direction[] = ["up", "down", "left", "right"];
const vector: Record<Direction, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};
const opposite: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};
export function center(tx: number, ty: number): [number, number] {
  return [
    C.GRID_ORIGIN_X + tx * C.TILE + C.TILE / 2,
    C.GRID_ORIGIN_Y + ty * C.TILE + C.TILE / 2,
  ];
}
function body(tx: number, ty: number): Body {
  const [x, y] = center(tx, ty);
  return { x, y, tx, ty, dir: "up", moving: false };
}
export function tile(s: S, x: number, y: number): string {
  return s.tiles[y]?.[x] ?? "#";
}
function wrapRow(s: S) {
  return s.tiles.findIndex((r) => r[0] === "." && r[C.GRID_COLS - 1] === ".");
}
export function neighbor(
  s: S,
  x: number,
  y: number,
  d: Direction,
): [number, number] {
  const [dx, dy] = vector[d];
  let nx = x + dx;
  if (y === wrapRow(s)) nx = (nx + C.GRID_COLS) % C.GRID_COLS;
  return [nx, y + dy];
}
function open(s: S, x: number, y: number, pred = false) {
  return (pred ? ".dg" : ".").includes(tile(s, x, y));
}
function available(s: S, b: DeepReadonly<Body>, pred = false) {
  return directions.filter((d) => {
    const [x, y] = neighbor(s, b.tx, b.ty, d);
    return open(s, x, y, pred);
  });
}
function put(rows: string[], x: number, y: number, ch: string) {
  rows[y] = rows[y]!.slice(0, x) + ch + rows[y]!.slice(x + 1);
}
export function makeMaze(): string[] {
  const a = Array.from({ length: C.GRID_ROWS }, () =>
    Array<string>(C.GRID_COLS).fill("#"),
  );
  for (let y = 1; y <= 15; y += 2) for (let x = 1; x < 35; x++) a[y]![x] = ".";
  for (const x of [1, 5, 9, 13, 22, 26, 30, 34])
    for (let y = 1; y <= 15; y++) a[y]![x] = ".";
  for (let y = 6; y <= 10; y++) for (let x = 15; x <= 20; x++) a[y]![x] = "#";
  for (let y = 7; y <= 9; y++) for (let x = 16; x <= 19; x++) a[y]![x] = "d";
  a[6]![17] = "g";
  a[11]![0] = ".";
  a[11]![35] = ".";
  // Remove the stubs cut by the den enclosure; all remaining corridors form loops.
  let changed = true;
  while (changed) {
    changed = false;
    for (let y = 1; y < 17; y++)
      for (let x = 1; x < 35; x++)
        if (a[y]![x] === ".") {
          const n = [
            [x - 1, y],
            [x + 1, y],
            [x, y - 1],
            [x, y + 1],
          ].filter(([xx, yy]) => a[yy!]![xx!] === ".").length;
          if (n < 2) {
            a[y]![x] = "#";
            changed = true;
          }
        }
  }
  return a.map((r) => r.join(""));
}
function predator(
  kind: C.PredatorKind,
  x: number,
  y: number,
  slot: number | null,
): Predator {
  return {
    ...body(x, y),
    kind,
    state: slot === null ? "wander" : "den",
    released: slot === null,
    mind: true,
    travel: true,
    lit: false,
    speed: C.PREDATOR_SPEED,
    alert: false,
    detectRange: kind === "gloamfin" ? null : C.LANTERN_RANGE_BASE,
    hearingRange: kind === "gloamfin" ? C.GLOAMFIN_HEAR : null,
    hearingLock: kind === "gloamfin" ? false : null,
    flareCharging: kind === "flarefish" ? false : null,
    flaring: kind === "flarefish" ? false : null,
    flareRadius: kind === "flarefish" ? 0 : null,
    fix: null,
    linger: 0,
    alertLeft: 0,
    mark: 0,
    pingIn: C.GLOAMFIN_PING_INTERVAL,
    pingGap: C.GLOAMFIN_PING_MIN_GAP,
    searchTime: 0,
    searchPing: false,
    chaseSpeed: C.GLOAMFIN_CHASE_SPEED,
    flareIn: C.FLARE_INTERVAL,
    flareTime: 0,
    fade: 0,
    slot,
  };
}
function roster(depth: number) {
  const kinds = [
    ...C.DEN_ORDER,
    ...C.ROSTER_ADD_ORDER.slice(0, Math.min(depth, C.ROSTER_CAP_DEPTH) - 1),
  ];
  return kinds.map((k, i) =>
    predator(k, 16 + (i % 4), 7 + Math.floor(i / 4), i),
  );
}
export function initial(
  assets: FathomState["assets"] = {},
  muted = false,
): FathomState {
  const tiles = makeMaze();
  return reconcile({
    version: C.FATHOM_DEBUG_VERSION,
    screen: "title",
    menuIndex: 0,
    titleIndex: 0,
    depth: 1,
    score: 0,
    lives: C.START_LIVES,
    muted,
    planktonRemaining: 0,
    drifterIn: C.DRIFTER_INTERVAL,
    brightness: 0,
    brightHold: 0,
    visionRadius: C.VISION_MIN,
    windowRadius: C.KINDLE_VISION_MIN,
    sonar: { ready: true, cooldown: 0, range: C.SONAR_RANGE_BASE },
    ink: { ready: true, cooldown: 0 },
    grid: {
      cols: C.GRID_COLS,
      rows: C.GRID_ROWS,
      tile: C.TILE,
      originX: C.GRID_ORIGIN_X,
      originY: C.GRID_ORIGIN_Y,
    },
    tiles,
    plankton: tiles.map((r) => r.replace(/[^.]/g, "-").replace(/\./g, "*")),
    visibility: tiles.map(() => "u".repeat(C.GRID_COLS)),
    forager: body(13, 13),
    drifters: [],
    predators: roster(1),
    pulses: [],
    inkClouds: [],
    simTime: 0,
    accumulator: 0,
    screenTime: 0,
    playTime: 0,
    desired: "up",
    held: [],
    pendingSonar: false,
    pendingInk: false,
    rng: 0x5fa710,
    pointerDown: {},
    assets,
  });
}
export function copy(s: S): FathomState {
  return {
    ...s,
    tiles: [...s.tiles],
    plankton: [...s.plankton],
    visibility: [...s.visibility],
    forager: { ...s.forager },
    drifters: s.drifters.map((b) => ({ ...b })),
    predators: s.predators.map((p) => ({
      ...p,
      fix: p.fix ? [...p.fix] : null,
    })),
    pulses: s.pulses.map((p) => ({ ...p, marks: [...p.marks] })),
    inkClouds: s.inkClouds.map((i) => ({ ...i })),
    sonar: { ...s.sonar },
    ink: { ...s.ink },
    grid: { ...s.grid },
    pointerDown: { ...s.pointerDown },
    held: [...s.held],
    assets: s.assets as FathomState["assets"],
  };
}
function locate(b: Body) {
  b.tx = Math.floor((b.x - C.GRID_ORIGIN_X) / C.TILE);
  b.ty = Math.floor((b.y - C.GRID_ORIGIN_Y) / C.TILE);
}
export function reconcile(s: S): FathomState {
  const n = copy(s);
  n.visionRadius = C.VISION_MIN + C.VISION_GAIN * n.brightness;
  n.windowRadius = C.KINDLE_VISION_MIN + C.KINDLE_VISION_GAIN * n.brightness;
  n.sonar.range = Math.max(C.SONAR_RANGE_MIN, C.SONAR_RANGE_BASE - n.depth + 1);
  n.sonar.ready = n.sonar.cooldown === 0;
  n.ink.ready = n.ink.cooldown === 0;
  n.planktonRemaining = n.plankton.join("").split("*").length - 1;
  for (const b of [n.forager, ...n.drifters, ...n.predators]) locate(b);
  for (const p of n.predators) {
    p.speed =
      p.kind === "lanternjaw" && p.state === "wander"
        ? C.DRIFTER_SPEED
        : p.kind === "gloamfin" && p.state === "chase"
          ? p.chaseSpeed
          : C.PREDATOR_SPEED;
    p.detectRange =
      p.kind === "gloamfin"
        ? null
        : C.LANTERN_RANGE_BASE + C.LANTERN_RANGE_GAIN * n.brightness;
  }
  return n;
}
export function menuItems(s: S): readonly string[] {
  return s.screen === "title"
    ? C.TITLE_ITEMS
    : s.screen === "paused"
      ? C.PAUSE_ITEMS
      : s.screen === "gameover"
        ? C.GAMEOVER_ITEMS
        : [];
}
export function menuItemRect(s: S, i: number): Rect | null {
  return i >= 0 && i < menuItems(s).length
    ? { x: 460, y: 382 + i * 60, w: 360, h: 48 }
    : null;
}
export function screen(s: S, value: Screen): FathomState {
  const n = copy(s);
  n.screen = value;
  n.menuIndex =
    value === "title"
      ? n.titleIndex
      : value === "paused" || value === "gameover"
        ? 0
        : null;
  n.screenTime = 0;
  if (value === "playing" && s.screen !== "paused") n.playTime = 0;
  return n;
}
function fresh(s: S, value: Screen, depth = 1): FathomState {
  let n = initial(s.assets as FathomState["assets"], s.muted);
  n.titleIndex = s.titleIndex;
  n.simTime = s.simTime;
  n.accumulator = s.accumulator;
  n.depth = depth;
  n.predators = roster(depth);
  if (depth > 1) {
    n.score = s.score;
    n.lives = s.lives;
  }
  n = screen(n, value);
  return reconcile(n);
}
function retry(s: FathomState) {
  const n = fresh(s, "countdown", s.depth);
  n.tiles = s.tiles;
  n.plankton = s.plankton;
  n.visibility = s.visibility;
  n.score = s.score;
  n.lives = s.lives;
  return reconcile(n);
}
function random(s: FathomState) {
  s.rng = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0;
  return s.rng / 4294967296;
}
export function distances(
  s: S,
  x: number,
  y: number,
  pred = false,
): Map<string, number> {
  const out = new Map<string, number>();
  if (!open(s, x, y, pred)) return out;
  const q: [[number, number], number][] = [[[x, y], 0]];
  out.set(`${x},${y}`, 0);
  for (let i = 0; i < q.length; i++) {
    const [[xx, yy], d] = q[i]!;
    for (const dir of directions) {
      const [nx, ny] = neighbor(s, xx, yy, dir);
      const k = `${nx},${ny}`;
      if (open(s, nx, ny, pred) && !out.has(k)) {
        out.set(k, d + 1);
        q.push([[nx, ny], d + 1]);
      }
    }
  }
  return out;
}
function route(
  s: S,
  b: Body,
  target: readonly [number, number],
  pred = true,
): Direction | null {
  const ds = distances(s, ...target, pred);
  let best = Infinity;
  let result: Direction | null = null;
  for (const d of available(s, b, pred)) {
    const [x, y] = neighbor(s, b.tx, b.ty, d);
    const v = ds.get(`${x},${y}`) ?? Infinity;
    if (v < best) {
      best = v;
      result = d;
    }
  }
  return result;
}
function atCenter(b: Body) {
  const [x, y] = center(b.tx, b.ty);
  return Math.abs(b.x - x) < 1e-7 && Math.abs(b.y - y) < 1e-7;
}
function wander(s: FathomState, b: Body, pred = false) {
  const opts = available(s, b, pred);
  const non = opts.filter((d) => d !== opposite[b.dir]);
  const choices = non.length ? non : opts;
  return choices[Math.floor(random(s) * choices.length)] ?? null;
}
function move(
  s: FathomState,
  b: Body,
  speed: number,
  choose: () => Direction | null,
  pred = false,
) {
  b.moving = false;
  if (!open(s, b.tx, b.ty, pred)) return;
  let left = speed * C.TICK_DT;
  while (left > 1e-8) {
    if (atCenter(b)) {
      const d = choose();
      if (d === null) return;
      b.dir = d;
      const [nx, ny] = neighbor(s, b.tx, b.ty, d);
      if (!open(s, nx, ny, pred)) return;
    }
    const [dx, dy] = vector[b.dir];
    const [cx, cy] = center(b.tx, b.ty);
    const axis = dx ? b.x : b.y;
    const mid = dx ? cx : cy;
    const sign = dx || dy;
    let gap = (mid - axis) * sign;
    if (gap <= 1e-7) gap += C.TILE;
    const step = Math.min(left, gap);
    b.x += dx * step;
    b.y += dy * step;
    if (b.ty === wrapRow(s)) {
      const width = C.GRID_COLS * C.TILE;
      if (b.x < C.GRID_ORIGIN_X) b.x += width;
      if (b.x >= C.GRID_ORIGIN_X + width) b.x -= width;
    }
    locate(b);
    left -= step;
    b.moving = true;
  }
}
export function lineClear(
  s: S,
  a: DeepReadonly<Body>,
  x: number,
  y: number,
  targetRock = false,
) {
  // Traverse every crossed cell, including a rock endpoint but never beyond it.
  const ax = (a.x - C.GRID_ORIGIN_X) / C.TILE;
  const ay = (a.y - C.GRID_ORIGIN_Y) / C.TILE;
  const bx = (x - C.GRID_ORIGIN_X) / C.TILE;
  const by = (y - C.GRID_ORIGIN_Y) / C.TILE;
  let xx = Math.floor(ax),
    yy = Math.floor(ay);
  const tx = Math.floor(bx),
    ty = Math.floor(by);
  const dx = bx - ax,
    dy = by - ay;
  const sx = Math.sign(dx),
    sy = Math.sign(dy);
  const deltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const deltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
  let nextX = dx === 0 ? Infinity : (sx > 0 ? xx + 1 - ax : ax - xx) * deltaX;
  let nextY = dy === 0 ? Infinity : (sy > 0 ? yy + 1 - ay : ay - yy) * deltaY;
  while (true) {
    if (tile(s, xx, yy) === "#" && !(targetRock && xx === tx && yy === ty))
      return false;
    if (xx === tx && yy === ty) return true;
    if (Math.abs(nextX - nextY) < 1e-12) {
      xx += sx;
      yy += sy;
      nextX += deltaX;
      nextY += deltaY;
    } else if (nextX < nextY) {
      xx += sx;
      nextX += deltaX;
    } else {
      yy += sy;
      nextY += deltaY;
    }
  }
}
function distance(
  a: DeepReadonly<Body>,
  b: { readonly x: number; readonly y: number },
) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function blinded(s: S, p: Predator) {
  return s.inkClouds.some((c) => {
    const a = p,
      b = s.forager;
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((c.x - a.x) * dx + (c.y - a.y) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
    return Math.hypot(c.x - a.x - t * dx, c.y - a.y - t * dy) <= c.radius;
  });
}
function acquire(s: FathomState, p: Predator, freshFix = false) {
  if ((p.state !== "chase" || freshFix) && p.kind !== "lanternjaw")
    p.alertLeft = C.ALERT_TIME;
  if (p.kind === "gloamfin" && (p.state !== "chase" || freshFix))
    p.chaseSpeed = C.GLOAMFIN_CHASE_SPEED;
  p.state = "chase";
  p.fix = [s.forager.tx, s.forager.ty];
  p.linger = C.LINGER_TIME;
  if (p.kind === "flarefish") {
    if (p.flaring) p.fade = 0.3;
    p.flareTime = 0;
    p.flaring = false;
    p.flareCharging = false;
    p.flareRadius = 0;
  }
}
function pulse(
  s: FathomState,
  source: Pulse["source"],
  tint: Pulse["tint"],
  b: Body,
  range: number,
  owner: number | null,
) {
  s.pulses.push({
    source,
    tint,
    ox: b.tx,
    oy: b.ty,
    front: 0,
    range,
    owner,
    caught: false,
    marks: [],
  });
}
function down(t: number) {
  return t <= C.TICK_DT + 1e-10 ? 0 : t - C.TICK_DT;
}
function light(s: FathomState) {
  const vis = s.visibility.map((r) => r.replace(/l/g, "r").split(""));
  const lit = (x: number, y: number) => {
    if (vis[y]?.[x] !== undefined) vis[y]![x] = "l";
  };
  for (let y = 0; y < C.GRID_ROWS; y++)
    for (let x = 0; x < C.GRID_COLS; x++) {
      const [cx, cy] = center(x, y);
      if (
        distance(s.forager, { x: cx, y: cy }) <= s.visionRadius &&
        lineClear(s, s.forager, cx, cy, true)
      )
        lit(x, y);
      if (
        s.predators.some(
          (p) => p.flaring && distance(p, { x: cx, y: cy }) <= C.FLARE_RADIUS,
        )
      )
        lit(x, y);
    }
  for (const p of s.pulses)
    if (p.source === "forager") {
      const ds = distances(s, p.ox, p.oy);
      for (const [k, d] of ds)
        if (d <= p.front && d <= p.range) {
          const [x, y] = k.split(",").map(Number) as [number, number];
          lit(x, y);
          for (const dir of directions) {
            const [nx, ny] = neighbor(s, x, y, dir);
            if (tile(s, nx, ny) === "#") lit(nx, ny);
          }
        }
    }
  s.visibility = vis.map((r) => r.join(""));
  const isLit = (b: Body) => {
    const [cx, cy] = center(b.tx, b.ty);
    return (
      (distance(s.forager, { x: cx, y: cy }) <= s.visionRadius &&
        lineClear(s, s.forager, cx, cy)) ||
      s.predators.some((p) => p.flaring && distance(p, b) <= C.FLARE_RADIUS)
    );
  };
  for (const d of s.drifters) d.lit = isLit(d);
  for (const p of s.predators) {
    p.alert = p.kind !== "lanternjaw" && p.alertLeft > 0;
    p.lit = p.state !== "den" && (isLit(p) || p.alert || p.mark > 0);
  }
}
export interface TickInput {
  held: Direction[];
  sonar: boolean;
  ink: boolean;
}
export function tick(
  current: S,
  input: TickInput = { held: [], sonar: false, ink: false },
): [FathomState, C.CueName[]] {
  let s = copy(current);
  s.simTime += C.TICK_DT;
  const cues = new Set<C.CueName>();
  if (s.screen === "countdown" || s.screen === "cleared") {
    s.screenTime += C.TICK_DT;
    if (s.screen === "countdown") {
      light(s);
      if (s.screenTime >= 1.5 - 1e-8) s = screen(s, "playing");
    } else if (s.screenTime >= 1.5 - 1e-8)
      s = fresh(s, "countdown", s.depth + 1);
    return [s, []];
  }
  if (s.screen !== "playing") return [s, []];
  s.playTime += C.TICK_DT;
  s.sonar.cooldown = down(s.sonar.cooldown);
  s.ink.cooldown = down(s.ink.cooldown);
  const decay = Math.max(0, C.TICK_DT - s.brightHold);
  s.brightHold = down(s.brightHold);
  s.brightness *= 0.5 ** (decay / C.BRIGHT_HALFLIFE);
  s.inkClouds = s.inkClouds
    .map((c) => ({ ...c, remaining: down(c.remaining) }))
    .filter((c) => c.remaining > 0);
  if (input.held.length) {
    s.desired = input.held[input.held.length - 1]!;
    if (s.desired === opposite[s.forager.dir]) s.forager.dir = s.desired;
    move(s, s.forager, C.FORAGER_SPEED, () =>
      available(s, s.forager).includes(s.desired) ? s.desired : s.forager.dir,
    );
  } else s.forager.moving = false;
  if (input.sonar && s.sonar.cooldown === 0) {
    pulse(s, "forager", "cyan", s.forager, s.sonar.range, null);
    s.sonar.cooldown = C.SONAR_COOLDOWN;
    cues.add(C.CUES.sonar);
  }
  if (input.ink && s.ink.cooldown === 0) {
    s.inkClouds.push({
      x: s.forager.x,
      y: s.forager.y,
      radius: C.INK_RADIUS,
      remaining: C.INK_LIFE,
    });
    s.ink.cooldown = C.INK_COOLDOWN;
    cues.add(C.CUES.ink);
  }
  if (
    s.plankton[s.forager.ty]?.[s.forager.tx] === "*" &&
    tile(s, s.forager.tx, s.forager.ty) === "."
  ) {
    put(s.plankton, s.forager.tx, s.forager.ty, "-");
    s.planktonRemaining--;
    s.score += C.SCORE_PLANKTON;
    s.brightness = Math.min(1, s.brightness + C.BRIGHT_PER_EAT);
    s.brightHold = C.BRIGHT_HOLD;
    cues.add(C.CUES.eat);
    if (s.planktonRemaining === 0) {
      s.score += C.SCORE_CLEAR;
      s = screen(s, "cleared");
      cues.add(C.CUES.descend);
      return [reconcile(s), [...cues]];
    }
  }
  s.drifterIn = down(s.drifterIn);
  if (s.drifterIn === 0) {
    const gate = findGate(s);
    if (s.planktonRemaining > 0 && s.drifters.length < C.DRIFTER_MAX && gate) {
      const exit = directions
        .map((d) => neighbor(s, ...gate, d))
        .find(([x, y]) => tile(s, x, y) === ".");
      if (exit)
        s.drifters.push({
          ...body(...exit),
          mind: true,
          travel: true,
          lit: false,
        });
    }
    s.drifterIn = C.DRIFTER_INTERVAL;
  }
  for (const d of s.drifters)
    if (d.mind && d.travel) move(s, d, C.DRIFTER_SPEED, () => wander(s, d));
  s.drifters = s.drifters.filter((d) => {
    if (d.tx === s.forager.tx && d.ty === s.forager.ty) {
      s.score += C.SCORE_DRIFTER;
      return false;
    }
    return true;
  });
  for (let i = 0; i < s.predators.length; i++) {
    const p = s.predators[i]!;
    p.mark = down(p.mark);
    p.alertLeft = down(p.alertLeft);
    p.fade = down(p.fade);
    // The release schedule belongs to the board, independently of a mind.
    if (
      p.state === "den" &&
      p.slot !== null &&
      s.playTime + 1e-10 >= p.slot * C.DEN_RELEASE_GAP
    )
      p.released = true;
    if (!p.mind) continue;
    if (p.state === "den") {
      const gate = findGate(s);
      if (
        p.released &&
        gate &&
        s.tiles.some((r) => r.includes("d")) &&
        p.travel
      ) {
        const exit = directions
          .map((d) => neighbor(s, ...gate, d))
          .find(([x, y]) => tile(s, x, y) === ".");
        if (exit) {
          move(s, p, C.PREDATOR_SPEED, () => route(s, p, exit), true);
          if (tile(s, p.tx, p.ty) === ".") p.state = "wander";
        }
      }
      continue;
    }
    p.chaseSpeed = Math.min(
      C.GLOAMFIN_CHASE_SPEED,
      p.chaseSpeed +
        ((C.GLOAMFIN_CHASE_SPEED - C.GLOAMFIN_CORNER_SPEED) * C.TICK_DT) /
          C.GLOAMFIN_RAMP_TIME,
    );
    if (p.kind === "gloamfin") {
      const lock = distance(p, s.forager) <= C.GLOAMFIN_HEAR;
      if (lock) acquire(s, p, !p.hearingLock);
      p.hearingLock = lock;
      p.pingIn = down(p.pingIn);
      p.pingGap = down(p.pingGap);
      if (
        p.state === "chase" &&
        p.fix &&
        p.tx === p.fix[0] &&
        p.ty === p.fix[1] &&
        !lock &&
        atCenter(p)
      ) {
        p.state = "search";
        p.searchTime = 0;
        p.searchPing = false;
      }
      if (p.state === "search") {
        p.searchTime += C.TICK_DT;
        if (p.searchTime >= C.GLOAMFIN_GIVEUP) {
          p.state = "wander";
          p.fix = null;
        }
      }
      const search =
        p.state === "search" &&
        !p.searchPing &&
        p.searchTime >= C.GLOAMFIN_SEARCH_DELAY;
      if (!lock && p.pingGap === 0 && (search || p.pingIn === 0)) {
        pulse(
          s,
          "gloamfin",
          search ? "orange" : "violet",
          p,
          C.GLOAMFIN_PING_RANGE,
          i,
        );
        p.pingIn = C.GLOAMFIN_PING_INTERVAL;
        p.pingGap = C.GLOAMFIN_PING_MIN_GAP;
        if (search) p.searchPing = true;
        cues.add(C.CUES.predatorPing);
      }
    } else {
      const blind = blinded(s, p);
      const sensing =
        !blind &&
        ((distance(p, s.forager) <=
          C.LANTERN_RANGE_BASE + C.LANTERN_RANGE_GAIN * s.brightness &&
          lineClear(s, p, s.forager.x, s.forager.y)) ||
          (p.flaring && distance(p, s.forager) <= C.FLARE_RADIUS));
      if (sensing) acquire(s, p);
      else if (p.state === "chase") {
        p.linger = down(p.linger);
        if (blind || p.linger === 0) {
          p.state = "wander";
          p.fix = null;
          p.flareIn = C.FLARE_INTERVAL;
          p.flareTime = 0;
        }
      }
      if (p.kind === "flarefish" && p.state === "wander") {
        if (p.flareTime > 0) {
          p.flareTime += C.TICK_DT;
          if (p.flareTime >= C.FLARE_CHARGE + C.FLARE_BLOOM) {
            p.flareTime = 0;
            p.flareIn = C.FLARE_INTERVAL;
            p.fade = 0.3;
          }
        } else {
          p.flareIn = down(p.flareIn);
          if (p.flareIn === 0) p.flareTime = C.TICK_DT;
        }
        const was = p.flaring;
        p.flareCharging = p.flareTime > 0 && p.flareTime < C.FLARE_CHARGE;
        p.flaring = p.flareTime >= C.FLARE_CHARGE;
        p.flareRadius = p.flaring ? C.FLARE_RADIUS : 0;
        if (p.flaring && !was) cues.add(C.CUES.flare);
        if (p.flaring && !blind && distance(p, s.forager) <= C.FLARE_RADIUS)
          acquire(s, p);
      }
    }
    p.speed =
      p.kind === "lanternjaw" && p.state === "wander"
        ? C.DRIFTER_SPEED
        : p.kind === "gloamfin" && p.state === "chase"
          ? p.chaseSpeed
          : C.PREDATOR_SPEED;
    if (p.travel)
      move(s, p, p.speed, () => {
        let d: Direction | null;
        if (p.state === "chase" && p.fix) {
          if (p.tx === p.fix[0] && p.ty === p.fix[1]) return null;
          d = route(s, p, p.fix);
        } else if (
          p.state === "search" &&
          p.fix &&
          Math.abs(p.tx - p.fix[0]) + Math.abs(p.ty - p.fix[1]) >=
            C.GLOAMFIN_SEARCH_ROAM
        )
          d = route(s, p, p.fix);
        else d = wander(s, p);
        if (
          d &&
          p.kind === "gloamfin" &&
          p.state === "chase" &&
          d !== p.dir &&
          d !== opposite[p.dir]
        )
          p.chaseSpeed = C.GLOAMFIN_CORNER_SPEED;
        return d;
      });
  }
  for (const p of s.pulses) {
    const prev = p.front;
    p.front += C.SONAR_WAVE_SPEED * C.TICK_DT;
    const ds = distances(s, p.ox, p.oy);
    const hit = (b: Body) => {
      const d = ds.get(`${b.tx},${b.ty}`);
      return (
        d !== undefined &&
        d <= p.range &&
        d <= p.front &&
        (d > prev || (prev === 0 && d === 0))
      );
    };
    if (p.source === "forager") {
      for (let i = 0; i < s.predators.length; i++) {
        const hunter = s.predators[i]!;
        if (hunter.state !== "den" && hit(hunter) && !p.marks.includes(i)) {
          p.marks.push(i);
          if (hunter.kind !== "lanternjaw") hunter.mark = C.SONAR_MARK_TIME;
          if (hunter.kind === "gloamfin" && hunter.mind)
            acquire(s, hunter, true);
        }
      }
    } else if (!p.caught && hit(s.forager)) {
      p.caught = true;
      const owner = p.owner === null ? undefined : s.predators[p.owner];
      if (owner?.mind) acquire(s, owner, true);
    }
  }
  s = reconcile(s);
  light(s);
  s.pulses = s.pulses.filter((p) => p.front <= p.range);
  if (
    s.predators.some(
      (p) =>
        p.state !== "den" && p.tx === s.forager.tx && p.ty === s.forager.ty,
    )
  ) {
    cues.add(C.CUES.caught);
    if (s.lives === 0) s = screen(s, "gameover");
    else {
      s.lives--;
      s = retry(s);
    }
  }
  return [s, [...cues]];
}
function findGate(s: S): [number, number] | null {
  for (let y = 0; y < C.GRID_ROWS; y++) {
    const x = s.tiles[y]!.indexOf("g");
    if (x >= 0) return [x, y];
  }
  return null;
}
function valid(ok: boolean): asserts ok {
  if (!ok) throw new Error("Invalid Fathom debug argument");
}
function num(n: number, min = 0, max = Infinity, integer = false) {
  valid(
    Number.isFinite(n) &&
      n >= min &&
      n <= max &&
      (!integer || Number.isInteger(n)),
  );
}
function point(s: S, x: number, y: number, chars = ".") {
  num(x, 0, C.GRID_COLS - 1, true);
  num(y, 0, C.GRID_ROWS - 1, true);
  valid(chars.includes(tile(s, x, y)));
}
function index<T>(list: readonly T[], i: number) {
  num(i, 0, list.length - 1, true);
}
function patchPred(s: S, i: number, fn: (p: Predator, n: FathomState) => void) {
  index(s.predators, i);
  const n = copy(s);
  fn(n.predators[i]!, n);
  return reconcile(n);
}
function patchDrifter(s: S, i: number, fn: (d: Drifter) => void) {
  index(s.drifters, i);
  const n = copy(s);
  fn(n.drifters[i]!);
  return n;
}
export const debug = {
  version: C.FATHOM_DEBUG_VERSION,
  reset: (s: S) => initial(s.assets as FathomState["assets"], s.muted),
  snapshot: (s: S) => {
    const {
      assets: _assets,
      accumulator: _accumulator,
      screenTime: _screenTime,
      playTime: _playTime,
      desired: _desired,
      held: _held,
      pendingSonar: _pendingSonar,
      pendingInk: _pendingInk,
      rng: _rng,
      pointerDown: _pointerDown,
      ...rest
    } = copy(s);
    return {
      ...rest,
      forager: {
        x: s.forager.x,
        y: s.forager.y,
        tx: s.forager.tx,
        ty: s.forager.ty,
        dir: s.forager.dir,
        moving: s.forager.moving,
      },
      drifters: s.drifters.map(({ x, y, tx, ty, lit, mind, travel }) => ({
        x,
        y,
        tx,
        ty,
        lit,
        mind,
        travel,
      })),
      predators: s.predators.map(
        ({
          kind,
          x,
          y,
          tx,
          ty,
          dir,
          state,
          released,
          mind,
          travel,
          speed,
          alert,
          lit,
          detectRange,
          hearingRange,
          hearingLock,
          flareCharging,
          flaring,
          flareRadius,
        }) => ({
          kind,
          x,
          y,
          tx,
          ty,
          dir,
          state,
          released,
          mind,
          travel,
          speed,
          alert,
          lit,
          detectRange,
          hearingRange,
          hearingLock,
          flareCharging,
          flaring,
          flareRadius,
        }),
      ),
      pulses: s.pulses.map(({ source, tint, ox, oy, front, range }) => ({
        source,
        tint,
        ox,
        oy,
        front,
        range,
      })),
    };
  },
  reconcile,
  setScreen: (s: S, v: Screen) => {
    valid(
      [
        "title",
        "howto",
        "countdown",
        "playing",
        "paused",
        "cleared",
        "gameover",
      ].includes(v),
    );
    return screen(s, v);
  },
  setMenuIndex: (s: S, i: number) => {
    index(menuItems(s), i);
    return { ...copy(s), menuIndex: i };
  },
  setTitleIndex: (s: S, i: number) => {
    index(C.TITLE_ITEMS, i);
    return { ...copy(s), titleIndex: i };
  },
  menuItemRect,
  setScore: (s: S, v: number) => {
    num(v, 0, Infinity, true);
    return { ...copy(s), score: v };
  },
  setLives: (s: S, v: number) => {
    num(v, 0, Infinity, true);
    return { ...copy(s), lives: v };
  },
  setDepth: (s: S, v: number) => {
    num(v, 1, Infinity, true);
    return reconcile({
      ...copy(s),
      depth: v,
      predators: roster(v),
      playTime: 0,
    });
  },
  setMaze: (s: S, rows: readonly string[]) => {
    valid(
      rows.length === C.GRID_ROWS &&
        rows.every((r) => r.length === C.GRID_COLS && /^[#.dg]+$/.test(r)),
    );
    const text = rows.join("");
    valid(!/[dg]/.test(text) || text.split("g").length === 2);
    return { ...copy(s), tiles: [...rows] };
  },
  setPlankton: (s: S, x: number, y: number, present: boolean) => {
    point(s, x, y);
    valid(typeof present === "boolean");
    const n = copy(s);
    put(n.plankton, x, y, present ? "*" : "-");
    return reconcile(n);
  },
  clearPlankton: (s: S) => ({
    ...copy(s),
    plankton: s.tiles.map(() => "-".repeat(C.GRID_COLS)),
    planktonRemaining: 0,
  }),
  clearFog: (s: S) => ({
    ...copy(s),
    visibility: s.tiles.map(() => "u".repeat(C.GRID_COLS)),
  }),
  setForagerTile: (s: S, x: number, y: number) => {
    point(s, x, y);
    return { ...copy(s), forager: { ...body(x, y), dir: s.forager.dir } };
  },
  setForagerDir: (s: S, d: Direction) => {
    valid(directions.includes(d));
    return {
      ...copy(s),
      forager: { ...s.forager, dir: d, moving: false },
      desired: d,
    };
  },
  setBrightness: (s: S, v: number) => {
    num(v, 0, 1);
    return reconcile({ ...copy(s), brightness: v });
  },
  setBrightHold: (s: S, v: number) => {
    num(v, 0, C.BRIGHT_HOLD);
    return { ...copy(s), brightHold: v };
  },
  clearPredators: (s: S): FathomState => ({ ...copy(s), predators: [] }),
  addPredator: (s: S, k: C.PredatorKind, x: number, y: number) => {
    valid(C.DEN_ORDER.includes(k));
    point(s, x, y);
    return reconcile({
      ...copy(s),
      predators: [...copy(s).predators, predator(k, x, y, null)],
    });
  },
  setPredatorTile: (s: S, i: number, x: number, y: number) => {
    point(s, x, y, ".dg");
    return patchPred(s, i, (p) =>
      Object.assign(p, { ...body(x, y), dir: p.dir }),
    );
  },
  setPredatorDir: (s: S, i: number, d: Direction) => {
    valid(directions.includes(d));
    return patchPred(s, i, (p) => {
      p.dir = d;
    });
  },
  setPredatorState: (s: S, i: number, v: "den" | "wander" | "chase") => {
    valid(["den", "wander", "chase"].includes(v));
    return patchPred(s, i, (p, n) => {
      point(s, p.tx, p.ty, v === "den" ? "dg" : ".");
      p.state = v;
      p.fix = v === "chase" ? [n.forager.tx, n.forager.ty] : null;
      p.linger = v === "chase" ? C.LINGER_TIME : 0;
      p.alert = false;
      p.alertLeft = 0;
      p.chaseSpeed = C.GLOAMFIN_CHASE_SPEED;
    });
  },
  setPredatorReleased: (s: S, i: number, v: boolean) => {
    valid(typeof v === "boolean");
    return patchPred(s, i, (p) => {
      p.released = v;
    });
  },
  setPredatorMind: (s: S, i: number, v: boolean) => {
    valid(typeof v === "boolean");
    return patchPred(s, i, (p) => {
      p.mind = v;
    });
  },
  setPredatorTravel: (s: S, i: number, v: boolean) => {
    valid(typeof v === "boolean");
    return patchPred(s, i, (p) => {
      p.travel = v;
    });
  },
  spawnDrifter: (s: S, x: number, y: number) => {
    point(s, x, y);
    return {
      ...copy(s),
      drifters: [
        ...copy(s).drifters,
        { ...body(x, y), lit: false, mind: true, travel: true },
      ],
    };
  },
  clearDrifters: (s: S): FathomState => ({ ...copy(s), drifters: [] }),
  setDrifterMind: (s: S, i: number, v: boolean) => {
    valid(typeof v === "boolean");
    return patchDrifter(s, i, (d) => {
      d.mind = v;
    });
  },
  setDrifterTravel: (s: S, i: number, v: boolean) => {
    valid(typeof v === "boolean");
    return patchDrifter(s, i, (d) => {
      d.travel = v;
    });
  },
  setDrifterIn: (s: S, v: number) => {
    num(v, 0, C.DRIFTER_INTERVAL);
    return { ...copy(s), drifterIn: v };
  },
  setSonarCooldown: (s: S, v: number) => {
    num(v);
    return reconcile({ ...copy(s), sonar: { ...s.sonar, cooldown: v } });
  },
  setInkCooldown: (s: S, v: number) => {
    num(v);
    return reconcile({ ...copy(s), ink: { ...s.ink, cooldown: v } });
  },
};
export type FathomDebugApi = typeof debug;
function confirm(s: FathomState) {
  const i = s.menuIndex;
  if (s.screen === "title") {
    s.titleIndex = i ?? 0;
    return i === 1 ? screen(s, "howto") : fresh(s, "countdown");
  }
  if (s.screen === "paused")
    return i === 0
      ? screen(s, "playing")
      : i === 1
        ? fresh(s, "countdown")
        : fresh(s, "title");
  if (s.screen === "gameover") return fresh(s, i === 0 ? "countdown" : "title");
  return s;
}
function update(current: S, api: UpdateApi, dt: number): FathomState {
  let s = copy(current);
  const edges = Object.fromEntries(
    C.ACTIONS.map((a) => [a, api.input.pressed(a)]),
  );
  if (edges.mute) api.audio.setMuted(!api.audio.muted());
  s.muted = api.audio.muted();
  const opening = s.screen;
  let pointerConfirm = false;
  for (const p of api.input.pointerSamples()) {
    const i = menuItems(s).findIndex((_, i) => {
      const r = menuItemRect(s, i)!;
      return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
    });
    if (i >= 0) s.menuIndex = i;
    if (p.type === "down") s.pointerDown[p.id] = i;
    if (p.type === "up") {
      if (
        s.pointerDown[p.id] !== undefined &&
        (s.screen === "howto" || (i >= 0 && s.pointerDown[p.id] === i))
      )
        pointerConfirm = true;
      delete s.pointerDown[p.id];
    }
  }
  if (opening === "playing" && edges.pause) s = screen(s, "paused");
  else if (opening === "paused" && (edges.pause || edges.back))
    s = screen(s, "playing");
  else if (
    opening === "howto" &&
    (edges.confirm || edges.back || pointerConfirm)
  )
    s = fresh(s, "title");
  else if (opening === "gameover" && edges.back) s = fresh(s, "title");
  else if (menuItems(s).length) {
    const count = menuItems(s).length;
    if (edges.up) s.menuIndex = ((s.menuIndex ?? 0) + count - 1) % count;
    if (edges.down) s.menuIndex = ((s.menuIndex ?? 0) + 1) % count;
    if (edges.confirm || pointerConfirm) s = confirm(s);
  }
  const held = directions.filter((d) => api.input.value(d) > 0);
  // New movement presses replace the buffered request; older held keys do not.
  const newlyHeld = held.filter((d) => !s.held.includes(d));
  if (newlyHeld.length) s.desired = newlyHeld[newlyHeld.length - 1]!;
  s.held = held;
  if (opening === "playing") {
    s.pendingSonar ||= !!edges.a;
    s.pendingInk ||= !!edges.b;
  } else {
    s.pendingSonar = false;
    s.pendingInk = false;
  }
  const intent = {
    held: held.length ? [s.desired] : [],
    sonar: s.pendingSonar,
    ink: s.pendingInk,
  };
  s.accumulator += dt;
  let first = true;
  while (s.accumulator + 1e-10 >= C.TICK_DT) {
    s.accumulator -= C.TICK_DT;
    const [next, cues] = tick(s, {
      ...intent,
      sonar: first && intent.sonar,
      ink: first && intent.ink,
    });
    s = next;
    s.pendingSonar = false;
    s.pendingInk = false;
    for (const cue of cues) api.audio.play(cue);
    first = false;
  }
  return s;
}
export const game: Game<FathomState, FathomDebugApi> = {
  async initialize(api) {
    for (const a of C.ACTIONS)
      api.input.register(a, { keys: [...C.BINDINGS[a]] });
    Object.values(C.CUES).forEach((cue, i) =>
      api.audio.define(cue, {
        wave: i % 2 ? "triangle" : "sine",
        freq: 240 + i * 110,
        freqTo: cue === C.CUES.caught ? 60 : 400 + i * 140,
        durationMs: cue === C.CUES.sonar ? 350 : 90 + i * 30,
        gain: 0.08,
      }),
    );
    const sheets: Record<string, number> = {
      glimmerfin: 8,
      lanternjaw: 16,
      gloamfin: 8,
      flarefish: 8,
      drifter: 8,
      "flare-bloom": 8,
      "trench-walls": 19,
    };
    const loaded = await Promise.all(
      Object.entries(sheets).map(
        async ([name, count]) =>
          [
            name,
            await Promise.all(
              Array.from({ length: count }, (_, i) =>
                api.assets.loadImage(`${name}/${i}.png`),
              ),
            ),
          ] as const,
      ),
    );
    for (const key of [
      "screen",
      "depth",
      "score",
      "lives",
      "brightness",
      "visionRadius",
      "windowRadius",
      "planktonRemaining",
    ] as const)
      api.diagnostics.register(key, (s) => s[key]);
    api.diagnostics.register("sonar", (s) => s.sonar.cooldown.toFixed(2));
    api.diagnostics.register("ink", (s) => s.ink.cooldown.toFixed(2));
    api.diagnostics.register(
      "forager",
      (s) => `${s.forager.tx},${s.forager.ty} ${s.forager.dir}`,
    );
    for (let i = 0; i < C.DEN_ORDER.length * C.ROSTER_CAP; i++)
      api.diagnostics.register(`hunter ${i + 1}`, (s) => {
        const p = s.predators[i];
        return p
          ? `${p.kind} ${p.state} ${p.tx},${p.ty} ${p.speed.toFixed(0)} ${p.alert ? "ALERT" : ""}`
          : "none";
      });
    return [initial(Object.fromEntries(loaded)), debug];
  },
  update,
  render,
};
