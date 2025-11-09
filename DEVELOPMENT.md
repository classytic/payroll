# Development Guide

This guide explains how to develop and test the `@classytic/payroll` library locally.

---

## Method 1: Test Locally (Fastest)

Run examples directly in the library without installing anywhere:

```bash
# In the payroll directory
cd d:\projects\packages\payroll

# Run basic example
npm run example:basic

# Run mongoose example
npm run example:mongoose

# Or run directly
node test/examples/basic-usage.js
```

**When to use:** Quick tests while developing, no external project needed.

---

## Method 2: npm link (Recommended for Development)

Link the library to your project so changes reflect immediately without reinstalling.

### Step 1: Link the Library

```bash
# In the payroll library directory
cd d:\projects\packages\payroll
npm link
```

You should see:
```
added 1 package, and audited 1 package
found 0 vulnerabilities
```

### Step 2: Link to Your Project

```bash
# In your project directory (e.g., fitverse-be)
cd d:\path\to\your-project-be
npm link @classytic/payroll
```

You should see:
```
node_modules/@classytic/payroll -> ../../packages/payroll
```

### Step 3: Use in Your Project

```javascript
// In fitverse-be/src/app.js
import { paymentService } from '@classytic/payroll';

console.log('Payroll library loaded!', paymentService);
```

### Step 4: Make Changes & Test

```bash
# 1. Edit code in payroll library
# d:\projects\packages\payroll\src\index.js

# 2. Changes are IMMEDIATELY available in fitverse-be
# No need to reinstall!

# 3. Test in your project
cd d:\path\to\fitverse-be
npm start
```

### Unlink When Done

```bash
# In your project
cd d:\path\to\fitverse-be
npm unlink @classytic/payroll

# Reinstall from npm (after publishing)
npm install @classytic/payroll

# In the library (optional cleanup)
cd d:\projects\packages\payroll
npm unlink
```

---

## Method 3: Local Path Install

Install directly from the file system (requires reinstall after each change):

```bash
# In your project
cd d:\path\to\fitverse-be

# Install from local path
npm install d:\projects\packages\payroll

# Or relative path
npm install ../payroll
```

**After making changes:**
```bash
# Reinstall to see changes
npm install d:\projects\packages\payroll --force
```

**When to use:** Testing before publishing, or when npm link doesn't work.

---

## Comparison

| Method | Speed | Auto-Update | Best For |
|--------|-------|-------------|----------|
| **Local Test** | ⚡ Fastest | N/A | Quick library development |
| **npm link** | ⚡ Fast | ✅ Yes | Active development in both projects |
| **Local Install** | 🐌 Slow | ❌ No (manual reinstall) | Pre-publish testing |

---

## Common Issues & Solutions

### Issue: "Cannot find module '@classytic/payroll'"

**Solution:** Make sure you linked properly:
```bash
# Re-link the library
cd d:\projects\packages\payroll
npm link

# Re-link in project
cd d:\path\to\fitverse-be
npm link @classytic/payroll
```

### Issue: Changes not reflecting

**Solution 1:** Check if link is active:
```bash
# In your project
ls -la node_modules/@classytic/payroll
# Should show a symlink (->)
```

**Solution 2:** Restart your dev server:
```bash
# Stop and restart
npm start
```

### Issue: "Module not found" errors in linked package

**Solution:** Install dependencies in the library:
```bash
cd d:\projects\packages\payroll
npm install mongoose
```

### Issue: Want to use published version again

**Solution:** Unlink and reinstall:
```bash
cd d:\path\to\fitverse-be
npm unlink @classytic/payroll
npm install @classytic/payroll
```

---

## Development Workflow

### Daily Development:

```bash
# 1. Make changes in payroll library
cd d:\projects\packages\payroll
# Edit src/service.js

# 2. Test locally (optional)
npm run example:basic

# 3. Test in linked project (automatic)
cd d:\path\to\fitverse-be
npm start
# Changes are already there!

# 4. Commit when ready
git add .
git commit -m "Add new feature"
```

### Before Publishing:

```bash
# 1. Test examples
npm run example:basic
npm run example:mongoose

# 2. Update version
npm version patch

# 3. Push to GitHub
git push && git push --tags

# 4. Publish to npm
npm publish --access public

# 5. Update in projects
cd d:\path\to\fitverse-be
npm unlink @classytic/payroll  # Remove link
npm install @classytic/payroll@latest  # Use published version
```

---

## Quick Reference

```bash
# Link library (one-time setup)
cd payroll && npm link

# Use in project
cd fitverse-be && npm link @classytic/payroll

# Make changes (automatic update)
# Just edit files in payroll/src/*

# Unlink when done
cd fitverse-be && npm unlink @classytic/payroll
cd payroll && npm unlink

# Test library directly
npm run example:basic
```

---

## Tips

1. **Always use npm link** for active development
2. **Run local tests** before publishing
3. **Unlink before publishing** to test the real package
4. **Keep dependencies updated** in both library and projects
5. **Restart dev server** if changes don't reflect

---

## Need Help?

- Check [NPM_GUIDE.md](./NPM_GUIDE.md) for publishing workflow
- Check [test/README.md](./test/README.md) for available examples
- Run `npm run example:basic` to verify library is working
