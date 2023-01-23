#!/bin/bash

# Reset
NC="\033[0m"       # Text Reset

# Regular Colors
#BLACK="\033[0;30m"        # Black
RED="\033[41m"          # Red
GREEN="\033[0;32m"        # Green
# BGREEN="\033[1;32m"       # Green
# YELLOW="\033[0;33m"       # Yellow
# BLUE="\033[0;34m"         # Blue
# PURPLE="\033[0;35m"       # Purple
CYAN="\033[0;36m"         # Cyan
WHITE="\033[0;37m"        # White
BYELLOW="\033[1;33m"      # Yellow
ORANGE="\033[38;5;208m"

SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]:-$0}"; )" &> /dev/null && pwd 2> /dev/null; )";

export NLS_LANG="GERMAN_GERMANY.AL32UTF8"
export NLS_DATE_FORMAT="DD.MM.YYYY HH24:MI:SS"
export JAVA_TOOL_OPTIONS="-Duser.language=en -Duser.region=US -Dfile.encoding=UTF-8"
export CUSTOM_JDBC="-XX:TieredStopAtLevel=1"

# colored output in sqlplus inside git-bash
case $(uname | tr '[:upper:]' '[:lower:]') in
mingw64_nt-10*)
  chcp.com 65001
;;
esac

echo -e "${BYELLOW}Connection:${NC}    ${WHITE}${DBFLOW_DBUSER}/${DBFLOW_DBTNS}${NC}"
echo -e "${BYELLOW}Schema:${NC}        ${WHITE}${DBFLOW_SCHEMA}${NC}"
echo -e "${BYELLOW}Targetfolder:${NC}  ${WHITE}${DBFLOW_SCHEMA_NEW}${NC}"
echo -e "${BYELLOW}Type:${NC}          ${WHITE}${DBFLOW_EXP_FOLDER}${NC}"
echo -e "${BYELLOW}Object:${NC}        ${WHITE}${DBFLOW_EXP_FNAME}${NC}"

echo -e "${CYAN}$(date '+%d.%m.%Y %H:%M:%S') >> exporting Schema ${DBFLOW_SCHEMA} to db/${DBFLOW_SCHEMA} ${NC}"
echo -e "${CYAN}$(date '+%d.%m.%Y %H:%M:%S') >> ... this may take a while ${NC}"

ANOFUNCTIONS=$( cat "${SCRIPT_DIR}/export_anonymous_function.sql" )

# the export itself
if [[ ${DBFLOW_SQLCLI} == "sqlplus" ]]; then
  ## FullExport
  PREPSTMT=":contents := to_base64(get_zip);"

  ## Or just an object
  if [[ -n ${DBFLOW_EXP_FOLDER} ]]; then
    PREPSTMT=":contents :=  to_base64(get_zip(p_folder => '${DBFLOW_EXP_FOLDER}', p_file_name => '${DBFLOW_EXP_FNAME}'));"
  fi

  sqlplus -s -l "${DBFLOW_DBUSER}/${DBFLOW_DBPASS}@${DBFLOW_DBTNS}" <<! > db/"${DBFLOW_SCHEMA}".zip.base64
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

!

else
  ## FullExport
  PREPSTMT="v_content := to_base64(get_zip);"

  ## Or just an object
  if [[ -n ${DBFLOW_EXP_FNAME} ]]; then
    PREPSTMT="v_content := to_base64(get_zip(p_folder => '${DBFLOW_EXP_FOLDER}', p_file_name => '${DBFLOW_EXP_FNAME}'));"
  fi

    sql -s -l "${DBFLOW_DBUSER}/${DBFLOW_DBPASS}@${DBFLOW_DBTNS}" <<! > db/"${DBFLOW_SCHEMA}".zip.base64
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

!

fi

if [[ -f "db/${DBFLOW_SCHEMA}.zip.base64" ]]; then
  # if grep -q "ORA-20001:" "db/${DBFLOW_SCHEMA}.zip.base64"; then
  if grep -q "ORA-.*:" "db/${DBFLOW_SCHEMA}.zip.base64"; then
    echo -e "${RED}Error detected on export${NC}"
    tput setaf 9
    cat "db/${DBFLOW_SCHEMA}.zip.base64"
    tput setaf default

    rm "db/${DBFLOW_SCHEMA}.zip.base64"
  else
    echo -e "${CYAN}$(date '+%d.%m.%Y %H:%M:%S') >> Decoding exported schema file ... ${NC}"
    base64 -d -i "db/${DBFLOW_SCHEMA}.zip.base64" > "db/${DBFLOW_SCHEMA}.zip"

    # remove base64 garbage
    rm "db/${DBFLOW_SCHEMA}.zip.base64"

  fi

  # unzip file content
  if [[ -f "db/${DBFLOW_SCHEMA}.zip" ]]; then
    echo -e "${CYAN}$(date '+%d.%m.%Y %H:%M:%S') >> Unzipping exported schema file ... ${NC}"
    unzip -o "db/${DBFLOW_SCHEMA}.zip" -d "db/${DBFLOW_SCHEMA_NEW}"
    rm "db/${DBFLOW_SCHEMA}.zip"
    echo -e "${GREEN}$(date '+%d.%m.%Y %H:%M:%S') >> export done${NC}"
  fi
fi
