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

  function format_json (p_clob in clob) return clob is
    l_blob blob;
    l_clob clob;
  begin
    l_blob := clob_to_blob(p_clob);
    select json_serialize(l_blob returning clob PRETTY)
      into l_clob
      from dual;
    return l_clob;
  end format_json;

  function get_json(p_table_name in varchar2) return clob is
    cursor c_col is
      select column_name, data_type, data_length, data_precision, data_scale,
             decode(nullable, 'N', 'Y', 'N') required, data_default, comments,
             char_col_decl_length
        from user_tab_columns natural join user_col_comments
       where table_name = upper(p_table_name)
        --  and column_name not in (select column_value
        --                            from table_definitions.split_to_table(p_exclude_column_list, ','))
       order by column_id;

    l_json_obj  json_object_t;
    l_columns  json_array_t := new json_array_t;
    l_constraints  json_array_t := new json_array_t;
    l_container json_object_t := new json_object_t;
    l_validation_comments json_object_t;
    l_cons_columns json_array_t;
    l_cons_column json_object_t;
    l_clob      clob;
    e_not_a_valid_json    exception;
    pragma exception_init (e_not_a_valid_json, -40441);
  begin
      /*
        {
          columns: [
            {column_name: "mrb_name",
             ...
            }
          ],
          constraints: [
            {
              name: "dings_uk",
              type: "uq"
              columns: ["cola", "colb"]
            }
          ]
        }
      */
     for cur in c_col loop
      l_json_obj := json_object_t();

      l_json_obj.put('column_name',    cur.column_name);
      l_json_obj.put('data_type',      cur.data_type);
      l_json_obj.put('data_length',    nvl(nvl(cur.char_col_decl_length, cur.data_precision), 39));
      l_json_obj.put('data_precision', cur.data_precision);
      l_json_obj.put('data_scale',     cur.data_scale);
      l_json_obj.put('required',       cur.required);
      l_json_obj.put('data_default',   replace(cur.data_default, '''')); -- Hoch Kommata weg
      l_json_obj.put('comments',       cur.comments);

      -- begin
      --   select search_condition_vc
      --     into l_rec.check_condition
      --     from user_constraints
      --    where table_name = upper(p_table_name)
      --      and constraint_name = upper(p_table_name)||'_'||cur.column_name||'_CC';
      -- exception
      --   when no_data_found or too_many_rows then
      --     null;
      -- end;

      if cur.comments is not null then
        begin
          l_validation_comments := json_object_t.parse(cur.comments);
          -- l_rec.data_length     := nvl(l_json_obj.get_number('mln'), l_rec.data_length);
          -- l_rec.required        := nvl(l_json_obj.get_string('req'), l_rec.required);
          -- l_rec.data_type       := nvl(l_json_obj.get_string('typ'), l_rec.data_type);
          -- l_rec.range_start     := l_json_obj.get_string('rns');
          -- l_rec.range_end       := l_json_obj.get_string('rne');
          -- l_rec.check_condition := nvl(l_json_obj.get_string('vvl'), l_rec.check_condition);
          l_json_obj.put('addional_logic', l_validation_comments);
        exception
          when e_not_a_valid_json then
            null; -- no json (... is json doesn't work on german umlauts )
        end;
      end if;

      l_columns.append(l_json_obj);
    end loop;
    l_container.put('table', p_table_name);
    l_container.put('columns', l_columns);


    for cur in (select constraint_name, constraint_type
                 from user_constraints
                where table_name = upper(p_table_name)
                  and constraint_type IN ('P', 'U', 'R')
                  and status = 'ENABLED')
    loop
      l_json_obj := json_object_t();

      l_json_obj.put('constraint_name',    cur.constraint_name);
      l_json_obj.put('constraint_type',      cur.constraint_type);

      l_cons_columns := json_array_t();

      for col in (
        WITH ac AS (select constraint_name, constraint_type, r_constraint_name
                      from user_constraints
                     where table_name = upper(p_table_name)
                       and constraint_name = cur.constraint_name),
            acc AS (select acc.column_name,
                           length(acc.column_name) AS column_name_length,
                           acc.position,
                           ac.r_constraint_name
                      from ac join user_cons_columns acc on ac.constraint_name = acc.constraint_name),
          acc_r AS (select acc_r.constraint_name as r_constraint_name,
                           acc_r.table_name      as r_table_name,
                           acc_r.column_name     as r_column_name,
                           acc_r.position        as r_position
                     from ac join user_cons_columns acc_r on ac.r_constraint_name = acc_r.constraint_name)
        select acc.column_name, acc.column_name_length, atc.data_type, acc.position,
               acc_r.r_constraint_name,acc_r.r_table_name, acc_r.r_column_name, acc_r.r_position
          from acc join user_tab_columns atc on acc.column_name = atc.column_name
              left join acc_r on acc.r_constraint_name = acc_r.r_constraint_name
                             and acc.position          = acc_r.r_position
         order by acc.position)
      loop
        l_cons_column := json_object_t();

        l_cons_column.put('column_name', col.column_name);
        l_cons_column.put('column_name_length', col.column_name_length);
        l_cons_column.put('data_type', col.data_type);
        l_cons_column.put('position', col.position);
        l_cons_column.put('r_constraint_name', col.r_constraint_name);
        l_cons_column.put('r_table_name', col.r_table_name);
        l_cons_column.put('r_column_name', col.r_column_name);
        l_cons_column.put('r_position', col.r_position);

        l_cons_columns.append(l_cons_column);
      end loop;
      l_json_obj.put('cons_columns', l_cons_columns);

      l_constraints.append(l_json_obj);
    end loop;

    l_container.put('constraints', l_constraints);

    l_clob := format_json(l_container.to_clob());

    return l_clob;
  end;
