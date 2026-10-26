## 📖 项目介绍

rednote-APP-Strategy-Crawler
是针对小红书 APP 端接口逆向工程学习项目。
小红书 APP 接口请求携带核心加密校验参数：`x-s`（签名）、`x-t`（时间戳）、设备指纹、`a1`、cookie 等，平台依靠这套签名体系做反爬鉴权。

本项目提供一套 **JavaScript 版本签名生成工具** + 请求调用示例，方便你：

- 理解小红书 APP 端签名组装逻辑
- 脱离 Python，使用 NodeJS 快速生成接口签名
- 配合抓包拿到的 Cookie、设备信息构造合法请求
- 学习移动端 APP 逆向、消息摘要、Hmac、自定义加盐签名思路

> 
> 重点：JS 代码**只负责生成加密签名**，本身不带爬虫调度、IP 代理池、账号维护；签名只是请求其中一环，签名对了，Cookie 过期、设备指纹不对、风控依然会 403/412。

## ✨ 功能清单

- ✅ JS 实现小红书 `x-s` 签名算法（学习版）
- ✅ 自动生成 `x-t` 13 位时间戳
- ✅ 支持自定义设备信息、请求路径、请求 body
- ✅ 输出完整请求头，可直接给 axios /fetch/ Python requests 使用
- ✅ 单独拆分为签名工具函数，方便移植到其他语言（Python/Go）
- ✅ 附带 NodeJS 请求示例（搜索笔记、获取笔记详情）

## 🧰 环境依赖

- Node.js >= 16 （推荐 18/20 LTS）
- 内置 crypto 模块（Node 原生自带，**不需要额外 npm 安装**）
- 抓包工具：HttpCanary / Charles / Frida 抓小红书 APP HTTPS 流量
- 前置准备：你自己抓包拿到有效 `cookie`、`a1`、`device_id`、`device_fingerprint`


# 初始化（如果需要axios发请求）
npm install axios


## 📁 项目目录结构


rednote-APP-Strategy-Crawler/
├── README.md                # 本文档（你现在看的）
├── sign.js                  # 【核心】签名算法JS文件，生成 x-s / x-t
├── api.js                   # 小红书API请求封装，调用sign.js
├── config.js                # 配置文件：cookie、设备信息、基础参数
├── test.js                  # 测试入口，运行这个测试签名是否正常
└── package.json             # node项目配置
