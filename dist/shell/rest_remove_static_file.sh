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

MDATE=`date +%d.%m.%y_%H:%M:%S,%5N`

printf "${CLR_LBLUE}Connection:${NC}    ${WHITE}${REST_SQL_URL}${NC}\n"
printf "${CLR_LBLUE}AppID:${NC}         ${WHITE}${DBFLOW_EXP_APP_ID}${NC}\n"
printf "${CLR_LBLUE}File:${NC}          ${WHITE}${DBFLOW_EXP_FNAME}${NC}\n"
printf "${CLR_LBLUE}Extension:${NC}     ${WHITE}${DBFLOW_EXP_FEXT}${NC}\n"
printf "${CLR_LBLUE}OS-Time:${NC}       ${WHITE}${MDATE}${NC}\n"

rest_post_json "rmstaticfile" \
  "app_id:${DBFLOW_EXP_APP_ID}" \
  "file_name:${DBFLOW_EXP_FNAME}" \
  "file_ext:${DBFLOW_EXP_FEXT}"

if [[ $? -ne 0 ]]; then
  exit 1
fi

if command -v jq >/dev/null 2>&1 && jq -e '(.success // false) == true' >/dev/null 2>&1 <<< "${REST_LAST_RESPONSE}"; then
  found=$(jq -r '.found // false' <<< "${REST_LAST_RESPONSE}")

  if [[ "${found}" == "true" ]]; then
    while IFS= read -r removed_file; do
      [[ -n "${removed_file}" ]] || continue
      printf "${CLR_ORANGE} >> removing File: ${removed_file}${NC}\n"
    done < <(jq -r '.removed[]?' <<< "${REST_LAST_RESPONSE}")
    printf "${CLR_GREEN} >> removing done${NC}\n"
  else
    printf "${CLR_RED} >> nothing found to remove${NC}\n"
  fi
else
  print_rest_response_as_problem_lines "${REST_LAST_RESPONSE}"
  exit 1
fi

printf "${CLR_ORANGE} >> you should now remove this file itself${NC}\n"
