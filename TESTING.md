# Testing Guide for Packx

## Manual Testing Checklist

### Basic Functionality
- [ ] `packx --help` displays help
- [ ] `packx --version` shows version
- [ ] `packx init` creates default config
- [ ] `packx init my-config` creates named config

### Search Modes
- [ ] `-s "string"` single search works
- [ ] `-s "string1" -s "string2"` multiple searches work
- [ ] `-f config.ini` config file works
- [ ] Case-insensitive search by default
- [ ] `-C` flag enables case-sensitive search

### Concept Mode
- [ ] `packx concept "search terms"` runs without error
- [ ] Concept mode finds relevant files
- [ ] Concept mode extracts keywords
- [ ] Concept mode runs packx with extracted keywords

### Context Lines
- [ ] `-l 10` limits to 10 lines around matches
- [ ] Context windows merge when overlapping
- [ ] Line numbers display correctly

### Extensions
- [ ] Default (no `-e`) searches common code files
- [ ] `-e "ts,tsx"` filters by extensions
- [ ] `-x "d.ts"` excludes extensions

### Exclude Patterns
- [ ] Config file `[exclude]` section works
- [ ] Gitignore-style patterns work
- [ ] Directory exclusions work (`docs/`)
- [ ] Glob patterns work (`**/*.test.ts`)

### Output
- [ ] Default output to `packx-output.md`
- [ ] `-o custom.md` custom output works
- [ ] `--copy` copies to clipboard
- [ ] Summary statistics display correctly
- [ ] Top 10 files by size display
- [ ] Extensions list displays

## Test Commands

```bash
# Basic search
packx -s "TODO"

# Multiple strings
packx -s "console" -s "log" -e "js,ts"

# Context lines
packx -s "error" -l 20

# Case sensitive
packx -s "API" -C

# Exclude strings
packx -s "function" -S "test" -S "spec"

# Config file
echo "[search]
TODO
FIXME
[extensions]
ts
tsx
[exclude]
*.test.ts
docs/" > test.ini
packx -f test.ini

# Concept mode
packx concept "authentication user login"

# Preview mode
packx -s "import" --preview

# Copy to clipboard
packx -s "export" --copy
```

## Edge Cases to Test

1. **Empty results** - Search with no matches
2. **Large files** - Files over 10MB are skipped
3. **Binary files** - Should be ignored
4. **Special characters** - Search for `[`, `]`, `(`, `)`, etc.
5. **Unicode** - Search for emoji or non-ASCII
6. **Symlinks** - Should follow or ignore?
7. **Hidden files** - `.gitignore`, `.env`, etc.
8. **No extension files** - `Makefile`, `Dockerfile`

## Performance Testing

```bash
# Time a search in a large repo
time packx -s "function" -e "js,ts,tsx,jsx"

# Memory usage (use system monitor)
packx -s "class" -s "interface" -s "type" -e "ts"
```

## Regression Tests

After changes, verify:
1. Existing config files still work
2. CLI flag compatibility maintained
3. Output format unchanged
4. Repomix passthrough still works (if applicable)