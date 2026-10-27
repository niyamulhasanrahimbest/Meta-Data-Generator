import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const dirs = ['electron', 'electron/bin', 'dist', 'release'];

for (const dir of dirs) {
  const target = path.join(rootDir, dir);
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
}

console.log('[Meta Data Generator] Post-install setup completed successfully.');
