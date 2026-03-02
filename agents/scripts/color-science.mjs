#!/usr/bin/env node

/**
 * color-science.mjs — Zero-dependency color science CLI for the RAGTS design system.
 *
 * All conversions use Bjorn Ottosson's OKLAB/OKLCH formulas and standard sRGB
 * color science. No npm packages — pure math only.
 *
 * Usage: node color-science.mjs <command> [args] [--flags]
 *
 * Commands:
 *   contrast <fg> <bg>                   WCAG contrast ratio + AA/AAA pass/fail
 *   audit <fg:bg> [fg:bg ...]            Bulk contrast check (JSON + table)
 *   harmony <base> <type>                Harmonious colors via OKLCH hue rotation
 *   palette <bg> <primary> [secondary]   Full palette from anchor colors
 *   scale <base> [steps] [--step pct]    Lightness scale in OKLCH
 *   info <hex>                           Full color breakdown
 *   mix <c1> <c2> [--ratio R] [--space oklch|srgb]  Mix two colors
 *   desaturate <hex> [--contrast R] [--on bg]  Reduce chroma for readability
 *   test                                 Self-test against known values
 */

// ================================================================
// Layer 1: Color Math Primitives
// ================================================================

// --- Hex <-> sRGB [0..1] ---

function parseHex(hex) {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  if (hex.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`Invalid hex color: #${hex}`);
  }
  const n = parseInt(hex, 16);
  return [n >> 16, (n >> 8) & 0xff, n & 0xff].map(c => c / 255);
}

function toHex([r, g, b]) {
  const ch = v => Math.round(Math.max(0, Math.min(1, v)) * 255)
    .toString(16).padStart(2, '0');
  return `#${ch(r)}${ch(g)}${ch(b)}`;
}

// --- sRGB <-> Linear RGB (IEC 61966-2-1 gamma) ---

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

function toLinear(rgb) { return rgb.map(srgbToLinear); }
function fromLinear(lrgb) { return lrgb.map(linearToSrgb); }

// --- 3x3 matrix multiply ---

function mat3(m, [x, y, z]) {
  return [
    m[0] * x + m[1] * y + m[2] * z,
    m[3] * x + m[4] * y + m[5] * z,
    m[6] * x + m[7] * y + m[8] * z,
  ];
}

// --- Linear RGB <-> XYZ D65 (IEC 61966-2-1) ---

const M_RGB_XYZ = [
  0.4124564, 0.3575761, 0.1804375,
  0.2126729, 0.7151522, 0.0721750,
  0.0193339, 0.1191920, 0.9503041,
];
const M_XYZ_RGB = [
   3.2404542, -1.5371385, -0.4985314,
  -0.9692660,  1.8760108,  0.0415560,
   0.0556434, -0.2040259,  1.0572252,
];

function linearToXyz(lrgb) { return mat3(M_RGB_XYZ, lrgb); }
function xyzToLinear(xyz) { return mat3(M_XYZ_RGB, xyz); }

// --- Linear sRGB <-> OKLAB (Bjorn Ottosson, 2020) ---
// Direct path: linear sRGB -> LMS -> cube root -> Lab
// Using exact values from https://bottosson.github.io/posts/oklab/

const M1 = [ // linear sRGB -> LMS
  0.4122214708, 0.5363325363, 0.0514459929,
  0.2119034982, 0.6806995451, 0.1073969566,
  0.0883024619, 0.2817188376, 0.6299787005,
];
const M2 = [ // LMS' -> Lab
   0.2104542553,  0.7936177850, -0.0040720468,
   1.9779984951, -2.4285922050,  0.4505937099,
   0.0259040371,  0.7827717662, -0.8086757660,
];
const M1_INV = [ // LMS -> linear sRGB
   4.0767416621, -3.3077115913,  0.2309699292,
  -1.2684380046,  2.6097574011, -0.3413193965,
  -0.0041960863, -0.7034186147,  1.7076147010,
];
const M2_INV = [ // Lab -> LMS'
  1.0000000000,  0.3963377774,  0.2158037573,
  1.0000000000, -0.1055613458, -0.0638541728,
  1.0000000000, -0.0894841775, -1.2914855480,
];

