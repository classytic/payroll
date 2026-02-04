#!/usr/bin/env node
/**
 * Pre-publish Export Verification
 *
 * Tests that all package exports work correctly before publishing.
 * Run with: node scripts/test-exports.mjs
 */

const errors = [];

async function testExport(name, importFn) {
  try {
    await importFn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}: ${err.message}`);
    errors.push({ name, error: err.message });
  }
}

console.log('Testing package exports...\n');

// Main entry point
await testExport('Main exports (./dist/index.js)', async () => {
  const mod = await import('../dist/index.js');
  const required = [
    'createPayrollInstance',
    'createEmployeeSchema',
    'createPayrollRecordSchema',
    'employeePlugin',
  ];
  for (const exp of required) {
    if (typeof mod[exp] !== 'function') {
      throw new Error(`Missing or invalid export: ${exp}`);
    }
  }
});

// Schemas
await testExport('Schemas (./dist/schemas/index.js)', async () => {
  const mod = await import('../dist/schemas/index.js');
  const required = ['createEmployeeSchema', 'createPayrollRecordSchema'];
  for (const exp of required) {
    if (typeof mod[exp] !== 'function') {
      throw new Error(`Missing or invalid export: ${exp}`);
    }
  }
});

// Calculators
await testExport('Calculators (./dist/calculators/index.js)', async () => {
  const mod = await import('../dist/calculators/index.js');
  const required = [
    'calculateSalaryBreakdown',
    'calculateProRating',
    'calculateAttendanceDeduction',
  ];
  for (const exp of required) {
    if (typeof mod[exp] !== 'function') {
      throw new Error(`Missing or invalid export: ${exp}`);
    }
  }
});

// Utils
await testExport('Utils (./dist/utils/index.js)', async () => {
  const mod = await import('../dist/utils/index.js');
  const required = ['getLogger', 'roundMoney', 'findEmployeeSecure'];
  for (const exp of required) {
    if (typeof mod[exp] !== 'function') {
      throw new Error(`Missing or invalid export: ${exp}`);
    }
  }
});

// Check for CommonJS require() issues (ESM compatibility)
await testExport('No require() in bundle', async () => {
  const fs = await import('fs');
  const indexContent = fs.readFileSync('./dist/index.js', 'utf8');
  if (indexContent.includes('require(')) {
    throw new Error('Found require() in ESM bundle - will break in ESM apps');
  }
});

// Summary
console.log('\n' + '='.repeat(50));
if (errors.length === 0) {
  console.log('✓ All exports verified successfully!');
  console.log('  Safe to publish.');
  process.exit(0);
} else {
  console.error(`✗ ${errors.length} export(s) failed:`);
  errors.forEach(({ name, error }) => console.error(`  - ${name}: ${error}`));
  console.error('\n  DO NOT PUBLISH until issues are fixed.');
  process.exit(1);
}
