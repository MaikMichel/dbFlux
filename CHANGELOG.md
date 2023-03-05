# Change Log

## [4.4.0 - 2023-03-05]
- New: Add or define options in settings to call methods based on compiling file, save the output and run that generated file
- Fix: Output error or warning messages as one file due to a big in VSCode consering multiline-problem matcher
- Fix: Some refactoring using bash files

## [4.3.0 - 2023-01-23]
- New: Add option to compile all or just invalid objects
- New: Add command "Add .hook file"
- New: Add Command "Convert Project to dbFlow - Project"
- Fix: Set warning level prior compile point
- Fix: Schema assignment in create workspace and workspace user scripts #8
- Fix: Clear question of schema name with validiation to reflect that project name will be part of schemas #7
- Fix: Modified call to base64 to work with MacOS
- Fix: Add workaround to fix the wrong problem matcher interpretation

## [4.2.1 - 2022-11-21]
- New: Viewpanel to show locked files wehn using dbLock
- New: Option to export all Applications in folder
- Fix: Query to get static files to remove
- Fix: Build Connection String when single schema mode

## [4.1.0 - 2022-11-01]
- Feature: New Command "Run trigger for current File" to run defined Triggering Expression for current file without running the file itself
- Feature: New Commands "Run SQLcl / Run SQL+" to run your SQLcli in terminal panel
- Feature: New Command "Remove Static Application File (current)" to remove current APEX Application Static File from APEX Metadate itself

## [4.0.6 - 2022-10-24]
- Fix: Export static files and schema when SQLcl is prefered
- Fix: FK Constraint Snippet missing closing bracket
- Fix: Name of Deploymentuser and Schemauser on dbFlux Mode when Single ProjectType

## [4.0.0 - 2022-09-13]
- Feature: Add dbLock > Lock and unlock files like APEX Pagebuilder
- Feature: Add export Static Application Files to static folder
- Feature: Add support for obfuscated apply.env, when using dbFLow
- Refactor: Tuning Task creation
- Refactor: Change error output when exporting schema or static files
- Refactor: Remove VM options when using SQLcl
- Refactor: Add keywords to package.json
- Fix: Compile Schema won't show items in bin/trash
- Fix: Modified snippet to be more consistent


## [3.4.1 - 2022-07-15]
- Fix: Compile File on Windows vs MacOS

## [3.4.0 - 2022-07-14]
- Fix: Path Problem on Windows with upper or lower driveletter
- Fix: Blank Lines when splitting and joining table files
- Feature: Scan for dependent files will place the files in correct order like dbFlow does
- Feature: Add support or type spec and body (.tps, .tpb)
- Feature: Reveal REST Folder when GotoFolder is executed
- Feature: Export Schema or Object implemented

## [3.3.0 - 2022-05-23]
- Modified Command: "Goto Folder"
  - Now you can go to static and report folder, too
- Modified Command: "Compile File"
  - if your file is located outsite of (db, apex, static, rest) you are prompted to enter target schema
- New Command: "Scan for dependent files"
  - When you run that command (you have to focus on a table-file) dbFlux will scan your constraint, indexes and trigger folders for files that contain the tablename and place a corresponding split command to that tablescript.

## [3.2.1 - 2022-05-16]
- New Command: "Goto folder" `Ctr+Atl+g`
  - Pick a folder and reveal it in explorer pane
- New Command: "Create TableDDL File" `Ctrl+Alt+d`
  - Create a DDL File based on changes of the picked table script


## [3.1.2 - 2022-04-26]
- Some BugFixes
- Match handling of project mode (SINGLE|MULTI|FLEX) like dbFLow

## [3.1.1 - 2022-04-07]
- Reuse WebView when displaying output of utPLSQL Unit Tests

