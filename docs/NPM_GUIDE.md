# NPM Publishing & Contribution Guide

## Publishing Workflow

### 1. Make Changes

```bash
cd d:\projects\packages\payroll

# Edit TypeScript source in src/
# Run type check
npx tsc --noEmit

# Run tests
npm test

# Build
npm run build
```

### 2. Update Version

Choose the appropriate version bump:

```bash
# For bug fixes (2.0.0 → 2.0.1)
npm version patch

# For new features (2.0.0 → 2.1.0)
npm version minor

# For breaking changes (2.0.0 → 3.0.0)
npm version major
```

**Note:** `npm version` automatically creates a git commit and tag.

### 3. Push to GitHub

```bash
git push && git push --tags
```

### 4. Publish to NPM

#### First-time setup:

```bash
npm login
npm whoami  # Verify login
```

#### Publish:

```bash
npm publish --access public

# Verify
npm view @classytic/payroll
```

### 5. Update in Your Projects

```bash
npm update @classytic/payroll
# or
npm install @classytic/payroll@latest
```

---

## Quick Reference

```bash
# Development
npm run build              # Build library
npm test                   # Run tests
npx tsc --noEmit          # Type check

# Publish
npm version patch|minor|major
git push && git push --tags
npm publish --access public

# Update in projects
npm update @classytic/payroll
```

---

## Pre-publish Checklist

- [ ] TypeScript compiles (`npx tsc --noEmit`)
- [ ] All tests passing (`npm test`)
- [ ] Build succeeds (`npm run build`)
- [ ] README.md updated
- [ ] No sensitive data in code
- [ ] Version bumped appropriately
- [ ] Git committed and tagged

---

## Semantic Versioning Guide

**MAJOR.MINOR.PATCH** (e.g., 2.3.1)

- **PATCH** (2.0.0 → 2.0.1): Bug fixes, no API changes
- **MINOR** (2.0.0 → 2.1.0): New features, backward compatible
- **MAJOR** (2.0.0 → 3.0.0): Breaking changes, not backward compatible

---

## Package Structure

```
@classytic/payroll/
├── src/                    # TypeScript source
│   ├── index.ts           # Main exports
│   ├── payroll.ts         # Payroll class
│   ├── types.ts           # Type definitions
│   ├── enums.ts           # Constants
│   ├── config.ts          # Configuration
│   ├── core/              # Core modules
│   ├── schemas/           # Mongoose schemas
│   ├── factories/         # Data factories
│   ├── services/          # Service layer
│   ├── utils/             # Utilities
│   ├── errors/            # Error classes
│   ├── plugins/           # Mongoose plugins
│   └── models/            # Model definitions
├── dist/                   # Built output
│   ├── index.js           # ESM module
│   ├── index.d.ts         # Type declarations
│   └── ...
├── tests/                  # Test files
├── docs/                   # Documentation
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── vitest.config.ts
```

---

## Usage Example

```typescript
import { createPayrollInstance } from '@classytic/payroll';

// Initialize
const payroll = createPayrollInstance()
  .withModels({
    EmployeeModel,
    PayrollRecordModel,
    TransactionModel,
  })
  .withConfig({
    payroll: { defaultCurrency: 'USD' },
  })
  .build();

// Use
await payroll.hire({
  userId,
  organizationId,
  employment: { position: 'Engineer', department: 'Engineering' },
  compensation: { baseAmount: 80000 },
});
```

---

## Troubleshooting

### Package already published with this version

```bash
npm version patch
npm publish --access public
```

### Permission denied

```bash
npm whoami
npm login
```

### Package not found after publish

Wait 2-3 minutes for npm registry sync, then:

```bash
npm view @classytic/payroll
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## License

MIT License - see [LICENSE](./LICENSE) file for details.
