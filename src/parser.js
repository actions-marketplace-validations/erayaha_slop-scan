/**
 * Extracts npm package names from source code and documentation files.
 *
 * Handles:
 *  - Shell commands: npm install/i/add, npx, yarn add, pnpm add
 *  - JS/TS: require(), import … from, dynamic import(), export … from
 *  - TypeScript triple-slash references: /// <reference types="pkg" />
 */

/** Node.js built-in module names that should not be checked against npm. */
const NODE_BUILTINS = new Set([
  'assert', 'assert/strict', 'async_hooks', 'buffer', 'child_process',
  'cluster', 'console', 'constants', 'crypto', 'dgram', 'diagnostics_channel',
  'dns', 'dns/promises', 'domain', 'events', 'fs', 'fs/promises', 'http',
  'http2', 'https', 'inspector', 'module', 'net', 'os', 'path', 'path/posix',
  'path/win32', 'perf_hooks', 'process', 'punycode', 'querystring', 'readline',
  'readline/promises', 'repl', 'stream', 'stream/consumers', 'stream/promises',
  'stream/web', 'string_decoder', 'sys', 'timers', 'timers/promises', 'tls',
  'trace_events', 'tty', 'url', 'util', 'util/types', 'v8', 'vm',
  'worker_threads', 'zlib',
  // TypeScript `/// <reference types="node" />` refers to the Node.js runtime,
  // not an npm package.
  'node',
]);

/**
 * Returns true if `pkg` is a Node.js built-in (including the `node:` protocol).
 * @param {string} pkg
 */
function isBuiltIn(pkg) {
  if (pkg.startsWith('node:') || pkg.startsWith('bun:')) return true;
  const base = pkg.split('/')[0];
  return NODE_BUILTINS.has(base);
}

/**
 * Returns true if `pkg` looks like a relative or absolute filesystem path.
 * @param {string} pkg
 */
function isRelativePath(pkg) {
  return pkg.startsWith('.') || pkg.startsWith('/');
}

/**
 * Strips the version specifier and subpath from a raw package token so that
 * only the registry-addressable name remains.
 *
 * Examples:
 *   express@4.0.0          → express
 *   @babel/core@7          → @babel/core
 *   express/router         → express
 *   @babel/core/register   → @babel/core
 *
 * @param {string} raw
 * @returns {string}
 */
function normalizePackageName(raw) {
  if (raw.startsWith('@')) {
    // Scoped: @scope/name[@version][/subpath]
    const withoutAt = raw.slice(1);
    const slashIdx = withoutAt.indexOf('/');
    if (slashIdx === -1) return raw; // malformed scoped name, skip
    const scope = withoutAt.slice(0, slashIdx);
    const rest = withoutAt.slice(slashIdx + 1);
    // rest may be "name@version/subpath"
    const namePart = rest.split('/')[0];
    const atIdx = namePart.indexOf('@');
    const name = atIdx > 0 ? namePart.slice(0, atIdx) : namePart;
    return `@${scope}/${name}`;
  }
  // Regular: name[@version][/subpath]
  const base = raw.split('/')[0];
  const atIdx = base.indexOf('@');
  return atIdx > 0 ? base.slice(0, atIdx) : base;
}

/** Validates a npm package name (basic sanity check). */
const PACKAGE_NAME_RE = /^(@[\w-]+\/)?([\w][\w.-]*)$/;

/**
 * Adds `raw` to `set` after normalisation, skipping builtins and paths.
 * @param {Set<string>} set
 * @param {string} raw
 */
function addPackage(set, raw) {
  if (!raw || isRelativePath(raw) || isBuiltIn(raw)) return;
  const name = normalizePackageName(raw);
  if (PACKAGE_NAME_RE.test(name)) {
    set.add(name);
  }
}

/**
 * Strips a shell-style inline comment (everything from `#` to end of string)
 * from the token list portion of a shell command, so that patterns like
 * `yarn add lodash  # Yarn` don't extract "Yarn" as a package name.
 *
 * @param {string} rest  Everything after the command keyword.
 * @returns {string}
 */
function stripComment(rest) {
  const idx = rest.indexOf('#');
  return idx === -1 ? rest : rest.slice(0, idx);
}

/**
 * Parses shell-command lines (npm/npx/yarn/pnpm) and JS/TS
 * import/require statements from `content`, returning a deduplicated array
 * of npm package names.
 *
 * @param {string} content  File content to scan.
 * @returns {string[]}
 */
export function extractPackages(content) {
  const packages = new Set();

  // ── Shell command lines ────────────────────────────────────────────────────
  const lines = content.split('\n');
  for (const line of lines) {
    // Strip leading shell prompts ($ or >) and whitespace
    const trimmed = line.replace(/^\s*[$>]\s*/, '').trim();

    // npm install / npm i / npm add / npm ci
    const npmMatch = trimmed.match(
      /^(?:sudo\s+)?npm\s+(?:install|i|add|ci)\s+(.+)/,
    );
    if (npmMatch) {
      for (const token of stripComment(npmMatch[1]).split(/\s+/)) {
        if (!token.startsWith('-')) addPackage(packages, token);
      }
      continue;
    }

    // npx <package> [args]  — first non-flag token is the package
    const npxMatch = trimmed.match(/^(?:sudo\s+)?npx\s+(.+)/);
    if (npxMatch) {
      for (const token of stripComment(npxMatch[1]).split(/\s+/)) {
        if (!token.startsWith('-') && !token.includes('=')) {
          addPackage(packages, token);
          break; // only the first positional is the package
        }
      }
      continue;
    }

    // yarn add / yarn global add
    const yarnMatch = trimmed.match(
      /^(?:sudo\s+)?yarn\s+(?:global\s+)?add\s+(.+)/,
    );
    if (yarnMatch) {
      for (const token of stripComment(yarnMatch[1]).split(/\s+/)) {
        if (!token.startsWith('-')) addPackage(packages, token);
      }
      continue;
    }

    // pnpm add / pnpm install
    const pnpmMatch = trimmed.match(
      /^(?:sudo\s+)?pnpm\s+(?:add|install)\s+(.+)/,
    );
    if (pnpmMatch) {
      for (const token of stripComment(pnpmMatch[1]).split(/\s+/)) {
        if (!token.startsWith('-')) addPackage(packages, token);
      }
      continue;
    }
  }

  // ── JS / TS code patterns ─────────────────────────────────────────────────
  let m;

  // require('pkg')
  const requireRe = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = requireRe.exec(content)) !== null) addPackage(packages, m[1]);

  // import … from 'pkg'  (including `import type`)
  // Uses a broad pattern that captures the specifier after `from`
  const importFromRe = /\bimport\b[\s\S]*?\bfrom\s+['"]([^'"]+)['"]/g;
  while ((m = importFromRe.exec(content)) !== null) addPackage(packages, m[1]);

  // dynamic import('pkg')
  const dynImportRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = dynImportRe.exec(content)) !== null) addPackage(packages, m[1]);

  // export … from 'pkg'
  const exportFromRe = /\bexport\b[^;]*?\bfrom\s+['"]([^'"]+)['"]/g;
  while ((m = exportFromRe.exec(content)) !== null) addPackage(packages, m[1]);

  // TypeScript triple-slash reference: /// <reference types="pkg" />
  const tripleSlashRe = /\/\/\/\s*<reference\s+types\s*=\s*['"]([^'"]+)['"]/g;
  while ((m = tripleSlashRe.exec(content)) !== null) addPackage(packages, m[1]);

  return [...packages];
}
