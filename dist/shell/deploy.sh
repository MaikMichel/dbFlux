#!/bin/bash

# this is our source directory
SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]:-$0}"; )" &> /dev/null && pwd 2> /dev/null; )";

# let's include some global vars like color or some methods
source "${SCRIPT_DIR}/_lib.sh"

# initialze session vars like NLS or JAVA_TOOL_OPTIONS
initialize_session;

######################################################

basefl=$(basename -- "${DBFLOW_FILE}")
basepath=$(pwd)
extension="${basefl##*.}"
MDATE=`date +%d.%m.%y_%H:%M:%S,%5N`

echo -e "${CLR_LBLUE}Connection:${NC}  ${WHITE}${DBFLOW_DBUSER}@${DBFLOW_DBTNS}${NC}"
echo -e "${CLR_LBLUE}Sourcefile:${NC}  ${WHITE}${DBFLOW_WSPACE}${NC} ${CLR_LBLUE}(Trigger only:${NC} ${WHITE}${DBFLOW_TRIGGER_ONLY}${NC}${BYELLOW})${NC}"
echo -e "${CLR_LBLUE}OS-Time:${NC}     ${WHITE}${MDATE}${NC}"

# define settings array
settings=()
settings+=( "WHENEVER SQLERROR EXIT SQL.SQLCODE" )
settings+=( "    set linesize 2500" )
settings+=( "    set tab off" )
settings+=( "    set serveroutput on" )
settings+=( "    set pagesize 9999" )
settings+=( "    set trim on" )
settings+=( "    set sqlblanklines on" )

# define setting for writing output to file
call_settings=()
call_settings+=( "set verify off" )
call_settings+=( "set scan off" )
call_settings+=( "set feedback off" )
call_settings+=( "set heading off" )
call_settings+=( "set trimout on" )
call_settings+=( "set trimspool on" )
call_settings+=( "set pagesize 0" )
call_settings+=( "set linesize 5000" )
call_settings+=( "set long 100000000" )
call_settings+=( "set longchunksize 32767" )
call_settings+=( "whenever sqlerror exit sql.sqlcode rollback" )

# used when admin user is sys
DBA_OPTION=""
if [[ ${DBFLOW_DBUSER} == "sys" ]]; then
  DBA_OPTION=" as sysdba"
fi

use_error_log=()
install_apex=()
read_error_log=()
if [[ ${DBFLOW_USE_SLOG} == "YES" ]]; then
  use_error_log+=( "set errorlogging on" )
  use_error_log+=( "truncate table sperrorlog;" )
  use_error_log+=( "set errorlogging on" )

  read_error_log+=( "for cur in (with errms as (select 'ERROR' attribute, '1:1' lpos, '${DBFLOW_WSPACE}' name, 'SQL' type," )
  read_error_log+=( "                                  replace(substr(message, 1, instr(message, ':', 1, 1) -1), ' ') errtype," )
  read_error_log+=( "                                  replace(substr(message, instr(message, ': ', 1, 1) + 2), chr(10), ' ') errtext" )
  read_error_log+=( "                            from sperrorlog)" )
  read_error_log+=( "                select attribute, lpos, name, errtype, errtext, max(length(errtype)) over () mlen, max(length(lpos)) over () mlpos" )
  read_error_log+=( "                  from errms" )
  read_error_log+=( "            order by type, name, lpos)" )
  read_error_log+=( "loop" )
  read_error_log+=( "  l_errors_exists := true;" )
  read_error_log+=( "  dbms_output.put_line(case when cur.attribute = 'WARNING' then l_color_orangeb else l_color_redb end || cur.attribute || l_color_off || ' ' ||" )
  read_error_log+=( "                      case when cur.attribute = 'WARNING' then l_color_orange else l_color_red end || rpad(cur.errtype, cur.mlen, ' ') || ' ' ||l_color_off ||" )
  read_error_log+=( "                      l_color_dgray || '${DBFLOW_WSPACE}' || ':' || rpad(cur.lpos, cur.mlpos , ' ') || l_color_off ||' ' ||" )
  read_error_log+=( "                      case when cur.attribute = 'WARNING' then l_color_orange else l_color_red end || cur.errtext || l_color_off);" )
  read_error_log+=( "end loop;" )
fi

