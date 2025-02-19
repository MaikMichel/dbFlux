#!/usr/bin/env bash

# this is our source directory
SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]:-$0}"; )" &> /dev/null && pwd 2> /dev/null; )";

# let's include some global vars like color or some methods
source "${SCRIPT_DIR}/_lib.sh"

# initialze session vars like NLS or JAVA_TOOL_OPTIONS
initialize_session;

######################################################



CONN_ARRY=( "$@" )

# PWDs zu Array
IFS='°'
CONN_PASSES=($DBFLOW_DBPASSES)
unset IFS


basefl=$(basename -- "${DBFLOW_FILE2TEST}")
dirfl=$(dirname -- "${DBFLOW_FILE2TEST}")
extension="${basefl##*.}"

base_package=${basefl}
base_package=${base_package/\.$extension/}

printf "${CLR_LBLUE}Connection:${NC}   ${WHITE}${DBFLOW_DBTNS}${NC}\n"
printf "${CLR_LBLUE}Schemas:${NC}      ${WHITE}${CONN_ARRY[@]}${NC}\n"

if [[ "${basefl}" != "" ]]; then
printf "${CLR_LBLUE}File:${NC}         ${WHITE}${basefl}${NC}\n"
fi
if [[ "${base_package}" != "" ]]; then
  printf "${CLR_LBLUE}Package:${NC}      ${WHITE}${base_package}${DBFLOW_METHOD2TEST}${NC}\n"
fi
if [[ "${DBFLOW_TARGET2COVER}" != "" ]]; then
  target_coverage="${DBFLOW_TARGET2COVER//|/$'\n              '}"
  printf "${CLR_LBLUE}Coverage:${NC}     ${WHITE}${target_coverage}${NC}\n"
fi
printf "${CLR_LBLUE}Format:${NC}       ${WHITE}${DBFLOW_TESTOUTPUT}${NC}\n"
echo

###

if [[ -f ".gitignore" ]]; then
  if ! grep -q "tests/results" .gitignore; then
      echo "" >> .gitignore
      echo "tests/results" >> .gitignore
      echo "'tests/results' add to .gitignore"
  fi
fi


if [[ "${DBFLOW_TARGET2COVER}" != "" ]]; then
  ANOFUNCTIONS=$( cat "${SCRIPT_DIR}/../sql/export_utrun.sql" )

  for index in "${!CONN_ARRY[@]}"; do
    l_conn=${CONN_ARRY[$index]}
    l_pass=${CONN_PASSES[$index]}
    printf "${CLR_LVIOLETE}$(date '+%d.%m.%Y %H:%M:%S') >> Running Test as ${l_conn}${NC}\n"
    # prepare output file
    log_file="coverage.base64"

    if [[ ${l_conn} == *"["* ]]; then
      target_file="${l_conn#*'['}"
      target_file=${target_file/']'/}
      target_file="${target_file}_test"
    else
      target_file="${l_conn}_test"
    fi

    target_file="${target_file}_${log_file}"


    # full_log_file="$(pwd)/${log_file}"
    full_log_file="tests/results/${target_file}"
    [[ -d "tests/results" ]] || mkdir -p "tests/results"
    [[ -f $full_log_file ]] && rm -f $full_log_file

    [[ -f ${full_log_file/base64/xml} ]] && rm -f ${full_log_file/base64/xml}
    [[ -f ${full_log_file/base64/json} ]] && rm -f ${full_log_file/base64/json}
    [[ -f ${full_log_file/base64/html} ]] && rm -f ${full_log_file/base64/html}

    # ## FullExport
    # PREPSTMT=":contents := to_base64(clob_to_blob(get_junit_full_xml()));"
    # if [[ -n ${DBFLOW_FILE2TEST} ]]; then

    PREPSTMT=":contents := to_base64(clob_to_blob(get_coverage_part_html('${base_package}${DBFLOW_METHOD2TEST}', '${DBFLOW_TARGET2COVER}')));"
    # fi

    # the export itself
    if [[ ${DBFLOW_SQLCLI} == "sqlplus" ]]; then
      sqlplus -s -l ${l_conn}/"${l_pass}"@${DBFLOW_DBTNS} <<EOF > "${full_log_file}"
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
      sql -s -l ${l_conn}/"${l_pass}"@${DBFLOW_DBTNS} <<EOF > "${full_log_file}"
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
        printf "${CLR_REDBGR}Error detected on export${NC}\n"
        tput setaf 9
        cat "${full_log_file}"
        tput setaf default
      else
        base64 -d -i "${full_log_file}" > "${full_log_file/base64/html}"
        printf "${CLR_GREEN}$(date '+%d.%m.%Y %H:%M:%S') >> done ${NC}\n"
      fi
    fi

  done

