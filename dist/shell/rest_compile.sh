#!/usr/bin/env bash

# this is our source directory
SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]:-$0}"; )" &> /dev/null && pwd 2> /dev/null; )";

# let's include some global vars like color or some methods
source "${SCRIPT_DIR}/_lib.sh"

# initialze session vars like NLS or JAVA_TOOL_OPTIONS
initialize_session;

######################################################

basefl=$(basename -- "${DBFLOW_FILE}")
basepath=$(pwd)
extension="${basefl##*.}"
MDATE=`date +%Y-%m-%dT%H:%M:%S%z`

REST_SQL_URL="${DBFLOW_REST_SQL_URL}"
REST_OAUTH_TOKEN_URL="${DBFLOW_REST_OAUTH_TOKEN_URL}"
REST_ERRORS_FOUND=0
REST_ACCESS_TOKEN=""
REST_ACCESS_TOKEN_EXPIRES_AT=0
REST_TOKEN_EXPIRY_SAFETY_SECONDS=30
REST_CONNECT_TIMEOUT="${DBFLOW_REST_CONNECT_TIMEOUT:-10}"
REST_TOKEN_MAX_TIME="${DBFLOW_REST_TOKEN_MAX_TIME:-30}"
REST_COMPILE_MAX_TIME="${DBFLOW_REST_COMPILE_MAX_TIME:-120}"

function print_rest_success_message() {
  local color_off=""
  local color_greenb=""
  local color_green=""

  if [[ "${DBFLOW_COLOR_ON}" == "true" ]]; then
    color_off="${ESC}${BSE_RESET}"
    color_greenb="${ESC}${BSE_GREENBGR}"
    color_green="${ESC}${BSE_GREEN}"
  fi

  printf "%bSuccessful%b   %b%s%b\n" \
    "${color_greenb}" "${color_off}" \
    "${color_green}" "$(date +%Y-%m-%dT%H:%M:%S%z)" "${color_off}"
}

