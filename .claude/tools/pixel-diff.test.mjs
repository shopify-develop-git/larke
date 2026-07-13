/**
 * Tests for pixel-diff.mjs. Run: node pixel-diff.test.mjs
 * These lock the CLI contract that qa-visual depends on.
 */
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const dir = mkdtempSync(join(tmpdir(), 'pxdiff-'));
const p = (n) => join(dir, n);

function makePng(path, w, h, rgba, stripe) {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (w * y + x) << 2;
      const c = stripe && stripe(x, y) ? stripe(x, y) : rgba;
      png.data[i] = c[0]; png.data[i + 1] = c[1]; png.data[i + 2] = c[2]; png.data[i + 3] = c[3];
    }
  }
  writeFileSync(path, PNG.sync.write(png));
}

function run(a, b, threshold = '0.5') {
  try {
    const out = execFileSync('node', ['pixel-diff.mjs', '--a', a, '--b', b, '--out', p('d.png'), '--threshold', threshold], { cwd: import.meta.dirname });
    return { code: 0, json: JSON.parse(out.toString()) };
  } catch (e) {
    return { code: e.status, json: JSON.parse(e.stdout.toString()) };
  }
}

// 1. identical images → 0%, pass, exit 0
makePng(p('a.png'), 100, 100, [255, 0, 0, 255]);
makePng(p('b.png'), 100, 100, [255, 0, 0, 255]);
let r = run(p('a.png'), p('b.png'));
assert.equal(r.code, 0, 'identical images should exit 0');
assert.equal(r.json.diffPct, 0);
assert.equal(r.json.pass, true);

// 2. fully different → 100%, fail, exit 1
makePng(p('c.png'), 100, 100, [0, 255, 0, 255]);
r = run(p('a.png'), p('c.png'));
assert.equal(r.code, 1, 'fully different images should exit 1');
assert.equal(r.json.pass, false);
assert.ok(r.json.diffPct > 99);

// 3. small difference under threshold → pass.
//    20 of 10000 px = 0.2%, below the 0.5% threshold.
makePng(p('d_small.png'), 100, 100, [255, 0, 0, 255], (x, y) => (y === 0 && x < 20 ? [0, 0, 255, 255] : null));
r = run(p('a.png'), p('d_small.png'));
assert.equal(r.json.pass, true, `0.2% diff should pass, got ${r.json.diffPct}%`);
assert.equal(r.code, 0);

// 4. difference over threshold → fail.
//    200 of 10000 px = 2%, above 0.5%.
makePng(p('e_big.png'), 100, 100, [255, 0, 0, 255], (x, y) => (y < 2 && x < 100 ? [0, 0, 255, 255] : null));
r = run(p('a.png'), p('e_big.png'));
assert.equal(r.json.pass, false, `2% diff should fail, got ${r.json.diffPct}%`);
assert.equal(r.code, 1);

// 5. size mismatch → error, exit 2 (a real defect, not something to scale away)
makePng(p('f_small.png'), 50, 50, [255, 0, 0, 255]);
r = run(p('a.png'), p('f_small.png'));
assert.equal(r.code, 2, 'size mismatch should exit 2');
assert.equal(r.json.pass, false);
assert.match(r.json.error, /size mismatch/);

console.log('✅ pixel-diff: 5/5 tests passed');
