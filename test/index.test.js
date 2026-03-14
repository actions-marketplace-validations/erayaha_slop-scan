import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, rm, chmod } from 'fs/promises';
import { join } from 'path';
import { run } from '../src/index.js';

/** True when `url` targets the npm package registry (not the downloads API). */
const isRegistryUrl = (url) => new URL(String(url)).hostname === 'registry.npmjs.org';

const TEST_DIR = '/tmp/slop-scan-index-test';

// ── Setup / Teardown ──────────────────────────────────────────────────────────

before(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
  await mkdir(TEST_DIR, { recursive: true });
});

after(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Runs `fn()` while suppressing console.log.
 * Returns `{ result, logs }` where `result` is the awaited return value.
 *
 * @param {() => Promise<any>} fn
 * @returns {Promise<{ result: any, logs: string[] }>}
 */
async function silentRun(fn) {
  const logs = [];
  const orig = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try {
    const result = await fn();
    return { result, logs };
  } finally {
    console.log = orig;
  }
}

// ── No files ──────────────────────────────────────────────────────────────────

describe('run() — no files', () => {
  it('returns 0 when the directory has no supported files', async () => {
    const dir = join(TEST_DIR, 'empty');
    await mkdir(dir);
    const { result } = await silentRun(() => run(dir));
    assert.equal(result, 0);
  });

  it('prints a "No supported files" message when directory is empty', async () => {
    const dir = join(TEST_DIR, 'empty-msg');
    await mkdir(dir);
    const { logs } = await silentRun(() => run(dir));
    assert.ok(logs.some(l => l.includes('No supported files')));
  });
});

// ── No package references ─────────────────────────────────────────────────────

describe('run() — no package references', () => {
  it('returns 0 when files exist but contain no package references', async () => {
    const dir = join(TEST_DIR, 'no-refs');
    await mkdir(dir);
    await writeFile(join(dir, 'index.js'), '// empty file with no imports');
    const { result } = await silentRun(() => run(dir));
    assert.equal(result, 0);
  });

  it('prints "No npm package references found" when nothing to verify', async () => {
    const dir = join(TEST_DIR, 'no-refs-msg');
    await mkdir(dir);
    await writeFile(join(dir, 'index.js'), '// no imports');
    const { logs } = await silentRun(() => run(dir));
    assert.ok(logs.some(l => l.includes('No npm package references found')));
  });
});

// ── All packages ok ───────────────────────────────────────────────────────────

describe('run() — all ok', () => {
  it('returns 0 when all packages exist with high downloads', async () => {
    const dir = join(TEST_DIR, 'all-ok');
    await mkdir(dir);
    await writeFile(join(dir, 'index.js'), "import express from 'express';");

    const m = mock.method(globalThis, 'fetch', async (url) => {
      if (isRegistryUrl(url))
        return { ok: true, status: 200, json: async () => ({ version: '4.21.0' }) };
      return { ok: true, status: 200, json: async () => ({ downloads: 1_000_000 }) };
    });
    try {
      const { result } = await silentRun(() => run(dir));
      assert.equal(result, 0);
    } finally {
      m.mock.restore();
    }
  });

  it('logs the package count before verifying', async () => {
    const dir = join(TEST_DIR, 'all-ok-log');
    await mkdir(dir);
    await writeFile(join(dir, 'index.js'), "import express from 'express';");

    const m = mock.method(globalThis, 'fetch', async (url) => {
      if (isRegistryUrl(url))
        return { ok: true, status: 200, json: async () => ({ version: '4.21.0' }) };
      return { ok: true, status: 200, json: async () => ({ downloads: 1_000_000 }) };
    });
    try {
      const { logs } = await silentRun(() => run(dir));
      assert.ok(logs.some(l => l.includes('1 unique package')));
    } finally {
      m.mock.restore();
    }
  });
});

// ── Not-found package ─────────────────────────────────────────────────────────

describe('run() — not-found package', () => {
  it('returns 1 when a not-found package is detected', async () => {
    const dir = join(TEST_DIR, 'not-found');
    await mkdir(dir);
    await writeFile(join(dir, 'index.js'), "import fakePkg from 'react-ai-forms';");

    const m = mock.method(globalThis, 'fetch', async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
    }));
    try {
      const { result } = await silentRun(() => run(dir));
      assert.equal(result, 1);
    } finally {
      m.mock.restore();
    }
  });
});

// ── Suspicious package ────────────────────────────────────────────────────────

describe('run() — suspicious package', () => {
  it('returns 1 when a suspicious package is detected', async () => {
    const dir = join(TEST_DIR, 'suspicious');
    await mkdir(dir);
    await writeFile(join(dir, 'index.js'), "import aiPkg from 'ai-pdf-magic';");

    const m = mock.method(globalThis, 'fetch', async (url) => {
      if (isRegistryUrl(url))
        return { ok: true, status: 200, json: async () => ({ version: '0.0.1' }) };
      return { ok: true, status: 200, json: async () => ({ downloads: 3 }) };
    });
    try {
      const { result } = await silentRun(() => run(dir));
      assert.equal(result, 1);
    } finally {
      m.mock.restore();
    }
  });
});

// ── Markdown files ────────────────────────────────────────────────────────────

