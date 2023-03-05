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
