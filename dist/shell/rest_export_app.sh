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

function export_app() {
  local APP_PATH="${1}"
  local APP_ID="${2}"

  # only when target folder exists
  if [[ -d "${APP_PATH}" ]]; then
    cd "${APP_PATH}"

    # loop throuhh either all (*) or just the one 123
    for d in f${APP_ID} ; do
      # what ist the actual ID
      DBFLOW_DIR_APPID="${d/f}"

      printf "${CLR_LBLUE}$(date '+%d.%m.%Y %H:%M:%S') >> exporting Application ${DBFLOW_DIR_APPID} to ${APP_PATH} ${NC}\n"

      # remove folder when exists
      if [[ -d "f${DBFLOW_DIR_APPID}" ]]; then
        mv "f${DBFLOW_DIR_APPID}" "f${DBFLOW_DIR_APPID}_bck"
      fi

      local tmpzip
      tmpzip="$(mktemp "${TMPDIR:-/tmp}/dbflux-rest-expapp.XXXXXX")"

      printf "${CLR_LVIOLETE}$(date '+%d.%m.%Y %H:%M:%S') >> exporting via REST with options: ${NC}${CLR_ORANGE}${DBFLOW_EXPORT_OPTION}${NC}\n"
      rest_post_download "expapp" "${tmpzip}" \
        "app_id:${DBFLOW_DIR_APPID}" \
        "export_options:${DBFLOW_EXPORT_OPTION}"

      if [[ $? -eq 0 ]]; then
        unzip -o -q "${tmpzip}" -d .
        rm -f "${tmpzip}"
      else
        rm -f "${tmpzip}"
      fi

      if [[ ! -d "f${DBFLOW_DIR_APPID}" ]]; then
        printf "${CLR_REDBGR}$(date '+%d.%m.%Y %H:%M:%S') >> failure during export of Application ${DBFLOW_DIR_APPID}${NC}\n"

        # restore
        if [[ -d "f${DBFLOW_DIR_APPID}_bck" ]]; then
          mv "f${DBFLOW_DIR_APPID}_bck" "f${DBFLOW_DIR_APPID}"
        fi

        cd "${basepath}"
        exit 0
      else

        # remove backup
        [[ -d "f${DBFLOW_DIR_APPID}_bck" ]] && rm -rf "f${DBFLOW_DIR_APPID}_bck"

        printf "${CLR_GREEN}$(date '+%d.%m.%Y %H:%M:%S') >> done exporting Application ${DBFLOW_DIR_APPID} ${NC}\n"
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
printf "${CLR_LBLUE}Folder:${NC}      ${WHITE}${DBFLOW_APPFOLDER}${NC}\n"
echo

if [[ "${DBFLOW_APPID}" == "*" ]]; then
  # REST mode implies SINGLE mode: the apex folder itself holds all f* dirs
  export_app "./apex" "${DBFLOW_APPID}"
else
  export_app "${DBFLOW_APPFOLDER}" "${DBFLOW_APPID}"
fi
