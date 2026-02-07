/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PAGE_DIRS = [
  path.join(ROOT, 'src', 'pages'),
  path.join(ROOT, 'src', 'components', 'pages')
];
const UI_DIR = path.join(ROOT, 'src', 'ui');

const FORBIDDEN_PREFIXES = ['text-', 'leading-', 'tracking-', 'p-', 'px-', 'py-', 'm-', 'mt-', 'mb-', 'rounded-'];

const FILE_EXTENSIONS = new Set(['.ts', '.tsx']);

function isWithin(dir, filePath) {
  const rel = path.relative(dir, filePath);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function collectFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, out);
      continue;
    }
    if (entry.isFile() && FILE_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

function stripInterpolations(value) {
  return value.replace(/\$\{[^}]*\}/g, ' ');
}

function extractClassStrings(content) {
  const matches = [];
  const regex = /class(Name)?\s*=\s*(["'`])([\s\S]*?)\2/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    matches.push(stripInterpolations(match[3]));
  }
  return matches;
}

function findForbiddenTokens(classValue) {
  const tokens = classValue.split(/\s+/).filter(Boolean);
  return tokens.filter((token) => {
    if (token.startsWith('[')) return false; // arbitrary values handled by prefixes elsewhere
    return FORBIDDEN_PREFIXES.some((prefix) => token.startsWith(prefix) || token.startsWith(`-${prefix}`));
  });
}

function main() {
  const files = PAGE_DIRS.flatMap((dir) => collectFiles(dir)).filter((file) => !isWithin(UI_DIR, file));
  const violations = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const classBlocks = extractClassStrings(content);
    const badTokens = classBlocks.flatMap(findForbiddenTokens);
    if (badTokens.length > 0) {
      violations.push({
        file,
        tokens: Array.from(new Set(badTokens))
      });
    }
  }

  if (violations.length > 0) {
    console.error('UI guardrail violation: forbidden Tailwind classes found in page components.');
    for (const v of violations) {
      const rel = path.relative(ROOT, v.file);
      console.error(`- ${rel}: ${v.tokens.join(', ')}`);
    }
    process.exit(1);
  }

  console.log('UI guardrail check passed.');
}

main();