elif [[ ${DBFLOW_TESTOUTPUT} == "ANSI Console" ]]; then
  array+=("set feedback off")
  array+=("set linesize 2000")
  array+=("set serveroutput on")
  array+=("exec dbms_output.put_line(chr(27) || '${BSE_LVIOLETE}Compiling schema'||chr(27) || '${BSE_RESET}');")
  array+=("set serveroutput off")
  array+=("exec dbms_utility.compile_schema(schema => USER, compile_all => false);")
  array+=("exec dbms_session.reset_package;")
  array+=("set serveroutput on format wrapped")
  array+=("set serveroutput on")


  if [[ -n ${DBFLOW_FILE2TEST} ]]; then
    array+=("exec dbms_output.put_line(chr(27) || '${BSE_LVIOLETE}Executing Tests on: ${base_package}${DBFLOW_METHOD2TEST}'||chr(27) || '${BSE_RESET}');")
    array+=("prompt ")
    array+=("exec ut.run('${base_package}${DBFLOW_METHOD2TEST}', a_color_console => true);")
  else
    array+=("exec dbms_output.put_line(chr(27) || '${BSE_LVIOLETE}Executing Tests'||chr(27) || '${BSE_RESET}');")
    array+=("prompt ")
    array+=("exec ut.run(a_color_console => true);")
  fi

  for index in "${!CONN_ARRY[@]}"; do
    l_conn=${CONN_ARRY[$index]}
    l_pass=${CONN_PASSES[$index]}

    printf "${CLR_LBLUE}Executing tests on Connection ${l_conn}@${DBFLOW_DBTNS} ${NC}\n" | tee -a ${full_log_file}

    # prepare output file
    log_file="console.log"

    if [[ ${l_conn} == *"["* ]]; then
      target_file="${l_conn#*'['}"
      target_file=${target_file/']'/}
      target_file="${target_file}_test"
    else
      target_file="${l_conn}_test"
    fi

    target_file="${target_file}_${log_file}"


    # full_log_file="$(pwd)/${log_file}"
    full_log_file="tests/results/${target_file}"
    [[ -d "tests/results" ]] || mkdir -p "tests/results"
    [[ -f $full_log_file ]] && rm -f $full_log_file

    ${DBFLOW_SQLCLI} -s -l ${l_conn}/"${l_pass}"@${DBFLOW_DBTNS} << EOF | tee -a ${full_log_file}
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

  for index in "${!CONN_ARRY[@]}"; do
    l_conn=${CONN_ARRY[$index]}
    l_pass=${CONN_PASSES[$index]}

    printf "${CLR_LVIOLETE}$(date '+%d.%m.%Y %H:%M:%S') >> Running Test as ${l_conn}${NC}\n"
    # prepare output file
    log_file="junit.base64"

    if [[ ${l_conn} == *"["* ]]; then
      target_file="${l_conn#*'['}"
      target_file=${target_file/']'/}
      target_file="${target_file}_test"
    else
      target_file="${l_conn}_test"
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
      PREPSTMT=":contents := to_base64(clob_to_blob(get_junit_part_xml('${base_package}${DBFLOW_METHOD2TEST}')));"
    fi

    # the export itself
    if [[ ${DBFLOW_SQLCLI} == "sqlplus" ]]; then
      sqlplus -s -l ${l_conn}/"${l_pass}"@${DBFLOW_DBTNS} <<EOF > "${full_log_file}"
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
      sql -s -l ${l_conn}/"${l_pass}"@${DBFLOW_DBTNS} <<EOF > "${full_log_file}"
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
        printf "${CLR_REDBGR}Error detected on export${NC}\n"
        tput setaf 9
        cat "${full_log_file}"
        tput setaf default
      else
        base64 -d -i "${full_log_file}" > "${full_log_file/base64/xml}"
        printf "${CLR_GREEN}$(date '+%d.%m.%Y %H:%M:%S') >> done ${NC}\n"
      fi
    fi

  done


fi
