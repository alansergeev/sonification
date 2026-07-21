const SVG_NS = "http://www.w3.org/2000/svg";
const CYAN = "#438da8";
const PINK = "#9e466e";
const ORANGE = "#ffad45";
const GRID = "#263041";
const MUTED = "#828399";

function svgElement(name, attributes) {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function drawCantor(svg, depth) {
  const compact = svg.classList.contains("cantor-mini");
  const width = 1000;
  const height = compact ? 210 : 340;
  const padX = compact ? 14 : 16;
  const top = compact ? 10 : 14;
  const gap = compact ? 9 : 12;
  const barHeight = Math.min(compact ? 22 : 27, (height - top * 2 - gap * (depth - 1)) / depth);

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.replaceChildren();

  let intervals = [[0, 1]];
  for (let level = 0; level < depth; level += 1) {
    const y = top + level * (barHeight + gap);
    const nextIntervals = [];

    intervals.forEach(([start, end]) => {
      const third = (end - start) / 3;
      const pieces = [
        [start, start + third, CYAN],
        [start + third, start + third * 2, PINK],
        [start + third * 2, end, CYAN]
      ];

      pieces.forEach(([pieceStart, pieceEnd, colour]) => {
        svg.appendChild(svgElement("rect", {
          x: padX + pieceStart * (width - padX * 2),
          y,
          width: Math.max(1.2, (pieceEnd - pieceStart) * (width - padX * 2)),
          height: barHeight,
          fill: colour,
          rx: compact ? 1 : 0,
          class: "cantor-piece",
          "data-start": pieceStart,
          "data-end": pieceEnd
        }));
      });

      nextIntervals.push([start, start + third], [start + third * 2, end]);
    });

    intervals = nextIntervals;
  }

  svg.appendChild(svgElement("line", {
    x1: padX,
    x2: padX,
    y1: 4,
    y2: height - 4,
    class: "cantor-playhead",
    "data-pad": padX,
    "data-width": width - padX * 2
  }));
}

document.querySelectorAll(".cantor-mini").forEach((svg) => drawCantor(svg, Number(svg.dataset.depth)));

const cantorVisual = document.querySelector("#cantor-visual");
const cantorControls = {
  frequency: document.querySelector("#cantor-frequency"),
  depth: document.querySelector("#cantor-depth"),
  climb: document.querySelector("#cantor-climb"),
  duration: document.querySelector("#cantor-duration"),
  sustain: document.querySelector("#cantor-sustain"),
  volume: document.querySelector("#cantor-volume"),
  waveform: document.querySelector("#cantor-waveform")
};
const cantorOutputs = {
  frequency: document.querySelector("#cantor-frequency-value"),
  depth: document.querySelector("#cantor-depth-value"),
  climb: document.querySelector("#cantor-climb-value"),
  duration: document.querySelector("#cantor-duration-value"),
  sustain: document.querySelector("#cantor-sustain-value"),
  volume: document.querySelector("#cantor-volume-value")
};
const cantorPlay = document.querySelector("#cantor-play");

let audioContext;
let cantorSources = [];
let cantorStopTimer;
let cantorAnimationFrame;

function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  audioContext = audioContext || new AudioContextClass();
  return audioContext;
}

function updateCantor() {
  cantorOutputs.frequency.value = `${cantorControls.frequency.value} HZ`;
  cantorOutputs.depth.value = cantorControls.depth.value;
  cantorOutputs.climb.value = `${Number(cantorControls.climb.value).toFixed(2)}×`;
  cantorOutputs.duration.value = `${Number(cantorControls.duration.value).toFixed(1)} S`;
  cantorOutputs.sustain.value = `${cantorControls.sustain.value}%`;
  cantorOutputs.volume.value = `${cantorControls.volume.value}%`;
  drawCantor(cantorVisual, Number(cantorControls.depth.value));
}

