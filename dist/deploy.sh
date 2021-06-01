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


echo -e "${BYELLOW}Connection:${NC}  ${WHITE}${DBFLOW_DBTNS}${NC}"
echo -e "${BYELLOW}Schema:${NC}      ${WHITE}${DBFLOW_DBUSER}${NC}"
echo -e "${BYELLOW}Sourcefile:${NC}  ${WHITE}${DBFLOW_WSPACE}${NC}"


${DBFLOW_SQLCLI} -s -l ${DBFLOW_DBUSER}/${DBFLOW_DBPASS}@${DBFLOW_DBTNS} <<!
WHENEVER SQLERROR EXIT SQL.SQLCODE
set linesize 2500
set tab off
set serveroutput on
set scan off
set define off
set pagesize 9999
set trim on
set heading off

set feedback off
Begin
  dbms_output.put_line(chr(27) || '[36m' || 'DB-User:     '|| chr(27) || '[0m'||USER);
  dbms_output.put_line(chr(27) || '[36m' || 'DB-Name:     '|| chr(27) || '[0m'||ORA_DATABASE_NAME);
  dbms_output.put_line(chr(27) || '[36m' || 'Now:         '|| chr(27) || '[0m'||SYSTIMESTAMP);
End;
/


Rem enable some PL/SQL Warnings
${DBFLOW_ENABLE_WARNINGS}

Rem Run the Sublime File
@"${DBFLOW_FILE}"

Rem show errors for easy correction
Rem prompt Errors

select user_errors
  from (
            select chr(27) || case when attribute = 'WARNING' then '[1;33m' else '[1;31m' end || attribute || chr(27) || '[0m' -- error or warning
              || ' ' ||chr(27)||case when attribute = 'WARNING' then '[33m' else '[31m' end
              || ' ' ||substr(text, 1, instr(text, ':', 1, 1) -1)||chr(10) -- code
              || '${DBFLOW_WSPACE}' -- file name
              || ':'||line || ':' || position ||chr(10) -- line and column
              || replace(substr(text, instr(text, ': ', 1, 1) + 2), chr(10), ' ') -- remove line breaks from error text
              || chr(27) || '[0m'
              as user_errors
            from user_errors
            where attribute in ('ERROR', 'WARNING')
              and lower(name||'.${extension}') = lower('${basefl}')
            order by type, name, line, position)
 union
select chr(27) || '[1;32m' || 'Successful   ' || chr(27) || '[0m' || chr(27) || '[32m' || SYSTIMESTAMP||chr(27) || '[0m'
  from dual
 where not exists (select 1
                     from user_errors
                    where attribute in ('ERROR', 'WARNING')
                      and lower(name||'.${extension}') = lower('${basefl}')) ;
!

# if [ $? -ne 0 ]
# then
#   echo -e "${BRED}Error when executing ${DBFLOW_FILE} ${NC}"
#   echo
# else

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
      for element in "${array[@]}"
      do
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
      for element in "${array[@]}"
      do
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
    # debug
    for element in "${array[@]}"
    do
      echo -e "${BCYAN}$element${NC}"
    done

    ${DBFLOW_SQLCLI} -s -l ${DBFLOW_CONN_APP} << !
    $(
      for element in "${array[@]}"
      do
        echo "$element"
      done
    )
!

    echo
  fi
  echo -e "-----------------------------------------------------"
  echo

# fi