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
  export JAVA_TOOL_OPTIONS="-Duser.language=en -Duser.region=US -Dfile.encoding=UTF-8"
fi

# colored output in sqlplus inside git-bash
case $(uname | tr '[:upper:]' '[:lower:]') in
mingw64_nt-10*)
  chcp.com 65001
;;
esac

CONN_ARRY=( "$@" )
basefl=$(basename -- "${DBFLOW_FILE2TEST}")
extension="${basefl##*.}"

array+=("set feedback off")
array+=("prompt compiling schema")
array+=("exec dbms_utility.compile_schema(schema => USER, compile_all => false);")
array+=("exec dbms_session.reset_package;")
array+=("set serveroutput on")


base_package=${basefl/"test_"/}
base_package=${base_package/\.$extension/}

if [[ -n ${DBFLOW_FILE2TEST} ]]; then
  array+=("prompt executing Tests on package: test_${base_package}")
  array+=("exec ut.run('test_${base_package}', a_color_console => true);")
else
  #array+=("spool SPOOLFILE")
  array+=("prompt executing Tests")
  #array+=("exec ut.run(ut_junit_reporter());")
  array+=("exec ut.run(a_color_console => true);")
  #array+=("spool off")
fi

# prepare output file
log_file="utoutput.log"
full_log_file="$(pwd)/${log_file}"
[[ -f $full_log_file ]] && rm -f $full_log_file
touch $full_log_file

for arg in "${CONN_ARRY[@]}"; do
  echo -e "${BCYAN}Executing tests on Connection ${arg}@${DBFLOW_DBTNS} ${NC}" | tee -a ${full_log_file}

  ${DBFLOW_SQLCLI} -s -l ${arg}/${DBFLOW_DBPASS}@${DBFLOW_DBTNS} <<! | tee -a ${full_log_file}
  $(
      for element in "${array[@]}"
      do
        echo "${element/SPOOLFILE/"${arg}_test.xml"}"
      done

    )

!

  echo
done
