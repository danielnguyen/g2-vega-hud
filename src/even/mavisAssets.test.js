import { it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ImageRawDataUpdate } from '@evenrealities/even_hub_sdk';
import { mavisBytes } from '../mavis';

it('preserves every supplied PNG hash and packages matching 80px PNG payloads', () => {
  const hashes = JSON.parse(readFileSync('public/mavis/sha256.json', 'utf8'));
  expect(Object.keys(hashes)).toHaveLength(10);
  for (const [name, hash] of Object.entries(hashes)) {
    const master = readFileSync(`public/mavis/${name}`);
    expect(createHash('sha256').update(master).digest('hex')).toBe(hash);
    expect([master.readUInt32BE(16), master.readUInt32BE(20), master[24], master[25]]).toEqual([96, 96, 4, 3]);
    const bytes = mavisBytes(name.replace('.png', ''));
    expect(Buffer.from(bytes)).toEqual(readFileSync(`src/assets/mavis/${name}`));
    expect(Buffer.from(bytes).readUInt32BE(16)).toBe(80);
    expect(Buffer.from(bytes).readUInt32BE(20)).toBe(80);
    expect(ImageRawDataUpdate.toJson({ containerID: 4, containerName: 'mavis', imageData: bytes })).toEqual({
      containerID: 4, containerName: 'mavis', imageData: bytes
    });
  }
});
