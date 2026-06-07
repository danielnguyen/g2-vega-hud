import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

const packageJsonPath = path.resolve(process.cwd(), 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version: string };

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version)
  },
  server: {
    host: '0.0.0.0',
    port: 5173
  }
});
