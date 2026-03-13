import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { scanFiles } from '../src/scanner.js';

const TEST_DIR = '/tmp/slop-scan-scanner-test';

// ── Setup / Teardown ──────────────────────────────────────────────────────────

before(async () => {
  await mkdir(TEST_DIR, { recursive: true });
  await mkdir(join(TEST_DIR, 'src'), { recursive: true });
  await mkdir(join(TEST_DIR, 'docs'), { recursive: true });
  await mkdir(join(TEST_DIR, 'node_modules', 'some-pkg'), { recursive: true });
  await mkdir(join(TEST_DIR, 'dist'), { recursive: true });
  await mkdir(join(TEST_DIR, 'build'), { recursive: true });
  await mkdir(join(TEST_DIR, '.git'), { recursive: true });
  await mkdir(join(TEST_DIR, '.github', 'workflows'), { recursive: true });

  // Supported files
  await writeFile(join(TEST_DIR, 'index.js'), '');
  await writeFile(join(TEST_DIR, 'README.md'), '');
  await writeFile(join(TEST_DIR, 'src', 'app.ts'), '');
  await writeFile(join(TEST_DIR, 'src', 'utils.jsx'), '');
  await writeFile(join(TEST_DIR, 'src', 'helper.mjs'), '');
  await writeFile(join(TEST_DIR, 'docs', 'guide.mdx'), '');
  await writeFile(join(TEST_DIR, '.github', 'workflows', 'ci.yml'), '');

  // Unsupported / excluded files
  await writeFile(join(TEST_DIR, 'package.json'), '{}');
  await writeFile(join(TEST_DIR, 'data.csv'), '');
  await writeFile(join(TEST_DIR, 'image.png'), '');
  await writeFile(join(TEST_DIR, 'node_modules', 'some-pkg', 'index.js'), '');
  await writeFile(join(TEST_DIR, 'dist', 'bundle.js'), '');
  await writeFile(join(TEST_DIR, 'build', 'output.js'), '');
  await writeFile(join(TEST_DIR, '.git', 'COMMIT_EDITMSG'), '');
  // Hidden file (not .github)
  await writeFile(join(TEST_DIR, '.env'), '');
});

after(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('scanFiles', () => {
  it('finds supported JavaScript and TypeScript files', async () => {
    const files = await scanFiles(TEST_DIR);
    const names = files.map(f => f.slice(TEST_DIR.length + 1));

    assert.ok(names.includes('index.js'), 'index.js should be included');
    assert.ok(names.includes('src/app.ts'), 'src/app.ts should be included');
    assert.ok(names.includes('src/utils.jsx'), 'src/utils.jsx should be included');
    assert.ok(names.includes('src/helper.mjs'), 'src/helper.mjs should be included');
  });

  it('finds Markdown files', async () => {
    const files = await scanFiles(TEST_DIR);
    const names = files.map(f => f.slice(TEST_DIR.length + 1));

    assert.ok(names.includes('README.md'), 'README.md should be included');
    assert.ok(names.includes('docs/guide.mdx'), 'docs/guide.mdx should be included');
  });

  it('excludes node_modules', async () => {
    const files = await scanFiles(TEST_DIR);
    const hasNodeModules = files.some(f => f.includes('node_modules'));
    assert.equal(hasNodeModules, false, 'node_modules should be excluded');
  });

  it('excludes dist directory', async () => {
    const files = await scanFiles(TEST_DIR);
    const hasDist = files.some(f => f.includes('/dist/'));
    assert.equal(hasDist, false, 'dist should be excluded');
  });

  it('excludes build directory', async () => {
    const files = await scanFiles(TEST_DIR);
    const hasBuild = files.some(f => f.includes('/build/'));
    assert.equal(hasBuild, false, 'build should be excluded');
  });

  it('excludes .git directory', async () => {
    const files = await scanFiles(TEST_DIR);
    const hasGit = files.some(f => f.includes('/.git/'));
    assert.equal(hasGit, false, '.git should be excluded');
  });

  it('excludes hidden files (other than .github)', async () => {
    const files = await scanFiles(TEST_DIR);
    const hasEnv = files.some(f => f.endsWith('/.env') || f.endsWith('\\.env'));
    assert.equal(hasEnv, false, '.env should be excluded');
  });

  it('excludes unsupported file types (json, csv, png)', async () => {
    const files = await scanFiles(TEST_DIR);
    const hasUnsupported = files.some(
      f => f.endsWith('.json') || f.endsWith('.csv') || f.endsWith('.png'),
    );
    assert.equal(hasUnsupported, false, 'unsupported types should be excluded');
  });

  it('returns an empty array for an empty directory', async () => {
    const emptyDir = join(TEST_DIR, 'empty-sub');
    await mkdir(emptyDir, { recursive: true });
    const files = await scanFiles(emptyDir);
    assert.deepEqual(files, []);
  });

  it('does not throw on non-existent directory', async () => {
    const files = await scanFiles('/tmp/slop-scan-nonexistent-xyz');
    assert.deepEqual(files, []);
  });
});
