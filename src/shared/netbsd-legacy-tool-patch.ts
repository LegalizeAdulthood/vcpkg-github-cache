/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

// Adapted from Microsoft vcpkg-tool PR #1789 for the two pre-NetBSD tags.
export const NETBSD_LEGACY_TOOL_PATCH = `
--- a/include/vcpkg/tools.test.h
+++ b/include/vcpkg/tools.test.h
@@ -47,5 +47,6 @@
         Linux,
-        FreeBsd,
-        OpenBsd,
-        Solaris,
+        FreeBsd,
+        OpenBsd,
+        NetBsd,
+        Solaris,
     };
--- a/src/vcpkg-test/tools.cpp
+++ b/src/vcpkg-test/tools.cpp
@@ -257,3 +257,3 @@
         "invalid_os.json: error: $.tools[0].os (a tool data operating system): Invalid tool operating system: notanos. "
-        "Expected one of: windows, osx, linux, freebsd, openbsd, solaris" == invalid_os.error());
+        "Expected one of: windows, osx, linux, freebsd, openbsd, netbsd, solaris" == invalid_os.error());
\x20
--- a/src/vcpkg/base/system.cpp
+++ b/src/vcpkg/base/system.cpp
@@ -779,5 +779,7 @@
         return "freebsd";
-#elif defined(__OpenBSD__)
-        return "openbsd";
-#elif defined(__SVR4) && defined(__sun)
+#elif defined(__OpenBSD__)
+        return "openbsd";
+#elif defined(__NetBSD__)
+        return "netbsd";
+#elif defined(__SVR4) && defined(__sun)
         return "solaris";
@@ -788,4 +790,4 @@
 #else
-        return "unknown"
-#endif
+        return "unknown";
+#endif
     }
--- a/src/vcpkg/base/system.mac.cpp
+++ b/src/vcpkg/base/system.mac.cpp
@@ -11,4 +11,4 @@
 #include <net/if.h>
-#if defined(__APPLE__) || defined(__FreeBSD__) || defined(__OpenBSD__)
-#include <ifaddrs.h>
+#if defined(__APPLE__) || defined(__FreeBSD__) || defined(__OpenBSD__) || defined(__NetBSD__)
+#include <ifaddrs.h>
\x20
@@ -160,3 +160,3 @@
         }
-#elif defined(__linux__) || defined(__APPLE__) || defined(__FreeBSD__) || defined(__OpenBSD__)
+#elif defined(__linux__) || defined(__APPLE__) || defined(__FreeBSD__) || defined(__OpenBSD__) || defined(__NetBSD__)
         // The getifaddrs(ifaddrs** ifap) function creates a linked list of structures
@@ -201,4 +201,4 @@
             auto mac_bytes = Span<char>(reinterpret_cast<char*>(address->sll_addr), MAC_BYTES_LENGTH);
-#elif defined(__APPLE__) || defined(__FreeBSD__) || defined(__OpenBSD__)
-            auto address = reinterpret_cast<sockaddr_dl*>(interface->ifa_addr);
+#elif defined(__APPLE__) || defined(__FreeBSD__) || defined(__OpenBSD__) || defined(__NetBSD__)
+            auto address = reinterpret_cast<sockaddr_dl*>(interface->ifa_addr);
             if (address->sdl_alen != MAC_BYTES_LENGTH) continue;
--- a/src/vcpkg/base/system.process.cpp
+++ b/src/vcpkg/base/system.process.cpp
@@ -22,4 +22,4 @@
\x20
-#if defined(__FreeBSD__) || defined(__OpenBSD__)
-extern char** environ;
+#if defined(__FreeBSD__) || defined(__OpenBSD__) || defined(__NetBSD__)
+extern char** environ;
 #include <sys/sysctl.h>
--- a/src/vcpkg/commands.build.cpp
+++ b/src/vcpkg/commands.build.cpp
@@ -995,5 +995,9 @@
         {
-            return m_paths.scripts / "toolchains/openbsd.cmake";
-        }
-        else if (cmake_system_name == "SunOS")
+            return m_paths.scripts / "toolchains/openbsd.cmake";
+        }
+        else if (cmake_system_name == "NetBSD")
+        {
+            return m_paths.scripts / "toolchains/netbsd.cmake";
+        }
+        else if (cmake_system_name == "SunOS")
         {
--- a/src/vcpkg/platform-expression.cpp
+++ b/src/vcpkg/platform-expression.cpp
@@ -28,4 +28,5 @@
         freebsd,
-        openbsd,
-        solaris,
+        openbsd,
+        netbsd,
+        solaris,
         osx,
@@ -63,4 +64,5 @@
             {"freebsd", Identifier::freebsd},
-            {"openbsd", Identifier::openbsd},
-            {"solaris", Identifier::solaris},
+            {"openbsd", Identifier::openbsd},
+            {"netbsd", Identifier::netbsd},
+            {"solaris", Identifier::solaris},
             {"osx", Identifier::osx},
@@ -569,3 +571,4 @@
                         case Identifier::freebsd: return true_if_exists_and_equal("VCPKG_CMAKE_SYSTEM_NAME", "FreeBSD");
-                        case Identifier::openbsd: return true_if_exists_and_equal("VCPKG_CMAKE_SYSTEM_NAME", "OpenBSD");
+                        case Identifier::openbsd: return true_if_exists_and_equal("VCPKG_CMAKE_SYSTEM_NAME", "OpenBSD");
+                        case Identifier::netbsd: return true_if_exists_and_equal("VCPKG_CMAKE_SYSTEM_NAME", "NetBSD");
                         case Identifier::solaris: return true_if_exists_and_equal("VCPKG_CMAKE_SYSTEM_NAME", "SunOS");
--- a/src/vcpkg/tools.cpp
+++ b/src/vcpkg/tools.cpp
@@ -39,4 +39,5 @@
         {"freebsd", ToolOs::FreeBsd},
-        {"openbsd", ToolOs::OpenBsd},
-        {"solaris", ToolOs::Solaris},
+        {"openbsd", ToolOs::OpenBsd},
+        {"netbsd", ToolOs::NetBsd},
+        {"solaris", ToolOs::Solaris},
     };
@@ -178,8 +179,10 @@
 #elif defined(__OpenBSD__)
-        auto data = get_raw_tool_data(tool_data_table, tool, hp, ToolOs::OpenBsd);
-#elif defined(__SVR4) && defined(__sun)
-        auto data = get_raw_tool_data(tool_data_table, tool, hp, ToolOs::Solaris);
-#else
-        return nullopt;
-#endif
+        auto data = get_raw_tool_data(tool_data_table, tool, hp, ToolOs::OpenBsd);
+#elif defined(__NetBSD__)
+        auto data = get_raw_tool_data(tool_data_table, tool, hp, ToolOs::NetBsd);
+#elif defined(__SVR4) && defined(__sun)
+        auto data = get_raw_tool_data(tool_data_table, tool, hp, ToolOs::Solaris);
+#else
+        ToolDataEntry* data = nullptr;
+#endif
         if (!data)
`.trim();

