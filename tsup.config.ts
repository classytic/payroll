import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/schemas/index.ts',
    'src/utils/index.ts',
    'src/calculators/index.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: true,
  bundle: true, // Bundle dependencies into output files
  sourcemap: true,
  treeshake: true,
  splitting: false, // Disable code splitting for cleaner output
  external: [
    'mongoose',
    '@classytic/mongokit',
    '@classytic/shared-types',
    '@classytic/clockin',
    'lru-cache',
    'p-limit',
  ],
  outDir: 'dist',
});

