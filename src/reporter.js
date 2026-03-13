/**
 * Formats and prints slop-scan results to stdout, then returns an exit code.
 *
 * Output format matches the problem-statement example:
 *
 *   ✅  express         → exists (v4.21.0)
 *   🚨  react-ai-forms  → NOT FOUND on npm  ← hallucinated package
 *   🚨  ai-pdf-magic    → FOUND on npm  ← potentially a slop squat package, review manually
 *
 * Exit code: 0 if no issues found, 1 if any suspicious or not-found packages.
 */

const EMOJI_OK = '✅';
const EMOJI_WARN = '🚨';
const EMOJI_ERROR = '⚠️ ';

/**
 * Maps status to sort priority so problems are shown at the top.
 */
const STATUS_ORDER = { 'not-found': 0, suspicious: 1, error: 2, ok: 3 };

/**
 * @param {import('./registry.js').PackageResult[]} results
 * @returns {number} exit code
 */
export function report(results) {
  if (results.length === 0) {
    console.log('No packages to verify.');
    return 0;
  }

  // Sort: problems first, then ok, then errors
  const sorted = [...results].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99),
  );

  let notFoundCount = 0;
  let suspiciousCount = 0;

  for (const result of sorted) {
    const padded = result.name.padEnd(30);
    switch (result.status) {
      case 'ok':
        console.log(`${EMOJI_OK}  ${padded} → exists (v${result.version})`);
        break;
      case 'suspicious':
        console.log(
          `${EMOJI_WARN}  ${padded} → FOUND on npm  ← potentially a slop squat package, review manually`,
        );
        suspiciousCount++;
        break;
      case 'not-found':
        console.log(
          `${EMOJI_WARN}  ${padded} → NOT FOUND on npm  ← hallucinated package`,
        );
        notFoundCount++;
        break;
      case 'error':
        console.log(
          `${EMOJI_ERROR}  ${padded} → check failed (${result.error})`,
        );
        break;
    }
  }

  console.log('');

  const total = notFoundCount + suspiciousCount;

  if (total === 0) {
    console.log('✨ All packages verified. No issues found.');
    return 0;
  }

  const parts = [];
  if (notFoundCount > 0) {
    parts.push(
      `${notFoundCount} hallucinated package${notFoundCount !== 1 ? 's' : ''}`,
    );
  }
  if (suspiciousCount > 0) {
    parts.push(
      `${suspiciousCount} risky package${suspiciousCount !== 1 ? 's' : ''}`,
    );
  }

  console.log(`${parts.join(' and ')} detected. Potential slopsquatting targets.`);
  return 1;
}
