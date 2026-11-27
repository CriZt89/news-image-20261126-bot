// news-image-20261126 v2 — "The world in one day: Thursday 26 November 2026".
// 40 dated stories across 10 regions, winner template: masthead, stats strip,
// UTC timeline, region tabs, 3 illustrated leads, 10 numbered medium panels,
// world map with pins 1-13, ALSO ON 14-40, DATE CHECK box, HOW SURE legend.
// Draws a 1024x1024 PNG with a pure-TypeScript PNG encoder (Node stdlib only,
// no network, fully deterministic). Anchor: makefun anchor
// 5ea16525465e0e3c01c704e5a0a4ec8d232e3190 round 34284352
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

type RGB = [number, number, number];

// ---------------------------------------------------------------- CRC32 / PNG
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePNG(w: number, h: number, rgb: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type 2 = RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0; // filter: none
    rgb.copy(raw, y * (1 + w * 3) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- Canvas
class Canvas {
  w: number;
  h: number;
  buf: Buffer;
  constructor(w: number, h: number, bg: RGB) {
    this.w = w;
    this.h = h;
    this.buf = Buffer.alloc(w * h * 3);
    this.fillRect(0, 0, w, h, bg);
  }
  set(x: number, y: number, c: RGB): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.buf[i] = c[0];
    this.buf[i + 1] = c[1];
    this.buf[i + 2] = c[2];
  }
  fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c);
  }
  rect(x: number, y: number, w: number, h: number, c: RGB, t = 1): void {
    this.fillRect(x, y, w, t, c);
    this.fillRect(x, y + h - t, w, t, c);
    this.fillRect(x, y, t, h, c);
    this.fillRect(x + w - t, y, t, h, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB, t = 1): void {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    for (;;) {
      this.fillRect(x - Math.floor(t / 2), y - Math.floor(t / 2), t, t, c);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }
  circle(cx: number, cy: number, r: number, c: RGB): void {
    for (let y = -r; y <= r; y++) {
      const half = Math.floor(Math.sqrt(r * r - y * y));
      for (let x = -half; x <= half; x++) this.set(cx + x, cy + y, c);
    }
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
    for (let y = -ry; y <= ry; y++) {
      const half = Math.floor((rx * Math.sqrt(ry * ry - y * y)) / ry);
      for (let x = -half; x <= half; x++) this.set(cx + x, cy + y, c);
    }
  }
  triangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
    const minX = Math.min(x0, x1, x2);
    const maxX = Math.max(x0, x1, x2);
    const minY = Math.min(y0, y1, y2);
    const maxY = Math.max(y0, y1, y2);
    const d = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
    if (d === 0) return;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const a = ((x1 - x) * (y2 - y) - (y1 - y) * (x2 - x)) / d;
        const b = ((x2 - x) * (y0 - y) - (y2 - y) * (x0 - x)) / d;
        const g = 1 - a - b;
        if (a >= 0 && b >= 0 && g >= 0) this.set(x, y, c);
      }
    }
  }
}

// ---------------------------------------------------------------- 5x7 bitmap font
// Each glyph: 7 rows, each a 5-bit mask (bit 4 = leftmost pixel).
const FONT: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  '0': [14, 17, 19, 21, 25, 17, 14],
  '1': [4, 12, 4, 4, 4, 4, 14],
  '2': [14, 17, 1, 6, 8, 16, 31],
  '3': [30, 1, 1, 14, 1, 1, 30],
  '4': [2, 6, 10, 18, 31, 2, 2],
  '5': [31, 16, 30, 1, 1, 17, 14],
  '6': [6, 8, 16, 30, 17, 17, 14],
  '7': [31, 1, 2, 4, 8, 8, 8],
  '8': [14, 17, 17, 14, 17, 17, 14],
  '9': [14, 17, 17, 15, 1, 2, 12],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 12, 12],
  ',': [0, 0, 0, 0, 12, 4, 8],
  "'": [4, 4, 8, 0, 0, 0, 0],
  '%': [25, 26, 2, 4, 8, 11, 19],
  $: [4, 15, 20, 14, 5, 30, 4],
  '-': [0, 0, 0, 14, 0, 0, 0],
  '/': [1, 1, 2, 4, 8, 16, 16],
  ':': [0, 12, 12, 0, 12, 12, 0],
  '(': [2, 4, 8, 8, 8, 4, 2],
  ')': [8, 4, 2, 2, 2, 4, 8],
  '+': [0, 4, 4, 31, 4, 4, 0],
  '!': [4, 4, 4, 4, 4, 0, 4],
  '?': [14, 17, 1, 6, 4, 0, 4],
  '&': [12, 18, 20, 8, 21, 18, 13],
  '=': [0, 0, 31, 0, 31, 0, 0],
  ';': [0, 12, 12, 0, 12, 4, 8],
};

