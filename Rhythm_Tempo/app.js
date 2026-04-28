const shotPatterns = {
  driver: {
    name: 'Driver',
    pattern: [1, 0.5, 0.5, 1],
    description: 'A long tempo pattern with a strong first beat for driver practice.',
    frequency: 160,
  },
  iron: {
    name: 'Iron',
    pattern: [0.75, 0.75, 0.5, 1],
    description: 'A balanced, stable rhythm for iron swings.',
    frequency: 190,
  },
  shortGame: {
    name: 'Short Game',
    pattern: [0.5, 0.5, 0.5, 0.5, 1],
    description: 'Close interval pattern for precision on short shots.',
    frequency: 220,
  },
  putting: {
    name: 'Putting',
    pattern: [1, 1, 1],
    description: 'A consistent tempo to maintain a smooth putting stroke.',
    frequency: 260,
  },
};

const athleteProfiles = {
  standard: {
    name: 'Standard Tempo',
    tempoRatio: 1,
    swingAccent: 1,
    description: 'A general training tempo and rhythm setup.',
  },
  power: {
    name: 'Power Driver',
    tempoRatio: 1.08,
    swingAccent: 1.15,
    description: 'Strong, driving rhythm with emphasis on the first beat.',
  },
  smooth: {
    name: 'Smooth Rhythm',
    tempoRatio: 0.94,
    swingAccent: 0.9,
    description: 'Frequent stroke spacing with a softer swing feel.',
  },
  precision: {
    name: 'Precision Control',
    tempoRatio: 1,
    swingAccent: 0.85,
    description: 'Consistent timing for improved accuracy.',
  },
};

const focusSoundOptions = {
  none: {
    name: 'None',
    description: 'Focus only on the rhythm pattern.',
    type: 'none',
  },
  pulse: {
    name: 'Rhythm Pulse',
    description: 'Adds a low-frequency pulse to reinforce timing.',
    type: 'pulse',
    baseFreq: 55,
    lfoRate: 0.3,
  },
  binaural: {
    name: 'Binaural Focus',
    description: 'Subtle stereo difference to enhance concentration.',
    type: 'binaural',
    baseFreq: 420,
    beat: 8,
  },
  ambient: {
    name: 'Ambient Support',
    description: 'Soft pad tones to support a steady focus.',
    type: 'ambient',
    baseFreq: 330,
    lfoRate: 0.1,
  },
};

const backgroundMusicOptions = {
  none: {
    name: 'None',
    description: 'No background audio.',
    type: 'none',
  },
  customFile: {
    name: 'Upload Audio',
    description: 'Use a local WAV or MP3 file as background audio.',
    type: 'custom',
  },
  soundSelection: {
    name: 'Sound Selection',
    description: 'Choose one of the available background sounds.',
    type: 'selection',
  },
};

const soundSelectionOptions = {
  piano: {
    name: 'Piano',
    type: 'piano',
    baseFreq: 220,
  },
  violin: {
    name: 'Violin',
    type: 'violin',
    baseFreq: 330,
  },
  running_water: {
    name: 'Running Water',
    type: 'water',
  },
  boiling_water: {
    name: 'Boiling Water',
    type: 'water',
  },
  stream: {
    name: 'Stream Water',
    type: 'water',
  },
  stream2: {
    name: 'Mountain Stream',
    type: 'water',
  },
  birds: {
    name: 'Birds',
    type: 'birds',
  },
  uploaded: {
    name: 'Uploaded Audio',
    type: 'custom',
  },
};

const PRESETS_KEY = 'golf_rhythm_presets';
let storedPresets = [];

function loadPresets() {
  const raw = window.localStorage.getItem(PRESETS_KEY);
  if (!raw) {
    storedPresets = [];
    return;
  }
  try {
    storedPresets = JSON.parse(raw) || [];
  } catch (err) {
    storedPresets = [];
  }
}

function savePresets() {
  window.localStorage.setItem(PRESETS_KEY, JSON.stringify(storedPresets));
}

