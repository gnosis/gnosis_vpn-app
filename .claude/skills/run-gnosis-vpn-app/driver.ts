#!/usr/bin/env -S deno run --allow-all
// Headless-browser driver for the Gnosis VPN UI — runs the frontend without
// the Rust backend by injecting shim.js + a fixture into a generated
// index.browser.html served by the Vite dev server.
//
// Usage (from repo root):
//   deno run -A .claude/skills/run-gnosis-vpn-app/driver.ts [flags] <steps...>
//
// Flags:
//   --fixture <path>   fixture JSON (default: fixture.json next to this file)
//   --size <WxH>       viewport, default 360x640 (settings window: 640x480)
//
// Steps (executed in order, after navigation and app mount):
//   shot <file.png>    capture screenshot
//   click <css>        click first element matching CSS selector
//   text <css>         print innerText of first match
//   eval <js>          evaluate JS expression, print JSON result
//   wait <ms>          sleep
//
// Linux/macOS only by design: relies on a `chromium` binary and `pkill` on
// PATH and treats URL.pathname as a filesystem path. --allow-all is also
// deliberate — a repo-local dev tool that spawns processes, evals arbitrary
// JS, and writes screenshots to arbitrary paths gains nothing from a narrower
// Deno permission list.

const skillDir = new URL(".", import.meta.url);
const repoRoot = new URL("../../../", skillDir);
const DEV_URL = "http://localhost:1420";

function repoPath(rel: string): string {
  return new URL(rel, repoRoot).pathname;
}

// --- arg parsing ------------------------------------------------------------
// Flag/step values are taken as-is (shift()!) — a missing value fails fast on
// first use, which is enough for an agent-driven tool with a documented CLI.
const args = [...Deno.args];
let fixturePath = new URL("fixture.json", skillDir).pathname;
let width = 360, height = 640;
const steps: string[][] = [];
while (args.length) {
  const a = args.shift()!;
  if (a === "--fixture") fixturePath = args.shift()!;
  else if (a === "--size") {
    const [w, h] = args.shift()!.split("x").map(Number);
    width = w;
    height = h;
  } else if (["shot", "click", "text", "eval", "wait"].includes(a)) {
    steps.push([a, args.shift()!]);
  } else {
    console.error(`unknown arg: ${a}`);
    Deno.exit(1);
  }
}
if (steps.length === 0) steps.push(["shot", "app.png"]);

// --- generate index.browser.html ---------------------------------------------
const indexHtml = await Deno.readTextFile(repoPath("index.html"));
const shimSource = await Deno.readTextFile(
  new URL("shim.js", skillDir).pathname,
);
const fixtureJson = await Deno.readTextFile(fixturePath);
JSON.parse(fixtureJson); // fail fast on malformed fixture
const entryTag = '<script src="/src/index.tsx" type="module"></script>';
if (!indexHtml.includes(entryTag)) {
  throw new Error("index.html entry <script> tag not found — update driver.ts");
}
const injected = indexHtml.replace(
  entryTag,
  `<script>globalThis.__GVPN_FIXTURE__ = ${fixtureJson};</script>\n` +
    `<script>${shimSource}</script>\n${entryTag}`,
);
await Deno.writeTextFile(repoPath("index.browser.html"), injected);

// --- helpers -------------------------------------------------------------------
async function serving(): Promise<boolean> {
  try {
    const res = await fetch(DEV_URL, { signal: AbortSignal.timeout(1000) });
    await res.body?.cancel();
    return res.ok;
  } catch {
    return false;
  }
}

async function readWsUrl(proc: Deno.ChildProcess): Promise<string> {
  const reader = proc.stderr.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) throw new Error("chromium exited before DevTools was ready");
    buf += decoder.decode(value);
    const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) {
      // keep draining stderr in the background so chromium never blocks on it
      (async () => {
        while (!(await reader.read()).done) { /* discard */ }
      })();
      return m[1];
    }
  }
}

// --- minimal CDP client ------------------------------------------------------------
type CdpMessage = {
  id?: number;
  method?: string;
  sessionId?: string;
  result?: unknown;
  error?: { message: string };
  params?: unknown;
};

class Cdp {
  #ws: WebSocket;
  #nextId = 1;
  #pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  #eventWaiters: { method: string; resolve: () => void }[] = [];
  #eventListeners = new Map<string, (params: unknown) => void>();