function resetCantorButton() {
  cantorPlay.classList.remove("is-playing");
  cantorPlay.setAttribute("aria-pressed", "false");
  cantorPlay.innerHTML = "<span>▶</span> PLAY CURRENT SET";
}

function setCantorProgress(svg, progress, active) {
  const playhead = svg.querySelector(".cantor-playhead");
  if (!playhead) return;
  const clamped = Math.max(0, Math.min(1, progress));
  const pad = Number(playhead.dataset.pad);
  const drawableWidth = Number(playhead.dataset.width);
  const x = pad + clamped * drawableWidth;
  playhead.setAttribute("x1", x);
  playhead.setAttribute("x2", x);
  svg.classList.toggle("is-scanning", active);
  svg.querySelectorAll(".cantor-piece").forEach((piece) => {
    const start = Number(piece.dataset.start);
    const end = Number(piece.dataset.end);
    piece.classList.toggle("is-sounding", active && clamped >= start && clamped <= end);
  });
}

function animateCantor(svg, progressReader, onComplete) {
  cancelAnimationFrame(cantorAnimationFrame);
  const frame = () => {
    const progress = progressReader();
    setCantorProgress(svg, progress, progress < 1);
    if (progress < 1) cantorAnimationFrame = requestAnimationFrame(frame);
    else {
      setCantorProgress(svg, 0, false);
      onComplete?.();
    }
  };
  frame();
}

function stopCantor() {
  clearTimeout(cantorStopTimer);
  cancelAnimationFrame(cantorAnimationFrame);
  cantorSources.forEach((source) => {
    try { source.stop(); } catch { /* already stopped */ }
  });
  cantorSources = [];
  setCantorProgress(cantorVisual, 0, false);
  resetCantorButton();
}

function collectCantorEvents(depth) {
  const events = [];
  let intervals = [[0, 1]];
  for (let level = 0; level < depth; level += 1) {
    const nextIntervals = [];
    intervals.forEach(([start, end]) => {
      const third = (end - start) / 3;
      events.push(
        { start, length: third, level },
        { start: start + third, length: third, level },
        { start: start + third * 2, length: third, level }
      );
      nextIntervals.push([start, start + third], [start + third * 2, end]);
    });
    intervals = nextIntervals;
  }
  return events;
}

async function playCantor() {
  if (cantorSources.length) {
    stopCantor();
    return;
  }

  const context = getAudioContext();
  if (!context) return;
  await context.resume();

  const depth = Number(cantorControls.depth.value);
  const baseFrequency = Number(cantorControls.frequency.value);
  const climb = Number(cantorControls.climb.value);
  const duration = Number(cantorControls.duration.value);
  const sustain = Number(cantorControls.sustain.value) / 100;
  const volume = Number(cantorControls.volume.value) / 100;
  const events = collectCantorEvents(depth);
  const master = context.createGain();
  const startAt = context.currentTime + 0.05;
  const normalisedGain = Math.min(0.2, volume * 0.32 / Math.sqrt(depth));

  master.gain.value = 0.9;
  master.connect(context.destination);

  for (let level = 0; level < depth; level += 1) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = cantorControls.waveform.value;
    oscillator.frequency.value = Math.min(6800, baseFrequency * Math.pow(climb, level));
    gain.gain.value = 0;

    events.filter((event) => event.level === level).forEach((event) => {
      const eventStart = startAt + event.start * duration;
      const naturalLength = Math.max(0.012, event.length * duration);
      const eventLength = naturalLength * (0.72 + sustain * 0.28);
      const eventEnd = Math.min(startAt + duration + 0.4, eventStart + eventLength);
      const attack = Math.min(0.008, eventLength * 0.2);
      const release = Math.min(0.012, eventLength * 0.25);
      gain.gain.setValueAtTime(0, eventStart);
      gain.gain.linearRampToValueAtTime(normalisedGain, eventStart + attack);
      gain.gain.setValueAtTime(normalisedGain, Math.max(eventStart + attack, eventEnd - release));
      gain.gain.linearRampToValueAtTime(0, eventEnd);
    });

    oscillator.connect(gain).connect(master);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.45);
    cantorSources.push(oscillator);
  }

  cantorPlay.classList.add("is-playing");
  cantorPlay.setAttribute("aria-pressed", "true");
  cantorPlay.innerHTML = "<span>■</span> STOP";
  const visualStart = performance.now() + 50;
  animateCantor(cantorVisual, () => Math.max(0, (performance.now() - visualStart) / (duration * 1000)));
  cantorStopTimer = setTimeout(() => {
    cantorSources = [];
    resetCantorButton();
  }, (duration + 0.7) * 1000);
}

