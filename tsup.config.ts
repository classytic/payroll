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
  bundle: false,
  sourcemap: true,
  treeshake: true,
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

