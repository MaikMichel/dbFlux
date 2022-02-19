#!/bin/bash

if [[ ${DBFLOW_APPID} == "NULL" ]]
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
BGREEN="\033[1;32m"       # Green
YELLOW="\033[0;33m"       # Yellow
BLUE="\033[0;34m"         # Blue
PURPLE="\033[0;35m"       # Purple
CYAN="\033[0;36m"         # Cyan
WHITE="\033[0;37m"        # White
BYELLOW="\033[1;33m"      # Yellow


export NLS_LANG="GERMAN_GERMANY.AL32UTF8"
export NLS_DATE_FORMAT="DD.MM.YYYY HH24:MI:SS"
export JAVA_TOOL_OPTIONS="-Duser.language=en -Duser.region=US -Dfile.encoding=UTF-8"
export CUSTOM_JDBC="-XX:TieredStopAtLevel=1 -Xverify:none"


echo -e "${BYELLOW}Connection:${NC}  ${WHITE}${DBFLOW_DBTNS}${NC}"
echo -e "${BYELLOW}Schema:${NC}      ${WHITE}${DBFLOW_DBUSER}${NC}"
echo -e "${BYELLOW}AppID:${NC}       ${WHITE}${DBFLOW_APPID}${NC}"

echo -e " ${CYAN}$(date '+%d.%m.%Y %H:%M:%S') >> exporting Application ${DBFLOW_APPID} to ${DBFLOW_APPFOLDER} ${NC}"

# only when target folder exists
if [[ -d ${DBFLOW_APPFOLDER} ]]; then
  cd ${DBFLOW_APPFOLDER}

  # remove folder when exists
  if [[ -d f${DBFLOW_APPID} ]]; then
    rm -rf f${DBFLOW_APPID}
  fi

  # the export itself
  sql -s -l ${DBFLOW_DBUSER}/${DBFLOW_DBPASS}@${DBFLOW_DBTNS} <<!
    apex export -applicationid ${DBFLOW_APPID} -split -skipExportDate
!

  # remove the full export file
  [[ -f f${DBFLOW_APPID}.sql ]] && rm f${DBFLOW_APPID}.sql

  echo -e "${GREEN}$(date '+%d.%m.%Y %H:%M:%S') >> export done${NC}"
else
  echo -e "${RED}$(date '+%d.%m.%Y %H:%M:%S') >> application folder ${DBFLOW_APPFOLDER} does not exist ${NC}"
fi