Object.values(cantorControls).forEach((control) => control?.addEventListener("input", updateCantor));
cantorPlay?.addEventListener("click", playCantor);
updateCantor();

document.querySelectorAll(".iteration-row").forEach((row) => {
  const audio = row.querySelector("audio");
  const svg = row.querySelector(".cantor-mini");
  let frame;
  const sync = () => {
    cancelAnimationFrame(frame);
    const tick = () => {
      const progress = audio.duration ? audio.currentTime / audio.duration : 0;
      setCantorProgress(svg, progress, !audio.paused && !audio.ended);
      if (!audio.paused && !audio.ended) frame = requestAnimationFrame(tick);
    };
    tick();
  };
  audio.addEventListener("play", sync);
  audio.addEventListener("pause", sync);
  audio.addEventListener("ended", () => setCantorProgress(svg, 0, false));
  audio.addEventListener("seeked", sync);
});

const referenceAudio = document.querySelector(".reference-audio audio");
let referenceAnimationFrame;
function syncReferenceAudio() {
  cancelAnimationFrame(referenceAnimationFrame);
  const tick = () => {
    const progress = referenceAudio.duration ? referenceAudio.currentTime / referenceAudio.duration : 0;
    setCantorProgress(cantorVisual, progress, !referenceAudio.paused && !referenceAudio.ended);
    if (!referenceAudio.paused && !referenceAudio.ended) referenceAnimationFrame = requestAnimationFrame(tick);
  };
  tick();
}
referenceAudio?.addEventListener("play", () => { stopCantor(); syncReferenceAudio(); });
referenceAudio?.addEventListener("pause", syncReferenceAudio);
referenceAudio?.addEventListener("ended", () => setCantorProgress(cantorVisual, 0, false));
referenceAudio?.addEventListener("seeked", syncReferenceAudio);

const shepardControls = {
  a: document.querySelector("#shepard-a"),
  b: document.querySelector("#shepard-b"),
  f0: document.querySelector("#shepard-f0"),
  n: document.querySelector("#shepard-n"),
  glide: document.querySelector("#shepard-glide"),
  taper: document.querySelector("#shepard-taper"),
  level: document.querySelector("#shepard-level"),
  phaseEnabled: document.querySelector("#phase-enabled"),
  phase: document.querySelector("#phase-shift")
};
const waveformCanvas = document.querySelector("#waveform-canvas");
const spectrumCanvas = document.querySelector("#spectrum-canvas");
const shepardPlay = document.querySelector("#shepard-play");
let shepardNodes = [];
let shepardMaster;
let shepardPlaying = false;
let shepardAnimationFrame;
let shepardAnimationStarted = 0;

