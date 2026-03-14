/**
 * Recursively scans a directory tree for files that may contain npm package
 * references and returns their absolute paths.
 */

import { readdir } from 'fs/promises';
import { join, extname } from 'path';

/** File extensions that slop-scan will read. */
const SUPPORTED_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs',
  '.ts', '.mts', '.cts',
  '.jsx', '.tsx',
  '.md', '.mdx',
]);

/**
 * Directory names that will never be descended into.
 * These are build outputs, dependency trees, and VCS metadata.
 */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.cache',
  '.parcel-cache',
  '.docusaurus',
  '.vitepress',
  '__pycache__',
  '.turbo',
]);

/**
 * Returns all scannable file paths under `dir`, excluding skipped directories
 * and unsupported file types.
 *
 * @param {string} dir  Absolute (or relative) path to the root directory.
 * @returns {Promise<string[]>}
 */
export async function scanFiles(dir) {
  const files = [];
  await walk(dir, files);
  return files;
}

/**
 * @param {string} dir
 * @param {string[]} files
 */
async function walk(dir, files) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    // Unreadable directory — skip silently
    return;
  }

  for (const entry of entries) {
    // Skip hidden entries (dot-files / dot-dirs) except .github which may
    // contain workflow files worth scanning.
    if (entry.name.startsWith('.') && entry.name !== '.github') continue;

    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        await walk(fullPath, files);
      }
    } else if (entry.isFile()) {
      if (SUPPORTED_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        files.push(fullPath);
      }
    }
  }
}
