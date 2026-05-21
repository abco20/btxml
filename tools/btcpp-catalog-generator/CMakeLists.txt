cmake_minimum_required(VERSION 3.16)
project(btcpp_catalog_generator CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(BTCPP_EXAMPLES OFF CACHE BOOL "" FORCE)
set(BUILD_TESTING OFF CACHE BOOL "" FORCE)
set(BTCPP_GROOT_INTERFACE OFF CACHE BOOL "" FORCE)
set(BTCPP_SQLITE_LOGGING OFF CACHE BOOL "" FORCE)

if(NOT DEFINED BTCPP_SOURCE_DIR)
  message(FATAL_ERROR "BTCPP_SOURCE_DIR is required and must point to a BehaviorTree.CPP source directory")
endif()

add_subdirectory(${BTCPP_SOURCE_DIR} ${CMAKE_BINARY_DIR}/btcpp)

add_executable(generate_default_models generate_default_models.cpp)

# BehaviorTree.CPP currently exports target `behaviortree_cpp` in v4.
# If upstream changes target names in future versions, adapt this section.
target_link_libraries(generate_default_models PRIVATE behaviortree_cpp)
