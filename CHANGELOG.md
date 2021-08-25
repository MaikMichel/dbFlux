# Change Log



## [1.1.3 - 2021-08-25]
- Check xcl config at .xml/env.yml
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
- Introduced new outputChannel dbFlow for further logging

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
- Enter password via Input when not stored in configuration files (dbFlow/xcl)


## [0.1.0 - Beta - 2021-05-04]

- Initial release