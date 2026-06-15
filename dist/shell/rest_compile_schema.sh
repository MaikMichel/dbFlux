#!/usr/bin/env bash

# this is our source directory
SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]:-$0}"; )" &> /dev/null && pwd 2> /dev/null; )";

# let's include some global vars like color or some methods
source "${SCRIPT_DIR}/_lib.sh"

# shared REST helpers (token handling, response rendering, curl wrappers)
source "${SCRIPT_DIR}/_rest_lib.sh"

# initialze session vars like NLS or JAVA_TOOL_OPTIONS
initialize_session;

######################################################

MDATE=`date +%Y-%m-%dT%H:%M:%S%z`

compile_all="FALSE"
if [[ "${DBFLOW_SQL_COMPILE_OPTION}" == "true" ]]; then
  compile_all="TRUE"
fi

print_rest_status_message "info" "Schema" "${REST_APP_SCHEMA}"
print_rest_status_message "info" "Compile All" "${compile_all}"
print_rest_status_message "info" "OS-Time" "${MDATE}"

rest_post_json "compileschema" \
  "compile_all:${compile_all}" \
  "db_folder:${DBFLOW_DB_FOLDER:-db}" \
  "enable_warnings:${DBFLOW_ENABLE_WARNINGS}" \
  "warning_string:${DBFLOW_SQL_WARNING_STRING:-NIX}" \
  "warning_excludes:${DBFLOW_SQL_WARNING_EXCLUDE:--1}"

if [[ $? -ne 0 ]]; then
  exit 1
fi

echo
if command -v jq >/dev/null 2>&1 && jq -e '(.success // false) == true' >/dev/null 2>&1 <<< "${REST_LAST_RESPONSE}"; then
  print_rest_errors_array_as_problem_lines "${REST_LAST_RESPONSE}"

  if [[ ${REST_ERRORS_FOUND} -eq 0 ]]; then
    print_rest_success_message
  else
    echo "------------------------------------------------------------------------------------"
    printf "${CLR_DGRAY}due to a bug (${NC}#170898${CLR_DGRAY}) in VSCode there are no multiline error messages at the moment${NC}\n"
  fi
else
  print_rest_response_as_problem_lines "${REST_LAST_RESPONSE}"
fi
