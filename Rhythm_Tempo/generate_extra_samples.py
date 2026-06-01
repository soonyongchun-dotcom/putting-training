import wave
import struct
import math
import random
import os

os.makedirs('samples', exist_ok=True)

sample_rate = 44100
duration = 8.0
amplitude = 12000

presets = [
    ('running_water', 'water'),
    ('boiling_water', 'water'),
    ('stream', 'water'),
    ('stream2', 'water'),
    ('birds', 'birds'),
]

for name, kind in presets:
    path = f'samples/{name}.wav'
    with wave.open(path, 'w') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        frames = []
        for i in range(int(sample_rate * duration)):
            t = i / sample_rate
            if kind == 'water':
                value = (math.sin(2 * math.pi * 5 * t) * 0.2 + (random.random() * 2 - 1) * 0.15) * math.exp(-t * 0.02)
            else:
                value = (math.sin(2 * math.pi * 5 * t) * 0.1 + math.sin(2 * math.pi * 12 * t) * 0.05) * math.exp(-t * 0.01)
            sample = int(amplitude * value)
            sample = max(-32767, min(32767, sample))
            frames.append(struct.pack('<h', sample))
        wf.writeframes(b''.join(frames))
    print(f'created {path}')