function getCurrentPresetData() {
  const title = presetNameInput.value.trim() || `${shotPatterns[shotSelect.value].name} Setting`;
  return {
    id: Date.now().toString(),
    title,
    club: shotPatterns[shotSelect.value].name,
    shotType: shotSelect.value,
    profile: profileSelect.value,
    beatPattern: getSelectedPattern(),
    focusSound: focusSelect.value,
    backgroundMusic: backgroundSelect.value,
    soundChoice: soundSelect?.value || null,
    tempo: Number(tempoInput.value),
    swingSpeed: Number(speedInput.value),
  };
}

function getBackgroundDescriptor(preset) {
  const background = backgroundMusicOptions[preset.backgroundMusic] || backgroundMusicOptions.none;
  if (preset.backgroundMusic === 'soundSelection') {
    const choice = soundSelectionOptions[preset.soundChoice] || soundSelectionOptions.piano;
    return `${background.name} (${choice.name})`;
  }
  if (preset.backgroundMusic === 'customFile') {
    return background.name;
  }
  return background.name;
}

function renderPresetList() {
  presetList.innerHTML = '';
  if (!storedPresets.length) {
    presetList.textContent = 'No saved presets yet. Save a setting to load it later.';
    return;
  }

  storedPresets.slice().reverse().forEach((preset) => {
    const item = document.createElement('div');
    item.className = 'preset-item';
    item.innerHTML = `
      <strong>${preset.title}</strong>
      <small>Club: ${preset.club} · Profile: ${athleteProfiles[preset.profile].name} · Focus Sound: ${focusSoundOptions[preset.focusSound].name} · Background: ${getBackgroundDescriptor(preset)}</small>
    `;

    const actions = document.createElement('div');
    actions.className = 'preset-actions';

    const loadButton = document.createElement('button');
    loadButton.textContent = 'Load';
    loadButton.addEventListener('click', () => loadPreset(preset));

    const playButtonPreset = document.createElement('button');
    playButtonPreset.textContent = 'Load & Play';
    playButtonPreset.addEventListener('click', () => {
      loadPreset(preset);
      startPlay();
    });

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete';
    deleteButton.className = 'secondary';
    deleteButton.addEventListener('click', () => deletePreset(preset.id));

    actions.appendChild(loadButton);
    actions.appendChild(playButtonPreset);
    actions.appendChild(deleteButton);
    item.appendChild(actions);
    presetList.appendChild(item);
  });
}

function saveCurrentPreset() {
  const preset = getCurrentPresetData();
  storedPresets.push(preset);
  savePresets();
  renderPresetList();
  presetNameInput.value = '';
}

function loadPreset(preset) {
  shotSelect.value = preset.shotType;
  profileSelect.value = preset.profile;
  if (preset.beatPattern) {
    setBeatPatternValues(preset.beatPattern);
  } else {
    setBeatPatternValues(shotPatterns[preset.shotType].pattern);
  }
  focusSelect.value = preset.focusSound;
  backgroundSelect.value = preset.backgroundMusic || 'none';
  if (preset.soundChoice && soundSelect) {
    refreshSoundSelectOptions();
    soundSelect.value = preset.soundChoice;
  }
  tempoInput.value = preset.tempo;
  speedInput.value = preset.swingSpeed;
  updateDisplay();
}

function deletePreset(id) {
  storedPresets = storedPresets.filter((preset) => preset.id !== id);
  savePresets();
  renderPresetList();
}

