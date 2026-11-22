// Runs the wasm model off the main thread (WebGPU works in dedicated workers).
// Messages in:  {type: 'init', pkg, tune, f16}  |  {type: 'run', coord, color, normal, profile, patch}
// Messages out: {type: 'status', text}  |  {type: 'ready', info}  |  {type: 'result', labels, stats}  |  {type: 'error', text}

let demo = null;
const post = (msg, transfer) => self.postMessage(msg, transfer || []);

async function fetchBytes(url, label) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const total = +r.headers.get('content-length') || 0;
  const reader = r.body.getReader();
  const chunks = []; let got = 0, last = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length;
    if (got - last > (1 << 20)) {
      last = got;
      post({ type: 'status', text: `Downloading ${label}… ${(got / 2 ** 20).toFixed(1)}${total ? ` / ${(total / 2 ** 20).toFixed(1)}` : ''} MiB` });
    }
  }
  const out = new Uint8Array(got); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

async function init({ pkg, tune, f16 }) {
  if (!navigator.gpu) throw new Error('WebGPU is not available in workers of this browser');
  post({ type: 'status', text: `Loading the wasm module (${pkg})…` });
  const mod = await import(`./${pkg}/phasorpt_web.js`);
  await mod.default();
  const config = await (await fetch('model/config.json')).text();
  const weights = await fetchBytes('model/weights_f16.safetensors', 'weights');
  post({ type: 'status', text: 'Initializing WebGPU and uploading the weights…' });
  demo = await mod.PhasorDemo.create(config, weights, tune, !!f16);
  const info = JSON.parse(demo.info());
  // which GPU the browser hands out (Burn cannot read the name on the web). On Windows laptops the browser often
  // picks the integrated GPU: powerPreference is ignored there (crbug.com/369219127).
  try {
    const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    const i = a.info || (a.requestAdapterInfo ? await a.requestAdapterInfo() : {});
    info.adapter = [i.vendor, i.architecture, i.device, i.description].filter(Boolean).join(' / ') || 'unknown';
    info.adapter_fallback = !!(a.isFallbackAdapter || (a.info && a.info.isFallbackAdapter));
  } catch (err) { info.adapter = `unknown (${err})`; }
  post({ type: 'ready', info });
}

async function run({ coord, color, normal, profile, patch }) {
  const t0 = performance.now();
  const progress = (stage) => post({ type: 'status', text: `Running: ${stage}… (${((performance.now() - t0) / 1000).toFixed(1)} s)` });
  const res = await demo.run(coord, color, normal, profile, patch || 0, progress);
  const labels = new Uint8Array(res.labels());
  const stats = JSON.parse(res.stats());
  stats.wall_ms = performance.now() - t0;
  post({ type: 'result', labels, stats }, [labels.buffer]);
}

self.onmessage = async (e) => {
  try {
    if (e.data.type === 'init') await init(e.data);
    else if (e.data.type === 'run') await run(e.data);
  } catch (err) {
    console.error(err);
    post({ type: 'error', text: String(err && err.message ? err.message : err) });
  }
};
