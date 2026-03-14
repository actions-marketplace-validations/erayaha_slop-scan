import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { report } from '../src/reporter.js';

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Runs `fn` while capturing all console.log calls.
 * Returns `{ result, logs }` where `logs` is an array of the formatted strings.
 *
 * @param {() => any} fn
 * @returns {{ result: any, logs: string[] }}
 */
function captureLog(fn) {
  const logs = [];
  const orig = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try {
    const result = fn();
    return { result, logs };
  } finally {
    console.log = orig;
  }
}

// ── Empty results ─────────────────────────────────────────────────────────────

describe('report() — empty results', () => {
  it('returns 0 for an empty array', () => {
    const { result } = captureLog(() => report([]));
    assert.equal(result, 0);
  });

  it('prints "No packages to verify" for an empty array', () => {
    const { logs } = captureLog(() => report([]));
    assert.ok(logs.some(l => l.includes('No packages to verify')));
  });
});

// ── OK results ────────────────────────────────────────────────────────────────

describe('report() — ok packages', () => {
  it('returns 0 when all packages are ok', () => {
    const { result } = captureLog(() =>
      report([{ name: 'express', status: 'ok', version: '4.21.0', weeklyDownloads: 1_000_000 }]),
    );
    assert.equal(result, 0);
  });

  it('prints ✅ line for an ok package', () => {
    const { logs } = captureLog(() =>
      report([{ name: 'express', status: 'ok', version: '4.21.0' }]),
    );
    assert.ok(logs.some(l => l.includes('✅') && l.includes('express') && l.includes('exists')));
  });

  it('includes version in ok line', () => {
    const { logs } = captureLog(() =>
      report([{ name: 'express', status: 'ok', version: '4.21.0' }]),
    );
    assert.ok(logs.some(l => l.includes('v4.21.0')));
  });

  it('prints "All packages verified" summary when no issues', () => {
    const { logs } = captureLog(() =>
      report([{ name: 'express', status: 'ok', version: '4.21.0' }]),
    );
    assert.ok(logs.some(l => l.includes('All packages verified')));
  });
});

// ── Not-found results ─────────────────────────────────────────────────────────

describe('report() — not-found packages', () => {
  it('returns 1 when a not-found package is present', () => {
    const { result } = captureLog(() =>
      report([{ name: 'react-ai-forms', status: 'not-found' }]),
    );
    assert.equal(result, 1);
  });

  it('prints 🚨 NOT FOUND line', () => {
    const { logs } = captureLog(() =>
      report([{ name: 'react-ai-forms', status: 'not-found' }]),
    );
    assert.ok(logs.some(l => l.includes('🚨') && l.includes('NOT FOUND')));
  });

  it('includes "hallucinated package" hint', () => {
    const { logs } = captureLog(() =>
      report([{ name: 'react-ai-forms', status: 'not-found' }]),
    );
    assert.ok(logs.some(l => l.includes('hallucinated package')));
  });

  it('prints singular summary for 1 hallucinated package', () => {
    const { logs } = captureLog(() =>
      report([{ name: 'fake-pkg', status: 'not-found' }]),
    );
    assert.ok(logs.some(l => l.includes('1 hallucinated package') && !l.includes('packages')));
  });

  it('prints plural summary for 2 hallucinated packages', () => {
    const { logs } = captureLog(() =>
      report([
        { name: 'fake-pkg-1', status: 'not-found' },
        { name: 'fake-pkg-2', status: 'not-found' },
      ]),
    );
    assert.ok(logs.some(l => l.includes('2 hallucinated packages')));
  });
});

// ── Suspicious results ────────────────────────────────────────────────────────

describe('report() — suspicious packages', () => {
  it('returns 1 when a suspicious package is present', () => {
    const { result } = captureLog(() =>
      report([{ name: 'ai-pdf-magic', status: 'suspicious', version: '0.0.1', weeklyDownloads: 3 }]),
    );
    assert.equal(result, 1);
  });

  it('prints 🚨 FOUND on npm line', () => {
    const { logs } = captureLog(() =>
      report([{ name: 'ai-pdf-magic', status: 'suspicious', version: '0.0.1', weeklyDownloads: 3 }]),
    );
    assert.ok(logs.some(l => l.includes('🚨') && l.includes('FOUND on npm')));
  });

  it('includes "slop squat" hint', () => {
    const { logs } = captureLog(() =>
      report([{ name: 'ai-pdf-magic', status: 'suspicious', version: '0.0.1', weeklyDownloads: 3 }]),
    );
    assert.ok(logs.some(l => l.includes('slop squat')));
  });

  it('prints singular summary for 1 risky package', () => {
    const { logs } = captureLog(() =>
      report([{ name: 'ai-squat', status: 'suspicious', version: '0.0.1', weeklyDownloads: 1 }]),
    );
    assert.ok(logs.some(l => l.includes('1 risky package') && !l.includes('packages')));
  });

  it('prints plural summary for 2 risky packages', () => {
    const { logs } = captureLog(() =>
      report([
        { name: 'ai-squat-1', status: 'suspicious', version: '0.0.1', weeklyDownloads: 1 },
        { name: 'ai-squat-2', status: 'suspicious', version: '0.0.1', weeklyDownloads: 2 },
      ]),
    );
    assert.ok(logs.some(l => l.includes('2 risky packages')));
  });
});