const tempoInput = document.getElementById('tempo');
const tempoValue = document.getElementById('tempoValue');
const speedInput = document.getElementById('swingSpeed');
const speedValue = document.getElementById('speedValue');
const shotSelect = document.getElementById('shotType');
const profileSelect = document.getElementById('profile');
const beat1 = document.getElementById('beat1');
const beat2 = document.getElementById('beat2');
const beat3 = document.getElementById('beat3');
const beat4 = document.getElementById('beat4');
const focusSelect = document.getElementById('focusSound');
const backgroundSelect = document.getElementById('backgroundMusic');
const backgroundFileInput = document.getElementById('backgroundFileInput');
const loadBackgroundSampleButton = document.getElementById('loadBackgroundSampleButton');
const backgroundFileRow = document.getElementById('backgroundFileRow');
const soundSelect = document.getElementById('soundSelect');
const soundSelectionRow = document.getElementById('soundSelectionRow');
const presetNameInput = document.getElementById('presetName');
const savePresetButton = document.getElementById('savePresetButton');
const presetList = document.getElementById('presetList');
const playButton = document.getElementById('playButton');
const stopButton = document.getElementById('stopButton');
const patternDescription = document.getElementById('patternDescription');
const focusDescription = document.getElementById('focusDescription');
const backgroundDescription = document.getElementById('backgroundDescription');
const patternList = document.getElementById('patternList');

let audioContext;
let scheduleId;
let nextStartTime = 0;
let isPlaying = false;
let customBackgroundBuffer = null;
let customBackgroundFileName = null;

function refreshSoundSelectOptions() {
  if (!soundSelect) return;
  const currentValue = soundSelect.value;
  soundSelect.innerHTML = '';

  Object.entries(soundSelectionOptions).forEach(([key, option]) => {
    if (option.type === 'custom' && !customBackgroundBuffer) {
      return;
    }
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = option.name;
    soundSelect.appendChild(opt);
  });

  if (!soundSelect.querySelector(`option[value="${currentValue}"]`)) {
    soundSelect.value = soundSelect.options[0]?.value || 'piano';
  }
}

function getSelectedPattern() {
  return [Number(beat1.value), Number(beat2.value), Number(beat3.value), Number(beat4.value)];
}

function setBeatPatternValues(pattern) {
  const values = [...pattern];
  while (values.length < 4) {
    values.push(1);
  }
  beat1.value = String(values[0]);
  beat2.value = String(values[1]);
  beat3.value = String(values[2]);
  beat4.value = String(values[3]);
}

function updateDisplay() {
  tempoValue.textContent = tempoInput.value;
  speedValue.textContent = `${speedInput.value}%`;
  const shot = shotPatterns[shotSelect.value];
  const focus = focusSoundOptions[focusSelect.value];
  const background = backgroundMusicOptions[backgroundSelect.value] || backgroundMusicOptions.none;
  patternDescription.textContent = shot.description;
  focusDescription.textContent = `Selected focus sound: ${focus.name} — ${focus.description}`;

  let backgroundText = `Background audio: ${background.name} — ${background.description}`;
  if (backgroundSelect.value === 'customFile' && customBackgroundFileName) {
    backgroundText += ` (${customBackgroundFileName})`;
  }
  if (backgroundSelect.value === 'soundSelection' && soundSelect) {
    const soundChoice = soundSelectionOptions[soundSelect.value];
    if (soundChoice) {
      backgroundText += ` (${soundChoice.name})`;
    }
  }
  backgroundDescription.textContent = backgroundText;
  backgroundFileRow.classList.toggle('hidden', backgroundSelect.value !== 'customFile');
  soundSelectionRow.classList.toggle('hidden', backgroundSelect.value !== 'soundSelection');
  patternList.innerHTML = '';
  const selectedPattern = getSelectedPattern();
  selectedPattern.forEach((beat, index) => {
    const li = document.createElement('li');
    li.textContent = `Beat ${index + 1}: ${beat} beats`;
    patternList.appendChild(li);
  });
}

let focusNodes = []; 
let focusLfo = null;
let backgroundNodes = [];
let backgroundIntervals = [];
let backgroundLfo = null;
let sampleBuffers = {};

async function loadSampleBuffer(url) {
  if (sampleBuffers[url]) {
    return sampleBuffers[url];
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn('Sample file not found:', url, response.status);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    sampleBuffers[url] = audioBuffer;
    return audioBuffer;
  } catch (err) {
    console.warn('Sample load failed:', url, err);
    return null;
  }
}

