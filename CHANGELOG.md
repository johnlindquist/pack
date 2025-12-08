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
