# Repository Guidelines

## Project Structure & Module Organization
- `src/`: TypeScript CLI entry (`src/index.ts`) and core logic.
- `dist/`: Transpiled ESM output (`dist/index.js`). Published as the npm CLI.
- `bin/`: Native, single-file builds produced by Bun compile (e.g., `bin/pack`).
- `scripts/`: Release helpers (e.g., `scripts/update-version.js`).
- Root files: `package.json` (ESM, Bun engine), `tsconfig.json` (strict), `README.md`.

## Build, Test, and Development Commands
- `bun install`: Install dependencies.
- `npm run dev`: Run the CLI from source and show help.
- `npm run build`: Bundle to `dist/` via Bun.
- `bun run compile`: Create a native binary in `bin/pack`.
- `bun run compile:all`: Cross-compile binaries for common platforms.
- Release: `npm run release:{patch|minor|major}` (bumps version, publishes, pushes tags).
Examples:
```
bun run src/index.ts --help
node dist/index.js --help
./bin/pack --help
```

## Coding Style & Naming Conventions
- Language: TypeScript (ES2022, ESM). `tsconfig.json` has `strict: true`.
- Indentation: 2 spaces; prefer explicit types and early returns.
- Naming: lowerCamelCase for variables/functions; PascalCase for types; keep CLI flags short+long (`-s`, `--strings`).
- Files: `*.ts` in `src/`; avoid adding new top-level entry points.

## Testing Guidelines
- No formal unit test suite yet. Validate changes via CLI runs and preview mode:
```
bun run src/index.ts -s "TODO" --preview
```
- Add focused tests if introducing complex parsing: place under `src/` alongside the code or propose a `tests/` structure in your PR.
- Ensure large-repo behavior stays fast; try `--preview` and extension filters on a real project.

## Commit & Pull Request Guidelines
- Commit style: Conventional Commits (e.g., `feat(cli): …`, `fix(cli): …`, `chore(release): …`).
- PRs must include: concise description, rationale, before/after behavior, sample commands, and any docs/help updates.
- Link related issues and screenshots of CLI output when relevant.
- If you add/modify flags, update `src/index.ts` help text and `README.md`.

## Security & Configuration Tips
- Prereq: Bun ≥ 1.1.0. Do not commit `dist/` or compiled binaries.
- Respect `.gitignore` patterns; keep new globs safe and targeted.
- When changing output formats or defaults, consider token size and performance.

