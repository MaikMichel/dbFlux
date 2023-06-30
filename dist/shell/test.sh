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
base_package=${basefl/"test_"/}
base_package=${base_package/\.$extension/}

echo -e "${CLR_LBLUE}Connection:${NC}   ${WHITE}${DBFLOW_DBTNS}${NC}"
echo -e "${CLR_LBLUE}Schemas:${NC}      ${WHITE}${CONN_ARRY[@]}${NC}"

if [[ "${basefl}" != "" ]]; then
echo -e "${CLR_LBLUE}File:${NC}         ${WHITE}${basefl}${NC}"
fi
if [[ "${base_package}" != "" ]]; then
  echo -e "${CLR_LBLUE}Package:${NC}      ${WHITE}test_${base_package}${DBFLOW_METHOD2TEST}${NC}"
fi
echo -e "${CLR_LBLUE}Format:${NC}       ${WHITE}${DBFLOW_TESTOUTPUT}${NC}"
echo

###

if [[ ${DBFLOW_TESTOUTPUT} == "ANSI Console" ]]; then
  array+=("set feedback off")
  array+=("set linesize 2000")
  array+=("set serveroutput on")
  array+=("exec dbms_output.put_line(chr(27) || '${BSE_LVIOLETE}Compiling schema'||chr(27) || '${BSE_RESET}');")
  array+=("set serveroutput off")
  array+=("exec dbms_utility.compile_schema(schema => USER, compile_all => false);")
  array+=("exec dbms_session.reset_package;")
  array+=("set serveroutput on")




  if [[ -n ${DBFLOW_FILE2TEST} ]]; then
    array+=("exec dbms_output.put_line(chr(27) || '${BSE_LVIOLETE}Executing Tests on: test_${base_package}${DBFLOW_METHOD2TEST}'||chr(27) || '${BSE_RESET}');")
    array+=("prompt ")
    array+=("exec ut.run('test_${base_package}${DBFLOW_METHOD2TEST}', a_color_console => true);")

    # array+=("exec ut.run('test_${base_package}${DBFLOW_METHOD2TEST}', ut_junit_reporter(), a_color_console => true);")

  else
    array+=("exec dbms_output.put_line(chr(27) || '${BSE_LVIOLETE}Executing Tests'||chr(27) || '${BSE_RESET}');")
    array+=("prompt ")
    array+=("exec ut.run(a_color_console => true);")

    # array+=("exec ut.run(ut_junit_reporter(), a_color_console => true);")

  fi

  for arg in "${CONN_ARRY[@]}"; do
    echo -e "${CLR_LBLUE}Executing tests on Connection ${arg}@${DBFLOW_DBTNS} ${NC}" | tee -a ${full_log_file}

    # prepare output file
    log_file="console.log"

    if [[ ${arg} == *"["* ]]; then
      target_file="${arg#*'['}"
      target_file=${target_file/']'/}
      target_file="${target_file}_test"
    else
      target_file="${arg}_test"
    fi

    target_file="${target_file}_${log_file}"


    # full_log_file="$(pwd)/${log_file}"
    full_log_file="tests/results/${target_file}"
    [[ -d "tests/results" ]] || mkdir -p "tests/results"
    [[ -f $full_log_file ]] && rm -f $full_log_file

    ${DBFLOW_SQLCLI} -s -l ${arg}/'"'"${DBFLOW_DBPASS}"'"'@${DBFLOW_DBTNS} << EOF | tee -a ${full_log_file}
    $(
        for element in "${array[@]}"
        do
          #echo "${element/SPOOLFILE/"${target_file}.xml"}"
          echo "${element}"
        done
      )

EOF

    echo
  done

else
  ANOFUNCTIONS=$( cat "${SCRIPT_DIR}/../sql/export_utrun.sql" )

  for arg in "${CONN_ARRY[@]}"; do
    echo -e "${CLR_LVIOLETE}$(date '+%d.%m.%Y %H:%M:%S') >> Running Test as ${arg}${NC}"
    # prepare output file
    log_file="junit.base64"

    if [[ ${arg} == *"["* ]]; then
      target_file="${arg#*'['}"
      target_file=${target_file/']'/}
      target_file="${target_file}_test"
    else
      target_file="${arg}_test"
    fi

    target_file="${target_file}_${log_file}"


    # full_log_file="$(pwd)/${log_file}"
    full_log_file="tests/results/${target_file}"
    [[ -d "tests/results" ]] || mkdir -p "tests/results"
    [[ -f $full_log_file ]] && rm -f $full_log_file

    [[ -f ${full_log_file/base64/xml} ]] && rm -f ${full_log_file/base64/xml}
    [[ -f ${full_log_file/base64/json} ]] && rm -f ${full_log_file/base64/json}
    [[ -f ${full_log_file/base64/html} ]] && rm -f ${full_log_file/base64/html}

    ## FullExport
    PREPSTMT=":contents := to_base64(clob_to_blob(get_junit_full_xml()));"
    if [[ -n ${DBFLOW_FILE2TEST} ]]; then
      PREPSTMT=":contents := to_base64(clob_to_blob(get_junit_part_xml('test_${base_package}${DBFLOW_METHOD2TEST}')));"
    fi

    # the export itself
    if [[ ${DBFLOW_SQLCLI} == "sqlplus" ]]; then
      sqlplus -s -l ${arg}/'"'"${DBFLOW_DBPASS}"'"'@${DBFLOW_DBTNS} <<EOF > "${full_log_file}"
      set verify off
      set scan off
      set feedback off
      set heading off
      set trimout on
      set trimspool on
      set pagesize 0
      set linesize 5000
      set long 100000000
      set longchunksize 32767
      whenever sqlerror exit sql.sqlcode rollback
      variable contents clob
      DECLARE
        ${ANOFUNCTIONS}
      BEGIN
        ${PREPSTMT}
      END;
      /

      print contents

EOF

    else
      sql -s -l ${arg}/'"'"${DBFLOW_DBPASS}"'"'@${DBFLOW_DBTNS} <<EOF > "${full_log_file}"
        set verify off
        set scan off
        set feedback off
        set heading off
        set trimout on
        set trimspool on
        set pagesize 0
        set linesize 5000
        set long 100000000
        set longchunksize 32767
        set serveroutput on
        whenever sqlerror exit sql.sqlcode rollback
        rem variable contents clob
        DECLARE
          v_content clob;
          ${ANOFUNCTIONS}
        BEGIN
          ${PREPSTMT}
          print_clob_to_output(v_content);
        END;
        /

EOF

    fi

    if [[ -f "${full_log_file}" ]]; then
      if grep -q "ORA-.*:" "${full_log_file}"; then
        echo -e "${CLR_REDBGR}Error detected on export${NC}"
        tput setaf 9
        cat "${full_log_file}"
        tput setaf default
      else
        base64 -d -i "${full_log_file}" > "${full_log_file/base64/xml}"
        echo -e "${CLR_GREEN}$(date '+%d.%m.%Y %H:%M:%S') >> done ${NC}"
      fi
    fi

  done


fi
