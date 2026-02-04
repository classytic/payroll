import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/core/index.ts',
    'src/schemas/index.ts',
    'src/utils/index.ts',
    'src/calculators/index.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: true,
  bundle: true,
  sourcemap: true,
  treeshake: true,
  splitting: false,
  // Externalize all dependencies - let consuming app resolve them
  external: [
    'mongoose',
    'mongodb',  // mongoose's dependency - must not be bundled
    '@classytic/mongokit',
    '@classytic/shared-types',
    '@classytic/clockin',
    'lru-cache',
    'p-limit',
    // Node.js built-ins that mongodb uses
    'timers',
    'stream',
    'crypto',
    'dns',
    'events',
    'fs',
    'http',
    'https',
    'net',
    'os',
    'path',
    'tls',
    'url',
    'util',
    'zlib',
    'buffer',
  ],
  outDir: 'dist',
});

