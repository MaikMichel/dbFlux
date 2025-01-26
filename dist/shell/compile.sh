#!/usr/bin/env bash

# this is our source directory
SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]:-$0}"; )" &> /dev/null && pwd 2> /dev/null; )";

# let's include some global vars like color or some methods
source "${SCRIPT_DIR}/_lib.sh"

# initialze session vars like NLS or JAVA_TOOL_OPTIONS
initialize_session;

######################################################

# connections from args
CONN_ARRY=( "$@" )

# PWDs zu Array
IFS='°'
CONN_PASSES=($DBFLOW_DBPASSES)
unset IFS

for index in "${!CONN_ARRY[@]}"; do
  l_conn=${CONN_ARRY[$index]}
  l_pass=${CONN_PASSES[$index]}

  echo -e "${CLR_LBLUE}Compiling Connection ${l_conn}@${DBFLOW_DBTNS} ${NC}"
  ${DBFLOW_SQLCLI} -s -l ${l_conn}/"${l_pass}"@${DBFLOW_DBTNS} << EOF

set scan off
set define off
set heading off
set linesize 2500
set pagesize 9999
set sqlblanklines on

set feedback off
set serveroutput on

Declare
  l_color_on   constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '${BSE_LVIOLETE}' end;
  l_color_off  constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '${BSE_RESET}' end;
Begin
  dbms_output.put_line(l_color_on || rpad('DB-User:',     13, ' ') || l_color_off || USER);
  dbms_output.put_line(l_color_on || rpad('DB-Name:',     13, ' ') || l_color_off || ORA_DATABASE_NAME);
  dbms_output.put_line(l_color_on || rpad('DB-Time:',     13, ' ') || l_color_off || SYSTIMESTAMP);
  dbms_output.put_line(l_color_on || rpad('Compile All:', 13, ' ') || l_color_off || '${DBFLOW_SQL_COMPILE_OPTION}');
End;
/

Rem enable some PL/SQL Warnings
${DBFLOW_ENABLE_WARNINGS}

Begin
  dbms_utility.compile_schema(schema => USER, compile_all => ${DBFLOW_SQL_COMPILE_OPTION});
  dbms_session.reset_package;
End;
/

set serveroutput on
Declare
  l_color_on   constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '${BSE_LVIOLETE}' end;
  l_color_off  constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '${BSE_RESET}' end;
Begin
  dbms_output.put_line(l_color_on || rpad('DB-Time:',     13, ' ') || l_color_off || SYSTIMESTAMP);
End;
/

prompt

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
                                    replace(substr(text, instr(text, ': ', 1, 1) + 2), chr(10), ' ') errtext,
                                    case
                                      when type = 'PACKAGE BODY' and exists(select 1 from user_source where text like '% --%/%suite%' escape '/') then '${DBFLOW_DB_FOLDER}/'||lower(user)||'/tests/packages/'||lower(name)||'.pkb'
                                      when type = 'PACKAGE'      and exists(select 1 from user_source where text like '% --%/%suite%' escape '/') then '${DBFLOW_DB_FOLDER}/'||lower(user)||'/tests/packages/'||lower(name)||'.pks'
                                      when type = 'PACKAGE BODY' and lower(name) not like 'test/_%' escape '/' then '${DBFLOW_DB_FOLDER}/'||lower(user)||'/sources/packages/'||lower(name)||'.pkb'
                                      when type = 'PACKAGE'      and lower(name) not like 'test/_%' escape '/' then '${DBFLOW_DB_FOLDER}/'||lower(user)||'/sources/packages/'||lower(name)||'.pks'
                                      when type = 'TYPE BODY' and exists(select 1 from user_source where text like '% --%/%suite%' escape '/') then '${DBFLOW_DB_FOLDER}/'||lower(user)||'/tests/types/'||lower(name)||'.tpb'
                                      when type = 'TYPE'      and exists(select 1 from user_source where text like '% --%/%suite%' escape '/') then '${DBFLOW_DB_FOLDER}/'||lower(user)||'/tests/types/'||lower(name)||'.tps'
                                      when type = 'TYPE BODY' and lower(name) not like 'test/_%' escape '/' then '${DBFLOW_DB_FOLDER}/'||lower(user)||'/sources/types/'||lower(name)||'.tpb'
                                      when type = 'TYPE'      and lower(name) not like 'test/_%' escape '/' then '${DBFLOW_DB_FOLDER}/'||lower(user)||'/sources/types/'||lower(name)||'.tps'
                                      when type = 'FUNCTION'     then '${DBFLOW_DB_FOLDER}/'||lower(user)||'/sources/functions/'||lower(name)||'.sql'
                                      when type = 'PROCEDURE'    then '${DBFLOW_DB_FOLDER}/'||lower(user)||'/sources/procedures/'||lower(name)||'.sql'
                                      when type = 'VIEW'         then '${DBFLOW_DB_FOLDER}/'||lower(user)||'/views/'||lower(name)||'.sql'
                                      when type = 'TRIGGER'      then '${DBFLOW_DB_FOLDER}/'||lower(user)||'/sources/triggers/'||lower(name)||'.sql'
                                    end wsfile
                               from user_errors
                              where attribute in ('ERROR', '${DBFLOW_SQL_WARNING_STRING}')
                                and message_number not in (${DBFLOW_SQL_WARNING_EXCLUDE})
                                and name not like 'BIN$%' -- exclude trash
                                )
                  select attribute, lpos, name, errtype, errtext, wsfile,
                         max(length(errtype)) over () mlen, max(length(lpos)) over () mlpos
                    from errms
               order by type, name, lpos)
  loop
    l_errors_exists := true;
    dbms_output.put_line(case when cur.attribute = 'WARNING' then l_color_orangeb else l_color_redb end || cur.attribute || l_color_off || ' ' ||
                         case when cur.attribute = 'WARNING' then l_color_orange else l_color_red end || rpad(cur.errtype, cur.mlen, ' ') || ' ' ||l_color_off ||
                         l_color_dgray || cur.wsfile || ':' || rpad(cur.lpos, cur.mlpos , ' ') || l_color_off ||' ' ||
                         case when cur.attribute = 'WARNING' then l_color_orange else l_color_red end || cur.errtext || l_color_off
                         );
  end loop;

  if not l_errors_exists then
    dbms_output.put_line(l_color_greenb || 'Successfully compiled' || l_color_off || '   ' || l_color_green || SYSTIMESTAMP || l_color_off);
  else
    dbms_output.put_line('------------------------------------------------------------------------------------');
    dbms_output.put_line(l_color_dgray||'due to a bug ('||l_color_off||'#170898'||l_color_dgray||') in VSCode there are no multiline error messages at the moment'||l_color_off);
  end if;
End;
/

EOF

  echo

done