function print_rest_log_results_table() {
  local json_response="$1"

  # Optional output only: if jq is missing we skip table rendering silently.
  if ! command -v jq >/dev/null 2>&1; then
    return 0
  fi

  # Print only if log_results exists and has more than one entry.
  local has_log_results
  has_log_results=$(jq -r 'if ((.log_results? | type) == "array") and ((.log_results | length) > 1) then "true" else "false" end' <<< "${json_response}" 2>/dev/null)
  if [[ "${has_log_results}" != "true" ]]; then
    return 0
  fi

  print_rest_status_message "info" "Log" "log_results"
  printf "%-4s %-18s %-10s %-12s %s\n" "#" "statement_type" "status" "duration_ms" "error_message"
  printf "%-4s %-18s %-10s %-12s %s\n" "----" "------------------" "----------" "------------" "-------------"

  local parsed_rows
  parsed_rows=$(jq -r '
      .log_results
      | to_entries[]
      | [
          ((.key + 1) | tostring),
          ((.value.statement_type // "-") | tostring),
          ((.value.status // "-") | tostring),
          ((.value.duration_ms // "-") | tostring),
          ((.value.error_message // "-") | tostring | gsub("[\\r\\n\\t]+"; " "))
        ]
      | @tsv
    ' <<< "${json_response}" 2>/dev/null)

  if [[ -z "${parsed_rows}" ]]; then
    return 0
  fi

  while IFS=$'\t' read -r idx statement_type status duration_ms error_message; do
    [[ -n "${idx}" ]] || continue
    printf "%-4s %-18s %-10s %-12s %s\n" "${idx}" "${statement_type}" "${status}" "${duration_ms}" "${error_message}"
  done <<< "${parsed_rows}"
}


function print_rest_response_as_problem_lines() {
  local json_response="$1"
  local default_fileinfo="${DBFLOW_WSPACE}:1:1"

  local color_off=""
  local color_orangeb=""
  local color_orange=""
  local color_redb=""
  local color_red=""
  local color_dgray=""

  if [[ "${DBFLOW_COLOR_ON}" == "true" ]]; then
    color_off="${ESC}${BSE_RESET}"
    color_orangeb="${ESC}${BSE_ORANGEBGR}"
    color_orange="${ESC}${BSE_ORANGE}"
    color_redb="${ESC}${BSE_REDBGR}"
    color_red="${ESC}${BSE_RED}"
    color_dgray="${ESC}${BSE_DGRAY}"
  fi

  function print_problem_line() {
    local severity="$1"
    local code="$2"
    local fileinfo="$3"
    local message="$4"
    local sev_bg="${color_redb}"
    local sev_fg="${color_red}"
    local msg_fg="${color_red}"

    if [[ "${severity}" == "WARNING" ]]; then
      sev_bg="${color_orangeb}"
      sev_fg="${color_orange}"
      msg_fg="${color_orange}"
    fi

    printf "%b%s%b %b%s%b %b%s%b %b%s%b\n" \
      "${sev_bg}" "${severity}" "${color_off}" \
      "${sev_fg}" "${code}" "${color_off}" \
      "${color_dgray}" "${fileinfo}" "${color_off}" \
      "${msg_fg}" "${message}" "${color_off}"
  }

  # Prefer jq for robust JSON parsing. Fallback prints raw response.
  if ! command -v jq >/dev/null 2>&1; then
    [[ -z "${json_response}" ]] || echo "${json_response}"
    return 0
  fi

  # Return silently for successful JSON response
  if jq -e '(.success // false) == true' >/dev/null 2>&1 <<< "${json_response}"; then
    return 0
  fi

  # 1) Primary path: parse detailed user_errors into matcher compatible lines
  local parsed_lines
  parsed_lines=$(jq -r --arg default_file "${default_fileinfo}" '
      [ .log_results[]?.user_errors[]? |
        [
          ((.attribute // "ERROR") | ascii_upcase),
          (.typeid // "ORA-24344"),
          (.fileinfo // $default_file),
          ((.errtext // "Compilation error") | gsub("[\\r\\n]+"; " "))
        ]
      ]
      | .[]
      | @tsv
    ' <<< "${json_response}" 2>/dev/null)

  if [[ $? -ne 0 ]]; then
    # Fallback: at least emit raw response so user sees compile failure.
    [[ -z "${json_response}" ]] || echo "${json_response}"
    return 0
  fi

  if [[ -n "${parsed_lines}" ]]; then
    REST_ERRORS_FOUND=1
    while IFS=$'\t' read -r attribute code fileinfo errtext; do
      [[ -n "${attribute}" ]] || continue
      print_problem_line "${attribute}" "${code}" "${fileinfo}" "${errtext}"
    done <<< "${parsed_lines}"
    return 0
  fi

  # 2) Secondary path: fallback from top-level/log_results message
  local fallback_code
  local fallback_message
  fallback_code=$(jq -r 'if .code != null then (.code|tostring) else "ORA-ERROR" end' <<< "${json_response}" 2>/dev/null)
  fallback_message=$(jq -r 'first([.log_results[]?.error_message?, .message?] | map(select(. != null and . != ""))[]) // "Compilation error"' <<< "${json_response}" 2>/dev/null)

  REST_ERRORS_FOUND=1
  print_problem_line "ERROR" "${fallback_code}" "${default_fileinfo}" "${fallback_message}"
}

function ensure_rest_access_token() {
  local now
  now=$(date +%s)

  if [[ -n "${REST_ACCESS_TOKEN:-}" ]] && [[ ${REST_ACCESS_TOKEN_EXPIRES_AT:-0} -gt $((now + REST_TOKEN_EXPIRY_SAFETY_SECONDS)) ]]; then
    return 0
  fi

  if ! command -v jq >/dev/null 2>&1; then
    print_rest_status_message "error" "Error" "REST OAuth requires jq to parse token response"
    return 1
  fi

  print_rest_status_message "info" "Request" "Token from ${REST_OAUTH_TOKEN_URL}"

  local token_response
  token_response=$(curl -sS \
    --connect-timeout "${REST_CONNECT_TIMEOUT}" \
    --max-time "${REST_TOKEN_MAX_TIME}" \
    --header "Authorization: Basic ${DBFLOW_DBPASS}" \
    --data "grant_type=client_credentials" \
    "${REST_OAUTH_TOKEN_URL}")
  local token_rc=$?

  if [[ ${token_rc} -ne 0 ]]; then
    [[ -z "${token_response}" ]] || print_rest_status_message "error" "Error" "${token_response}"
    print_rest_status_message "error" "Error" "Failed to get OAuth access token from ${REST_OAUTH_TOKEN_URL}"
    return ${token_rc}
  fi

  local access_token
  local expires_in
  access_token=$(jq -r '.access_token // empty' <<< "${token_response}" 2>/dev/null)
  expires_in=$(jq -r '.expires_in // 3600' <<< "${token_response}" 2>/dev/null)

  if [[ -z "${access_token}" ]]; then
    [[ -z "${token_response}" ]] || print_rest_status_message "error" "Error" "${token_response}"
    print_rest_status_message "error" "Error" "OAuth token response did not contain access_token"
    return 1
  fi

  if [[ ! "${expires_in}" =~ ^[0-9]+$ ]]; then
    expires_in=3600
  fi

  REST_ACCESS_TOKEN="${access_token}"
  REST_ACCESS_TOKEN_EXPIRES_AT=$((now + expires_in))

  return 0
}

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