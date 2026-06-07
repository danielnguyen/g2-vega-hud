import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

async function main() {
  const rootDir = process.cwd();
  const manifestFiles = await findManifestFiles(rootDir);

  if (manifestFiles.length === 0) {
    throw new Error('No app manifest files found. Expected app.json and/or app.*.json.');
  }

  const packageData = await readPackageJson(rootDir);
  const packageVersion = packageData.version;
  const sourceVersion = parseVersion(packageVersion, 'package.json');
  const manifests = await Promise.all(manifestFiles.map((file) => readManifest(rootDir, file)));
  const mismatched = manifests.filter((manifest) => manifest.version !== packageVersion);

  if (mismatched.length > 0) {
    const details = [`package.json: ${packageVersion}`, ...manifests.map((manifest) => `${manifest.file}: ${manifest.version}`)].join(', ');
    throw new Error(`Version files differ before bumping. Align them first. ${details}`);
  }

  const nextVersion = `${sourceVersion.major}.${sourceVersion.minor}.${sourceVersion.patch + 1}`;
  await writePackageJson(rootDir, packageData, nextVersion);
  await updatePackageLock(rootDir, nextVersion);
  await Promise.all(manifests.map((manifest) => writeManifest(rootDir, manifest.file, manifest.data, nextVersion)));

  console.log(`Version bumped: ${packageVersion} -> ${nextVersion}`);
  console.log(`Synced package.json, package-lock.json, and ${manifestFiles.join(', ')}`);
}

async function findManifestFiles(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name === 'app.json' || /^app\..*\.json$/.test(name) || name === 'app.json.example')
    .sort((left, right) => {
      if (left === 'app.json') return -1;
      if (right === 'app.json') return 1;
      return left.localeCompare(right);
    });
}

async function readPackageJson(rootDir) {
  const fullPath = path.join(rootDir, 'package.json');
  const raw = await readFile(fullPath, 'utf8');
  const data = JSON.parse(raw);

  if (typeof data.version !== 'string') {
    throw new Error('package.json is missing a string version field.');
  }

  parseVersion(data.version, 'package.json');
  return data;
}

async function writePackageJson(rootDir, data, nextVersion) {
  const fullPath = path.join(rootDir, 'package.json');
  const nextData = { ...data, version: nextVersion };
  await writeFile(fullPath, `${JSON.stringify(nextData, null, 2)}\n`, 'utf8');
}

async function updatePackageLock(rootDir, nextVersion) {
  const lockPath = path.join(rootDir, 'package-lock.json');
  const raw = await readFile(lockPath, 'utf8');
  const data = JSON.parse(raw);

  if (typeof data.version !== 'string') {
    throw new Error('package-lock.json is missing a string version field.');
  }

  data.version = nextVersion;

  if (data.packages && data.packages['']) {
    data.packages[''].version = nextVersion;
  }

  await writeFile(lockPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function readManifest(rootDir, file) {
  const fullPath = path.join(rootDir, file);
  const raw = await readFile(fullPath, 'utf8');
  const data = JSON.parse(raw);

  if (typeof data.version !== 'string') {
    throw new Error(`${file} is missing a string version field.`);
  }

  parseVersion(data.version, file);
  return { file, version: data.version, data };
}

function parseVersion(version, file) {
  const match = SEMVER_RE.exec(version);
  if (!match) {
    throw new Error(`${file} version must use x.y.z format. Received: ${version}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

async function writeManifest(rootDir, file, data, nextVersion) {
  const fullPath = path.join(rootDir, file);
  const nextData = { ...data, version: nextVersion };
  await writeFile(fullPath, `${JSON.stringify(nextData, null, 2)}\n`, 'utf8');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
});
