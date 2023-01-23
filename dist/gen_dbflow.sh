#!/bin/bash

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
export CUSTOM_JDBC="-XX:TieredStopAtLevel=1"

# check if working dir is a git dir otherwise init
if [[ ! -d ".git" ]]; then
  echo -e "${BYELLOW}Initializing git${NC}"
  git init
fi

if [[ ! -d ".dbFlow" ]]; then
  echo -e "${BYELLOW}clone dbFlow as submodule${NC}"
  git submodule add --force https://github.com/MaikMichel/dbFlow.git .dbFlow
else
  echo -e "${BYELLOW}pulling changes from dbFLow submodule${NC}"
  cd .dbFlow
  git pull
  cd ..
fi


echo -e "${CYAN}dbFlow initialized${NC}"
echo -e "${CYAN}Documentation can be found here: https://maikmichel.github.io/dbFlow/${NC}"
