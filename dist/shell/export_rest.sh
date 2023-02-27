#!/bin/bash

# this is our source directory
SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]:-$0}"; )" &> /dev/null && pwd 2> /dev/null; )";

# let's include some global vars like color or some methods
source "${SCRIPT_DIR}/_lib.sh"

# initialze session vars like NLS or JAVA_TOOL_OPTIONS
initialize_session;

######################################################

if [[ ${DBFLOW_RESTMODULE} == "NULL" ]]
then
  echo "Export canceled"
  exit 0
fi

echo -e "${CLR_LBLUE}Connection:${NC}  ${WHITE}${DBFLOW_DBTNS}${NC}"
echo -e "${CLR_LBLUE}Schema:${NC}      ${WHITE}${DBFLOW_DBUSER}${NC}"
echo -e "${CLR_LBLUE}REST Modul:${NC}  ${WHITE}${DBFLOW_RESTMODULE}${NC}"

echo -e "${CLR_LBLUE}$(date '+%d.%m.%Y %H:%M:%S') >> exporting REST Module ${DBFLOW_RESTMODULE} ... ${NC}"

cd ${DBFLOW_MODULEFOLDER}
if [[ ${DBFLOW_RESTMODULE} == "SCHEMA" ]]; then
  sql -s -l ${DBFLOW_DBUSER}/${DBFLOW_DBPASS}@${DBFLOW_DBTNS} << EOF
    spool "${DBFLOW_RESTMODULE}.modules.sql"
    rest export
    prompt /
    spool off

EOF

else
  sql -s -l ${DBFLOW_DBUSER}/${DBFLOW_DBPASS}@${DBFLOW_DBTNS} << EOF
    spool "${DBFLOW_RESTMODULE}/${DBFLOW_RESTMODULE}.module.sql"
    rest export ${DBFLOW_RESTMODULE}
    prompt /
    spool off
EOF

fi

echo -e "${CLR_GREEN}$(date '+%d.%m.%Y %H:%M:%S') >> export done${NC}"
