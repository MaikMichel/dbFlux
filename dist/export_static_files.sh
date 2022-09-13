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
echo -e "${BYELLOW}AppID:${NC}         ${WHITE}${DBFLOW_EXP_APP_ID}${NC}"
echo -e "${BYELLOW}File:${NC}          ${WHITE}${DBFLOW_EXP_FNAME}${NC}"
echo -e "${BYELLOW}Target:${NC}        ${WHITE}${DBFLOW_EXP_PATH}${NC}"

echo -e "${CYAN}$(date '+%d.%m.%Y %H:%M:%S') >> exporting Files from ${DBFLOW_EXP_APP_ID} to static/${DBFLOW_EXP_APP_ID}/src ${NC}"
echo -e "${CYAN}$(date '+%d.%m.%Y %H:%M:%S') >> ... this may take a while ${NC}"

## FullExport
PREPSTMT=":contents := to_base64(get_zip(p_app_id => ${DBFLOW_EXP_APP_ID}));"

## Or just an object
if [[ -n ${DBFLOW_EXP_FNAME} ]]; then
  PREPSTMT=":contents :=  to_base64(get_zip(p_app_id => ${DBFLOW_EXP_APP_ID}, p_file_name => '${DBFLOW_EXP_FNAME}'));"
fi

ANOFUNCTIONS=$( cat "${SCRIPT_DIR}/export_app_static_function.sql" )


# the export itself
${DBFLOW_SQLCLI} -s -l "${DBFLOW_DBUSER}/${DBFLOW_DBPASS}@${DBFLOW_DBTNS}" <<! > "${DBFLOW_EXP_PATH}".zip.base64
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

if [[ -f "${DBFLOW_EXP_PATH}.zip.base64" ]]; then
  echo -e "${CYAN}$(date '+%d.%m.%Y %H:%M:%S') >> Decoding exported static file ... ${NC}"

  if grep -q "ORA-20001:" "${DBFLOW_EXP_PATH}.zip.base64"; then
    echo -e "${RED}Error detected on export${NC}"
    echo -e "${ORANGE}Opening output${NC}"
    mv "${DBFLOW_EXP_PATH}.zip.base64" "${DBFLOW_EXP_PATH}.log"
    code "${DBFLOW_EXP_PATH}.log"
  elif grep -q "ORA-20002:" "${DBFLOW_EXP_PATH}.zip.base64"; then
    echo -e "${RED}Nothing to export${NC}"
    echo -e "${ORANGE}Opening output${NC}"
    mv "${DBFLOW_EXP_PATH}.zip.base64" "${DBFLOW_EXP_PATH}.log"
    code "${DBFLOW_EXP_PATH}.log"
  else
    base64 -di "${DBFLOW_EXP_PATH}.zip.base64" > "${DBFLOW_EXP_PATH}.zip"

    # remove base64 garbage
    if [[ -f "${DBFLOW_EXP_PATH}.zip.base64" ]]; then
      rm "${DBFLOW_EXP_PATH}.zip.base64"
    fi
  fi

  # unzip file content
  if [[ -f "${DBFLOW_EXP_PATH}.zip" ]]; then
    echo -e "${CYAN}$(date '+%d.%m.%Y %H:%M:%S') >> Unzipping exported schema file ... ${NC}"
    unzip -o "${DBFLOW_EXP_PATH}.zip" -d "${DBFLOW_EXP_PATH}"
    rm "${DBFLOW_EXP_PATH}.zip"
    echo -e "${GREEN}$(date '+%d.%m.%Y %H:%M:%S') >> export done${NC}"
  fi
fi
