/**
 * Template CHANGELOG contract (template repo only — generated sites do not
 * ship CHANGELOG.md, so the suite skips there).
 *   - first section is `## [Unreleased]` (a release must never swallow it)
 *   - package.json's version has its own `## [x.y.z] - YYYY-MM-DD` section
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const path = join(root, 'CHANGELOG.md');
const isTemplate = existsSync(path) && existsSync(join(root, 'TEMPLATE.md'));

describe.skipIf(!isTemplate)('CHANGELOG release contract (template only)', () => {
  const changelog = isTemplate ? readFileSync(path, 'utf8') : '';
  test('first version section is [Unreleased]', () => {
    expect(changelog.match(/^## \[(.+?)\]/m)?.[1]).toBe('Unreleased');
  });
  test('package.json version has a dated section', () => {
    const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
    expect(changelog).toMatch(new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\] - \\d{4}-\\d{2}-\\d{2}`, 'm'));
  });
});
