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
CLR_RED="${ESC}${BSE_RED}"         # Red Background
CLR_ORANGE="${ESC}${BSE_ORANGE}"    # Orange
CLR_GREEN="${ESC}${BSE_GREEN}"        # Green
CLR_LVIOLETE="${ESC}${BSE_LVIOLETE}"        # Green


lsourced="TRUE"

function initialize_session() {
  # TODO: Make that as Option, so that user of dbFlux can user there own
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

## Logging
failure="failure"
success="success"
warning="warning"
info="info"

RED="\033[0;31m"          # Red
GREEN="\033[0;32m"        # Green
YELLOW="\033[0;33m"       # Yellow
CYAN="\033[0;36m"         # Cyan
WHITE="\033[0;97m"        # White
NC="\033[0m"       # Text Reset

timelog () {
  local text=${1:-""}
  local type=${2:-""}

  case "$type" in
    "${failure}")
      color=${RED}
      reset=${NC}
      ;;
    "${success}")
      color=${GREEN}
      reset=${NC}
      ;;
    "${warning}")
      color=${YELLOW}
      reset=${NC}
      ;;
    "${info}")
      color=${CYAN}
      reset=${NC}
      ;;
    *)
      color=${WHITE}
      reset=${NC}
  esac

  LOGTIME=`date "+%Y-%m-%d %H:%M:%S"`
  echo -e "${WHITE}$LOGTIME${NC}: ${color}${text}${reset}";
}

function print_rest_status_message() {
  local level="$1"
  local label="$2"
  local message="$3"

  local label_color="${CLR_LVIOLETE}"
  local message_color="${WHITE}"

  if [[ "${level}" == "error" ]]; then
    label_color="${CLR_ORANGE}"
    message_color="${CLR_RED}"
  fi

  printf "%b%-11s%b %b%s%b\n" \
    "${label_color}" "${label}:" "${NC}" \
    "${message_color}" "${message}" "${NC}"
}