// spriteBake.js -- sprite-sheet baking, sync or chunked (2026-09-21).
//
// Every pixel-art sheet (planets, stars, gates...) is a wide canvas of
// `frames` columns painted by a per-frame callback. bakeSheet does the
// whole thing synchronously (fine for small sheets). bakeSheetAsync
// paints a few frames per timer tick so a 30-fps sheet (hundreds of ms
// of work) never stalls a game frame -- callers show a quick low-frame
// sheet meanwhile and swap the full one in when onDone fires.
//
// paintFrame(f, put, putE): `put` writes the main sheet, `putE` (when
// `emissive` is requested) writes a second sheet of self-lit pixels.

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function makeWriters(fw, fh, frames, data, edata) {
  const stride = fw * frames;
  const put = (f, x, y, rgb, a = 255) => {
    if (x < 0 || y < 0 || x >= fw || y >= fh) return;
    const i = (y * stride + f * fw + x) * 4;
    data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = a;
  };
  const putE = edata ? (f, x, y, rgb, a = 255) => {
    if (x < 0 || y < 0 || x >= fw || y >= fh) return;
    const i = (y * stride + f * fw + x) * 4;
    edata[i] = rgb[0]; edata[i + 1] = rgb[1]; edata[i + 2] = rgb[2]; edata[i + 3] = a;
  } : null;
  return { put, putE };
}

function finish(fw, fh, frames, canvas, img, ecanvas, eimg, extra) {
  canvas.getContext('2d').putImageData(img, 0, 0);
  let emissiveDataUrl = null;
  if (ecanvas) {
    // only keep the emissive sheet if anything was written
    let any = false;
    const d = eimg.data;
    for (let i = 3; i < d.length; i += 4) { if (d[i]) { any = true; break; } }
    if (any) { ecanvas.getContext('2d').putImageData(eimg, 0, 0); emissiveDataUrl = ecanvas.toDataURL(); }
  }
  return { dataUrl: canvas.toDataURL(), emissiveDataUrl, fw, fh, frames, ...extra };
}

export function bakeSheet({ fw, fh, frames, paintFrame, emissive = false, extra = {} }) {
  const canvas = makeCanvas(fw * frames, fh);
  const img = canvas.getContext('2d').createImageData(fw * frames, fh);
  const ecanvas = emissive ? makeCanvas(fw * frames, fh) : null;
  const eimg = ecanvas ? ecanvas.getContext('2d').createImageData(fw * frames, fh) : null;
  const { put, putE } = makeWriters(fw, fh, frames, img.data, eimg?.data);
  for (let f = 0; f < frames; f++) paintFrame(f, put, putE);
  return finish(fw, fh, frames, canvas, img, ecanvas, eimg, extra);
}

// Paints `chunk` frames per tick (setTimeout 0 between ticks), then
// calls onDone(sheet). Returns a cancel function.
export function bakeSheetAsync({ fw, fh, frames, paintFrame, emissive = false, extra = {}, chunk = 4 }, onDone) {
  const canvas = makeCanvas(fw * frames, fh);
  const img = canvas.getContext('2d').createImageData(fw * frames, fh);
  const ecanvas = emissive ? makeCanvas(fw * frames, fh) : null;
  const eimg = ecanvas ? ecanvas.getContext('2d').createImageData(fw * frames, fh) : null;
  const { put, putE } = makeWriters(fw, fh, frames, img.data, eimg?.data);
  let f = 0, cancelled = false;
  const tick = () => {
    if (cancelled) return;
    const end = Math.min(frames, f + chunk);
    for (; f < end; f++) paintFrame(f, put, putE);
    if (f < frames) setTimeout(tick, 0);
    else onDone(finish(fw, fh, frames, canvas, img, ecanvas, eimg, extra));
  };
  setTimeout(tick, 0);
  return () => { cancelled = true; };
}

// Quick-then-full helper: returns the best sheet available NOW and makes
// sure the full one gets baked exactly once. `cache` is a Map; `spec`
// builds { fw, fh, frames, paintFrame, emissive, extra } for a frame count.
export function progressiveSheet(cache, key, quickFrames, fullFrames, spec) {
  const full = cache.get(key + '|full');
  if (full) return full;
  const qKey = key + '|quick';
  let quick = cache.get(qKey);
  if (!quick) {
    quick = bakeSheet(spec(quickFrames));
    cache.set(qKey, quick);
  }
  if (!cache.get(key + '|baking')) {
    cache.set(key + '|baking', true);
    bakeSheetAsync(spec(fullFrames), (sheet) => {
      cache.set(key + '|full', sheet);
      cache.delete(qKey);
      cache.delete(key + '|baking');
    });
  }
  return quick;
}
