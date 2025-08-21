# Repository Guidelines

## Project Structure & Module Organization
- `src/`: TypeScript source (CLI entry: `src/index.ts`, concept mode: `src/concept.ts`).
- `dist/`: ESM build output used by the npm bin (`packx`, `pack`).
- `bin/`: Compiled standalone binaries (via Bun `--compile`).
- `scripts/`: Utility scripts (e.g., `scripts/update-version.js`).
- Root config: `tsconfig.json`, `.npmignore`, `.gitignore`.
- Docs: `README.md`, `TESTING.md`, `PUBLISHING.md`.

## Build, Test, and Development Commands
- Install deps: `bun install`
- Build ESM: `npm run build` (outputs to `dist/`).
- Dev help locally: `npm run dev` (runs `src/index.ts --help`).
- Compile binary: `npm run compile` (current platform) or platform-specific `compile:*`.
- Release: `npm run release:patch|minor|major` (bumps version, builds, publishes, pushes tags).
- Version sync: `npm run update-version-in-code` (updates version string in `src/index.ts`).

## Coding Style & Naming Conventions
- Language: TypeScript (ESM). Prefer 2-space indentation, explicit types for public APIs.
- Filenames: kebab- or lowerCamel for non-CLI assets; `.ts` for sources; config examples as `*.ini`/`*.txt`.
- CLI flags: short and long forms mirrored in code (see `Argv` in `src/index.ts`).
- Formatting/Linting: none enforced; match existing style and keep changes minimal.

## Testing Guidelines
- No automated test suite; use `TESTING.md` manual checklist.
- Common smoke tests:
  - `packx --help`, `packx --version`
  - `packx init sample` then inspect created file
  - `packx -s "TODO" --preview` and with output: `-o out.md`
  - Concept mode: `packx concept "error handling"`
- Include example commands and resulting snippets in PR descriptions when altering behavior.

## Commit & Pull Request Guidelines
- Commit style: Conventional Commits (observed: `feat:`, `fix:`, `chore:`). Use `docs:`, `refactor:`, `perf:` as appropriate.
- Scope clearly (e.g., `feat(cli): add --preview`). Keep commits focused.
- PRs must include: concise description, rationale, before/after behavior, example commands, and any breaking-change notes. Link related issues.

## Security & Configuration Tips
- Do not commit secrets or large artifacts; `.gitignore` and `.npmignore` already exclude most.
- Prefer adding examples under docs rather than checked-in datasets.
- Validate path/glob handling and respect ignore patterns when adding features.
