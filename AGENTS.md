# Repository Guidelines

## Project Structure & Module Organization
- `src/`: TypeScript CLI entry (`src/index.ts`) and core logic.
- `dist/`: Transpiled ESM output (`dist/index.js`); published as the npm CLI.
- `bin/`: Native, single‑file builds from Bun compile (e.g., `bin/pack`).
- `scripts/`: Release helpers (e.g., `scripts/update-version.js`).
- Root: `package.json` (ESM, Bun engine), `tsconfig.json` (strict), `README.md`.
- Tests: place focused tests alongside code under `src/` or propose a `tests/` dir for larger suites.

## Build, Test, and Development Commands
- `bun install`: Install dependencies.
- `npm run dev`: Run the CLI from source and show help.
- `npm run build`: Bundle to `dist/` via Bun.
- `bun run compile`: Create a native binary in `bin/pack`.
- `bun run compile:all`: Cross‑compile binaries for common platforms.
- `npm run release:{patch|minor|major}`: Bump version, publish, and push tags.
Examples:
```
bun run src/index.ts --help
node dist/index.js --help
./bin/pack --help
```

## Coding Style & Naming Conventions
- Language: TypeScript (ES2022, ESM); `tsconfig.json` uses `strict: true`.
- Indentation: 2 spaces; prefer explicit types and early returns.
- Naming: lowerCamelCase for variables/functions; PascalCase for types; CLI flags use short+long (`-s`, `--strings`).
- Files: `*.ts` in `src/`; avoid adding new top‑level entry points.

## Testing Guidelines
- No formal unit tests yet; validate via CLI runs and `--preview`.
- Add focused tests for complex parsing under `src/` near the code; propose `tests/` if needed.
- Ensure large‑repo behavior stays fast; try `--preview` and extension filters on a real project.
Example:
```
bun run src/index.ts -s "TODO" --preview
```

## Commit & Pull Request Guidelines
- Commits: Conventional Commits (e.g., `feat(cli): …`, `fix(cli): …`, `chore(release): …`).
- PRs: include a concise description, rationale, before/after behavior, sample commands, and any docs/help updates.
- Link related issues and add screenshots of CLI output when relevant.
- If flags change, update `src/index.ts` help text and `README.md`.

## Security & Configuration Tips
- Require Bun ≥ 1.1.0.
- Do not commit `dist/` or compiled binaries; respect `.gitignore`.
- When changing defaults or output formats, consider token size and performance.

