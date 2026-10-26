setImmediate(function() {
    console.log("[*] 开始监控 JNI 核心接口 (NewStringUTF & RegisterNatives)...");

    const env = Java.vm.getEnv();
    const handle = env.handle.readPointer();
    
    // 1. 计算 JNIEnv 虚函数表中的目标函数地址 (ARM64 / ARM32 物理偏移)
    // NewStringUTF 索引是 167
    const newStringUTF_addr = handle.add(167 * Process.pointerSize).readPointer();
    // RegisterNatives 索引是 215
    const registerNatives_addr = handle.add(215 * Process.pointerSize).readPointer();

    const TARGET_SO = "libxyass.so";
    const HOOK_ALL_REGISTER_NATIVES = true;

    // ==========================================
    // 🛠️ 监控一：RegisterNatives (动态注册适配)
    // ==========================================
    Interceptor.attach(registerNatives_addr, {
        onEnter: function(args) {
            try {
                // args[0] 是 JNIEnv*
                // args[1] 是 jclass (Java 类对象)
                // args[2] 是 JNINativeMethod 结构体数组指针
                // args[3] 是 注册的方法数量 (jint)
                
                const callerAddr = this.returnAddress;
                const module = Process.findModuleByAddress(callerAddr);
                
                const env_ptr = args[0];
                const clazz = args[1];
                const methods_ptr = args[2];
                const method_count = args[3].toInt32();

                let className = "UnknownClass";
                try {
                    className = Java.cast(clazz, Java.use("java.lang.Class")).getName();
                } catch(e) {
                    // 如果在非 Java 线程或过早 Hook，尝试降级使用底层描述
                    className = `jclass@${clazz}`;
                }

                if (!HOOK_ALL_REGISTER_NATIVES) {
                    if (!module || module.name !== TARGET_SO) {
                        return;
                    }
                }

                const callerModuleName = module ? module.name : "UnknownModule";
                const callerModuleBase = module ? module.base : ptr(0);
                const callerRel = module ? callerAddr.sub(module.base) : ptr(0);

                console.log(`\n[====== 🚀 RegisterNatives 动态注册触发 ======]`);
                console.log(`[*] 调用方模块: ${callerModuleName} (caller=${callerAddr}, base=${callerModuleBase}, rel=${callerRel})`);
                console.log(`[*] Java 类名: ${className}`);
                console.log(`[*] 注册数量: ${method_count}`);

                // 遍历 JNINativeMethod 结构体数组
                // JNINativeMethod 结构: { const char* name; const char* signature; void* fnPtr; }
                if (method_count <= 0 || method_count > 4096) {
                    console.log(`[-] 异常的注册数量，跳过: ${method_count}`);
                    return;
                }
                if (!methods_ptr || methods_ptr.isNull()) {
                    console.log("[-] methods_ptr 为空，跳过");
                    return;
                }

                const safeReadCString = (p) => {
                    try {
                        if (!p || p.isNull()) return null;
                        return p.readCString();
                    } catch (_) {
                        return null;
                    }
                };

                for (let i = 0; i < method_count; i++) {
                    const offset = i * (Process.pointerSize * 3);
                    const name_ptr = methods_ptr.add(offset).readPointer();
                    const sig_ptr = methods_ptr.add(offset + Process.pointerSize).readPointer();
                    const fn_ptr = methods_ptr.add(offset + (Process.pointerSize * 2)).readPointer();

                    const methodName = safeReadCString(name_ptr) || `<bad_name_ptr@${name_ptr}>`;
                    const signature = safeReadCString(sig_ptr) || `<bad_sig_ptr@${sig_ptr}>`;
                    
                    // 计算 Native 函数在 SO 中的绝对/相对偏移
                    const fnModule = Process.findModuleByAddress(fn_ptr);
                    let fnOffsetStr = "";
                    if (fnModule) {
                        fnOffsetStr = `(module=${fnModule.name}, base=${fnModule.base}, rel=${fn_ptr.sub(fnModule.base)})`;
                    }

                    console.log(`  ➔ [#${i}] 方法名: ${methodName}`);
                    console.log(`       签名: ${signature}`);
                    console.log(`       函数指针: ${fn_ptr} ${fnOffsetStr}`);
                }
                console.log(`--------------------------------------------------`);

            } catch (err) {
                console.log("[-] RegisterNatives 解析异常: " + err);
            }
        }
    });

    // ==========================================
    // 🛠️ 监控二：NewStringUTF (原有密文/字符串监控)
    // ==========================================
    Interceptor.attach(newStringUTF_addr, {
        onEnter: function(args) {
            try {
                const callerAddr = this.returnAddress;
                const module = Process.findModuleByAddress(callerAddr);
                
                if (!module || module.name !== TARGET_SO) {
                    return; 
                }

                if (args[1] && !args[1].isNull()) {
                    const cstr = args[1].readCString();
                    
                    if (cstr) {
                        // 过滤条件
                        const isLengthMatch = cstr.length >= 52; 
                        const isContentMatch = cstr.startsWith("x-gorgon") || 
                                               cstr.indexOf("565b") !== -1 || 
                                               cstr.startsWith("sign");

                        if (isContentMatch || isLengthMatch) {
                            const relativeOffset = callerAddr.sub(module.base);

                            console.log(`\n[🔥 JNI 出口截获最终密文] 来自模块: ${module.name} (相对偏移: ${relativeOffset})`);
                            console.log(`内容: ${cstr} (当前长度: ${cstr.length})`);
                            
                            console.log(`[*] 触发上下文中的前 20 个参数/寄存器快照:`);
                            for (let i = 0; i < 20; i++) {
                                try {
                                    console.log(`    args[${i}]: ${args[i]}`);
                                } catch (err) {
                                    break; 
                                }
                            }

                            console.log('\n[*] 真实来源调用栈:');
                            try {
                                const backtraceStr = Thread.backtrace(this.context, Backtracer.FUZZY)
                                    .map(DebugSymbol.fromAddress)
                                    .join('\n');
                                console.log(backtraceStr);
                            } catch (stackErr) {
                                console.log("[-] 警告：堆栈回溯失败，已跳过以防止崩溃。");
                            }
                            console.log(`--------------------------------------------------`);
                        }
                    }
                }
            } catch(e) {
                // 忽略读取异常
            }
        }
    });
});



// frida -Uf com.ss.android.ugc.aweme -l 通用劫持Jlog.js
// frida -Uf com.xingin.xhs -l 通用劫持Jlog.js
// frida -Un 小红书 -l 字节跳动通用代码.js

