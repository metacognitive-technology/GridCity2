#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/version.ts');
const src = fs.readFileSync(file, 'utf8');
const match = src.match(/export const APP_VERSION = '([\d.]+)'/);
if (!match) {
  console.error('Could not find APP_VERSION in', file);
  process.exit(1);
}
// Minor is an integer (1.9 → 1.10 → 1.11), not a one-digit float.
const [major, minor = '0'] = match[1].split('.');
const next = `${major}.${Number(minor) + 1}`;
fs.writeFileSync(file, src.replace(match[0], `export const APP_VERSION = '${next}'`));
const label = Number.isInteger(Number(next)) ? `v${Number(next)}` : `v${next}`;
console.log(`APP_VERSION ${match[1]} → ${next} (${label})`);
