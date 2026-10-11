import type { RenderApi } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import {
  BACKGROUND,
  center,
  directions,
  distances,
  menuItemRect,
  lineClear,
  menuItems,
  neighbor,
  tile,
} from "./game";
import type { Body, FathomState } from "./game";
import * as C from "./constants";
type S = DeepReadonly<FathomState>;
const aqua = "#8ef9e8",
  dim = "#577e89",
  amber = "#ff9a63";
export function render(s: S, { ctx: c }: RenderApi) {
  c.imageSmoothingEnabled = false;
  const text = (
    t: string,
    x: number,
    y: number,
    size = 16,
    color = aqua,
    align: CanvasTextAlign = "left",
  ) => {
    c.font = `${size}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    c.textAlign = align;
    c.fillStyle = color;
    c.fillText(t, x, y);
  };
  const glow = (x: number, y: number, r: number, color: string, alpha = 1) => {
    c.save();
    c.globalAlpha = alpha;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    c.restore();
  };
  const sprite = (name: string, i: number, x: number, y: number, w = 32) => {
    const img = s.assets[name]?.[i];
    if (img) c.drawImage(img, x - w / 2, y - w / 2, w, w);
  };
  const frame = (b: DeepReadonly<Body>, rate = 8) =>
    ({ down: 0, up: 2, left: 4, right: 6 })[b.dir] +
    (b.moving ? Math.floor(s.playTime * rate) % 2 : 0);
  const terrain = (x: number, y: number) => {
    const t = tile(s, x, y),
      v = s.visibility[y]![x];
    const [cx, cy] = center(x, y);
    if (v === "u") {
      sprite("trench-walls", 17, cx, cy);
      return;
    }
    let i = 16;
    if (t === "#") {
      i = 0;
      directions.forEach((d, j) => {
        const dx = d === "left" ? -1 : d === "right" ? 1 : 0,
          dy = d === "up" ? -1 : d === "down" ? 1 : 0;
        if (tile(s, x + dx, y + dy) === "#") i += [1, 4, 8, 2][j]!;
      });
    } else if (t === "g") i = 18;
    c.globalAlpha = v === "l" ? 1 : 0.28;
    sprite("trench-walls", i, cx, cy);
    if (s.plankton[y]![x] === "*") {
      c.fillStyle = aqua;
      c.shadowColor = aqua;
      c.shadowBlur = v === "l" ? 8 : 0;
      c.beginPath();
      c.arc(cx, cy, C.PLANKTON_DOT / 2, 0, Math.PI * 2);
      c.fill();
      c.shadowBlur = 0;
    }
    c.globalAlpha = 1;
  };
  const bulb = (b: { readonly x: number; readonly y: number }) => {
    glow(b.x, b.y, 16, amber, 0.6);
    c.fillStyle = "#ffd39a";
    c.beginPath();
    c.arc(b.x, b.y, 3, 0, Math.PI * 2);
    c.fill();
  };
  const mazeScreens = ["playing", "paused", "countdown", "cleared"];
  if (mazeScreens.includes(s.screen)) {
    c.fillStyle = BACKGROUND;
    c.fillRect(
      C.GRID_ORIGIN_X,
      C.GRID_ORIGIN_Y,
      C.GRID_COLS * C.TILE,
      C.GRID_ROWS * C.TILE,
    );
    c.save();
    c.beginPath();
    c.rect(
      C.GRID_ORIGIN_X,
      C.GRID_ORIGIN_Y,
      C.GRID_COLS * C.TILE,
      C.GRID_ROWS * C.TILE,
    );
    c.clip();
    c.save();
    c.beginPath();
    c.arc(s.forager.x, s.forager.y, s.windowRadius, 0, Math.PI * 2);
    c.clip();
    for (let y = 0; y < C.GRID_ROWS; y++)
      for (let x = 0; x < C.GRID_COLS; x++) terrain(x, y);
    glow(s.forager.x, s.forager.y, s.windowRadius, "#0d655e", 0.18);
    for (const d of s.drifters) {
      if (d.lit) sprite("drifter", Math.floor(s.playTime * 8) % 8, d.x, d.y);
      bulb(d);
    }
    for (const p of s.predators)
      if (p.kind === "lanternjaw" && p.state !== "den") bulb(p);
    c.restore();
    for (const p of s.predators)
      if (p.flaring) {
        c.save();
        c.beginPath();
        c.arc(p.x, p.y, C.FLARE_RADIUS, 0, Math.PI * 2);
        c.clip();
        for (let y = 0; y < C.GRID_ROWS; y++)
          for (let x = 0; x < C.GRID_COLS; x++) terrain(x, y);
        for (const d of s.drifters)
          if (d.lit)
            sprite("drifter", Math.floor(s.playTime * 8) % 8, d.x, d.y);
        c.restore();
      }
    for (const p of s.pulses) {
      const ds = distances(s, p.ox, p.oy);
      c.strokeStyle =
        p.tint === "cyan"
          ? "#7efcf7"
          : p.tint === "orange"
            ? "#ff9b57"
            : "#bb8aff";
      c.shadowColor = c.strokeStyle;
      c.shadowBlur = 12;
      c.lineWidth = 2;
      // A transverse crest travels along each outward corridor edge, splitting
      // at junctions and bending with the same flood used by the simulation.
      for (const [key, d] of ds) {
        if (d >= p.range || p.front < d || p.front > d + 1) continue;
        const [x, y] = key.split(",").map(Number) as [number, number];
        const [cx, cy] = center(x, y);
        for (const dir of directions) {
          const [nx, ny] = neighbor(s, x, y, dir);
          if (ds.get(`${nx},${ny}`) !== d + 1) continue;
          const dx = dir === "left" ? -1 : dir === "right" ? 1 : 0;
          const dy = dir === "up" ? -1 : dir === "down" ? 1 : 0;
          const offset = (p.front - d) * C.TILE;
          let px = cx + dx * offset;
          const py = cy + dy * offset;
          if (px < C.GRID_ORIGIN_X) px += C.GRID_COLS * C.TILE;
          if (px > C.GRID_ORIGIN_X + C.GRID_COLS * C.TILE)
            px -= C.GRID_COLS * C.TILE;
          c.beginPath();
          c.moveTo(px - dy * 12, py + dx * 12);
          c.lineTo(px + dy * 12, py - dx * 12);
          c.stroke();
        }
      }
      c.globalAlpha = 1;
      c.shadowBlur = 0;
    }
    for (const cloud of s.inkClouds)
      glow(cloud.x, cloud.y, cloud.radius, "#000007", 0.95);
    for (const p of s.predators) {
      if (p.lit) {
        const f =
          p.kind === "lanternjaw" && p.state === "wander"
            ? 8 + (Math.floor(s.playTime * 8) % 8)
            : frame(p, 7);
        const [tx, ty] = center(p.tx, p.ty);
        const passive =
          Math.hypot(tx - s.forager.x, ty - s.forager.y) <= s.visionRadius &&
          lineClear(s, s.forager, tx, ty);
        const flare = s.predators.some(
          (h) =>
            h.flaring && Math.hypot(h.x - p.x, h.y - p.y) <= C.FLARE_RADIUS,
        );
        if (p.mark > 0 && !passive && !flare && !p.alert)
          c.globalAlpha = p.mark / C.SONAR_MARK_TIME;
        sprite(p.kind, f, p.x, p.y);
        c.globalAlpha = 1;
      }
      if (p.alert) {
        c.globalAlpha = p.alertLeft / C.ALERT_TIME;
        c.strokeStyle = p.kind === "gloamfin" ? "#c1a0ff" : "#ffb581";
        c.lineWidth = 2;
        c.beginPath();
        c.arc(
          p.x,
          p.y,
          18 + (1 - p.alertLeft / C.ALERT_TIME) * 28,
          0,
          Math.PI * 2,
        );
        c.stroke();
        c.globalAlpha = 1;
      }
      if (p.flareCharging || p.flaring || p.fade > 0) {
        const f = p.flareCharging
          ? Math.min(2, Math.floor((p.flareTime / C.FLARE_CHARGE) * 3))
          : p.flaring
            ? 3 +
              Math.min(
                2,
                Math.floor(
                  ((p.flareTime - C.FLARE_CHARGE) / C.FLARE_BLOOM) * 3,
                ),
              )
            : p.fade > 0.15
              ? 6
              : 7;
        sprite("flare-bloom", f, p.x, p.y, C.FLARE_RADIUS * 2);
      }
    }
    glow(s.forager.x, s.forager.y, 32, "#64ffe0", 0.55);
    sprite("glimmerfin", frame(s.forager, 9), s.forager.x, s.forager.y);
    c.restore();
    text(C.TITLE_TEXT, 64, 40, 22);
    text(C.DIVE_LABEL, 64, 62, 12, dim);
    text(String(s.score).padStart(6, "0"), 640, 60, 48, aqua, "center");
    text(`${s.planktonRemaining} MOTES LEFT`, 1216, 44, 14, dim, "right");
    text(
      s.muted ? "M · SOUND OFF" : "M · SOUND ON",
      1216,
      66,
      11,
      dim,
      "right",
    );
    text(`DEPTH ${String(s.depth).padStart(2, "0")}`, 64, 695, 18);
    for (let i = 0; i < s.lives; i++)
      sprite("glimmerfin", 6, 245 + i * 28, 685, 24);
    const gauge = (label: string, x: number, v: number, color: string) => {
      text(label, x, 679, 12, dim);
      c.fillStyle = "#112630";
      c.fillRect(x, 690, 160, 5);
      c.fillStyle = color;
      c.fillRect(x, 690, 160 * Math.max(0, Math.min(1, v)), 5);
    };
    gauge("SPACE · SONAR", 560, 1 - s.sonar.cooldown / C.SONAR_COOLDOWN, aqua);
    gauge("SHIFT · INK", 790, 1 - s.ink.cooldown / C.INK_COOLDOWN, "#aaa0d4");
    text("P / ESC · PAUSE", 1216, 695, 12, dim, "right");
    if (s.screen === "countdown" || s.screen === "cleared") {
      c.fillStyle = "#03090fb0";
      c.fillRect(400, 282, 480, 130);
      text(
        s.screen === "countdown"
          ? C.TITLE_ITEMS[0]
          : `DEPTH ${s.depth} CLEARED`,
        640,
        336,
        32,
        aqua,
        "center",
      );
      text(
        s.screen === "countdown"
          ? `${Math.max(1, Math.ceil(1.5 - s.screenTime))}  /  DESCENDING`
          : "+500  ·  THE ABYSS GOES DEEPER",
        640,
        380,
        14,
        dim,
        "center",
      );
    }
  }
  if (s.screen === "title" || s.screen === "gameover" || s.screen === "howto") {
    // Quiet currents and a topographic halo lend the title its own deep-water identity.
    for (let i = 0; i < 65; i++) {
      const x = (i * 193 + 47) % 1280,
        y = (i * 113 + 29) % 720;
      glow(x, y, i % 3 === 0 ? 3 : 1, "#40978e", 0.35);
    }
    c.strokeStyle = "#123130";
    c.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      c.beginPath();
      c.ellipse(640, 280, 180 + i * 36, 92 + i * 19, -0.12, 0, Math.PI * 2);
      c.stroke();
    }
    glow(640, 268, 230, "#08473e", 0.28);
    text(
      "B I O L U M I N E S C E N T   D E E P - S E A   C H A S E",
      640,
      102,
      12,
      dim,
      "center",
    );
    if (s.screen === "title") {
      text(C.TITLE_TEXT, 640, 278, 96, aqua, "center");
      text(C.TAGLINE_TEXT, 640, 326, 18, dim, "center");
      sprite("glimmerfin", 6, 640, 174, 48);
      text("EAT TO SHINE.  SHINE TO BE FOUND.", 640, 591, 14, dim, "center");
      text(
        "ARROWS / WASD   ·   SPACE SONAR   ·   SHIFT INK",
        640,
        644,
        12,
        dim,
        "center",
      );
    }
    if (s.screen === "gameover") {
      text("LOST TO THE DEEP", 640, 245, 40, aqua, "center");
      text(
        `${s.score} POINTS   /   DEPTH ${s.depth}`,
        640,
        310,
        22,
        dim,
        "center",
      );
    }
    if (s.screen === "howto") {
      c.fillStyle = "#03090ff2";
      c.fillRect(120, 120, 1040, 520);
      text("READ THE DARK", 180, 178, 34);
      const lines = [
        "ARROWS / WASD  Swim. Eat the glowing plankton to clear the maze.",
        "Your light remembers the rock. Eating makes your window grow.",
        "SPACE  Send sonar around corners — but sound gives you away.",
        "SHIFT  Leave ink behind. Blind light hunters for a moment.",
        "LANTERNJAW  Follows your glow. An amber jelly may hide jaws.",
        "GLOAMFIN  Hears through rock. Turn corners to shake its chase.",
        "FLAREFISH  Burns the dark open. Get clear before it sees you.",
        "P / ESC  Pause.   M  Toggle sound.   ENTER / SPACE  Choose.",
      ];
      lines.forEach((l, i) =>
        text(l, 180, 235 + i * 41, 17, i > 3 && i < 7 ? "#c8b89d" : dim),
      );
      text(
        "ENTER / ESC / CLICK  ·  RETURN TO THE SURFACE",
        640,
        618,
        14,
        aqua,
        "center",
      );
    }
  }
  if (s.screen === "paused") {
    c.fillStyle = "#03090fe0";
    c.fillRect(380, 190, 520, 420);
    text("SUSPENDED", 640, 290, 40, aqua, "center");
    text("THE CURRENT CAN WAIT", 640, 332, 14, dim, "center");
  }
  menuItems(s).forEach((label, i) => {
    const r = menuItemRect(s, i)!;
    const selected = i === s.menuIndex;
    c.fillStyle = selected ? "#123632" : "#08151b";
    c.fillRect(r.x, r.y, r.w, r.h);
    c.strokeStyle = selected ? "#73dfc7" : "#173039";
    c.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    text(
      `${selected ? "›  " : ""}${label}`,
      640,
      r.y + 31,
      18,
      selected ? aqua : dim,
      "center",
    );
  });
}
