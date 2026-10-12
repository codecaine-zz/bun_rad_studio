# 🌐 API Studio Pro -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: curl  •  Dependencies: 0  •  Local endpoints work offline
Launchers: [Desktop GUI: bun run app:api]  •  [Terminal CLI: bun run cli:api]
```

---

## 🌟 Executive Overview
**API Studio Pro** is a desktop HTTP/REST client built into Bun RAD Studio. Requests are sent with the system `curl` binary, so what you test is exactly what `curl` would do. There is no account and no cloud sync. Your requests go only to the endpoints you type, and nothing is sent to any other server.

It covers the everyday jobs: sending requests with auth, reusing values through variables, importing a `curl` command copied from your browser, inspecting response headers, filtering JSON and load-testing an endpoint.

> Remote endpoints need an internet connection. Local endpoints (`http://127.0.0.1:3000`) work offline.

---

## 🚀 Quick Start & Launch

```bash
# Desktop GUI
bun run app:api

# Interactive terminal client
bun run cli:api
```

1. Pick a **Quick Endpoint** preset, or type a URL (`localhost:3000/health` and `example.com` get a scheme automatically).
2. Click **🚀 Send Request**.
3. Read the body, the **Response headers** table and the status line (code, latency, size).

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop | Responsive Viewport |
| :---: | :---: |
| ![API Studio Desktop](../../screenshots/apps/api_studio_desktop.png) | ![API Studio Responsive](../../screenshots/apps/api_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Presets, Auth & cURL
- **Quick Endpoints**: ready-made examples (JSONPlaceholder, GitHub, HTTPBin). Choosing one fills the form **and sends it immediately**.
- **Auth Mode + credential**: `Bearer Token`, `Basic Auth` (enter `user:pass`) or `API Key Header` (sent as `X-API-Key`).
- **📋 Copy cURL**: copies a reproducible `curl` command that includes your auth, query parameters, redirect/TLS/timeout options, and also logs it in the console.

### 2. Request
- **Method**, **Target URL** and **Headers** (one `Key: Value` per line).
- **Query parameters**: one `key=value` per line. They are appended to the URL and percent-encoded for you.
- **Request Body**: sent for `POST`, `PUT`, `PATCH` and `DELETE`. If you did not set a `Content-Type`, API Studio adds `application/json` for JSON bodies and `text/plain` otherwise. **✨ Format JSON Body** pretty-prints and validates it.
- **🚀 Send Request** and **⚡ Benchmark**.

### 3. Variables, Options & Import
- **Variables**: define `NAME=value` lines, then use `{{NAME}}` in the URL, headers, query, body or credential. Built-ins: `{{$uuid}}`, `{{$timestamp}}`, `{{$isoTimestamp}}`, `{{$randomInt}}`. If a variable is undefined the request is **blocked** with a message instead of being sent with a literal `{{NAME}}`.
- **Follow redirects**, **Ignore TLS certificate errors** (for self-signed dev servers only), **Pretty-print JSON** and **Timeout (s)**.
- **Benchmark requests / Concurrency**: how many requests to send (1-200) and how many at once (1-20).
- **⬇ Import cURL**: paste a command (for example Chrome DevTools → right-click request → *Copy as cURL*) and the method, URL, headers, body, basic-auth and options fill the form.

### 4. Response
- **Body viewer**: JSON is pretty-printed. Bodies larger than 1 MB are truncated on screen only. **Export** always saves the full response.
- **📋 Copy Response**, **💾 Export Response JSON** (asks where to save) and **Clear Response**.
- **Filter**: type a path such as `.items[0].name` and click **Apply Filter** to view just that part. Clear the filter and apply it again to see the full response.
- **Response headers** table and the console, which logs every dispatch and response.

### 5. Request History
- The last 30 requests are listed with method, URL, status and time. **Click a row** to restore its method, URL, headers and body. History is kept for the current session only. **Clear History** empties it.

### 6. Saving Your Work
- **💾 Save Request** remembers the current form for the next launch.
- **📄 Save Request File… / 📂 Open Request File…** store a request (including query and variables) as a `.apireq.json` file you can share. **Credentials are never written to these files.**

---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial: Testing an Authenticated POST with Variables
1. Run `bun run app:api`.
2. In **Variables** enter `host=https://httpbin.org` and `token=my-secret-jwt-token`.
3. Set the method to **POST** and the URL to `{{host}}/post`.
4. Set **Auth Mode** to **Bearer Token** and the credential to `{{token}}`.
5. Enter a JSON body and click **✨ Format JSON Body**.
6. Click **🚀 Send Request**. Confirm `200 OK`, check the mirrored body, then read the `Authorization` header you sent in the response.
7. Click **📋 Copy cURL** to get the equivalent terminal command.

### Tutorial: Reproduce a Browser Request
1. In your browser, open DevTools → Network, right-click a request and choose **Copy as cURL**.
2. Paste into **Import cURL** and click **⬇ Import cURL**.
3. Click **🚀 Send Request**, then use **Filter** to pull out the field you care about.

### Tutorial: Quick Load Test
1. Set a **GET** URL and choose **Benchmark requests** (for example 50) and **Concurrency** (for example 5).
2. Click **⚡ Benchmark**. The console reports success count, min/avg/p50/p95/p99/max latency and requests per second.
3. For **POST**, **PUT**, **PATCH** and **DELETE** you are asked to confirm first, because they can change data on the server.

---

## 🔒 Safety Notes
- Only `http://` and `https://` URLs are accepted. `file://` and other schemes are refused, including through redirects.
- The credential field and variables are saved with the form when you use **💾 Save Request** or when the app remembers its state. Do not keep production secrets there on a shared computer.
- **Ignore TLS certificate errors** disables certificate checking for that request. Use it only for servers you trust.

---

## 💡 Pro Tips
- Use `{{$uuid}}` in a header such as `X-Request-Id` to get a unique value on every send.
- Switch off **Follow redirects** to see the `302` and its `Location` header.
- Lower the **Timeout** when testing flaky services so a hung request fails fast.