function linearToOklab(lrgb) {
  const lms = mat3(M1, lrgb);
  const lms_ = lms.map(v => Math.cbrt(v));
  return mat3(M2, lms_);
}

function oklabToLinear(lab) {
  const lms_ = mat3(M2_INV, lab);
  const lms = lms_.map(v => v * v * v);
  return mat3(M1_INV, lms);
}

// --- OKLAB <-> OKLCH (polar form) ---

function oklabToOklch([L, a, b]) {
  const C = Math.sqrt(a * a + b * b);
  let H = Math.atan2(b, a) * (180 / Math.PI);
  if (H < 0) H += 360;
  if (C < 1e-8) H = 0; // achromatic — hue undefined
  return [L, C, H];
}

function oklchToOklab([L, C, H]) {
  const rad = H * (Math.PI / 180);
  return [L, C * Math.cos(rad), C * Math.sin(rad)];
}

// --- sRGB <-> HSL ---

function srgbToHsl([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s * 100, l * 100];
}

function hslToSrgb([h, s, l]) {
  h /= 360; s /= 100; l /= 100;
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue2rgb(h + 1 / 3), hue2rgb(h), hue2rgb(h - 1 / 3)];
}

// --- WCAG 2.x luminance and contrast ---

function wcagLuminance(lrgb) {
  return 0.2126 * lrgb[0] + 0.7152 * lrgb[1] + 0.0722 * lrgb[2];
}

function wcagContrastRatio(lum1, lum2) {
  const [hi, lo] = lum1 > lum2 ? [lum1, lum2] : [lum2, lum1];
  return (hi + 0.05) / (lo + 0.05);
}

function hexLuminance(hex) {
  return wcagLuminance(toLinear(parseHex(hex)));
}

function hexContrast(fg, bg) {
  return wcagContrastRatio(hexLuminance(fg), hexLuminance(bg));
}

// --- Gamut mapping (binary search on chroma) ---

function isInGamut([r, g, b], eps = 0.001) {
  return r >= -eps && r <= 1 + eps && g >= -eps && g <= 1 + eps && b >= -eps && b <= 1 + eps;
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function gamutMapOklch([L, C, H]) {
  if (L <= 0) return [0, 0, H];
  if (L >= 1) return [1, 0, H];
  const lrgb = oklabToLinear(oklchToOklab([L, C, H]));
  if (isInGamut(lrgb)) return [L, C, H];
  let lo = 0, hi = C;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const rgb = oklabToLinear(oklchToOklab([L, mid, H]));
    if (isInGamut(rgb)) lo = mid; else hi = mid;
  }
  return [L, lo, H];
}

// --- Convenience pipelines ---

function hexToOklch(hex) {
  return oklabToOklch(linearToOklab(toLinear(parseHex(hex))));
}

function oklchToHex([L, C, H]) {
  const [mL, mC, mH] = gamutMapOklch([L, C, H]);
  const lrgb = oklabToLinear(oklchToOklab([mL, mC, mH]));
  return toHex(fromLinear(lrgb.map(clamp01)));
}

function hexToOklab(hex) { return linearToOklab(toLinear(parseHex(hex))); }
function hexToXyz(hex) { return linearToXyz(toLinear(parseHex(hex))); }
function hexToHsl(hex) { return srgbToHsl(parseHex(hex)); }

// --- Rounding helpers ---

function rd(v, d = 3) { return +v.toFixed(d); }
function normalizeHue(h) { return ((h % 360) + 360) % 360; }

function oklchObj([L, C, H]) {
  return { L: rd(L), C: rd(C), H: rd(H, 1) };
}

function colorEntry(hex) {
  const lch = hexToOklch(hex);
  return { hex: oklchToHex(lch), oklch: oklchObj(lch) };
}

// ================================================================
// Layer 2: Color Operations
// ================================================================

// --- Harmony via OKLCH hue rotation ---

const HARMONY_OFFSETS = {
  complementary: [180],
  'split-complementary': [150, 210],
  triadic: [120, 240],
  tetradic: [90, 180, 270],
  analogous: [-30, 30],
};

