/**
 * Emit the IndexNow ownership file into dist/ during postbuild.
 *
 * INDEXNOW_KEY is intentionally a build-time variable: every fork/site gets
 * its own key without committing a generated <key>.txt file to the template.
 * When unset, the key file step is skipped (a committed public/<key>.txt still
 * works for submission).
 *
 * The deploy marker (.well-known/anvilwiki-deploy.txt) is INDEPENDENT of the
 * key: it records which Git commit this build produced, so the post-CI
 * IndexNow workflow can wait for the new deployment instead of racing it.
 * It is written whenever a commit SHA is available at build time.
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { indexNowKeyFileName, normalizeIndexNowKey } from './lib/indexnow';

const dist = path.resolve(process.cwd(), 'dist');
const key = normalizeIndexNowKey(process.env.INDEXNOW_KEY);

// Cloudflare exposes the Git commit SHA to the production build — Pages as
// CF_PAGES_COMMIT_SHA, Workers Builds as WORKERS_CI_COMMIT_SHA; GitHub Actions
// (Ship's default deploy since 2026-10-09) as GITHUB_SHA. Local builds fall
// back to `git rev-parse HEAD` (game-template-anvil 2026-10-11): Ship's daily
// patrol compares /.well-known/anvilwiki-deploy.txt with the repo HEAD, so a
// build without a marker reads as "deploy broken" (upstream only wrote it on CF).
function gitHead(): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
}
const commitSha = (
  process.env.CF_PAGES_COMMIT_SHA ??
  process.env.WORKERS_CI_COMMIT_SHA ??
  process.env.GITHUB_SHA ??
  gitHead()
)?.trim();

if (!key && !commitSha) {
  console.log('[IndexNow] INDEXNOW_KEY not configured; key file emission skipped.');
  process.exit(0);
}

if (!fs.existsSync(dist)) {
  throw new Error('dist/ does not exist; write-indexnow-key must run after the Astro build.');
}

if (key) {
  const filename = indexNowKeyFileName(key);
  fs.writeFileSync(path.join(dist, filename), key, 'utf8');
  console.log(`[IndexNow] Wrote dist/${filename}`);
} else {
  console.log('[IndexNow] INDEXNOW_KEY not configured; key file emission skipped.');
}

if (commitSha) {
  if (!/^[0-9a-f]{40}$/i.test(commitSha)) {
    throw new Error('CF_PAGES_COMMIT_SHA / WORKERS_CI_COMMIT_SHA / GITHUB_SHA must be a 40-character Git SHA when set.');
  }
  const wellKnown = path.join(dist, '.well-known');
  fs.mkdirSync(wellKnown, { recursive: true });
  fs.writeFileSync(path.join(wellKnown, 'anvilwiki-deploy.txt'), commitSha, 'utf8');
  console.log(`[deploy-marker] Wrote dist/.well-known/anvilwiki-deploy.txt = ${commitSha}`);
}
