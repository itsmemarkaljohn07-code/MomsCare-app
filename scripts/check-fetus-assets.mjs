// Checks that src/app/shared/fetus-images.ts and src/assets/fetus/ agree:
// every file in the manifest exists, and every image in the folder is in the
// manifest. Run with `npm run check:fetus`. Exits 1 on any mismatch.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(root, 'src/app/shared/fetus-images.ts');
const folder = join(root, 'src/assets/fetus');
const IMAGE = /\.(png|jpe?g|webp|gif|avif)$/i;

const manifest = [...readFileSync(manifestPath, 'utf8').matchAll(/file:\s*'assets\/fetus\/([^']+)'/g)].map(m => m[1]);
const onDisk = readdirSync(folder).filter(f => IMAGE.test(f));

const problems = [];
if (manifest.length === 0) problems.push('no files found in the manifest (has its format changed?)');
const dupes = manifest.filter((f, i) => manifest.indexOf(f) !== i);
for (const f of new Set(dupes)) problems.push(`listed twice in the manifest: ${f}`);
for (const f of manifest) if (!existsSync(join(folder, f))) problems.push(`in the manifest but missing on disk: ${f}`);
for (const f of onDisk) if (!manifest.includes(f)) problems.push(`in src/assets/fetus but not in the manifest: ${f}`);

if (problems.length) {
  console.error(`check:fetus FAILED (${problems.length})`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`check:fetus OK: ${manifest.length} manifest files, all present; no unlisted images.`);
