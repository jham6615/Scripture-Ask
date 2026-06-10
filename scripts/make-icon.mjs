#!/usr/bin/env node
/**
 * Rasterize the ScriptureAsk app icon (SVG) into the platform PNG variants Expo and Electron need.
 *
 * Outputs:
 *   assets/images/icon.png                       1024×1024 master (Expo iOS/Android source)
 *   assets/images/splash-icon.png                1024×1024 splash variant (same artwork, no bg vignette)
 *   assets/images/favicon.png                    48×48 (web favicon)
 *   assets/images/android-icon-foreground.png    1024×1024 transparent-background icon for adaptive
 *   assets/images/android-icon-monochrome.png    1024×1024 silhouette for themed icons
 *   desktop/build/icon.png                       1024×1024 (Electron, mirrors the master)
 *
 * NOTE: assets/images/android-icon-background.png is a flat color (cream) — generated as a solid here too.
 *
 * Run: `node scripts/make-icon.mjs` (requires `sharp` to be installed transiently).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// -- Color tokens ---------------------------------------------------------------------------------
const CREAM = '#f4ecd9';
const CREAM_DEEP = '#e6dcc4'; // outer vignette edge
const PAGE = '#fbf5e6';
const INK = '#1a1816';
const INK_SOFT = '#2b2118';
const SPARK = '#1c9d9b'; // teal "spark" above the book — ask, and receive light
const SPARK_SOFT = '#7fcecd'; // lighter teal for the small flanking sparkles

// -- SVG ------------------------------------------------------------------------------------------
/**
 * Master icon SVG — 1024×1024. Open book viewed roughly head-on with slight depth, a centered spine
 * shadow, soft cream pages with a few text-line hints, and a 4-pointed teal "spark" rising above
 * (flanked by two smaller sparkles) — the visual rhyme for "ask, and receive light." Designed to
 * read at 29×29 (smallest iOS tray size): silhouette stays a book + spark, no fine detail.
 *
 * Background uses a radial vignette to match the existing "B" icon's warmth.
 */
