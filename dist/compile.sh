#!/bin/bash

# Reset
NC="\033[0m"       # Text Reset

# Regular Colors
#RED="\033[0;31m"          # Red
#BRED="\033[1;31m"         # Red Bold
#GREEN="\033[0;32m"        # Green
#BGREEN="\033[1;32m"       # Green Bold
#YELLOW="\033[0;33m"       # Yellow
#BYELLOW="\033[1;33m"      # Yellow Bold
#BLUE="\033[0;34m"         # Blue
#BBLUE="\033[1;34m"        # Blue Bold
#PURPLE="\033[0;35m"       # Purple
#BPURPLE="\033[1;35m"      # Purple Bold
CYAN="\033[0;36m"         # Cyan
BCYAN="\033[1;36m"        # Cyan Bold
#WHITE="\033[0;37m"        # White
#BWHITE="\033[1;37m"       # White Bold

export NLS_LANG="GERMAN_GERMANY.AL32UTF8"
export NLS_DATE_FORMAT="DD.MM.YYYY HH24:MI:SS"
export LANG="de_DE.utf8"

if [[ ${DBFLOW_SQLCLI} == "sql" ]]; then
  export CUSTOM_JDBC="-XX:+TieredCompilation -XX:TieredStopAtLevel=1 -Xverify:none"
  export JAVA_TOOL_OPTIONS="-Duser.language=en -Duser.region=US -Dfile.encoding=UTF-8"
fi

# colored output in sqlplus inside git-bash
case $(uname | tr '[:upper:]' '[:lower:]') in
mingw64_nt-10*)
  chcp.com 65001
;;
esac

# connections from args
CONN_ARRY=( "$@" )


for arg in "${CONN_ARRY[@]}"; do
  echo -e "${CYAN}Compiling Connection ${arg}@${DBFLOW_DBTNS} ${NC}"

  ${DBFLOW_SQLCLI} -s -l "${arg}/${DBFLOW_DBPASS}@${DBFLOW_DBTNS}" << EOF

set scan off
set define off
set heading off
set linesize 2500
set pagesize 9999
set sqlblanklines on

set feedback off
set serveroutput on

Declare
  l_color_on   constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '[36m' end;
  l_color_off  constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '[0m' end;
Begin
  dbms_output.put_line(l_color_on || 'DB-User:   ' || l_color_off || USER);
  dbms_output.put_line(l_color_on || 'DB-Name:   ' || l_color_off || ORA_DATABASE_NAME);
  dbms_output.put_line(l_color_on || 'DB-Now:            ' || l_color_off || SYSTIMESTAMP);
  dbms_output.put_line(l_color_on || 'Compile All:    ' || l_color_off || '${DBFLOW_SQL_COMPILE_OPTION}');
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
  l_color_on   constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '[36m' end;
  l_color_off  constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '[0m' end;
Begin
  dbms_output.put_line(l_color_on || 'DB-Now:            ' || l_color_off || SYSTIMESTAMP);
End;
/

prompt

Declare
  l_errors_exists   boolean := false;
  l_color_off       constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '[0m' end;
  l_color_greenb    constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '[48;5;28m' end;
  l_color_green     constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '[1m' || chr(27) || '[38;5;28m' end;
  l_color_yellowb   constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '[48;5;202m' end;
  l_color_yellow    constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '[1m' || chr(27) || '[38;5;202m' end;
  l_color_redb      constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '[48;5;197m' end;
  l_color_red       constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '[1m' || chr(27) || '[38;5;1;197m' end;

  l_color_blue      constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '[38;5;45m' end;
  l_color_dgray     constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '[90m' end;
Begin
  for cur in (with errms as (select attribute, line||':'||position lpos, name, type,
                                    replace(substr(text, 1, instr(text, ':', 1, 1) -1), ' ') errtype,
                                    replace(substr(text, instr(text, ': ', 1, 1) + 2), chr(10), ' ') errtext,
                                    case
                                      when type = 'PACKAGE BODY' and lower(name) like 'test/_%' escape '/' then 'db/'||lower(user)||'/tests/packages/'||lower(name)||'.pkb'
                                      when type = 'PACKAGE'      and lower(name) like 'test/_%' escape '/' then 'db/'||lower(user)||'/tests/packages/'||lower(name)||'.pks'
                                      when type = 'PACKAGE BODY' and lower(name) not like 'test/_%' escape '/' then 'db/'||lower(user)||'/sources/packages/'||lower(name)||'.pkb'
                                      when type = 'PACKAGE'      and lower(name) not like 'test/_%' escape '/' then 'db/'||lower(user)||'/sources/packages/'||lower(name)||'.pks'
                                      when type = 'TYPE BODY' and lower(name) like 'test/_%' escape '/' then 'db/'||lower(user)||'/tests/types/'||lower(name)||'.tpb'
                                      when type = 'TYPE'      and lower(name) like 'test/_%' escape '/' then 'db/'||lower(user)||'/tests/types/'||lower(name)||'.tps'
                                      when type = 'TYPE BODY' and lower(name) not like 'test/_%' escape '/' then 'db/'||lower(user)||'/sources/types/'||lower(name)||'.tpb'
                                      when type = 'TYPE'      and lower(name) not like 'test/_%' escape '/' then 'db/'||lower(user)||'/sources/types/'||lower(name)||'.tps'
                                      when type = 'FUNCTION'     then 'db/'||lower(user)||'/sources/functions/'||lower(name)||'.sql'
                                      when type = 'PROCEDURE'    then 'db/'||lower(user)||'/sources/procedures/'||lower(name)||'.sql'
                                      when type = 'VIEW'         then 'db/'||lower(user)||'/views/'||lower(name)||'.sql'
                                      when type = 'TRIGGER'      then 'db/'||lower(user)||'/sources/triggers/'||lower(name)||'.sql'
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
    dbms_output.put_line(case when cur.attribute = 'WARNING' then l_color_yellowb else l_color_redb end || cur.attribute || l_color_off || ' ' ||
                         case when cur.attribute = 'WARNING' then l_color_yellow else l_color_red end || rpad(cur.errtype, cur.mlen, ' ') || ' ' ||l_color_off ||
                           cur.wsfile || ':' || rpad(cur.lpos, cur.mlpos , ' ') ||
                         ' '||l_color_blue|| cur.errtext || l_color_off
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
