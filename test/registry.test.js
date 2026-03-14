import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { checkPackages, DEFAULT_THRESHOLD } from '../src/registry.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Creates a mock for globalThis.fetch that routes by exact hostname.
 * `routes` maps a hostname string to `{ status, body }`.
 * Returns the mock handle — call `handle.mock.restore()` in a finally block.
 *
 * @param {Record<string, { status: number, body: object }>} routes
 */
function mockFetch(routes) {
  return mock.method(globalThis, 'fetch', async (url) => {
    const { hostname } = new URL(String(url));
    for (const [host, response] of Object.entries(routes)) {
      if (hostname === host) {
        return {
          ok: response.status >= 200 && response.status < 400,
          status: response.status,
          json: async () => response.body,
        };
      }
    }
    throw new Error(`Unexpected fetch call to: ${String(url)}`);
  });
}

/** True when `url` targets the npm package registry (not the downloads API). */
const isRegistryUrl = (url) => new URL(String(url)).hostname === 'registry.npmjs.org';

// ── DEFAULT_THRESHOLD ─────────────────────────────────────────────────────────

describe('DEFAULT_THRESHOLD', () => {
  it('equals 500', () => {
    assert.equal(DEFAULT_THRESHOLD, 500);
  });
});

// ── Empty input ───────────────────────────────────────────────────────────────

describe('checkPackages() — empty input', () => {
  it('returns an empty array for no packages', async () => {
    const results = await checkPackages([]);
    assert.deepEqual(results, []);
  });
});

// ── ok status ─────────────────────────────────────────────────────────────────

describe('checkPackages() — ok', () => {
  it('returns ok for a package with downloads ≥ threshold', async () => {
    const m = mockFetch({
      'registry.npmjs.org': { status: 200, body: { version: '4.21.0' } },
      'api.npmjs.org': { status: 200, body: { downloads: 1_000_000 } },
    });
    try {
      const results = await checkPackages(['express']);
      assert.equal(results[0].status, 'ok');
      assert.equal(results[0].name, 'express');
      assert.equal(results[0].version, '4.21.0');
      assert.equal(results[0].weeklyDownloads, 1_000_000);
    } finally {
      m.mock.restore();
    }
  });

  it('returns ok when downloads equals the threshold exactly', async () => {
    const m = mockFetch({
      'registry.npmjs.org': { status: 200, body: { version: '1.0.0' } },
      'api.npmjs.org': { status: 200, body: { downloads: 500 } },
    });
    try {
      // 500 downloads with default threshold 500 → NOT suspicious (< 500 is suspicious)
      const results = await checkPackages(['border-pkg']);
      assert.equal(results[0].status, 'ok');
    } finally {
      m.mock.restore();
    }
  });

  it('returns ok when downloads API is unreachable (null fallback)', async () => {
    const m = mock.method(globalThis, 'fetch', async (url) => {
      if (isRegistryUrl(url)) {
        return { ok: true, status: 200, json: async () => ({ version: '1.0.0' }) };
      }
      throw new Error('Downloads API unreachable');
    });
    try {
      const results = await checkPackages(['express']);
      assert.equal(results[0].status, 'ok');
      assert.equal(results[0].weeklyDownloads, undefined);
    } finally {
      m.mock.restore();
    }
  });

  it('returns ok when downloads API returns a non-ok HTTP status', async () => {
    const m = mock.method(globalThis, 'fetch', async (url) => {
      if (isRegistryUrl(url)) {
        return { ok: true, status: 200, json: async () => ({ version: '1.0.0' }) };
      }
      return { ok: false, status: 503, json: async () => ({}) };
    });
    try {
      const results = await checkPackages(['express']);
      assert.equal(results[0].status, 'ok');
    } finally {
      m.mock.restore();
    }
  });

  it('returns ok when downloads response has a non-numeric downloads field', async () => {
    const m = mockFetch({
      'registry.npmjs.org': { status: 200, body: { version: '1.0.0' } },
      'api.npmjs.org': { status: 200, body: { downloads: null } },
    });
    try {
      const results = await checkPackages(['some-pkg']);
      assert.equal(results[0].status, 'ok');
    } finally {
      m.mock.restore();
    }
  });
});

// ── suspicious status ─────────────────────────────────────────────────────────

describe('checkPackages() — suspicious', () => {
  it('returns suspicious for a package with downloads < threshold', async () => {
    const m = mockFetch({
      'registry.npmjs.org': { status: 200, body: { version: '0.0.1' } },
      'api.npmjs.org': { status: 200, body: { downloads: 3 } },
    });
    try {
      const results = await checkPackages(['ai-pdf-magic']);
      assert.equal(results[0].status, 'suspicious');
      assert.equal(results[0].weeklyDownloads, 3);
      assert.equal(results[0].version, '0.0.1');
    } finally {
      m.mock.restore();
    }
  });

  it('returns suspicious when 499 downloads with default threshold 500', async () => {
    const m = mockFetch({
      'registry.npmjs.org': { status: 200, body: { version: '1.0.0' } },
      'api.npmjs.org': { status: 200, body: { downloads: 499 } },
    });
    try {
      const results = await checkPackages(['almost-pkg']);
      assert.equal(results[0].status, 'suspicious');
    } finally {
      m.mock.restore();
    }
  });

  it('respects a custom lower threshold', async () => {
    const m = mockFetch({
      'registry.npmjs.org': { status: 200, body: { version: '1.0.0' } },
      'api.npmjs.org': { status: 200, body: { downloads: 800 } },
    });
    try {
      // 800 downloads, threshold 500 → ok
      const results = await checkPackages(['some-pkg'], { threshold: 500 });
      assert.equal(results[0].status, 'ok');
    } finally {
      m.mock.restore();
    }
  });

  it('respects a custom higher threshold', async () => {
    const m = mockFetch({
      'registry.npmjs.org': { status: 200, body: { version: '1.0.0' } },
      'api.npmjs.org': { status: 200, body: { downloads: 800 } },
    });
    try {
      // 800 downloads, threshold 1000 → suspicious
      const results = await checkPackages(['some-pkg'], { threshold: 1000 });
      assert.equal(results[0].status, 'suspicious');
    } finally {
      m.mock.restore();
    }
  });
});