// ── Error results ─────────────────────────────────────────────────────────────

describe('report() — error packages', () => {
  it('returns 0 when only error status packages present', () => {
    const { result } = captureLog(() =>
      report([{ name: 'some-pkg', status: 'error', error: 'HTTP 500' }]),
    );
    assert.equal(result, 0);
  });

  it('prints ⚠️  check failed line', () => {
    const { logs } = captureLog(() =>
      report([{ name: 'some-pkg', status: 'error', error: 'HTTP 500' }]),
    );
    assert.ok(logs.some(l => l.includes('check failed') && l.includes('HTTP 500')));
  });
});

// ── Mixed results ─────────────────────────────────────────────────────────────

describe('report() — mixed results', () => {
  it('returns 1 when both not-found and ok packages are present', () => {
    const { result } = captureLog(() =>
      report([
        { name: 'express', status: 'ok', version: '4.0.0' },
        { name: 'fake-pkg', status: 'not-found' },
      ]),
    );
    assert.equal(result, 1);
  });

  it('returns 1 when both suspicious and ok packages are present', () => {
    const { result } = captureLog(() =>
      report([
        { name: 'express', status: 'ok', version: '4.0.0' },
        { name: 'ai-squat', status: 'suspicious', version: '0.0.1', weeklyDownloads: 1 },
      ]),
    );
    assert.equal(result, 1);
  });

  it('prints "and" between hallucinated and risky counts', () => {
    const { logs } = captureLog(() =>
      report([
        { name: 'fake-pkg', status: 'not-found' },
        { name: 'ai-squat', status: 'suspicious', version: '0.0.1', weeklyDownloads: 1 },
      ]),
    );
    const summary = logs.find(l => l.includes('hallucinated') && l.includes('risky'));
    assert.ok(summary, 'expected a combined summary line');
    assert.ok(summary.includes(' and '));
  });
});

// ── Sort order ────────────────────────────────────────────────────────────────

describe('report() — sort order', () => {
  it('puts not-found before ok in output', () => {
    const { logs } = captureLog(() =>
      report([
        { name: 'ok-pkg', status: 'ok', version: '1.0.0' },
        { name: 'bad-pkg', status: 'not-found' },
      ]),
    );
    const lines = logs.filter(l => l.includes('→'));
    assert.ok(lines.length >= 2);
    assert.ok(
      lines[0].includes('NOT FOUND'),
      `Expected first result line to be NOT FOUND, got: ${lines[0]}`,
    );
    assert.ok(
      lines[lines.length - 1].includes('exists'),
      `Expected last result line to be exists, got: ${lines[lines.length - 1]}`,
    );
  });

  it('puts suspicious before ok in output', () => {
    const { logs } = captureLog(() =>
      report([
        { name: 'ok-pkg', status: 'ok', version: '1.0.0' },
        { name: 'sus-pkg', status: 'suspicious', version: '0.0.1', weeklyDownloads: 1 },
      ]),
    );
    const lines = logs.filter(l => l.includes('→'));
    assert.ok(lines[0].includes('FOUND on npm'), `Expected first line to be suspicious, got: ${lines[0]}`);
  });

  it('puts error before ok in output', () => {
    const { logs } = captureLog(() =>
      report([
        { name: 'ok-pkg', status: 'ok', version: '1.0.0' },
        { name: 'err-pkg', status: 'error', error: 'timeout' },
      ]),
    );
    const lines = logs.filter(l => l.includes('→'));
    assert.ok(lines[0].includes('check failed'), `Expected first line to be error, got: ${lines[0]}`);
  });

  it('puts not-found before suspicious', () => {
    const { logs } = captureLog(() =>
      report([
        { name: 'sus-pkg', status: 'suspicious', version: '0.0.1', weeklyDownloads: 1 },
        { name: 'bad-pkg', status: 'not-found' },
      ]),
    );
    const lines = logs.filter(l => l.includes('→'));
    assert.ok(lines[0].includes('NOT FOUND'), `Expected first line to be NOT FOUND, got: ${lines[0]}`);
  });
});

// ── Slopsquatting summary line ────────────────────────────────────────────────

describe('report() — summary line', () => {
  it('includes "Potential slopsquatting targets" in the summary', () => {
    const { logs } = captureLog(() =>
      report([{ name: 'fake-pkg', status: 'not-found' }]),
    );
    assert.ok(logs.some(l => l.includes('slopsquatting')));
  });
});
