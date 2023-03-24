#!/bin/bash

# this is our source directory
SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]:-$0}"; )" &> /dev/null && pwd 2> /dev/null; )";

# let's include some global vars like color or some methods
source "${SCRIPT_DIR}/_lib.sh"

# initialze session vars like NLS or JAVA_TOOL_OPTIONS
initialize_session;

######################################################
echo "Test"

echo -e "${CYAN}Generating project with following options${NC}"
  echo -e "  Project:                          ${BWHITE}${wiz_project_name}${NC}"
  echo -e "  Mode:                             ${BWHITE}${wiz_project_mode}${NC}"
  echo -e "  Build Branch:                     ${BWHITE}${wiz_build_branch}${NC}"
  echo -e "  Create Changelos:                 ${BWHITE}${wiz_create_changelogs}${NC}"
  echo -e "  Schema Changelog proccessed:      ${BWHITE}${wiz_chl_schema}${NC}"
  echo -e "  Connection:                       ${BWHITE}${wiz_db_tns}${NC}"
  echo -e "  Admin User:                       ${BWHITE}${wiz_db_admin_user}${NC}"
  echo -e "  Deployment User:                  ${BWHITE}${wiz_db_app_user}${NC}"
  echo -e "  Location depot:                   ${BWHITE}${wiz_depot_path}${NC}"
  echo -e "  Branch is mapped to Stage:        ${BWHITE}${wiz_stage}${NC}"
  echo -e "  SQl commandline:                  ${BWHITE}${wiz_sqlcli}${NC}"
  echo -e "  Install default tools:            ${BWHITE}${wiz_with_tools}${NC}"
  echo -e "  Configure with default apps:      ${BWHITE}${wiz_apex_ids}${NC}"
  echo -e "  Configure with default modules:   ${BWHITE}${wiz_rest_modules}${NC}"
  echo -e "  Just install environment onyl:    ${BWHITE}${env_only}${NC}"



# check if working dir is a git dir otherwise init
if [[ ! -d ".git" ]]; then
  echo -e "${CLR_LBLUE}Initializing git${NC}"
  git init
fi

if [[ ! -d ".dbFlow" ]]; then
  echo -e "${CLR_LBLUE}clone dbFlow as submodule${NC}"
  git submodule add --force https://github.com/MaikMichel/dbFlow.git .dbFlow
else
  echo -e "${CLR_LBLUE}pulling changes from dbFLow submodule${NC}"
  cd .dbFlow
  git pull
  cd ..
fi


echo -e "${CLR_GREEN}dbFlow initialized${NC}"
echo -e "${CLR_DGRAY}Documentation can be found here: ${CLR_LBLUE}https://maikmichel.github.io/dbFlow/${NC}"

.dbFLow/setup.sh -g "${wiz_project_name}" -w