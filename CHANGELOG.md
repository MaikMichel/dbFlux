# Change Log

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