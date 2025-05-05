import fs from 'fs-extra';
import path from 'path';

const migrationsSrc = path.resolve(process.cwd(), '../migrations');
const migrationsDest = path.resolve(process.cwd(), 'dist/migrations');

if (fs.existsSync(migrationsSrc)) {
  fs.copySync(migrationsSrc, migrationsDest, { overwrite: true });
  console.log(`Copied migrations from ${migrationsSrc} to ${migrationsDest}`);
} else {
  console.warn(`Migrations folder not found at ${migrationsSrc}`);
}