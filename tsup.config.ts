import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/payroll.ts',
    'src/schemas/index.ts',
    'src/core/index.ts',
    'src/services/index.ts',
    'src/utils/index.ts',
    'src/calculators/index.ts',
    'src/shift-compliance/index.ts',
    'src/jurisdiction/index.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  treeshake: true,
  external: ['mongoose'],
  outDir: 'dist',
});

