// news-image-20261126 — "The world in one day: Thursday 26 November 2026".
// Draws a 1024x1024 PNG with a pure-TypeScript PNG encoder (Node stdlib only,
// no network, fully deterministic). Anchor: makefun anchor
// 5ea16525465e0e3c01c704e5a0a4ec8d232e3190 round 34284352
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

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
  let cx = x;
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

// ---------------------------------------------------------------- Layout
const W = 1024;
const H = 1024;
const MX = 12; // side margin
const COLW = 324;
const COLX = [12, 350, 688];
const ROWY = [396, 694];
const ROWH = 290;

interface Panel {
  kicker: string;
  title: string;
  big: string;
  caption: string;
  bg: RGB;
  accent: RGB;
  art: string;
}

const PANELS: Panel[] = [
  {
    kicker: 'SOUTH KOREA  -  ECONOMY',
    title: 'BANK OF KOREA HIKES RATE',
    big: '3.25%',
    caption:
      'Seoul raises its base rate by 25 basis points, resuming tightening as AI exports boom.',
    bg: [230, 242, 240],
    accent: [15, 118, 110],
    art: 'bank',
  },
  {
    kicker: 'ASIA  -  MARKETS',
    title: 'ASIAN SHARES REBOUND',
    big: '+2%',
    caption:
      'Kospi up 2%, Nikkei up 1.8% in early Thursday trade after Wednesday losses.',
    bg: [232, 245, 233],
    accent: [21, 128, 61],
    art: 'chart',
  },
  {
    kicker: 'EGYPT  -  DISASTER',
    title: 'CAIRO TANKER FIRE KILLS 31',
    big: '31',
    caption:
      'A fuel tanker overturns on the Cairo Ring Road and bursts into flames; 21 more are injured.',
    bg: [253, 238, 222],
    accent: [194, 65, 12],
    art: 'flame',
  },
  {
    kicker: 'UKRAINE WAR  -  RUSSIA',
    title: 'LEAK PUTS RUSSIAN DEAD AT 490,000',
    big: '490,000',
    caption:
      'Leaked Rosstat data put Russian dead at 490,334 since February 2022, the BBC reports.',
    bg: [243, 232, 232],
    accent: [127, 29, 29],
    art: 'bars',
  },
  {
    kicker: 'UNITED STATES  -  TRADE',
    title: 'US PROPOSES TARIFFS ON 14 PARTNERS',
    big: '14',
    caption:
      'New duties target overcapacity; Nasdaq nears a bear market.',
    bg: [232, 237, 247],
    accent: [30, 58, 138],
    art: 'ship',
  },
  {
    kicker: 'SOUTH AFRICA  -  POLITICS',
    title: 'RAMAPHOSA WINS COURT BATTLE',
    big: '',
    caption:
      'A court scraps the Phala Phala report, ending impeachment over the 2020 farm cash theft.',
    bg: [233, 245, 236],
    accent: [22, 101, 52],
    art: 'gavel',
  },
];

// ---------------------------------------------------------------- Art (simple vector pictograms)
function drawArt(cv: Canvas, kind: string, x: number, y: number, c: RGB): void {
  if (kind === 'bank') {
    cv.triangle(x + 5, y + 18, x + 55, y + 18, x + 30, y + 2, c);
    cv.fillRect(x, y + 20, 60, 5, c);
    for (let i = 0; i < 4; i++) cv.fillRect(x + 4 + i * 15, y + 28, 7, 30, c);
    cv.fillRect(x, y + 60, 60, 5, c);
  } else if (kind === 'chart') {
    cv.line(x + 2, y + 52, x + 18, y + 40, c, 4);
    cv.line(x + 18, y + 40, x + 34, y + 46, c, 4);
    cv.line(x + 34, y + 46, x + 50, y + 22, c, 4);
    cv.line(x + 50, y + 22, x + 62, y + 8, c, 4);
    cv.triangle(x + 62, y + 8, x + 52, y + 8, x + 62, y + 18, c);
    cv.circle(x + 18, y + 40, 4, c);
    cv.circle(x + 34, y + 46, 4, c);
  } else if (kind === 'flame') {
    cv.ellipse(x + 30, y + 42, 20, 24, c);
    cv.triangle(x + 30, y + 2, x + 12, y + 40, x + 48, y + 40, c);
    cv.ellipse(x + 30, y + 48, 10, 12, [253, 238, 222]);
    cv.fillRect(x + 4, y + 62, 52, 4, c);
  } else if (kind === 'bars') {
    const hs = [18, 30, 44, 58];
    for (let i = 0; i < 4; i++) {
      cv.fillRect(x + 4 + i * 15, y + 64 - hs[i], 11, hs[i], c);
    }
    cv.fillRect(x, y + 64, 60, 3, c);
  } else if (kind === 'ship') {
    cv.fillRect(x + 6, y + 18, 12, 12, c);
    cv.fillRect(x + 20, y + 18, 12, 12, [90, 90, 105]);
    cv.fillRect(x + 34, y + 18, 12, 12, c);
    cv.fillRect(x + 48, y + 10, 6, 20, c);
    cv.triangle(x, y + 34, x + 62, y + 34, x + 52, y + 56, c);
    cv.triangle(x, y + 34, x + 10, y + 56, x + 52, y + 56, c);
    cv.fillRect(x, y + 62, 62, 3, [90, 90, 105]);
  } else if (kind === 'gavel') {
    cv.line(x + 10, y + 14, x + 52, y + 40, c, 7);
    cv.line(x + 8, y + 6, x + 26, y + 24, c, 9);
    cv.fillRect(x + 6, y + 58, 50, 5, c);
    cv.fillRect(x + 20, y + 52, 22, 6, c);
  }
}