## [3.1.0 - 2022-03-25]
- Ask for schema, when executing a *.sql file inside reports folder
- Exclude .setup (xcl Setup Folder) from target schemas like _setup
- Fix Error when splitting a file none existent folders
- Fix Error on MacOs when zsh is parsing parameters
- You can now execute hook files (filename nust reflect a schema inside db folder)
- You can now execute files inside _setup folder as configured admin user
- When creating objects all possible folders are displayes (the don't have to exist at this moment)
- You can now define logger command or dbms_output to wrap with your current selection by hitting ctrl+alt+w (up | down | w)


## [3.0.2 - 2022-02-21]
- Fix Split and Join when Line Endings are CRLF

## [3.0.1 - 2022-02-21]
- Always save current file before building. This fixes css and js upload timing bug
- Backup APP to export before removing it. In case of error, it get's retored

## [3.0.0 - 2022-02-20]
- Fully rewritten codebase
- New Feature FlexMode Mode
  - Add variable Schema on top level folders
    - apex
    - db
    - rest
    - static
  - Add workspace folders underneath apex
  > ... see Documentation for additional help
- New Command `Compile selected Schemas`
- New Command `Open corresponding Spec or Body`
- Split and Join Files are now works without relative path prefix
- Includes Snippets for index and constraint creation
- new Subfolder `patch` inside `dml` and `ddl`, so pre and post go here on new projects
- SubFolder `tablel_ddl` is now under tabled directory
- Remove APEX AppFolder prior export to reflect removed files

## [2.5.1 - 2022-01-11]
- Fix resolving DBSchema from path

## [2.5.0 - 2022-01-11]
- Add commands to split or join files, when content is seperated by "-- File: ../relative/path/to/file.sql"

## [2.4.0 - 2021-09-26]
- fix workspace creation scripts, no reference to APEX Schema
- Add option to focus problem panel when errors or warnings exists

## [2.3.0 - 2021-09-26]
- Add option to create workspace and workspace user when initializing projectfolder
- Additionaly output reference to static file when upload from static-subfolder

## [2.2.0 - 2021-09-16]
- New feature: new command (dbFlux: Create Object) which creates a file in specific folder
- New feature: new files will be filled by a snipped if exists for defined folder (users can overwrite that)
- fix how a SingleSchema is recognized in XCL projects
- fix wrong call to open config-files when configuration could not be read successfuly

## [2.1.0 - 2021-09-13]
- some fixes concerning password validation
- after initialize project a welcome help page is displayed

## [2.0.0 - 2021-09-10]
- RENAMED dbFlow-vsce to **dbFlux**
- dbFlux knows 3 modes
  - dbFlow: configuration is read from build.env and apply.env
  - xcl: configuration is read from xcl.yml and .xcl/env.yml
  - dbFlux: configuration is read from workspace state
- you can now create workspace structure and configuration from command: dbFlux:Initialize Project structure
- any file stored below db/_setup - is executed by configured admin user
- some small improvements

## [1.1.3 - 2021-08-25]
- Check xcl config at .xcl/env.yml
- fix password input when not given
- some small improvements

## [1.1.2 - 2021-08-18]
- Fix display of multiple Errors or Warnings in problem matcher
- Display OS-Time on compile with bash
- Configure recognized FileExtensions (sql, pks, pkb, ...)

## [1.1 - 2021-07-13]
- new option to enable or disable colored output when compiling
- fix executing tests on original package (Ctrl+Alt+t on example_util will run tests for package test_example_util)

## [1.0.1 - 2021-07-13]
- set xcl.yml as leading file check
- Introduced new outputChannel dbFlux for further logging

## [1.0.0 - 2021-07-12]
- Fixed Bug in triggering Call-Definitions
- Compile-Mode is now determined by file extension not by language
- Invalid Javascript-Code message form terser is now fetched end rejected

## [0.9.0 - 2021-06-28]
- Check if sql or sqlplus executable is on path before execution

## [0.8.0 - 2021-06-09]
- Fix wrong error output on package spec when body has errors
- Execute tests for current package

## [0.7.0 - 2021-06-09]

- Allow blanklines in SQLPlus
- Allow serveroutput on triggered files

## [0.6.0 - 2021-06-01]

- Support colored output on Git-Bash
- Execute tests on selected schemas
- Enter password via Input when not stored in configuration files (dbFlux/xcl)


## [0.1.0 - Beta - 2021-05-04]

- Initial release