function drawShepardMini(canvas, progress = 0, playing = false) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const stage = Number(canvas.dataset.stage);
  const count = [1, 5, 9][stage - 1];
  const pad = 34;
  ctx.clearRect(0, 0, width, height);
  drawGrid(ctx, width, height, 8, 2);

  const points = Array.from({ length: count }, (_, index) => {
    const position = count === 1 ? 0.38 : (index + 0.7) / (count + 0.4);
    const decay = Math.pow(0.82, index);
    const window = stage === 3 ? Math.sin(Math.PI * (index + 1) / (count + 1)) : 1;
    return { x: pad + position * (width - pad * 2), y: height - 22 - decay * window * (height - 55) };
  });

  ctx.beginPath();
  ctx.moveTo(0, height - 22);
  points.forEach(({ x, y }) => ctx.lineTo(x, y));
  ctx.lineTo(width, height - 22);
  ctx.strokeStyle = "#377fa3";
  ctx.lineWidth = 2;
  ctx.stroke();

  const cursorX = progress * width;
  points.forEach(({ x, y }) => {
    const highlighted = playing && Math.abs(x - cursorX) < width * 0.07;
    ctx.beginPath(); ctx.moveTo(x, height - 22); ctx.lineTo(x, y); ctx.strokeStyle = highlighted ? "rgba(255,255,255,.7)" : "rgba(255,173,69,.32)"; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, highlighted ? 7 : 4, 0, Math.PI * 2); ctx.fillStyle = highlighted ? "#fff" : ORANGE; ctx.shadowColor = highlighted ? "#fff" : ORANGE; ctx.shadowBlur = highlighted ? 14 : 7; ctx.fill(); ctx.shadowBlur = 0;
  });

  if (playing) {
    ctx.beginPath(); ctx.moveTo(cursorX, 0); ctx.lineTo(cursorX, height); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.shadowColor = "#fff"; ctx.shadowBlur = 7; ctx.stroke(); ctx.shadowBlur = 0;
  }
}

document.querySelectorAll(".shepard-step").forEach((step) => {
  const canvas = step.querySelector(".shepard-mini");
  const audio = step.querySelector("audio");
  let frame;
  drawShepardMini(canvas);
  const sync = () => {
    cancelAnimationFrame(frame);
    const tick = () => {
      const progress = audio.duration ? audio.currentTime / audio.duration : 0;
      drawShepardMini(canvas, progress, !audio.paused && !audio.ended);
      if (!audio.paused && !audio.ended) frame = requestAnimationFrame(tick);
    };
    tick();
  };
  audio.addEventListener("play", sync);
  audio.addEventListener("pause", sync);
  audio.addEventListener("seeked", sync);
  audio.addEventListener("ended", () => drawShepardMini(canvas));
});

function phaseValue() {
  return shepardControls.phaseEnabled.checked ? Number(shepardControls.phase.value) : 0;
}

function shepardState() {
  return {
    a: Number(shepardControls.a.value),
    b: Number(shepardControls.b.value),
    f0: Number(shepardControls.f0.value),
    n: Number(shepardControls.n.value),
    glide: Number(shepardControls.glide.value),
    taper: Number(shepardControls.taper.value),
    level: Number(shepardControls.level.value),
    phase: phaseValue()
  };
}

function drawGrid(ctx, width, height, columns, rows) {
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  for (let column = 1; column < columns; column += 1) {
    const x = column * width / columns;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
  }
  for (let row = 1; row < rows; row += 1) {
    const y = row * height / rows;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
  }
}

function partialAmplitude(index, state) {
  const shiftedIndex = state.motionIndex ?? index + state.phase;
  const centre = (state.n - 1) / 2;
  const distance = Math.abs(shiftedIndex - centre) / Math.max(1, centre);
  const window = Math.pow(Math.max(0, Math.cos(Math.min(1, distance) * Math.PI / 2)), state.taper * 3);
  return Math.pow(state.a, shiftedIndex) * window;
}

