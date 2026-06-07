# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run compile          # Compile TypeScript → out/
npm run watch            # Incremental TS compilation (default dev task)
npm run esbuild          # Bundle with esbuild + sourcemaps
npm run esbuild-watch    # Bundle in watch mode
npm run lint             # ESLint on src/
npm run lint:fix         # Auto-fix lint issues
npm run test             # Run Mocha tests (requires compile first)
npm run pretest          # compile + lint (runs automatically before test)
npm run vscode:prepublish # Minified bundle for VS Code marketplace
```

Press **F5** in VS Code to launch the extension host (uses the `watch` task automatically).

## Architecture

**dbFlux** is a VS Code extension for Oracle Database + APEX development. It works in two modes, detected at startup:

| Mode | Detection | Config storage |
|------|-----------|---------------|
| `dbFlux` | workspaceState has `dbFlux_mode` | VS Code `workspaceState` + `secrets` API |
| `dbFlow` | `build.env` present in workspace | `build.env` + `apply.env` files |

`getDBFlowMode(context)` in `AbstractBashTaskProvider.ts` determines the mode. `getProjectInfos(context)` returns an `IProjectInfos` object populated from the correct source. The `inDbFlowProject` VS Code context key gates most commands.

### Task Provider Pattern

All functionality is exposed as VS Code tasks of type `dbFlux`. Each feature has a provider that extends `AbstractBashTaskProvider`, builds a `ShellExecution` pointing to a shell script in `dist/shell/`, and passes configuration as `DBFLOW_*` environment variables.

Critical providers:
- `CompileTaskProvider` → `deploy.sh` or `rest_compile.sh` (PL/SQL compile / REST upload)
- `ExportTaskProvider` → `export_app.sh` (APEX export)
- `RestTaskProvider` → `export_rest.sh` (REST export)
- `TestTaskProvider` → `compile.sh` (utPLSQL)
- `GenerateDBFlowProjectProvider` → `create_dbflow.sh` (project scaffolding)

### Schema / Connection Resolution

The active schema is inferred from the **file path** of the current editor document. A file at `db/MYSCHEMA/sources/packages/foo.pkb` connects as the app user proxying into `MYSCHEMA`. Files under `db/_setup/` use the admin user. Custom per-schema passwords are stored in secrets as `dbFlux_[SCHEMA]_PWD`.

Connection modes:
- **SQLNET**: standard `user[schema]@tns` via `sqlplus`/`sqlcl`
- **REST**: OAuth-authenticated calls to ORDS; `REST_SQL_URL`, `REST_OAUTH_TOKEN_URL`, and `REST_OAUTH_BASIC_B64` are the key params

### Project Structure Modes

- **SINGLE**: one schema (`projectName`), owns everything
- **MULTI**: three schemas (`projectName_data`, `_logic`, `_app`), proxy user `projectName_depl`
- **FLEX**: schemas are folder names under `db/`; `apex/`, `static/`, `rest/` also contain schema subfolders

### Stores (Singleton session state)

`src/stores/` holds singletons that cache state across task invocations: selected schemas, APEX app IDs, and passwords. Passwords entered during a session are kept in `CompileTaskStore.appPwd` / `adminPwd` until explicitly reset via `dbFlux.resetPassword`.

### Wizards

`src/wizards/` uses `MultiStepInput` (wrapping VS Code `createQuickPick`/`createInputBox`) for sequential input collection. `InitializeProjectWizard.ts` handles dbFlux project setup; `InitializeDBFlowProjectWizard.ts` produces wizard state that is passed as `wiz_*` env vars to `create_dbflow.sh`.

### Configuration

`ConfigurationManager` reads `dbFlux.*` settings from VS Code settings. Shell scripts receive these as env vars. Key setting groups: SQL CLI (`sqlplus` vs `sqlcl`), warning handling, REST compile timeouts, custom trigger runs (regex → additional SQL files to run), and minification flags.

### Shell Scripts

All business logic for DB interaction lives in `dist/shell/`. TypeScript providers are thin wrappers that set up the environment and launch the correct script. The scripts are bundled into the extension at publish time (not in `src/`).

## Key Files

| File | Purpose |
|------|---------|
| `src/extension.ts` | Activation, command registration (~60 commands), status bar |
| `src/provider/AbstractBashTaskProvider.ts` | `IProjectInfos`, connection logic, base task building |
| `src/provider/CompileTaskProvider.ts` | Most complex provider; handles both SQLNET and REST compile |
| `src/helper/ConfigurationManager.ts` | Typed accessors for all `dbFlux.*` settings |
| `src/helper/utilities.ts` | Path helpers, `getPassword()`, env file parsing |
| `src/wizards/InitializeProjectWizard.ts` | dbFlux project init; defines `dbFolderDef` folder structure |

## Testing

Tests use Mocha (TDD) + `@vscode/test-electron`. Test files live in `src/test/suite/`. Run tests with `npm test`; they launch an isolated VS Code instance.

## Conventions

**Never create commits** — the user commits manually.

Linting uses ESLint with `@typescript-eslint` rules (`.eslintrc.json`). Local overrides go in `user.dbFlux.config.json` (not committed).
