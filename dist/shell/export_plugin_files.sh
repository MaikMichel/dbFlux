#!/usr/bin/env bash

# this is our source directory
SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]:-$0}"; )" &> /dev/null && pwd 2> /dev/null; )";

# let's include some global vars like color or some methods
source "${SCRIPT_DIR}/_lib.sh"

# initialze session vars like NLS or JAVA_TOOL_OPTIONS
initialize_session;

######################################################

printf "${CLR_LBLUE}Connection:${NC}    ${WHITE}${DBFLOW_DBUSER}/${DBFLOW_DBTNS}${NC}\n"
printf "${CLR_LBLUE}AppID:${NC}         ${WHITE}${DBFLOW_EXP_APP_ID}${NC}\n"
printf "${CLR_LBLUE}PluginID:${NC}      ${WHITE}${DBFLOW_EXP_PLG_ID}${NC}\n"
printf "${CLR_LBLUE}File:${NC}          ${WHITE}${DBFLOW_EXP_FNAME}${NC}\n"
printf "${CLR_LBLUE}Target:${NC}        ${WHITE}${DBFLOW_EXP_PATH}${NC}\n"
echo
printf "${CLR_LBLUE}$(date '+%d.%m.%Y %H:%M:%S') >> exporting Files from ${DBFLOW_EXP_APP_ID}/${DBFLOW_EXP_PLG_ID} to plugin/${DBFLOW_EXP_APP_ID}/${DBFLOW_EXP_PLG_ID}/src ${NC}\n"
printf "${CLR_LBLUE}$(date '+%d.%m.%Y %H:%M:%S') >> ... this may take a while ${NC}\n"


ANOFUNCTIONS=$( cat "${SCRIPT_DIR}/../sql/export_app_static_function.sql" )

# the export itself
if [[ ${DBFLOW_SQLCLI} == "sqlplus" ]]; then
  ## FullExport
  PREPSTMT=":contents := to_base64(get_plugin_zip(p_app_id => ${DBFLOW_EXP_APP_ID}, p_plugin_name => '${DBFLOW_EXP_PLG_ID}'));"

  ## Or just an object
  if [[ -n ${DBFLOW_EXP_FNAME} ]]; then
    PREPSTMT=":contents :=  to_base64(get_plugin_zip(p_app_id => ${DBFLOW_EXP_APP_ID}, p_plugin_name => '${DBFLOW_EXP_PLG_ID}', p_file_name => '${DBFLOW_EXP_FNAME}'));"
  fi

  sqlplus -s -l ${DBFLOW_DBUSER}/'"'"${DBFLOW_DBPASS}"'"'@${DBFLOW_DBTNS} <<! > "${DBFLOW_EXP_PATH}".zip.base64
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
  PREPSTMT="v_content := to_base64(get_plugin_zip(p_app_id => ${DBFLOW_EXP_APP_ID}, p_plugin_name => '${DBFLOW_EXP_PLG_ID}'));"

  ## Or just an object
  if [[ -n ${DBFLOW_EXP_FNAME} ]]; then
    PREPSTMT="v_content := to_base64(get_plugin_zip(p_app_id => ${DBFLOW_EXP_APP_ID}, p_plugin_name => '${DBFLOW_EXP_PLG_ID}', p_file_name => '${DBFLOW_EXP_FNAME}'));"
  fi

  sql -s -l ${DBFLOW_DBUSER}/'"'"${DBFLOW_DBPASS}"'"'@${DBFLOW_DBTNS} <<! > "${DBFLOW_EXP_PATH}".zip.base64
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


 if [[ -f "${DBFLOW_EXP_PATH}.zip.base64" ]]; then
   #if grep -q "ORA-20001:" "${DBFLOW_EXP_PATH}.zip.base64"; then
   if grep -q "ORA-.*:" "${DBFLOW_EXP_PATH}.zip.base64"; then
     printf "${CLR_REDBGR}Error detected on export${NC}\n"
     tput setaf 9
     cat "${DBFLOW_EXP_PATH}.zip.base64"
     tput setaf default

     rm "${DBFLOW_EXP_PATH}.zip.base64"
   else
     printf "${CLR_LBLUE}$(date '+%d.%m.%Y %H:%M:%S') >> Decoding exported static file ... ${NC}\n"
     base64 -d -i "${DBFLOW_EXP_PATH}.zip.base64" > "${DBFLOW_EXP_PATH}.zip"

     # remove base64 garbage
     rm "${DBFLOW_EXP_PATH}.zip.base64"
   fi

   # unzip file content
   if [[ -f "${DBFLOW_EXP_PATH}.zip" ]]; then
     printf "${CLR_LBLUE}$(date '+%d.%m.%Y %H:%M:%S') >> Unzipping exported schema file ... ${NC}\n"
     unzip -o "${DBFLOW_EXP_PATH}.zip" -d "${DBFLOW_EXP_PATH}"
     rm "${DBFLOW_EXP_PATH}.zip"
     printf "${CLR_GREEN}$(date '+%d.%m.%Y %H:%M:%S') >> export done${NC}\n"
   fi
 fi

#############################################################################################################################
