#!/bin/bash

connectionTns=$1
connectionUser=$2
connectionPass=$3
targetfile=$4
wspathrelative=$5
sqlexec=$6
moveYESNO=$7

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

if [[ ${sqlexec} == "sql" ]]; then
  export CUSTOM_JDBC="-XX:+TieredCompilation -XX:TieredStopAtLevel=1 -Xverify:none"
  export JAVA_TOOL_OPTIONS="-Duser.language=en -Duser.region=US -Dfile.encoding=UTF-8"
fi


basefl=$(basename -- "${targetfile}")
extension="${basefl##*.}"


echo -e "${BYELLOW}Connection:${NC}  ${WHITE}${connectionTns}${NC}"
echo -e "${BYELLOW}Schema:${NC}      ${WHITE}${connectionUser}${NC}"
echo -e "${BYELLOW}Sourcefile:${NC}  ${WHITE}${wspathrelative}${NC}"


${sqlexec} -s -l ${connectionUser}/${connectionPass}@${connectionTns} <<!
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
ALTER SESSION SET PLSQL_WARNINGS = 'ENABLE:ALL', 'DISABLE:(5018, 7203, 6009)';

Rem Run the Sublime File
@"${targetfile}"

Rem show errors for easy correction
Rem prompt Errors

select user_errors
  from (
            select chr(27) || case when attribute = 'WARNING' then '[33m' else '[1;31m' end || attribute || chr(27) || '[0m' -- error or warning
              || ' ' ||chr(27)||case when attribute = 'WARNING' then '[33m' else '[31m' end
              || line || '/' || position -- line and column
              || ' '
              || '${wspathrelative}' -- file name
              || ':'||line || ':' || position -- line and column
              || ' '
              || replace(text, chr(10), ' ') -- remove line breaks from error text
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
                    where attribute in ('ERROR', 'WARNING') ) ;
!

if [[ ${moveYESNO} == "YES" ]]; then
  mv ${targetfile} ${targetfile/\/src\//\/dist\/}
fi