set linesize 2000
set tab off
set serveroutput on
set scan off
set define off
set pagesize 9999
set trim on

exec dbms_utility.compile_schema(schema => USER);

COLUMN MY_USER FORMAT A20
COLUMN DB      FORMAT A20
COLUMN NOW     FORMAT A35
Prompt
Prompt Show the details of the connection for confirmation
select user as MY_USER, ora_database_name as DB, systimestamp as NOW
  from dual;
  
COLUMN MY_USER  CLEAR
COLUMN DB       CLEAR
COLUMN NOW      CLEAR

set heading off

Rem Run the Sublime File
@"c:\Users\mmi\Projekte\tayra\tayra\db\tayra_logic\tests\packages\test_data.pkb"

Rem show errors for easy correction
Rem prompt Errors
set pagesize 9999
set linesize 9999
set heading off
set trim on

select user_errors
  from (
            select chr(27) || '[31m' || lower(attribute) -- error or warning
              || ' '
              || line || '/' || position -- line and column
              || ' '
              || lower(name) -- file name
              || case -- file extension
                when type = 'PACKAGE' then '.pks'
                when type = 'PACKAGE BODY' then '.pkb'
                else '.sql'
              end
              || ' '
              || replace(text, chr(10), ' ') -- remove line breaks from error text
              || chr(27) || '[0m'
              as user_errors
            from user_errors
            where attribute in ('ERROR', 'WARNING')
            order by type, name, line, position)
 union
select chr(27) || '[32m' || to_char(sysdate, 'DD.MM.YYYY HH24:MI:SS')||' >> Alles OK' || chr(27) || '[0m'
  from dual
 where not exists (select 1
                     from user_errors
                    where attribute in ('ERROR', 'WARNING') ) ;

exit