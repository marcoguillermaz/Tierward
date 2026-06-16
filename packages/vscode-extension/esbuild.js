'use strict';

const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

const baseOptions = {
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  logLevel: 'info',
};

async function main() {
  // Extension entry. `vscode` is injected by the extension host, so it stays external.
  const extension = await esbuild.context({
    ...baseOptions,
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    external: ['vscode'],
  });

  // Backend entry, emitted standalone so the node:test suite can require it.
  // It imports no `vscode` API, which is exactly why it is unit-testable here.
  const backend = await esbuild.context({
    ...baseOptions,
    entryPoints: ['src/cdkBackend.ts'],
    outfile: 'dist/cdkBackend.js',
  });

  // Pure health/display logic, also vscode-free and emitted standalone for tests.
  const health = await esbuild.context({
    ...baseOptions,
    entryPoints: ['src/health.ts'],
    outfile: 'dist/health.js',
  });

  // Pure diagnostic-spec builder + check→file map, vscode-free, standalone for tests.
  const diagnostics = await esbuild.context({
    ...baseOptions,
    entryPoints: ['src/diagnostics.ts'],
    outfile: 'dist/diagnostics.js',
  });

  if (watch) {
    await Promise.all([
      extension.watch(),
      backend.watch(),
      health.watch(),
      diagnostics.watch(),
    ]);
    console.log('[esbuild] watching…');
    return;
  }

  await extension.rebuild();
  await backend.rebuild();
  await health.rebuild();
  await diagnostics.rebuild();
  await extension.dispose();
  await backend.dispose();
  await health.dispose();
  await diagnostics.dispose();
  console.log('[esbuild] build complete');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
