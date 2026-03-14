#!/usr/bin/env node
/**
 * slop-scan CLI entry point.
 *
 * Usage:
 *   slop-scan [options] [directory]
 *   npx slop-scan [options] [directory]
 *
 * Options:
 *   --threshold <n>    Weekly download threshold below which a package is
 *                      flagged as suspicious (default: 500)
 *   --help, -h         Print help and exit
 *   --version, -v      Print version and exit
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { run } from '../src/index.js';

// Resolve package version without a top-level await or import assertion
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf8'),
);

const HELP = `
slop-scan v${pkg.version} — Verify npm packages mentioned in your code and docs

Usage:
  slop-scan [options] [directory]
  npx slop-scan [options] [directory]

Arguments:
  directory            Directory to scan (default: current directory)

Options:
  --threshold <n>      Weekly downloads threshold for suspicious packages
                       (default: 500)
  --help,    -h        Show this help message
  --version, -v        Show version number

Examples:
  slop-scan .
  slop-scan ./docs --threshold 1000
  npx slop-scan /path/to/project
`.trim();

// ── Argument parsing ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const options = {};
const positional = [];

for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg === '--help' || arg === '-h') {
    console.log(HELP);
    process.exit(0);
  }

  if (arg === '--version' || arg === '-v') {
    console.log(pkg.version);
    process.exit(0);
  }

  if (arg === '--threshold') {
    const val = parseInt(args[++i], 10);
    if (isNaN(val) || val < 0) {
      console.error('Error: --threshold must be a non-negative integer.');
      process.exit(1);
    }
    options.threshold = val;
    continue;
  }

  if (arg.startsWith('--threshold=')) {
    const val = parseInt(arg.split('=')[1], 10);
    if (isNaN(val) || val < 0) {
      console.error('Error: --threshold must be a non-negative integer.');
      process.exit(1);
    }
    options.threshold = val;
    continue;
  }

  if (arg.startsWith('-')) {
    console.error(`Unknown option: ${arg}`);
    console.error('Run slop-scan --help for usage.');
    process.exit(1);
  }

  positional.push(arg);
}

const targetDir = positional[0] ?? '.';

// ── Run ───────────────────────────────────────────────────────────────────────

run(targetDir, options)
  .then(exitCode => process.exit(exitCode))
  .catch(err => {
    console.error(`Fatal error: ${err.message}`);
    process.exit(1);
  });
