#!/usr/bin/env bash

# this is our source directory
SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]:-$0}"; )" &> /dev/null && pwd 2> /dev/null; )";

# let's include some global vars like color or some methods
source "${SCRIPT_DIR}/_lib.sh"

# initialze session vars like NLS or JAVA_TOOL_OPTIONS
initialize_session;

######################################################

MDATE=`date +%d.%m.%y_%H:%M:%S,%5N`

echo -e "${CLR_LBLUE}Connection:${NC}    ${WHITE}${DBFLOW_DBUSER}/${DBFLOW_DBTNS}${NC}"
echo -e "${CLR_LBLUE}AppID:${NC}         ${WHITE}${DBFLOW_EXP_APP_ID}${NC}"
echo -e "${CLR_LBLUE}File:${NC}          ${WHITE}${DBFLOW_EXP_FNAME}${NC}"
echo -e "${CLR_LBLUE}Extension:${NC}     ${WHITE}${DBFLOW_EXP_FEXT}${NC}"
echo -e "${CLR_LBLUE}OS-Time:${NC}       ${WHITE}${MDATE}${NC}"


${DBFLOW_SQLCLI} -s -l ${DBFLOW_DBUSER}/'"'"${DBFLOW_DBPASS}"'"'@${DBFLOW_DBTNS} << EOF
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
      l_color_on   constant varchar2(200) := chr(27) || '${BSE_LVIOLETE}';
      l_color_off  constant varchar2(200) := chr(27) || '${BSE_RESET}';
    Begin
      dbms_output.put_line(l_color_on || 'DB-User:  ' || l_color_off || USER);
      dbms_output.put_line(l_color_on || 'DB-Name:  ' || l_color_off || ORA_DATABASE_NAME);
      dbms_output.put_line(l_color_on || 'DB-Time:  ' || l_color_off || SYSTIMESTAMP);
    End;
    /

    DECLARE
      v_application_id apex_applications.application_id%type;
      v_workspace_id   apex_applications.workspace_id%type;
      v_found          boolean     := false;
      l_color_off       constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '${BSE_RESET}' end;
      l_color_greenb    constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '${BSE_GREENBGR}' end;
      l_color_green     constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '${BSE_GREEN}' end;
      l_color_orangeb   constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '${BSE_ORANGEBGR}' end;
      l_color_orange    constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '${BSE_ORANGE}' end;
      l_color_redb      constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '${BSE_REDBGR}' end;
      l_color_red       constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '${BSE_RED}' end;

      l_color_blue      constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '${BSE_LVIOLETE}' end;
      l_color_dgray     constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '${BSE_DGRAY}' end;
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
                   where to_char(application_id) = '${DBFLOW_EXP_APP_ID}'
                     and replace(file_name, replace('${DBFLOW_EXP_FNAME}', '.${DBFLOW_EXP_FEXT}')) in ('.${DBFLOW_EXP_FEXT}', '.${DBFLOW_EXP_FEXT}.map', '.min.${DBFLOW_EXP_FEXT}'))
      loop
        v_found := true;
        dbms_output.put_line(l_color_orange || ' >> removing File: ' || cur.file_name || l_color_off);
        wwv_flow_api.remove_app_static_file(p_id => cur.application_file_id, p_flow_id => cur.application_id);
      end loop;

      if v_found then
        dbms_output.put_line(l_color_green || ' >> removing done' || l_color_off);
      else
        dbms_output.put_line(l_color_red || ' >> nothing found to remove' || l_color_off);
      end if;
    END;
    /

EOF

 echo -e "${CLR_ORANGE} >> you should now remove this file itself${NC}"
