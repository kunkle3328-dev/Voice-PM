import * as esbuild from 'esbuild';

esbuild.build({
  entryPoints: ['server.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/server.cjs',
  external: ['express', 'vite', 'ws', '@google/genai'],
  format: 'cjs',
}).catch(() => process.exit(1));
