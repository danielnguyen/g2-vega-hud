import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

async function main() {
  const rootDir = process.cwd();
  const packageVersion = await readPackageVersion(rootDir);
  const manifestPath = path.join(rootDir, 'app.json');

  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new Error(
        'app.json is missing. Copy app.json.example to app.json and edit local values before packing.'
      );
    }
    throw error;
  }

  manifest.version = packageVersion;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Synced app.json version to package.json: ${packageVersion}`);
}

async function readPackageVersion(rootDir) {
  const packagePath = path.join(rootDir, 'package.json');
  const packageData = JSON.parse(await readFile(packagePath, 'utf8'));
  const version = packageData.version;

  if (typeof version !== 'string' || !SEMVER_RE.test(version)) {
    throw new Error(`package.json version must use x.y.z format. Received: ${String(version)}`);
  }

  return version;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
});
