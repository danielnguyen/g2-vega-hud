import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;
const APP_VERSION_RE = /^export const APP_VERSION = 'VEGA HUD v\d+\.\d+';$/m;

async function main() {
  const rootDir = process.cwd();
  const manifestFiles = await findManifestFiles(rootDir);

  if (manifestFiles.length === 0) {
    throw new Error('No app manifest files found. Expected app.json and/or app.*.json.');
  }

  const manifests = await Promise.all(manifestFiles.map((file) => readManifest(rootDir, file)));
  const sourceManifest = manifests.find((manifest) => manifest.file === 'app.json') ?? manifests[0];
  const sourceVersion = parseVersion(sourceManifest.version, sourceManifest.file);
  const mismatched = manifests.filter((manifest) => manifest.version !== sourceManifest.version);

  if (mismatched.length > 0) {
    const details = manifests.map((manifest) => `${manifest.file}: ${manifest.version}`).join(', ');
    throw new Error(`App manifest versions differ before bumping. Align them first. ${details}`);
  }

  const nextVersion = `${sourceVersion.major}.${sourceVersion.minor}.${sourceVersion.patch + 1}`;
  const nextAppVersionLine = buildAppVersionLine(sourceVersion.major, sourceVersion.minor);
  await assertConstantsLine(rootDir);
  await Promise.all(manifests.map((manifest) => writeManifest(rootDir, manifest.file, manifest.data, nextVersion)));
  await updateConstants(rootDir, nextAppVersionLine);

  console.log(`Even Hub manifest version bumped: ${sourceManifest.version} -> ${nextVersion}`);
  console.log(`APP_VERSION synced to VEGA HUD v${sourceVersion.major}.${sourceVersion.minor}`);
}

async function findManifestFiles(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name === 'app.json' || /^app\..*\.json$/.test(name) || name === 'app.json.example')
    .sort((left, right) => {
      if (left === 'app.json') return -1;
      if (right === 'app.json') return 1;
      return left.localeCompare(right);
    });

  return [...new Set(files)];
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

function buildAppVersionLine(major, minor) {
  return `export const APP_VERSION = 'VEGA HUD v${major}.${minor}';`;
}

async function assertConstantsLine(rootDir) {
  const constantsPath = path.join(rootDir, 'src', 'constants.ts');
  const raw = await readFile(constantsPath, 'utf8');

  if (!APP_VERSION_RE.test(raw)) {
    throw new Error(`Expected APP_VERSION export not found in ${constantsPath}.`);
  }
}

async function updateConstants(rootDir, nextLine) {
  const constantsPath = path.join(rootDir, 'src', 'constants.ts');
  const raw = await readFile(constantsPath, 'utf8');
  const nextRaw = raw.replace(APP_VERSION_RE, nextLine);
  await writeFile(constantsPath, nextRaw, 'utf8');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
});
