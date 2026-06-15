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

printf "${CLR_LBLUE}Connection:${NC}    ${WHITE}${REST_SQL_URL}${NC}\n"
printf "${CLR_LBLUE}AppID:${NC}         ${WHITE}${DBFLOW_EXP_APP_ID}${NC}\n"
printf "${CLR_LBLUE}File:${NC}          ${WHITE}${DBFLOW_EXP_FNAME}${NC}\n"
printf "${CLR_LBLUE}Target:${NC}        ${WHITE}${DBFLOW_EXP_PATH}${NC}\n"
echo
printf "${CLR_LBLUE}$(date '+%d.%m.%Y %H:%M:%S') >> exporting Files from ${DBFLOW_EXP_APP_ID} to static/${DBFLOW_EXP_APP_ID}/src ${NC}\n"

tmpzip="$(mktemp "${TMPDIR:-/tmp}/dbflux-rest-expstatics.XXXXXX")"

headers=( "app_id:${DBFLOW_EXP_APP_ID}" )
if [[ -n "${DBFLOW_EXP_FNAME}" ]]; then
  headers+=( "file_name:${DBFLOW_EXP_FNAME}" )
fi

rest_post_download "expstatics" "${tmpzip}" "${headers[@]}"
if [[ $? -eq 0 ]]; then
  printf "${CLR_LBLUE}$(date '+%d.%m.%Y %H:%M:%S') >> Unzipping exported static files ... ${NC}\n"
  mkdir -p "${DBFLOW_EXP_PATH}"
  unzip -o "${tmpzip}" -d "${DBFLOW_EXP_PATH}"
  rm -f "${tmpzip}"
  printf "${CLR_GREEN}$(date '+%d.%m.%Y %H:%M:%S') >> export done${NC}\n"
else
  rm -f "${tmpzip}"
  printf "${CLR_REDBGR}Error detected on export${NC}\n"
fi
