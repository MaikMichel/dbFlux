  --
  -- copyright by Tim Hall, see https://oracle-base.com/dba/script?category=miscellaneous&file=base64encode.sql
  function to_base64(p_blob in blob) return clob is
    l_bas64 CLOB;
    l_step PLS_INTEGER := 14400; -- make sure you set a multiple of 3 not higher than 24573
    -- size of a whole multiple of 48 is beneficial to get NEW_LINE after each 64 characters
  begin
    for i in 0 .. trunc((dbms_lob.getlength(p_blob) - 1 ) / l_step) loop
      l_bas64 := l_bas64 || utl_raw.cast_to_varchar2(utl_encode.base64_encode(dbms_lob.substr(p_blob, l_step, i * l_step + 1)));
    end loop;
    return l_bas64;
  end;

  -- copyright by utPLSQL, ut_util.string_to_table
  function string_to_table(a_string varchar2, a_delimiter varchar2:= chr(10), a_skip_leading_delimiter varchar2 := 'N') return ut_varchar2_list is
    l_offset                 integer := 1;
    l_delimiter_position     integer;
    l_skip_leading_delimiter boolean := coalesce(a_skip_leading_delimiter = 'Y',false);
    l_result                 ut_varchar2_list := ut_varchar2_list();
  begin
    if a_string is null then
      return l_result;
    end if;
    if a_delimiter is null then
      return ut_varchar2_list(a_string);
    end if;

    loop
      l_delimiter_position := instr(a_string, a_delimiter, l_offset);
      if not (l_delimiter_position = 1 and l_skip_leading_delimiter) then
        l_result.extend;
        if l_delimiter_position > 0 then
          l_result(l_result.last) := substr(a_string, l_offset, l_delimiter_position - l_offset);
        else
          l_result(l_result.last) := substr(a_string, l_offset);
        end if;
      end if;
      exit when l_delimiter_position = 0;
      l_offset := l_delimiter_position + 1;
    end loop;
    return l_result;
  end;

  procedure print_clob_to_output (p_clob IN clob) is
   l_offset     pls_integer := 1;
   l_length     pls_integer := 128;
  begin
    loop
      exit when l_offset > dbms_lob.getlength(p_clob);
      dbms_output.put_line( replace(replace(dbms_lob.substr( p_clob, l_length, l_offset), chr(10)), chr(13)));
      l_offset := l_offset + l_length;
    end loop;
  end print_clob_to_output;

  function clob_to_blob (p_clob clob) return blob is
    l_blob         blob;
    l_lang_context integer := dbms_lob.default_lang_ctx;
    l_warning      integer := dbms_lob.warn_inconvertible_char;
    l_dest_offset  integer := 1;
    l_src_offset   integer := 1;
  begin
    if p_clob is not null then
      dbms_lob.createtemporary(l_blob, true);
      dbms_lob.converttoblob(dest_lob     => l_blob,
                             src_clob     => p_clob,
                             amount       => dbms_lob.lobmaxsize,
                             dest_offset  => l_dest_offset,
                             src_offset   => l_src_offset,
                             blob_csid    => nls_charset_id('AL32UTF8'),
                             lang_context => l_lang_context,
                             warning      => l_warning);
    end if;
    return l_blob;
  end clob_to_blob;

  function get_junit_full_xml return clob is
    l_clob clob := empty_clob();
  begin
    for cur in (select column_value
                  from table(ut.run(ut_junit_reporter()))) loop
      l_clob := l_clob || cur.column_value;
    end loop;
    return l_clob;
  end get_junit_full_xml;

  function get_junit_part_xml(p_package in varchar2) return clob is
    l_clob clob := empty_clob();
  begin
    for cur in (select column_value
                  from table(ut.run(p_package, ut_junit_reporter()))) loop
      l_clob := l_clob || cur.column_value;
    end loop;
    return l_clob;
  end get_junit_part_xml;

  function get_coverage_part_html(p_package in varchar2,
                                  p_targets in varchar2) return clob is
    l_clob clob := empty_clob();
    l_targets ut_varchar2_list;
  begin
    l_targets := string_to_table(p_targets, '|');
    for cur in (select column_value
                  from table(ut.run(p_package, ut_coverage_html_reporter(), a_include_objects => l_targets))) loop
      l_clob := l_clob || cur.column_value;
    end loop;
    return l_clob;
  end get_coverage_part_html;
