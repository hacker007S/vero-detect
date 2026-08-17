import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');

const common = {
  bundle: true, target: 'chrome110', logLevel: 'info',
  loader: { '.png': 'dataurl' },
};
await build({ ...common, entryPoints: ['src/content/main.ts'], outfile: 'dist/content.js', format: 'iife' });
await build({ ...common, entryPoints: ['src/worker/index.ts'], outfile: 'dist/worker.js', format: 'esm' });
await build({ ...common, entryPoints: ['src/options/options.ts'], outfile: 'dist/options.js', format: 'iife' });
cpSync('public/manifest.json', 'dist/manifest.json');
cpSync('public/icons', 'dist/icons', { recursive: true });
cpSync('src/options/options.html', 'dist/options.html');
console.log('✔ dist/ built');
