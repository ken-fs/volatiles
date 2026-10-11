/**
 * Workflow contract tests — keep the PR-gated content pipeline honest.
 *
 * The safety contract of the v2.0 pipeline lives in YAML, which no compiler
 * checks. These tests pin the load-bearing parts:
 *   1. The shared gates composite action runs EXACTLY the eight gate
 *      commands as separate ordered steps — no more, no fewer.
 *   2. ci.yml and auto-content.yml share ONE gates definition (composite
 *      action).
 *   3. auto-content.yml never triggers on push/PR/comment (workflow_dispatch
 *      only — collaborator gate), opens DRAFT PRs only, content-only PRs
 *      (add-paths), fails loudly on zero scaffolds, and has no
 *      write-permission surface beyond contents + pull-requests.
 *   4. Every non-local `uses:` across ALL workflows is 40-hex SHA-pinned,
 *      and each action resolves to exactly one SHA repo-wide.
 *   8. The postbuild range-media lowering downgrades EVERY parenthesized
 *      group of an @media prelude — pinned against the real shipping
 *      script (imported, not copied) so it cannot drift.
 *   9. IndexNow stays opt-in and production-safe: only a successful main
 *      push CI can submit, both repo variables must exist, and submission
 *      waits for the matching deployed key before calling IndexNow.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { expect, test, describe } from 'vitest';
import { parse } from 'yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readWorkflow = (rel: string): unknown =>
  parse(readFileSync(join(root, rel), 'utf8')) as unknown;

// Imported (not re-implemented) so the lowering contract below is pinned
// against the exact code that postbuild ships. The script's main-module
// guard keeps this import side-effect-free — this line existing is itself
// the pin for that guard.
const { lowerRangeMedia } = (await import(
  pathToFileURL(join(root, 'scripts/transpile-pagefind.mjs')).href
)) as { lowerRangeMedia: (s: string) => string };

const GATES = '.github/actions/gates/action.yml';
const CI = '.github/workflows/ci.yml';
const AUTO = '.github/workflows/auto-content.yml';
const INDEXNOW = '.github/workflows/indexnow.yml';
const ALL_WORKFLOWS = [CI, AUTO, INDEXNOW];

const EIGHT_GATES = [
  'pnpm lint',
  'pnpm typecheck',
  'pnpm test',
  'pnpm check-config',
  'pnpm build',
  'pnpm check-content',
  'pnpm check-links',
  'pnpm check-i18n --strict-ui',
];

interface Step {
  name?: string;
  if?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
}
type Workflow = {
  on?: Record<string, unknown>;
  permissions?: Record<string, string>;
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean };
  jobs?: Record<
    string,
    {
      steps?: Step[];
      timeout?: number;
      if?: string;
      environment?: string;
      'continue-on-error'?: boolean;
    }
  >;
};

describe('shared gates composite action', () => {
  test('runs EXACTLY the eight gate commands, each as its own step, in order', () => {
    // Parsing the YAML (not raw-text contains) means a gate hidden in a
    // comment, a description, or several commands collapsed into one run
    // step no longer satisfies the contract.
    const action = readWorkflow(GATES) as { runs?: { steps?: Step[] } };
    const runs = (action.runs?.steps ?? [])
      .map((s) => (s.run ?? '').trim())
      .filter((r) => r.length > 0);
    expect(runs).toEqual(EIGHT_GATES);
  });

  test('the i18n gate can actually fail (strict-ui, not report-only)', () => {
    // The eighth gate was report-only at v2.0.0 — "eight gates" must mean
    // eight gates that can go red.
    expect(EIGHT_GATES[7]).toBe('pnpm check-i18n --strict-ui');
  });

  test('build step forwards the site-url input', () => {
    const action = readWorkflow(GATES) as { runs?: { steps?: Step[] } };
    const build = action.runs?.steps?.find((s) => s.env?.SITE_URL !== undefined);
    expect(build?.env?.SITE_URL).toBe('${{ inputs.site-url }}');
  });
});

describe('ci.yml uses the shared gates', () => {
  test('root gates job runs ./.github/actions/gates', () => {
    const ci = readWorkflow(CI) as { jobs?: Record<string, { steps?: Step[] }> };
    const uses = ci.jobs?.check?.steps?.map((s) => s.uses) ?? [];
    expect(uses).toContain('./.github/actions/gates');
  });
});

describe('IndexNow production automation contract', () => {
  const wf = readWorkflow(INDEXNOW) as Workflow;
  const job = wf.jobs?.submit;
  const steps = job?.steps ?? [];

  test('runs only after the CI workflow completes', () => {
    const trigger = (wf.on?.workflow_run ?? {}) as {
      workflows?: string[];
      types?: string[];
    };
    expect(Object.keys(wf.on ?? {})).toEqual(['workflow_run']);
    expect(trigger.workflows).toEqual(['CI']);
    expect(trigger.types).toEqual(['completed']);
  });

  test('requires successful main push CI plus SITE_URL and INDEXNOW_KEY repo vars', () => {
    expect(job?.if).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(job?.if).toContain("github.event.workflow_run.event == 'push'");
    expect(job?.if).toContain("github.event.workflow_run.head_branch == 'main'");
    expect(job?.if).toContain("vars.SITE_URL != ''");
    expect(job?.if).toContain("vars.INDEXNOW_KEY != ''");
  });

  test('is non-blocking and waits for the deployed matching key before submit', () => {
    // No job-level continue-on-error: this is an independent workflow_run —
    // failures already cannot block CI, and continue-on-error would only
    // repaint real misconfigurations (e.g. var set, CF env missing) green.
    expect(job?.['continue-on-error']).toBeFalsy();
    const submit = steps.find((step) => /submit-indexnow/.test(step.run ?? ''));
    expect(submit?.run).toContain('--site "$SITE_URL"');
    expect(submit?.run).toContain('--wait-for-deploy "$DEPLOY_SHA"');
    expect(submit?.run).toContain('--wait-for-key');
    // The deploy wait and key wait share one budget — keep the total inside
    // the job's timeout-minutes: 10 (checkout + install take the rest).
    expect(submit?.run).toContain('--wait-seconds 150');
    expect(submit?.env).toEqual({
      SITE_URL: '${{ vars.SITE_URL }}',
      INDEXNOW_KEY: '${{ vars.INDEXNOW_KEY }}',
      DEPLOY_SHA: '${{ github.event.workflow_run.head_sha }}',
    });
  });
});

describe('auto-content pipeline safety contract', () => {
  const wf = readWorkflow(AUTO) as Workflow;
  const steps = wf.jobs?.['generate-and-pr']?.steps ?? [];

  test('triggers on workflow_dispatch only (collaborator gate)', () => {
    expect(Object.keys(wf.on ?? {})).toEqual(['workflow_dispatch']);
  });

  test('permissions are exactly contents + pull-requests write', () => {
    expect(wf.permissions).toEqual({ contents: 'write', 'pull-requests': 'write' });
  });

  test('runs the shared gates before creating any PR', () => {
    const gateIdx = steps.findIndex((s) => s.uses === './.github/actions/gates');
    const prIdx = steps.findIndex((s) => (s.uses ?? '').includes('create-pull-request'));
    expect(gateIdx).toBeGreaterThan(-1);
    expect(prIdx).toBeGreaterThan(gateIdx);
  });

  test('generator fails loudly when it scaffolds zero articles', () => {
    const gen = steps.find((s) => /bulk-new-posts/.test(s.run ?? ''));
    expect(gen?.run).toContain('bulk-new-posts --require-output');
  });

  test('sync-codes task: gated generator with the same require-output contract', () => {
    // The codes generator follows the identical pipeline contract as
    // import-csv: task-gated step, --require-output so an all-applied run
    // fails loudly instead of opening an empty PR.
    const gen = steps.find((s) => /pnpm sync-codes/.test(s.run ?? ''));
    expect(gen?.run).toContain('pnpm sync-codes --require-output');
    expect(gen?.if).toContain("inputs.task == 'sync-codes'");
  });

  test('require-output reaches every early exit path in the generator scripts', () => {
    // Without the clauses, zero-output shapes exit 0 mid-script — the run
    // goes green and create-pull-request silently makes no PR, the exact
    // no-op --require-output exists to prevent. bulk-new-posts.ts had its
    // clause from day one; sync-codes ported the flag but not the clauses.
    for (const script of ['scripts/bulk-new-posts.ts', 'scripts/sync-codes.ts']) {
      const src = readFileSync(join(root, script), 'utf8');
      expect(src, script).toContain('process.exit(NO_INPUT_IS_ERROR || REQUIRE_OUTPUT ? 1 : 0)');
    }
    // sync-codes has one early exit bulk-new-posts lacks: a header-only or
    // fully --locales-filtered CSV (0 data rows) must fail under
    // --require-output too, not exit 0 at "Nothing to do".
    const syncSrc = readFileSync(join(root, 'scripts/sync-codes.ts'), 'utf8');
    expect(syncSrc).toContain('process.exit(REQUIRE_OUTPUT ? 1 : 0)');
  });

  test('PRs are drafts on a fixed branch and contain ONLY content changes', () => {
    const pr = steps.find((s) => (s.uses ?? '').includes('create-pull-request'));
    expect(pr?.with?.draft).toBe(true);
    // One fixed branch per task (idempotent re-dispatch, tasks never mix):
    // the branch is a task-conditional expression covering both names.
    const branch = String(pr?.with?.branch ?? '');
    expect(branch).toContain('chore/auto-content');
    expect(branch).toContain('chore/sync-codes');
    // add-paths keeps the pasted csv_text (new-posts.csv / codes-sync.csv)
    // OUT of the PR — without it the list gets committed to main on merge.
    expect(String(pr?.with?.['add-paths'] ?? '')).toContain('src/content/**');
  });

  test('never references LLM/AI secrets', () => {
    const raw = readFileSync(join(root, AUTO), 'utf8');
    expect(raw).not.toMatch(/OPENAI|ANTHROPIC|API_KEY/);
    // The pipeline uses no secrets at all — GITHUB_TOKEN is implicit.
    expect(raw.match(/secrets\.[A-Z_]+/g) ?? []).toEqual([]);
  });
});

describe('action pinning consistency', () => {
  test('every non-local uses: is 40-hex SHA-pinned in ALL workflows', () => {
    // Includes setup.yml and every third-party action (e.g. peter-evans/
    // create-pull-request) — a tag ref or a typo'd SHA must fail here, not
    // at run time.
    for (const rel of ALL_WORKFLOWS) {
      const raw = readFileSync(join(root, rel), 'utf8');
      for (const m of raw.matchAll(/uses: (\S+)@(\S+)/g)) {
        if (m[1].startsWith('./')) continue; // local composite action
        expect(m[2], `${rel}: ${m[1]} must be pinned to a 40-char SHA`).toMatch(/^[0-9a-f]{40}$/);
      }
    }
  });

  test('each action resolves to exactly ONE SHA repo-wide', () => {
    // A one-character transcription typo in a pinned SHA fails at run time
    // with a confusing "unable to find version" — so pin the invariant here.
    const byAction = new Map<string, Set<string>>();
    for (const rel of ALL_WORKFLOWS) {
      const raw = readFileSync(join(root, rel), 'utf8');
      for (const m of raw.matchAll(/uses: ((?:actions|pnpm|peter-evans)\/[a-z-]+)@([0-9a-f]{40})/g)) {
        const pins = byAction.get(m[1]) ?? new Set<string>();
        pins.add(m[2]);
        byAction.set(m[1], pins);
      }
    }
    expect(byAction.size).toBeGreaterThan(0);
    for (const [name, pins] of byAction) {
      expect([...pins], `${name} should be pinned to exactly one SHA everywhere`).toHaveLength(1);
    }
  });
});

describe('transpile-pagefind range-media lowering covers whole preludes', () => {
  // Pre-2023 kernels (old X5, Safari <16.4) drop a media rule at parse time
  // if ANY condition uses range syntax — so a first-group-only matcher that
  // rewrote `(width >= 640px)` but leaked `(hover: hover) and (width >= …)`
  // guarded nothing exactly where it matters. Pin the whole-prelude shape.
  test('compound preludes: EVERY parenthesized group gets lowered', () => {
    expect(lowerRangeMedia('@media (hover: hover) and (width >= 768px) { .x { color: red } }')).toBe(
      '@media(hover: hover) and (min-width:768px) { .x { color: red } }',
    );
  });

  test('simple preludes keep the historic byte-exact output', () => {
    // The paren-leading output shape (space collapsed, operator + trailing
    // spaces swallowed by the colon) predates the compound fix — today's
    // dist inputs must not shift by one byte.
    expect(lowerRangeMedia('@media (width>=640px){.x{}}')).toBe('@media(min-width:640px){.x{}}');
    expect(lowerRangeMedia('@media (height <= 100vh) { .x {} }')).toBe(
      '@media(max-height:100vh) { .x {} }',
    );
    // No range syntax → untouched; the guard's value is zero drift.
    expect(lowerRangeMedia('@media (max-width: 768px) { .x {} }')).toBe(
      '@media (max-width: 768px) { .x {} }',
    );
  });
});
