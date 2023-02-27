#!/bin/bash

# Reset
NC="\e[0m"       # Text Reset

# Regular Colors
ESC="\e"

BSE_RESET="[0m";
BSE_DGRAY="[90m"          # Dark Gray
BSE_LBLUE="[38;5;74m"     # Light Blue
BSE_REDBGR="[41m"         # Red Background


BSE_LVIOLETE="[38;5;68m"     # Light Violet
BSE_GREENBGR="[48;5;28m"     # Light Violet
BSE_GREEN="[38;5;28m"     # Light Violet
BSE_ORANGEBGR="[48;5;172m"     # Light Violet
BSE_ORANGE="[38;5;172m"     # Light Violet
BSE_RED="[31m"     # Light Violet


CLR_DGRAY="${ESC}${BSE_DGRAY}"          # Dark Gray
CLR_LBLUE="${ESC}${BSE_LBLUE}"     # Light Blue
CLR_REDBGR="${ESC}${BSE_REDBGR}"         # Red Background
CLR_ORANGE="${ESC}${BSE_ORANGE}"    # Orange
CLR_GREEN="${ESC}${BSE_GREEN}"        # Green


lsourced="TRUE"

function initialize_session() {
  # TODO: Make that as Option, so that user of dbFLux can user there own
  # set default params
  export NLS_LANG="GERMAN_GERMANY.AL32UTF8"
  export NLS_DATE_FORMAT="DD.MM.YYYY HH24:MI:SS"
  export LANG="de_DE.utf8"

  export CUSTOM_JDBC="-XX:+TieredCompilation -XX:TieredStopAtLevel=1"
  export JAVA_TOOL_OPTIONS="-Duser.language=en -Duser.region=US -Dfile.encoding=UTF-8"

  # colored output in sqlplus inside git-bash
  case $(uname | tr '[:upper:]' '[:lower:]') in
  mingw64_nt-10*)
    chcp.com 65001
  ;;
  esac
}
