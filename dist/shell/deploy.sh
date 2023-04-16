#!/bin/bash

# this is our source directory
SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]:-$0}"; )" &> /dev/null && pwd 2> /dev/null; )";

# let's include some global vars like color or some methods
source "${SCRIPT_DIR}/_lib.sh"

# initialze session vars like NLS or JAVA_TOOL_OPTIONS
initialize_session;

######################################################

basefl=$(basename -- "${DBFLOW_FILE}")
extension="${basefl##*.}"
MDATE=`date +%d.%m.%y_%H:%M:%S,%5N`

echo -e "${CLR_LBLUE}Connection:${NC}  ${WHITE}${DBFLOW_DBUSER}@${DBFLOW_DBTNS}${NC}"
echo -e "${CLR_LBLUE}Sourcefile:${NC}  ${WHITE}${DBFLOW_WSPACE}${NC} ${CLR_LBLUE}(Trigger only:${NC} ${WHITE}${DBFLOW_TRIGGER_ONLY}${NC}${BYELLOW})${NC}"
echo -e "${CLR_LBLUE}OS-Now:${NC}      ${WHITE}${MDATE}${NC}"

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

if [[ ${DBFLOW_TRIGGER_ONLY} == "NO" ]]; then

${DBFLOW_SQLCLI} -s -l ${DBFLOW_DBUSER}/${DBFLOW_DBPASS}@${DBFLOW_DBTNS}${DBA_OPTION} << EOF
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
  dbms_output.put_line(l_color_on || 'DB-Now:      ' || l_color_off || SYSTIMESTAMP);
End;
/


Rem enable some PL/SQL Warnings
${DBFLOW_ENABLE_WARNINGS}

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
                                              '.${extension}')) = lower('${basefl}'))
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

      # remove first line wehn empty (happening on sqlcl)
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