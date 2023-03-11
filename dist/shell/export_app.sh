#!/bin/bash

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

      echo -e "${CLR_LBLUE}$(date '+%d.%m.%Y %H:%M:%S') >> exporting Application ${DBFLOW_DIR_APPID} to ${APP_PATH} ${NC}"

      # remove folder when exists
      if [[ -d "f${DBFLOW_DIR_APPID}" ]]; then
        mv "f${DBFLOW_DIR_APPID}" "f${DBFLOW_DIR_APPID}_bck"
      fi

      CONN_DBFLOW_DBUSER=${DBFLOW_DBUSER}
      if [[ ${DBFLOW_MODE} == "FLEX" ]]; then
        appschema=$(basename $(dirname "${APP_PATH}"))
        CONN_DBFLOW_DBUSER=${DBFLOW_DBUSER/\*/$appschema}
      fi

      # the export itself
      sql -s -l ${CONN_DBFLOW_DBUSER}/${DBFLOW_DBPASS}@${DBFLOW_DBTNS} << EOF
        WHENEVER SQLERROR EXIT SQL.SQLCODE
        apex export -applicationid ${DBFLOW_DIR_APPID} -split -skipExportDate
EOF

      if [[ $? -ne 0 ]]; then
        echo -e "${CLR_REDBGR}$(date '+%d.%m.%Y %H:%M:%S') >> failure during export of Application ${DBFLOW_DIR_APPID}${NC}"

        # restore
        if [[ -d "f${DBFLOW_DIR_APPID}_bck" ]]; then
          mv "f${DBFLOW_DIR_APPID}_bck" "f${DBFLOW_DIR_APPID}"
        fi

        exit 0
      elif [[ -d "f${DBFLOW_DIR_APPID}_bck" ]] && [[ ! -d "f${DBFLOW_DIR_APPID}" ]]; then
        echo -e "${CLR_REDBGR}$(date '+%d.%m.%Y %H:%M:%S') >> failure during export of Application ${DBFLOW_DIR_APPID}${NC}"

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

        echo -e "${CLR_GREEN}$(date '+%d.%m.%Y %H:%M:%S') >> done exporting Application ${DBFLOW_DIR_APPID} ${NC}"
      fi

      # remove sqlcl history.log
      if [[ -f history.log ]]; then
        rm history.log
      fi
    done
    cd "${basepath}"
  else
    echo -e "${CLR_REDBGR}$(date '+%d.%m.%Y %H:%M:%S') >> application folder ${DBFLOW_APPFOLDER} does not exist ${NC}"
  fi
}


echo -e "${CLR_LBLUE}Connection:${NC}  ${WHITE}${DBFLOW_DBTNS}${NC}"
echo -e "${CLR_LBLUE}Schema:${NC}      ${WHITE}${DBFLOW_DBUSER}${NC}"
echo -e "${CLR_LBLUE}AppID:${NC}       ${WHITE}${DBFLOW_APPID}${NC}"
echo -e "${CLR_LBLUE}Folder:${NC}      ${WHITE}${DBFLOW_APPFOLDER}${NC}"
echo -e "${CLR_LBLUE}ProjectMode:${NC} ${WHITE}${DBFLOW_MODE}${NC}"
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