// ── not-found status ──────────────────────────────────────────────────────────

describe('checkPackages() — not-found', () => {
  it('returns not-found for a 404 from the registry', async () => {
    const m = mockFetch({
      'registry.npmjs.org': { status: 404, body: {} },
    });
    try {
      const results = await checkPackages(['react-ai-forms']);
      assert.equal(results[0].status, 'not-found');
      assert.equal(results[0].name, 'react-ai-forms');
    } finally {
      m.mock.restore();
    }
  });
});

// ── error status ──────────────────────────────────────────────────────────────

describe('checkPackages() — error', () => {
  it('returns error when the registry fetch throws', async () => {
    const m = mock.method(globalThis, 'fetch', async () => {
      throw new Error('Network failure');
    });
    try {
      const results = await checkPackages(['some-pkg']);
      assert.equal(results[0].status, 'error');
      assert.ok(results[0].error.includes('Network failure'));
    } finally {
      m.mock.restore();
    }
  });

  it('returns error for a non-404 non-ok HTTP status from the registry', async () => {
    const m = mockFetch({
      'registry.npmjs.org': { status: 500, body: {} },
    });
    try {
      const results = await checkPackages(['some-pkg']);
      assert.equal(results[0].status, 'error');
      assert.ok(results[0].error.includes('HTTP 500'));
    } finally {
      m.mock.restore();
    }
  });
});

// ── Multiple packages ─────────────────────────────────────────────────────────

describe('checkPackages() — multiple packages', () => {
  it('returns results in the same order as input', async () => {
    const m = mock.method(globalThis, 'fetch', async (url) => {
      if (isRegistryUrl(url)) {
        if (String(url).includes('fake-pkg')) {
          return { ok: false, status: 404, json: async () => ({}) };
        }
        return { ok: true, status: 200, json: async () => ({ version: '1.0.0' }) };
      }
      return { ok: true, status: 200, json: async () => ({ downloads: 100_000 }) };
    });
    try {
      const results = await checkPackages(['express', 'fake-pkg', 'lodash']);
      assert.equal(results[0].name, 'express');
      assert.equal(results[0].status, 'ok');
      assert.equal(results[1].name, 'fake-pkg');
      assert.equal(results[1].status, 'not-found');
      assert.equal(results[2].name, 'lodash');
      assert.equal(results[2].status, 'ok');
    } finally {
      m.mock.restore();
    }
  });

  it('processes more than CONCURRENCY (8) packages correctly', async () => {
    const packages = Array.from({ length: 10 }, (_, i) => `pkg-${i}`);
    const m = mock.method(globalThis, 'fetch', async (url) => {
      if (isRegistryUrl(url)) {
        return { ok: true, status: 200, json: async () => ({ version: '1.0.0' }) };
      }
      return { ok: true, status: 200, json: async () => ({ downloads: 10_000 }) };
    });
    try {
      const results = await checkPackages(packages);
      assert.equal(results.length, 10);
      for (let i = 0; i < 10; i++) {
        assert.equal(results[i].name, `pkg-${i}`);
        assert.equal(results[i].status, 'ok');
      }
    } finally {
      m.mock.restore();
    }
  });
});

// ── Scoped packages ───────────────────────────────────────────────────────────

describe('checkPackages() — scoped packages', () => {
  it('URL-encodes the slash in scoped package names for the registry URL', async () => {
    let capturedUrl = '';
    const m = mock.method(globalThis, 'fetch', async (url) => {
      capturedUrl = String(url);
      if (isRegistryUrl(url)) {
        return { ok: true, status: 200, json: async () => ({ version: '7.0.0' }) };
      }
      return { ok: true, status: 200, json: async () => ({ downloads: 50_000 }) };
    });
    try {
      await checkPackages(['@babel/core']);
      // The registry URL for a scoped package must percent-encode the slash
      assert.ok(
        capturedUrl.includes('%2F'),
        `Expected registry URL to contain %2F for scoped package, got: ${capturedUrl}`,
      );
    } finally {
      m.mock.restore();
    }
  });

  it('checks scoped package and returns ok status', async () => {
    const m = mock.method(globalThis, 'fetch', async (url) => {
      if (isRegistryUrl(url)) {
        return { ok: true, status: 200, json: async () => ({ version: '7.0.0' }) };
      }
      return { ok: true, status: 200, json: async () => ({ downloads: 50_000 }) };
    });
    try {
      const results = await checkPackages(['@babel/core']);
      assert.equal(results[0].status, 'ok');
      assert.equal(results[0].version, '7.0.0');
    } finally {
      m.mock.restore();
    }
  });
});
