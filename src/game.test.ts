import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  createEngine,
  ConstantClock,
  SequenceClock,
} from "@clockwyrks/simple-2d";
import {
  game,
  initial,
  debug,
  tick,
  distances,
  neighbor,
  directions,
  makeMaze,
} from "./game";
import * as C from "./constants";

const fixture = () =>
  Array.from({ length: 18 }, (_, y) =>
    y === 8 ? "#" + ".".repeat(34) + "#" : "#".repeat(36),
  );
function scenario() {
  let s = debug.setMaze(initial(), fixture());
  s = debug.clearPredators(s);
  s = debug.clearPlankton(s);
  s = debug.setForagerTile(s, 10, 8);
  return debug.setScreen(s, "playing");
}
function step(
  s: ReturnType<typeof initial>,
  n: number,
  input = { held: [] as typeof directions, sonar: false, ink: false },
) {
  for (let i = 0; i < n; i++)
    s = tick(s, {
      ...input,
      sonar: i === 0 && input.sonar,
      ink: i === 0 && input.ink,
    })[0];
  return s;
}
beforeEach(() => {
  vi.stubGlobal("fetch", async (url: string) => new Response(url));
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(await blob.text()),
  );
});
afterEach(() => vi.unstubAllGlobals());
async function engine(stepMs = 1000 / 60) {
  const events = new EventTarget();
  const canvas = createCanvas(1280, 720);
  const e = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: 1280,
    height: 720,
    game,
    clock: new ConstantClock(stepMs),
    surface: {
      cssWidth: () => 1280,
      cssHeight: () => 720,
      dpr: () => 1,
      events: () => events,
    },
  });
  await e.initialize();
  return { e, events };
}
function key(events: EventTarget, code: string, type = "keydown") {
  events.dispatchEvent(Object.assign(new Event(type), { code, repeat: false }));
}
describe("maze contract", () => {
  it("is symmetric, narrow, connected, enclosed and has no dead ends", () => {
    const s = initial(),
      rows = makeMaze();
    const nodes = distances(s, 13, 13);
    let count = 0,
      sum = 0;
    for (let y = 0; y < 18; y++)
      for (let x = 0; x < 36; x++) {
        const t = rows[y]![x]!;
        const mirrored = rows[y]![35 - x]!;
        if (!"dg".includes(t) && !"dg".includes(mirrored))
          expect(t).toBe(mirrored);
        if (t !== ".") continue;
        count++;
        expect(nodes.has(`${x},${y}`)).toBe(true);
        const n = directions.filter((d) => {
          const [xx, yy] = neighbor(s, x, y, d);
          return rows[yy]?.[xx] === ".";
        }).length;
        expect(n).toBeGreaterThanOrEqual(2);
        sum += n;
        expect(
          [rows[y]?.[x + 1], rows[y + 1]?.[x], rows[y + 1]?.[x + 1]].every(
            (v) => v === ".",
          ),
        ).toBe(false);
      }
    expect(count / 544).toBeGreaterThanOrEqual(C.MAZE_DENSITY_MIN);
    expect(sum / count).toBeLessThanOrEqual(C.MAZE_OPENNESS_MAX);
    const runs: number[] = [];
    const visited = new Set<string>();
    for (const k of nodes.keys()) {
      const [x, y] = k.split(",").map(Number) as [number, number];
      const ns = (xx: number, yy: number) =>
        directions
          .map((d) => neighbor(s, xx, yy, d))
          .filter(([a, b]) => rows[b]?.[a] === ".");
      if (ns(x, y).length !== 2 || visited.has(k)) continue;
      const q: [[number, number]] | [number, number][] = [[x, y]];
      visited.add(k);
      for (let i = 0; i < q.length; i++)
        for (const [a, b] of ns(...q[i]!)) {
          const kk = `${a},${b}`;
          if (ns(a, b).length === 2 && !visited.has(kk)) {
            visited.add(kk);
            q.push([a, b]);
          }
        }
      runs.push(q.length);
    }
    const mean = runs.reduce((a, b) => a + b, 0) / runs.length;
    expect(mean).toBeGreaterThanOrEqual(C.MAZE_MAZING_MIN);
    expect(mean).toBeLessThanOrEqual(C.MAZE_MAZING_MAX);
  });
});
describe("fixed-step simulation", () => {
  it("eats, holds brightness, decays, and clears only by eating", () => {
    let s = scenario();
    s = debug.setPlankton(s, 10, 8, true);
    s = debug.setPlankton(s, 11, 8, true);
    const [next, cues] = tick(s);
    expect(s.score).toBe(0);
    expect(next.score).toBe(C.SCORE_PLANKTON);
    expect(next.brightness).toBe(C.BRIGHT_PER_EAT);
    expect(cues).toContain(C.CUES.eat);
    expect(step(next, 120).brightness).toBeCloseTo(C.BRIGHT_PER_EAT);
    expect(step(next, 228).brightness).toBeCloseTo(C.BRIGHT_PER_EAT / 2);
    const last = debug.setForagerTile(next, 11, 8);
    expect(tick(last)[0].screen).toBe("cleared");
    expect(tick(last)[0].score).toBe(2 * C.SCORE_PLANKTON + C.SCORE_CLEAR);
    expect(tick(scenario())[0].screen).toBe("playing");
  });
  it("moves continuously, stops on release, reverses, and respects rock", () => {
    const s = scenario();
    const n = step(s, 30, { held: ["right"], sonar: false, ink: false });
    expect(n.forager.x - s.forager.x).toBeCloseTo(32);
    expect(step(n, 120).forager.x).toBe(n.forager.x);
    const back = step(n, 15, { held: ["left"], sonar: false, ink: false });
    expect(back.forager.x).toBeCloseTo(n.forager.x - 16);
    const wall = step(debug.setForagerTile(s, 34, 8), 120, {
      held: ["right"],
      sonar: false,
      ink: false,
    });
    expect(wall.forager.tx).toBe(34);
    expect(wall.forager.moving).toBe(false);
  });
  it("buffers perpendicular turns until a center", () => {
    let s = scenario();
    const rows = fixture();
    rows[7] = "#".repeat(11) + "." + "#".repeat(24);
    s = debug.setMaze(s, rows);
    s = step(s, 10, { held: ["right"], sonar: false, ink: false });
    const y = s.forager.y;
    s = step(s, 25, { held: ["up"], sonar: false, ink: false });
    expect(s.forager.tx).toBe(11);
    expect(s.forager.y).toBeLessThan(y);
  });
  it("carries position through the wrap tunnel", () => {
    let s = scenario();
    const rows = fixture();
    rows[8] = ".".repeat(36);
    s = debug.setMaze(s, rows);
    s = debug.setForagerTile(s, 0, 8);
    const n = step(s, 30, { held: ["left"], sonar: false, ink: false });
    expect(n.forager.tx).toBe(35);
    expect(n.forager.x).toBeCloseTo(1200);
  });
  it("remembers fog beyond the circular rendering window and reveals rock but not behind it", () => {
    const s = scenario();
    const n = tick(s)[0];
    expect(n.visibility[8]![10]).toBe("l");
    expect(n.visibility[7]![10]).toBe("l");
    expect(n.visibility[6]![10]).toBe("u");
    const moved = debug.setForagerTile(n, 30, 8);
    expect(tick(moved)[0].visibility[8]![10]).toBe("r");
    expect(
      debug
        .reconcile(debug.clearFog(moved))
        .visibility.every((r) => /^u+$/.test(r)),
    ).toBe(true);
  });
  it("casts a travelling pulse and fixed ink cloud with cooldowns", () => {
    let s = scenario();
    s = debug.addPredator(s, "gloamfin", 17, 8);
    s = debug.setPredatorMind(s, 0, false);
    s = debug.setPredatorTravel(s, 0, false);
    s = tick(s, { held: [], sonar: true, ink: true })[0];
    expect(s.sonar.cooldown).toBe(C.SONAR_COOLDOWN);
    expect(s.inkClouds[0]!.radius).toBe(C.INK_RADIUS);
    expect(s.predators[0]!.lit).toBe(false);
    s = step(s, 65);
    expect(s.predators[0]!.lit).toBe(true);
    expect(s.visibility[8]![17]).toBe("l");
    s = step(s, 300);
    expect(s.inkClouds).toHaveLength(0);
    expect(s.sonar.ready).toBe(true);
  });
  it("scores drifters and preserves plankton, memory and score when caught", () => {
    let s = scenario();
    s = debug.spawnDrifter(s, 10, 8);
    s = debug.setDrifterMind(s, 0, false);
    s = tick(s)[0];
    expect(s.score).toBe(C.SCORE_DRIFTER);
    s = debug.addPredator(s, "flarefish", 10, 8);
    s = debug.setPredatorMind(s, 0, false);
    const n = tick(s)[0];
    expect(n.screen).toBe("countdown");
    expect(n.lives).toBe(2);
    expect(n.score).toBe(s.score);
    expect(n.planktonRemaining).toBe(0);
    s = debug.setLives(s, 0);
    expect(tick(s)[0].screen).toBe("gameover");
  });
  it("hunts light, immediately loses a fix to ink, and keeps hearing through ink", () => {
    let s = scenario();
    s = debug.addPredator(s, "lanternjaw", 13, 8);
    s = debug.setPredatorTravel(s, 0, false);
    s = tick(s)[0];
    expect(s.predators[0]!.state).toBe("chase");
    expect(s.predators[0]!.alert).toBe(false);
    s = tick(s, { held: [], sonar: false, ink: true })[0];
    expect(s.predators[0]!.state).toBe("wander");
    s = debug.addPredator(s, "gloamfin", 12, 8);
    s = debug.setPredatorTravel(s, 1, false);
    s = tick(s)[0];
    expect(s.predators[1]!.hearingLock).toBe(true);
    expect(s.predators[1]!.state).toBe("chase");
  });
  it("releases roster in staggered slots only in play", () => {
    let s = debug.setScreen(initial(), "countdown");
    s = step(s, 179);
    expect(s.predators.every((p) => !p.released)).toBe(true);
    s = step(s, 2);
    expect(s.predators[0]!.released).toBe(true);
    expect(s.predators[1]!.released).toBe(false);
    s = step(s, 600);
    expect(s.predators[1]!.released).toBe(true);
  });
  it("runs flares through charge and bloom without revealing via enemy pings", () => {
    let s = scenario();
    s = debug.addPredator(s, "flarefish", 30, 8);
    s = debug.setPredatorTravel(s, 0, false);
    s = step(s, 840);
    expect(s.predators[0]!.flareCharging).toBe(true);
    s = step(s, 60);
    expect(s.predators[0]!.flaring).toBe(true);
    expect(s.visibility[8]![30]).toBe("l");
    s = step(s, 120);
    expect(s.predators[0]!.flaring).toBe(false);
    expect(s.visibility[8]![30]).toBe("r");
    s = scenario();
    s = debug.addPredator(s, "gloamfin", 30, 8);
    s = debug.setPredatorTravel(s, 0, false);
    s = step(s, 500);
    expect(s.pulses.some((p) => p.source === "gloamfin")).toBe(true);
    expect(s.visibility[8]![30]).toBe("u");
  });
});
describe("debug poses and engine integration", () => {
  it("validates domains, keeps reset pure, and reconciles without running systems", () => {
    const s = scenario();
    expect(() => debug.setBrightness(s, 2)).toThrow();
    expect(() => debug.setMaze(s, ["."])).toThrow();
    expect(() => debug.setForagerTile(s, 0, 0)).toThrow();
    expect(() => debug.setPredatorMind(s, 0, false)).toThrow();
    const n = debug.setDepth(s, 4);
    expect(n.predators).toHaveLength(6);
    expect(n.sonar.range).toBe(6);
    expect(debug.reconcile(n)).toEqual(debug.reconcile(debug.reconcile(n)));
    const reset = debug.reset({ ...n, muted: true });
    expect(reset.muted).toBe(true);
    expect(reset.screen).toBe("title");
    expect(reset.simTime).toBe(0);
    expect(JSON.parse(JSON.stringify(debug.snapshot(n))).version).toBe(1);
  });
  it("uses engine actions, menus, pause priority, mute, cues and recording", async () => {
    const { e, events } = await engine();
    expect(e.debug.version).toBe(1);
    key(events, "Enter");
    await e.advance(1);
    key(events, "Enter", "keyup");
    expect(e.state.screen).toBe("countdown");
    await e.advance(90);
    expect(e.state.screen).toBe("playing");
    key(events, "Escape");
    await e.advance(1);
    key(events, "Escape", "keyup");
    expect(e.state.screen).toBe("paused");
    const x = e.state.forager.x;
    await e.advance(30);
    expect(e.state.forager.x).toBe(x);
    key(events, "Escape");
    await e.advance(1);
    key(events, "Escape", "keyup");
    expect(e.state.screen).toBe("playing");
    key(events, "KeyM");
    await e.advance(1);
    expect(e.state.muted).toBe(true);
    const cues: string[] = [];
    e.events.on("cue:played", (v) => cues.push(v.cue));
    key(events, "Space");
    e.startRecording();
    await e.advance(1);
    expect(cues).toContain(C.CUES.sonar);
    expect(e.stopRecording().frames).toHaveLength(1);
    expect(e.diagnostics().length).toBeGreaterThan(10);
    e.destroy();
  });
  it("gives identical simulation under different frame partitions", async () => {
    const a = await engine(1000 / 60),
      b = await engine(1000 / 120);
    a.e.apply(() => scenario());
    b.e.apply(() => scenario());
    key(a.events, "ArrowRight");
    key(b.events, "ArrowRight");
    await a.e.advance(60);
    await b.e.advance(120);
    expect(debug.snapshot(a.e.state)).toEqual(debug.snapshot(b.e.state));
    b.e.setClock(new SequenceClock([5, 10, 15, 20]));
    a.e.destroy();
    b.e.destroy();
  });
});

