import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const DISABLE_ENV_KEY = 'VITE_DISABLE_ENV_CONFIG';

function sanitizedPackagedEnv(source) {
  const next = { ...source };
  for (const key of Object.keys(next)) {
    if (key.startsWith('VITE_')) {
      delete next[key];
    }
  }
  next[DISABLE_ENV_KEY] = '1';
  return next;
}

function assertSanitized(env) {
  const unexpected = Object.keys(env).filter(
    (key) => key.startsWith('VITE_') && key !== DISABLE_ENV_KEY
  );
  if (unexpected.length > 0) {
    throw new Error(`Packaged build environment still exposes VITE_* keys: ${unexpected.join(', ')}`);
  }
}

const packagedEnv = sanitizedPackagedEnv(process.env);
assertSanitized(packagedEnv);

const tscPath = fileURLToPath(import.meta.resolve('typescript/bin/tsc'));
const tsc = spawnSync(process.execPath, [tscPath], {
  cwd: process.cwd(),
  env: packagedEnv,
  stdio: 'inherit'
});

if (tsc.error) {
  throw tsc.error;
}
if (tsc.status !== 0) {
  process.exit(tsc.status ?? 1);
}

for (const key of Object.keys(process.env)) {
  if (key.startsWith('VITE_')) {
    delete process.env[key];
  }
}
process.env[DISABLE_ENV_KEY] = '1';
assertSanitized(process.env);

// Vite 6 supports envFile: false on the JS build API. This is stronger than
// changing envPrefix: packaged builds neither inherit ambient VITE_* values nor
// load local .env files at all. The one non-secret flag above remains available
// so application code compiles out its development env fallback.
await build({ envFile: false });
