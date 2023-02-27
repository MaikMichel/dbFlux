#!/bin/bash

# this is our source directory
SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]:-$0}"; )" &> /dev/null && pwd 2> /dev/null; )";

# let's include some global vars like color or some methods
source "${SCRIPT_DIR}/_lib.sh"

# initialze session vars like NLS or JAVA_TOOL_OPTIONS
initialize_session;

######################################################

if [[ ${DBFLOW_APPID} == "NULL" ]]
then
  echo "Export canceled"
  exit 0
fi


echo -e "${CLR_LBLUE}Connection:${NC}  ${WHITE}${DBFLOW_DBTNS}${NC}"
echo -e "${CLR_LBLUE}Schema:${NC}      ${WHITE}${DBFLOW_DBUSER}${NC}"
echo -e "${CLR_LBLUE}AppID:${NC}       ${WHITE}${DBFLOW_APPID}${NC}"
echo -e "${CLR_LBLUE}Folder:${NC}      ${WHITE}${DBFLOW_APPFOLDER}${NC}"
echo
echo -e "${CLR_LBLUE}$(date '+%d.%m.%Y %H:%M:%S') >> exporting Application ${DBFLOW_APPID} to ${DBFLOW_APPFOLDER} ${NC}"

# only when target folder exists
if [[ -d ${DBFLOW_APPFOLDER} ]]; then
  cd ${DBFLOW_APPFOLDER}

  for d in f${DBFLOW_APPID} ; do
    DBFLOW_DIR_APPID="${d/f}"

    # remove folder when exists
    if [[ -d "f${DBFLOW_DIR_APPID}" ]]; then
      mv "f${DBFLOW_DIR_APPID}" "f${DBFLOW_DIR_APPID}_bck"
    fi

    # the export itself
    sql -s -l ${DBFLOW_DBUSER}/${DBFLOW_DBPASS}@${DBFLOW_DBTNS} << EOF
      apex export -applicationid ${DBFLOW_DIR_APPID} -split -skipExportDate
EOF

    if [[ $? -ne 0 ]]; then
      echo -e "${CLR_REDBGR}$(date '+%d.%m.%Y %H:%M:%S') >> something went wrong${NC}"

      # restore
      if [[ -d f${DBFLOW_DIR_APPID}_bck ]]; then
        mv "f${DBFLOW_DIR_APPID}_bck" "f${DBFLOW_DIR_APPID}"
      fi

    else

      # remove the full export file
      [[ -f "f${DBFLOW_DIR_APPID}.sql" ]] && rm "f${DBFLOW_DIR_APPID}.sql"

      # remove backup
      [[ -d "f${DBFLOW_DIR_APPID}_bck" ]] && rm -rf "f${DBFLOW_DIR_APPID}_bck"

      echo -e "${CLR_GREEN}$(date '+%d.%m.%Y %H:%M:%S') >> export done${NC}"
    fi

    # remove sqlcl history.log
    if [[ -f history.log ]]; then
      rm history.log
    fi
  done
else
  echo -e "${CLR_REDBGR}$(date '+%d.%m.%Y %H:%M:%S') >> application folder ${DBFLOW_APPFOLDER} does not exist ${NC}"
fi
