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

array+=("set feedback off")
array+=("prompt compiling schema")
array+=("exec dbms_utility.compile_schema(schema => USER, compile_all => false);")
array+=("exec dbms_session.reset_package;")
array+=("prompt executing Tests")
array+=("set serveroutput on")
array+=("exec ut.run(a_color_console => true);")

if [[ -n ${DBFLOW_CONN_DATA} ]]; then
  echo
  echo -e "${BCYAN}Executing tests on DATA - Schema${NC}"

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
  echo -e "${BCYAN}Executing tests on LOGIC - Schema${NC}"

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
  echo -e "${BCYAN}Executing tests on APP - Schema${NC}"

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