async function decodeLocalAudioFile(file) {
  if (!audioContext) {
    await createAudioContext();
  }
  try {
    const arrayBuffer = await file.arrayBuffer();
    return await audioContext.decodeAudioData(arrayBuffer);
  } catch (err) {
    console.warn('Local audio decode failed:', file.name, err);
    return null;
  }
}

function stopFocusSound() {
  if (focusLfo) {
    focusLfo.stop();
    focusLfo.disconnect();
    focusLfo = null;
  }
  focusNodes.forEach((node) => {
    try {
      node.stop && node.stop();
      node.disconnect();
    } catch (err) {
      /* ignore */
    }
  });
  focusNodes = [];
}

function stopBackgroundMusic() {
  if (backgroundLfo) {
    backgroundLfo.stop();
    backgroundLfo.disconnect();
    backgroundLfo = null;
  }
  backgroundIntervals.forEach((intervalId) => {
    window.clearInterval(intervalId);
  });
  backgroundIntervals = [];
  backgroundNodes.forEach((node) => {
    try {
      node.stop && node.stop();
      node.disconnect();
    } catch (err) {
      /* ignore */
    }
  });
  backgroundNodes = [];
}

function startFocusSound() {
  const focus = focusSoundOptions[focusSelect.value];
  stopFocusSound();
  if (focus.type === 'none') {
    return;
  }

  if (focus.type === 'pulse') {
    const osc = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const lfo = audioContext.createOscillator();
    const lfoGain = audioContext.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(focus.baseFreq, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.02, audioContext.currentTime);
    lfo.frequency.setValueAtTime(focus.lfoRate, audioContext.currentTime);
    lfoGain.gain.setValueAtTime(0.02, audioContext.currentTime);
    lfo.connect(lfoGain).connect(gainNode.gain);

    osc.connect(gainNode).connect(audioContext.destination);
    osc.start();
    lfo.start();
    focusNodes.push(osc, gainNode, lfo, lfoGain);
    focusLfo = lfo;
    return;
  }

  if (focus.type === 'binaural') {
    const leftOsc = audioContext.createOscillator();
    const rightOsc = audioContext.createOscillator();
    const leftGain = audioContext.createGain();
    const rightGain = audioContext.createGain();
    const leftPan = typeof audioContext.createStereoPanner === 'function' ? audioContext.createStereoPanner() : null;
    const rightPan = typeof audioContext.createStereoPanner === 'function' ? audioContext.createStereoPanner() : null;

    leftOsc.type = 'sine';
    rightOsc.type = 'sine';
    leftOsc.frequency.setValueAtTime(focus.baseFreq, audioContext.currentTime);
    rightOsc.frequency.setValueAtTime(focus.baseFreq + focus.beat, audioContext.currentTime);
    leftGain.gain.setValueAtTime(0.04, audioContext.currentTime);
    rightGain.gain.setValueAtTime(0.04, audioContext.currentTime);

    if (leftPan && rightPan) {
      leftPan.pan.setValueAtTime(-0.7, audioContext.currentTime);
      rightPan.pan.setValueAtTime(0.7, audioContext.currentTime);
      leftOsc.connect(leftGain).connect(leftPan).connect(audioContext.destination);
      rightOsc.connect(rightGain).connect(rightPan).connect(audioContext.destination);
      focusNodes.push(leftPan, rightPan);
    } else {
      leftOsc.connect(leftGain).connect(audioContext.destination);
      rightOsc.connect(rightGain).connect(audioContext.destination);
    }

    leftOsc.start();
    rightOsc.start();
    focusNodes.push(leftOsc, rightOsc, leftGain, rightGain);
    return;
  }

  if (focus.type === 'ambient') {
    const osc = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const lfo = audioContext.createOscillator();
    const lfoGain = audioContext.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(focus.baseFreq, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.02, audioContext.currentTime);
    lfo.frequency.setValueAtTime(focus.lfoRate, audioContext.currentTime);
    lfoGain.gain.setValueAtTime(0.015, audioContext.currentTime);
    lfo.connect(lfoGain).connect(gainNode.gain);

    osc.connect(gainNode).connect(audioContext.destination);
    osc.start();
    lfo.start();
    focusNodes.push(osc, gainNode, lfo, lfoGain);
    focusLfo = lfo;
  }
}

