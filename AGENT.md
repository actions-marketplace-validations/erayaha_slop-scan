# AGENT.md — slop-scan Developer Guide

This file exists to help AI agents and new contributors quickly understand the
codebase and work within it effectively.

---

## Project Overview

**slop-scan** is a zero-dependency Node.js CLI and GitHub Action that parses
source code and Markdown documentation for npm package references, then verifies
each unique package against the live npm registry.

Its primary purpose is detecting **slopsquatting** targets — package names that
AI code-generation tools hallucinate, which attackers can register as malware.
It classifies each package as:

| Status | Meaning |
|--------|---------|
| `ok` | Found on npm with ≥ threshold weekly downloads |
| `suspicious` | Found on npm but has < threshold weekly downloads |
| `not-found` | 404 from the registry — hallucinated or unpublished |
| `error` | Network or registry failure |

---

## Architecture

The tool is a linear pipeline:

```
bin/slop-scan.js  (CLI arg parsing)
        │
        ▼
src/index.js      (orchestration: scan → parse → verify → report)
    ├── src/scanner.js   (recursive directory walker)
    ├── src/parser.js    (regex-based package name extractor)
    ├── src/registry.js  (npm registry + downloads API verifier)
    └── src/reporter.js  (stdout formatter + exit-code logic)
```

### Module Reference

| File | Purpose |
|------|---------|
| `bin/slop-scan.js` | CLI entry point; parses `--threshold`, `--help`, `--version`; calls `run()` |
| `src/index.js` | `run(dir, options)` — orchestrates the full pipeline |
| `src/scanner.js` | `scanFiles(dir)` — walks directory tree, returns paths of supported files |
| `src/parser.js` | `extractPackages(content)` — extracts deduplicated package names from file content |
| `src/registry.js` | `checkPackages(names, options)` — verifies names against npm; bounded concurrency (8) |
| `src/reporter.js` | `report(results)` — formats results to stdout, returns exit code 0 or 1 |

---

## Development Commands

```bash
# Run all tests (Node.js built-in test runner, no extra install needed)
node --test test/*.test.js

# Alias via package.json script
npm test

# Run a single test file
node --test test/reporter.test.js

# Run the CLI locally
node bin/slop-scan.js .
node bin/slop-scan.js . --threshold 1000
node bin/slop-scan.js --help
node bin/slop-scan.js --version
```

No build step is required — the project is plain ES modules, run directly by Node.js.

---

## Test Files

| File | What it covers |
|------|----------------|
| `test/parser.test.js` | `extractPackages()` — all shell and JS/TS patterns, edge cases |
| `test/scanner.test.js` | `scanFiles()` — directory walking, extension filtering, skip dirs |
| `test/reporter.test.js` | `report()` — all status types, sorting, exit codes, summary text |
| `test/registry.test.js` | `checkPackages()` — all status paths, fetch mocking, concurrency, scoped names |
| `test/index.test.js` | `run()` — end-to-end integration with real filesystem and mocked fetch |

### Fetch mocking pattern

`registry.js` calls the global `fetch` directly, so tests mock it with:

```js
import { mock } from 'node:test';

const m = mock.method(globalThis, 'fetch', async (url) => { /* … */ });
try {
  // … test assertions …
} finally {
  m.mock.restore(); // ALWAYS restore in a finally block
}
```

### Console capture pattern

`reporter.js` and `index.js` write to `console.log`. Tests capture output with:

```js
async function silentRun(fn) {
  const logs = [];
  const orig = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try {
    return { result: await fn(), logs };
  } finally {
    console.log = orig;
  }
}
```

---

## Key Design Decisions

1. **Zero runtime dependencies** — Only Node.js built-ins (`fs`, `path`, `fetch`).
   Do not add any npm `dependencies` or `devDependencies` without very strong
   justification. The whole point of the tool is that it is lightweight and
   trustworthy.

2. **ES Modules** — The project uses `"type": "module"` in `package.json`. All
   import paths must include the `.js` extension.

3. **Node.js built-in test runner** — Use `node:test` and `node:assert/strict`.
   Do **not** introduce Jest, Vitest, Mocha, or any other test framework.

4. **Concurrency cap** — Registry checks are batched in groups of `CONCURRENCY = 8`
   (`src/registry.js`) to avoid hammering the npm registry.

5. **Downloads API is best-effort** — If the downloads API is unreachable or returns
   a non-numeric value, the package is reported as `ok` rather than `suspicious`.
   Availability of a package on the registry is the hard signal; download count is
   a soft signal.

6. **Suspicious threshold** — Default is 500 weekly downloads. Configurable via
   `--threshold <n>` (CLI) or `{ threshold: n }` option in `run()`.

7. **Built-in exclusions** — `node:*` protocol, `bun:*` protocol, relative paths
   (`./`, `../`, `/`), and all Node.js core modules are excluded from registry
   checks (see `src/parser.js` → `isBuiltIn`, `isRelativePath`).

---

## Extending the Parser

To add support for a new package manager command or import syntax:

1. Edit `src/parser.js`.
2. In the **shell commands** section, add a new regex and loop through tokens
   with `addPackage(packages, token)`.
3. In the **JS/TS patterns** section, add a new regex and call
   `addPackage(packages, m[1])` in a `while` loop.
4. The `addPackage` helper handles deduplication, built-in exclusion, relative
   path exclusion, and name normalisation automatically.
5. Add matching tests in `test/parser.test.js`.

## Extending the Scanner

- To support new file extensions: add to `SUPPORTED_EXTENSIONS` in `src/scanner.js`.
- To skip additional directories: add to `SKIP_DIRS` in `src/scanner.js`.

---

## Publishing

### npm

All required `package.json` fields are present: `name`, `version`, `description`,
`author`, `license`, `keywords`, `repository`, `homepage`, `bugs`, `bin`, `files`,
`engines`.

```bash
npm login
npm publish --access public
```

The `files` field limits what is published to `bin/` and `src/` only; test files,
`AGENT.md`, `README.md`, `action.yml`, and `package.json` are automatically
included by npm but test directories are not.

### GitHub Actions Marketplace

The `action.yml` at the repository root defines the action metadata (`name`,
`description`, `author`, `branding`, `inputs`, `runs`). It is ready for
marketplace publishing.

**Important:** The `.github/workflows/` directory has been removed from this
repository. While GitHub Marketplace publishing does not technically prohibit
having a workflows directory, the self-referencing workflow (`uses: ./`) that
previously existed was a development convenience and is not needed in the
published action. Action consumers add slop-scan to their own workflow files
using `uses: erayaha/slop-scan@v1` — see the README for an example.

To publish a new release to the marketplace:
1. Create a GitHub Release with a semantic version tag (e.g. `v1`, `v1.0.0`).
2. Check the "Publish this Action to the GitHub Marketplace" option.

Reference: https://docs.github.com/en/actions/how-tos/create-and-publish-actions/publish-in-github-marketplace
