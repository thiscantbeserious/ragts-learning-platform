#!/usr/bin/env node
/**
 * extract-lucide-icons.mjs — Lucide SVG extraction tool for Erika icons.
 *
 * Fetches Lucide SVGs from Iconify API, normalizes attributes, URL-encodes
 * them, and writes CSS mask-image declarations to design/styles/icons-lucide-output.css
 *
 * Usage: node .agents/scripts/extract-lucide-icons.mjs
 *
 * To add a new icon:
 *   1. Find the Lucide icon name at https://lucide.dev/icons/
 *   2. Add it to the erikaToLucide map below
 *   3. Re-run this script and copy the generated CSS class into design/styles/icons.css
 *
 * SVG normalization:
 *   viewBox="0 0 24 24", fill="none", stroke="white",
 *   stroke-width="2", stroke-linecap="round", stroke-linejoin="round"
 */

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Erika icon name -> Lucide icon name mapping (58 icons)
const erikaToLucide = {
  'chevron-right': 'chevron-right',
  'chevron-down': 'chevron-down',
  'chevron-left': 'chevron-left',
  'chevron-up': 'chevron-up',
  'arrow-left': 'arrow-left',
  'arrow-right': 'arrow-right',
  'close': 'x',
  'home': 'house',
  'menu': 'menu',
  'external-link': 'external-link',
  'check-circle': 'circle-check',
  'warning': 'triangle-alert',
  'error-circle': 'circle-x',
  'info-circle': 'info',
  'checkmark': 'check',
  'x-mark': 'x',
  'help-circle': 'circle-help',
  'upload': 'upload',
  'download': 'download',
  'plus': 'plus',
  'search': 'search',
  'edit': 'pencil',
  'trash': 'trash-2',
  'copy': 'copy',
  'share': 'share',
  'bookmark': 'bookmark',
  'star': 'star',
  'refresh': 'refresh-cw',
  'link': 'link',
  'terminal': 'terminal',
  'code': 'code',
  'clock': 'clock',
  'sections': 'text-align-justify',
  'file-check': 'file-check',
  'calendar': 'calendar',
  'document': 'file-text',
  'folder': 'folder',
  'tag': 'tag',
  'comment': 'message-square',
  'play': 'play',
  'pause': 'pause',
  'stop': 'square',
  'rewind': 'rewind',
  'fast-forward': 'fast-forward',
  'skip-back': 'skip-back',
  'skip-forward': 'skip-forward',
  'user': 'user',
  'settings': 'settings',
  'filter': 'list-filter',
  'sort': 'arrow-up-down',
  'grid-view': 'layout-grid',
  'list-view': 'list',
  'eye': 'eye',
  'eye-off': 'eye-off',
  'expand': 'maximize',
  'collapse': 'minimize',
  'bell': 'bell',
  'logout': 'log-out',
};

const iconGroups = {
  navigation: ['chevron-right', 'chevron-down', 'chevron-left', 'chevron-up', 'arrow-left', 'arrow-right', 'close', 'home', 'menu', 'external-link'],
  status: ['check-circle', 'warning', 'error-circle', 'info-circle', 'checkmark', 'x-mark', 'help-circle'],
  actions: ['upload', 'download', 'plus', 'search', 'edit', 'trash', 'copy', 'share', 'bookmark', 'star', 'refresh', 'link'],
  content: ['terminal', 'code', 'clock', 'sections', 'file-check', 'calendar', 'document', 'folder', 'tag', 'comment'],
  playback: ['play', 'pause', 'stop', 'rewind', 'fast-forward', 'skip-back', 'skip-forward'],
  system: ['user', 'settings', 'filter', 'sort', 'grid-view', 'list-view', 'eye', 'eye-off', 'expand', 'collapse', 'bell', 'logout'],
};

const groupLabels = {
  navigation: 'NAVIGATION ICONS',
  status: 'STATUS ICONS',
  actions: 'ACTION ICONS',
  content: 'CONTENT ICONS',
  playback: 'PLAYBACK ICONS',
  system: 'SYSTEM ICONS',
};

async function fetchSvg(lucideName) {
  const iconifyUrl = 'https://api.iconify.design/lucide/' + lucideName + '.svg';
  const githubUrl = 'https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/' + lucideName + '.svg';
  let res = await fetch(iconifyUrl);
  if (!res.ok) {
    process.stderr.write('  Iconify 404 for ' + lucideName + ', trying GitHub...\n');
    res = await fetch(githubUrl);
  }
  if (!res.ok) {
    throw new Error('Failed to fetch ' + lucideName + ': HTTP ' + res.status);
  }
  return res.text();
}