async function startBackgroundMusic() {
  let background = backgroundMusicOptions[backgroundSelect.value];
  stopBackgroundMusic();
  if (!background || background.type === 'none') {
    return;
  }

  if (background.type === 'custom') {
    if (customBackgroundBuffer) {
      const source = audioContext.createBufferSource();
      const gain = audioContext.createGain();
      source.buffer = customBackgroundBuffer;
      source.loop = true;
      gain.gain.setValueAtTime(0.08, audioContext.currentTime);
      source.connect(gain).connect(audioContext.destination);
      source.start();
      backgroundNodes.push(source, gain);
      return;
    }
    console.warn('Uploaded audio file not loaded. No background audio will play.');
    return;
  }

  if (background.type === 'selection') {
    const selectedChoice = soundSelect?.value || 'piano';
    const choice = soundSelectionOptions[selectedChoice];
    if (!choice) {
      console.warn('No sound choice selected for sound selection background.');
      return;
    }
    if (choice.type === 'custom') {
      if (customBackgroundBuffer) {
        const source = audioContext.createBufferSource();
        const gain = audioContext.createGain();
        source.buffer = customBackgroundBuffer;
        source.loop = true;
        gain.gain.setValueAtTime(0.08, audioContext.currentTime);
        source.connect(gain).connect(audioContext.destination);
        source.start();
        backgroundNodes.push(source, gain);
        return;
      }
      console.warn('Uploaded audio file not loaded. No background audio will play.');
      return;
    }
    if (choice.type === 'piano' || choice.type === 'violin') {
      background = choice;
    }
    if (choice.type === 'water' || choice.type === 'birds') {
      playNatureSound(choice.type);
      return;
    }
  }

  if (background.type === 'pad') {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const lfo = audioContext.createOscillator();
    const lfoGain = audioContext.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(background.baseFreq, audioContext.currentTime);
    gain.gain.setValueAtTime(0.01, audioContext.currentTime);
    lfo.frequency.setValueAtTime(background.lfoRate, audioContext.currentTime);
    lfoGain.gain.setValueAtTime(0.01, audioContext.currentTime);
    lfo.connect(lfoGain).connect(gain.gain);

    osc.connect(gain).connect(audioContext.destination);
    osc.start();
    lfo.start();

    backgroundNodes.push(osc, gain, lfo, lfoGain);
    backgroundLfo = lfo;
    return;
  }

  if (background.type === 'sample') {
    const audioBuffer = await loadSampleBuffer(background.file);
    if (!audioBuffer) {
      console.warn('Unable to load sample for playback:', background.file);
      return;
    }
    const source = audioContext.createBufferSource();
    const gain = audioContext.createGain();
    source.buffer = audioBuffer;
    source.loop = true;
    gain.gain.setValueAtTime(0.08, audioContext.currentTime);
    source.connect(gain).connect(audioContext.destination);
    source.start();
    backgroundNodes.push(source, gain);
    return;
  }

  if (background.type === 'piano') {
    if (!Number.isFinite(background.baseFreq)) {
      background.baseFreq = 220;
    }
    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    const lfo = audioContext.createOscillator();
    const lfoGain = audioContext.createGain();

    const now = audioContext.currentTime;
    const wave = audioContext.createPeriodicWave(
      new Float32Array([0, 0.4, 0.15, 0.08, 0.04]),
      new Float32Array([0, 0.0, 0.3, 0.1, 0.04])
    );

    osc1.setPeriodicWave(wave);
    osc2.setPeriodicWave(wave);
    osc1.frequency.setValueAtTime(background.baseFreq, now);
    osc2.frequency.setValueAtTime(background.baseFreq * 2, now);
    osc2.detune.setValueAtTime(10, now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.Q.setValueAtTime(1.2, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.05, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.015, now + 0.6);
    gain.gain.setTargetAtTime(0.006, now + 1.2, 1.4);

    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(5.2, now);
    lfoGain.gain.setValueAtTime(70, now);
    lfo.connect(lfoGain).connect(osc1.frequency);
    lfo.connect(lfoGain).connect(osc2.frequency);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain).connect(audioContext.destination);
    osc1.start(now);
    osc2.start(now);
    lfo.start(now);

    backgroundNodes.push(osc1, osc2, filter, gain, lfo, lfoGain);
    backgroundLfo = lfo;
    return;
  }

  if (background.type === 'violin') {
    if (!Number.isFinite(background.baseFreq)) {
      background.baseFreq = 330;
    }
    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    const vibrato = audioContext.createOscillator();
    const vibratoGain = audioContext.createGain();

    const now = audioContext.currentTime;
    osc1.type = 'sawtooth';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(background.baseFreq, now);
    osc2.frequency.setValueAtTime(background.baseFreq * 1.01, now);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(background.baseFreq * 1.5, now);
    filter.Q.setValueAtTime(10, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.014, now + 0.3);
    gain.gain.setTargetAtTime(0.010, now + 0.8, 0.6);

    vibrato.type = 'sine';
    vibrato.frequency.setValueAtTime(5.6, now);
    vibratoGain.gain.setValueAtTime(8, now);
    vibrato.connect(vibratoGain).connect(osc1.frequency);
    vibrato.connect(vibratoGain).connect(osc2.frequency);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain).connect(audioContext.destination);

    osc1.start(now);
    osc2.start(now);
    vibrato.start(now);

    backgroundNodes.push(osc1, osc2, filter, gain, vibrato, vibratoGain);
    backgroundLfo = vibrato;
    return;
  }
}

