## [4.15.1](https://github.com/johnlindquist/pack/compare/v4.15.0...v4.15.1) (2025-12-14)


### Bug Fixes

* exclude all dependencies from LLM bundle ([2b9ffd7](https://github.com/johnlindquist/pack/commit/2b9ffd78c01a8b4c00807b165097839f7b23ec83))

# [4.15.0](https://github.com/johnlindquist/pack/compare/v4.14.0...v4.15.0) (2025-12-14)


### Bug Fixes

* add missing dependencies for semantic search and Ink TUI ([40c8f3a](https://github.com/johnlindquist/pack/commit/40c8f3a8d50c632c1e62c13e4990ca6347fb4434))
* prevent workspace shorthand from being treated as glob pattern ([853ae1c](https://github.com/johnlindquist/pack/commit/853ae1c6e8a20ec8dbff45eec3b4a25a77a7bc63))


### Features

* add --skeleton mode for interface-only extraction ([6e9aa11](https://github.com/johnlindquist/pack/commit/6e9aa115266ea1b7ed2cbcbd84491673e42042a0))
* add automatic secret redaction for security ([9a02913](https://github.com/johnlindquist/pack/commit/9a029133ab3c98197d64073d088bf17f690b80e3)), closes [hi#entropy](https://github.com/hi/issues/entropy)
* add monorepo and workspace support ([5c196f2](https://github.com/johnlindquist/pack/commit/5c196f2216c43f1681896fc5333ce058cbe5af0c))
* add prompt template system for reusable instructions ([abafeb1](https://github.com/johnlindquist/pack/commit/abafeb18697d03214cdbc9d08c03b545e6e38880)), closes [#if](https://github.com/johnlindquist/pack/issues/if)
* add semantic search with local embeddings ([ebcebd0](https://github.com/johnlindquist/pack/commit/ebcebd0e2ad7d44a8b02cbf8a23d9ef7fc5ce60f))
* add visual dependency graph in interactive mode ([372150d](https://github.com/johnlindquist/pack/commit/372150d02c9289301a3595b240f250e34581ba38))
* migrate TUI to React Ink for better maintainability ([e469d06](https://github.com/johnlindquist/pack/commit/e469d060a038aec34714d77af67588e4b8b3ac01))

# [4.14.0](https://github.com/johnlindquist/pack/compare/v4.13.0...v4.14.0) (2025-12-12)


### Bug Fixes

* resolve tree-sitter.wasm path for global bun installs ([3bc9440](https://github.com/johnlindquist/pack/commit/3bc94401e5dbe9d5d77e9779d88a3b2e96a9211a))


### Features

* **ui:** add ? key for full-screen help overlay ([c62ea75](https://github.com/johnlindquist/pack/commit/c62ea75f887caa4d2141878c1aef449d32eb2638))

# [4.13.0](https://github.com/johnlindquist/pack/compare/v4.12.0...v4.13.0) (2025-12-12)


### Features

* add progress feedback during token counting ([628904e](https://github.com/johnlindquist/pack/commit/628904ee55febafc247e7dd4d2102f7ca3332163))

# [4.12.0](https://github.com/johnlindquist/pack/compare/v4.11.0...v4.12.0) (2025-12-12)


### Features

* collapse parent folder when pressing left on file ([9e7c311](https://github.com/johnlindquist/pack/commit/9e7c3116cdfdef6874165e81c246a913b1fa5941))

# [4.11.0](https://github.com/johnlindquist/pack/compare/v4.10.0...v4.11.0) (2025-12-12)


### Bug Fixes

* throttle scroll events to stop scrolling on key release ([82b4741](https://github.com/johnlindquist/pack/commit/82b47417fbd48b01c0f216ef95cdd61422a1d66c))


### Features

* add progress feedback during file scanning ([886b1ca](https://github.com/johnlindquist/pack/commit/886b1ca71b69046109546eee9817e11ed0583912))

# [4.10.0](https://github.com/johnlindquist/pack/compare/v4.9.1...v4.10.0) (2025-12-12)


### Bug Fixes

* reset loading state when preview debounce timer is cancelled ([270af1c](https://github.com/johnlindquist/pack/commit/270af1cbef07228ecb5728184d3a7a93dbfc7a30))


### Features

* add open in editor hotkey (o) ([afc2aa1](https://github.com/johnlindquist/pack/commit/afc2aa11faf4df3d11eefe5bfa103aaae46c3cc2))
* merge dependency resolution hotkey ([34699a2](https://github.com/johnlindquist/pack/commit/34699a218f9cc7a02c345a4be733b6dcfb81fdef))
* merge fuzzy search filtering ([f310e15](https://github.com/johnlindquist/pack/commit/f310e15d6edad4eb06bcf32c15b74f23fcf845b2))
* merge git status decorators ([ae2fe76](https://github.com/johnlindquist/pack/commit/ae2fe763fa40257d019ec18ad185f4f490c9af01))
* merge live context toggles ([5a196f5](https://github.com/johnlindquist/pack/commit/5a196f5dcb58ecc5e4912f655cfea72fe22676e5))
* merge quick banish to packignore ([b5ac957](https://github.com/johnlindquist/pack/commit/b5ac9574ffd1e523ec43e4e9c669be9baaae6568))
* merge syntax highlighting ([e2c9087](https://github.com/johnlindquist/pack/commit/e2c90876de0571bffe0a3f474883c258bf727288))
* merge token budget progress bar ([34f943e](https://github.com/johnlindquist/pack/commit/34f943ed1738e214a6fe437fe0fea475bbcd3b00))
* **ui:** add dependency resolution hotkey (d) ([658dd73](https://github.com/johnlindquist/pack/commit/658dd73949f8054bd4bdc7408afe349b517a04f2))
* **ui:** add fuzzy search filtering ([0f966fd](https://github.com/johnlindquist/pack/commit/0f966fdca00032bb0043eb0a216d118a00a81961))
* **ui:** add git status decorators [M]/[A]/[?] ([410214c](https://github.com/johnlindquist/pack/commit/410214cc414ab627a9e0a652d17cd3bcf20aee5d))
* **ui:** add live context/comment toggles (c, +/-) ([395e298](https://github.com/johnlindquist/pack/commit/395e298714e3c8378ceafddb7303faa26168df5d))
* **ui:** add quick banish to .packignore (x) ([596e562](https://github.com/johnlindquist/pack/commit/596e562bd27cd334c92dad3df73651c3cb572f77))
* **ui:** add range selection with shift+space and v anchor ([143e937](https://github.com/johnlindquist/pack/commit/143e9376545f9bcc79de05e5ffc811c9db1e847c))
* **ui:** add range selection with shift+space and v anchor ([889ba2c](https://github.com/johnlindquist/pack/commit/889ba2ce9543e3c45bcdf5c59cd613b7b612eb95))
* **ui:** add syntax highlighting to preview pane ([37a677a](https://github.com/johnlindquist/pack/commit/37a677a52ef4fbb9f7b9b4d5d02ef6f7e567daad))
* **ui:** add vim-style navigation (j/k/g/G/h/l) ([2083ecd](https://github.com/johnlindquist/pack/commit/2083ecda712cdc5be909d4fe42bb2126394080de))
* **ui:** add vim-style navigation (j/k/g/G/h/l) ([1b1a9b2](https://github.com/johnlindquist/pack/commit/1b1a9b296b09fc1212727c69c3336f82692a9ed9))
* **ui:** add visual token budget progress bar with --limit flag ([b6ae06b](https://github.com/johnlindquist/pack/commit/b6ae06b3b9b66fa577f4a14496ac645891a33307))

## [4.9.1](https://github.com/johnlindquist/pack/compare/v4.9.0...v4.9.1) (2025-12-12)


### Bug Fixes

* dynamically size tree list to keep filter line visible ([ff64e46](https://github.com/johnlindquist/pack/commit/ff64e466d13a58894097561eb433f50f1af897bc))
* hide cursor in interactive UI to prevent footer jiggle ([3e2345b](https://github.com/johnlindquist/pack/commit/3e2345b265482c3ffd53928653eb800d55ca1052))
* toggle selection works in filter mode ([56ef466](https://github.com/johnlindquist/pack/commit/56ef4661bf24c57e65e013c05435fea82d0bec6c))

# [4.9.0](https://github.com/johnlindquist/pack/compare/v4.8.1...v4.9.0) (2025-12-10)


### Features

* add --bundle/-b flag to load bundles non-interactively ([c5e3332](https://github.com/johnlindquist/pack/commit/c5e3332078381dbd8e37aec4d656939b1cdeccf3))

## [4.8.1](https://github.com/johnlindquist/pack/compare/v4.8.0...v4.8.1) (2025-12-10)


### Bug Fixes

* dynamically resize interactive UI on terminal resize ([8b691e1](https://github.com/johnlindquist/pack/commit/8b691e16a7a1cdcc005290ce2bfb5a04cbcc6abf))

# [4.8.0](https://github.com/johnlindquist/pack/compare/v4.7.1...v4.8.0) (2025-12-10)


### Features

* add named bundles for saving/loading file contexts ([d3b1054](https://github.com/johnlindquist/pack/commit/d3b1054e545111a852efcfa08383de2151de5ea0))

## [4.7.1](https://github.com/johnlindquist/pack/compare/v4.7.0...v4.7.1) (2025-12-10)


### Bug Fixes

* disable interactive mode when --stdout is used ([1bf2c81](https://github.com/johnlindquist/pack/commit/1bf2c81e1e0d3028f03eb749ba81b4caf6aba5ef))

# [4.7.0](https://github.com/johnlindquist/pack/compare/v4.6.2...v4.7.0) (2025-12-10)


### Features

* make interactive mode the default ([d47c53a](https://github.com/johnlindquist/pack/commit/d47c53ae8e54eb409054b5c95782529aac19ee3d))

## [4.6.2](https://github.com/johnlindquist/pack/compare/v4.6.1...v4.6.2) (2025-12-09)


### Performance Improvements

* skip redundant preview state updates during navigation ([f6c3306](https://github.com/johnlindquist/pack/commit/f6c3306cb58b5f6391b4a9c34c2c796f023a3199))

## [4.6.1](https://github.com/johnlindquist/pack/compare/v4.6.0...v4.6.1) (2025-12-09)


### Performance Improvements

* optimize interactive UI with memoization and async file I/O ([e42b584](https://github.com/johnlindquist/pack/commit/e42b584a7d9eb622cc3ee563eefde5053184af51))

# [4.6.0](https://github.com/johnlindquist/pack/compare/v4.5.0...v4.6.0) (2025-12-09)


### Features

* enhance interactive filter with cursor navigation and glob support ([35fa691](https://github.com/johnlindquist/pack/commit/35fa6911fefd7ed5a80266c6c2ec38f120655f97))

# [4.5.0](https://github.com/johnlindquist/pack/compare/v4.4.0...v4.5.0) (2025-12-09)


### Features

* replace INI config with .packignore-focused workflow ([208c164](https://github.com/johnlindquist/pack/commit/208c164646546a70df8dead6513de2d831039ff7))

# [4.4.0](https://github.com/johnlindquist/pack/compare/v4.3.0...v4.4.0) (2025-12-09)


### Bug Fixes

* handle oversized files in token-based chunking ([c0efd03](https://github.com/johnlindquist/pack/commit/c0efd03e9ad09e8467c0cee655b7351599f26132))
* Update git-project fixture for e2e tests ([ee59376](https://github.com/johnlindquist/pack/commit/ee5937699a6c8cd0e919d38f009b992c2ae0b3a0))


### Features

* add .packignore file support ([13f21fd](https://github.com/johnlindquist/pack/commit/13f21fdc269727d4aa3414914c9a5c396b4061f4))
* ensure cache portability with relative path keys ([161b4e5](https://github.com/johnlindquist/pack/commit/161b4e5667b4078058b94c073135060995b8b6a4))
* implement structured verbose error logging ([502240f](https://github.com/johnlindquist/pack/commit/502240f890f09ab3e1144023f2e89ba5f9762774))


### Performance Improvements

* stream child process output to prevent memory exhaustion ([e396743](https://github.com/johnlindquist/pack/commit/e396743a94f697504dae602483aae82c614e3519))

# [4.3.0](https://github.com/johnlindquist/pack/compare/v4.2.0...v4.3.0) (2025-12-09)


### Bug Fixes

* await async stripComments in formatFileAsJsonl ([47ee338](https://github.com/johnlindquist/pack/commit/47ee3382538ba931bced3e2a64e84bfceae2bdac))


### Features

* add --explain flag for dry run with detailed logging ([990d346](https://github.com/johnlindquist/pack/commit/990d346ee4e595f3b77e39cf7b8c457005ce1b8c))
* add --follow-imports flag for AST-based dependency discovery ([0131a66](https://github.com/johnlindquist/pack/commit/0131a6695b435821fa73012d4120bc9f77c2f98e))
* add --max-tokens flag for automatic output splitting ([1d575e5](https://github.com/johnlindquist/pack/commit/1d575e5aa91898596c2f4c525d7da4eaa2944c50))
* add content transformation hooks for redacting sensitive information ([c3a65e8](https://github.com/johnlindquist/pack/commit/c3a65e8e3d6770df09dc19172fefa676a7a734d3))
* add interactive preview pane for file content ([f216870](https://github.com/johnlindquist/pack/commit/f2168704e54a81543e63ade611502dab44f68a56))
* add JSONL output format (--format jsonl) ([0430936](https://github.com/johnlindquist/pack/commit/0430936134e30ea88705a7702a6da47bbbbf6614))
* add watch mode for live development ([36be182](https://github.com/johnlindquist/pack/commit/36be182b5365df30d2c3935165ecab3069bdb0f3))
* implement AST-based parsing for code analysis ([b64ccae](https://github.com/johnlindquist/pack/commit/b64ccae628df4f61c6258c1b85894cb5d006b59b))
* implement caching for faster iterative runs ([bbcc3b5](https://github.com/johnlindquist/pack/commit/bbcc3b506d05419238288db8d575404735aba0e1))
* integrate ripgrep for high-performance file search ([0f81746](https://github.com/johnlindquist/pack/commit/0f81746bf2204e563b9dfa3bfbc7c2319fc1f67b)), closes [hi#performance](https://github.com/hi/issues/performance)

# [4.2.0](https://github.com/johnlindquist/pack/compare/v4.1.0...v4.2.0) (2025-12-08)


### Features

* auto-load pack-config.ini when present ([99f57e0](https://github.com/johnlindquist/pack/commit/99f57e09421157bf043cbbc7d3eb2f32c84adae6))

# [4.1.0](https://github.com/johnlindquist/pack/compare/v4.0.0...v4.1.0) (2025-12-08)


### Features

* **interactive:** add search filter and sort by token count ([621e473](https://github.com/johnlindquist/pack/commit/621e473cf0e464986e821cf075f84d86ac89f510))

# [4.0.0](https://github.com/johnlindquist/pack/compare/v3.8.1...v4.0.0) (2025-12-08)


* feat!: remove repomix dependency, add native comment stripping and minification ([9f61ce7](https://github.com/johnlindquist/pack/commit/9f61ce7da05639bb430b77e7e196544545041c7d))


### BREAKING CHANGES

* repomix is no longer a dependency. Pack now handles all
processing natively.

- Add src/processing.ts with stripComments() and minify() functions
- Add --strip-comments, --no-comments, --minify CLI flags
- Redesign CLI help with grouped flag categories
- Remove buildRepomixPassthroughArgs (no longer needed)
- Update version to 4.0.0

## [3.8.1](https://github.com/johnlindquist/pack/compare/v3.8.0...v3.8.1) (2025-12-08)


### Bug Fixes

* **config:** add [files] section support for explicit file selection ([5ae46c9](https://github.com/johnlindquist/pack/commit/5ae46c9addef328a3f663e250a68e362cbd2a0ce))

# [3.8.0](https://github.com/johnlindquist/pack/compare/v3.7.0...v3.8.0) (2025-12-08)


### Features

* **interactive:** prompt for .ini filename with pack-config.ini default ([2804a75](https://github.com/johnlindquist/pack/commit/2804a75adbfca3d0ef47e30e661b8f8d35106da2))

# [3.7.0](https://github.com/johnlindquist/pack/compare/v3.6.0...v3.7.0) (2025-12-08)


### Features

* **interactive:** add file tree view with folder/extension toggling ([df399f2](https://github.com/johnlindquist/pack/commit/df399f2122f0adafec923990ec7d9b810f6963ee))

# [3.6.0](https://github.com/johnlindquist/pack/compare/v3.5.0...v3.6.0) (2025-12-08)


### Features

* **interactive:** add token counts, sorting, running total, and .ini config save ([f93a117](https://github.com/johnlindquist/pack/commit/f93a11780eec6dabae9e83b4b5d30b2cddb94d86))

# [3.5.0](https://github.com/johnlindquist/pack/compare/v3.4.0...v3.5.0) (2025-12-07)


### Features

* major improvements for performance, accuracy, and maintainability ([c8e291c](https://github.com/johnlindquist/pack/commit/c8e291c63541e022824efefaefb6b65a259934bb)), closes [#1](https://github.com/johnlindquist/pack/issues/1)

# [3.4.0](https://github.com/johnlindquist/pack/compare/v3.3.0...v3.4.0) (2025-12-05)


### Features

* add git-aware context, interactive selection, and related files discovery ([4d4525d](https://github.com/johnlindquist/pack/commit/4d4525d33ab134c5c7e66994ca568a7a9eae23c1))

# [3.3.0](https://github.com/johnlindquist/pack/compare/v3.2.0...v3.3.0) (2025-12-05)


### Bug Fixes

* **repo:** remove unused files and update dependencies ([f662a5c](https://github.com/johnlindquist/pack/commit/f662a5c4605e45e9219fdbef7c4db64ad5178211))


### Features

* **core:** extract core logic to separate module with tests ([01b9763](https://github.com/johnlindquist/pack/commit/01b976311b8610f60cf03f699245f84aac1ccda6))

# [3.2.0](https://github.com/johnlindquist/pack/compare/v3.1.1...v3.2.0) (2025-12-05)


### Bug Fixes

* **ci:** add publishConfig and @semantic-release/npm for trusted publishing ([b8ebabc](https://github.com/johnlindquist/pack/commit/b8ebabc7e53282d8a80c80b6042ef41dc40ccfc0))
* **cli:** improve path normalization for hidden files and directories ([b13fc42](https://github.com/johnlindquist/pack/commit/b13fc42aba1194e100be35466d21423e48edda4a))


### Features

* **ci:** add GitHub Actions release workflow with npm trusted publishing ([3ee09be](https://github.com/johnlindquist/pack/commit/3ee09be04a965631f7ae2a946fb9bcf798908190))
* **cli:** add lockfile patterns to exclusion list for improved file handling\n\n- Added patterns for various lockfiles (e.g., package-lock.json, Gemfile.lock) to the exclusion list, as they are typically not useful for LLM context.\n- Ensures cleaner processing by ignoring unnecessary files. ([9a750b7](https://github.com/johnlindquist/pack/commit/9a750b70bf19f6ef58c4818317215c10fd5726c5))
