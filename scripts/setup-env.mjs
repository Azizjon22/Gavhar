#!/usr/bin/env node
// .env.example dan .env yaratadi: {{hex:NOM:BAYT}} belgilarini tasodifiy
// qiymat bilan almashtiradi. Bir xil NOM har doim bir xil qiymat oladi.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const examplePath = resolve(root, '.env.example');
const envPath = resolve(root, '.env');

if (existsSync(envPath) && !process.argv.includes('--force')) {
  console.error('.env allaqachon mavjud. Qayta yaratish uchun: pnpm setup:env --force');
  process.exit(1);
}

const generated = new Map();
const content = readFileSync(examplePath, 'utf8').replace(
  /\{\{hex:([a-z0-9_-]+):(\d+)\}\}/gi,
  (_match, name, bytes) => {
    if (!generated.has(name)) {
      generated.set(name, randomBytes(Number(bytes)).toString('hex'));
    }
    return generated.get(name);
  },
);

writeFileSync(envPath, content, { mode: 0o600 });
console.log(`.env yaratildi (${generated.size} ta sir generatsiya qilindi).`);
