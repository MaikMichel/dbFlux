#!/bin/bash

# this is our source directory
SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]:-$0}"; )" &> /dev/null && pwd 2> /dev/null; )";

# let's include some global vars like color or some methods
source "${SCRIPT_DIR}/_lib.sh"

# initialze session vars like NLS or JAVA_TOOL_OPTIONS
initialize_session;

######################################################

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
  echo -e "${CLR_LBLUE}Executing tests on Connection ${arg}@${DBFLOW_DBTNS} ${NC}" | tee -a ${full_log_file}

  ${DBFLOW_SQLCLI} -s -l ${arg}/'"'"${DBFLOW_DBPASS}"'"'@${DBFLOW_DBTNS} << EOF | tee -a ${full_log_file}
  $(
      for element in "${array[@]}"
      do
        echo "${element/SPOOLFILE/"${arg}_test.xml"}"
      done

    )

EOF

  echo
done