function playNatureSound(type) {
  const now = audioContext.currentTime;
  if (type === 'water') {
    const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 4, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.15;
    }
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = audioContext.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, now);
    filter.Q.setValueAtTime(1.2, now);
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.06, now);
    source.connect(filter).connect(gain).connect(audioContext.destination);
    source.start();
    backgroundNodes.push(source, filter, gain);
    return;
  }

  if (type === 'birds') {
    const masterGain = audioContext.createGain();
    masterGain.gain.setValueAtTime(0.04, now);
    masterGain.connect(audioContext.destination);

    const createBirdChirp = () => {
      const t = audioContext.currentTime;
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const freq = 1200 + Math.random() * 1200;
      const duration = 0.1 + Math.random() * 0.18;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.08, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      osc.connect(gain).connect(masterGain);
      osc.start(t);
      osc.stop(t + duration + 0.05);
      backgroundNodes.push(osc, gain);
    };

    const interval = window.setInterval(() => {
      if (!isPlaying) {
        window.clearInterval(interval);
        return;
      }
      createBirdChirp();
    }, 700 + Math.random() * 800);
    backgroundIntervals.push(interval);
    backgroundNodes.push(masterGain);
    return;
  }
}

async function createAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === 'suspended') {
    try {
      await audioContext.resume();
    } catch (err) {
      console.warn('AudioContext resume failed:', err);
    }
  }
}

async function unlockAudioOnGesture() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === 'suspended') {
    try {
      await audioContext.resume();
    } catch (err) {
      console.warn('AudioContext unlock on gesture failed:', err);
    }
  }
}

function createPulse(time, frequency, duration, gainValue) {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, time);
  gainNode.gain.setValueAtTime(gainValue, time);
  gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration);
  oscillator.connect(gainNode).connect(audioContext.destination);
  oscillator.start(time);
  oscillator.stop(time + duration + 0.02);
}

