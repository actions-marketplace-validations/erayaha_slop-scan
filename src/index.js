/**
 * Main orchestration logic for slop-scan.
 *
 * 1. Walk the target directory and collect scannable files.
 * 2. Parse each file to extract npm package references.
 * 3. Verify every unique package against the npm registry.
 * 4. Report results and return an exit code.
 */

import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { scanFiles } from './scanner.js';
import { extractPackages } from './parser.js';
import { checkPackages } from './registry.js';
import { report } from './reporter.js';

/**
 * Run slop-scan on the given directory.
 *
 * @param {string} targetDir  Directory to scan (resolved to absolute path).
 * @param {{ threshold?: number }} [options]
 * @returns {Promise<number>}  Exit code (0 = no issues, 1 = problems found).
 */
export async function run(targetDir, options = {}) {
  const resolvedDir = resolve(targetDir);

  console.log(`Scanning ${resolvedDir} for npm package references...\n`);

  const files = await scanFiles(resolvedDir);

  if (files.length === 0) {
    console.log('No supported files found to scan.');
    return 0;
  }

  const allPackages = new Set();

  for (const filePath of files) {
    let content;
    try {
      content = await readFile(filePath, 'utf8');
    } catch {
      continue;
    }
    for (const pkg of extractPackages(content)) {
      allPackages.add(pkg);
    }
  }

  const packageList = [...allPackages].sort();

  if (packageList.length === 0) {
    console.log('No npm package references found in scanned files.');
    return 0;
  }

  console.log(`Found ${packageList.length} unique package(s) to verify.\n`);

  const results = await checkPackages(packageList, options);
  return report(results);
}
