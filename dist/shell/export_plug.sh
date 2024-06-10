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

function get_db_value () {
  local QUERY=$1
  local NDF=$2

  sql -S -L ${CONN_DBFLOW_DBUSER}/'"'"${DBFLOW_DBPASS}"'"'@${DBFLOW_DBTNS} <<EOF
set serveroutput on
set heading off
set feedback off
set pages 0
Declare
  l_dummy varchar2(2000);
Begin
  execute immediate '${QUERY}' into l_dummy;
  dbms_output.put_line(l_dummy);
exception
  when no_data_found then
    dbms_output.put_line('${NDF}');
  when others then
    dbms_output.put_line('ERROR: '||sqlcode);
End;
/
EOF

}

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

    # loop throuhh either all (*) or just the one 123
    for d in ${APP_ID} ; do
      cd "${d}/${PLUG_ID}"

      # what ist the actual ID
      DBFLOW_DIR_APPID="${d/f}"

      local target_path="${APP_PATH}/${APP_ID}/${PLUG_ID}"
      local target_basefile=$(toLowerCase ${PLUG_ID//./_}).sql
      local target_file=${target_path}/${target_basefile}

      echo -e "${CLR_LBLUE}$(date '+%d.%m.%Y %H:%M:%S') >> exporting Pluging: ${APP_ID}/${PLUG_ID} to ${target_path} ${NC}"

      # remove target_file when exists
      if [[ -f "${target_basefile}" ]]; then
        mv "${target_basefile}" "${target_basefile}_bck"
      fi

      CONN_DBFLOW_DBUSER=${DBFLOW_DBUSER}
      if [[ ${DBFLOW_MODE} == "FLEX" ]]; then
        appschema=$(basename $(dirname "${APP_PATH}"))
        CONN_DBFLOW_DBUSER=${DBFLOW_DBUSER/\*/$appschema}
      fi

      echo -e "${CLR_LVIOLETE}$(date '+%d.%m.%Y %H:%M:%S') >> get PLUGIN_ID from ${target_path} ${NC}"

      # ask the id
      plugin_id=$(get_db_value "select to_char(plugin_id) from apex_appl_plugins where application_id = ''${DBFLOW_DIR_APPID}'' and name = ''${PLUG_ID}''" "NDF")
      plugin_id=$(tr -d '\n[:space:]' <<< "$plugin_id")

      echo -e "${CLR_LVIOLETE}$(date '+%d.%m.%Y %H:%M:%S') >> PLUGIN_ID found ${plugin_id} ${NC}"
      echo -e "${CLR_LVIOLETE}$(date '+%d.%m.%Y %H:%M:%S') >> exporting with: apex exco -applicationid ${DBFLOW_DIR_APPID} -expcomponents PLUGIN:${plugin_id} ${NC}"

      # the export itself
      sql -s -l ${CONN_DBFLOW_DBUSER}/'"'"${DBFLOW_DBPASS}"'"'@${DBFLOW_DBTNS} << EOF
        WHENEVER SQLERROR EXIT SQL.SQLCODE
        apex export -applicationid ${DBFLOW_DIR_APPID} -expcomponents PLUGIN:${plugin_id}
EOF

      if [[ $? -ne 0 ]]; then
        echo -e "${CLR_REDBGR}$(date '+%d.%m.%Y %H:%M:%S') >> failure during export of Plugin ${target_path}${NC}"

        # restore
        if [[ -f "${target_basefile}_bck" ]]; then
          mv "${target_basefile}_bck" "${target_basefile}"
        fi

        exit 0
      elif [[ -f "${target_basefile}_bck" ]] && [[ ! -f "f${DBFLOW_DIR_APPID}.sql" ]]; then
        echo -e "${CLR_REDBGR}$(date '+%d.%m.%Y %H:%M:%S') >> failure during export of Plugin ${target_path}${NC}"

        # restore
        if [[ -f ${target_basefile}_bck ]]; then
          mv "${target_basefile}_bck" "${target_basefile}"
        fi
        exit 0
      else

        # remove the full export file
        [[ -f "f${DBFLOW_DIR_APPID}.sql" ]] && mv "f${DBFLOW_DIR_APPID}.sql" "${target_basefile}"

        # remove backup
        [[ -f "${target_basefile}_bck" ]] && rm "${target_basefile}_bck"

        echo -e "${CLR_GREEN}$(date '+%d.%m.%Y %H:%M:%S') >> done exporting Plugin ${target_path} ${NC}"
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
echo -e "${CLR_LBLUE}Folder:${NC}      ${WHITE}${DBFLOW_PLGFOLDER}${NC}"
echo -e "${CLR_LBLUE}Plugin:${NC}      ${WHITE}${DBFLOW_PLGID}${NC}"
echo -e "${CLR_LBLUE}ProjectMode:${NC} ${WHITE}${DBFLOW_MODE}${NC}"
echo


if [[ "${DBFLOW_APPID}" == "*" ]]; then
  echo -e "${CLR_REDBGR}$(date '+%d.%m.%Y %H:%M:%S') >> multiple exports not implemented yet ${NC}"
  # Array der Folders aufbauen
  # depth=0
  # if [[ ${DBFLOW_MODE} == "FLEX" ]]; then
  #   depth=2
  # fi
  # items=()
  # IFS=$'\n' read -r -d '' -a items < <( find "./apex" -maxdepth "${depth}" -mindepth "${depth}" -type d && printf '\0' )

  # for dirname in "${items[@]}"
  # do
  #   export_app "${dirname}" "${DBFLOW_APPID}"
  # done
else
  export_plug "plugin" "${DBFLOW_APPID}" "${DBFLOW_PLGID}"
fi
