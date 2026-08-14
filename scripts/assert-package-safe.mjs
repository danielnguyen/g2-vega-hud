import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

const roots = process.argv.slice(2);
if (roots.length === 0) {
  console.error('Usage: node scripts/assert-package-safe.mjs <file-or-directory> [...]');
  process.exit(2);
}

const forbiddenValues = unique(
  [
    process.env.VEGA_SECRET_CANARY_AUTH,
    process.env.VEGA_SECRET_CANARY_GATEWAY,
    process.env.G2_GATEWAY_TOKEN,
    process.env.DEEPGRAM_API_KEY,
    process.env.CHAT_ORCHESTRATOR_API_KEY,
    process.env.VITE_AUTH_VALUE
  ].filter((value) => typeof value === 'string' && value.length >= 8)
);

const forbiddenLiterals = [
  'replace-with-narrow-gateway-token',
  'G2_GATEWAY_TOKEN=',
  'DEEPGRAM_API_KEY=',
  'CHAT_ORCHESTRATOR_API_KEY='
];

const sensitiveFileNames = [/^\.env(?:\..+)?$/i, /(?:^|\.)pem$/i, /(?:^|\.)key$/i];
const highSignalSecretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:^|[^A-Za-z0-9])sk-[A-Za-z0-9_-]{24,}/
];

const findings = [];
for (const root of roots) {
  const absoluteRoot = resolve(root);
  scanPath(absoluteRoot, absoluteRoot);
}

if (findings.length > 0) {
  console.error('Package safety assertion failed:');
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log(`Package safety assertion passed for: ${roots.join(', ')}`);

function scanPath(path, root) {
  const stat = statSync(path);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) {
      scanPath(join(path, entry), root);
    }
    return;
  }

  if (!stat.isFile()) {
    return;
  }

  const name = basename(path);
  if (sensitiveFileNames.some((pattern) => pattern.test(name))) {
    findings.push(`${displayPath(path, root)} has a sensitive filename`);
  }

  const contents = readFileSync(path);
  for (const value of forbiddenValues) {
    if (contents.includes(Buffer.from(value))) {
      findings.push(`${displayPath(path, root)} contains a forbidden build-time secret/canary value`);
    }
  }

  for (const literal of forbiddenLiterals) {
    if (contents.includes(Buffer.from(literal))) {
      findings.push(`${displayPath(path, root)} contains forbidden literal ${JSON.stringify(literal)}`);
    }
  }

  const text = contents.toString('utf8');
  for (const pattern of highSignalSecretPatterns) {
    if (pattern.test(text)) {
      findings.push(`${displayPath(path, root)} matches high-signal secret pattern ${pattern}`);
    }
  }
}

function displayPath(path, root) {
  const rel = relative(root, path);
  return rel || basename(path);
}

function unique(values) {
  return [...new Set(values)];
}
