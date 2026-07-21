import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SAMPLE_RATE = 44100;
const DURATION = 5;
const BASE_FREQUENCY = 140;
const PITCH_CLIMB = 1.5;
const outputDirectory = join(dirname(fileURLToPath(import.meta.url)), "audio");

mkdirSync(outputDirectory, { recursive: true });

function collectEvents(depth) {
  const events = [];
  let intervals = [[0, 1]];

  for (let level = 0; level < depth; level += 1) {
    const nextIntervals = [];
    for (const [start, end] of intervals) {
      const third = (end - start) / 3;
      // All thirds use the same event shape, gain and waveform. Their only
      // differences are the time interval and the pitch assigned to the level.
      events.push(
        { start, length: third, level },
        { start: start + third, length: third, level },
        { start: start + third * 2, length: third, level }
      );
      nextIntervals.push([start, start + third], [start + third * 2, end]);
    }
    intervals = nextIntervals;
  }

  return events;
}

function triangle(phase) {
  return 2 * Math.abs(2 * (phase - Math.floor(phase + 0.5))) - 1;
}

function render(depth) {
  const events = collectEvents(depth);
  const sampleCount = SAMPLE_RATE * DURATION;
  const mix = new Float32Array(sampleCount);

  for (const event of events) {
    const startSample = Math.floor(event.start * sampleCount);
    const eventSamples = Math.max(Math.floor(SAMPLE_RATE * 0.03), Math.floor(event.length * sampleCount * 0.78));
    const endSample = Math.min(sampleCount, startSample + eventSamples);
    const frequency = BASE_FREQUENCY * Math.pow(PITCH_CLIMB, event.level);

    for (let index = startSample; index < endSample; index += 1) {
      const local = (index - startSample) / SAMPLE_RATE;
      const progress = (index - startSample) / Math.max(1, eventSamples - 1);
      const envelope = Math.sin(Math.PI * progress);
      mix[index] += triangle(local * frequency) * envelope;
    }
  }

  let peak = 0;
  for (const sample of mix) peak = Math.max(peak, Math.abs(sample));
  const samples = new Int16Array(sampleCount);
  const scale = peak > 0 ? 0.82 / peak : 0;
  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = Math.round(Math.tanh(mix[index] * scale) * 32767);
  }
  return { samples, eventCount: events.length };
}

function waveBuffer(samples) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < samples.length; index += 1) buffer.writeInt16LE(samples[index], 44 + index * 2);
  return buffer;
}

for (let depth = 1; depth <= 6; depth += 1) {
  const { samples, eventCount } = render(depth);
  const suffix = depth === 6 ? "-final" : "";
  const filename = `cantor-iteration-${depth}${suffix}.wav`;
  writeFileSync(join(outputDirectory, filename), waveBuffer(samples));
  console.log(`Generated ${filename}: ${eventCount} equally treated events`);
}

function renderShepard(stage) {
  const counts = [1, 5, 9];
  const bases = [220, 110, 55];
  const count = counts[stage - 1];
  const base = bases[stage - 1];
  const sampleCount = SAMPLE_RATE * DURATION;
  const mix = new Float32Array(sampleCount);

  for (let index = 0; index < count; index += 1) {
    const frequency = base * Math.pow(2, index);
    const decay = Math.pow(0.72, index);
    const taper = stage === 3 ? Math.sin(Math.PI * (index + 1) / (count + 1)) : 1;
    const amplitude = decay * taper;
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      const time = sampleIndex / SAMPLE_RATE;
      const edge = Math.min(1, time / 0.18, (DURATION - time) / 0.3);
      mix[sampleIndex] += Math.sin(Math.PI * 2 * frequency * time) * amplitude * Math.max(0, edge);
    }
  }

  let peak = 0;
  for (const sample of mix) peak = Math.max(peak, Math.abs(sample));
  const samples = new Int16Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) samples[index] = Math.round((mix[index] / Math.max(1, peak)) * 0.78 * 32767);
  return { samples, count };
}

for (let stage = 1; stage <= 3; stage += 1) {
  const { samples, count } = renderShepard(stage);
  const filename = `shepard-step-${stage}.wav`;
  writeFileSync(join(outputDirectory, filename), waveBuffer(samples));
  console.log(`Generated ${filename}: ${count} partials`);
}