if [[ ${DBFLOW_TARGET_APP_ID:-0} -gt 0 ]]; then
  DBFLOW_FILE_PATH=$(dirname "${DBFLOW_FILE}")
  DBFLOW_FILE=$(basename "${DBFLOW_FILE}")

  cd "${DBFLOW_FILE_PATH}"
  if [[ -f "application/set_environment.sql" ]]; then
    if [[ $(uname) == "Darwin" ]]; then
      # on macos the -P parameter does not exist for grep, so we use sed instead
      ORIGINAL_APP_ID=$(grep -oE "p_default_application_id=>([^[:space:]]+)" "application/set_environment.sql" | sed 's/.*>\(.*\)/\1/')
    else
      ORIGINAL_APP_ID=$(grep -oP 'p_default_application_id=>\K\d+' "application/set_environment.sql")
    fi
  else
    echo -e "${CLR_REDBGR}Error: Not a valid export folder ${DBFLOW_FILE_PATH} ${NC}"
    exit 1
  fi

  echo -e "${CLR_LBLUE}> APP-ID:${NC}    ${WHITE}${DBFLOW_TARGET_APP_ID}${NC}"
  echo -e "${CLR_LBLUE}> Workspace:${NC} ${WHITE}${DBFLOW_TARGET_WORKSP}${NC}"
  install_apex+=( "begin" )
  install_apex+=( " apex_application_install.set_workspace('${DBFLOW_TARGET_WORKSP}');" )
  install_apex+=( " apex_application_install.set_application_id(${DBFLOW_TARGET_APP_ID});" )
  install_apex+=( " " );
  install_apex+=( " if ${DBFLOW_TARGET_APP_ID} != nvl(${ORIGINAL_APP_ID}, 0) then" );
  install_apex+=( "   apex_application_install.generate_offset;" );
  install_apex+=( " end if;" );
  install_apex+=( " " );
  install_apex+=( " apex_application_install.set_schema(upper(user));" );
  install_apex+=( " " );
  install_apex+=( "end;" )
  install_apex+=( "/" )
fi

ORIGINAL_APP_ID=${ORIGINAL_APP_ID:-0}

if [[ ${DBFLOW_TRIGGER_ONLY} == "NO" ]]; then

${DBFLOW_SQLCLI} -s -l ${DBFLOW_DBUSER}/'"'"${DBFLOW_DBPASS}"'"'@${DBFLOW_DBTNS}${DBA_OPTION} << EOF
$(
  for element in "${settings[@]}"
  do
    echo "$element"
  done
)

set scan off
set define off
set heading off
set feedback off

Declare
  l_color_on   constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '${BSE_LVIOLETE}' end;
  l_color_off  constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '${BSE_RESET}' end;
Begin
  dbms_output.put_line(l_color_on || 'DB-User:     ' || l_color_off || USER);
  dbms_output.put_line(l_color_on || 'DB-Name:     ' || l_color_off || ORA_DATABASE_NAME);
  dbms_output.put_line(l_color_on || 'DB-Time:     ' || l_color_off || SYSTIMESTAMP);
End;
/


Rem enable some PL/SQL Warnings
${DBFLOW_ENABLE_WARNINGS}

REM use error log or not
$(
  for element in "${use_error_log[@]}"
  do
    echo "$element"
  done
)

REM initialize APEX Application Install Settings
$(
  for element in "${install_apex[@]}"
  do
    echo "$element"
  done
)

Rem Run the Sublime File
set feedback on
@"${DBFLOW_FILE}"
set feedback off
Rem show errors for easy correction
Rem prompt Errors

Declare
  l_errors_exists   boolean := false;
  l_color_off       constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '${BSE_RESET}' end;
  l_color_greenb    constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '${BSE_GREENBGR}' end;
  l_color_green     constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '${BSE_GREEN}' end;
  l_color_orangeb   constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '${BSE_ORANGEBGR}' end;
  l_color_orange    constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '${BSE_ORANGE}' end;
  l_color_redb      constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '${BSE_REDBGR}' end;
  l_color_red       constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '${BSE_RED}' end;

  l_color_blue      constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '${BSE_LVIOLETE}' end;
  l_color_dgray     constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '${BSE_DGRAY}' end;
Begin
  for cur in (with errms as (select attribute, line||':'||position lpos, name, type,
                                    replace(substr(text, 1, instr(text, ':', 1, 1) -1), ' ') errtype,
                                    replace(substr(text, instr(text, ': ', 1, 1) + 2), chr(10), ' ') errtext
                               from user_errors
                              where attribute in ('ERROR', 'WARNING')
                                and lower(name||decode(type, 'PACKAGE', '.pks',
                                              'PACKAGE BODY', '.pkb',
                                              'TYPE', '.tps',
                                              'TYPE BODY', '.tpb',
                                              '.${extension}')) = lower('${basefl}')
                                and nvl(${ORIGINAL_APP_ID}, 0) = 0)
                  select attribute, lpos, name, errtype, errtext, max(length(errtype)) over () mlen, max(length(lpos)) over () mlpos
                    from errms
               order by type, name, lpos)
  loop
    l_errors_exists := true;
    dbms_output.put_line(case when cur.attribute = 'WARNING' then l_color_orangeb else l_color_redb end || cur.attribute || l_color_off || ' ' ||
                         case when cur.attribute = 'WARNING' then l_color_orange else l_color_red end || rpad(cur.errtype, cur.mlen, ' ') || ' ' ||l_color_off ||
                         l_color_dgray || '${DBFLOW_WSPACE}' || ':' || rpad(cur.lpos, cur.mlpos , ' ') || l_color_off ||' ' ||
                         case when cur.attribute = 'WARNING' then l_color_orange else l_color_red end || cur.errtext || l_color_off
                         );

  end loop;

