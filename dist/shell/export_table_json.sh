#!/usr/bin/env bash

# this is our source directory
SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]:-$0}"; )" &> /dev/null && pwd 2> /dev/null; )";

# let's include some global vars like color or some methods
source "${SCRIPT_DIR}/_lib.sh"

# initialze session vars like NLS or JAVA_TOOL_OPTIONS
initialize_session;

######################################################

echo -e "${CLR_LBLUE}Connection:${NC}    ${WHITE}${DBFLOW_DBUSER}/${DBFLOW_DBTNS}${NC}"
echo -e "${CLR_LBLUE}Table:${NC}         ${WHITE}${DBFLOW_EXP_TABLE}${NC}"
echo -e "${CLR_LBLUE}Path:${NC}          ${WHITE}${DBFLOW_EXP_TODIR}${NC}"
# echo -e "${CLR_LBLUE}Target:${NC}        ${WHITE}${DBFLOW_EXP_PATH}${NC}"
echo
# echo -e "${CLR_LBLUE}$(date '+%d.%m.%Y %H:%M:%S') >> exporting Files from ${DBFLOW_EXP_APP_ID} to static/${DBFLOW_EXP_APP_ID}/src ${NC}"
echo -e "${CLR_LBLUE}$(date '+%d.%m.%Y %H:%M:%S') >> ... this may take a while ${NC}"


ANOFUNCTIONS=$( cat "${SCRIPT_DIR}/../sql/json_query/tables.tmpl.sql" )

# create target folder if not exists
[[ -d "${DBFLOW_EXP_TODIR}" ]] || mkdir -p "${DBFLOW_EXP_TODIR}"

# the export itself
if [[ ${DBFLOW_SQLCLI} == "sqlplus" ]]; then
  ## FullExport
  PREPSTMT=":contents := get_json('${DBFLOW_EXP_TABLE}');"


  sqlplus -s -l ${DBFLOW_DBUSER}/'"'"${DBFLOW_DBPASS}"'"'@${DBFLOW_DBTNS} <<! > "${DBFLOW_EXP_TODIR}/${DBFLOW_EXP_TABLE}.json"
    set verify off
    set scan off
    set feedback off
    set heading off
    set trimout on
    set trimspool on
    set pagesize 0
    set linesize 5000
    set long 100000000
    set longchunksize 32767
    whenever sqlerror exit sql.sqlcode rollback
    variable contents clob
    DECLARE
      ${ANOFUNCTIONS}
    BEGIN
      ${PREPSTMT}
    END;
    /

    print contents

!

else
  ## FullExport
  PREPSTMT="v_content := to_base64(get_zip(p_app_id => ${DBFLOW_EXP_APP_ID}));"

  ## Or just an object
  if [[ -n ${DBFLOW_EXP_FNAME} ]]; then
    PREPSTMT="v_content := to_base64(get_zip(p_app_id => ${DBFLOW_EXP_APP_ID}, p_file_name => '${DBFLOW_EXP_FNAME}'));"
  fi

  sql -s -l ${DBFLOW_DBUSER}/'"'"${DBFLOW_DBPASS}"'"'@${DBFLOW_DBTNS} <<! > "${DBFLOW_EXP_TODIR}/${DBFLOW_EXP_TABLE}.json"
    set verify off
    set scan off
    set feedback off
    set heading off
    set trimout on
    set trimspool on
    set pagesize 0
    set linesize 5000
    set long 100000000
    set longchunksize 32767
    set serveroutput on
    whenever sqlerror exit sql.sqlcode rollback
    rem variable contents clob
    DECLARE
      v_content clob;
      ${ANOFUNCTIONS}
    BEGIN
      ${PREPSTMT}
      print_clob_to_output(v_content);
    END;
    /

!

fi


echo -e "${CLR_GREEN}$(date '+%d.%m.%Y %H:%M:%S') >> done ${NC}"