function normalizeSvg(svgText) {
  let svg = svgText.trim();

  // Remove XML declaration
  svg = svg.replace(/<\?xml[^>]*\?>\s*/g, '');

  // Rewrite the svg opening tag with normalized attributes
  // Strip ALL known svg-level attrs before rewriting to avoid duplicates
  svg = svg.replace(/<svg([^>]*)>/s, function(match, attrs) {
    attrs = attrs
      .replace(/\s*xmlns="[^"]*"/g, '')
      .replace(/\s+xmlns:xlink="[^"]*"/g, '')
      .replace(/\s+width="[^"]*"/g, '')
      .replace(/\s+height="[^"]*"/g, '')
      .replace(/\s+viewBox="[^"]*"/gi, '')
      .replace(/\s+fill="[^"]*"/g, '')
      .replace(/\s+stroke="[^"]*"/g, '')
      .replace(/\s+stroke-width="[^"]*"/g, '')
      .replace(/\s+stroke-linecap="[^"]*"/g, '')
      .replace(/\s+stroke-linejoin="[^"]*"/g, '')
      .replace(/\s+class="[^"]*"/g, '')
      .trim();
    const extra = attrs.length > 0 ? ' ' + attrs : '';
    return '<svg xmlns="http://www.w3.org/2000/svg"' + extra + ' viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
  });

  // Remove per-element redundancies that duplicate SVG-level inherited values.
  // Only strip from child elements (not the <svg> tag itself, which we just wrote above).
  // Strategy: strip from closing > of the <svg> tag onwards.
  const svgTagEnd = svg.indexOf('>');
  const svgTag = svg.slice(0, svgTagEnd + 1);
  let svgBody = svg.slice(svgTagEnd + 1);

  svgBody = svgBody.replace(/\s+stroke="currentColor"/g, '');
  svgBody = svgBody.replace(/\s+fill="none"/g, '');
  // Do NOT strip stroke-width/stroke-linecap/stroke-linejoin from children — some icons
  // use non-standard values (e.g. fill="white" for dot elements). Only remove exact defaults.
  svgBody = svgBody.replace(/\s+stroke-width="2"/g, '');
  svgBody = svgBody.replace(/\s+stroke-linecap="round"/g, '');
  svgBody = svgBody.replace(/\s+stroke-linejoin="round"/g, '');

  svg = svgTag + svgBody;

  return svg;
}

function encodeSvgForCss(svgText) {
  return svgText
    .replace(/%/g, '%25')
    .replace(/"/g, "'")
    .replace(/#/g, '%23')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
    .replace(/\t/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function generateCssClass(erikaName, encodedSvg) {
  const dataUri = 'url("data:image/svg+xml,' + encodedSvg + '")';
  return '.icon-' + erikaName + ' {\n  -webkit-mask-image: ' + dataUri + ';\n  mask-image: ' + dataUri + ';\n}';
}

async function main() {
  const results = {};
  const errors = [];
  const entries = Object.entries(erikaToLucide);

  process.stderr.write('Fetching ' + entries.length + ' Lucide icons...\n');

  await Promise.all(entries.map(async function([erikaName, lucideName]) {
    try {
      const raw = await fetchSvg(lucideName);
      const normalized = normalizeSvg(raw);
      const encoded = encodeSvgForCss(normalized);
      results[erikaName] = encoded;
      process.stderr.write('  OK ' + erikaName + '\n');
    } catch (e) {
      errors.push({ erikaName, lucideName, error: e.message });
      process.stderr.write('  FAIL ' + erikaName + ': ' + e.message + '\n');
    }
  }));

  if (errors.length) {
    process.stderr.write('FAILED icons: ' + errors.map(function(e) { return e.erikaName; }).join(', ') + '\n');
  }

  let output = '';
  for (const [groupKey, iconNames] of Object.entries(iconGroups)) {
    output += '\n/* ================================================================\n';
    output += '   ' + groupLabels[groupKey] + ' (' + iconNames.length + ')\n';
    output += '   ================================================================ */\n\n';
    for (const erikaName of iconNames) {
      if (results[erikaName]) {
        output += generateCssClass(erikaName, results[erikaName]);
        output += '\n\n';
      } else {
        output += '/* FETCH FAILED: .icon-' + erikaName + ' */\n\n';
      }
    }
  }

  const outPath = join(__dirname, 'styles', 'icons-lucide-output.css');
  writeFileSync(outPath, output, 'utf8');
  process.stderr.write('Written: ' + outPath + '\n');

  if (errors.length) process.exit(1);
}

main().catch(function(err) {
  process.stderr.write('Fatal: ' + err.message + '\n');
  process.exit(1);
});
