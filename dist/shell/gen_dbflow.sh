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
