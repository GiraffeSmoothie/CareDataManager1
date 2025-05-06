import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename); // Use import.meta.url to define __dirname in ES modules

const migrationsSrc = path.resolve(__dirname, 'migrations'); // Corrected path to avoid appending 'server' twice
const migrationsDest = path.resolve(process.cwd(), 'dist/migrations');

if (fs.existsSync(migrationsSrc)) {
  fs.copySync(migrationsSrc, migrationsDest, { overwrite: true });
  console.log(`Copied migrations from ${migrationsSrc} to ${migrationsDest}`);
} else {
  console.warn(`Migrations folder not found at ${migrationsSrc}`);
}