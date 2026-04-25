const fs = require('fs');
const path = require('path');
const sampleRate = 44100;
const duration = 8;
const baseDir = path.join(__dirname, 'samples');
if (!fs.existsSync(baseDir)) {
  fs.mkdirSync(baseDir, { recursive: true });
}

const presets = [
  { name: 'wave1', type: 'wave' },
  { name: 'wave2', type: 'wave' },
  { name: 'wave_gull1', type: 'wave' },
  { name: 'rain1', type: 'rain' },
  { name: 'spring_rain', type: 'rain' },
  { name: 'wind1', type: 'wind' },
  { name: 'wind3', type: 'wind' },
  { name: 'running_water', type: 'water' },
  { name: 'boiling_water', type: 'water' },
  { name: 'campfire', type: 'fire' },
  { name: 'stream2', type: 'water' },
  { name: 'stream', type: 'water' },
  { name: 'birds', type: 'birds' },
];

function createWavBuffer(samples) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(samples[i], 44 + i * 2);
  }
  return buffer;
}

function noise(type, t) {
  const base = Math.sin(2 * Math.PI * 100 * t) * 0.2;
  switch (type) {
    case 'wave':
      return (Math.sin(2 * Math.PI * 0.6 * t) * 0.3 + Math.sin(2 * Math.PI * 4 * t) * 0.1) * (Math.random() * 0.2 + 0.6);
    case 'rain':
      return (Math.random() * 2 - 1) * 0.15 * Math.exp(-t * 0.2);
    case 'wind':
      return (Math.sin(2 * Math.PI * 0.2 * t) * 0.4 + (Math.random() * 2 - 1) * 0.2) * 0.5;
    case 'water':
      return (Math.sin(2 * Math.PI * 6 * t) * 0.2 + Math.random() * 0.15) * 0.55;
    case 'fire':
      return (Math.random() * 2 - 1) * 0.25 * Math.exp(-t * 0.05);
    case 'birds':
      return (Math.sin(2 * Math.PI * 5 * t) * 0.1 + Math.random() * 0.2) * 0.5;
    default:
      return (Math.random() * 2 - 1) * 0.2;
  }
}

for (const preset of presets) {
  const samples = [];
  for (let i = 0; i < sampleRate * duration; i++) {
    const t = i / sampleRate;
    const env = Math.pow(1 - t / duration, 2);
    const value = Math.max(-32767, Math.min(32767, Math.round(noise(preset.type, t) * 30000 * env)));
    samples.push(value);
  }
  const wav = createWavBuffer(samples);
  const filePath = path.join(baseDir, `${preset.name}.wav`);
  fs.writeFileSync(filePath, wav);
  console.log(`created ${filePath}`);
}
