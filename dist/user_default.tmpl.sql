set define '^'
set verify off


prompt
prompt
prompt **********************************************************************
prompt ***  SCHEMA CREATION: {{data_schema}}
prompt **********************************************************************
prompt
prompt


prompt {{data_schema}} droppen
declare
  v_check number(1) := 0;
begin
  select 1
    into v_check
    from all_users
   where username = upper('{{data_schema}}');
  dbms_output.put_line('drop user {{data_schema}} cascade');
  execute immediate 'drop user {{data_schema}} cascade';
exception
  when no_data_found then
    null; -- ok, nothing to drop  ´
end;
/

prompt create user {{data_schema}} default tablespace users
create user {{data_schema}} NO AUTHENTICATION
  default tablespace users
  temporary tablespace temp
  profile default
  account unlock;


-- 2 tablespace quotas for {{data_schema}}
alter user {{data_schema}} quota unlimited on users;

-- 2 roles for {{data_schema}}
alter user {{data_schema}} default role all;

-- 11 system privileges for {{data_schema}}
grant create any context to {{data_schema}};
grant create any directory to {{data_schema}};
grant create any procedure to {{data_schema}};
grant create job to {{data_schema}};
grant create procedure to {{data_schema}};
grant create sequence to {{data_schema}};
grant create synonym to {{data_schema}};
grant create public synonym to {{data_schema}};
grant create table to {{data_schema}};
grant create trigger to {{data_schema}};
grant create type to {{data_schema}};
grant create view to {{data_schema}};
grant create session to {{data_schema}};

-- 5 object privileges for {{data_schema}}
grant execute on sys.dbms_crypto to {{data_schema}};
grant execute on sys.utl_file to {{data_schema}};
grant execute on sys.utl_http to {{data_schema}};
grant execute on sys.dbms_rls to {{data_schema}};

grant create any context to {{data_schema}};

alter user {{data_schema}}
  grant connect through {{proxy_user}};

prompt
prompt
prompt **********************************************************************