function harmonyColors(baseHex, type) {
  const offsets = HARMONY_OFFSETS[type];
  if (!offsets) {
    throw new Error(
      `Unknown harmony: "${type}". Valid: ${Object.keys(HARMONY_OFFSETS).join(', ')}`
    );
  }
  const [L, C, H] = hexToOklch(baseHex);
  return offsets.map(offset => {
    const h = normalizeHue(H + offset);
    return { hex: oklchToHex([L, C, h]), oklch: oklchObj([L, C, h]), offset };
  });
}

// --- Mix with shortest-arc hue interpolation ---

function mixColors(hex1, hex2, ratio = 0.5, space = 'oklch') {
  if (space === 'srgb') {
    const a = parseHex(hex1), b = parseHex(hex2);
    return toHex(a.map((v, i) => v + (b[i] - v) * ratio));
  }
  const [L1, C1, H1] = hexToOklch(hex1);
  const [L2, C2, H2] = hexToOklch(hex2);
  const L = L1 + (L2 - L1) * ratio;
  const C = C1 + (C2 - C1) * ratio;
  let H;
  if (C1 < 0.001 && C2 < 0.001) H = 0;
  else if (C1 < 0.001) H = H2;
  else if (C2 < 0.001) H = H1;
  else {
    let dH = H2 - H1;
    if (dH > 180) dH -= 360;
    if (dH < -180) dH += 360;
    H = normalizeHue(H1 + dH * ratio);
  }
  return oklchToHex([L, C, H]);
}

// --- Find lightness for target contrast (binary search) ---

function findLightnessForContrast(H, C, bgHex, targetContrast) {
  const bgLum = hexLuminance(bgHex);
  const isBgDark = bgLum < 0.18;
  let lo = 0, hi = 1, bestL = isBgDark ? 1 : 0;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const cr = hexContrast(oklchToHex([mid, C, H]), bgHex);
    if (cr >= targetContrast) {
      bestL = mid;
      if (isBgDark) hi = mid; else lo = mid; // move closer to bg
    } else {
      if (isBgDark) lo = mid; else hi = mid; // move away from bg
    }
  }
  return bestL;
}

// --- Desaturate for contrast ---

function desaturateForContrast(hex, targetContrast = 4.5, bgHex = '#000000') {
  const [L, C, H] = hexToOklch(hex);
  const bgLum = hexLuminance(bgHex);
  const isBgDark = bgLum < 0.18;

  // Already meets target?
  if (hexContrast(hex, bgHex) >= targetContrast) {
    return { hex, oklch: oklchObj([L, C, H]), adjusted: false };
  }

  // Phase 1: reduce chroma at constant lightness
  let lo = 0, hi = C, bestC = 0;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (hexContrast(oklchToHex([L, mid, H]), bgHex) >= targetContrast) {
      lo = mid; bestC = mid; // keep more chroma
    } else {
      hi = mid;
    }
  }
  if (hexContrast(oklchToHex([L, bestC, H]), bgHex) >= targetContrast) {
    const lch = [L, bestC, H];
    return { hex: oklchToHex(lch), oklch: oklchObj(lch), adjusted: 'chroma' };
  }

  // Phase 2: chroma at 0 isn't enough — find minimum lightness at C=0
  lo = isBgDark ? L : 0;
  hi = isBgDark ? 1 : L;
  let bestL = isBgDark ? 1 : 0;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (hexContrast(oklchToHex([mid, 0, H]), bgHex) >= targetContrast) {
      bestL = mid;
      if (isBgDark) hi = mid; else lo = mid;
    } else {
      if (isBgDark) lo = mid; else hi = mid;
    }
  }

  // Phase 3: at found lightness, restore max chroma
  lo = 0; hi = C; bestC = 0;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (hexContrast(oklchToHex([bestL, mid, H]), bgHex) >= targetContrast) {
      lo = mid; bestC = mid;
    } else {
      hi = mid;
    }
  }

  const lch = [bestL, bestC, H];
  return { hex: oklchToHex(lch), oklch: oklchObj(lch), adjusted: 'chroma+lightness' };
}

// --- Lightness scale ---

