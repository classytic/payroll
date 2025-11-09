# NPM Publishing & Contribution Guide

## Publishing Workflow

### 1. Make Changes in Payroll Repo
```bash
# Make your code changes
# Test thoroughly
npm test  # If you have tests
```

### 2. Update Version
Choose the appropriate version bump:

```bash
# For bug fixes (1.0.0 → 1.0.1)
npm version patch

# For new features (1.0.0 → 1.1.0)
npm version minor

# For breaking changes (1.0.0 → 2.0.0)
npm version major
```

**Note:** `npm version` automatically creates a git commit and tag.

### 3. Push to GitHub
```bash
# Push code and tags
git push && git push --tags
```

### 4. Publish to NPM

#### First-time setup:
```bash
# Login to npm (one-time)
npm login

# Verify you're logged in
npm whoami
```

#### Publish:
```bash
# For scoped packages (@classytic/payroll)
npm publish --access public

# Verify package is published
npm view @classytic/payroll
```

### 5. Update in Your Projects (e.g., fitverse-be)
```bash
# In your project directory
npm update @classytic/payroll

# Or install specific version
npm install @classytic/payroll@latest

# Or with version number
npm install @classytic/payroll@1.2.3
```

---

## Quick Reference

```bash
# Development workflow
npm version patch          # Bug fixes
npm version minor          # New features
npm version major          # Breaking changes
git push && git push --tags
npm publish --access public

# In consuming projects
npm update @classytic/payroll
```

---

## Pre-publish Checklist

- [ ] All tests passing
- [ ] README.md updated
- [ ] CHANGELOG updated (if you maintain one)
- [ ] No sensitive data in code
- [ ] `.gitignore` properly configured
- [ ] Version bumped appropriately
- [ ] Git committed and tagged

---

## Semantic Versioning Guide

**MAJOR.MINOR.PATCH** (e.g., 2.3.1)

- **PATCH** (1.0.0 → 1.0.1): Bug fixes, no API changes
- **MINOR** (1.0.0 → 1.1.0): New features, backward compatible
- **MAJOR** (1.0.0 → 2.0.0): Breaking changes, not backward compatible

---

## Troubleshooting

### Package already published with this version
```bash
# You forgot to bump version
npm version patch
npm publish --access public
```

### Permission denied
```bash
# Make sure you're logged in
npm whoami
npm login
```

### Package not found after publish
```bash
# Wait 2-3 minutes for npm registry sync
# Or check package page
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

## Package Structure

```
@classytic/payroll/
├── src/
│   ├── index.js          # Main entry point
│   ├── init.js           # Initialization
│   ├── service.js        # Core service
│   ├── adapters/         # Payment/integration adapters
│   ├── events/           # Event handlers
│   ├── workflows/        # Business workflows
│   └── schemas/          # Database schemas
├── package.json
├── README.md
├── LICENSE
└── .gitignore
```

---

## Usage Example

```javascript
import { initializeHRM } from '@classytic/payroll';

// Initialize the HRM system
const hrm = initializeHRM({
  mongooseConnection: mongoose.connection,
  // ... other config
});

// Use exported services
import { paymentService } from '@classytic/payroll/service';
```

---

## License

MIT License - see [LICENSE](./LICENSE) file for details.
