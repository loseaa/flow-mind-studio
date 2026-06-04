@echo off
setlocal
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
set "PGROOT=E:\postgres"
cd /d E:\pgvector
nmake /F Makefile.win install > "E:\FlowMindStudio\pgvector-install.log" 2>&1
exit /b %ERRORLEVEL%