function drawWaveform(state) {
  const ctx = waveformCanvas.getContext("2d");
  const { width, height } = waveformCanvas;
  ctx.clearRect(0, 0, width, height);
  drawGrid(ctx, width, height, 7, 2);
  ctx.beginPath();

  let maximum = 0;
  const values = [];
  for (let x = 0; x < width; x += 2) {
    const t = x / width;
    let value = 0;
    for (let index = 0; index < state.n; index += 1) {
      const shift = state.motionShift ?? state.phase;
      const position = ((index + shift) % state.n + state.n) % state.n;
      const relativeFrequency = Math.pow(state.b, position * 0.42);
      value += partialAmplitude(index, { ...state, motionIndex: position }) * Math.sin(Math.PI * 2 * relativeFrequency * t + shift * Math.PI * 2);
    }
    maximum = Math.max(maximum, Math.abs(value));
    values.push([x, value]);
  }

  values.forEach(([x, value], index) => {
    const y = height / 2 - (value / Math.max(1, maximum)) * height * 0.38;
    if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = ORANGE;
  ctx.lineWidth = 1.8;
  ctx.shadowColor = ORANGE;
  ctx.shadowBlur = 4;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawSpectrum(state) {
  const ctx = spectrumCanvas.getContext("2d");
  const { width, height } = spectrumCanvas;
  const pad = { left: 45, right: 26, top: 36, bottom: 20 };
  ctx.clearRect(0, 0, width, height);
  drawGrid(ctx, width, height, 11, 1);

  const points = [];
  for (let index = 0; index < state.n; index += 1) {
    const shift = state.motionShift ?? state.phase;
    const position = ((index + shift) % state.n + state.n) % state.n;
    const frequency = state.f0 * Math.pow(state.b, position);
    const x = pad.left + (Math.log(frequency / state.f0) / Math.log(22000 / state.f0)) * (width - pad.left - pad.right);
    const amplitude = partialAmplitude(index, { ...state, motionIndex: position });
    const y = height - pad.bottom - amplitude * (height - pad.top - pad.bottom) * 1.25;
    points.push({ x, y: Math.max(pad.top, y) });
  }
  points.sort((first, second) => first.x - second.x);

  ctx.beginPath();
  ctx.moveTo(0, height - pad.bottom);
  points.forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.lineTo(width, height - pad.bottom);
  ctx.strokeStyle = "#377fa3";
  ctx.lineWidth = 2;
  ctx.stroke();

  points.forEach((point) => {
    ctx.beginPath(); ctx.moveTo(point.x, height - pad.bottom); ctx.lineTo(point.x, point.y); ctx.strokeStyle = "rgba(255,173,69,.35)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(point.x, point.y, 4.5, 0, Math.PI * 2); ctx.fillStyle = ORANGE; ctx.shadowColor = ORANGE; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0;
  });
}

function updateShepardNodes(state) {
  if (!shepardPlaying || !audioContext) return;
  if (shepardNodes.length !== state.n) {
    stopShepard();
    startShepard();
    return;
  }
  shepardMaster.gain.setTargetAtTime(state.level * 0.2, audioContext.currentTime, 0.03);
  shepardNodes.forEach(({ oscillator, gain }, index) => {
    const shift = state.motionShift ?? state.phase;
    const position = ((index + shift) % state.n + state.n) % state.n;
    const frequency = Math.min(20000, state.f0 * Math.pow(state.b, position));
    oscillator.frequency.setTargetAtTime(frequency, audioContext.currentTime, 0.025);
    gain.gain.setTargetAtTime(partialAmplitude(index, { ...state, motionIndex: position }) / Math.sqrt(state.n), audioContext.currentTime, 0.025);
  });
}

function animateShepard(timestamp) {
  if (!shepardPlaying) return;
  if (!shepardAnimationStarted) shepardAnimationStarted = timestamp;
  const elapsed = (timestamp - shepardAnimationStarted) / 1000;
  const state = shepardState();
  state.motionShift = state.phase + elapsed * state.glide;
  drawWaveform(state);
  drawSpectrum(state);
  updateShepardNodes(state);
  document.querySelector("#metric-phase").textContent = state.motionShift.toFixed(3);
  shepardAnimationFrame = requestAnimationFrame(animateShepard);
}

function updateShepard() {
  shepardControls.phase.disabled = !shepardControls.phaseEnabled.checked;
  const state = shepardState();
  document.querySelector("#shepard-a-value").value = state.a.toFixed(2);
  document.querySelector("#shepard-b-value").value = state.b.toFixed(2);
  document.querySelector("#shepard-f0-value").value = `${state.f0} Hz`;
  document.querySelector("#shepard-n-value").value = state.n;
  document.querySelector("#shepard-glide-value").value = state.glide.toFixed(2).replace("-", "−");
  document.querySelector("#shepard-taper-value").value = state.taper.toFixed(2);
  document.querySelector("#shepard-level-value").value = state.level.toFixed(2);
  document.querySelector("#phase-shift-value").value = state.phase.toFixed(3);

  const slope = -Math.log(state.a) / Math.log(state.b);
  const perOctave = 20 * Math.log10(state.a) / Math.log2(state.b);
  const bandTop = state.f0 * Math.pow(state.b, state.n);
  document.querySelector("#metric-slope").textContent = slope.toFixed(2);
  document.querySelector("#metric-octave").textContent = `${perOctave.toFixed(1).replace("-", "−")} dB`;
  document.querySelector("#metric-dimension").textContent = (2 - slope).toFixed(3);
  document.querySelector("#metric-regime").textContent = `${(state.a * state.b).toFixed(2)} ${state.a * state.b > 1 ? "✓" : "×"}`;
  document.querySelector("#metric-band").innerHTML = `${(bandTop / 1000).toFixed(1)} k <i>Hz</i>`;
  document.querySelector("#metric-phase").textContent = state.phase.toFixed(3);

  drawWaveform(state);
  drawSpectrum(state);
  updateShepardNodes(state);
}

async function startShepard() {
  const context = getAudioContext();
  if (!context) return;
  await context.resume();
  const state = shepardState();
  shepardMaster = context.createGain();
  shepardMaster.gain.value = 0;
  shepardMaster.connect(context.destination);

  shepardNodes = Array.from({ length: state.n }, (_, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = Math.min(20000, state.f0 * Math.pow(state.b, index + state.phase));
    gain.gain.value = partialAmplitude(index, state) / Math.sqrt(state.n);
    oscillator.connect(gain).connect(shepardMaster);
    oscillator.start();
    return { oscillator, gain };
  });

  shepardMaster.gain.linearRampToValueAtTime(state.level * 0.2, context.currentTime + 0.08);
  shepardPlaying = true;
  shepardAnimationStarted = 0;
  shepardAnimationFrame = requestAnimationFrame(animateShepard);
  shepardPlay.classList.add("is-playing");
  shepardPlay.setAttribute("aria-pressed", "true");
  shepardPlay.textContent = "Stop";
}

function stopShepard() {
  cancelAnimationFrame(shepardAnimationFrame);
  shepardNodes.forEach(({ oscillator }) => {
    try { oscillator.stop(); } catch { /* already stopped */ }
  });
  shepardNodes = [];
  shepardMaster?.disconnect();
  shepardMaster = null;
  shepardPlaying = false;
  shepardAnimationStarted = 0;
  shepardPlay.classList.remove("is-playing");
  shepardPlay.setAttribute("aria-pressed", "false");
  shepardPlay.textContent = "Start";
  updateShepard();
}

Object.values(shepardControls).forEach((control) => control?.addEventListener("input", updateShepard));
shepardControls.phaseEnabled?.addEventListener("change", () => {
  if (!shepardControls.phaseEnabled.checked) shepardControls.phase.value = 0;
  updateShepard();
});
shepardPlay?.addEventListener("click", () => shepardPlaying ? stopShepard() : startShepard());
document.querySelector("#compensation-mode")?.addEventListener("click", (event) => event.currentTarget.classList.toggle("active"));
window.addEventListener("pagehide", () => { stopCantor(); stopShepard(); });

updateShepard();
