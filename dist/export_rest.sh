#!/bin/bash

if [[ ${DBFLOW_RESTMODULE} == "NULL" ]]
then
  echo "Export canceled"
  exit 0
fi

# Reset
NC="\033[0m"       # Text Reset

# Regular Colors
BLACK="\033[0;30m"        # Black
RED="\033[0;31m"          # Red
GREEN="\033[0;32m"        # Green
BGREEN="\033[1;32m"        # Green
YELLOW="\033[0;33m"       # Yellow
BLUE="\033[0;34m"         # Blue
PURPLE="\033[0;35m"       # Purple
CYAN="\033[0;36m"         # Cyan
WHITE="\033[0;37m"        # White
BYELLOW="\033[1;33m"       # Yellow


export NLS_LANG="GERMAN_GERMANY.AL32UTF8"
export NLS_DATE_FORMAT="DD.MM.YYYY HH24:MI:SS"
export JAVA_TOOL_OPTIONS="-Duser.language=en -Duser.region=US -Dfile.encoding=UTF-8"
export CUSTOM_JDBC="-XX:TieredStopAtLevel=1"


echo -e "${BYELLOW}Connection:${NC}  ${WHITE}${DBFLOW_DBTNS}${NC}"
echo -e "${BYELLOW}Schema:${NC}      ${WHITE}${DBFLOW_DBUSER}${NC}"
echo -e "${BYELLOW}REST Modul:${NC}  ${WHITE}${DBFLOW_RESTMODULE}${NC}"

echo -e " ${BLUE}$(date '+%d.%m.%Y %H:%M:%S') >> exporting REST Module ${DBFLOW_RESTMODULE} ... ${NC}"

cd ${DBFLOW_MODULEFOLDER}
if [[ ${DBFLOW_RESTMODULE} == "SCHEMA" ]]; then
  sql -s -l ${DBFLOW_DBUSER}/${DBFLOW_DBPASS}@${DBFLOW_DBTNS} <<!
    spool ${DBFLOW_RESTMODULE}.modules.sql
    rest export
    prompt /
    spool off

!

else
  sql -s -l ${DBFLOW_DBUSER}/${DBFLOW_DBPASS}@${DBFLOW_DBTNS} <<!
    spool ${DBFLOW_RESTMODULE}/${DBFLOW_RESTMODULE}.module.sql
    rest export ${DBFLOW_RESTMODULE}
    prompt /
    spool off
!

fi

echo -e "${GREEN}$(date '+%d.%m.%Y %H:%M:%S') >> export done${NC}"
