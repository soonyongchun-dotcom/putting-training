import wave
import struct
import math
import os

os.makedirs('samples', exist_ok=True)

sample_rate = 44100
duration = 8.0
amplitude = 16000
defs = [
    ('piano', [220, 440, 660]),
    ('violin', [196, 392, 588]),
]

for name, freqs in defs:
    path = f'samples/{name}.wav'
    with wave.open(path, 'w') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        frames = []
        for i in range(int(sample_rate * duration)):
            t = i / sample_rate
            env = (1.0 - t / duration) ** 2
            value = sum(amplitude * env * math.sin(2 * math.pi * freq * t) / len(freqs) for freq in freqs)
            frames.append(struct.pack('<h', int(value)))
        wf.writeframes(b''.join(frames))

print('created samples/piano.wav and samples/violin.wav')