// ---------------------------------------------------------------- Text
function textWidth(s: string, scale: number): number {
  return s.length * 6 * scale - scale;
}

function drawText(cv: Canvas, x: number, y: number, s: string, scale: number, c: RGB): void {
  // Floor the origin: Buffer indices must be integers, and a fractional
  // index silently writes nothing. Without this floor, centred text (tabs,
  // footer), chip numbers and pin labels were invisible in v2's first run.
  let cx = Math.floor(x);
  for (const ch of s.toUpperCase()) {
    const g = FONT[ch] ?? FONT['?'];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (g[row] & (1 << (4 - col))) {
          cv.fillRect(cx + col * scale, y + row * scale, scale, scale, c);
        }
      }
    }
    cx += 6 * scale;
  }
}

function wrapText(s: string, maxWidth: number, scale: number): string[] {
  const words = s.toUpperCase().split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (textWidth(test, scale) <= maxWidth) {
      cur = test;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---------------------------------------------------------------- Palette
const PAPER: RGB = [246, 241, 231];
const INK: RGB = [26, 26, 46];
const NAVY: RGB = [20, 33, 61];
const GOLD: RGB = [212, 175, 55];
const WHITE: RGB = [255, 255, 255];
const GREY: RGB = [90, 90, 105];
const LIGHT: RGB = [228, 234, 240];
const LAND: RGB = [203, 208, 193];
const RED: RGB = [193, 18, 31];

// ---------------------------------------------------------------- Layout
const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- Art (compact pictograms, ~60x44)
function drawArt(cv: Canvas, kind: string, x: number, y: number, c: RGB): void {
  if (kind === 'storm') {
    // storm cloud, rain, lightning
    cv.ellipse(x + 28, y + 12, 24, 11, [96, 104, 126]);
    cv.ellipse(x + 14, y + 16, 14, 8, [96, 104, 126]);
    cv.ellipse(x + 44, y + 16, 14, 8, [96, 104, 126]);
    cv.fillRect(x + 28, y + 18, 34, 6, [96, 104, 126]);
    cv.line(x + 10, y + 30, x + 10, y + 40, [70, 110, 170], 2);
    cv.line(x + 24, y + 32, x + 24, y + 42, [70, 110, 170], 2);
    cv.line(x + 52, y + 30, x + 52, y + 40, [70, 110, 170], 2);
    cv.triangle(x + 42, y + 22, x + 34, y + 34, x + 42, y + 34, [232, 184, 32]);
    cv.triangle(x + 42, y + 34, x + 34, y + 46, x + 42, y + 46, [232, 184, 32]);
  } else if (kind === 'bank') {
    cv.triangle(x + 4, y + 12, x + 56, y + 12, x + 30, y + 2, c);
    cv.fillRect(x, y + 14, 60, 4, c);
    for (let i = 0; i < 4; i++) cv.fillRect(x + 4 + i * 15, y + 20, 6, 18, c);
    cv.fillRect(x, y + 40, 60, 4, c);
  } else if (kind === 'ship') {
    cv.fillRect(x + 6, y + 12, 11, 10, c);
    cv.fillRect(x + 19, y + 12, 11, 10, [90, 90, 105]);
    cv.fillRect(x + 32, y + 12, 11, 10, c);
    cv.fillRect(x + 45, y + 6, 5, 16, c);
    cv.triangle(x, y + 24, x + 60, y + 24, x + 50, y + 40, c);
    cv.triangle(x, y + 24, x + 10, y + 40, x + 50, y + 40, c);
    cv.fillRect(x, y + 43, 60, 3, [90, 90, 105]);
  }
}

// ---------------------------------------------------------------- Data (all 26 Nov 2026, verified)
interface Lead {
  kicker: string;
  title: string;
  big: string;
  caption: string;
  bg: RGB;
  accent: RGB;
  art: string;
}

const LEADS: Lead[] = [
  {
    kicker: 'UNITED STATES - THANKSGIVING STORM',
    title: 'STORM HITS THANKSGIVING',
    big: '1M',
    caption:
      "Storm hits both coasts: 1M homes dark, 2,000+ flights delayed. Macy's 100th parade POSTPONED to Saturday - first delay in 100 years.",
    bg: [232, 238, 245],
    accent: [30, 58, 138],
    art: 'storm',
  },
  {
    kicker: 'SOUTH KOREA - ECONOMY',
    title: 'BANK OF KOREA HIKES RATE',
    big: '3.25%',
    caption:
      'Seoul lifts its base rate 25 basis points in a 5-2 vote, the third hike of 2026 and the highest since Nov 2024. Growth seen at 3.3%.',
    bg: [230, 242, 240],
    accent: [15, 118, 110],
    art: 'bank',
  },
  {
    kicker: 'UNITED STATES - TRADE',
    title: 'US PROPOSES TARIFFS ON 14',
    big: '14',
    caption:
      'Washington proposes duties on 14 economies: 15% on the EU, Japan and Korea, 20% on China, 25% on India, 35% on Vietnam. Not yet in force.',
    bg: [232, 237, 247],
    accent: [30, 58, 138],
    art: 'ship',
  },
];

interface Medium {
  n: number;
  title: string;
  caption: string;
  src: string;
  badge: string;
  bg: RGB;
  accent: RGB;
}

const MEDIUM: Medium[] = [
  {
    n: 4,
    title: 'TANKERS HIT BY MINES',
    caption:
      "Two tankers hit mines near Oman, Iran's Guards say; one carried 2M barrels.",
    src: 'REUTERS',
    badge: 'CLAIM',
    bg: [243, 232, 232],
    accent: [127, 29, 29],
  },
  {
    n: 5,
    title: 'KUWAIT DRONE STRIKE',
    caption:
      'Iranian drone attack in Kuwait kills 2 Italian technicians. Iran denies it.',
    src: 'REUTERS',
    badge: 'REPORTED',
    bg: [253, 238, 222],
    accent: [194, 65, 12],
  },
  {
    n: 6,
    title: 'EBOLA PASSES 12,000',
    caption:
      'DR Congo outbreak reaches 12,021 cases and 5,904 dead, health officials say.',
    src: 'WHO',
    badge: 'OFFICIAL',
    bg: [232, 245, 233],
    accent: [21, 128, 61],
  },
  {
    n: 7,
    title: 'GUINEA-BISSAU DELAYS VOTE',
    caption:
      'Military rulers push elections to Nov 2028, two years late, a year after the coup.',
    src: 'REUTERS',
    badge: 'OFFICIAL',
    bg: [240, 238, 232],
    accent: [90, 90, 105],
  },
  {
    n: 8,
    title: 'BANGKOK BLAST',
    caption:
      'Blast at the Bangchak refinery injures 9, three critically; smoke over Bangkok.',
    src: 'BBC',
    badge: 'REPORTED',
    bg: [253, 238, 222],
    accent: [194, 65, 12],
  },
  {
    n: 9,
    title: 'TANKER SINKS OFF IBIZA',
    caption:
      'Diesel tanker carrying up to 7,000 tonnes capsizes near Ibiza; one killed.',
    src: 'BBC',
    badge: 'REPORTED',
    bg: [232, 238, 245],
    accent: [30, 58, 138],
  },
  {
    n: 10,
    title: 'UK-EU TREATY TEXT OUT',
    caption:
      'New UK-EU treaty text is published, with a 10-year termination clause.',
    src: 'BBC',
    badge: 'OFFICIAL',
    bg: [232, 237, 247],
    accent: [30, 58, 138],
  },
  {
    n: 11,
    title: 'ZELENSKY: US TOO SOFT',
    caption:
      'Zelensky tells the BBC the US is not pushing Russia hard enough on the war.',
    src: 'BBC',
    badge: 'REPORTED',
    bg: [243, 232, 232],
    accent: [127, 29, 29],
  },
  {
    n: 12,
    title: 'ASIAN SHARES REBOUND',
    caption:
      'Nikkei closes 57,499, up 0.9%; Kospi 4,711, up 0.3% after a 6.2% rout.',
    src: 'AP',
    badge: 'OFFICIAL',
    bg: [232, 245, 233],
    accent: [21, 128, 61],
  },
  {
    n: 13,
    title: 'BOGOR MINE: 13 DEAD',
    caption:
      'Illegal gold mine flood in Bogor: 13 confirmed dead, 13 missing; 26 had entered.',
    src: 'BBC',
    badge: 'OFFICIAL',
    bg: [240, 238, 232],
    accent: [90, 90, 105],
  },
];

const ALSO_ON: string[] = [
  'MYANMAR REJECTS ICJ RULING - S ASIA',
  'GAZA STRIKES KILL 8 DESPITE CEASEFIRE - MID EAST',
  'IRAQ CLOSES 2 KURDISH CROSSINGS - MID EAST',
  'KENYA CULT LEADER GUILTY OF TERROR - AFRICA',
  'HOUTHI HIT SAUDI REFINERY - MID EAST',
  'RUSSIA HITS KYIV, 113 DRONES - EUROPE',
  'UKRAINE HITS AIR BASE, 5 JETS DAMAGED - EUROPE',
  'KIM WANTS MORE TACTICAL NUKES - E ASIA',
  'BANGLADESH GARMENT PROTESTS, TEAR GAS - S ASIA',
  'UK SIGNS 8BN SUBMARINE DEAL - UK+IRL',
  'UK MIGRATION LOWEST SINCE 1997 - UK+IRL',
  '100 LABOUR MPS OPPOSE ROSEBANK - UK+IRL',
  'HUNTINGDON ATTACKER GUILTY, 14 COUNTS - UK+IRL',
  'SPACEX GETS OK FOR 1M SATELLITES - N AMERICA',
  'DE COS PICKED AS NEW ECB CHIEF - EUROPE',
  'AI SELLOFF: NASDAQ NEARS BEAR MARKET - GLOBAL',
  '6 DAYS OVER +2C, A FIRST ON RECORD - GLOBAL',
  'ISRAEL JUDGES: DROP NETANYAHU CASE - MID EAST',
  'PAKISTANI ASTRONAUT REACHES TIANGONG - ASIA-PAC',
  'HONG KONG FIRE: 1 YEAR ON, 168 DEAD - E ASIA',
  'NZ COALITION SHORT BY 1 SEAT - OCEANIA',
  'NFL: BEARS 39-35 LIONS, EAGLES 39-38 - N AMERICA',
  'ABREGO GARCIA LANDS IN SPAIN - N AMERICA',
  'US Q3 GDP REVISED UP TO 4.3% - N AMERICA',
  'NORSE ATLANTIC WARNS OF BANKRUPTCY - EUROPE',
  'NY COURT UPHOLDS MAMDANI RENT FREEZE - N AMERICA',
  'DEPARDIEU TO STAND TRIAL FOR RAPE - EUROPE',
];

const DATE_CHECK: string[] = [
  'ROSSTAT LEAK: 490,000 RUSSIAN DEAD - REPORTED 23 NOV',
  'RAMAPHOSA PHALA PHALA RULING - JUDGMENT 25 NOV',
  'ANDY TAYLOR DIED - DIED MON 23 NOV, ANNOUNCED 25 NOV',
  'CAIRO TANKER CRASH - CRASH 25 NOV; 26 NOV NEWS: DRIVER ARRESTED',
  "MACY'S PARADE - DID NOT MARCH 26 NOV; POSTPONED TO SATURDAY",
];

// Map pins 1-13: [lon, lat] -> placed on the map band below.
const PINS: [number, number][] = [
  [-95, 39],
  [127, 37.5],
  [-77, 39],
  [56, 26],
  [48, 29],
  [25, -2],
  [-15.5, 12],
  [100.5, 13.75],
  [1.4, 39],
  [0, 51.5],
  [30.5, 50.4],
  [139.7, 35.7],
  [106.8, -6.6],
];

// ---------------------------------------------------------------- Sections
function drawLead(cv: Canvas, p: Lead, x: number, y: number): void {
  const w = 324;
  const h = 172;
  cv.fillRect(x, y, w, h, p.bg);
  cv.rect(x, y, w, h, p.accent, 2);
  cv.fillRect(x, y, w, 4, p.accent);
  drawText(cv, x + 12, y + 10, p.kicker, 1, p.accent);
  const lines = wrapText(p.title, w - 24, 3);
  let ty = y + 26;
  for (const ln of lines.slice(0, 2)) {
    drawText(cv, x + 12, ty, ln, 3, INK);
    ty += 21;
  }
  drawText(cv, x + 12, y + 82, p.big, 5, p.accent);
  drawArt(cv, p.art, x + w - 84, y + 74, p.accent);
  const cap = wrapText(p.caption, w - 24, 1);
  let cy = y + 128;
  for (const ln of cap.slice(0, 3)) {
    drawText(cv, x + 12, cy, ln, 1, INK);
    cy += 9;
  }
}

function drawMedium(cv: Canvas, p: Medium, x: number, y: number): void {
  const w = 193;
  const h = 104;
  cv.fillRect(x, y, w, h, p.bg);
  cv.rect(x, y, w, h, p.accent, 2);
  cv.fillRect(x, y, w, 3, p.accent);
  // number chip
  cv.fillRect(x + 8, y + 9, 20, 20, p.accent);
  drawText(cv, x + 8 + (20 - textWidth(String(p.n), 1)) / 2, y + 15, String(p.n), 1, WHITE);
  const lines = wrapText(p.title, w - 44, 2);
  let ty = y + 9;
  for (const ln of lines.slice(0, 2)) {
    drawText(cv, x + 34, ty, ln, 2, INK);
    ty += 15;
  }
  const cap = wrapText(p.caption, w - 16, 1);
  let cy = y + 48;
  for (const ln of cap.slice(0, 3)) {
    drawText(cv, x + 8, cy, ln, 1, INK);
    cy += 9;
  }
  drawText(cv, x + 8, y + 86, p.src + ' - ' + p.badge, 1, p.accent);
}

// ---------------------------------------------------------------- Main
function main(): void {
  const cv = new Canvas(W, H, PAPER);

  // Masthead 0-56
  cv.fillRect(0, 0, W, 56, NAVY);
  cv.fillRect(0, 56, W, 4, GOLD);
  drawText(cv, 24, 8, 'THURSDAY', 2, GOLD);
  drawText(cv, 24, 24, '26 NOVEMBER 2026', 4, WHITE);
  drawText(cv, 640, 12, 'THE WORLD IN ONE DAY', 2, WHITE);
  drawText(cv, 640, 34, '40 DATED STORIES - 10 REGIONS', 1, GOLD);

  // Stats strip 60-88
  const stats: [string, string][] = [
    ['3.25%', 'BOK RATE'],
    ['57,499', 'NIKKEI'],
    ['4,711', 'KOSPI'],
    ['1M', 'POWER OUT'],
    ['12,021', 'EBOLA CASES'],
    ['2,000+', 'FLIGHTS CUT'],
  ];
  for (let i = 0; i < 6; i++) {
    const cx = 12 + i * 170;
    if (i > 0) cv.fillRect(cx - 6, 62, 1, 22, [200, 195, 180]);
    drawText(cv, cx, 62, stats[i][0], 2, NAVY);
    drawText(cv, cx, 78, stats[i][1], 1, GREY);
  }

  // UTC timeline 88-112
  drawText(
    cv,
    12,
    97,
    '07:31 BOGOR 13 DEAD - 14:35 INMATE ESCAPES - 15:23 UK-EU TREATY - 16:21 BANGKOK BLAST - 17:13 GUINEA-BISSAU VOTE DELAY - 21:17 KUWAIT STRIKE - 22:01 IBIZA TANKER',
    1,
    INK,
  );

  // Region tabs 112-132
  const tabs =
    'N AMERICA 7 - E ASIA 4 - MID EAST 6 - AFRICA 3 - ASIA-PAC 3 - EUROPE 7 - UK+IRL 5 - S ASIA 2 - OCEANIA 1 - GLOBAL 2';
  drawText(cv, (W - textWidth(tabs, 1)) / 2, 118, tabs, 1, NAVY);

  // Three illustrated leads 132-304
  const leadX = [12, 350, 688];
  for (let i = 0; i < 3; i++) drawLead(cv, LEADS[i], leadX[i], 132);

  // Section header 304-322
  drawText(cv, 12, 308, 'THE DAY IN TEN - STORIES 4-13', 2, NAVY);

  // Ten medium panels 322-542 (5 cols x 2 rows)
  const medX = [12, 213, 414, 615, 816];
  const medY = [322, 434];
  for (let i = 0; i < 10; i++) {
    drawMedium(cv, MEDIUM[i], medX[i % 5], medY[Math.floor(i / 5)]);
  }

  // World map 542-690
  drawText(cv, 12, 548, 'WHERE IT HAPPENED - STORIES 1-13', 2, NAVY);
  const mapX0 = 12;
  const mapY0 = 568;
  const mapW = 1000;
  const mapH = 118;
  cv.fillRect(mapX0, mapY0, mapW, mapH, LIGHT);
  cv.rect(mapX0, mapY0, mapW, mapH, GREY, 1);
  // stylised continents
  const land = (cx: number, cy: number, rx: number, ry: number): void =>
    cv.ellipse(cx, cy, rx, ry, LAND);
  land(250, 598, 95, 38);
  land(210, 626, 42, 20);
  land(350, 570, 24, 9);
  land(305, 655, 30, 44);
  land(520, 580, 32, 19);
  land(580, 585, 30, 16); // Eastern Europe (pin 11 Kyiv)
  land(490, 610, 30, 25); // West Africa bulge (pin 7 Guinea-Bissau)
  land(565, 625, 42, 46);
  land(650, 610, 25, 18); // Arabia (pins 4-5)
  land(770, 585, 125, 44);
  land(880, 605, 55, 30);
  land(800, 636, 28, 11);
  land(885, 652, 42, 19);
  // pins
  for (let i = 0; i < PINS.length; i++) {
    const [lon, lat] = PINS[i];
    let px = Math.round(mapX0 + ((lon + 180) / 360) * mapW);
    let py = Math.round(mapY0 + ((75 - lat) / 130) * mapH);
    // pin 10 (London) crowds pin 9 (Ibiza): nudge it with a connector
    if (i === 9) {
      cv.line(px, py, px - 12, py - 8, RED, 1);
      px -= 12;
      py -= 8;
    }
    cv.circle(px, py, 8, RED);
    const label = String(i + 1);
    drawText(cv, px - textWidth(label, 1) / 2, py - 3, label, 1, WHITE);
  }

  // ALSO ON 14-40 header 690-710
  drawText(cv, 12, 694, 'ALSO ON 14-40', 2, NAVY);

  // ALSO ON items 712-874: 3 cols x 9 rows
  const alsoX = [12, 348, 684];
  for (let i = 0; i < 27; i++) {
    const col = Math.floor(i / 9);
    const row = i % 9;
    drawText(cv, alsoX[col], 714 + row * 18, `${14 + i}. ${ALSO_ON[i]}`, 1, INK);
  }

  // DATE CHECK box 878-956
  cv.fillRect(12, 878, 1000, 78, [253, 238, 232]);
  cv.rect(12, 878, 1000, 78, RED, 2);
  drawText(cv, 24, 886, 'DATE CHECK - NOT 26 NOV, LEFT OUT ON PURPOSE', 2, RED);
  for (let i = 0; i < DATE_CHECK.length; i++) {
    drawText(cv, 24, 906 + i * 10, '- ' + DATE_CHECK[i], 1, INK);
  }

  // HOW SURE legend 960-984
  drawText(
    cv,
    12,
    964,
    'HOW SURE: OFFICIAL = ON THE RECORD - REPORTED = WIRES AND OUTLETS - CLAIM = ONE PARTY, UNVERIFIED',
    1,
    GREY,
  );

  // Sources footer 984-1006
  const foot =
    'SOURCES: REUTERS, BBC, BOK, AP - THURSDAY 26 NOVEMBER 2026 - ALL 40 STORIES HAPPENED OR WERE FIRST REPORTED 26 NOV';
  drawText(cv, (W - textWidth(foot, 1)) / 2, 990, foot, 1, GREY);

  // Output: single write, sandbox-safe (see stage-1 fix).
  // Grader sandbox: /bot is read-only, only /output is writable.
  const argOut = process.argv[2];
  const outPath =
    argOut ??
    (process.env.MAKEFUN_OUTPUT_DIR
      ? join(process.env.MAKEFUN_OUTPUT_DIR, 'entry.png')
      : existsSync('/output')
        ? '/output/entry.png'
        : join('out', 'entry.png'));
  mkdirSync(dirname(outPath), { recursive: true });
  const png = encodePNG(W, H, cv.buf);
  writeFileSync(outPath, png);
  const hash = createHash('sha256').update(png).digest('hex');
  console.log(`wrote ${outPath} ${png.length} bytes sha256=${hash} ${W}x${H}`);
}

main();