describe('run() — markdown scanning', () => {
  it('extracts packages from npm install in markdown code blocks', async () => {
    const dir = join(TEST_DIR, 'markdown');
    await mkdir(dir);
    await writeFile(
      join(dir, 'README.md'),
      '# Docs\n\n```bash\nnpm install express\n```\n',
    );

    const m = mock.method(globalThis, 'fetch', async (url) => {
      if (isRegistryUrl(url))
        return { ok: true, status: 200, json: async () => ({ version: '4.21.0' }) };
      return { ok: true, status: 200, json: async () => ({ downloads: 1_000_000 }) };
    });
    try {
      const { result } = await silentRun(() => run(dir));
      assert.equal(result, 0);
    } finally {
      m.mock.restore();
    }
  });
});

// ── Deduplication across files ────────────────────────────────────────────────

describe('run() — deduplication', () => {
  it('verifies each unique package only once across multiple files', async () => {
    const dir = join(TEST_DIR, 'dedup');
    await mkdir(dir);
    await writeFile(join(dir, 'a.js'), "import express from 'express';");
    await writeFile(join(dir, 'b.js'), "const express = require('express');");
    await writeFile(join(dir, 'README.md'), 'npm install express');

    let registryFetchCount = 0;
    const m = mock.method(globalThis, 'fetch', async (url) => {
      if (isRegistryUrl(url)) {
        registryFetchCount++;
        return { ok: true, status: 200, json: async () => ({ version: '4.21.0' }) };
      }
      return { ok: true, status: 200, json: async () => ({ downloads: 1_000_000 }) };
    });
    try {
      await silentRun(() => run(dir));
      // express should only have been verified once despite appearing in 3 files
      assert.equal(registryFetchCount, 1, 'expected express to be checked once');
    } finally {
      m.mock.restore();
    }
  });
});

// ── Custom threshold ──────────────────────────────────────────────────────────

describe('run() — custom threshold', () => {
  it('flags a package as suspicious when its downloads are below the custom threshold', async () => {
    const dir = join(TEST_DIR, 'threshold');
    await mkdir(dir);
    await writeFile(join(dir, 'index.js'), "import pkg from 'some-pkg';");

    const m = mock.method(globalThis, 'fetch', async (url) => {
      if (isRegistryUrl(url))
        return { ok: true, status: 200, json: async () => ({ version: '1.0.0' }) };
      return { ok: true, status: 200, json: async () => ({ downloads: 800 }) };
    });
    try {
      // 800 downloads < threshold 1000 → suspicious → exit 1
      const { result } = await silentRun(() => run(dir, { threshold: 1000 }));
      assert.equal(result, 1);
    } finally {
      m.mock.restore();
    }
  });

  it('considers a package ok when its downloads are above the custom threshold', async () => {
    const dir = join(TEST_DIR, 'threshold-ok');
    await mkdir(dir);
    await writeFile(join(dir, 'index.js'), "import pkg from 'some-pkg';");

    const m = mock.method(globalThis, 'fetch', async (url) => {
      if (isRegistryUrl(url))
        return { ok: true, status: 200, json: async () => ({ version: '1.0.0' }) };
      return { ok: true, status: 200, json: async () => ({ downloads: 800 }) };
    });
    try {
      // 800 downloads ≥ threshold 500 → ok → exit 0
      const { result } = await silentRun(() => run(dir, { threshold: 500 }));
      assert.equal(result, 0);
    } finally {
      m.mock.restore();
    }
  });
});

// ── Unreadable files ──────────────────────────────────────────────────────────

describe('run() — unreadable files', () => {
  it('skips unreadable files without throwing', async () => {
    // Skip this test when running as root (chmod has no effect on root processes)
    if (process.getuid && process.getuid() === 0) return;

    const dir = join(TEST_DIR, 'unreadable');
    await mkdir(dir);
    const unreadable = join(dir, 'secret.js');
    const readable = join(dir, 'index.js');
    await writeFile(unreadable, "import fakePkg from 'hallucinated-pkg';");
    await writeFile(readable, '// nothing here');
    await chmod(unreadable, 0o000);

    try {
      // The unreadable file should be silently skipped; no packages found → 0
      const { result } = await silentRun(() => run(dir));
      assert.equal(result, 0);
    } finally {
      await chmod(unreadable, 0o644); // restore for cleanup
    }
  });
});

// ── Mixed results (integration) ───────────────────────────────────────────────

describe('run() — mixed results', () => {
  it('returns 1 when one package is ok and one is not-found', async () => {
    const dir = join(TEST_DIR, 'mixed');
    await mkdir(dir);
    await writeFile(
      join(dir, 'index.js'),
      "import express from 'express';\nimport fakePkg from 'react-ai-forms';",
    );

    const m = mock.method(globalThis, 'fetch', async (url) => {
      if (isRegistryUrl(url)) {
        if (String(url).includes('react-ai-forms'))
          return { ok: false, status: 404, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => ({ version: '4.21.0' }) };
      }
      return { ok: true, status: 200, json: async () => ({ downloads: 1_000_000 }) };
    });
    try {
      const { result } = await silentRun(() => run(dir));
      assert.equal(result, 1);
    } finally {
      m.mock.restore();
    }
  });
});