// Backport for 2025-06-02, before Solaris tool metadata was added.
export const NETBSD_2025_06_TOOL_PATCH = `
--- a/include/vcpkg/tools.test.h
+++ b/include/vcpkg/tools.test.h
@@ -49,2 +49,3 @@
-        OpenBsd,
-    };
+        OpenBsd,
+        NetBsd,
+    };
--- a/src/vcpkg-test/tools.cpp
+++ b/src/vcpkg-test/tools.cpp
@@ -258,1 +258,1 @@
-        "Expected one of: windows, osx, linux, freebsd, openbsd" == invalid_os.error());
+        "Expected one of: windows, osx, linux, freebsd, openbsd, netbsd" == invalid_os.error());
--- a/src/vcpkg/base/system.cpp
+++ b/src/vcpkg/base/system.cpp
@@ -770,2 +770,4 @@
-#elif defined(__OpenBSD__)
-        return "openbsd";
+#elif defined(__OpenBSD__)
+        return "openbsd";
+#elif defined(__NetBSD__)
+        return "netbsd";
@@ -777,2 +779,2 @@
-        return "unknown"
-#endif
+        return "unknown";
+#endif
--- a/src/vcpkg/base/system.mac.cpp
+++ b/src/vcpkg/base/system.mac.cpp
@@ -12,2 +12,2 @@
-#if defined(__APPLE__) || defined(__FreeBSD__) || defined(__OpenBSD__)
-#include <ifaddrs.h>
+#if defined(__APPLE__) || defined(__FreeBSD__) || defined(__OpenBSD__) || defined(__NetBSD__)
+#include <ifaddrs.h>
@@ -153,2 +153,2 @@
-#elif defined(__linux__) || defined(__APPLE__) || defined(__FreeBSD__) || defined(__OpenBSD__)
-        // The getifaddrs(ifaddrs** ifap) function creates a linked list of structures
+#elif defined(__linux__) || defined(__APPLE__) || defined(__FreeBSD__) || defined(__OpenBSD__) || defined(__NetBSD__)
+        // The getifaddrs(ifaddrs** ifap) function creates a linked list of structures
@@ -194,2 +194,2 @@
-#elif defined(__APPLE__) || defined(__FreeBSD__) || defined(__OpenBSD__)
-            auto address = reinterpret_cast<sockaddr_dl*>(interface->ifa_addr);
+#elif defined(__APPLE__) || defined(__FreeBSD__) || defined(__OpenBSD__) || defined(__NetBSD__)
+            auto address = reinterpret_cast<sockaddr_dl*>(interface->ifa_addr);
--- a/src/vcpkg/base/system.process.cpp
+++ b/src/vcpkg/base/system.process.cpp
@@ -23,2 +23,2 @@
-#if defined(__FreeBSD__) || defined(__OpenBSD__)
-extern char** environ;
+#if defined(__FreeBSD__) || defined(__OpenBSD__) || defined(__NetBSD__)
+extern char** environ;
--- a/src/vcpkg/commands.build.cpp
+++ b/src/vcpkg/commands.build.cpp
@@ -994,4 +994,8 @@
-        else if (cmake_system_name == "OpenBSD")
-        {
-            return m_paths.scripts / "toolchains/openbsd.cmake";
-        }
+        else if (cmake_system_name == "OpenBSD")
+        {
+            return m_paths.scripts / "toolchains/openbsd.cmake";
+        }
+        else if (cmake_system_name == "NetBSD")
+        {
+            return m_paths.scripts / "toolchains/netbsd.cmake";
+        }
--- a/src/vcpkg/platform-expression.cpp
+++ b/src/vcpkg/platform-expression.cpp
@@ -29,2 +29,3 @@
-        openbsd,
-        osx,
+        openbsd,
+        netbsd,
+        osx,
@@ -60,2 +61,3 @@
-            {"openbsd", Identifier::openbsd},
-            {"osx", Identifier::osx},
+            {"openbsd", Identifier::openbsd},
+            {"netbsd", Identifier::netbsd},
+            {"osx", Identifier::osx},
@@ -562,1 +564,2 @@
-                        case Identifier::openbsd: return true_if_exists_and_equal("VCPKG_CMAKE_SYSTEM_NAME", "OpenBSD");
+                        case Identifier::openbsd: return true_if_exists_and_equal("VCPKG_CMAKE_SYSTEM_NAME", "OpenBSD");
+                        case Identifier::netbsd: return true_if_exists_and_equal("VCPKG_CMAKE_SYSTEM_NAME", "NetBSD");
--- a/src/vcpkg/tools.cpp
+++ b/src/vcpkg/tools.cpp
@@ -40,2 +40,3 @@
-        {"openbsd", ToolOs::OpenBsd},
-    };
+        {"openbsd", ToolOs::OpenBsd},
+        {"netbsd", ToolOs::NetBsd},
+    };
@@ -177,5 +178,7 @@
-#elif defined(__OpenBSD__)
-        auto data = get_raw_tool_data(tool_data_table, tool, hp, ToolOs::OpenBsd);
-#else
-        return nullopt;
-#endif
+#elif defined(__OpenBSD__)
+        auto data = get_raw_tool_data(tool_data_table, tool, hp, ToolOs::OpenBsd);
+#elif defined(__NetBSD__)
+        auto data = get_raw_tool_data(tool_data_table, tool, hp, ToolOs::NetBsd);
+#else
+        ToolDataEntry* data = nullptr;
+#endif
`.trim();