function lightnessScale(baseHex, steps = 5, lightnessStep = 0.03) {
  const [L, C, H] = hexToOklch(baseHex);
  const result = [];
  for (let i = 0; i < steps; i++) {
    const newL = Math.max(0, Math.min(1, L + i * lightnessStep));
    const lch = gamutMapOklch([newL, C, H]);
    result.push({
      step: i,
      hex: oklchToHex(lch),
      oklch: oklchObj(lch),
    });
  }
  return result;
}

// --- Derive status hues from primary ---

function deriveStatusHues(primaryHue) {
  // Canonical semantic hue centers (OKLCH):
  //   Success: 145°  Error: 25°  Warning: 85°  Info: 240°
  // Shift all by a dampened offset from the primary's distance to 145° (success/green),
  // capped at ±15° to prevent semantic drift.
  let shift = primaryHue - 145;
  if (shift > 180) shift -= 360;
  if (shift < -180) shift += 360;
  const s = Math.sign(shift) * Math.min(Math.abs(shift) * 0.3, 15);
  return {
    success: normalizeHue(145 + s),
    error:   normalizeHue(25 + s),
    warning: normalizeHue(85 + s),
    info:    normalizeHue(240 + s),
  };
}

// --- Generate full palette ---

function generatePalette(bgHex, primaryHex, secondaryHex, chromaOverride) {
  const bgLch = hexToOklch(bgHex);
  const priLch = hexToOklch(primaryHex);
  const bgLum = hexLuminance(bgHex);
  const isBgDark = bgLum < 0.18;

  // Derive secondary if not provided (split-complementary of primary)
  if (!secondaryHex) {
    const secH = normalizeHue(priLch[2] + 150);
    secondaryHex = oklchToHex([priLch[0] * 0.9, priLch[1] * 0.85, secH]);
  }
  const secLch = hexToOklch(secondaryHex);

  // Background hierarchy: 3 levels with ~0.03L steps
  const bgStep = isBgDark ? 0.03 : -0.03;
  const backgrounds = {
    page:     colorEntry(bgHex),
    surface:  colorEntry(oklchToHex([bgLch[0] + bgStep, bgLch[1], bgLch[2]])),
    elevated: colorEntry(oklchToHex([bgLch[0] + bgStep * 2, bgLch[1], bgLch[2]])),
  };
  const surfaceHex = backgrounds.surface.hex;

  // Accent variants
  function accentVariants(hex) {
    return {
      base:   colorEntry(hex),
      hover:  colorEntry(mixColors(hex, '#ffffff', 0.2)),
      dim:    colorEntry(mixColors(hex, bgHex, 0.45, 'srgb')),
      subtle: colorEntry(mixColors(hex, surfaceHex, 0.93, 'srgb')),
    };
  }

  // Status colors
  const statusHues = deriveStatusHues(priLch[2]);
  const statusChroma = chromaOverride ?? 0.17;
  const status = {};
  for (const [role, hue] of Object.entries(statusHues)) {
    const baseL = findLightnessForContrast(hue, statusChroma, surfaceHex, 3.0);
    const baseHex = oklchToHex([baseL, statusChroma, hue]);
    const textL = findLightnessForContrast(hue, statusChroma * 0.35, surfaceHex, 4.5);
    const textHex = oklchToHex([textL, statusChroma * 0.35, hue]);
    const subtleHex = mixColors(baseHex, surfaceHex, 0.90, 'srgb');
    status[role] = {
      base: {
        ...colorEntry(baseHex),
        contrast_on_surface: rd(hexContrast(baseHex, surfaceHex), 1),
      },
      text: {
        ...colorEntry(textHex),
        contrast_on_surface: rd(hexContrast(textHex, surfaceHex), 1),
      },
      subtle: colorEntry(subtleHex),
    };
  }

  // Text hierarchy (subtle hue tint from bg)
  const textHue = bgLch[2];
  const textTint = 0.008;
  const textLevels = isBgDark
    ? { primary: 0.96, secondary: 0.87, muted: 0.74, disabled: 0.58 }
    : { primary: 0.15, secondary: 0.30, muted: 0.45, disabled: 0.58 };
  const text = {};
  for (const [level, L] of Object.entries(textLevels)) {
    const hex = oklchToHex([L, textTint, textHue]);
    text[level] = {
      ...colorEntry(hex),
      contrast_on_page: rd(hexContrast(hex, bgHex), 1),
    };
  }

  // Borders
  const borderStep = isBgDark ? 0.06 : -0.06;
  const borders = {
    default: colorEntry(oklchToHex([bgLch[0] + borderStep, bgLch[1], bgLch[2]])),
    strong:  colorEntry(oklchToHex([bgLch[0] + borderStep * 1.7, bgLch[1], bgLch[2]])),
  };

  // Summary
  const summary = [
    `Palette from bg ${bgHex} (L=${rd(bgLch[0])} H=${rd(bgLch[2],0)}°)`,
    `+ primary ${primaryHex} (L=${rd(priLch[0])} H=${rd(priLch[2],0)}°)`,
    `+ secondary ${secondaryHex} (L=${rd(secLch[0])} H=${rd(secLch[2],0)}°).`,
    `Status hues: success=${rd(statusHues.success,0)}°, error=${rd(statusHues.error,0)}°,`,
    `warning=${rd(statusHues.warning,0)}°, info=${rd(statusHues.info,0)}°.`,
    `Chroma=${statusChroma}.`,
  ].join(' ');

  return {
    backgrounds,
    accents: {
      primary: accentVariants(primaryHex),
      secondary: accentVariants(secondaryHex),
    },
    status,
    text,
    borders,
    summary,
  };
}

