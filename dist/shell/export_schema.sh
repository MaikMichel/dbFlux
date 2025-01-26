#!/usr/bin/env bash

# this is our source directory
SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]:-$0}"; )" &> /dev/null && pwd 2> /dev/null; )";

# let's include some global vars like color or some methods
source "${SCRIPT_DIR}/_lib.sh"

# initialze session vars like NLS or JAVA_TOOL_OPTIONS
initialize_session;

######################################################

echo -e "${CLR_LBLUE}Connection:${NC}      ${WHITE}${DBFLOW_DBUSER}/${DBFLOW_DBTNS}${NC}"
echo -e "${CLR_LBLUE}Schema:${NC}          ${WHITE}${DBFLOW_SCHEMA}${NC}"
echo -e "${CLR_LBLUE}Targetfolder:${NC}    ${WHITE}${DBFLOW_SCHEMA_NEW}${NC}"
echo -e "${CLR_LBLUE}Type:${NC}            ${WHITE}${DBFLOW_EXP_FOLDER}${NC}"
echo -e "${CLR_LBLUE}Object:${NC}          ${WHITE}${DBFLOW_EXP_FNAME}${NC}"
echo -e "${CLR_LBLUE}Grant w.Objects:${NC} ${WHITE}${DBFLOW_EXP_GRANTS_W_OBJ}${NC}"
echo
echo -e "${CLR_LBLUE}$(date '+%d.%m.%Y %H:%M:%S') >> exporting Schema ${DBFLOW_SCHEMA} to db/${DBFLOW_SCHEMA_NEW} ${NC}"
echo -e "${CLR_LBLUE}$(date '+%d.%m.%Y %H:%M:%S') >> ... this may take a while ${NC}"

ANOFUNCTIONS=$( cat "${SCRIPT_DIR}/../sql/export_anonymous_function.sql" )

# the export itself
if [[ ${DBFLOW_SQLCLI} == "sqlplus" ]]; then
  ## FullExport
  PREPSTMT=":contents := to_base64(get_zip(p_grant_with_object => ${DBFLOW_EXP_GRANTS_W_OBJ}));"

  ## Or just an object
  if [[ -n ${DBFLOW_EXP_FOLDER} ]]; then
    PREPSTMT=":contents :=  to_base64(get_zip(p_folder => '${DBFLOW_EXP_FOLDER}', p_file_name => '${DBFLOW_EXP_FNAME}', p_grant_with_object => ${DBFLOW_EXP_GRANTS_W_OBJ})));"
  fi

  sqlplus -s -l ${DBFLOW_DBUSER}/'"'"${DBFLOW_DBPASS}"'"'@${DBFLOW_DBTNS} << EOF > db/"${DBFLOW_SCHEMA}".zip.base64
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
      dbms_metadata.set_transform_param(dbms_metadata.session_transform, 'SQLTERMINATOR',        true);
      dbms_metadata.set_transform_param(dbms_metadata.session_transform, 'PRETTY',               true);
      dbms_metadata.set_transform_param(dbms_metadata.session_transform, 'STORAGE',              false);
      dbms_metadata.set_transform_param(dbms_metadata.session_transform, 'SEGMENT_ATTRIBUTES',   false);
      dbms_metadata.set_transform_param(dbms_metadata.session_transform, 'CONSTRAINTS',          true);
      dbms_metadata.set_transform_param(dbms_metadata.session_transform, 'REF_CONSTRAINTS',      true);
      dbms_metadata.set_transform_param(dbms_metadata.session_transform, 'CONSTRAINTS_AS_ALTER', true);
      dbms_metadata.set_transform_param(dbms_metadata.session_transform, 'EMIT_SCHEMA',          false);
      ${PREPSTMT}
    END;
    /

    print contents

EOF

else
  ## FullExport
  PREPSTMT="v_content := to_base64(get_zip(p_grant_with_object => ${DBFLOW_EXP_GRANTS_W_OBJ})));"

  ## Or just an object
  if [[ -n ${DBFLOW_EXP_FNAME} ]]; then
    PREPSTMT="v_content := to_base64(get_zip(p_folder => '${DBFLOW_EXP_FOLDER}', p_file_name => '${DBFLOW_EXP_FNAME}', p_grant_with_object => ${DBFLOW_EXP_GRANTS_W_OBJ})));"
  fi

    sql -s -l ${DBFLOW_DBUSER}/'"'"${DBFLOW_DBPASS}"'"'@${DBFLOW_DBTNS} << EOF > db/"${DBFLOW_SCHEMA}".zip.base64
    set verify off
    set scan off
    set feedback off
    set heading off
    set trimout on
    set trimspool on
    set pagesize 0
    set linesize 5000
    REM set long 100000000
    set longchunksize 32767
    set serveroutput on
    whenever sqlerror exit sql.sqlcode rollback
    DECLARE
      v_content clob;
      ${ANOFUNCTIONS}
    BEGIN
      dbms_metadata.set_transform_param(dbms_metadata.session_transform, 'SQLTERMINATOR',        true);
      dbms_metadata.set_transform_param(dbms_metadata.session_transform, 'PRETTY',               true);
      dbms_metadata.set_transform_param(dbms_metadata.session_transform, 'STORAGE',              false);
      dbms_metadata.set_transform_param(dbms_metadata.session_transform, 'SEGMENT_ATTRIBUTES',   false);
      dbms_metadata.set_transform_param(dbms_metadata.session_transform, 'CONSTRAINTS',          true);
      dbms_metadata.set_transform_param(dbms_metadata.session_transform, 'REF_CONSTRAINTS',      true);
      dbms_metadata.set_transform_param(dbms_metadata.session_transform, 'CONSTRAINTS_AS_ALTER', true);
      dbms_metadata.set_transform_param(dbms_metadata.session_transform, 'EMIT_SCHEMA',          false);
      ${PREPSTMT}
      print_clob_to_output(v_content);
    END;
    /

EOF

fi

if [[ -f "db/${DBFLOW_SCHEMA}.zip.base64" ]]; then
  # if grep -q "ORA-20001:" "db/${DBFLOW_SCHEMA}.zip.base64"; then
  if grep -q "ORA-.*:" "db/${DBFLOW_SCHEMA}.zip.base64"; then
    echo -e "${CLR_REDBGR}Error detected on export${NC}"
    tput setaf 9
    cat "db/${DBFLOW_SCHEMA}.zip.base64"
    tput setaf default

    rm "db/${DBFLOW_SCHEMA}.zip.base64"
  else
    echo -e "${CLR_LBLUE}$(date '+%d.%m.%Y %H:%M:%S') >> Decoding exported schema file ... ${NC}"
    base64 -d -i "db/${DBFLOW_SCHEMA}.zip.base64" > "db/${DBFLOW_SCHEMA}.zip"

    # remove base64 garbage
    rm "db/${DBFLOW_SCHEMA}.zip.base64"

  fi

  # unzip file content
  if [[ -f "db/${DBFLOW_SCHEMA}.zip" ]]; then
    echo -e "${CLR_LBLUE}$(date '+%d.%m.%Y %H:%M:%S') >> Unzipping exported schema file ... ${NC}"
    unzip -o "db/${DBFLOW_SCHEMA}.zip" -d "db/${DBFLOW_SCHEMA_NEW}"
    rm "db/${DBFLOW_SCHEMA}.zip"
    echo -e "${CLR_GREEN}$(date '+%d.%m.%Y %H:%M:%S') >> export done${NC}"
  fi
fi
