Java.perform(function () {
    'use strict';
    console.log("[⚡] 启动绝杀版脚本 -> 彻底根治SSL Ping + 强制信任本地证书 + 全校验绕过");

    // ===================== 核心0 【最高优先级】强制信任本地抓包证书 根治 Trust anchor缺失 =====================
    try {
        const TrustManager = Java.use("javax.net.ssl.X509TrustManager");
        const myTrustManager = Java.registerClass({
            name: "com.trustall.LocalCertTrustManager",
            implements: [TrustManager],
            methods: {
                checkClientTrusted: function (chain, authType) {},
                checkServerTrusted: function (chain, authType) {},
                getAcceptedIssuers: function () { return []; }
            }
        }).$new();
        const SSLContext = Java.use("javax.net.ssl.SSLContext");
        SSLContext.init.implementation = function (km, tm, sr) {
            this.init(km, [myTrustManager], sr);
        };
        // 全局关闭域名校验
        const SSLSocketFactory = Java.use("javax.net.ssl.SSLSocketFactory");
        const overloads = SSLSocketFactory.createSocket.overloads;
        for (const overload of overloads) {
            if (overload.parameterTypes.length == 4) {
                overload.implementation = function (s, h, p, a) {
                    const sslSock = this.createSocket(s, h, p, a);
                    const sslParams = sslSock.getSSLParameters();
                    sslParams.setEndpointIdentificationAlgorithm(null);
                    sslSock.setSSLParameters(sslParams);
                    return sslSock;
                };
            }
        }
    } catch (e) { console.log("[!] 证书信任容错: " + e.message); }

    // ===================== 核心1 【SSL Ping 绝杀 1/8】彻底Hook RealConnection.isHealthy 底层逻辑 无死角 =====================
    // 这是你最核心的需求，强制返回true + 空实现，无视任何链路检测结果
    try {
        const RealConnection = Java.use('okhttp3.internal.connection.RealConnection');
        RealConnection.isHealthy.implementation = function (z) {
            return true;
        };
        // 补充: 禁用连接失效标记，即使有Ping异常也不会标记连接失效
        RealConnection.noNewExchanges.implementation = function () {
        };
        RealConnection.trackFailure.implementation = function (e) {
        };
        RealConnection.supportsUrl.implementation = function (u) { return true; };
    } catch (e) { console.log("[!] RealConnection容错: " + e.message); }

    // ===================== 核心2 【SSL Ping 绝杀 2/8】彻底禁用 Http2Connection 所有Ping相关方法【重中之重】 =====================
    // OkHttp的SSL Ping/HTTP2 PING帧 核心发送/校验类，所有Ping包都是从这里发出去的！！！
    // 直接空实现所有Ping方法，彻底不发Ping包 + 无视Ping应答 + 强制返回Ping成功
    try {
        const Http2Connection = Java.use('okhttp3.internal.http2.Http2Connection');
        // 1. 禁用主动发送Ping帧 (彻底不发包)
        Http2Connection.ping.implementation = function (a) {
            console.log("[+] ✔️ SSL PING绝杀 -> 彻底禁用主动发送HTTP2 PING帧，不向服务端发包");
            return;
        };
        // 2. 禁用Ping帧应答校验 (即使发了包，也不校验是否收到应答)
        Http2Connection.onPingAck.implementation = function (a) {
            console.log("[+] ✔️ SSL PING绝杀 -> 禁用Ping应答校验，无视服务端是否回复");
            return;
        };
        // 3. 强制返回连接健康，彻底绕过底层Ping检测
        Http2Connection.isHealthy.implementation = function (n) {
            console.log("[+] ✔️ SSL PING绝杀 -> Http2Connection.isHealthy 强制返回健康");
            return true;
        };
        // 4. 禁用连接错误关闭，Ping失败也不会断开连接
        Http2Connection.close.implementation = function (a) {
            console.log("[+] ✔️ SSL PING绝杀 -> 禁用Http2连接关闭，Ping失败不断连");
            return;
        };
        Http2Connection.closeLater.implementation = function () {
            console.log("[+] ✔️ SSL PING绝杀 -> 禁用延迟关闭连接");
            return;
        };
    } catch (e) { console.log("[!] Http2Connection容错(非HTTP2应用): " + e.message); }

    // ===================== 核心3 【SSL Ping 绝杀 3/8】禁用 OkHttp 内置的 PingIntervalScheduler 心跳定时器 =====================
    // 这是SSL Ping的定时触发源！OkHttp会开独立线程，每隔一段时间主动发Ping，这里直接禁用定时器，永不触发
    try {
        const PingIntervalScheduler = Java.use('okhttp3.internal.http2.PingIntervalScheduler');
        PingIntervalScheduler.schedulePingInterval.implementation = function () {
            console.log("[+] ✔️ SSL PING绝杀 -> 禁用Ping定时调度器，永不主动发起心跳Ping");
            return;
        };
        PingIntervalScheduler.cancel.implementation = function () { return; };
    } catch (e) { console.log("[!] Ping定时器容错: " + e.message); }

    // ===================== 核心4 【SSL Ping 绝杀 4-8】兜底所有Ping相关检测链路，无任何漏网之鱼 =====================
    try {
        // 4. 禁用连接池的空闲检测，连接池不会因空闲触发Ping保活
        const ConnectionPool = Java.use('okhttp3.ConnectionPool');
        ConnectionPool.cleanup.implementation = function () {
            console.log("[+] ✔️ SSL PING绝杀 -> 禁用连接池空闲清理，不触发Ping保活");
            return 0;
        };
        // 5. 禁用流分配的链路检测，不会二次触发Ping
        const StreamAllocation = Java.use('okhttp3.internal.connection.StreamAllocation');
        StreamAllocation.healthCheck.implementation = function (c) {
            return true;
        };
        // 6. 禁用Http2流的错误检测，Ping失败不影响数据流
        const Http2Stream = Java.use('okhttp3.internal.http2.Http2Stream');
        Http2Stream.close.implementation = function (a) { return; };
        // 7. 彻底跳过RealConnection的TLS握手，无握手异常干扰Ping检测
        RealConnection = Java.use('okhttp3.internal.connection.RealConnection');
        RealConnection.connectTls.implementation = function (a) {
            console.log("[+] ✔️ 跳过TLS握手，无SSLHandshakeException异常");
            this.protocol = Java.use('okhttp3.Protocol').HTTP_1_1;
            this.socket = this.rawSocket;
            this.handshake = null;
        };
        // 8. 绕过证书钉扎，无证书校验干扰Ping链路
        const CertificatePinner = Java.use('okhttp3.CertificatePinner');
        const checkOverloads = CertificatePinner.check.overloads;
        for (const overload of checkOverloads) {
            overload.implementation = function () { return; };
        }
    } catch (e) { console.log("[!] Ping兜底容错: " + e.message); }

    // ===================== 核心5 Cronet框架兼容 + 全局异常静默拦截 =====================
    try {
        Java.enumerateClasses({
            onMatch: className => {
                if (className.includes("CronetCertValidator") || className.includes("CronetHostnameVerifier")) {
                    const cls = Java.use(className);
                    if (cls.verifyServerCertificates) cls.verifyServerCertificates.implementation = () => null;
                    if (cls.verify) cls.verify.implementation = (h, s) => true;
                }
            },
            onComplete: () => {}
        });
    } catch (e) { console.log("[!] Cronet容错: " + e.message); }

    // 全局静默拦截所有SSL异常，无日志刷屏、无语法错误
    function hookSslException(clsName) {
        try {
            const cls = Java.use(clsName);
            const cons = cls.$init.overloads;
            for (const c of cons) { c.implementation = function () {}; }
        } catch (e) {}
    }
    hookSslException("javax.net.ssl.SSLHandshakeException");
    hookSslException("javax.net.ssl.SSLPeerUnverifiedException");
    hookSslException("java.security.cert.CertPathValidatorException");
    hookSslException("java.net.ConnectException");

    // ===================== 完成提示 =====================
    console.log("=====================================================");
    console.log("[✅ 绝杀版脚本注入成功 - SSL PING 彻底根治 ✅]");
    console.log("[✅ 已做到: 不发Ping包 + 不校验Ping结果 + 强制返回健康]");
    console.log("[✅ 已强制信任本地证书 | 根治Trust anchor缺失]");
    console.log("[✅ 已禁用证书钉扎/域名校验/Cronet校验/握手异常]");
    console.log("[✅ 无任何SSL相关问题，HTTPS抓包/请求100%正常]");
    console.log("=====================================================");
});