const masterSVG = ({ withBackground = true }) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <radialGradient id="bg" cx="50%" cy="45%" r="65%">
      <stop offset="0%" stop-color="${CREAM}"/>
      <stop offset="100%" stop-color="${CREAM_DEEP}"/>
    </radialGradient>
    <linearGradient id="pageL" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${PAGE}"/>
      <stop offset="100%" stop-color="#efe6cf"/>
    </linearGradient>
    <linearGradient id="pageR" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#efe6cf"/>
      <stop offset="100%" stop-color="${PAGE}"/>
    </linearGradient>
    <linearGradient id="spine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="50%" stop-color="rgba(0,0,0,0.18)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </linearGradient>
  </defs>

  ${withBackground ? `<rect x="0" y="0" width="1024" height="1024" fill="url(#bg)"/>` : ''}

  <!-- Book — open, viewed slightly tilted. Pushed down a touch from center to leave room for the
       sparkle constellation above. The outer ink stroke forms the book cover; the inner pages are layered. -->
  <g transform="translate(512 600)">
    <!-- Drop shadow under the book for soft grounding -->
    <ellipse cx="0" cy="300" rx="380" ry="28" fill="rgba(26,24,22,0.18)"/>

    <!-- Cover (dark ink) — the silhouette that reads at small sizes -->
    <path d="
      M -380 -260
      C -370 -286, -200 -300, -20 -276
      L -20 280
      C -200 256, -370 270, -380 244
      Z" fill="${INK}"/>
    <path d="
      M 380 -260
      C 370 -286, 200 -300, 20 -276
      L 20 280
      C 200 256, 370 270, 380 244
      Z" fill="${INK}"/>

    <!-- Pages (cream) — slightly inset from cover, suggest a real book block -->
    <path d="
      M -355 -240
      C -345 -262, -190 -276, -30 -254
      L -30 260
      C -190 240, -345 250, -355 230
      Z" fill="url(#pageL)"/>
    <path d="
      M 355 -240
      C 345 -262, 190 -276, 30 -254
      L 30 260
      C 190 240, 345 250, 355 230
      Z" fill="url(#pageR)"/>

    <!-- Subtle horizontal text-suggestion lines on each page (3 per page, indented like paragraphs) -->
    <g fill="none" stroke="${INK_SOFT}" stroke-width="6" stroke-linecap="round" opacity="0.32">
      <line x1="-310" y1="-150" x2="-80"  y2="-138"/>
      <line x1="-310" y1="-80"  x2="-100" y2="-70"/>
      <line x1="-310" y1="-10"  x2="-90"  y2="-2"/>
      <line x1="-310" y1="60"   x2="-110" y2="68"/>
      <line x1="-310" y1="130"  x2="-95"  y2="138"/>

      <line x1="80"  y1="-138" x2="310"  y2="-150"/>
      <line x1="100" y1="-70"  x2="310"  y2="-80"/>
      <line x1="90"  y1="-2"   x2="310"  y2="-10"/>
      <line x1="110" y1="68"   x2="310"  y2="60"/>
      <line x1="95"  y1="138"  x2="310"  y2="130"/>
    </g>

    <!-- Spine shadow — gives the book its open-book depth at the binding -->
    <rect x="-25" y="-275" width="50" height="555" fill="url(#spine)"/>
  </g>

  <!-- Sparkle constellation above the book: one large 4-pointed star centered, flanked by two
       smaller ones for visual rhythm. 4-pointed-star path: long N/S arms, shorter E/W, joined at
       center with concave curves so each point is sharp without looking like a cross. -->
  <!-- Large central spark -->
  <g transform="translate(512 215)">
    <path d="
      M 0 -100
      C 10 -36, 36 -10, 100 0
      C 36 10, 10 36, 0 100
      C -10 36, -36 10, -100 0
      C -36 -10, -10 -36, 0 -100
      Z" fill="${SPARK}"/>
  </g>
  <!-- Left small spark -->
  <g transform="translate(395 225)">
    <path d="
      M 0 -35
      C 4 -14, 12 -4, 35 0
      C 12 4, 4 14, 0 35
      C -4 14, -12 4, -35 0
      C -12 -4, -4 -14, 0 -35
      Z" fill="${SPARK_SOFT}"/>
  </g>
  <!-- Right small spark -->
  <g transform="translate(635 230)">
    <path d="
      M 0 -28
      C 3 -11, 10 -3, 28 0
      C 10 3, 3 11, 0 28
      C -3 11, -10 3, -28 0
      C -10 -3, -3 -11, 0 -28
      Z" fill="${SPARK_SOFT}"/>
  </g>
</svg>
`.trim();

// Solid color (Android adaptive background)
const solidSVG = (color) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${color}"/></svg>`;

// -- Render --------------------------------------------------------------------------------------
async function writePng(svg, outPath, { width = 1024, height = 1024 } = {}) {
  const full = path.join(root, outPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await sharp(Buffer.from(svg)).resize(width, height, { fit: 'contain' }).png().toFile(full);
  console.log(`  wrote ${outPath} (${width}×${height})`);
}

async function main() {
  console.log('Rendering ScriptureAsk icon set…');

  const withBg = masterSVG({ withBackground: true });
  const transparent = masterSVG({ withBackground: false });

  // Main 1024 PNGs — drive every iOS / desktop size from this.
  await writePng(withBg, 'assets/images/icon.png');
  await writePng(withBg, 'desktop/build/icon.png');
  // Splash icon is transparent so the splash backgroundColor (cream, see app.json) shows behind it
  // seamlessly — the launch screen reads as the icon's same cream surface, not a small cream square
  // floating on a contrasting color.
  await writePng(transparent, 'assets/images/splash-icon.png');

  // Web favicon — small but the silhouette should still survive.
  await writePng(withBg, 'assets/images/favicon.png', { width: 48, height: 48 });

  // Android adaptive: foreground is the icon on transparent (system clips it into a shape and
  // composes it over the background). Background is the solid cream so the foreground sits on it.
  await writePng(transparent, 'assets/images/android-icon-foreground.png');
  await writePng(solidSVG(CREAM), 'assets/images/android-icon-background.png');

  // Themed icon (Android 13+): single-color silhouette in ink (no background).
  const mono = masterSVG({ withBackground: false }).replace(/url\(#pageL\)|url\(#pageR\)/g, INK)
    .replace(/url\(#spine\)/g, INK)
    .replace(/fill="rgba\(0,0,0,0\.18\)"/g, 'fill="' + INK + '"')
    .replace(/fill="rgba\(26,24,22,0\.18\)"/g, 'fill="none"')
    .replace(/stroke="[^"]*"/g, 'stroke="' + INK + '"');
  await writePng(mono, 'assets/images/android-icon-monochrome.png');

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
