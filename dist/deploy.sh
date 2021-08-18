#!/bin/bash

# Reset
NC="\033[0m"       # Text Reset

# Regular Colors
RED="\033[0;31m"          # Red
BRED="\033[1;31m"         # Red Bold
GREEN="\033[0;32m"        # Green
BGREEN="\033[1;32m"       # Green Bold
YELLOW="\033[0;33m"       # Yellow
BYELLOW="\033[1;33m"      # Yellow Bold
BLUE="\033[0;34m"         # Blue
BBLUE="\033[1;34m"        # Blue Bold
PURPLE="\033[0;35m"       # Purple
BPURPLE="\033[1;35m"      # Purple Bold
CYAN="\033[0;36m"         # Cyan
BCYAN="\033[1;36m"        # Cyan Bold
WHITE="\033[0;37m"        # White
BWHITE="\033[1;37m"       # White Bold

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



basefl=$(basename -- "${DBFLOW_FILE}")
extension="${basefl##*.}"
MDATE=`date +%d.%m.%y_%H:%M:%S,%5N`

echo -e "${BYELLOW}Connection:${NC}  ${WHITE}${DBFLOW_DBUSER}@${DBFLOW_DBTNS}${NC}"
echo -e "${BYELLOW}Sourcefile:${NC}  ${WHITE}${DBFLOW_WSPACE}${NC}"
echo -e "${BYELLOW}OS-Now:${NC}      ${WHITE}${MDATE}${NC}"

# define settings array
settings=()
settings+=( "WHENEVER SQLERROR EXIT SQL.SQLCODE" )
settings+=( "    set linesize 2500" )
settings+=( "    set tab off" )
settings+=( "    set serveroutput on" )
settings+=( "    set pagesize 9999" )
settings+=( "    set trim on" )
settings+=( "    set sqlblanklines on" )


${DBFLOW_SQLCLI} -s -l ${DBFLOW_DBUSER}/${DBFLOW_DBPASS}@${DBFLOW_DBTNS} <<!
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
  l_color_on   constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '[36m' end;
  l_color_off  constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '[0m' end;
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
  l_color_off       constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '[0m' end;
  l_color_greenb    constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '[48;5;28m' end;
  l_color_green     constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '[1m' || chr(27) || '[38;5;28m' end;
  l_color_yellowb   constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '[48;5;202m' end;
  l_color_yellow    constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '[1m' || chr(27) || '[38;5;202m' end;
  l_color_redb      constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '[48;5;197m' end;
  l_color_red       constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '[1m' || chr(27) || '[38;5;1;197m' end;

  l_color_blue      constant varchar2(200) := case when ${DBFLOW_COLOR_ON} then chr(27) || '[38;5;45m' end;
Begin
  for cur in (select attribute, text, line, position, name
                from user_errors
               where attribute in ('ERROR', 'WARNING')
                 and lower(name||decode(type, 'PACKAGE', '.pks', 'PACKAGE BODY', '.pkb', '.${extension}')) = lower('${basefl}')
               order by type, name, line, position)
  loop
    l_errors_exists := true;
    dbms_output.put_line(case when cur.attribute = 'WARNING' then l_color_yellowb else l_color_redb end ||
                         cur.attribute || l_color_off || ' ' ||
                         case when cur.attribute = 'WARNING' then l_color_yellow else l_color_red end ||
                         substr(cur.text, 1, instr(cur.text, ':', 1, 1) -1) || l_color_off);
    dbms_output.put_line(l_color_blue|| '${DBFLOW_WSPACE}' || ':' || cur.line || ':' || cur.position || l_color_off);
    dbms_output.put_line(replace(substr(cur.text, instr(cur.text, ': ', 1, 1) + 2), chr(10), ' '));
  end loop;

  if not l_errors_exists then
    dbms_output.put_line(l_color_greenb || 'Successful' || l_color_off || '   ' || l_color_green || SYSTIMESTAMP || l_color_off);
  end if;
End;
/



!

if [ $? -ne 0 ]
then
  echo -e "${BRED}Error when executing ${DBFLOW_FILE} ${NC}"
  echo
else

  if [[ ${DBFLOW_MOVEYN} == "YES" ]]; then
    target=${DBFLOW_FILE/\/src\//\/dist\/}
    target_dir=$(dirname "${target}")
    mkdir --parents ${target_dir}
    mv ${DBFLOW_FILE} ${target}
  fi

  if [[ -n ${DBFLOW_CONN_DATA} ]]; then
    echo
    echo -e "${BCYAN}Running additional files in DATA-SCHEMA${NC}"

    IFS=',' read -r -a array <<< "${DBFLOW_FILE_DATA}"

    ${DBFLOW_SQLCLI} -s -l ${DBFLOW_CONN_DATA} <<!
    $(
      for element in "${settings[@]}"
      do
        echo "$element"
      done
    )

    $(
      for element in "${array[@]}"
      do
        echo "Prompt:: calling $element"
        echo "$element"
      done
    )
!

    echo
  fi

  if [[ -n ${DBFLOW_CONN_LOGIC} ]]; then
    echo
    echo -e "${BCYAN}Running additional files in LOGIC-SCHEMA${NC}"

    IFS=',' read -r -a array <<< "${DBFLOW_FILE_LOGIC}"

    ${DBFLOW_SQLCLI} -s -l ${DBFLOW_CONN_LOGIC} <<!
    $(
      for element in "${settings[@]}"
      do
        echo "$element"
      done
    )

    $(
      for element in "${array[@]}"
      do
        echo "Prompt:: calling $element"
        echo "$element"
      done
    )
!

    echo
  fi

  if [[ -n ${DBFLOW_CONN_APP} ]]; then
    echo
    echo -e "${BCYAN}Running additional files in APP-SCHEMA${NC}"

    IFS=',' read -r -a array <<< "${DBFLOW_FILE_APP}"

    ${DBFLOW_SQLCLI} -s -l ${DBFLOW_CONN_APP} << !
    $(
      for element in "${settings[@]}"
      do
        echo "$element"
      done
    )

    $(
      for element in "${array[@]}"
      do
        echo "Prompt:: calling $element"
        echo "$element"
      done
    )
!

    echo
  fi
  echo -e "-----------------------------------------------------"
  echo

fi