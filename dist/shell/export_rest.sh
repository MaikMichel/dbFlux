#!/bin/bash

# this is our source directory
SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]:-$0}"; )" &> /dev/null && pwd 2> /dev/null; )";

# let's include some global vars like color or some methods
source "${SCRIPT_DIR}/_lib.sh"

# initialze session vars like NLS or JAVA_TOOL_OPTIONS
initialize_session;

######################################################

if [[ ${DBFLOW_RESTMODULE} == "NULL" ]]
then
  echo "Export canceled"
  exit 0
fi

basepath=$(pwd)


function export_module() {
  local MODULE_PATH="${1}"
  local MODULE_NAME="${2}"

  # only when target folder exists
  if [[ -d "${MODULE_PATH}" ]]; then
    cd "${MODULE_PATH}"

    # loop throuhh either all (*) or just the one api
    for d in ${MODULE_NAME} ; do
      # what ist the actual ID
      DBFLOW_MODULE_NAME="${d}"

      echo -e "${CLR_LBLUE}$(date '+%d.%m.%Y %H:%M:%S') >> exporting REST Modul ${DBFLOW_MODULE_NAME} to ${MODULE_PATH} ${NC}"
      [[ -d "${DBFLOW_MODULE_NAME}" ]] || mkdir "${DBFLOW_MODULE_NAME}"


      # remove folder when exists
      if [[ -f "${DBFLOW_MODULE_NAME}/${DBFLOW_MODULE_NAME}.module.sql" ]]; then
        mv "${DBFLOW_MODULE_NAME}/${DBFLOW_MODULE_NAME}.module.sql" "${DBFLOW_MODULE_NAME}/${DBFLOW_MODULE_NAME}.module.sql"_bck
      fi

      CONN_DBFLOW_DBUSER=${DBFLOW_DBUSER}
      if [[ ${DBFLOW_MODE} == "FLEX" ]]; then
        appschema=$(basename $(dirname "${APP_PATH}"))
        CONN_DBFLOW_DBUSER=${DBFLOW_DBUSER/\*/$appschema}
      fi

      # the export itself
      sql -s -l ${CONN_DBFLOW_DBUSER}/${DBFLOW_DBPASS}@${DBFLOW_DBTNS} << EOF > "${DBFLOW_MODULE_NAME}/${DBFLOW_MODULE_NAME}.module.sql"
        rest export ${DBFLOW_MODULE_NAME}
        prompt /
EOF

      if [[ $? -ne 0 ]]; then
        echo -e "${CLR_REDBGR}$(date '+%d.%m.%Y %H:%M:%S') >> failure during export of REST Module ${DBFLOW_MODULE_NAME}${NC}"

        # restore
        if [[ -f "${DBFLOW_MODULE_NAME}/${DBFLOW_MODULE_NAME}.module.sql_bck" ]]; then
          mv "${DBFLOW_MODULE_NAME}/${DBFLOW_MODULE_NAME}.module.sql_bck" "${DBFLOW_MODULE_NAME}/${DBFLOW_MODULE_NAME}.module.sql"
        fi

        exit 0
      elif [[ -f "${DBFLOW_MODULE_NAME}/${DBFLOW_MODULE_NAME}.module.sql_bck" ]] && [[ ! -f "${DBFLOW_MODULE_NAME}/${DBFLOW_MODULE_NAME}.module.sql" ]]; then
        echo -e "${CLR_REDBGR}$(date '+%d.%m.%Y %H:%M:%S') >> failure during export of REST Module ${DBFLOW_MODULE_NAME}${NC}"

        # restore
        if [[ -f "${DBFLOW_MODULE_NAME}/${DBFLOW_MODULE_NAME}.module.sql_bck" ]]; then
          mv "${DBFLOW_MODULE_NAME}/${DBFLOW_MODULE_NAME}.module.sql_bck" "${DBFLOW_MODULE_NAME}/${DBFLOW_MODULE_NAME}.module.sql"
        fi
        exit 0
      else

        # remove backup
        [[ -f "${DBFLOW_MODULE_NAME}/${DBFLOW_MODULE_NAME}.module.sql_bck" ]] && rm -rf "${DBFLOW_MODULE_NAME}/${DBFLOW_MODULE_NAME}.module.sql_bck"

        echo -e "${CLR_GREEN}$(date '+%d.%m.%Y %H:%M:%S') >> done exporting REST Module ${DBFLOW_MODULE_NAME} ${NC}"
      fi

      # remove sqlcl history.log
      if [[ -f history.log ]]; then
        rm history.log
      fi

    done
    cd "${basepath}"
  else
    echo -e "${CLR_REDBGR}$(date '+%d.%m.%Y %H:%M:%S') >> REST Module folder ${DBFLOW_MODULEFOLDER} does not exist ${NC}"
  fi
}

echo -e "${CLR_LBLUE}Connection:${NC}  ${WHITE}${DBFLOW_DBTNS}${NC}"
echo -e "${CLR_LBLUE}Schema:${NC}      ${WHITE}${DBFLOW_DBUSER}${NC}"
echo -e "${CLR_LBLUE}Modul:${NC}       ${WHITE}${DBFLOW_RESTMODULE}${NC}"
echo -e "${CLR_LBLUE}Folder:${NC}      ${WHITE}${DBFLOW_MODULEFOLDER}${NC}"
echo -e "${CLR_LBLUE}Mode:${NC}        ${WHITE}${DBFLOW_MODE}${NC}"



if [[ "${DBFLOW_RESTMODULE}" == "*" ]]; then
  # Array der Folders aufbauen
  depth=1
  if [[ ${DBFLOW_MODE} == "FLEX" ]]; then
    depth=2
  fi
  items=()
  IFS=$'\n' read -r -d '' -a items < <( find "./rest" -maxdepth "${depth}" -mindepth "${depth}" -path "*/modules" -type d && printf '\0' )

  for dirname in "${items[@]}"
  do
    export_module "${dirname}" "${DBFLOW_RESTMODULE}"
  done
else
  export_module "${DBFLOW_MODULEFOLDER}" "${DBFLOW_RESTMODULE}"
fi
