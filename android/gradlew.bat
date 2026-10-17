@rem Gradle wrapper bootstrap for Windows
@if "%DEBUG%"=="" @echo off
if "%OS%"=="Windows_NT" setlocal
set DIRNAME=%~dp0
if "%DIRNAME:~-1%"=="\" set DIRNAME=%DIRNAME:~0,-1%
set APP_HOME=%DIRNAME%
set WRAPPER_JAR=%APP_HOME%\gradle\wrapper\gradle-wrapper.jar
set WRAPPER_PROPS=%APP_HOME%\gradle\wrapper\gradle-wrapper.properties
set GRADLE_VERSION=8.7

if not exist "%WRAPPER_JAR%" (
    echo gradle-wrapper.jar missing, downloading from gradle/gradle GitHub...
    if not exist "%APP_HOME%\gradle\wrapper" mkdir "%APP_HOME%\gradle\wrapper"
    powershell -Command "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/gradle/gradle/v%GRADLE_VERSION%/gradle/wrapper/gradle-wrapper.jar' -OutFile '%WRAPPER_JAR%'"
)

if not exist "%WRAPPER_PROPS%" (
    echo distributionBase=GRADLE_USER_HOME> "%WRAPPER_PROPS%"
    echo distributionPath=wrapper/dists>> "%WRAPPER_PROPS%"
    echo distributionUrl=https\://services.gradle.org/distributions/gradle-%GRADLE_VERSION%-bin.zip>> "%WRAPPER_PROPS%"
    echo networkTimeout=10000>> "%WRAPPER_PROPS%"
    echo zipStoreBase=GRADLE_USER_HOME>> "%WRAPPER_PROPS%"
    echo zipStorePath=wrapper/dists>> "%WRAPPER_PROPS%"
)

java -classpath "%WRAPPER_JAR%" org.gradle.wrapper.GradleWrapperMain %*
if "%OS%"=="Windows_NT" endlocal
