#!/usr/bin/env bash

# this is our source directory
SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]:-$0}"; )" &> /dev/null && pwd 2> /dev/null; )";

# let's include some global vars like color or some methods
source "${SCRIPT_DIR}/_lib.sh"

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

      CONN_DBFLOW_DBUSER=${DBFLOW_DBUSER}
      if [[ ${DBFLOW_MODE} == "FLEX" ]]; then
        appschema=$(basename $(dirname "${APP_PATH}"))
        CONN_DBFLOW_DBUSER=${DBFLOW_DBUSER/\*/$appschema}
      fi

      printf "${CLR_LVIOLETE}$(date '+%d.%m.%Y %H:%M:%S') >> apex export -applicationid ${DBFLOW_DIR_APPID} -split ${NC}${CLR_ORANGE}${DBFLOW_EXPORT_OPTION}${NC}\n"
      # the export itself
      sql -s -l ${CONN_DBFLOW_DBUSER}/'"'"${DBFLOW_DBPASS}"'"'@${DBFLOW_DBTNS} << EOF
        WHENEVER SQLERROR EXIT SQL.SQLCODE
        apex export -applicationid ${DBFLOW_DIR_APPID} -split ${DBFLOW_EXPORT_OPTION}
EOF

      if [[ $? -ne 0 ]]; then
        printf "${CLR_REDBGR}$(date '+%d.%m.%Y %H:%M:%S') >> failure during export of Application ${DBFLOW_DIR_APPID}${NC}\n"

        # restore
        if [[ -d "f${DBFLOW_DIR_APPID}_bck" ]]; then
          mv "f${DBFLOW_DIR_APPID}_bck" "f${DBFLOW_DIR_APPID}"
        fi

        exit 0
      elif [[ -d "f${DBFLOW_DIR_APPID}_bck" ]] && [[ ! -d "f${DBFLOW_DIR_APPID}" ]]; then
        printf "${CLR_REDBGR}$(date '+%d.%m.%Y %H:%M:%S') >> failure during export of Application ${DBFLOW_DIR_APPID}${NC}\n"

        # restore
        if [[ -d f${DBFLOW_DIR_APPID}_bck ]]; then
          mv "f${DBFLOW_DIR_APPID}_bck" "f${DBFLOW_DIR_APPID}"
        fi
        exit 0
      else

        # remove the full export file
        [[ -f "f${DBFLOW_DIR_APPID}.sql" ]] && rm "f${DBFLOW_DIR_APPID}.sql"

        # remove backup
        [[ -d "f${DBFLOW_DIR_APPID}_bck" ]] && rm -rf "f${DBFLOW_DIR_APPID}_bck"

        printf "${CLR_GREEN}$(date '+%d.%m.%Y %H:%M:%S') >> done exporting Application ${DBFLOW_DIR_APPID} ${NC}\n"
      fi

      # remove sqlcl history.log
      if [[ -f history.log ]]; then
        rm history.log
      fi
    done
    cd "${basepath}"
  else
    printf "${CLR_REDBGR}$(date '+%d.%m.%Y %H:%M:%S') >> application folder ${DBFLOW_APPFOLDER} does not exist ${NC}\n"
  fi
}


printf "${CLR_LBLUE}Connection:${NC}  ${WHITE}${DBFLOW_DBTNS}${NC}\n"
printf "${CLR_LBLUE}Schema:${NC}      ${WHITE}${DBFLOW_DBUSER}${NC}\n"
printf "${CLR_LBLUE}AppID:${NC}       ${WHITE}${DBFLOW_APPID}${NC}\n"
printf "${CLR_LBLUE}Folder:${NC}      ${WHITE}${DBFLOW_APPFOLDER}${NC}\n"
printf "${CLR_LBLUE}ProjectMode:${NC} ${WHITE}${DBFLOW_MODE}${NC}\n"
echo

if [[ "${DBFLOW_APPID}" == "*" ]]; then
  # Array der Folders aufbauen
  depth=0
  if [[ ${DBFLOW_MODE} == "FLEX" ]]; then
    depth=2
  fi
  items=()
  IFS=$'\n' read -r -d '' -a items < <( find "./apex" -maxdepth "${depth}" -mindepth "${depth}" -type d && printf '\0' )

  for dirname in "${items[@]}"
  do
    export_app "${dirname}" "${DBFLOW_APPID}"
  done
else
  export_app "${DBFLOW_APPFOLDER}" "${DBFLOW_APPID}"
fi
