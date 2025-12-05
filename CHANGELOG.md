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
