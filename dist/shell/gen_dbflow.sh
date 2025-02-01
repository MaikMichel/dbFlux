#!/usr/bin/env bash

# this is our source directory
SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]:-$0}"; )" &> /dev/null && pwd 2> /dev/null; )";

# let's include some global vars like color or some methods
source "${SCRIPT_DIR}/_lib.sh"

# initialze session vars like NLS or JAVA_TOOL_OPTIONS
initialize_session;

######################################################

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
