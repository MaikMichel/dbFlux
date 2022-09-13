  c_crlf                         constant varchar2(10) := chr(13)||chr(10);
  c_zip_local_file_header        constant raw(4)       := hextoraw('504B0304');
  c_zip_end_of_central_directory constant raw(4)       := hextoraw('504B0506');

  g_objects_found boolean;

  type t_array is table of varchar2(2000) index by binary_integer;
  g_files t_array;

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


 -- copyright by Anton Scheffer (MIT license, see https://technology.amis.nl/2010/03/13/utl_compress-gzip-and-zlib/)
 function zip_blob_to_num (p_blob in blob,
                           p_len  in integer,
                           p_pos  in integer) return number is
   l_raw_num number;
 begin
   l_raw_num := utl_raw.cast_to_binary_integer(dbms_lob.substr(p_blob, p_len, p_pos), utl_raw.little_endian);
   if l_raw_num < 0 then
     l_raw_num := l_raw_num + 4294967296;
   end if;
   return l_raw_num;
 end zip_blob_to_num;

  -- copyright by Anton Scheffer (MIT license, see https://technology.amis.nl/2010/03/13/utl_compress-gzip-and-zlib/)
  function zip_little_endian (p_big   in number,
                              p_bytes in pls_integer := 4) return raw is
    l_big number := p_big;
  begin
    if l_big > 2147483647 then
      l_big := l_big - 4294967296;
    end if;
    return utl_raw.substr(utl_raw.cast_from_binary_integer(l_big, utl_raw.little_endian), 1, p_bytes);
  end zip_little_endian;

  -- copyright by Anton Scheffer (MIT license, see https://technology.amis.nl/2010/03/13/utl_compress-gzip-and-zlib/)
  procedure zip_add_file (p_zipped_blob in out blob,
                          p_name        in     varchar2,
                          p_content     in     blob) is
    l_now        date;
    l_blob       blob;
    l_len        integer;
    l_clen       integer;
    l_crc32      raw(4) := hextoraw('00000000');
    l_compressed boolean := false;
    l_name       raw(32767);
  begin
    g_objects_found := true;

    l_now := sysdate;
    l_len := nvl(dbms_lob.getlength(p_content), 0);
    if l_len > 0 then
      l_blob       := utl_compress.lz_compress(p_content);
      l_clen       := dbms_lob.getlength(l_blob) - 18;
      l_compressed := l_clen < l_len;
      l_crc32      := dbms_lob.substr(l_blob, 4, l_clen + 11);
    end if;
    if not l_compressed then
      l_clen := l_len;
      l_blob := p_content;
    end if;
    l_name := utl_i18n.string_to_raw(p_name, 'AL32UTF8');
    dbms_lob.append(p_zipped_blob,
                    utl_raw.concat(c_zip_local_file_header, -- local file header signature
                                   hextoraw('1400'), -- version 2.0
                                   case
                                     when l_name = utl_i18n.string_to_raw(p_name, 'US8PC437') then
                                       hextoraw('0000') -- no general purpose bits
                                     else
                                      hextoraw('0008') -- set language encoding flag (efs)
                                   end,
                                   case
                                     when l_compressed then
                                       hextoraw('0800') -- deflate
                                     else
                                       hextoraw('0000') -- stored
                                   end,
                                   zip_little_endian(  to_number(to_char(l_now, 'ss')) / 2
                                                     + to_number(to_char(l_now, 'mi')) * 32
                                                     + to_number(to_char(l_now, 'hh24')) * 2048,
                                                     2), -- file last modification time
                                   zip_little_endian(  to_number(to_char(l_now, 'dd'))
                                                     + to_number(to_char(l_now, 'mm')) * 32
                                                     + (to_number(to_char(l_now, 'yyyy')) - 1980) * 512,
                                                     2), -- file last modification date
                                   l_crc32, -- crc-32
                                   zip_little_endian(l_clen), -- compressed size
                                   zip_little_endian(l_len), -- uncompressed size
                                   zip_little_endian(utl_raw.length(l_name), 2), -- file name length
                                   hextoraw('0000'), -- extra field length
                                   l_name)
                      ); -- file name
    if l_compressed then
      dbms_lob.copy(p_zipped_blob, l_blob, l_clen, dbms_lob.getlength(p_zipped_blob) + 1, 11); -- compressed content
    elsif l_clen > 0 then
      dbms_lob.copy(p_zipped_blob, l_blob, l_clen, dbms_lob.getlength(p_zipped_blob) + 1, 1); -- content
    end if;
    if dbms_lob.istemporary(l_blob) = 1 then
      dbms_lob.freetemporary(l_blob);
    end if;

    g_files(g_files.count) := p_name;
  end zip_add_file;

  -- copyright by Anton Scheffer (MIT license, see https://technology.amis.nl/2010/03/13/utl_compress-gzip-and-zlib/)
  PROCEDURE zip_finish (p_zipped_blob IN OUT BLOB) IS
    l_cnt             pls_integer := 0;
    l_offs            integer;
    l_offs_dir_header integer;
    l_offs_end_header integer;
    l_comment         raw(32767) := utl_raw.cast_to_raw('Implementation by Anton Scheffer');
  begin
    l_offs_dir_header := dbms_lob.getlength(p_zipped_blob);
    l_offs            := 1;
    while dbms_lob.substr(p_zipped_blob, utl_raw.length(c_zip_local_file_header), l_offs) = c_zip_local_file_header
    loop
      l_cnt := l_cnt + 1;
      dbms_lob.append(p_zipped_blob,
                      utl_raw.concat(hextoraw('504b0102'), -- central directory file header signature
                                     hextoraw('1400'), -- version 2.0
                                     dbms_lob.substr(p_zipped_blob, 26, l_offs + 4),
                                     hextoraw('0000'), -- file comment length
                                     hextoraw('0000'), -- disk number where file starts
                                     hextoraw('0000'), -- internal file attributes: 0000 = binary file, 0100 = (ascii)text file
                                     case
                                      when dbms_lob.substr(p_zipped_blob,
                                                           1,
                                                           l_offs + 30 + zip_blob_to_num(p_zipped_blob, 2, l_offs + 26) - 1) in (hextoraw('2f')/*slash*/, hextoraw('5c')/*backslash*/)
                                        then hextoraw('10000000') -- a directory/folder
                                        else hextoraw('2000b681') -- a file
                                     end, -- external file attributes
                                     zip_little_endian(l_offs - 1), -- relative offset of local file header
                                     dbms_lob.substr(p_zipped_blob,
                                                     zip_blob_to_num(p_zipped_blob, 2, l_offs + 26),
                                                     l_offs + 30)
                                     )
                        ); -- file name
        l_offs :=   l_offs + 30
                  + zip_blob_to_num(p_zipped_blob, 4, l_offs + 18) -- compressed size
                  + zip_blob_to_num(p_zipped_blob, 2, l_offs + 26) -- file name length
                  + zip_blob_to_num(p_zipped_blob, 2, l_offs + 28); -- extra field length
    end loop;
    l_offs_end_header := dbms_lob.getlength(p_zipped_blob);
    dbms_lob.append(p_zipped_blob,
                    utl_raw.concat(c_zip_end_of_central_directory, -- end of central directory signature
                                   hextoraw('0000'), -- number of this disk
                                   hextoraw('0000'), -- disk where central directory starts
                                   zip_little_endian(l_cnt, 2), -- number of central directory records on this disk
                                   zip_little_endian(l_cnt, 2), -- total number of central directory records
                                   zip_little_endian(l_offs_end_header - l_offs_dir_header), -- size of central directory
                                   zip_little_endian(l_offs_dir_header), -- offset of start of central directory, relative to start of archive
                                   zip_little_endian(nvl(utl_raw.length(l_comment), 0), 2), -- zip file comment length
                                   l_comment
                                   )
                      );
  end zip_finish;


  -- inspired and copyright by https://github.com/connormcd/misc-scripts/blob/master/ddl_cleanup.sql
  function to_lowercase(p_content in clob) return clob is

    l_in_double   boolean := false;
    l_in_string   boolean := false;
    l_need_quotes boolean := false;

    l_res         clob;
    l_content     clob := regexp_replace(p_content,'"([A-Z0-9_$#]+)"','\1');
    l_idx         int := 0;
    l_thischar    varchar2(1 char);
    l_prevchar    varchar2(1 char);
    l_nextchar    varchar2(1 char);
    l_sqt         varchar2(1 char) := '''';
    l_dqt         varchar2(1 char) := '"';
    l_last_l_dqt  int;

    procedure append is
    begin
      if not l_need_quotes and not l_in_string and not l_in_double then
        l_res := l_res || lower(l_thischar);
      else
        l_res := l_res || l_thischar;
      end if;
    end;
  begin
    dbms_lob.createtemporary(l_res, true);

    loop
      l_idx := l_idx + 1;
      if l_idx > 1 then
        l_prevchar := l_thischar;
      end if;
      l_thischar := substr(l_content, l_idx, 1);
      exit when l_thischar is null;
      l_nextchar := substr(l_content, l_idx+1, 1);

      if l_thischar not in (l_dqt,l_sqt) then
        append;
        if l_in_double then
          if l_thischar not between 'A' and 'Z' and l_thischar not between '0' and '9' and l_thischar not in ('$','#','_') or
          ( l_prevchar = l_dqt  and ( l_thischar in ('$','#','_') or l_thischar between '0' and '9' ) )
          then
            l_need_quotes := true;
          end if;
        end if;
      elsif l_thischar = l_dqt and not l_in_double and not l_in_string then
        append;
        l_in_double := true;
        l_need_quotes := false;
      elsif l_thischar = l_dqt and l_in_double and not l_in_string then
        l_last_l_dqt := instr(l_res,l_dqt,-1);
        if l_last_l_dqt = 0 then
          raise_application_error(-20000,'l_last_l_dqt died');
        else
          if not l_need_quotes then
            l_res := substr(l_res,1,l_last_l_dqt-1)||lower(substr(l_res,l_last_l_dqt+1));
          else
            append;
          end if;
          l_need_quotes := false;
        end if;
        l_in_double := false;
      elsif l_thischar = l_sqt then
        append;
        if not l_in_double then
          if not l_in_string then
            l_in_string := true;
          else
            if l_nextchar = l_sqt then
              l_in_string := true;
              l_res := l_res ||  l_nextchar;
              l_idx := l_idx + 1;
            else
              l_in_string := false;
            end if;
          end if;
        end if;
      else
        append;
      end if;

    end loop;
    return l_res;
  end;

  function get_lowercase_ddl(p_type varchar2,
                             p_name varchar2) return clob is
  begin
    return to_lowercase('-- Exported with dbms_metadata.get_ddl' || chr(10) || ltrim(dbms_metadata.get_ddl(p_type, p_name), C_CRLF||' '));
  end;



  function get_zip(p_app_id     in number,
                   p_file_name  in varchar2 default null)
                   return blob is
    l_zip_file  blob;
    v_file      blob;
  begin

    -- init boolean to validate, that something was exported, later
    g_objects_found := false;

    -- init global files array
    g_files.delete;


    dbms_lob.createtemporary(l_zip_file, true);

    for cur in (select 'f'||application_id app_id, file_name, file_content
                  from apex_application_static_files
                 where application_id = p_app_id
                   and (file_name = p_file_name or p_file_name is null)
                   and file_name not like '%.min.css'
                   and file_name not like '%.min.js'
                   and file_name not like '%.js.map')
    loop
      zip_add_file(p_zipped_blob => l_zip_file
                  ,p_name        => cur.file_name
                  ,p_content     => cur.file_content);
    end loop;


    if not g_objects_found then
      raise no_data_found;
    end if;

    zip_finish(p_zipped_blob => l_zip_file);
    return l_zip_file;

    exception
      -- we need the -20001, cause this is catched by bash
      when no_data_found then
        raise_application_error(-20002, 'Nothing found to export ('||p_app_id||'/'||p_file_name||')');

      when others then
        raise_application_error(-20001, sqlerrm);
  end;

  -- #######################################################################################################

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