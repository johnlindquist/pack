# [3.2.0](https://github.com/johnlindquist/pack/compare/v3.1.1...v3.2.0) (2025-12-05)


### Bug Fixes

* **ci:** add publishConfig and @semantic-release/npm for trusted publishing ([b8ebabc](https://github.com/johnlindquist/pack/commit/b8ebabc7e53282d8a80c80b6042ef41dc40ccfc0))
* **cli:** improve path normalization for hidden files and directories ([b13fc42](https://github.com/johnlindquist/pack/commit/b13fc42aba1194e100be35466d21423e48edda4a))


### Features

* **ci:** add GitHub Actions release workflow with npm trusted publishing ([3ee09be](https://github.com/johnlindquist/pack/commit/3ee09be04a965631f7ae2a946fb9bcf798908190))
* **cli:** add lockfile patterns to exclusion list for improved file handling\n\n- Added patterns for various lockfiles (e.g., package-lock.json, Gemfile.lock) to the exclusion list, as they are typically not useful for LLM context.\n- Ensures cleaner processing by ignoring unnecessary files. ([9a750b7](https://github.com/johnlindquist/pack/commit/9a750b70bf19f6ef58c4818317215c10fd5726c5))