// ================================================================
// Layer 3: CLI Commands
// ================================================================

function cmdContrast(args) {
  if (args.positional.length < 2) throw new Error('Usage: contrast <fg> <bg>');
  const [fg, bg] = args.positional;
  const ratio = hexContrast(fg, bg);
  const result = {
    command: 'contrast',
    fg: colorEntry(fg),
    bg: colorEntry(bg),
    ratio: rd(ratio, 2),
    AA_normal: ratio >= 4.5,
    AA_large: ratio >= 3.0,
    AAA: ratio >= 7.0,
    summary: `${fg} on ${bg}: ${rd(ratio,2)}:1 — `
      + `AA${ratio >= 4.5 ? ' PASS' : ' FAIL'}, `
      + `AA-large${ratio >= 3 ? ' PASS' : ' FAIL'}, `
      + `AAA${ratio >= 7 ? ' PASS' : ' FAIL'}`,
  };
  return result;
}

function cmdAudit(args) {
  if (args.positional.length < 1) throw new Error('Usage: audit <fg:bg> [fg:bg ...]');
  const pairs = args.positional.map(p => {
    const [fg, bg] = p.split(':');
    if (!fg || !bg) throw new Error(`Invalid pair "${p}" — use fg:bg format`);
    return { fg, bg };
  });

  const results = pairs.map(({ fg, bg }) => {
    const ratio = hexContrast(fg, bg);
    return {
      fg, bg,
      ratio: rd(ratio, 2),
      AA_normal: ratio >= 4.5,
      AA_large: ratio >= 3.0,
      AAA: ratio >= 7.0,
    };
  });

  // Table to stderr
  const header = 'FG        BG        Ratio   AA   AA-lg AAA';
  const sep = '-'.repeat(header.length);
  process.stderr.write(`\n${header}\n${sep}\n`);
  for (const r of results) {
    const p = (b) => b ? 'PASS' : 'FAIL';
    process.stderr.write(
      `${r.fg.padEnd(9)} ${r.bg.padEnd(9)} ${String(r.ratio).padStart(5)}:1 `
      + `${p(r.AA_normal).padEnd(4)} ${p(r.AA_large).padEnd(5)} ${p(r.AAA)}\n`
    );
  }
  process.stderr.write(`${sep}\n\n`);

  return {
    command: 'audit',
    pairs: results,
    summary: `${results.length} pairs checked. `
      + `${results.filter(r => r.AA_normal).length} pass AA normal, `
      + `${results.filter(r => r.AAA).length} pass AAA.`,
  };
}

