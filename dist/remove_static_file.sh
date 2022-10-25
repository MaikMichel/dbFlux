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

MDATE=`date +%d.%m.%y_%H:%M:%S,%5N`

echo -e "${BYELLOW}Connection:${NC}    ${WHITE}${DBFLOW_DBUSER}/${DBFLOW_DBTNS}${NC}"
echo -e "${BYELLOW}AppID:${NC}         ${WHITE}${DBFLOW_EXP_APP_ID}${NC}"
echo -e "${BYELLOW}File:${NC}          ${WHITE}${DBFLOW_EXP_FNAME}${NC}"
echo -e "${BYELLOW}Extension:${NC}     ${WHITE}${DBFLOW_EXP_FEXT}${NC}"
echo -e "${BYELLOW}OS-Now:${NC}        ${WHITE}${MDATE}${NC}"


${DBFLOW_SQLCLI} -s -l "${DBFLOW_DBUSER}/${DBFLOW_DBPASS}@${DBFLOW_DBTNS}" <<!
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

    Declare
      l_color_on   constant varchar2(200) := chr(27) || '[36m';
      l_color_off  constant varchar2(200) := chr(27) || '[0m';
    Begin
      dbms_output.put_line(l_color_on || 'DB-User:  ' || l_color_off || USER);
      dbms_output.put_line(l_color_on || 'DB-Name:  ' || l_color_off || ORA_DATABASE_NAME);
      dbms_output.put_line(l_color_on || 'DB-Now:   ' || l_color_off || SYSTIMESTAMP);
    End;
    /

    DECLARE
      v_application_id apex_applications.application_id%type;
      v_workspace_id   apex_applications.workspace_id%type;
      v_found          boolean     := false;
      l_color_off       constant varchar2(200) := chr(27) || '[0m';
      l_color_greenb    constant varchar2(200) := chr(27) || '[48;5;28m';
      l_color_green     constant varchar2(200) := chr(27) || '[0m' || chr(27) || '[38;5;46m';
      l_color_yellowb   constant varchar2(200) := chr(27) || '[48;5;202m';
      l_color_yellow    constant varchar2(200) := chr(27) || '[0m' || chr(27) || '[38;5;220m';
      l_color_redb      constant varchar2(200) := chr(27) || '[48;5;197m';
      l_color_red       constant varchar2(200) := chr(27) || '[0m' || chr(27) || '[38;5;1;197m';
    BEGIN
      -- determine target app and workspace
      select application_id, workspace_id
        into v_application_id, v_workspace_id
        from apex_applications
      where to_char(application_id) = '${DBFLOW_EXP_APP_ID}' or upper(alias) = upper('${DBFLOW_EXP_APP_ID}');

      apex_util.set_security_group_id (p_security_group_id => v_workspace_id);

      execute immediate 'alter session set current_schema=' || apex_application.g_flow_schema_owner;

      for cur in (select application_file_id, application_id, file_name
                    from apex_application_static_files
                   where application_id = 1201
                     and replace(lower(file_name), replace('${DBFLOW_EXP_FNAME}', '.${DBFLOW_EXP_FEXT}')) in ('.${DBFLOW_EXP_FEXT}', '.${DBFLOW_EXP_FEXT}.map', '.min.${DBFLOW_EXP_FEXT}'))
      loop
        v_found := true;
        dbms_output.put_line(l_color_yellow || ' >> removing File: ' || cur.file_name || l_color_off);
        wwv_flow_api.remove_app_static_file(p_id => cur.application_file_id, p_flow_id => cur.application_id);
      end loop;

      if v_found then
        dbms_output.put_line(l_color_green || ' >> removing done' || l_color_off);
      else
        dbms_output.put_line(l_color_red || ' >> nothing found to remove' || l_color_off);
      end if;
    END;
    /

!

 echo -e "${CYAN} >> you should now remove this file itself${NC}"
