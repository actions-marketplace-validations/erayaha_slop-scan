import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractPackages } from '../src/parser.js';

// ── Helper ────────────────────────────────────────────────────────────────────

/** Sort-insensitive deep-equal check for package arrays. */
function assertPackages(content, expected) {
  const actual = extractPackages(content).sort();
  assert.deepEqual(actual, [...expected].sort());
}

// ── npm shell commands ────────────────────────────────────────────────────────

describe('npm install', () => {
  it('extracts a single package', () => {
    assertPackages('npm install express', ['express']);
  });

  it('extracts multiple packages', () => {
    assertPackages('npm install express axios react', ['express', 'axios', 'react']);
  });

  it('skips flags', () => {
    assertPackages('npm install --save-dev typescript', ['typescript']);
  });

  it('handles --save flag before package', () => {
    assertPackages('npm install --save express', ['express']);
  });

  it('strips version specifiers', () => {
    assertPackages('npm install express@4.0.0 axios@1.0.0', ['express', 'axios']);
  });

  it('handles scoped packages', () => {
    assertPackages('npm install @babel/core @types/node', ['@babel/core', '@types/node']);
  });

  it('strips version from scoped packages', () => {
    assertPackages('npm install @babel/core@7.0.0', ['@babel/core']);
  });

  it('handles npm i shorthand', () => {
    assertPackages('npm i express', ['express']);
  });

  it('handles npm add', () => {
    assertPackages('npm add lodash', ['lodash']);
  });

  it('handles shell prompt prefix $', () => {
    assertPackages('$ npm install express', ['express']);
  });

  it('handles shell prompt prefix >', () => {
    assertPackages('> npm install express', ['express']);
  });

  it('strips shell inline comments', () => {
    assertPackages('npm install express  # web framework', ['express']);
  });
});

// ── npx ───────────────────────────────────────────────────────────────────────

describe('npx', () => {
  it('extracts the package from npx command', () => {
    assertPackages('npx create-react-app my-app', ['create-react-app']);
  });

  it('skips npx flags before package', () => {
    assertPackages('npx -y prettier --write .', ['prettier']);
  });

  it('handles scoped npx package', () => {
    assertPackages('npx @scope/tool', ['@scope/tool']);
  });

  it('does not extract app arguments as packages', () => {
    const result = extractPackages('npx create-react-app my-app');
    assert.ok(!result.includes('my-app'));
  });
});

// ── yarn / pnpm ───────────────────────────────────────────────────────────────

describe('yarn add', () => {
  it('extracts packages', () => {
    assertPackages('yarn add express axios', ['express', 'axios']);
  });

  it('handles yarn global add', () => {
    assertPackages('yarn global add typescript', ['typescript']);
  });

  it('strips shell inline comments', () => {
    assertPackages('yarn add lodash  # Yarn package manager', ['lodash']);
  });
});

describe('pnpm add', () => {
  it('extracts packages', () => {
    assertPackages('pnpm add lodash', ['lodash']);
  });

  it('handles pnpm install', () => {
    assertPackages('pnpm install express', ['express']);
  });
});

// ── require() ─────────────────────────────────────────────────────────────────

describe('require()', () => {
  it('extracts single-quoted require', () => {
    assertPackages("const x = require('express');", ['express']);
  });

  it('extracts double-quoted require', () => {
    assertPackages('const x = require("express");', ['express']);
  });

  it('excludes relative require', () => {
    assertPackages("require('./local')", []);
  });

  it('excludes Node.js built-in', () => {
    assertPackages("require('fs')", []);
  });

  it('excludes node: protocol', () => {
    assertPackages("require('node:path')", []);
  });

  it('strips subpath from require', () => {
    assertPackages("require('express/router')", ['express']);
  });
});

// ── import … from ─────────────────────────────────────────────────────────────

describe('import … from', () => {
  it('extracts default import', () => {
    assertPackages("import express from 'express';", ['express']);
  });

  it('extracts named import', () => {
    assertPackages("import { useState } from 'react';", ['react']);
  });

  it('extracts type import', () => {
    assertPackages("import type { Foo } from 'some-types';", ['some-types']);
  });

  it('excludes relative import', () => {
    assertPackages("import foo from './foo';", []);
  });

  it('excludes Node.js built-in', () => {
    assertPackages("import fs from 'fs';", []);
  });

  it('excludes node: protocol', () => {
    assertPackages("import { readFile } from 'node:fs/promises';", []);
  });

  it('handles multi-line import', () => {
    const content = `import {
  useState,
  useEffect,
} from 'react';`;
    assertPackages(content, ['react']);
  });

  it('strips subpath import', () => {
    assertPackages("import register from '@babel/core/register';", ['@babel/core']);
  });
});

// ── dynamic import() ──────────────────────────────────────────────────────────

describe('dynamic import()', () => {
  it('extracts dynamic import', () => {
    assertPackages("import('lodash').then()", ['lodash']);
  });

  it('excludes relative dynamic import', () => {
    assertPackages("import('./plugin')", []);
  });
});

// ── export … from ────────────────────────────────────────────────────────────

describe('export … from', () => {
  it('extracts re-export', () => {
    assertPackages("export { foo } from 'some-lib';", ['some-lib']);
  });

  it('extracts wildcard re-export', () => {
    assertPackages("export * from 'some-lib';", ['some-lib']);
  });
});

// ── TypeScript triple-slash references ───────────────────────────────────────

describe('triple-slash references', () => {
  it('extracts types reference', () => {
    assertPackages('/// <reference types="node" />', []);
  });

  it('extracts non-builtin types reference', () => {
    assertPackages('/// <reference types="custom-types" />', ['custom-types']);
  });
});

// ── Deduplication ─────────────────────────────────────────────────────────────

describe('deduplication', () => {
  it('returns unique package names even if referenced multiple times', () => {
    const content = `
      import express from 'express';
      const express2 = require('express');
      npm install express
    `;
    assertPackages(content, ['express']);
  });
});

// ── Mixed content (markdown with code blocks) ─────────────────────────────────

describe('markdown mixed content', () => {
  it('extracts packages from markdown code blocks', () => {
    const content = `
# Install dependencies

\`\`\`bash
npm install express axios
\`\`\`

\`\`\`js
import express from 'express';
\`\`\`
    `;
    assertPackages(content, ['express', 'axios']);
  });
});