describe("independent hunter systems", () => {
  it("holds a lapsed light fix for exactly two seconds", () => {
    let s = debug.addPredator(scenario(), "lanternjaw", 13, 8);
    s = debug.setPredatorTravel(s, 0, false);
    s = tick(s)[0];
    s = debug.setForagerTile(s, 30, 8);
    s = step(s, 239);
    expect(s.predators[0]!.state).toBe("chase");
    expect(step(s, 1).predators[0]!.state).toBe("wander");
  });
  it("searches an abandoned sound fix and casts one orange ping", () => {
    let s = debug.addPredator(scenario(), "gloamfin", 18, 8);
    s = debug.setPredatorState(s, 0, "chase");
    s = debug.setForagerTile(s, 30, 8);
    s = step(s, 400);
    expect(s.predators[0]!.state).toBe("search");
    expect(s.pulses.some((p) => p.tint === "orange")).toBe(true);
    expect(s.predators[0]!.searchPing).toBe(true);
    s = step(s, 500);
    expect(s.predators[0]!.state).toBe("wander");
  });
  it("routes a chase around rock by the shortest open route", () => {
    let s = scenario();
    const rows = Array.from({ length: 18 }, () => "#".repeat(36));
    for (const y of [7, 9])
      rows[y] = "#".repeat(8) + ".".repeat(7) + "#".repeat(21);
    rows[8] = "#".repeat(8) + "." + "#".repeat(5) + "." + "#".repeat(21);
    s = debug.setMaze(s, rows);
    s = debug.setForagerTile(s, 14, 8);
    s = debug.addPredator(s, "lanternjaw", 8, 8);
    s = debug.setPredatorState(s, 0, "chase");
    s = step(s, 40);
    expect(s.predators[0]!.tx).toBe(8);
    expect([7, 9]).toContain(s.predators[0]!.ty);
    expect(s.tiles[s.predators[0]!.ty]![s.predators[0]!.tx]).toBe(".");
  });
  it("separates mind, travel, and contact for frozen creatures", () => {
    let s = debug.addPredator(scenario(), "flarefish", 12, 8);
    s = debug.setPredatorMind(s, 0, false);
    const frozen = step(s, 300);
    expect(frozen.predators[0]!.x).toBe(s.predators[0]!.x);
    expect(frozen.predators[0]!.state).toBe("wander");
    s = debug.setPredatorMind(s, 0, true);
    s = debug.setPredatorTravel(s, 0, false);
    const sensing = step(s, 20);
    expect(sensing.predators[0]!.x).toBe(s.predators[0]!.x);
    expect(sensing.predators[0]!.state).toBe("chase");
    expect(sensing.predators[0]!.alert).toBe(true);
  });
  it("admits drifters on cadence only while plankton remain", () => {
    let s = debug.clearPredators(debug.setScreen(initial(), "playing"));
    s = debug.setDrifterIn(s, 0);
    expect(tick(s)[0].drifters).toHaveLength(1);
    s = debug.clearPlankton(s);
    expect(tick(s)[0].drifters).toHaveLength(0);
    s = scenario();
    for (let i = 0; i < 3; i++) s = debug.spawnDrifter(s, 20, 8);
    expect(s.drifters).toHaveLength(3);
    s = debug.setDrifterMind(s, 0, false);
    s = debug.setDrifterTravel(s, 1, false);
    expect(
      step(s, 60)
        .drifters.slice(0, 2)
        .map((d) => d.x),
    ).toEqual(s.drifters.slice(0, 2).map((d) => d.x));
  });
});

it("renders a genuinely frozen maze while paused, though simTime continues", async () => {
  const { e, events } = await engine();
  e.apply(() => scenario());
  key(events, "ArrowRight");
  await e.advance(13);
  e.apply((s) => debug.setScreen(s, "paused"));
  const time = e.state.simTime;
  e.startRecording();
  await e.advance(2);
  const recording = e.stopRecording();
  expect(recording.frames[0]!.ops).toEqual(recording.frames[1]!.ops);
  expect(e.state.simTime).toBeGreaterThan(time);
  e.destroy();
});
