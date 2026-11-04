import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ApiClient,
  BackendApiError,
  BackendClient,
  InMemoryRedisClient,
  NamespacedRedis,
  SimpleCLI,
  createApiClient,
  createBackendClient,
  stdlib,
  sys,
} from '../src/simplecli/index.ts';

describe('SimpleCLI Backend Client API, Mock Server & NamespacedRedis', () => {
  let server: any;
  let baseUrl = '';
  let flakyCounter = 0;

  const usersDb = new Map<number, { id: number; name: string; role: string; active?: boolean }>([
    [1, { id: 1, name: 'Ada Lovelace', role: 'admin', active: true }],
    [2, { id: 2, name: 'Grace Hopper', role: 'engineer', active: true }],
    [3, { id: 3, name: 'Alan Turing', role: 'researcher', active: false }],
  ]);
  let nextUserId = 4;

  beforeAll(() => {
    server = sys.serveJson(
      {
        '/health': { ok: true, service: 'test-backend' },
        'GET /echo-headers': (req: Request) => {
          const headers: Record<string, string> = {};
          req.headers.forEach((v, k) => {
            headers[k.toLowerCase()] = v;
          });
          const url = new URL(req.url);
          const query: Record<string, string> = {};
          url.searchParams.forEach((v, k) => {
            query[k] = v;
          });
          return { headers, query, method: req.method };
        },
        'GET /users': (req: Request) => {
          const url = new URL(req.url);
          const role = url.searchParams.get('role');
          const all = Array.from(usersDb.values());
          return role ? all.filter((u) => u.role === role) : all;
        },
        'GET /users/:id': (_req: Request, params: Record<string, string>) => {
          const id = Number(params.id);
          const user = usersDb.get(id);
          if (!user) {
            return new Response(JSON.stringify({ error: 'User not found' }), {
              status: 404,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return user;
        },
        'POST /users': async (req: Request) => {
          const body = (await req.json()) as Record<string, any>;
          const created = {
            id: nextUserId++,
            name: String(body.name || 'Unnamed'),
            role: String(body.role || 'member'),
            active: body.active ?? true,
          };
          usersDb.set(created.id, created);
          return new Response(JSON.stringify(created), {
            status: 201,
            headers: { 'Content-Type': 'application/json', 'X-Created-Id': String(created.id) },
          });
        },
        'PUT /users/:id': async (req: Request, params: Record<string, string>) => {
          const id = Number(params.id);
          const body = (await req.json()) as Record<string, any>;
          const updated = {
            id,
            name: String(body.name || 'Updated'),
            role: String(body.role || 'member'),
            active: body.active ?? true,
          };
          usersDb.set(id, updated);
          return updated;
        },
        'PATCH /users/:id': async (req: Request, params: Record<string, string>) => {
          const id = Number(params.id);
          const existing = usersDb.get(id) || { id, name: 'Unknown', role: 'member' };
          const body = (await req.json()) as Record<string, any>;
          const patched = { ...existing, ...body, id };
          usersDb.set(id, patched);
          return patched;
        },
        'DELETE /users/:id': (_req: Request, params: Record<string, string>) => {
          const id = Number(params.id);
          const deleted = usersDb.delete(id);
          return { deleted, id };
        },
        'POST /users/:id/promote': async (req: Request, params: Record<string, string>) => {
          const id = Number(params.id);
          const body = (await req.json()) as Record<string, any>;
          const existing = usersDb.get(id);
          if (existing) {
            existing.role = String(body.newRole || 'staff');
          }
          return { promoted: true, id, role: existing?.role || body.newRole };
        },
        'GET /flaky': () => {
          flakyCounter++;
          if (flakyCounter < 3) {
            return new Response(JSON.stringify({ error: 'Temporary overload', attempt: flakyCounter }), {
              status: 503,
              headers: { 'Content-Type': 'application/json', 'Retry-After': '0' },
            });
          }
          return { ok: true, attemptsNeeded: flakyCounter };
        },
        'POST /graphql': async (req: Request) => {
          const payload = (await req.json()) as {
            query: string;
            variables?: Record<string, any>;
            operationName?: string;
          };
          if (payload.query.includes('syntaxError')) {
            return { errors: [{ message: 'GraphQL validation error' }] };
          }
          return {
            data: {
              viewer: {
                login: payload.variables?.login || 'ada',
                operation: payload.operationName || null,
              },
            },
          };
        },
        'GET /paginated/page': (req: Request) => {
          const url = new URL(req.url);
          const page = Number(url.searchParams.get('page') || '1');
          const limit = Number(url.searchParams.get('limit') || '2');
          const all = [10, 20, 30, 40, 50];
          const start = (page - 1) * limit;
          return { items: all.slice(start, start + limit), page, total: all.length };
        },
        'GET /paginated/cursor': (req: Request) => {
          const url = new URL(req.url);
          const cursor = url.searchParams.get('cursor');
          if (!cursor) {
            return { items: ['a', 'b'], nextCursor: 'cur_2' };
          }
          if (cursor === 'cur_2') {
            return { items: ['c', 'd'], nextCursor: null };
          }
          return { items: [], nextCursor: null };
        },
        'GET /paginated/link': (req: Request) => {
          const url = new URL(req.url);
          const step = url.searchParams.get('step') || '1';
          if (step === '1') {
            return new Response(JSON.stringify([{ step: 1 }]), {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                Link: `<${baseUrl}/paginated/link?step=2>; rel="next"`,
              },
            });
          }
          return new Response(JSON.stringify([{ step: 2 }]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        },
        'GET /events': () => {
          const sseBody = [
            ': keepalive comment',
            'id: evt-1\nevent: deploy\ndata: {"step":"build","ok":true}',
            'id: evt-2\nevent: complete\ndata: {"step":"verify","ok":true}',
            '',
          ].join('\n\n');
          return new Response(sseBody, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          });
        },
        'GET /logs/ndjson': () => {
          const body = [
            JSON.stringify({ seq: 1, msg: 'boot' }),
            JSON.stringify({ seq: 2, msg: 'ready' }),
          ].join('\n');
          return new Response(body, {
            status: 200,
            headers: { 'Content-Type': 'application/x-ndjson' },
          });
        },
        'POST /form': async (req: Request) => {
          const text = await req.text();
          const params = Object.fromEntries(new URLSearchParams(text).entries());
          return { form: params, contentType: req.headers.get('content-type') };
        },
        'POST /upload': async (req: Request) => {
          const formData = await req.formData();
          const summary: Record<string, any> = {};
          for (const [key, val] of formData.entries()) {
            if (typeof val === 'string') {
              summary[key] = val;
            } else {
              summary[key] = {
                name: (val as File).name,
                size: (val as File).size,
                text: await (val as File).text(),
              };
            }
          }
          return { uploaded: summary };
        },
        'GET /download/sample.txt': () => {
          const content = 'SimpleCLI binary download payload\n'.repeat(10);
          return new Response(content, {
            status: 200,
            headers: {
              'Content-Type': 'text/plain',
              'Content-Length': String(Buffer.byteLength(content)),
            },
          });
        },
      },
      0
    );
    baseUrl = `http://127.0.0.1:${server.port}`;
  });

  afterAll(() => {
    if (server && typeof server.stop === 'function') {
      server.stop(true);
    }
  });

  test('sys.serveJson binds to loopback 127.0.0.1 by default and handles readiness probes', async () => {
    expect(server.hostname).toBe('127.0.0.1');
    const portReady = await sys.waitForPort('127.0.0.1', server.port, 2000, 50);
    expect(portReady).toBe(true);

    const httpReady = await sys.waitForHttp(`${baseUrl}/health`, 2000, 50, 200);
    expect(httpReady).toBe(true);
  });

  test('Fluent configuration, auth helpers, variable interpolation, and scoped client', async () => {
    const client = createApiClient(baseUrl)
      .withBearer('my-test-token')
      .setHeader('X-Env', '{{env}}')
      .setQueryParam('region', 'us-east-1')
      .setVars({ env: 'staging' });

    const res = await client.get<{
      headers: Record<string, string>;
      query: Record<string, string>;
    }>('/echo-headers', {
      query: { trace: '{{$uuid}}' },
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.data.headers['authorization']).toBe('Bearer my-test-token');
    expect(res.data.headers['x-env']).toBe('staging');
    expect(res.data.query.region).toBe('us-east-1');
    expect(res.data.query.trace?.length).toBeGreaterThan(20);

    // Basic Auth & API Key
    const scoped = client.scope('/users').withApiKey('my-api-key', 'X-API-Key');
    expect(scoped.baseUrl).toBe(`${baseUrl}/users`);
    const list = await scoped.getJson<any[]>('');
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(3);
  });

  test('Unwrapped JSON methods, fallbacks, and non-throwing try* methods', async () => {
    const app = SimpleCLI.new('TestCLI');
    const api = app.api(baseUrl);

    const ada = await api.getJson<{ id: number; name: string }>('/users/1');
    expect(ada.name).toBe('Ada Lovelace');

    // Fallback when 404
    const fallbackUser = await api.getJson('/users/99999', {
      fallback: { id: 0, name: 'Fallback User' },
    });
    expect(fallbackUser).toEqual({ id: 0, name: 'Fallback User' });

    // Throws BackendApiError when no fallback is provided on getJson
    let caught: any = null;
    try {
      await api.getJson('/users/99999');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(BackendApiError);
    expect(caught.statusCode).toBe(404);

    // Non-throwing tryGet on 404
    const safeMissing = await api.tryGet('/users/99999');
    expect(safeMissing.ok).toBe(false);
    expect(safeMissing.statusCode).toBe(404);
    expect(safeMissing.data).toBeNull();
    expect(safeMissing.error).toContain('404');

    // Non-throwing tryGet on 200
    const safeOk = await api.tryGet<{ id: number; name: string }>('/users/2');
    expect(safeOk.ok).toBe(true);
    expect(safeOk.statusCode).toBe(200);
    expect(safeOk.data?.name).toBe('Grace Hopper');
  });

  test('ResourceClient CRUD lifecycle (.list, .get, .create, .update, .patch, .action, .remove)', async () => {
    const api = createBackendClient(baseUrl);
    const users = api.resource<{ id: number; name: string; role: string }>('/users');

    const engineers = await users.list({ role: 'engineer' });
    expect(engineers.some((u) => u.name === 'Grace Hopper')).toBe(true);

    const created = await users.create({ name: 'Margaret Hamilton', role: 'director' });
    expect(created.id).toBeGreaterThanOrEqual(4);
    expect(created.name).toBe('Margaret Hamilton');

    const fetched = await users.get(created.id);
    expect(fetched.role).toBe('director');

    const updated = await users.update(created.id, { name: 'Margaret H.', role: 'vp' });
    expect(updated.name).toBe('Margaret H.');
    expect(updated.role).toBe('vp');

    const patched = await users.patch(created.id, { role: 'fellow' });
    expect(patched.role).toBe('fellow');

    const promoted = await users.action<{ promoted: boolean; role: string }>(created.id, 'promote', {
      newRole: 'principal-fellow',
    });
    expect(promoted.promoted).toBe(true);
    expect(promoted.role).toBe('principal-fellow');

    const removed = await users.remove(created.id);
    expect(removed).toBe(true);
  });

  test('Automatic retries on 503, GET response caching, and request/response interceptors', async () => {
    flakyCounter = 0;
    const interceptedUrls: string[] = [];
    const api = new ApiClient(baseUrl)
      .setRetries(3, 10)
      .enableCache(5000)
      .useRequestInterceptor((ctx) => {
        ctx.headers['X-Intercepted'] = 'yes';
        interceptedUrls.push(ctx.url);
        return ctx;
      })
      .useResponseInterceptor((res) => {
        res.headers['x-post-processed'] = 'true';
        return res;
      });

    const flakyRes = await api.get<{ ok: boolean; attemptsNeeded: number }>('/flaky');
    expect(flakyRes.ok).toBe(true);
    expect(flakyRes.attempts).toBe(3);
    expect(flakyRes.data.attemptsNeeded).toBe(3);
    expect(flakyRes.header('x-post-processed')).toBe('true');

    // Second GET to /flaky should be served from in-memory cache immediately
    const cachedRes = await api.get<{ ok: boolean; attemptsNeeded: number }>('/flaky');
    expect(cachedRes.cached).toBe(true);
    expect(cachedRes.data.attemptsNeeded).toBe(3);
    expect(interceptedUrls.length).toBeGreaterThanOrEqual(2);
  });

  test('GraphQL queries, auto-pagination (page, cursor, link), SSE and NDJSON streaming', async () => {
    const api = createApiClient(baseUrl);

    const gqlOk = await api.graphql<{ viewer: { login: string; operation: string | null } }>(
      'query GetViewer($login: String!) { viewer(login: $login) { login } }',
      { login: 'linus' },
      'GetViewer'
    );
    expect(gqlOk.ok).toBe(true);
    expect(gqlOk.data?.viewer.login).toBe('linus');
    expect(gqlOk.data?.viewer.operation).toBe('GetViewer');

    const gqlErr = await api.graphql('query { syntaxError }');
    expect(gqlErr.ok).toBe(false);
    expect(gqlErr.errors?.[0]?.message).toContain('validation error');

    // Page-based pagination
    const allNums = await api.fetchAllPages<number>('/paginated/page', {
      mode: 'page',
      pageSize: 2,
    });
    expect(allNums).toEqual([10, 20, 30, 40, 50]);

    // Cursor-based pagination
    const allChars = await api.fetchAllPages<string>('/paginated/cursor', {
      mode: 'cursor',
      pageSize: 2,
    });
    expect(allChars).toEqual(['a', 'b', 'c', 'd']);

    // Link header pagination
    const linkItems = await api.fetchAllPages<{ step: number }>('/paginated/link', {
      mode: 'link',
    });
    expect(linkItems).toEqual([{ step: 1 }, { step: 2 }]);

    // SSE Streaming
    const sseEvents: Array<{ id?: string; event: string; parsed: any }> = [];
    await api.streamSse('/events', (ev) => {
      sseEvents.push({ id: ev.id, event: ev.event, parsed: ev.json() });
    });
    expect(sseEvents.length).toBe(2);
    expect(sseEvents[0]?.event).toBe('deploy');
    expect(sseEvents[0]?.parsed).toEqual({ step: 'build', ok: true });
    expect(sseEvents[1]?.id).toBe('evt-2');

    // NDJSON Streaming
    const logItems: Array<{ seq: number; msg: string }> = [];
    await api.streamJsonLines<{ seq: number; msg: string }>('/logs/ndjson', (item) => {
      logItems.push(item);
    });
    expect(logItems).toEqual([
      { seq: 1, msg: 'boot' },
      { seq: 2, msg: 'ready' },
    ]);
  });

  test('Form encoding, multipart file upload, and streaming download with progress', async () => {
    const api = createApiClient(baseUrl);

    const formRes = await api.postForm<{ form: Record<string, string>; contentType: string }>('/form', {
      grant_type: 'client_credentials',
      client_id: 'rad-cli',
    });
    expect(formRes.ok).toBe(true);
    expect(formRes.data.form.grant_type).toBe('client_credentials');
    expect(formRes.data.contentType).toContain('application/x-www-form-urlencoded');

    const tmpUploadFile = sys.tempFile('upload_test_', '.txt');
    await sys.write(tmpUploadFile, 'hello multipart world');

    try {
      const uploadRes = await api.upload<{ uploaded: Record<string, any> }>(
        '/upload',
        {
          readme: tmpUploadFile,
          meta: {
            data: JSON.stringify({ env: 'prod' }),
            filename: 'meta.json',
            contentType: 'application/json',
          },
        },
        { tag: 'v2.0.0' }
      );
      expect(uploadRes.ok).toBe(true);
      expect(uploadRes.data.uploaded.tag).toBe('v2.0.0');
      expect(uploadRes.data.uploaded.readme.text).toBe('hello multipart world');
      expect(JSON.parse(uploadRes.data.uploaded.meta.text)).toEqual({ env: 'prod' });
    } finally {
      sys.deleteFile(tmpUploadFile);
    }

    const tmpDownloadFile = path.join(sys.osTmpdir(), `dl_${Date.now()}.txt`);
    let progressCalled = false;
    try {
      const savedPath = await api.download('/download/sample.txt', tmpDownloadFile, (dl, total) => {
        if (dl > 0 && total >= dl) progressCalled = true;
      });
      expect(savedPath).toBe(tmpDownloadFile);
      expect(progressCalled).toBe(true);
      expect(fs.readFileSync(tmpDownloadFile, 'utf8')).toContain('SimpleCLI binary download payload');
    } finally {
      sys.deleteFile(tmpDownloadFile);
    }
  });

  test('Health check, endpoint probes, batch requests, benchmarking, and cURL import/export', async () => {
    const api = createApiClient(baseUrl).withBearer('my-test-token');

    const hc = await api.healthCheck('/health');
    expect(hc.healthy).toBe(true);
    expect(hc.statusCode).toBe(200);

    const ready = await api.waitForReady('/health', 2000, 50);
    expect(ready).toBe(true);

    const probes = await api.probeEndpoints(['/health', '/users', '/non-existent-route']);
    expect(probes.length).toBe(3);
    expect(probes[0]?.ok).toBe(true);
    expect(probes[1]?.ok).toBe(true);
    expect(probes[2]?.ok).toBe(false);
    expect(probes[2]?.statusCode).toBe(404);

    const batchRes = await api.batch([
      { method: 'GET', path: '/users/1' },
      { method: 'GET', path: '/users/2' },
    ]);
    expect(batchRes.length).toBe(2);
    expect(batchRes[0]?.data.name).toBe('Ada Lovelace');
    expect(batchRes[1]?.data.name).toBe('Grace Hopper');

    const bench = await api.benchmark('/health', { requests: 10, concurrency: 3 });
    expect(bench.requests).toBe(10);
    expect(bench.successful).toBe(10);
    expect(bench.successRate).toBe(100);
    expect(bench.rps).toBeGreaterThan(0);

    const curlStr = api.toCurl('POST', '/users', {
      body: { name: 'Curl User', role: 'tester' },
    });
    expect(curlStr).toContain('curl -X POST');
    expect(curlStr).toContain('Authorization: Bearer my-test-token');

    const parsedCurl = BackendClient.fromCurl(curlStr);
    expect(parsedCurl.method).toBe('POST');
    expect(parsedCurl.url).toBe(`${baseUrl}/users`);
    const executed = await parsedCurl.execute<{ id: number; name: string }>();
    expect(executed.ok).toBe(true);
    expect(executed.data.name).toBe('Curl User');
  });

  test('Stdlib and SimpleCLI one-liner HTTP shorthands', async () => {
    const app = SimpleCLI.new('ShorthandCLI');

    const url = stdlib.buildUrl(baseUrl, '/users', { role: 'admin' });
    expect(url).toBe(`${baseUrl}/users?role=admin`);
    expect(stdlib.parseQuery('?role=admin&limit=5')).toEqual({ role: 'admin', limit: '5' });

    const admins = await app.httpGetJson<any[]>(`${baseUrl}/users`, { query: { role: 'admin' } });
    expect(admins.length).toBe(1);
    expect(admins[0].name).toBe('Ada Lovelace');

    const headHeaders = await stdlib.httpHead(`${baseUrl}/health`);
    expect(headHeaders['content-type']).toContain('application/json');
  });

  test('NamespacedRedis in-memory fallback, cache-aside getOrSet, hashes, lists, and pub/sub', async () => {
    // 1. Explicit in-memory mode
    const redis = new NamespacedRedis({ namespace: 'test_ns', inMemory: true });
    await redis.connect();
    expect(redis.isConnected()).toBe(true);
    expect(redis.isMemoryFallback()).toBe(true);

    await redis.set('greeting', 'hello', 60);
    expect(await redis.get('greeting')).toBe('hello');
    expect(await redis.exists('greeting')).toBe(1);
    expect(await redis.has('greeting')).toBe(true);
    expect(await redis.ttl('greeting')).toBeGreaterThan(0);

    // JSON & getOrSet cache-aside
    let computeCount = 0;
    const val1 = await redis.getOrSet(
      'expensive_metric',
      async () => {
        computeCount++;
        return { score: 99 };
      },
      60
    );
    const val2 = await redis.getOrSet(
      'expensive_metric',
      async () => {
        computeCount++;
        return { score: 0 };
      },
      60
    );
    expect(val1).toEqual({ score: 99 });
    expect(val2).toEqual({ score: 99 });
    expect(computeCount).toBe(1);

    // Counters, hashes, lists
    expect(await redis.incr('hits')).toBe(1);
    expect(await redis.incr('hits')).toBe(2);
    expect(await redis.decr('hits')).toBe(1);

    await redis.hset('profile', 'name', 'Ada');
    expect(await redis.hget('profile', 'name')).toBe('Ada');
    expect(await redis.hgetall('profile')).toEqual({ name: 'Ada' });

    await redis.rpush('queue', 'job1', 'job2');
    expect(await redis.lrange('queue', 0, -1)).toEqual(['job1', 'job2']);
    expect(await redis.lpop('queue')).toBe('job1');
    expect(await redis.rpop('queue')).toBe('job2');

    // Pub/Sub in-memory
    const received: string[] = [];
    const unsubscribe = redis.subscribe('events', (msg) => {
      received.push(msg);
    });
    await redis.publish('events', 'deploy_started');
    unsubscribe();
    await redis.publish('events', 'ignored');
    expect(received).toEqual(['deploy_started']);

    const cleared = await redis.clearNamespace();
    expect(cleared).toBeGreaterThan(0);
    await redis.close();

    // 2. Automatic fallback when TCP port is closed
    const autoFallbackRedis = new NamespacedRedis({
      namespace: 'fallback_ns',
      host: '127.0.0.1',
      port: 63999, // unused port
      fallbackToMemory: true,
    });
    await autoFallbackRedis.connect();
    expect(autoFallbackRedis.isMemoryFallback()).toBe(true);
    await autoFallbackRedis.setJson('probe', { ok: true });
    expect(await autoFallbackRedis.getJson('probe')).toEqual({ ok: true });
    await autoFallbackRedis.close();
    expect(new InMemoryRedisClient()).toBeInstanceOf(InMemoryRedisClient);
  });

  test('Security hardening: prototype pollution protection, cross-origin auth isolation, secret redaction, and maxDownloadBytes', async () => {
    const api = createApiClient(baseUrl)
      .withBearer('my-secret-token')
      .withApiKey('my-api-key', 'X-API-Key');

    // 1. Object.prototype routes on sys.serveJson must return 404, never invoke Object.prototype methods
    for (const protoRoute of ['/toString', '/valueOf', '/constructor', '/__proto__']) {
      const res = await api.get(protoRoute);
      expect(res.statusCode).toBe(404);
    }

    // 2. Malformed percent-encoding in URLs and query strings must not throw URIError
    const malformedQuery = stdlib.parseQuery('?valid=1&bad=%E0%A4%A&__proto__=polluted&constructor=bad');
    expect(malformedQuery.valid).toBe('1');
    expect(malformedQuery.bad).toBe('%E0%A4%A');
    expect(({} as any).polluted).toBeUndefined();

    // 3. Cross-origin requests do not leak default Authorization / X-API-Key headers
    const secondaryServer = sys.serveJson(
      {
        'GET /echo': (req: Request) => {
          const headers: Record<string, string> = {};
          req.headers.forEach((v, k) => {
            headers[k.toLowerCase()] = v;
          });
          return { headers };
        },
      },
      0
    );
    try {
      const crossOriginUrl = `http://127.0.0.1:${secondaryServer.port}/echo`;
      const crossRes = await api.get<{ headers: Record<string, string> }>(crossOriginUrl);
      expect(crossRes.ok).toBe(true);
      expect(crossRes.data.headers['authorization']).toBeUndefined();
      expect(crossRes.data.headers['x-api-key']).toBeUndefined();
    } finally {
      secondaryServer.stop(true);
    }

    // 4. cURL secret redaction
    const redactedCurl = api.toCurl('GET', '/users', { redactSecrets: true });
    expect(redactedCurl).toContain('Authorization: ***REDACTED***');
    expect(redactedCurl).toContain('X-API-Key: ***REDACTED***');
    expect(redactedCurl).not.toContain('my-secret-token');
    expect(redactedCurl).not.toContain('my-api-key');

    // 5. Download maxDownloadBytes enforcement & null-byte path rejection
    const tmpOversize = path.join(sys.osTmpdir(), `oversize_${Date.now()}.txt`);
    let downloadErr: any = null;
    try {
      await api.download('/download/sample.txt', tmpOversize, undefined, { maxDownloadBytes: 10 });
    } catch (err) {
      downloadErr = err;
    }
    expect(downloadErr).toBeInstanceOf(Error);
    expect(downloadErr.message).toContain('maxDownloadBytes');
    expect(fs.existsSync(tmpOversize)).toBe(false);

    let nullByteErr: any = null;
    try {
      await api.download('/download/sample.txt', '/tmp/bad\0file.txt');
    } catch (err) {
      nullByteErr = err;
    }
    expect(nullByteErr).toBeInstanceOf(Error);

    // 6. Memory-optimal O(min(m, n)) Levenshtein distance & non-blocking execParallel
    expect(stdlib.levenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(stdlib.levenshteinDistance('same', 'same')).toBe(0);
    const parallelRes = await sys.execParallel(['echo alpha', 'echo beta'], 2);
    expect(parallelRes).toEqual([
      ['alpha', 0],
      ['beta', 0],
    ]);
  });
});
