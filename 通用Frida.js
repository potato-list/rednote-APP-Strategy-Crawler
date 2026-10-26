/**
 * 安全版：只 hook sub_28820（最终生成），必须 Thumb 地址 + 轻量回调
 */
const SO_NAME = "libxyass.so";
const OFFSET = 0x28820;
const HOOK_DELAY_MS = 4000;

function waitForModuleSafe(soName, callback) {
    let module = Process.findModuleByName(soName);
    if (module) {
        callback(module);
        return;
    }
    console.log("[*] 等待 " + soName + " ...");
    const timer = setInterval(() => {
        module = Process.findModuleByName(soName);
        if (module) {
            clearInterval(timer);
            callback(module);
        }
    }, 200);
}

function thumbAddr(base, offset) {
    return base.add(offset).or(1);
}

function readStdString(ptr) {
    if (!ptr || ptr.isNull()) return null;
    try {
        const tag = ptr.readU8();
        if (tag & 1) {
            const len = ptr.add(4).readU32();
            if (len > 0x100000) return null;
            const p = ptr.add(8).readPointer();
            return p.isNull() ? "" : p.readUtf8String(len);
        }
        const len = tag >>> 1;
        return len ? ptr.add(1).readUtf8String(len) : "";
    } catch (e) {
        return null;
    }
}

function hookTarget(module) {
    const targetAddr = thumbAddr(module.base, OFFSET);
    console.log("[*] Hook @ " + targetAddr + " (0x" + OFFSET.toString(16) + "|1 Thumb)");

    Interceptor.attach(targetAddr, {
        onEnter(args) {
            this.out = args[0];
        },
        onLeave() {
            const s = readStdString(this.out);
            if (s) console.log("[out] len=" + s.length + " " + s.slice(0, 180));
        }
    });
    console.log("[+] Hook 已挂载");
}

function main() {
    waitForModuleSafe(SO_NAME, (mod) => {
        console.log("[+] base=" + mod.base);
        setTimeout(() => hookTarget(mod), HOOK_DELAY_MS);
    });
}

main();

// frida -U com.xingin.xhs -l 通用Frida.js
