# Publishing Guide

## NPM Package (`packx`)

The package is published to npm as `packx` and can be installed globally:

```bash
npm install -g packx
```

## Automated Release Process

We use npm scripts to automate versioning, building, and publishing:

### Quick Release Commands

```bash
# For bug fixes (1.0.0 -> 1.0.1)
npm run release:patch

# For new features (1.0.0 -> 1.1.0)
npm run release:minor

# For breaking changes (1.0.0 -> 2.0.0)
npm run release:major
```

These commands will automatically:
1. Bump the version in `package.json`
2. Update the version in source code
3. Build the distribution files
4. Publish to npm
5. Push changes to GitHub
6. Create and push git tags

### Manual Process (if needed)

1. **Update version**
   ```bash
   npm version patch  # or minor/major
   ```

2. **Build and publish**
   ```bash
   npm publish
   ```

3. **Push to GitHub**
   ```bash
   git push && git push --tags
   ```

## Pre-release Checklist

- [ ] All tests pass
- [ ] README is up to date
- [ ] CHANGELOG is updated (if maintaining one)
- [ ] No sensitive information in code
- [ ] Version number makes sense

## Version Numbering

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.0.0 -> 2.0.0): Breaking changes
- **MINOR** (1.0.0 -> 1.1.0): New features, backwards compatible
- **PATCH** (1.0.0 -> 1.0.1): Bug fixes, backwards compatible

## What Gets Published

The `.npmignore` file controls what's included in the npm package:

### Included
- `dist/` - Compiled JavaScript
- `package.json` - Package metadata
- `README.md` - Documentation

### Excluded
- Source TypeScript files
- Config files
- Binary builds
- Example files
- Development dependencies

## Troubleshooting

### "Cannot publish over previously published version"

This means the version already exists on npm. Bump the version:

```bash
npm version patch
npm publish
```

### Build Issues

Make sure to build before publishing:

```bash
npm run build
npm publish
```

### Authentication Issues

Login to npm if needed:

```bash
npm login
```

## Platform Compatibility

The npm package works on:
- ✅ macOS (Intel & Apple Silicon)
- ✅ Linux (x64 & ARM)
- ✅ Windows (with Node.js)

Requirements:
- Node.js 18 or higher
- npm, yarn, or pnpm

## Binary Builds

For standalone executables (without Node.js), use:

```bash
# Current platform
npm run compile

# Specific platforms
npm run compile:macos
npm run compile:macos-arm
npm run compile:linux
npm run compile:windows

# All platforms
npm run compile:all
```

Binary files are in the `bin/` directory but are NOT published to npm (too large).