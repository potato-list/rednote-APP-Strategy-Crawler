const SO_NAME = "libxyass.so";
const MAIN_OFF = 0x46428;

// 这些是你日志里已经出现过的关键辅助函数
const HELPERS = [
    { off: 0x1d9d8, name: "sub_1d9d8" },
    { off: 0x1dd30, name: "sub_1dd30" },
    { off: 0x1ddfc, name: "sub_1ddfc" },
    { off: 0x1da5c, name: "sub_1da5c" },
    { off: 0x1da64, name: "sub_1da64" },
    { off: 0x1dDFC, name: "sub_1ddfc_dup" },
];

function waitModule(name, timeoutMs) {
    return new Promise((resolve, reject) => {
        const t0 = Date.now();
        const timer = setInterval(() => {
            const m = Process.findModuleByName(name);
            if (m) {
                clearInterval(timer);
                resolve(m);
                return;
            }
            if (Date.now() - t0 > timeoutMs) {
                clearInterval(timer);
                reject(new Error("timeout waiting " + name));
            }
        }, 200);
    });
}

function dumpMem(tag, p, len) {
    try {
        if (!p || p.isNull()) {
            console.log("[" + tag + "] null");
            return;
        }
        console.log("[" + tag + "] " + p);
        console.log(hexdump(p, { length: len || 64 }));
    } catch (e) {
        console.log("[" + tag + "] err: " + e);
    }
}

function readUtf8Safe(p, maxLen) {
    try {
        if (!p || p.isNull()) return null;
        return p.readUtf8String(maxLen || 256);
    } catch (e) {
        return null;
    }
}

function tryInstallWriteWatch(p, tag) {
    try {
        if (!p || p.isNull()) return;

        MemoryAccessMonitor.enable([{ base: p, size: 0x100 }], {
            onAccess(details) {
                if (details.operation !== "write") return;
                console.log("\n[WRITE] " + tag + " at " + details.address + " from " + details.from);
                try {
                    console.log(hexdump(p, { length: 128 }));
                } catch (e) {}
            }
        });
        console.log("[*] write watch enabled for " + tag + " @ " + p);
    } catch (e) {
        console.log("[!] write watch failed for " + tag + ": " + e);
    }
}

function hookOne(base, off, name) {
    const addr = base.add(off);
    try {
        Interceptor.attach(addr, {
            onEnter(args) {
                this.x0 = this.context.x0;
                this.x1 = this.context.x1;
                this.x2 = this.context.x2;
                this.x3 = this.context.x3;
        
                console.log("\n[*] sub_1da5c called");
                console.log("x0 =", this.x0);
                console.log("x1 =", this.x1);
                console.log("x2 =", this.x2);
                console.log("x3 =", this.x3);
        
                try {
                    const s = this.x3.readUtf8String(256);
                    console.log("[x3 str] " + s);
                } catch (e) {}
        
                console.log("[backtrace]");
                console.log(
                    Thread.backtrace(this.context, Backtracer.ACCURATE)
                        .map(DebugSymbol.fromAddress)
                        .join("\n")
                );
            }
        });
        console.log("[*] hooked " + name + " @ " + addr);
    } catch (e) {
        console.log("[!] hook " + name + " failed: " + e);
    }
}

function hookMain(base) {
    const addr = base.add(MAIN_OFF);
    console.log("[*] hook main @ " + addr + " (off 0x" + MAIN_OFF.toString(16) + ")");

    Interceptor.attach(addr, {
        onEnter(args) {
            this.x0 = this.context.x0;
            this.x1 = this.context.x1;
            this.x2 = this.context.x2;
            this.x3 = this.context.x3;
            this.x4 = this.context.x4;
            this.x5 = this.context.x5;
            this.x6 = this.context.x6;
            this.x7 = this.context.x7;
            this.x8 = this.context.x8;

            console.log("\n==============================");
            console.log("[*] sub_45764 / 0x46428 called");
            console.log("x0 =", this.x0);
            console.log("x1 =", this.x1);
            console.log("x2 =", this.x2);
            console.log("x3 =", this.x3);
            console.log("x4 =", this.x4);
            console.log("x5 =", this.x5);
            console.log("x6 =", this.x6);
            console.log("x7 =", this.x7);
            console.log("x8 =", this.x8);

            dumpMem("x1", this.x1, 128);
            dumpMem("x4", this.x4, 128);
            dumpMem("x5", this.x5, 128);

            // 这一步很关键：观察输出对象变化
            tryInstallWriteWatch(this.x8, "output_x8");

            try {
                const n = this.x6.toInt32();
                if (n > 0 && n < 0x4000 && this.x5 && !this.x5.isNull()) {
                    dumpMem("x5_buf", this.x5, n);
                }
            } catch (e) {}

            const s1 = readUtf8Safe(this.x1, 256);
            const s4 = readUtf8Safe(this.x4, 256);
            const s5 = readUtf8Safe(this.x5, 256);

            if (s1 !== null) console.log("[x1 str] " + s1);
            if (s4 !== null) console.log("[x4 str] " + s4);
            if (s5 !== null) console.log("[x5 str] " + s5);

            dumpMem("x8_before", this.x8, 128);
        },

        onLeave(retval) {
            console.log("[*] retval =", retval);
            dumpMem("x0_after", this.x0, 128);
            dumpMem("x8_after", this.x8, 256);

            const rs = readUtf8Safe(retval, 256);
            if (rs !== null) {
                console.log("[retval str] " + rs);
            }
            console.log("==============================\n");
        }
    });
}

async function main() {
    const mod = await waitModule(SO_NAME, 30000);
    console.log("[+] " + SO_NAME + " base=" + mod.base);

    // 先 hook 你日志里已经命中的辅助函数，方便看到中间值
    for (const h of HELPERS) {
        hookOne(mod.base, h.off, h.name);
    }

    // 再 hook 主函数
    hookMain(mod.base);

    console.log("[*] hooks ready");
}

setImmediate(main);


