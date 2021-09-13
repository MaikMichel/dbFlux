set define '^'
set verify off

prompt
prompt
prompt **********************************************************************
prompt ***  USER CREATION: {{proxy_user}}
prompt **********************************************************************
prompt
prompt

prompt {{proxy_user}} droppen
declare
  v_check number(1) := 0;
begin
  select 1
    into v_check
    from all_users
   where username = upper('{{proxy_user}}');
  dbms_output.put_line('drop user {{proxy_user}} cascade');
  execute immediate 'drop user {{proxy_user}} cascade';
exception
  when no_data_found then
    null; -- ok, nothing to drop  ´
end;
/

prompt create user {{proxy_user}} identified by {{db_app_pwd}} default tablespace ^deftablespace
create user {{proxy_user}} identified by "{{db_app_pwd}}"
  default tablespace users
  temporary tablespace temp
  profile default
  account unlock;



-- 2 roles for {{proxy_user}}
grant connect to {{proxy_user}};
alter user {{proxy_user}} default role all;
grant create any context to {{proxy_user}};

alter user {{data_schema}}
  grant connect through {{proxy_user}};

alter user {{logic_schema}}
  grant connect through {{proxy_user}};

alter user {{app_schema}}
  grant connect through {{proxy_user}};


prompt **********************************************************************
prompt
prompt