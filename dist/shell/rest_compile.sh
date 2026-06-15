#!/usr/bin/env bash

# this is our source directory
SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]:-$0}"; )" &> /dev/null && pwd 2> /dev/null; )";

# let's include some global vars like color or some methods
source "${SCRIPT_DIR}/_lib.sh"

# shared REST helpers (token handling, response rendering, curl wrappers)
source "${SCRIPT_DIR}/_rest_lib.sh"

# initialze session vars like NLS or JAVA_TOOL_OPTIONS
initialize_session;

######################################################

basefl=$(basename -- "${DBFLOW_FILE}")
basepath=$(pwd)
extension="${basefl##*.}"
MDATE=`date +%Y-%m-%dT%H:%M:%S%z`


function run_sql_file_rest() {
  local targetschema=$1
  local sql_file=$2
  local use_embeded=$3

  if [[ ! -f "${sql_file}" ]]; then
    print_rest_status_message "error" "Error" "SQL file ${sql_file} does not exist"
    return 1
  fi

  if [[ ${use_embeded} == "true" ]]; then
    print_rest_status_message "info" "Parsing" "Calling included SQL files from ${sql_file}"
    local line
    local include_file
    local include_path
    local include_has_embedded
    local include_base
    local counter=0
    include_base=$(dirname "${sql_file}")

    while IFS= read -r line; do
      if [[ "${line}" =~ ^[[:space:]]*@@([^[:space:];]+) ]]; then
        include_file="${BASH_REMATCH[1]}"
        include_path="${include_base}/${include_file}"

        if [[ -f "${include_path}" ]]; then
          counter=$((counter+1))
          if grep -Eq '^[[:space:]]*@@([^[:space:];]+)' "${include_path}"; then
            include_has_embedded=true
          else
            include_has_embedded=false
          fi

          run_sql_file_rest "${targetschema}" "${include_path}" "${include_has_embedded}"
          if [[ $? -ne 0 ]]; then
            return 1
          fi
        else
          print_rest_status_message "error" "Error" "included SQL file ${include_path} does not exist"
          return 1
        fi
      fi
    done < "${sql_file}"

    return 0
  fi

  if ! command -v zip >/dev/null 2>&1; then
    timelog "REST execution failed: zip command is required for REST compile payloads" "${failure}"
    return 1
  fi

  abs_file="$(realpath "$sql_file")"
  rel_file="${abs_file#"$basepath"/}"

  local payload_dir
  local payload_file
  payload_dir="$(mktemp -d "${TMPDIR:-/tmp}/dbflux-rest-compile.XXXXXX")"
  payload_file="${payload_dir}/payload.zip"

  mkdir -p "${payload_dir}/$(dirname "${rel_file}")"
  cp "${sql_file}" "${payload_dir}/${rel_file}"

  (
    cd "${payload_dir}" && zip -q "${payload_file}" "${rel_file}"
  )
  local zip_rc=$?

  if [[ ${zip_rc} -ne 0 ]]; then
    rm -rf "${payload_dir}"
    timelog "REST execution failed: could not create ZIP payload for ${rel_file}" "${failure}"
    return ${zip_rc}
  fi

  local -a curl_args
  curl_args=(
    -sS
    --connect-timeout "${REST_CONNECT_TIMEOUT}"
    --max-time "${REST_COMPILE_MAX_TIME}"
    -X POST
    --header "Content-Type:application/zip"
    --header "file_name:${sql_file}"
  )

  local header_var
  while IFS= read -r header_var; do
    local header_value="${!header_var}"
    if [[ -n "${header_value}" ]]; then
      curl_args+=( --header "${header_value}" )
    fi
  done < <(compgen -A variable REST_HEADER_ | sort)

  ensure_rest_access_token
  if [[ $? -ne 0 ]]; then
    rm -rf "${payload_dir}"
    return 1
  fi
  curl_args+=( --header "Authorization: Bearer ${REST_ACCESS_TOKEN}" )

  print_rest_status_message "info" "Running" "File ${sql_file}"
  print_rest_status_message "info" "...  on" "${REST_SQL_URL}/compile"

  local curl_response
  curl_response=$(curl "${curl_args[@]}" --data-binary @"${payload_file}" "${REST_SQL_URL}/compile")
  local curl_rc=$?

  rm -rf "${payload_dir}"

  if [[ ${curl_rc} -ne 0 ]]; then
    [[ -z "${curl_response}" ]] || echo "${curl_response}"
    return ${curl_rc}
  fi

  # Print response only when it is not JSON or JSON.success != true
  if [[ "${curl_response}" =~ ^[[:space:]]*\{ ]]; then
    echo
    local is_success=false
    if command -v jq >/dev/null 2>&1; then
      jq -e '(.success // false) == true' >/dev/null 2>&1 <<< "${curl_response}" && is_success=true
    else
      local compact_response
      compact_response=$(echo "${curl_response}" | tr -d '\r\n')
      [[ "${compact_response}" =~ \"success\"[[:space:]]*:[[:space:]]*true ]] && is_success=true
    fi

    if [[ "${is_success}" != "true" ]]; then
      print_rest_response_as_problem_lines "${curl_response}"
      echo
    fi

    print_rest_log_results_table "${curl_response}"
  else
    [[ -z "${curl_response}" ]] || echo "${curl_response}"
  fi

  return 0
}


print_rest_status_message "info" "Sourcefile" "${DBFLOW_WSPACE}"
print_rest_status_message "info" "OS-Time" "${MDATE}"

run_sql_file_rest "${REST_APP_SCHEMA}" "${DBFLOW_WSPACE}" false
if [[ $? -eq 0 ]]; then
  if [[ ${REST_ERRORS_FOUND} -eq 0 ]]; then
    echo
    print_rest_success_message
  fi
fi