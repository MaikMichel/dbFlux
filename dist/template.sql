  /***********************************************
    -------     TEMPLATE START            -------
    l_bin         >>> file content as blob
    l_file_name   >>> filename
  ************************************************/


  Begin
    dbms_output.put_line(gc_green||'File: ' || l_file_name ||gc_reset);
    dbms_output.put_line(gc_green||'Blob: ' || dbms_lob.getlength(l_bin) ||gc_reset);
  End;

  /***********************************************
    -------     TEMPLATE END              -------
  ************************************************/