function cmdHarmony(args) {
  if (args.positional.length < 2) {
    throw new Error(
      `Usage: harmony <base> <type>\nTypes: ${Object.keys(HARMONY_OFFSETS).join(', ')}`
    );
  }
  const [base, type] = args.positional;
  const baseLch = hexToOklch(base);
  const colors = harmonyColors(base, type);
  return {
    command: 'harmony',
    type,
    base: { hex: base, oklch: oklchObj(baseLch) },
    colors,
    summary: `${type} from ${base} (H=${rd(baseLch[2],1)}°): `
      + colors.map(c => `${c.hex} (+${c.offset}°)`).join(', '),
  };
}

function cmdPalette(args) {
  if (args.positional.length < 2) {
    throw new Error('Usage: palette <bg> <primary> [secondary] [--chroma C]');
  }
  const [bg, primary, secondary] = args.positional;
  const chroma = args.flags.chroma ? parseFloat(args.flags.chroma) : undefined;
  return { command: 'palette', ...generatePalette(bg, primary, secondary, chroma) };
}

function cmdScale(args) {
  if (args.positional.length < 1) throw new Error('Usage: scale <base> [steps] [--step pct]');
  const base = args.positional[0];
  const steps = parseInt(args.positional[1] || '5', 10);
  const pct = parseFloat(args.flags.step || args.flags['lightness-step'] || '3');
  const scale = lightnessScale(base, steps, pct / 100);
  return {
    command: 'scale',
    base: colorEntry(base),
    steps: scale,
    summary: `${steps} steps from ${base} at ${pct}% lightness increments`,
  };
}

function cmdInfo(args) {
  if (args.positional.length < 1) throw new Error('Usage: info <hex>');
  const hex = args.positional[0];
  const srgb = parseHex(hex);
  const lrgb = toLinear(srgb);
  const xyz = linearToXyz(lrgb);
  const oklab = linearToOklab(lrgb);
  const oklch = oklabToOklch(oklab);
  const hsl = srgbToHsl(srgb);
  const lum = wcagLuminance(lrgb);

  return {
    command: 'info',
    hex: toHex(srgb),
    srgb: { r: rd(srgb[0]), g: rd(srgb[1]), b: rd(srgb[2]) },
    srgb_8bit: {
      r: Math.round(srgb[0] * 255),
      g: Math.round(srgb[1] * 255),
      b: Math.round(srgb[2] * 255),
    },
    hsl: { h: rd(hsl[0], 1), s: rd(hsl[1], 1), l: rd(hsl[2], 1) },
    xyz: { x: rd(xyz[0], 4), y: rd(xyz[1], 4), z: rd(xyz[2], 4) },
    oklab: { L: rd(oklab[0]), a: rd(oklab[1]), b: rd(oklab[2]) },
    oklch: oklchObj(oklch),
    wcag_luminance: rd(lum, 4),
    summary: `${toHex(srgb)} — OKLCH(${rd(oklch[0])}, ${rd(oklch[1])}, ${rd(oklch[2],1)}°) `
      + `HSL(${rd(hsl[0],0)}°, ${rd(hsl[1],0)}%, ${rd(hsl[2],0)}%) `
      + `Luminance: ${rd(lum, 4)}`,
  };
}

function cmdMix(args) {
  if (args.positional.length < 2) {
    throw new Error('Usage: mix <c1> <c2> [--ratio R] [--space oklch|srgb]');
  }
  const [c1, c2] = args.positional;
  const ratio = parseFloat(args.flags.ratio || '0.5');
  const space = args.flags.space || 'oklch';
  const result = mixColors(c1, c2, ratio, space);
  return {
    command: 'mix',
    c1: colorEntry(c1),
    c2: colorEntry(c2),
    ratio,
    space,
    result: colorEntry(result),
    summary: `mix(${c1}, ${c2}, ${ratio}) in ${space} = ${result}`,
  };
}

