#!/bin/bash
# Shared helpers for all REST mode (CONN_MODE=REST) scripts.
# Expects _lib.sh to be sourced already (colors, print_rest_status_message)
# and the DBFLOW_REST_* environment variables to be set by the task provider.

REST_SQL_URL="${DBFLOW_REST_SQL_URL}"
REST_OAUTH_TOKEN_URL="${DBFLOW_REST_OAUTH_TOKEN_URL}"
REST_APP_SCHEMA="${DBFLOW_REST_APP_SCHEMA}"
REST_ERRORS_FOUND=0
REST_ACCESS_TOKEN=""
REST_ACCESS_TOKEN_EXPIRES_AT=0
REST_TOKEN_EXPIRY_SAFETY_SECONDS=30
REST_CONNECT_TIMEOUT="${DBFLOW_REST_CONNECT_TIMEOUT:-10}"
REST_TOKEN_MAX_TIME="${DBFLOW_REST_TOKEN_MAX_TIME:-30}"
REST_COMPILE_MAX_TIME="${DBFLOW_REST_COMPILE_MAX_TIME:-120}"
REST_EXPORT_MAX_TIME="${DBFLOW_REST_EXPORT_MAX_TIME:-600}"
REST_LAST_RESPONSE=""

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
  local default_fileinfo="${DBFLOW_WSPACE:-unknown}:1:1"

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

# prints error/warning entries of the "errors" array returned by the
# compileschema endpoint (same element shape as user_errors)
function print_rest_errors_array_as_problem_lines() {
  local json_response="$1"

  if ! command -v jq >/dev/null 2>&1; then
    [[ -z "${json_response}" ]] || echo "${json_response}"
    return 0
  fi

  local parsed_lines
  parsed_lines=$(jq -r '
      [ .errors[]? |
        [
          ((.attribute // "ERROR") | ascii_upcase),
          (.typeid // "ORA-24344"),
          (.fileinfo // "unknown:1:1"),
          ((.errtext // "Compilation error") | gsub("[\\r\\n]+"; " "))
        ]
      ]
      | .[]
      | @tsv
    ' <<< "${json_response}" 2>/dev/null)

  if [[ -z "${parsed_lines}" ]]; then
    return 0
  fi

  REST_ERRORS_FOUND=1

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

  while IFS=$'\t' read -r attribute code fileinfo errtext; do
    [[ -n "${attribute}" ]] || continue
    local sev_bg="${color_redb}"
    local sev_fg="${color_red}"
    if [[ "${attribute}" == "WARNING" ]]; then
      sev_bg="${color_orangeb}"
      sev_fg="${color_orange}"
    fi
    printf "%b%s%b %b%s%b %b%s%b %b%s%b\n" \
      "${sev_bg}" "${attribute}" "${color_off}" \
      "${sev_fg}" "${code}" "${color_off}" \
      "${color_dgray}" "${fileinfo}" "${color_off}" \
      "${sev_fg}" "${errtext}" "${color_off}"
  done <<< "${parsed_lines}"
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

# builds custom REST_HEADER_* variables and the Bearer token into the global
# REST_AUTH_CURL_ARGS array (no nameref: must work with bash 3.2 on macOS)
REST_AUTH_CURL_ARGS=()
function rest_build_auth_headers() {
  REST_AUTH_CURL_ARGS=()

  local header_var
  while IFS= read -r header_var; do
    local header_value="${!header_var}"
    if [[ -n "${header_value}" ]]; then
      REST_AUTH_CURL_ARGS+=( --header "${header_value}" )
    fi
  done < <(compgen -A variable REST_HEADER_ | sort)

  REST_AUTH_CURL_ARGS+=( --header "Authorization: Bearer ${REST_ACCESS_TOKEN}" )
}

# POST to ${REST_SQL_URL}/<endpoint> expecting a JSON response.
# Extra arguments are passed as additional "key:value" request headers.
# The response body is stored in REST_LAST_RESPONSE.
function rest_post_json() {
  local endpoint="$1"
  shift 1
  REST_LAST_RESPONSE=""

  ensure_rest_access_token || return 1

  local -a curl_args
  curl_args=(
    -sS
    --connect-timeout "${REST_CONNECT_TIMEOUT}"
    --max-time "${REST_COMPILE_MAX_TIME}"
    -X POST
  )

  local hdr
  for hdr in "$@"; do
    curl_args+=( --header "${hdr}" )
  done

  rest_build_auth_headers
  curl_args+=( "${REST_AUTH_CURL_ARGS[@]}" )

  print_rest_status_message "info" "Calling" "${REST_SQL_URL}/${endpoint}"

  REST_LAST_RESPONSE=$(curl "${curl_args[@]}" "${REST_SQL_URL}/${endpoint}")
  local curl_rc=$?

  if [[ ${curl_rc} -ne 0 ]]; then
    [[ -z "${REST_LAST_RESPONSE}" ]] || echo "${REST_LAST_RESPONSE}"
    print_rest_status_message "error" "Error" "request to ${REST_SQL_URL}/${endpoint} failed"
    return ${curl_rc}
  fi

  return 0
}

# POST to ${REST_SQL_URL}/<endpoint> expecting a ZIP response written to the
# given target file. Extra arguments are passed as additional request headers.
# A JSON response means the server reported an error: it is rendered as
# problem lines and the function fails.
function rest_post_download() {
  local endpoint="$1"
  local target_file="$2"
  shift 2

  ensure_rest_access_token || return 1

  local headers_file
  headers_file="$(mktemp "${TMPDIR:-/tmp}/dbflux-rest-headers.XXXXXX")"

  local -a curl_args
  curl_args=(
    -sS
    --connect-timeout "${REST_CONNECT_TIMEOUT}"
    --max-time "${REST_EXPORT_MAX_TIME}"
    -X POST
    -D "${headers_file}"
    -o "${target_file}"
  )

  local hdr
  for hdr in "$@"; do
    curl_args+=( --header "${hdr}" )
  done

  rest_build_auth_headers
  curl_args+=( "${REST_AUTH_CURL_ARGS[@]}" )

  print_rest_status_message "info" "Calling" "${REST_SQL_URL}/${endpoint}"

  curl "${curl_args[@]}" "${REST_SQL_URL}/${endpoint}"
  local curl_rc=$?

  if [[ ${curl_rc} -ne 0 ]]; then
    rm -f "${headers_file}" "${target_file}"
    print_rest_status_message "error" "Error" "request to ${REST_SQL_URL}/${endpoint} failed"
    return ${curl_rc}
  fi

  local content_type
  content_type=$(awk 'tolower($1) == "content-type:" {print tolower($2)}' "${headers_file}" | tr -d '\r' | tail -1)
  rm -f "${headers_file}"

  if [[ "${content_type}" == application/zip* ]]; then
    return 0
  fi

  # anything else (usually application/json) is an error report
  local response
  response=$(cat "${target_file}" 2>/dev/null)
  rm -f "${target_file}"
  echo
  print_rest_response_as_problem_lines "${response}"
  echo
  return 1
}
