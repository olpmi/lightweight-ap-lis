import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptsDir, '..');
const sourceDir = path.join(packageRoot, 'src', 'templates', 'assets');
const outputDir = path.join(packageRoot, 'dist', 'templates', 'assets');

if (!existsSync(sourceDir)) {
  console.warn(`[copy-templates] Source directory not found: ${sourceDir}`);
  process.exit(0);
}

rmSync(outputDir, { force: true, recursive: true });
mkdirSync(path.dirname(outputDir), { recursive: true });
cpSync(sourceDir, outputDir, { recursive: true });

console.log(`[copy-templates] Copied template assets to ${outputDir}`);