function drawBalloon(cv: Canvas, cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  cv.ellipse(cx, cy, rx, ry, c);
  cv.triangle(cx - 6, cy + ry - 4, cx + 6, cy + ry - 4, cx, cy + ry + 10, c);
  cv.line(cx, cy + ry + 10, cx - 8, cy + ry + 52, GREY, 2);
}

// ---------------------------------------------------------------- Panels
function drawPanel(cv: Canvas, p: Panel, x: number, y: number): void {
  cv.fillRect(x, y, COLW, ROWH, p.bg);
  cv.rect(x, y, COLW, ROWH, p.accent, 2);
  cv.fillRect(x, y, COLW, 4, p.accent);
  drawText(cv, x + 14, y + 16, p.kicker, 2, p.accent);
  let tScale = 3;
  let titleLines = wrapText(p.title, COLW - 28, tScale);
  if (titleLines.length > 2) {
    tScale = 2;
    titleLines = wrapText(p.title, COLW - 28, tScale);
  }
  let ty = y + 44;
  for (const ln of titleLines.slice(0, 2)) {
    drawText(cv, x + 14, ty, ln, tScale, INK);
    ty += tScale === 3 ? 24 : 17;
  }
  // Big stat + art share the middle band.
  let cy = y + 118;
  if (p.big) {
    drawText(cv, x + 14, cy, p.big, 5, p.accent);
    cy += 46;
  }
  drawArt(cv, p.art, x + COLW - 88, y + 108, p.accent);
  const capLines = wrapText(p.caption, COLW - 28, 2);
  let ly = y + 196;
  for (const ln of capLines.slice(0, 4)) {
    drawText(cv, x + 14, ly, ln, 2, INK);
    ly += 17;
  }
}

// ---------------------------------------------------------------- Main
function main(): void {
  const cv = new Canvas(W, H, PAPER);

  // Header
  cv.fillRect(0, 0, W, 92, NAVY);
  cv.fillRect(0, 92, W, 4, GOLD);
  drawText(cv, 24, 14, 'THURSDAY', 3, GOLD);
  drawText(cv, 24, 38, '26 NOVEMBER 2026', 6, WHITE);
  drawText(cv, 700, 22, 'THE WORLD', 3, WHITE);
  drawText(cv, 700, 48, 'IN ONE DAY', 3, GOLD);

  // Lead panel: Thanksgiving — the 100th Macy's parade.
  const LX = MX;
  const LY = 104;
  const LW = W - 2 * MX;
  const LH = 284;
  cv.fillRect(LX, LY, LW, LH, [253, 246, 227]);
  cv.rect(LX, LY, LW, LH, [193, 18, 31], 3);
  cv.fillRect(LX, LY, LW, 4, [193, 18, 31]);
  drawText(cv, LX + 20, LY + 18, 'UNITED STATES  -  THANKSGIVING', 2, [193, 18, 31]);
  drawText(cv, LX + 20, LY + 48, "100TH MACY'S PARADE", 5, INK);
  drawText(cv, LX + 20, LY + 96, 'NEW YORK  -  A CENTURY OF BALLOONS', 2, GREY);
  const leadCap = wrapText(
    'Thanksgiving Day in New York: the 100th Macy parade steps off with a record 100 balloons down Sixth Avenue. US markets closed for the holiday.',
    560,
    2,
  );
  let lcy = LY + 132;
  for (const ln of leadCap) {
    drawText(cv, LX + 20, lcy, ln, 2, INK);
    lcy += 18;
  }
  drawText(cv, LX + 20, LY + 232, 'PARADE 8:30 AM  -  STORES SHUT  -  WALL ST SHUT', 2, [193, 18, 31]);
  // Balloons on the right.
  drawBalloon(cv, 830, 180, 42, 54, [193, 18, 31]);
  drawBalloon(cv, 920, 205, 36, 46, [30, 58, 138]);
  drawBalloon(cv, 748, 215, 30, 40, [212, 175, 55]);
  cv.circle(800, 300, 4, [193, 18, 31]);
  cv.circle(880, 320, 4, [30, 58, 138]);
  cv.circle(955, 300, 4, [212, 175, 55]);
  cv.circle(770, 330, 4, [21, 128, 61]);

  // Six story panels.
  for (let i = 0; i < PANELS.length; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    drawPanel(cv, PANELS[i], COLX[col], ROWY[row]);
  }

  // Footer.
  drawText(
    cv,
    (W - textWidth('SOURCES: REUTERS, AP, BBC, CNN  -  26 NOVEMBER 2026', 1)) / 2,
    1002,
    'SOURCES: REUTERS, AP, BBC, CNN  -  26 NOVEMBER 2026',
    1,
    GREY,
  );

  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? 'out';
  mkdirSync(outDir, { recursive: true });
  const png = encodePNG(W, H, cv.buf);
  writeFileSync(join(outDir, 'entry.png'), png);
  writeFileSync('entry.png', png);
  console.log(`wrote entry.png ${png.length} bytes ${W}x${H}`);
}

main();
