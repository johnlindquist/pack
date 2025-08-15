#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Read package.json to get current version
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const version = packageJson.version;

// Update version in src/index.ts
const indexPath = join(rootDir, 'src', 'index.ts');
let indexContent = readFileSync(indexPath, 'utf8');

// Replace version in console.log statement
indexContent = indexContent.replace(
  /console\.log\("packx v[\d.]+"\);/,
  `console.log("packx v${version}");`
);

writeFileSync(indexPath, indexContent);

console.log(`✅ Updated version to ${version} in source code`);