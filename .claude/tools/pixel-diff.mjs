#!/usr/bin/env node
/**
 * pixel-diff — compare a rendered screenshot against a Figma export.
 *
 *   node pixel-diff.mjs --a figma.png --b render.png --out diff.png --threshold 0.5
 *
 * stdout: {"diffPct":0.21,"diffPixels":1203,"total":572400,"pass":true}
 * exit:   0 = pass, 1 = over threshold, 2 = error
 *
 * qa-visual depends on this exact contract. Report the JSON verbatim; never
 * paraphrase a result, and never claim a pass without having run this.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1];
}

function fail(message, code = 2) {
  console.log(JSON.stringify({ error: message, pass: false }));
  process.exit(code);
}

if (!args.a || !args.b) fail('usage: --a <figma.png> --b <render.png> [--out diff.png] [--threshold 0.5]');

try {
  const a = PNG.sync.read(readFileSync(args.a));
  const b = PNG.sync.read(readFileSync(args.b));

  // A size mismatch is a real defect, not something to paper over by scaling.
  // Usually it means the section rendered at the wrong height — which is
  // exactly the kind of thing a diff is supposed to catch.
  if (a.width !== b.width || a.height !== b.height) {
    fail(`size mismatch: reference ${a.width}x${a.height}, render ${b.width}x${b.height}`);
  }

  const diff = new PNG({ width: a.width, height: a.height });

  // includeAA:false — Figma and the browser rasterize type differently, so
  // anti-aliased edge pixels are noise, not defects. Without this, every
  // section fails on font rendering alone and the whole check is worthless.
  const diffPixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
    threshold: 0.1,
    includeAA: false,
  });

  const total = a.width * a.height;
  const diffPct = (diffPixels / total) * 100;
  const threshold = Number(args.threshold ?? 0.5);
  const pass = diffPct <= threshold;

  if (args.out) writeFileSync(args.out, PNG.sync.write(diff));

  console.log(JSON.stringify({
    diffPct: Number(diffPct.toFixed(3)),
    diffPixels,
    total,
    threshold,
    pass,
    diffImage: args.out ?? null,
  }));

  process.exit(pass ? 0 : 1);
} catch (err) {
  fail(String(err && err.message ? err.message : err));
}
