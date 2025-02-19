#!/usr/bin/env bash

# this is our source directory
SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]:-$0}"; )" &> /dev/null && pwd 2> /dev/null; )";

# let's include some global vars like color or some methods
source "${SCRIPT_DIR}/_lib.sh"

# initialze session vars like NLS or JAVA_TOOL_OPTIONS
initialize_session;

######################################################

printf "${CYAN}Generating project with following options${NC}\n"
printf "  Project:                          ${BWHITE}${wiz_project_name}${NC}\n"
printf "  Mode:                             ${BWHITE}${wiz_project_mode}${NC}\n"
printf "  Build Branch:                     ${BWHITE}${wiz_build_branch}${NC}\n"
printf "  Create Changelos:                 ${BWHITE}${wiz_create_changelogs}${NC}\n"
printf "  Schema Changelog proccessed:      ${BWHITE}${wiz_chl_schema}${NC}\n"
printf "  Connection:                       ${BWHITE}${wiz_db_tns}${NC}\n"
printf "  Admin User:                       ${BWHITE}${wiz_db_admin_user}${NC}\n"
printf "  Deployment User:                  ${BWHITE}${wiz_db_app_user}${NC}\n"
printf "  Location depot:                   ${BWHITE}${wiz_depot_path}${NC}\n"
printf "  Location logs:                    ${BWHITE}${wiz_logpath}${NC}\n"
printf "  Branch is mapped to Stage:        ${BWHITE}${wiz_stage}${NC}\n"
printf "  SQl commandline:                  ${BWHITE}${wiz_sqlcli}${NC}\n"
printf "  Install default tools:            ${BWHITE}${wiz_with_tools}${NC}\n"
printf "  Configure with default apps:      ${BWHITE}${wiz_apex_ids}${NC}\n"
printf "  Configure with default modules:   ${BWHITE}${wiz_rest_modules}${NC}\n"
printf "  Just install environment onyl:    ${BWHITE}${env_only}${NC}\n"



# check if working dir is a git dir otherwise init
if [[ ! -d ".git" ]]; then
  printf "${CLR_LBLUE}Initializing git${NC}\n"
  git init
fi

if [[ ! -d ".dbFlow" ]]; then
  printf "${CLR_LBLUE}clone dbFlow as submodule${NC}\n"
  git submodule add --force https://github.com/MaikMichel/dbFlow.git .dbFlow
else
  printf "${CLR_LBLUE}pulling changes from dbFLow submodule${NC}\n"
  cd .dbFlow
  git pull
  cd ..
fi


printf "${CLR_GREEN}dbFlow initialized${NC}\n"
printf "${CLR_DGRAY}Documentation can be found here: ${CLR_LBLUE}https://maikmichel.github.io/dbFlow/${NC}\n"

.dbFlow/setup.sh -g "${wiz_project_name}" -w