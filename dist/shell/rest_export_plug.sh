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

if [[ ${DBFLOW_APPID} == "NULL" ]]
then
  echo "Export canceled"
  exit 0
fi

basepath=$(pwd)

function toLowerCase() {
  echo "${1}" | tr '[:upper:]' '[:lower:]'
}

function export_plug() {
  local APP_PATH="${1}"
  local APP_ID="${2}"
  local PLUG_ID="${3}"

  # only when target folder exists
  if [[ -d "${APP_PATH}" ]]; then
    cd "${APP_PATH}"

    for d in ${APP_ID} ; do
      cd "${d}/${PLUG_ID}"

      # what ist the actual ID
      DBFLOW_DIR_APPID="${d/f}"

      local target_path="${APP_PATH}/${APP_ID}/${PLUG_ID}"
      local target_basefile=$(toLowerCase ${PLUG_ID//./_}).sql

      printf "${CLR_LBLUE}$(date '+%d.%m.%Y %H:%M:%S') >> exporting Pluging: ${APP_ID}/${PLUG_ID} to ${target_path} ${NC}\n"

      # remove target_file when exists
      if [[ -f "${target_basefile}" ]]; then
        mv "${target_basefile}" "${target_basefile}_bck"
      fi

      local tmpzip
      tmpzip="$(mktemp "${TMPDIR:-/tmp}/dbflux-rest-expplugin.XXXXXX")"

      printf "${CLR_LVIOLETE}$(date '+%d.%m.%Y %H:%M:%S') >> exporting via REST: app_id ${DBFLOW_DIR_APPID}, plugin ${PLUG_ID} ${NC}\n"
      rest_post_download "expplugin" "${tmpzip}" \
        "app_id:${DBFLOW_DIR_APPID}" \
        "plugin_name:${PLUG_ID}"

      if [[ $? -eq 0 ]]; then
        unzip -o -q "${tmpzip}" -d .
        rm -f "${tmpzip}"
      else
        rm -f "${tmpzip}"
      fi

      if [[ ! -f "f${DBFLOW_DIR_APPID}.sql" ]]; then
        printf "${CLR_REDBGR}$(date '+%d.%m.%Y %H:%M:%S') >> failure during export of Plugin ${target_path}${NC}\n"

        # restore
        if [[ -f "${target_basefile}_bck" ]]; then
          mv "${target_basefile}_bck" "${target_basefile}"
        fi

        cd "${basepath}"
        exit 0
      else

        # rename the exported file to the plugin file name
        mv "f${DBFLOW_DIR_APPID}.sql" "${target_basefile}"

        # remove backup
        [[ -f "${target_basefile}_bck" ]] && rm "${target_basefile}_bck"

        printf "${CLR_GREEN}$(date '+%d.%m.%Y %H:%M:%S') >> done exporting Plugin ${target_path} ${NC}\n"
      fi
    done
    cd "${basepath}"
  else
    printf "${CLR_REDBGR}$(date '+%d.%m.%Y %H:%M:%S') >> application folder ${DBFLOW_APPFOLDER} does not exist ${NC}\n"
  fi
}


printf "${CLR_LBLUE}Connection:${NC}  ${WHITE}${REST_SQL_URL}${NC}\n"
printf "${CLR_LBLUE}Schema:${NC}      ${WHITE}${REST_APP_SCHEMA}${NC}\n"
printf "${CLR_LBLUE}AppID:${NC}       ${WHITE}${DBFLOW_APPID}${NC}\n"
printf "${CLR_LBLUE}Folder:${NC}      ${WHITE}${DBFLOW_PLGFOLDER}${NC}\n"
printf "${CLR_LBLUE}Plugin:${NC}      ${WHITE}${DBFLOW_PLGID}${NC}\n"
echo


if [[ "${DBFLOW_APPID}" == "*" ]]; then
  printf "${CLR_REDBGR}$(date '+%d.%m.%Y %H:%M:%S') >> multiple exports not implemented yet ${NC}\n"
else
  export_plug "plugin" "${DBFLOW_APPID}" "${DBFLOW_PLGID}"
fi
