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

printf "${CLR_LBLUE}Connection:${NC}      ${WHITE}${REST_SQL_URL}${NC}\n"
printf "${CLR_LBLUE}Schema:${NC}          ${WHITE}${DBFLOW_SCHEMA}${NC}\n"
printf "${CLR_LBLUE}Targetfolder:${NC}    ${WHITE}${DBFLOW_SCHEMA_NEW}${NC}\n"
printf "${CLR_LBLUE}Type:${NC}            ${WHITE}${DBFLOW_EXP_FOLDER}${NC}\n"
printf "${CLR_LBLUE}Object:${NC}          ${WHITE}${DBFLOW_EXP_FNAME}${NC}\n"
printf "${CLR_LBLUE}Grant w.Objects:${NC} ${WHITE}${DBFLOW_EXP_GRANTS_W_OBJ}${NC}\n"
echo

# the REST endpoint always exports the connected schema
if [[ -n "${DBFLOW_SCHEMA}" ]] && [[ "$(echo "${DBFLOW_SCHEMA}" | tr '[:lower:]' '[:upper:]')" != "$(echo "${REST_APP_SCHEMA}" | tr '[:lower:]' '[:upper:]')" ]]; then
  printf "${CLR_ORANGE}$(date '+%d.%m.%Y %H:%M:%S') >> Note: in REST mode the connected schema ${REST_APP_SCHEMA} is exported ${NC}\n"
fi

printf "${CLR_LBLUE}$(date '+%d.%m.%Y %H:%M:%S') >> exporting Schema ${DBFLOW_SCHEMA} to db/${DBFLOW_SCHEMA_NEW} ${NC}\n"
printf "${CLR_LBLUE}$(date '+%d.%m.%Y %H:%M:%S') >> ... this may take a while ${NC}\n"

tmpzip="$(mktemp "${TMPDIR:-/tmp}/dbflux-rest-expschema.XXXXXX")"

headers=( "grants_with_object:${DBFLOW_EXP_GRANTS_W_OBJ:-false}" )
if [[ -n "${DBFLOW_EXP_FOLDER}" ]]; then
  headers+=( "folder:${DBFLOW_EXP_FOLDER}" )
fi
if [[ -n "${DBFLOW_EXP_FNAME}" ]]; then
  headers+=( "file_name:${DBFLOW_EXP_FNAME}" )
fi

rest_post_download "expschema" "${tmpzip}" "${headers[@]}"
if [[ $? -eq 0 ]]; then
  printf "${CLR_LBLUE}$(date '+%d.%m.%Y %H:%M:%S') >> Unzipping exported schema file ... ${NC}\n"
  mkdir -p "db/${DBFLOW_SCHEMA_NEW}"
  unzip -o "${tmpzip}" -d "db/${DBFLOW_SCHEMA_NEW}"
  rm -f "${tmpzip}"
  printf "${CLR_GREEN}$(date '+%d.%m.%Y %H:%M:%S') >> export done${NC}\n"
else
  rm -f "${tmpzip}"
  printf "${CLR_REDBGR}Error detected on export${NC}\n"
fi
