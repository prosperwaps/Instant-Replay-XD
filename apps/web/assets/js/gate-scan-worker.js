/* Gate App QR decoder, running off the main thread so the camera preview never stutters.
   Engine: ZXing C++ compiled to WebAssembly (zxing-wasm 3.1.5, MIT), stored in assets/vendor
   so it works offline and on iPhone (Safari has no built-in barcode reader for web pages).
   The page sends one camera frame at a time; the buffer is handed back for reuse. */
importScripts('../vendor/zxing-reader.js');

const WASM = new URL('../vendor/zxing_reader.wasm', self.location.href).href;
const ready = ZXingWASM.prepareZXingModule({
  overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? WASM : prefix + path) },
  fireImmediately: true
});

/* Most frames: QR only, no extra passes, so each read takes a few milliseconds.
   Every few frames the page asks for a thorough pass (rotated, inverted, harder search). */
const FAST = { formats: ['QRCode'], tryHarder: false, tryRotate: false, tryInvert: false, tryDownscale: true, maxNumberOfSymbols: 1 };
const HARD = { formats: ['QRCode'], tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true, maxNumberOfSymbols: 1 };

self.onmessage = async (e) => {
  const m = e.data;
  try {
    await ready;
    if (m.type === 'warm') { self.postMessage({ type: 'ready' }); return; }
    const t0 = performance.now();
    const found = await ZXingWASM.readBarcodes(new ImageData(new Uint8ClampedArray(m.buf), m.w, m.h), m.hard ? HARD : FAST);
    const hit = found.find((r) => r.isValid && r.text);
    self.postMessage({ type: 'result', id: m.id, text: hit ? hit.text : null, ms: performance.now() - t0, buf: m.buf }, [m.buf]);
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, error: String((err && err.message) || err) });
  }
};
