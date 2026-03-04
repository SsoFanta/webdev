cmake_minimum_required(VERSION 3.16)
project(JungleDystopiaParkour LANGUAGES C CXX)

set(CMAKE_C_STANDARD 99)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS OFF)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

include(FetchContent)

find_package(raylib CONFIG QUIET)
if (NOT raylib_FOUND)
    message(STATUS "raylib not found. Fetching raylib from GitHub...")
    FetchContent_Declare(
        raylib
        GIT_REPOSITORY https://github.com/raysan5/raylib.git
        GIT_TAG 5.5
    )
    FetchContent_MakeAvailable(raylib)
endif()

add_executable(JungleDystopiaParkour
    src/main.cpp
)

target_link_libraries(JungleDystopiaParkour PRIVATE raylib)

if (WIN32)
    target_link_libraries(JungleDystopiaParkour PRIVATE winmm)
endif()