  private constructor(ws: WebSocket) {
    this.#ws = ws;
    ws.onmessage = (e) => {
      const msg: CdpMessage = JSON.parse(e.data);
      if (msg.id !== undefined) {
        const p = this.#pending.get(msg.id);
        if (!p) return;
        this.#pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
      } else if (msg.method) {
        this.#eventListeners.get(msg.method)?.(msg.params);
        this.#eventWaiters = this.#eventWaiters.filter((w) => {
          if (w.method === msg.method) {
            w.resolve();
            return false;
          }
          return true;
        });
      }
    };
  }

  onEvent(method: string, cb: (params: unknown) => void) {
    this.#eventListeners.set(method, cb);
  }

  static connect(url: string): Promise<Cdp> {
    const ws = new WebSocket(url);
    return new Promise((resolve, reject) => {
      ws.onopen = () => resolve(new Cdp(ws));
      ws.onerror = () => reject(new Error("CDP websocket failed"));
    });
  }

  send(method: string, params: unknown = {}, sessionId?: string) {
    const id = this.#nextId++;
    this.#ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise<unknown>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
    });
  }

  waitEvent(method: string): Promise<void> {
    return new Promise((resolve) =>
      this.#eventWaiters.push({ method, resolve })
    );
  }

  close() {
    this.#ws.close();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- drive -------------------------------------------------------------------------
// All process/tempdir allocation happens inside the try so any failure — vite
// not coming up, chromium missing, a CDP error — still hits the finally.
let devServer: Deno.ChildProcess | undefined;
let profileDir: string | undefined;
let chromium: Deno.ChildProcess | undefined;
let cdp: Cdp | undefined;
try {
  if (!(await serving())) {
    console.error("starting vite dev server…");
    devServer = new Deno.Command("deno", {
      args: ["task", "dev"],
      cwd: repoPath("."),
      stdout: "null",
      stderr: "null",
    }).spawn();
    const deadline = Date.now() + 60_000;
    while (!(await serving())) {
      if (Date.now() > deadline) throw new Error("dev server did not come up");
      await sleep(500);
    }
  }

  profileDir = await Deno.makeTempDir({ prefix: "gvpn-chromium-" });
  chromium = new Deno.Command("chromium", {
    args: [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      "--hide-scrollbars",
      "--remote-debugging-port=0",
      `--user-data-dir=${profileDir}`,
      "about:blank",
    ],
    stdout: "null",
    stderr: "piped",
  }).spawn();

  cdp = await Cdp.connect(await readWsUrl(chromium));

  const { targetId } = (await cdp.send("Target.createTarget", {
    url: "about:blank",
  })) as { targetId: string };
  const { sessionId } = (await cdp.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  })) as { sessionId: string };

  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);

  // Surface browser console warnings/errors — the shim logs unhandled invoke
  // commands there, which is the usual reason a screen fails to render.
  // Event param shapes are guaranteed by the DevTools Protocol, hence the
  // plain casts instead of defensive parsing.
  cdp.onEvent("Runtime.consoleAPICalled", (params) => {
    const { type, args } = params as {
      type: string;
      args: { value?: unknown; description?: string }[];
    };
    if (type !== "error" && type !== "warning") return;
    const text = args
      .map((a) => a.value !== undefined ? String(a.value) : a.description ?? "")
      .join(" ");
    console.error(`[browser ${type}] ${text}`);
  });
  cdp.onEvent("Runtime.exceptionThrown", (params) => {
    const { exceptionDetails } = params as {
      exceptionDetails: { text: string; exception?: { description?: string } };
    };
    console.error(
      `[browser exception] ${
        exceptionDetails.exception?.description ?? exceptionDetails.text
      }`,
    );
  });

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  }, sessionId);

  const evaluate = async (expression: string): Promise<unknown> => {
    const res = (await cdp!.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
    }, sessionId)) as {
      result: { value?: unknown };
      exceptionDetails?: { exception?: { description?: string } };
    };
    if (res.exceptionDetails) {
      throw new Error(
        res.exceptionDetails.exception?.description ?? "evaluate failed",
      );
    }
    return res.result.value;
  };

  const loaded = cdp.waitEvent("Page.loadEventFired");
  await cdp.send("Page.navigate", {
    url: `${DEV_URL}/index.browser.html`,
  }, sessionId);
  await loaded;

  // Wait until Solid replaced the static splash, then ride out the
  // MIN_SCREEN_DISPLAY_TIME (1333ms) screen transition in App.tsx.
  const mountDeadline = Date.now() + 15_000;
  while (await evaluate("!!document.querySelector('.loading-screen')")) {
    if (Date.now() > mountDeadline) {
      throw new Error("app did not mount — check browser console for errors");
    }
    await sleep(250);
  }
  await sleep(1600);

  for (const [cmd, arg] of steps) {
    switch (cmd) {
      case "shot": {
        const { data } = (await cdp.send("Page.captureScreenshot", {
          format: "png",
        }, sessionId)) as { data: string };
        await Deno.writeFile(
          arg,
          Uint8Array.from(atob(data), (c) => c.charCodeAt(0)),
        );
        console.error(`screenshot: ${arg}`);
        break;
      }
      case "click":
        await evaluate(
          `(() => {
            const el = document.querySelector(${JSON.stringify(arg)});
            if (!el) throw new Error("no element matches: " + ${
            JSON.stringify(arg)
          });
            el.click();
          })()`,
        );
        console.error(`clicked: ${arg}`);
        break;
      case "text":
        console.log(
          await evaluate(
            `document.querySelector(${
              JSON.stringify(arg)
            })?.innerText ?? "<no match>"`,
          ),
        );
        break;
      case "eval":
        console.log(JSON.stringify(await evaluate(arg)));
        break;
      case "wait":
        await sleep(Number(arg));
        break;
    }
  }
} finally {
  cdp?.close();
  if (chromium) {
    try {
      chromium.kill();
      await chromium.status;
    } catch { /* already gone */ }
  }
  if (devServer) {
    try {
      devServer.kill();
      await devServer.status;
    } catch { /* already gone */ }
    // deno task may leave the vite child running; sweep it — best-effort, a
    // rejection here would mask the real error
    await new Deno.Command("pkill", { args: ["-f", "vite"] }).output()
      .catch(() => {});
  }
  if (profileDir) {
    await Deno.remove(profileDir, { recursive: true }).catch(() => {});
  }
}