function scheduleMeasure(startTime) {
  const shot = shotPatterns[shotSelect.value];
  const profile = athleteProfiles[profileSelect.value];
  const bpm = Number(tempoInput.value) * (Number(speedInput.value) / 100) * profile.tempoRatio;
  const beatDuration = 60 / bpm;
  let currentTime = startTime;
  const pattern = getSelectedPattern();

  pattern.forEach((subdivision, index) => {
    const accent = index === 0 ? 1.2 : 1;
    const velocity = profile.swingAccent * accent;
    const duration = beatDuration * Math.min(subdivision, 0.3);
    createPulse(currentTime, shot.frequency, duration, 0.2 * velocity);
    currentTime += beatDuration * subdivision;
  });

  nextStartTime = currentTime;
}

function scheduler() {
  const lookAhead = 0.2;
  const scheduleInterval = 0.1;

  while (nextStartTime < audioContext.currentTime + lookAhead) {
    scheduleMeasure(nextStartTime);
  }

  scheduleId = window.setTimeout(scheduler, scheduleInterval * 1000);
}

async function startPlay() {
  if (isPlaying) return;
  await createAudioContext();
  isPlaying = true;
  nextStartTime = audioContext.currentTime + 0.05;
  scheduler();
  startFocusSound();
  await startBackgroundMusic();
  playButton.textContent = 'Playing...';
}

function stopPlay() {
  if (!isPlaying) return;
  window.clearTimeout(scheduleId);
  stopFocusSound();
  stopBackgroundMusic();
  isPlaying = false;
  playButton.textContent = 'Play';
}

tempoInput.addEventListener('input', updateDisplay);
speedInput.addEventListener('input', updateDisplay);
shotSelect.addEventListener('change', () => {
  setBeatPatternValues(shotPatterns[shotSelect.value].pattern);
  updateDisplay();
});
profileSelect.addEventListener('change', updateDisplay);
[beat1, beat2, beat3, beat4].forEach((select) => {
  select.addEventListener('change', updateDisplay);
});
focusSelect.addEventListener('change', () => {
  updateDisplay();
  if (isPlaying) {
    startFocusSound();
  }
});
backgroundSelect.addEventListener('change', () => {
  if (backgroundSelect.value === 'soundSelection') {
    refreshSoundSelectOptions();
  }
  updateDisplay();
  if (isPlaying) {
    startBackgroundMusic();
  }
});
if (soundSelect) {
  soundSelect.addEventListener('change', async () => {
    updateDisplay();
    if (isPlaying) {
      await startBackgroundMusic();
    }
  });
}
loadBackgroundSampleButton.addEventListener('click', async () => {
  if (!backgroundFileInput.files.length) {
    alert('Please choose a WAV or MP3 file first.');
    return;
  }
  await unlockAudioOnGesture();
  const file = backgroundFileInput.files[0];
  const buffer = await decodeLocalAudioFile(file);
  if (!buffer) {
    alert('Could not load the selected file. Please try another WAV or MP3 file.');
    return;
  }
  customBackgroundBuffer = buffer;
  customBackgroundFileName = file.name;
  if (backgroundSelect.value === 'soundSelection') {
    refreshSoundSelectOptions();
  }
  backgroundSelect.value = 'customFile';
  updateDisplay();
  if (isPlaying) {
    await startBackgroundMusic();
  }
});
playButton.addEventListener('click', async (event) => {
  await unlockAudioOnGesture();
  await startPlay();
});
stopButton.addEventListener('click', stopPlay);
savePresetButton.addEventListener('click', saveCurrentPreset);

document.addEventListener('touchend', async () => {
  if (audioContext && audioContext.state === 'suspended') {
    try {
      await audioContext.resume();
    } catch (err) {
      console.warn('AudioContext resume from touchend failed:', err);
    }
  }
}, {passive: true});

loadPresets();
renderPresetList();
setBeatPatternValues(shotPatterns[shotSelect.value].pattern);
updateDisplay();
