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

      printf "${CLR_LBLUE}$(date '+%d.%m.%Y %H:%M:%S') >> exporting REST Modul ${DBFLOW_MODULE_NAME} to ${MODULE_PATH} ${NC}\n"
      [[ -d "${DBFLOW_MODULE_NAME}" ]] || mkdir "${DBFLOW_MODULE_NAME}"

      local target_file="${DBFLOW_MODULE_NAME}/${DBFLOW_MODULE_NAME}.module.sql"

      # backup when exists
      if [[ -f "${target_file}" ]]; then
        mv "${target_file}" "${target_file}_bck"
      fi

      local tmpzip
      local tmpdir
      tmpzip="$(mktemp "${TMPDIR:-/tmp}/dbflux-rest-exprest.XXXXXX")"
      tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/dbflux-rest-exprest.XXXXXX")"

      rest_post_download "exprest" "${tmpzip}" "module_name:${DBFLOW_MODULE_NAME}"
      if [[ $? -eq 0 ]]; then
        unzip -o -q "${tmpzip}" -d "${tmpdir}"
        # the zip contains exactly one <module>.module.sql file
        local exported_file
        exported_file=$(find "${tmpdir}" -name "*.module.sql" -type f | head -1)
        if [[ -n "${exported_file}" ]]; then
          mv "${exported_file}" "${target_file}"
        fi
      fi
      rm -rf "${tmpzip}" "${tmpdir}"

      if [[ ! -f "${target_file}" ]]; then
        printf "${CLR_REDBGR}$(date '+%d.%m.%Y %H:%M:%S') >> failure during export of REST Module ${DBFLOW_MODULE_NAME}${NC}\n"

        # restore
        if [[ -f "${target_file}_bck" ]]; then
          mv "${target_file}_bck" "${target_file}"
        fi

        cd "${basepath}"
        exit 0
      else

        # remove backup
        [[ -f "${target_file}_bck" ]] && rm -f "${target_file}_bck"

        printf "${CLR_GREEN}$(date '+%d.%m.%Y %H:%M:%S') >> done exporting REST Module ${DBFLOW_MODULE_NAME} ${NC}\n"
      fi

    done
    cd "${basepath}"
  else
    printf "${CLR_REDBGR}$(date '+%d.%m.%Y %H:%M:%S') >> REST Module folder ${DBFLOW_MODULEFOLDER} does not exist ${NC}\n"
  fi
}

printf "${CLR_LBLUE}Connection:${NC}  ${WHITE}${REST_SQL_URL}${NC}\n"
printf "${CLR_LBLUE}Schema:${NC}      ${WHITE}${REST_APP_SCHEMA}${NC}\n"
printf "${CLR_LBLUE}Modul:${NC}       ${WHITE}${DBFLOW_RESTMODULE}${NC}\n"
printf "${CLR_LBLUE}Folder:${NC}      ${WHITE}${DBFLOW_MODULEFOLDER}${NC}\n"



if [[ "${DBFLOW_RESTMODULE}" == "*" ]]; then
  # REST mode implies SINGLE mode: rest/modules holds all module folders
  items=()
  IFS=$'\n' read -r -d '' -a items < <( find "./rest" -maxdepth 1 -mindepth 1 -path "*/modules" -type d && printf '\0' )

  for dirname in "${items[@]}"
  do
    dirname="${dirname#./}"
    export_module "${dirname}" "${DBFLOW_RESTMODULE}"
  done
else
  export_module "${DBFLOW_MODULEFOLDER}" "${DBFLOW_RESTMODULE}"
fi
