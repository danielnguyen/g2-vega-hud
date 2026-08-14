import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

const packageJsonPath = path.resolve(process.cwd(), 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version: string };
const packagedBuild = ['1', 'true'].includes((process.env.VITE_DISABLE_ENV_CONFIG ?? '').toLowerCase());

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version)
  },
  // Packaged builds must not expose VITE_* values at all, even if the
  // surrounding environment happens to contain them. Runtime gateway/auth
  // settings for packaged installs come from Even local storage instead.
  envDir: packagedBuild ? false : undefined,
  envPrefix: packagedBuild ? 'VEGA_PACKAGED_' : 'VITE_',
  server: {
    host: '0.0.0.0',
    port: 5173
  }
});
