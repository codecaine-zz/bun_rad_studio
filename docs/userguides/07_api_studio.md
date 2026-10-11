# 🌐 API Studio Pro -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Native fetch & Web Standards  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:api]  •  [Terminal CLI: bun run cli:api]
```

---

## 🌟 Executive Overview
**API Studio Pro** is an enterprise-grade REST and HTTP API testing client built natively into Bun RAD Studio. Designed as a lightweight, private, and instant alternative to heavy electronic tools like Postman and Insomnia, it operates with zero cloud telemetry, stores all requests locally on your machine, and executes requests at native Bun HTTP speeds.

Whether testing local development endpoints (`http://127.0.0.1:3000`), inspecting third-party OAuth microservices, analyzing response headers, or generating ready-to-paste `cURL` commands, API Studio Pro delivers a responsive, privacy-first developer experience.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
```bash
# Standard desktop launch
bun run app:api
```

### 2. Launch Terminal CLI HTTP Client Mode
```bash
# Fast GET request via CLI
bun run cli:api "https://api.github.com/users/octocat"

# POST request with JSON payload via CLI
bun run cli:api -X POST "https://httpbin.org/post" -d '{"hello":"world"}'
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![API Studio Desktop](../../screenshots/apps/api_studio_desktop.png) | ![API Studio Responsive](../../screenshots/apps/api_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Request Address & Method Bar
- **HTTP Method Selector**: Dropdown supporting `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, and `OPTIONS`.
- **URL Endpoint Bar**: Complete URL input supporting query strings, ports, and protocols.
- **⚡ Send Request Button (Cmd+Enter)**: Executes the HTTP request and starts high-precision latency measurement.
- **cURL Generator Button**: Converts the configured method, headers, and body into a reproducible `curl` command string.

### 2. Request Configuration Tabs
- **Headers Tab**: Key-value table for standard and custom headers (e.g. `Content-Type: application/json`, `User-Agent`).
- **Query Params Tab**: Interactive key-value editor that automatically encodes and syncs with the URL address bar.
- **Body Editor Tab**: Multi-line editor for `JSON`, `Form-Data`, `Text`, or `GraphQL` payloads with formatting validation.
- **Auth Preset Tab**: Supports `No Auth`, `Bearer Token`, `Basic Auth` (Base64 username/password), and `API Key`.

### 3. Response Telemetry & Inspector Panel
- **Status Code Pill**: Visual badge displaying HTTP status code and message (e.g. `200 OK`, `404 Not Found`, `500 Internal Error`) color-coded green, yellow, or red.
- **Latency & Size Metrics**: Displays exact round-trip time in milliseconds (e.g., `48ms`) and payload size in KB/MB.
- **Response Body Viewer**: Formatted, syntax-highlighted response viewer with collapsible JSON nodes and search.
- **Response Headers Table**: Displays all incoming HTTP headers (Cache-Control, Content-Type, CORS, etc.).

---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial: Testing an Authenticated POST Endpoint
1. Launch API Studio Pro: `bun run app:api`.
2. Change the method dropdown to **POST**.
3. Enter URL: `https://httpbin.org/post`.
4. Switch to the **Auth Preset Tab**, select **Bearer Token**, and enter `my-secret-jwt-token`.
5. Switch to the **Body Editor Tab** and enter:
   ```json
   {
     "action": "create_user",
     "email": "developer@example.com"
   }
   ```
6. Click **⚡ Send Request** (or press `Cmd+Enter`).
7. Review the response in the bottom panel; confirm status `200 OK` and inspect the mirrored payload.
8. Click **cURL Generator** to copy the equivalent terminal command.

---

## ⌨️ Complete Keyboard Shortcuts Reference

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| **Cmd + Enter** / **Ctrl + Enter** | URL / Body | Execute HTTP Request |
| **Cmd + L** / **Ctrl + L** | Global | Focus URL address bar |
| **Cmd + Shift + C** | Response Pane | Copy formatted response to clipboard |
| **F11** or **F** | Global | Toggle borderless fullscreen |

---

## 💡 Pro Tips & Enterprise Best Practices
- **Zero Cloud Leakage**: Unlike cloud-synced API clients, API Studio Pro never transmits your secret API keys, staging tokens, or customer payloads to external third-party servers. All request history remains 100% on your local machine.
