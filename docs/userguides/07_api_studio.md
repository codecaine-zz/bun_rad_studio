# 🌐 API Studio Pro -- User Guide

**API Studio Pro** is a high-speed desktop REST client, API inspector, and micro-benchmark workbench. Built on Bun's native HTTP/HTTPS client (`fetch`), it delivers lightning-fast request execution, multi-mode authentication, automatic cURL generation, and response header inspection.

---

## ⚡ Quick Start

```bash
bun run app:api
```

---

## 🖥️ User Interface Overview

1. **Request Endpoint Bar**:
   - **HTTP Method**: Dropdown supporting `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, and `OPTIONS`.
   - **Request URL**: Full HTTP or HTTPS endpoint (defaults to `https://jsonplaceholder.typicode.com/posts/1`).
   - **⚡ Send Request**: Dispatches the request with sub-millisecond precision timing.
   - **📋 Copy cURL**: Generates and copies a complete, executable `curl` command including all active headers, auth, and payload body.
2. **Authentication & Security Mode**:
   - **Auth Type**: Select `None`, `Bearer Token`, `Basic Auth`, or `API Key Header`.
   - **Token / Key Input**: Secure input field for auth credentials.
3. **Headers & Body Tabs**:
   - **Custom Headers**: Key-value pairs (e.g. `Content-Type: application/json`, `X-Custom-Header: value`).
   - **Request Payload**: Multi-line JSON or text body editor for `POST`, `PUT`, and `PATCH` requests.
4. **Response Telemetry & Inspection**:
   - **Status Pill**: Shows HTTP status code (`200 OK`, `201 Created`, `404 Not Found`, etc.) with green/amber/red color coding.
   - **Latency Timer**: High-resolution response time in milliseconds (e.g. `42.5ms`).
   - **Response Size**: Total payload size in bytes/kilobytes.
   - **Headers View**: Full table of returned response headers (`Content-Type`, `Cache-Control`, `Date`, etc.).
   - **Formatted Response Body**: Syntax-highlighted JSON viewer.
5. **Micro-Benchmarking**:
   - **🚀 Benchmark (10x)**: Fires 10 concurrent requests to measure min, max, and median latency for API performance testing.

---

## 📖 Practical Tutorials

### 1. Sending an Authenticated JSON POST Request
1. Set **HTTP Method** to `POST`.
2. Enter your endpoint: `https://api.example.com/v1/orders`.
3. Set **Auth Type** to `Bearer Token` and enter your JWT in the token box.
4. In the **Request Payload** editor, enter:
   ```json
   {
     "customer_id": "cust_12345",
     "items": [
       { "sku": "WIDGET-01", "quantity": 2 }
     ]
   }
   ```
5. Click **⚡ Send Request**.
6. Review the returned status code, response time, and JSON response body.

### 2. Exporting Requests to cURL for CI/CD or Terminal
1. Configure your request with custom headers and body.
2. Click **📋 Copy cURL**.
3. Paste directly into your terminal or shell script. The cURL string will preserve all headers, HTTP method, and escaped payload.

### 3. Running a Concurrency Micro-Benchmark
1. Enter the target endpoint URL.
2. Click **🚀 Benchmark (10x)**.
3. The console will display individual request timings alongside average latency and standard deviation.

---

## 🛡️ Enterprise Resilience Features
- **Zero Heavy Electron Footprint**: Runs in native macOS WKWebView with zero bloat and near-zero memory footprint compared to legacy REST clients.
- **SSL / TLS Certificate Validation**: Fully respects system SSL trust stores.
- **Auto-Formatting & Syntax Validation**: Invalid request bodies are flagged before sending to prevent unnecessary network round trips.