$(
  for element in "${read_error_log[@]}"
  do
    echo "$element"
  done
)

  if not l_errors_exists then
    dbms_output.put_line(l_color_greenb || 'Successful' || l_color_off || '   ' || l_color_green || SYSTIMESTAMP || l_color_off);
  else
    dbms_output.put_line('------------------------------------------------------------------------------------');
    dbms_output.put_line(l_color_dgray||'due to a bug ('||l_color_off||'#170898'||l_color_dgray||') in VSCode there are no multiline error messages at the moment'||l_color_off);
  end if;
End;
/

EOF

fi

if [ $? -ne 0 ]
then
  echo -e "${CLR_REDBGR}Error when executing ${DBFLOW_FILE} ${NC}"
  echo
else

  if [[ ${DBFLOW_TARGET_APP_ID:-0} -gt 0 ]]; then
    cd "${basepath}"
  fi

  if [[ ${DBFLOW_MOVEYN} == "YES" ]]; then
    target=${DBFLOW_FILE/\/src\//\/dist\/}
    target_dir=$(dirname "${target}")
    mkdir -p "${target_dir}"
    mv "${DBFLOW_FILE}" "${target}"
  fi

  if [[ -n ${DBFLOW_CONN_CALLS} ]]; then
    ANOFUNCTIONS=$( cat "${SCRIPT_DIR}/../sql/call_methods_function.sql" )
    echo
    echo -e "${CLR_LBLUE}Calling additional methods ... ${NC}"

    IFS='°' read -r -a connection <<< "${DBFLOW_CONN_CALLS}"
    IFS='°' read -r -a methods <<< "${DBFLOW_METHOD_CALLS}"
    IFS='°' read -r -a tfiles <<< "${DBFLOW_METHOD_TFILES}"

    for i in "${!connection[@]}"; do
      echo -e "${CLR_LBLUE}Write Method: ${methods[$i]} to File: ${tfiles[$i]}${NC}"
      ${DBFLOW_SQLCLI} -s -l ${connection[$i]} << EOF > "${tfiles[$i]}"
      $(
        for call_setting in "${call_settings[@]}"
        do
          echo "$call_setting"
        done

        if [[ ${DBFLOW_SQLCLI} == "sqlplus" ]]; then
          echo "variable contents clob"
        else
          echo "set serveroutput on"
        fi

        echo "DECLARE"
        echo "  ${ANOFUNCTIONS}"
        echo "BEGIN"

        if [[ ${DBFLOW_SQLCLI} == "sqlplus" ]]; then
         echo "  :contents := ${methods[$i]};"
        else
         echo "  print_clob_to_output(${methods[$i]});"
        fi

        echo "END;"
        echo "/"

        if [[ ${DBFLOW_SQLCLI} == "sqlplus" ]]; then
          echo "print contents"
        fi
      )

EOF

      # remove first line when empty (happening on sqlcl)
      sed -i~ -e '2,$b' -e '/^$/d;' ${tfiles[$i]}

      # run file
      echo -e "${CLR_LBLUE}Running File: ${tfiles[$i]}${NC}"
      ${DBFLOW_SQLCLI} -s -l ${connection[$i]} << EOF
      $(
        for element in "${settings[@]}"
        do
          echo "$element"
        done

        # echo "Prompt :: calling ${tfiles[$i]}"
        echo "@${tfiles[$i]}"
      )

EOF
      done

    echo
  fi

  if [[ -n ${DBFLOW_CONN_RUNS} ]]; then
    echo
    echo -e "${CLR_LBLUE}Running additional files ... ${NC}"

    IFS=',' read -r -a connection <<< "${DBFLOW_CONN_RUNS}"
    IFS=',' read -r -a files <<< "${DBFLOW_FILE_RUNS}"

    for i in "${!connection[@]}"; do
      ${DBFLOW_SQLCLI} -s -l ${connection[$i]} << EOF
      $(
        for element in "${settings[@]}"
        do
          echo "$element"
        done

        echo "Prompt :: calling ${files[$i]}"
        echo "${files[$i]}"
      )

EOF

    done

    echo
  fi

  if [[ -n $DBFLOW_ADDITIONAL_OUTPUT ]]; then
    echo -e ${CLR_LBLUE}${DBFLOW_ADDITIONAL_OUTPUT}${NC}
  fi
  echo
fi