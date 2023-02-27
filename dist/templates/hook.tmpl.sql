set define '^'
set concat on
set concat .
set verify off
set serveroutput on
set linesize 2000
set wrap off
set trimspool on
SET TERMOUT OFF
COLUMN 1 NEW_VALUE 1
COLUMN 2 NEW_VALUE 2
COLUMN 3 NEW_VALUE 3

SELECT '' "1" FROM dual WHERE ROWNUM = 0;
SELECT '' "2" FROM dual WHERE ROWNUM = 0;
SELECT '' "3" FROM dual WHERE ROWNUM = 0;

-- Mapping positional parameters to named variables
DEFINE _parameter_01 = ^1 "0.0.0"
DEFINE _parameter_02 = ^2 "undefined"
DEFINE _parameter_03 = ^3 "ALL_TABLES"

define VERSION    = ^_parameter_01
define MODE       = ^_parameter_02
define ALL_TABLES = ^_parameter_03

SET TERMOUT ON
PROMPT ********************************************************************
PROMPT * VERSION    <^VERSION>
PROMPT * MODE       <^MODE>
PROMPT * ALL_TABLES <^ALL_TABLES>
PROMPT ********************************************************************
