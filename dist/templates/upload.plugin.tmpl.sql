set serveroutput on
declare
  l_application_id apex_applications.application_id%type;
  l_workspace_id   apex_applications.workspace_id%type;
  l_plugin_id      apex_appl_plugins.plugin_id%type;
  l_plugin_file_id apex_appl_plugin_files.plugin_file_id%type;
  v_b64            clob;

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
  -- determine target app and workspace
  select apex_applications.application_id, apex_applications.workspace_id, apex_appl_plugins.plugin_id
    into l_application_id, l_workspace_id, l_plugin_id
    from apex_applications join apex_appl_plugins on apex_applications.application_id = apex_appl_plugins.application_id
                                                 and apex_appl_plugins.name = '{{pluginID}}'
   where to_char(apex_applications.application_id) = '{{inAppID}}'
      or upper(apex_applications.alias) = upper('{{inAppID}}');

  apex_util.set_security_group_id (p_security_group_id => l_workspace_id);

  execute immediate 'alter session set current_schema=' || apex_application.g_flow_schema_owner;

  {{#each files}}
  -----------------------------------------------------------------------------------
  -- now load {{inFileName}}
  dbms_lob.createtemporary(v_b64, true, dbms_lob.session);

  {{#each this.inFileContent}}
  dbms_lob.append(v_b64, '{{{this}}}');
  {{/each}}

  --
  -- determin target plugin file
  begin
    select plugin_file_id
      into l_plugin_file_id
      from apex_appl_plugin_files
    where plugin_id = l_plugin_id
      and plugin_name = '{{pluginID}}'
      and file_name = '{{inFileName}}';
  exception
    when no_data_found then
      l_plugin_file_id := null;
  end;

  wwv_flow_imp_shared.create_plugin_file(p_id           => l_plugin_file_id,
                                         p_flow_id      => l_application_id,
                                         p_plugin_id    => l_plugin_id,
                                         p_file_name    => '{{inFileName}}',
                                         p_mime_type    => get_file_mime_type(p_file_name => '{{inFileName}}'),
                                         p_file_charset => 'utf-8',
                                         p_file_content => apex_web_service.clobbase642blob(v_b64));


  dbms_lob.freetemporary(v_b64);
  dbms_output.put_line(gc_green||' ... File uploaded as: {{inFileName}}' || gc_reset);


  -----------------------------------------------------------------------------------
  {{/each}}

  commit;
exception
  when others then
    dbms_output.put_line(gc_red||sqlerrm || gc_reset);
end;
/
