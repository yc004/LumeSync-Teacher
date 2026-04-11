set(LUMESYNC_TEACHER_ICON "${CMAKE_CURRENT_SOURCE_DIR}/../../shared/build/icon-teacher.ico")
cmake_path(NORMAL_PATH LUMESYNC_TEACHER_ICON)
file(TO_NATIVE_PATH "${LUMESYNC_TEACHER_ICON}" LUMESYNC_TEACHER_ICON)
string(REPLACE "\\" "\\\\" LUMESYNC_TEACHER_ICON_RC "${LUMESYNC_TEACHER_ICON}")

add_executable(LumeSyncTeacherShell WIN32
  src/main.cpp
  src/shell.rc
)

target_compile_definitions(LumeSyncTeacherShell PRIVATE
  LUMESYNC_TEACHER_ICON="${LUMESYNC_TEACHER_ICON_RC}"
)

target_link_libraries(LumeSyncTeacherShell
  PRIVATE
    lumesync_teacher_shared
    user32
    gdi32
    shell32
    ole32
    advapi32
    winhttp
    comdlg32
)

if(WEBVIEW2_INCLUDE_DIR)
  target_include_directories(LumeSyncTeacherShell PRIVATE "${WEBVIEW2_INCLUDE_DIR}")
endif()

if(WEBVIEW2_LOADER_DLL AND EXISTS "${WEBVIEW2_LOADER_DLL}")
  add_custom_command(TARGET LumeSyncTeacherShell POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
      "${WEBVIEW2_LOADER_DLL}"
      "$<TARGET_FILE_DIR:LumeSyncTeacherShell>/WebView2Loader.dll"
    VERBATIM
  )
endif()

if(MSVC)
  target_compile_options(LumeSyncTeacherShell PRIVATE /utf-8)
  set_target_properties(LumeSyncTeacherShell PROPERTIES
    VS_GLOBAL_IntDir "$(SolutionDir)$(ProjectName)\\$(Platform)\\$(Configuration)\\"
  )
endif()
