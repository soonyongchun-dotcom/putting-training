const fs = require('fs');
const path = require('path');
const sampleRate = 44100;
const duration = 8.0;
const amplitude = 16000;
const defs = [
  ['piano', [220, 440, 660]],
  ['violin', [196, 392, 588]],
];
const samplesDir = path.join(__dirname, 'samples');
if (!fs.existsSync(samplesDir)) fs.mkdirSync(samplesDir, { recursive: true });
for (const [name, freqs] of defs) {
  const frames = Buffer.alloc(sampleRate * duration * 2);
  for (let i = 0; i < sampleRate * duration; i++) {
    const t = i / sampleRate;
    const env = Math.pow(1 - t / duration, 2);
    let value = 0;
    for (const freq of freqs) {
      value += amplitude * env * Math.sin(2 * Math.PI * freq * t) / freqs.length;
    }
    const sample = Math.max(-32767, Math.min(32767, Math.round(value)));
    frames.writeInt16LE(sample, i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + frames.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(frames.length, 40);
  const filePath = path.join(samplesDir, `${name}.wav`);
  fs.writeFileSync(filePath, Buffer.concat([header, frames]));
  console.log(`created ${filePath}`);
}
