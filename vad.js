// Simple energy-based voice activity detector.
// push(chunk) returns null, {type:"start"}, {type:"cancel"} or {type:"end", samples}.
function createVad({ sampleRate, threshold = 0.03, hangMs = 700, minMs = 250, preRollMs = 300, maxMs = 15000, tailMs = 150 }) {
  const ms = (n) => Math.round((n * sampleRate) / 1000);
  const preRollLen = ms(preRollMs), hangLen = ms(hangMs), minLen = ms(minMs), maxLen = ms(maxMs), tailLen = ms(tailMs);
  let preRoll = [], preRollSize = 0, clip = [], clipSize = 0, voiced = 0, silent = 0;

  const vad = { state: "idle", threshold, push, reset };

  function rms(chunk) {
    let s = 0;
    for (let i = 0; i < chunk.length; i++) s += chunk[i] * chunk[i];
    return Math.sqrt(s / chunk.length);
  }

  function concat(parts, size) {
    const out = new Float32Array(size);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  function reset() {
    preRoll = []; preRollSize = 0; clip = []; clipSize = 0; voiced = 0; silent = 0;
    vad.state = "idle";
  }

  function finish() {
    // Drop most of the trailing silence so playback ends right after the voice
    const keep = clipSize - Math.max(0, silent - tailLen);
    const event = voiced >= minLen ? { type: "end", samples: concat(clip, clipSize).subarray(0, keep) } : { type: "cancel" };
    reset();
    return event;
  }

  function push(chunk) {
    const loud = rms(chunk) >= vad.threshold;

    if (vad.state === "idle") {
      if (!loud) {
        preRoll.push(chunk); preRollSize += chunk.length;
        while (preRoll.length && preRollSize - preRoll[0].length >= preRollLen) preRollSize -= preRoll.shift().length;
        // Keep exactly preRollLen samples (trim the oldest chunk)
        if (preRollSize > preRollLen) {
          preRoll[0] = preRoll[0].subarray(preRollSize - preRollLen); preRollSize = preRollLen;
        }
        return null;
      }
      vad.state = "speaking";
      clip = [...preRoll, chunk]; clipSize = preRollSize + chunk.length;
      preRoll = []; preRollSize = 0;
      voiced = chunk.length; silent = 0;
      return { type: "start" };
    }

    clip.push(chunk); clipSize += chunk.length;
    if (loud) { voiced += chunk.length + silent; silent = 0; } else silent += chunk.length;
    if (silent >= hangLen || clipSize >= maxLen) return finish();
    return null;
  }

  return vad;
}

if (typeof module !== "undefined") module.exports = { createVad };