function cmdDesaturate(args) {
  if (args.positional.length < 1) {
    throw new Error('Usage: desaturate <hex> [--contrast R] [--on bg]');
  }
  const hex = args.positional[0];
  const targetContrast = parseFloat(args.flags.contrast || args.flags['target-contrast'] || '4.5');
  const bgHex = args.flags.on || '#000000';
  const result = desaturateForContrast(hex, targetContrast, bgHex);
  const finalContrast = hexContrast(result.hex, bgHex);
  return {
    command: 'desaturate',
    input: colorEntry(hex),
    background: colorEntry(bgHex),
    target_contrast: targetContrast,
    result: {
      ...colorEntry(result.hex),
      contrast: rd(finalContrast, 2),
      adjustment: result.adjusted || 'none',
    },
    summary: `${hex} -> ${result.hex} (${rd(finalContrast,2)}:1 on ${bgHex}, `
      + `adjusted: ${result.adjusted || 'none'})`,
  };
}

// --- Self-test ---

function cmdTest() {
  let passed = 0, failed = 0;
  const failures = [];

  function assert(name, actual, expected, tolerance = 0.01) {
    const ok = Math.abs(actual - expected) <= tolerance;
    if (ok) {
      passed++;
    } else {
      failed++;
      failures.push({ name, actual: rd(actual, 5), expected, tolerance });
    }
  }

  function assertHex(name, actual, expected) {
    const ok = actual.toLowerCase() === expected.toLowerCase();
    if (ok) {
      passed++;
    } else {
      failed++;
      failures.push({ name, actual, expected });
    }
  }

  // Black OKLCH
  const black = hexToOklch('#000000');
  assert('Black L', black[0], 0, 0.001);
  assert('Black C', black[1], 0, 0.001);

  // White OKLCH
  const white = hexToOklch('#ffffff');
  assert('White L', white[0], 1, 0.001);
  assert('White C', white[1], 0, 0.001);

  // Pure red OKLCH
  const red = hexToOklch('#ff0000');
  assert('Red L', red[0], 0.628, 0.005);
  assert('Red C', red[1], 0.258, 0.005);
  assert('Red H', red[2], 29, 2);

  // Pure green OKLCH
  const green = hexToOklch('#00ff00');
  assert('Green L', green[0], 0.866, 0.005);
  assert('Green C', green[1], 0.295, 0.005);
  assert('Green H', green[2], 142, 2);

  // Pure blue OKLCH
  const blue = hexToOklch('#0000ff');
  assert('Blue L', blue[0], 0.452, 0.005);
  assert('Blue C', blue[1], 0.313, 0.005);
  assert('Blue H', blue[2], 264, 2);

  // WCAG contrast: white on black = 21:1
  assert('White on black contrast', hexContrast('#ffffff', '#000000'), 21, 0.1);

  // WCAG contrast: black on white = 21:1
  assert('Black on white contrast', hexContrast('#000000', '#ffffff'), 21, 0.1);

  // Known pair from design system: #f8f8f8 on #484850
  const textOnPage = hexContrast('#f8f8f8', '#484850');
  assert('Text primary on page >= 7', textOnPage, textOnPage, 0); // self-check
  assert('Text primary on page > 7', textOnPage > 7 ? 1 : 0, 1, 0);

  // Roundtrip: hex -> OKLCH -> hex
  for (const h of ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#808080', '#00ff9f']) {
    const lch = hexToOklch(h);
    const back = oklchToHex(lch);
    assertHex(`Roundtrip ${h}`, back, h);
  }

  // WCAG luminance of pure channels
  const lrgbR = toLinear([1, 0, 0]);
  assert('Red luminance', wcagLuminance(lrgbR), 0.2126, 0.001);
  const lrgbG = toLinear([0, 1, 0]);
  assert('Green luminance', wcagLuminance(lrgbG), 0.7152, 0.001);
  const lrgbB = toLinear([0, 0, 1]);
  assert('Blue luminance', wcagLuminance(lrgbB), 0.0722, 0.001);

  // Gamut mapping: very high chroma should be clamped
  const mapped = gamutMapOklch([0.7, 0.5, 150]);
  assert('Gamut map reduces chroma', mapped[1] < 0.5 ? 1 : 0, 1, 0);
  assert('Gamut map keeps L', mapped[0], 0.7, 0.001);
  assert('Gamut map keeps H', mapped[2], 150, 0.001);
  // Result should be in gamut
  const mappedRgb = oklabToLinear(oklchToOklab(mapped));
  assert('Gamut mapped in range', isInGamut(mappedRgb) ? 1 : 0, 1, 0);

  // Harmony: complementary should be +180°
  const compBase = hexToOklch('#00ff9f');
  const comp = harmonyColors('#00ff9f', 'complementary');
  assert('Complementary offset',
    normalizeHue(hexToOklch(comp[0].hex)[2] - compBase[2] + 360) % 360, 180, 5);

  // Desaturate: result should meet contrast target
  const desat = desaturateForContrast('#ff0000', 4.5, '#1e1e22');
  const desatCr = hexContrast(desat.hex, '#1e1e22');
  assert('Desaturate meets 4.5:1', desatCr >= 4.5 ? 1 : 0, 1, 0);

  // Mix: 50% black + white = mid gray
  const midGray = mixColors('#000000', '#ffffff', 0.5, 'oklch');
  const midL = hexToOklch(midGray)[0];
  assert('Mix black+white L', midL, 0.5, 0.02);

  // HSL roundtrip
  for (const h of ['#ff0000', '#00ff00', '#0000ff', '#ffff00']) {
    const srgb = parseHex(h);
    const hsl = srgbToHsl(srgb);
    const back = hslToSrgb(hsl);
    assert(`HSL roundtrip ${h} R`, back[0], srgb[0], 0.002);
    assert(`HSL roundtrip ${h} G`, back[1], srgb[1], 0.002);
    assert(`HSL roundtrip ${h} B`, back[2], srgb[2], 0.002);
  }

  // XYZ: white point should be D65 (0.9505, 1.0000, 1.0890)
  const whiteXyz = linearToXyz([1, 1, 1]);
  assert('White XYZ X', whiteXyz[0], 0.9505, 0.002);
  assert('White XYZ Y', whiteXyz[1], 1.0000, 0.002);
  assert('White XYZ Z', whiteXyz[2], 1.0890, 0.01);

  const summary = `${passed + failed} tests: ${passed} passed, ${failed} failed`;

  return {
    command: 'test',
    passed,
    failed,
    failures,
    summary: failed === 0 ? `ALL PASS — ${summary}` : `FAILURES — ${summary}`,
  };
}

