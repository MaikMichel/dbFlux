# Repository Guidelines

## Project Structure & Module Organization

dbFlux is a TypeScript VS Code extension for Oracle Database and APEX workflows. Activation and command registration live in `src/extension.ts`. Feature code is split across `src/provider`, `src/wizards`, `src/stores`, `src/helper`, `src/templaters`, and `src/ui`. Tests are in `src/test/suite` and compile to `out/test`. Runtime shell, SQL, and HTML assets are in `dist`; snippets are in `snippets/snippets.json`; docs and screenshots are in `README.md`, `CHANGELOG.md`, and `images`.

## Architecture Notes

Most functionality is exposed as VS Code tasks of type `dbFlux`. Providers extend `AbstractBashTaskProvider`, call scripts in `dist/shell`, and pass `DBFLOW_*` environment variables. Project mode is resolved at startup: `dbFlux` uses VS Code `workspaceState` and `secrets`; `dbFlow` is detected from `build.env`. Schema resolution is path-sensitive: `db/_setup` uses the admin user, while `db/<schema>/...` targets that schema.

## Build, Test, and Development Commands

- `npm install`: install dependencies from `package-lock.json`.
- `npm run compile` / `npm run watch`: compile TypeScript into `out`; F5 uses the watch task for the extension host.
- `npm run esbuild` / `npm run esbuild-watch`: bundle `src/extension.ts`.
- `npm run lint` / `npm run lint:fix`: check or auto-fix ESLint issues in `src`.
- `npm test`: run `pretest` first, then VS Code extension tests via `out/test/runTest.js`.
- `npm run vscode:prepublish`: create the minified marketplace bundle.

## Coding Style & Naming Conventions

Use TypeScript with `strict` compiler settings and CommonJS output. Follow the existing tab-indented style and preserve nearby formatting. Name classes and providers in PascalCase, for example `CompileTaskProvider`; use camelCase for variables, functions, and methods. Keep command IDs under `dbFlux` or `dbflux`. ESLint is in `eslint.config.mjs`; unused variables are errors unless arguments start with `_`.

## Testing Guidelines

Tests use Mocha with the TDD interface, Node `assert`, and `@vscode/test-electron`. Add tests under `src/test/suite` with the `*.test.ts` suffix. Prefer focused tests around providers, helpers, and command behavior. Run `npm test` before a pull request.

## Commit & Pull Request Guidelines

Recent history follows short Conventional Commit-style subjects such as `feat(rest): ...`, `fix(shell): ...`, and `refactor: ...`. Use an imperative summary and add a scope when helpful. Do not create commits unless explicitly asked. Pull requests should describe the change, list verification commands, link issues, and include screenshots for UI, wizard, or tree view changes.

## Security & Configuration Tips

Do not commit Oracle credentials, generated environment files with secrets, local VS Code state, or `user.dbFlux.config.json`. Connection secrets may live in the VS Code secrets API, including keys like `dbFlux_[SCHEMA]_PWD`. Treat `dist/shell` and `dist/templates` changes carefully because they affect generated behavior and database execution paths.
