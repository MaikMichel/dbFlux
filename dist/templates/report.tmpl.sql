set serveroutput on
declare
  l_b64            clob;
  l_bin            blob;
  l_file_name      varchar2(2000) := '{{inFileName}}';

  gc_red           varchar2(7) := chr(27) || '[31m';
  gc_green         varchar2(7) := chr(27) || '[32m';
  gc_reset         varchar2(7) := chr(27) || '[0m';

  function get_file_mime_type(p_file_name in varchar2) return varchar2 is
    l_mime_type varchar2(2000) := 'application/octet-stream';
  begin
    select mime_type
      into l_mime_type
      from xmltable (xmlnamespaces (default 'http://xmlns.oracle.com/xdb/xdbconfig.xsd'),
                                            '//mime-mappings/mime-mapping'
                                    passing xdb.dbms_xdb.cfg_get()
                      columns
                        extension varchar2(50) path 'extension',
                        mime_type varchar2(100) path 'mime-type')
      where lower(extension) = lower(substr(p_file_name, instr(p_file_name, '.', -1) + 1))
        and rownum = 1;
    return l_mime_type;
  exception
    when no_data_found then
      return l_mime_type;
  end;
begin


  -----------------------------------------------------------------------------------
  -- now load {{inFileName}}
  dbms_lob.createtemporary(l_b64, true, dbms_lob.session);

  {{#each this.inFileContent}}
  dbms_lob.append(l_b64, '{{{this}}}');
  {{/each}}

  l_bin := apex_web_service.clobbase642blob(l_b64);


{{{uploadTemplate}}}
  -----------------------------------------------------------------------------------



  commit;
exception
  when others then
    dbms_output.put_line(gc_red||sqlerrm || gc_reset);
    raise;
end;
/