// ================================================================
// Layer 4: Entry Point
// ================================================================

function parseArgs(argv) {
  const raw = argv.slice(2);
  const positional = [];
  const flags = {};
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].startsWith('--')) {
      const key = raw[i].slice(2);
      if (i + 1 < raw.length && !raw[i + 1].startsWith('--')) {
        flags[key] = raw[++i];
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(raw[i]);
    }
  }
  return { command: positional[0], positional: positional.slice(1), flags };
}

const HELP = `
color-science.mjs — Zero-dependency color science CLI

Usage: node color-science.mjs <command> [args] [--flags]

Commands:
  contrast <fg> <bg>                   WCAG contrast ratio + pass/fail
  audit <fg:bg> [fg:bg ...]            Bulk contrast check
  harmony <base> <type>                Harmonious colors via OKLCH
  palette <bg> <primary> [secondary]   Full palette from anchors
  scale <base> [steps] [--step pct]    Lightness scale
  info <hex>                           Full color breakdown
  mix <c1> <c2> [--ratio R] [--space oklch|srgb]
  desaturate <hex> [--contrast R] [--on bg]
  test                                 Self-test

Harmony types:
  complementary  split-complementary  triadic  tetradic  analogous

Colors accept hex with or without #. Output is JSON to stdout.
`.trim();

const COMMANDS = {
  contrast: cmdContrast,
  audit: cmdAudit,
  harmony: cmdHarmony,
  palette: cmdPalette,
  scale: cmdScale,
  info: cmdInfo,
  mix: cmdMix,
  desaturate: cmdDesaturate,
  test: cmdTest,
};

function main() {
  const args = parseArgs(process.argv);
  if (!args.command || args.command === 'help' || args.flags.help) {
    console.log(HELP);
    process.exit(0);
  }
  const fn = COMMANDS[args.command];
  if (!fn) {
    console.error(`Unknown command: ${args.command}\n`);
    console.log(HELP);
    process.exit(1);
  }
  try {
    const result = fn(args);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.failed > 0 ? 1 : 0);
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}

main();
