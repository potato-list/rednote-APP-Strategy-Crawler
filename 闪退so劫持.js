// B站专用：轻量化dlopen Hook（移除高风险操作）
function hookDlopenLite() {
    try {
        // 1. 静默查找libdl.so（减少日志输出）
        var libdl = Process.findModuleByName("libdl.so");
        if (!libdl) {
            // 只尝试基础路径，不循环扫描（降低检测风险）
            libdl = Process.findModuleByPath("/apex/com.android.runtime/lib64/bionic/libdl.so") ||
                    Process.findModuleByPath("/system/lib64/libdl.so");
        }

        if (!libdl) return false;

        // 2. 直接从libdl查找函数（移除内存扫描）
        var dlopen = libdl.findExportByName("dlopen");
        var android_dlopen_ext = libdl.findExportByName("android_dlopen_ext");

        // 3. Hook dlopen（极简版，减少执行逻辑）
        if (dlopen) {
            Interceptor.attach(dlopen, {
                onEnter: function (args) {
                    try {
                        if (args[0] && !args[0].isNull()) {
                            const path = args[0].readCString();
                            if (path && path.includes(".so")) {
                            }
                        }
                    } catch (e) {}
                }
            });
        }

        // 4. Hook android_dlopen_ext
        if (android_dlopen_ext) {
            Interceptor.attach(android_dlopen_ext, {
                onEnter: function (args) {
                    try {
                        if (args[0] && !args[0].isNull()) {
                            const path = args[0].readCString();
                            if (path && path.includes(".so")) {
                                console.log(`[android_dlopen_ext] ${path}`);
                            }
                        }
                    } catch (e) {}
                }
            });
        }

        // 5. 极简模块监听（只打印关键so）
        Process.events.listen('module-added', function (module) {
            try {
                if (module.name && module.name.endsWith(".so") &&
                    !module.path.includes("/system/") && !module.path.includes("/vendor/")) {
                    console.log(`[B站加载SO] ${module.name} - ${module.path}`);
                }
            } catch (e) {}
        });

        return true;
    } catch (e) {
        return false;
    }
}


hookDlopenLite();



// git commit -m "add xiaohongshu frida hook js scripts 9.32.0"