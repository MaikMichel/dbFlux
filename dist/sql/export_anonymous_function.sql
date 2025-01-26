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

  function get_table(p_table_name     in varchar,
                     p_include_flinks in boolean default false) return clob is
    l_script    clob;
    l_comments  clob;
  begin
    l_script := get_lowercase_ddl('TABLE', upper(p_table_name));

    -- all we need is before the first ";"
    l_script := substr(l_script, 1, instr(l_script, ';', 1, 1));

    -- replace double_quotes
    l_script := replace(l_script, '"', ''); -- TODO: Make an option

    -- additionally get comments
    begin
      l_comments := to_lowercase(dbms_metadata.get_dependent_ddl( 'COMMENT', upper(p_table_name)));

      -- replace schema name and double_quotes
      l_comments := replace(l_comments, '"', '');

      dbms_lob.append(l_script, chr(10)||chr(10)||l_comments);
    exception
      when others then
        null; -- ORA-31608: specified object of type COMMENT not found
    end;

    if p_include_flinks and g_files.count > 0 then
      dbms_lob.append(l_script, chr(10)||chr(10));
      for i in 0 .. g_files.count -1 loop
        dbms_lob.append(l_script, '-- File: '||g_files(i)||chr(10));
      end loop;
    end if;
    return l_script;
  end;

  function get_grants(p_object_name in varchar2) return clob is
    l_content clob;
  begin
     l_content := 'Prompt Revoke all grants found in user_tab_privs_made of object: '||p_object_name||chr(10)
              || 'begin'||chr(10)
              || '  for revoke_rec in (select privilege, table_name, grantee'||chr(10)
              || '                       from user_tab_privs_made'||chr(10)
              || '                      where table_name = '''||upper(p_object_name)||'''  )'||chr(10)
              || '  loop'||chr(10)
              || '    execute immediate ''revoke '' || revoke_rec.privilege || '' on '' || revoke_rec.table_name || '' from '' || revoke_rec.grantee;'||chr(10)
              || '  end loop;'||chr(10)
              || 'end;'||chr(10)
              || '/'||chr(10)
              || ''||chr(10)
              || ''||chr(10)
              || 'Prompt Grants to object: '||p_object_name;

    for cur in (select 'grant ' || privilege || ' on ' || table_name || ' to ' || grantee ||
                      case when grantable = 'YES' then ' with grant option;' else ';' end as grant_script
                  from user_tab_privs_made
                 where table_name = p_object_name
                order by grantee)
    loop
      l_content := concat(l_content, chr(10) || cur.grant_script);
    end loop;
    l_content := concat(l_content, chr(10)||chr(10));
    return l_content;
  end;

  procedure add_tables(p_zip_file in out nocopy blob,
                       p_table_name varchar2 default null) is
  begin
    for cur in (select table_name, 'tables/'||lower(table_name)||'.sql' filename
                  from user_tables
                 where p_table_name is null or upper(table_name) = upper(p_table_name))
    loop
      zip_add_file(p_zipped_blob => p_zip_file
                  ,p_name        => cur.filename
                  ,p_content     => clob_to_blob(get_table(p_table_name     => cur.table_name,
                                                           p_include_flinks => (p_table_name is not null))));
    end loop;
  end;

  function get_constraint(p_constraint_name   in varchar,
                          p_constraint_type   in varchar2) return clob is
    l_script clob;
  begin
    l_script := get_lowercase_ddl(case
                                        when p_constraint_type = 'R' then
                                          'REF_CONSTRAINT'
                                        else
                                          'CONSTRAINT'
                                      end,
                                      upper(p_constraint_name)
                                      );

    -- all we need is before the first ";"
    l_script := substr(l_script, 1, instr(l_script, ';', 1, 1));

    return l_script;
  end;

  procedure add_constraints(p_zip_file     in out nocopy blob,
                            p_object_name  in            varchar2 default null,
                            p_object_type  in            varchar2 default null) is
  begin
    for cur in (select constraint_name, 'constraints/' ||
                       case
                         when constraint_type = 'P' then 'primaries'
                         when constraint_type = 'U' then 'uniques'
                         when constraint_type = 'R' then 'foreigns'
                         when constraint_type = 'C' then 'checks'
                       end || '/' ||lower(constraint_name)||'.sql' filename,
                       constraint_type
                  from user_constraints
                 where generated != 'GENERATED NAME'
                   and constraint_name not like 'BIN$%'
                   and (   p_object_name     is null
                        or upper(constraint_name) = upper(p_object_name)
                        or upper(table_name||'_'||constraint_name) = upper(p_object_name)
                        or upper(table_name)      = upper(p_object_name)
                       )
                   and (
                            p_object_type is null
                         or p_object_type = 'TABLES'
                         or 'constraints/' || case
                                                when constraint_type = 'P' then 'primaries'
                                                when constraint_type = 'U' then 'uniques'
                                                when constraint_type = 'R' then 'foreigns'
                                                when constraint_type = 'C' then 'checks'
                                              end = lower(p_object_type)
                         )
                order by case
                            when constraint_type = 'P' then 'aaa'
                            when constraint_type = 'U' then 'bbb'
                            when constraint_type = 'R' then 'ccc'
                            when constraint_type = 'C' then 'ddd'
                          end, constraint_name
                )
    loop
      zip_add_file(p_zipped_blob => p_zip_file
                  ,p_name        => cur.filename
                  ,p_content     => clob_to_blob(get_constraint(cur.constraint_name, cur.constraint_type)));
    end loop;
  end;

  function get_index(p_index_name   in varchar) return clob is
    l_script clob;
  begin
    l_script := get_lowercase_ddl('INDEX', upper(p_index_name));

    -- only to the first occurence of ;
    l_script := substr(l_script, 1, instr(l_script, ';', 1, 1));

    return l_script;
  end;

  procedure add_indexes(p_zip_file     in out nocopy blob,
                        p_object_name  in            varchar2 default null,
                        p_object_type  in            varchar2 default null) is
  begin
    for cur in (select i.index_name index_name, 'indexes/'||
                       case
                         when c.constraint_type = 'P' then 'primaries'
                         when i.uniqueness = 'UNIQUE' then 'uniques'
                         else 'defaults'
                       end ||'/' ||lower(i.index_name)||'.sql' filename
                  from user_indexes i left join user_constraints c on i.index_name = c.index_name
                 where index_type != 'LOB'
                   and (   p_object_name    is null
                        or upper(i.index_name)  = upper(p_object_name)
                        or upper(i.table_name||'_'||i.index_name)  = upper(p_object_name)
                        or upper(i.table_name)  = upper(p_object_name)
                       )
                   and (
                            p_object_type is null
                         or p_object_type in ('TABLES')
                         or 'indexes/' || case
                                                when constraint_type = 'P' then 'primaries'
                                                when i.uniqueness = 'UNIQUE' then 'uniques'
                                                else 'defaults'
                                              end = lower(p_object_type)
                         )
                order by case
                           when constraint_type = 'P' then 'aaa'
                           when i.uniqueness = 'UNIQUE' then 'bbb'
                           else 'ccc'
                         end, i.index_name
                )
      loop
        zip_add_file(p_zipped_blob => p_zip_file
                    ,p_name        => cur.filename
                    ,p_content     => clob_to_blob(get_index(p_index_name   => cur.index_name)));
      end loop;
  end;

  function get_source(p_source_name        in varchar2,
                      p_source_type        in varchar2,
                      p_grant_with_object  in boolean  default false)
                      return clob is
    l_script clob;
  begin
    l_script :=ltrim(dbms_metadata.get_ddl(p_source_type, upper(p_source_name)), C_CRLF||' ');

    -- remove double quotes
    l_script := replace(l_script, '"'||upper(p_source_name)||'"', lower(p_source_name));

    if p_grant_with_object and p_source_type not in ('PACKAGE_BODY', 'TYPE_BODY') then
      l_script := concat(l_script, chr(10) || get_grants(p_source_name));
    end if;

    return l_script;
  end;

  procedure add_sources(p_zip_file           in out nocopy blob,
                        p_object_name        in            varchar2 default null,
                        p_object_type        in            varchar2 default null,
                        p_grant_with_object  in            boolean  default false) is
  begin
    for cur in (select object_name,
                        case
                          when object_type = 'PACKAGE BODY' then 'PACKAGE_BODY'
                          when object_type = 'PACKAGE' then 'PACKAGE_SPEC'
                          when object_type = 'TYPE BODY' then 'TYPE_BODY'
                          when object_type = 'TYPE' then 'TYPE_SPEC'
                          else object_type
                        end source_type,
                        'sources/'||
                        case
                          when object_type in ('PACKAGE', 'PACKAGE BODY') then 'packages'
                          when object_type in ('TYPE', 'TYPE BODY') then 'types'
                          else lower(object_type)||'s' -- plural
                        end||'/'||lower(object_name)||'.'||
                        case
                          when object_type = 'PACKAGE BODY' then 'pkb'
                          when object_type = 'PACKAGE' then 'pks'
                          when object_type = 'TYPE BODY' then 'tpb'
                          when object_type = 'TYPE' then 'tps'
                          else 'sql'
                        end filename
                  from user_objects
                 where object_type in ('TYPE', 'TYPE BODY', 'PACKAGE BODY', 'PACKAGE', 'FUNCTION', 'PROCEDURE', 'TRIGGER')
                   and object_name not like 'TEST\_%' escape '\'
                   and object_name not like 'SYS\_PLSQL\_%' escape '\'
                   and (    p_object_name is null
                         or (    upper(object_name) = upper(p_object_name)
                             and object_type like case lower(p_object_type)
                                                          when 'sources/packages'   then 'PACKAGE%'
                                                          when 'sources/types'      then 'TYPE%'
                                                          when 'sources/procedures' then 'PROCEDURE%'
                                                          when 'sources/functions'  then 'FUNCTION%'
                                                          when 'sources/triggers'   then 'TRIGGER%'
                                                   end
                            )
                       )
                )
    loop
      zip_add_file(p_zipped_blob => p_zip_file
                  ,p_name        => cur.filename
                  ,p_content     => clob_to_blob(get_source(p_source_name       => cur.object_name,
                                                            p_source_type       => cur.source_type,
                                                            p_grant_with_object => p_grant_with_object)));
    end loop;
  end;

  /* just like source but another folder and names start with TEST_*/
  procedure add_tests(p_zip_file     in out nocopy blob,
                      p_object_name  in            varchar2 default null,
                      p_object_type  in            varchar2 default null) is
  begin
    for cur in (select object_name,
                        case
                          when object_type = 'PACKAGE BODY' then 'PACKAGE_BODY'
                          when object_type = 'PACKAGE' then 'PACKAGE_SPEC'
                          when object_type = 'TYPE BODY' then 'TYPE_BODY'
                          when object_type = 'TYPE' then 'TYPE_SPEC'
                          else object_type
                        end source_type,
                        'tests/'||
                        case
                          when object_type in ('PACKAGE', 'PACKAGE BODY') then 'packages'
                          when object_type in ('TYPE', 'TYPE BODY') then 'types'
                          else lower(object_type)||'s' -- plural
                        end||'/'||lower(object_name)||'.'||
                        case
                          when object_type = 'PACKAGE BODY' then 'pkb'
                          when object_type = 'PACKAGE' then 'pks'
                          when object_type = 'TYPE BODY' then 'tpb'
                          when object_type = 'TYPE' then 'tps'
                          else 'sql'
                        end filename
                  from user_objects
                 where object_type in ('TYPE', 'TYPE BODY', 'PACKAGE BODY', 'PACKAGE', 'FUNCTION', 'PROCEDURE')
                   and object_name like 'TEST\_%' escape '\'
                   and (    p_object_name is null
                         or (    upper(object_name) = upper(p_object_name)
                             and object_type like case lower(p_object_type)
                                                          when 'tests/packages'   then 'PACKAGE%'
                                                          when 'tests/types'      then 'TYPE%'
                                                          when 'tests/procedures' then 'PROCEDURE%'
                                                          when 'tests/functions'  then 'FUNCTION%'
                                                   end
                            )
                       )
                )
    loop
      zip_add_file(p_zipped_blob => p_zip_file
                  ,p_name        => cur.filename
                  ,p_content     => clob_to_blob(get_source(p_source_name => cur.object_name,
                                                            p_source_type => cur.source_type)));
    end loop;
  end;

  function get_sequence(p_sequence_name in varchar2)
                      return clob is
    l_script clob;
  begin
    l_script := get_lowercase_ddl('SEQUENCE', upper(p_sequence_name));

    -- remove double quotes
    l_script := replace(l_script, '"'||upper(p_sequence_name)||'"', lower(p_sequence_name));

    return l_script;
  end;

  procedure add_sequences(p_zip_file     in out nocopy blob,
                          p_object_name  in            varchar2 default null,
                          p_object_type  in            varchar2 default null)  is
  begin
    for cur in (select sequence_name, 'sequences/'||lower(sequence_name)||'.sql' filename
                  from user_sequences
                 where sequence_name not like 'ISEQ%'
                   and (    p_object_name is null
                         or (    upper(sequence_name) = upper(p_object_name)
                             and p_object_type = 'SEQUENCES')) )
    loop
      zip_add_file(p_zipped_blob => p_zip_file
                  ,p_name        => cur.filename
                  ,p_content     => clob_to_blob(get_sequence(p_sequence_name   => cur.sequence_name)));
    end loop;
  end;

  function get_view(p_view_name         in varchar2,
                    p_grant_with_object in boolean  default false)
                      return clob is
    l_script clob;
  begin
    -- special workaround to be able to grant on invalid views
    if p_grant_with_object then
      -- first create a dummy view
      l_script := 'create or replace force view '||lower(p_view_name)||' as '||chr(10)||
                  'select * from json_table(''{dummy:"a"}'', ''$'' columns(dummy varchar2(10) path ''$.dummy''));'||chr(10)||chr(10);

      -- gen grants
      l_script := concat(l_script, get_grants(upper(p_view_name)));

      -- grants will be kept when underlying object is recreated ...
    end if;

    l_script := concat(l_script, get_lowercase_ddl('VIEW', upper(p_view_name)));

    return l_script;
  end;

  procedure add_views(p_zip_file           in out nocopy blob,
                      p_object_name        in            varchar2 default null,
                      p_object_type        in            varchar2 default null,
                      p_grant_with_object  in            boolean  default false) is
  begin
    for cur in (select view_name, 'views/'||lower(view_name)||'.sql' filename
                  from user_views
                 where (   p_object_name is null
                        or (     upper(view_name) = upper(p_object_name)
                             and p_object_type = 'VIEWS')))
    loop
      zip_add_file(p_zipped_blob => p_zip_file
                  ,p_name        => cur.filename
                  ,p_content     => clob_to_blob(get_view(p_view_name         => cur.view_name,
                                                          p_grant_with_object => p_grant_with_object)));
    end loop;
  end;

  function get_mview(p_mview_name in varchar2)
                      return clob is
    l_script clob;
  begin
    l_script := get_lowercase_ddl('MATERIALIZED_VIEW', upper(p_mview_name));

    /*
        select dbms_metadata.get_dependent_ddl ('MATERIALIZED_VIEW_LOG',
                                           upper(p_mview_name)
                                          )
     into v_mview_log_sql
     from dba_dependencies
    where referenced_type = 'TABLE'
      and referenced_name != v_mview_name
      and owner = v_mview_owner
      and name = v_mview_name;
    */
    return l_script;
  end;

  procedure add_mviews(p_zip_file     in out nocopy blob,
                        p_object_name  in            varchar2 default null,
                        p_object_type  in            varchar2 default null) is
  begin
    for cur in (select mview_name, 'mviews/'||lower(mview_name)||'.sql' filename
                  from user_mviews
                 where (   p_object_name is null
                        or (     upper(mview_name) = upper(p_object_name)
                             and p_object_type = 'MVIEWS')))
    loop
      zip_add_file(p_zipped_blob => p_zip_file
                  ,p_name        => cur.filename
                  ,p_content     => clob_to_blob(get_mview(p_mview_name   => cur.mview_name)));
    end loop;
  end;

  function get_job(p_job_name in varchar2)
                      return clob is
    l_script clob;
  begin
    l_script := ltrim(dbms_metadata.get_ddl('PROCOBJ', upper(p_job_name)), C_CRLF||' ');

    return l_script;
  end;

  procedure add_jobs(p_zip_file     in out nocopy blob,
                     p_object_name  in            varchar2 default null,
                     p_object_type  in            varchar2 default null) is
  begin
    for cur in (select job_name, 'jobs/'||lower(job_name)||'.sql' filename
                  from user_scheduler_jobs
                  where (   p_object_name is null
                        or (     upper(job_name) = upper(p_object_name)
                             and p_object_type = 'JOBS')))
    loop
      zip_add_file(p_zipped_blob => p_zip_file
                  ,p_name        => cur.filename
                  ,p_content     => clob_to_blob(get_job(p_job_name   => cur.job_name)));
    end loop;
  end;

  function get_synonym(p_synonym_name in varchar2,
                       p_owner        in varchar2)
                      return clob is
    l_script clob;
  begin
    l_script := to_lowercase('-- Exported with dbms_metadata.get_ddl' || chr(10) ||  ltrim(dbms_metadata.get_ddl('SYNONYM', upper(p_synonym_name), p_owner), C_CRLF||' '));

    return l_script;
  end;

  procedure add_synonyms(p_zip_file     in out nocopy blob,
                         p_object_name  in            varchar2 default null,
                         p_object_type  in            varchar2 default null) is
  begin
    for cur in (select synonym_name,  owner, 'synonyms/public/'||lower(synonym_name)||'.sql' filename
                  from all_synonyms
                 where owner in 'public'
                   and table_owner = user
                   and (   p_object_name is null
                        or (     synonym_name = upper(p_object_name)
                             and p_object_type = 'SYNONYMS'))
                union
                select synonym_name,  user, 'synonyms/private/'||lower(synonym_name)||'.sql' filename
                  from user_synonyms
                where (   p_object_name is null
                        or (     synonym_name = upper(p_object_name)
                             and p_object_type = 'SYNONYMS')) )
    loop
      zip_add_file(p_zipped_blob => p_zip_file
                  ,p_name        => cur.filename
                  ,p_content     => clob_to_blob(get_synonym(p_synonym_name   => cur.synonym_name,
                                                             p_owner => cur.owner)));
    end loop;
  end;

  function get_policy(p_object_name in varchar2)
                      return clob is
    l_script clob;
  begin
    l_script := to_lowercase('-- Exported with dbms_metadata.get_dependent_ddl' || chr(10) ||  ltrim(dbms_metadata.get_dependent_ddl('RLS_POLICY', upper(p_object_name), user), C_CRLF||' '));

    return l_script;
  end;

  procedure add_policies(p_zip_file     in out nocopy blob,
                         p_object_name  in            varchar2 default null,
                         p_object_type  in            varchar2 default null) is
  begin
    for cur in (select policy_name, object_name, 'policies/'||lower(object_name)||'.sql' filename
                  from user_policies
                where (   p_object_name is null
                        or (     object_name = upper(p_object_name)
                             and p_object_type = 'POLICIES')))
    loop
      zip_add_file(p_zipped_blob => p_zip_file
                  ,p_name        => cur.filename
                  ,p_content     => clob_to_blob(get_policy(p_object_name   => cur.object_name)));
    end loop;
  end;

  function get_context(p_namespace in varchar2)
                      return clob is
    l_script clob;
  begin
    l_script := to_lowercase('-- Exported with dbms_metadata.get_ddl' || chr(10) ||  ltrim(dbms_metadata.get_ddl('CONTEXT', upper(p_namespace)), C_CRLF||' '));

    return l_script;
  end;

  procedure add_contexts(p_zip_file     in out nocopy blob,
                         p_object_name  in            varchar2 default null,
                         p_object_type  in            varchar2 default null) is
  begin
    for cur in (select namespace, 'contexts/'||lower(namespace)||'.sql' filename
                  from all_context
                 where schema = user
                   and (   p_object_name is null
                        or (     namespace = upper(p_object_name)
                             and p_object_type = 'CONTEXTS'))
                 union
                select p_object_name, 'contexts/'||lower(p_object_name)||'.sql' filename
                  from dual
                 where p_object_name is not null
                   and p_object_type = 'CONTEXTS')
    loop
      zip_add_file(p_zipped_blob => p_zip_file
                  ,p_name        => cur.filename
                  ,p_content     => clob_to_blob(get_context(p_namespace  => cur.namespace)));
    end loop;
  end;

  procedure add_grants(p_zip_file           in out nocopy blob,
                       p_grant_with_object  in            boolean  default false) is
    l_content clob;
    l_grant_with_object varchar(1) := case when p_grant_with_object then 'Y' else 'N' end;
  begin
    l_content := 'Prompt Revoke all grants found in user_tab_privs_made'||chr(10)
              || 'begin'||chr(10)
              || '  for revoke_rec in (select privilege, table_name, grantee'||chr(10)
              || '                       from user_tab_privs_made'||chr(10)
              || '                      where ('''||l_grant_with_object||''' = ''N'' or type not in (''VIEW'', ''PACKAGE''))'||chr(10)
              || '                        and table_name != user -- not INHERIT PRIVILEGES'||chr(10)
              || '                     )'||chr(10)
              || '  loop'||chr(10)
              || '    execute immediate ''revoke '' || revoke_rec.privilege || '' on '' || revoke_rec.table_name || '' from '' || revoke_rec.grantee;'||chr(10)
              || '  end loop;'||chr(10)
              || 'end;'||chr(10)
              || '/'||chr(10)
              || ''||chr(10)
              || ''||chr(10)
              || 'Prompt Grants to all known objects';

    for cur in (select 'grant ' || privilege || ' on ' || table_name || ' to ' || grantee ||
                      case when grantable = 'YES' then ' with grant option;' else ';' end as grant_script
                  from user_tab_privs_made
                where not exists (select 1 from user_recyclebin where object_name = table_name )
                  and table_name != user -- not INHERIT PRIVILEGES
                  and (l_grant_with_object = 'N' or type not in ('VIEW', 'PACKAGE'))
                order by grantee, table_name)
    loop
      l_content := concat(l_content, chr(10) || cur.grant_script);
    end loop;
    l_content := concat(l_content, chr(10));


     zip_add_file(p_zipped_blob => p_zip_file
                  ,p_name        => 'ddl/base/010_grants.sql'
                  ,p_content     => clob_to_blob(l_content));
  end;

  function get_zip(p_folder             in varchar2 default null,
                   p_file_name          in varchar2 default null,
                   p_grant_with_object  in boolean default false)
                   return blob is
    l_zip_file  blob;
    v_file      blob;
    l_object_name varchar2(250) := upper(substr(p_file_name, 1, instr(p_file_name, '.')-1));
    l_object_type varchar2(250) := upper(p_folder);
  begin

    -- init boolean to validate, that something was exported, later
    g_objects_found := false;

    -- init global files array
    g_files.delete;


    dbms_lob.createtemporary(l_zip_file, true);

    --
    if (l_object_type is null or l_object_type in ('TABLES', 'INDEXES/PRIMARIES', 'INDEXES/UNIQUES', 'INDEXES/DEFAULTS')) then
      add_indexes(p_zip_file     => l_zip_file,
                  p_object_name  => l_object_name,
                  p_object_type  => l_object_type);
    end if;

    if (l_object_type is null or l_object_type in ('TABLES', 'CONSTRAINTS/PRIMARIES', 'CONSTRAINTS/FOREIGNS', 'CONSTRAINTS/CHECKS', 'CONSTRAINTS/UNIQUES')) then
      add_constraints(p_zip_file     => l_zip_file,
                      p_object_name  => l_object_name,
                      p_object_type  => l_object_type);
    end if;

    if (l_object_type is null or l_object_type = 'TABLES') then
      add_tables(p_zip_file   => l_zip_file,
                 p_table_name => l_object_name);
    end if;

    if (l_object_type is null or l_object_type in ('SOURCES/PACKAGES', 'SOURCES/TYPES', 'SOURCES/FUNCTIONS', 'SOURCES/PROCEDURES', 'SOURCES/TRIGGERS')) then
      add_sources(p_zip_file          => l_zip_file,
                  p_object_name       => l_object_name,
                  p_object_type       => l_object_type,
                  p_grant_with_object => p_grant_with_object);
    end if;

    if (l_object_type is null or l_object_type in ('TESTS/PACKAGES', 'TESTS/TYPES', 'TESTS/FUNCTIONS', 'TESTS/PROCEDURES')) then
      add_tests(p_zip_file      => l_zip_file,
                p_object_name   => l_object_name,
                p_object_type   => l_object_type);
    end if;

    if (l_object_type is null or l_object_type in ('SEQUENCES')) then
      add_sequences(p_zip_file      => l_zip_file,
                    p_object_name   => l_object_name,
                    p_object_type   => l_object_type);
    end if;

    if (l_object_type is null or l_object_type in ('VIEWS')) then
      add_views(p_zip_file          => l_zip_file,
                p_object_name       => l_object_name,
                p_object_type       => l_object_type,
                p_grant_with_object => p_grant_with_object);
    end if;

    if (l_object_type is null or l_object_type in ('MVIEWS')) then
      add_mviews(p_zip_file      => l_zip_file,
                 p_object_name   => l_object_name,
                 p_object_type   => l_object_type);
    end if;

    if (l_object_type is null or l_object_type in ('JOBS')) then
      add_jobs(p_zip_file      => l_zip_file,
               p_object_name   => l_object_name,
               p_object_type   => l_object_type);
    end if;

    if (l_object_type is null or l_object_type in ('SYNONYMS/PUBLIC', 'SYNONYMS/PRIVATE')) then
      add_synonyms(p_zip_file      => l_zip_file,
                   p_object_name   => l_object_name,
                   p_object_type   => l_object_type);
    end if;

    if (l_object_type is null or l_object_type in ('POLICIES')) then
      add_policies(p_zip_file      => l_zip_file,
                   p_object_name   => l_object_name,
                   p_object_type   => l_object_type);
    end if;

    if (l_object_type is null or l_object_type in ('CONTEXTS')) then
      add_contexts(p_zip_file      => l_zip_file,
                   p_object_name   => l_object_name,
                   p_object_type   => l_object_type);
    end if;

    if (l_object_type is null) then
      add_grants(p_zip_file           => l_zip_file,
                 p_grant_with_object  => p_grant_with_object);
    end if;

    if not g_objects_found then
      raise no_data_found;
    end if;

    zip_finish(p_zipped_blob => l_zip_file);
    return l_zip_file;

    exception
      -- we need the -20001, cause this is catched by bash
      when no_data_found then
        raise_application_error(-20001, 'Nothing found to export');

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