'use strict';

var crossCorrectionMode = 'roll';
var crossViewCorrectionData = { version: 2, references: {}, entries: {}, sources: {} };

var CROSS_CORRECTION_PHASES = ['P1', 'P4', 'P6', 'P7'];
var CROSS_CORRECTION_POINTS = {
  P1: ['c7', 'rightShoulder', 'leftShoulder', 'pelvis', 'handMid', 'clubHead'],
  P4: ['c7', 'rightShoulder', 'leftShoulder', 'pelvis', 'handMid', 'clubHead'],
  P6: ['c7', 'rightShoulder', 'pelvis', 'handMid', 'clubHead'],
  P7: ['c7', 'leftShoulder', 'leftWrist', 'pelvis', 'handMid', 'clubHead'],
};
var CROSS_CORRECTION_FRAME_PHASES = {
  frame1: ['P1', 'P4'], frame2: ['P1', 'P6'], frame4: ['P1', 'P7'],
  frame5: ['P1', 'P6'], frame6: ['P6', 'P7'],
};

function getCrossCorrectionAnalysisSignature() {
  return JSON.stringify({ frames: frameStateHistory, source: videoFileIdentity.front });
}

function crossCorrectionError(message, english) {
  throw new Error(getSwingUiText(message, english));
}

function crossCorrectionVector(a, b) {
  return { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
}

function crossCorrectionLength(vector) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function crossCorrectionAngle(a, vertex, b) {
  const u = crossCorrectionVector(vertex, a), v = crossCorrectionVector(vertex, b);
  const length = crossCorrectionLength(u) * crossCorrectionLength(v);
  if (length < 1e-8) crossCorrectionError('공통 포인트가 겹쳐 각도를 계산할 수 없습니다.', 'Overlapping landmarks prevent angle calculation.');
  return Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y + u.z * v.z) / length))) * 180 / Math.PI;
}

function getCrossCorrectionTypes(frame, panel) {
  return getFramePointTypesForView(frame, panel);
}

function getCrossCorrectionCalibration(reference) {
  if (!reference || !Number.isFinite(reference.aspect) || reference.aspect <= 0
    || !reference.points || reference.points.length !== 2) crossCorrectionError('P1에서 양 영상의 머리끝→턱끝을 지정하세요.', 'Mark head top then chin at P1 in both videos.');
  const [top, bottom] = reference.points;
  if (!isProjectCoordinate(bottom) || !isProjectCoordinate(top)) crossCorrectionError('유효한 머리–턱 기준점을 지정하세요.', 'Mark valid head and chin landmarks.');
  const dx = (top.x - bottom.x) * reference.aspect, dy = top.y - bottom.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 0.02) crossCorrectionError('머리–턱 기준길이가 너무 짧습니다.', 'The head-to-chin reference is too short.');
  return { bottom, length, ux: 0, uy: -1, aspect: reference.aspect };
}

function getCrossCorrectionModel() {
  const data = crossViewCorrectionData;
  if (!validateCrossCorrectionData(data)) crossCorrectionError('교차 보정 입력 형식이 올바르지 않습니다.', 'Invalid cross-correction inputs.');
  if (data.version !== 2) crossCorrectionError('이전 교차 입력은 새 4개 모션 방식으로 다시 지정하세요.', 'Re-enter legacy inputs using the four-motion workflow.');
  if (!areVideoSourcesSame() || !data.sources.front || data.sources.front !== videoFileIdentity.front
    || !data.sources.side || data.sources.side === data.sources.front) {
    crossCorrectionError('2번 분석과 같은 정면 원본과 별도 측면 영상을 이 화면에 불러오세요.', 'Load the step 2 front source and a separate side video in this panel.');
  }
  if (data.analysisSignature !== getCrossCorrectionAnalysisSignature()) {
    crossCorrectionError('기존 분석이 변경되었습니다. 네 모션을 확인하고 다시 저장하세요.', 'The original analysis changed. Recheck and save the four motions.');
  }
  const front = getCrossCorrectionCalibration(data.references.front);
  const side = getCrossCorrectionCalibration(data.references.side);
  const locked = getPanelReferenceLength('front');
  if (!Number.isFinite(locked) || locked <= 0.0005) crossCorrectionError('기존 정면 P1 머리–발 기준선이 필요합니다.', 'The locked front P1 head-to-foot reference is required.');
  if (!stanceReferenceLineFront) crossCorrectionError('정면 P1 양발 기준선을 먼저 지정하세요.', 'Mark the front P1 stance line first.');
  const angle = getStanceCorrectionAngle(stanceReferenceLineFront, front.aspect);
  front.ux = Math.sin(angle);
  front.uy = -Math.cos(angle);
  const entries = CROSS_CORRECTION_PHASES.map(phase => {
    const entry = data.entries[phase];
    if (!entry) crossCorrectionError(`${phase} 모션을 저장하세요.`, `Save the ${phase} motion.`);
    return entry;
  });
  for (let i = 1; i < entries.length; i++) {
    if (!(entries[i].frontTime > entries[i - 1].frontTime && entries[i].sideTime > entries[i - 1].sideTime)) {
      crossCorrectionError('P1→P4→P6→P7 시점 순서를 확인하세요.', 'Check the P1 to P4 to P6 to P7 time order.');
    }
  }
  for (const view of ['front', 'side']) {
    if (Math.abs(data.references[view].time - entries[0][`${view}Time`]) > 0.002) {
      crossCorrectionError('머리–턱 기준을 지정한 P1 시점에서 P1 모션을 저장하세요.', 'Save P1 at the time used to mark its head-to-chin reference.');
    }
  }
  const minimumFront = Math.min(...entries.map(entry => entry.frontTime));
  const maximumFront = Math.max(...entries.map(entry => entry.frontTime));
  const minimumSide = Math.min(...entries.map(entry => entry.sideTime));
  const maximumSide = Math.max(...entries.map(entry => entry.sideTime));
  if (!(maximumFront > minimumFront && maximumSide > minimumSide)) {
    crossCorrectionError('서로 다른 동작 시점의 대응 입력을 저장하세요.', 'Save matched inputs at distinct motion times.');
  }
  for (const entry of entries) {
    const frontProgress = (entry.frontTime - minimumFront) / (maximumFront - minimumFront);
    const sideProgress = (entry.sideTime - minimumSide) / (maximumSide - minimumSide);
    if (Math.abs(frontProgress - sideProgress) > 0.05) {
      crossCorrectionError('대응 시점의 진행률이 5% 이상 다릅니다. 슬로모션 배율·동기화를 확인하세요.', 'Matched time progression differs by over 5%. Check slowdown and synchronization.');
    }
  }
  const model = { correctedFrames: [], retainedFrames: ['frame3'] };
  const project = (point, calibration) => {
    if (!isProjectCoordinate(point)) crossCorrectionError('유효하지 않은 공통 포인트 좌표입니다.', 'Invalid common-landmark coordinates.');
    const dx = (point.x - calibration.bottom.x) * calibration.aspect;
    const dy = point.y - calibration.bottom.y;
    return { horizontal: (dx * -calibration.uy + dy * calibration.ux) / calibration.length,
      vertical: (dx * calibration.ux + dy * calibration.uy) / calibration.length };
  };
  const phases = {};
  for (const phase of CROSS_CORRECTION_PHASES) {
    const entry = data.entries[phase];
    if (Math.abs(entry.frontAspect - front.aspect) > 0.001 || Math.abs(entry.sideAspect - side.aspect) > 0.001) {
      crossCorrectionError(`${phase}: 기준 지정 후 영상 비율이 변경되었습니다.`, `${phase}: video aspect changed after calibration.`);
    }
    const types = CROSS_CORRECTION_POINTS[phase];
    const points = {};
    for (const type of types) {
      const a = entry.frontPoints.find(point => point.type === type);
      const b = entry.sidePoints.find(point => point.type === type);
      if (!a || !b) crossCorrectionError(`${phase}: 양쪽 공통 포인트를 모두 지정하세요.`, `${phase}: mark all common landmarks in both videos.`);
      const pa = project(a, front), pb = project(b, side);
      if (Math.abs(pa.vertical - pb.vertical) > 0.5) {
        crossCorrectionError(`${phase}: 두 영상의 높이 차이가 P1 머리–턱 길이의 50%를 초과합니다. 시점·기준·점을 확인하세요.`,
          `${phase}: vertical mismatch exceeds 50% of the P1 head-to-chin length. Check timing, scale and landmarks.`);
      }
      points[type] = { x: pa.horizontal, y: (pa.vertical + pb.vertical) / 2, z: pb.horizontal };
    }
    phases[phase] = points;
  }
  for (const [frame, phasePair] of Object.entries(CROSS_CORRECTION_FRAME_PHASES)) {
    const matches = phasePair.every((phase, index) => {
      const original = frameStateHistory[index === 0 ? 'front' : 'side'][frame];
      return original && Number.isFinite(original.videoTime)
        && getCrossCorrectionTypes(frame, index === 0 ? 'front' : 'side').every(type =>
          original.points.some(point => point.type === type || frame === 'frame2' && type === 'handMid' && point.type === 'wrist'))
        && Math.abs(original.videoTime - data.entries[phase].frontTime) <= 0.05;
    });
    if (!matches) { model.retainedFrames.push(frame); continue; }
    model[frame] = {};
    for (const [index, panel] of ['front', 'side'].entries()) {
      const p = phases[phasePair[index]];
      const aliases = frame === 'frame1'
        ? { wrist: p.c7, club: p.rightShoulder, shoulder: p.leftShoulder, clubHeadTop: index === 1 ? p.clubHead : null }
        : frame === 'frame2' ? { shoulder: p.rightShoulder, club: p.clubHead }
        : frame === 'frame4' ? { wrist: p.c7, club: p.leftShoulder, shoulder: p.leftWrist, pelvisCenter: p.pelvis, pelvis: p.clubHead }
        : {};
      // F4 A has no left-wrist input in the common P1 set; keep its original arm angle.
      model[frame][panel] = { points: { ...p, ...aliases }, scale: front.length, headScale: true };
    }
    model.correctedFrames.push(frame);
  }
  if (!model.correctedFrames.length) crossCorrectionError('네 모션의 정면 시점을 기존 2번 분석 시점에 맞추세요 (허용 0.05초).', 'Match the front motion times to step 2 analysis times (0.05 s tolerance).');
  return model;
}

function applyCrossCorrectionMetrics(metrics, model, frame, panel) {
  if (!model[frame]?.[panel]) return;
  const entry = model[frame][panel], p = entry.points, scale = entry.scale;
  const distance = (a, b) => crossCorrectionLength(crossCorrectionVector(a, b));
  const core = frame === 'frame4' ? p.pelvisCenter : p.pelvis;
  const c7 = ['frame1', 'frame4'].includes(frame) ? p.wrist : p.c7;
  const hand = p.handMid;
  if (core && hand) {
    metrics.coreHandRadiusRaw = distance(core, hand) * scale;
    if (metrics.coreHandRadiusRaw < 1e-6) crossCorrectionError(`${frame}: 골반과 양손 중심이 겹칩니다.`, `${frame}: pelvis and hand center overlap.`);
    metrics.swingRadiusRaw = metrics.coreHandRadiusRaw;
    if (frame === 'frame4') metrics.rMaxNorm = metrics.coreHandRadiusRaw;
    if (frame === 'frame6') metrics.rotRadius6 = metrics.coreHandRadiusRaw;
  }
  if (core && hand && c7) {
    const center = { x: (core.x + hand.x + c7.x) / 3, y: (core.y + hand.y + c7.y) / 3,
      z: (core.z + hand.z + c7.z) / 3 };
    metrics.threePointSpreadRaw = Math.sqrt([core, hand, c7].reduce((sum, point) =>
      sum + distance(center, point) ** 2, 0) / 3) * scale;
  }
  if (frame === 'frame2') {
    metrics.laggingAngleDeg = crossCorrectionAngle(p.shoulder, hand, p.club);
    metrics.torsoRefDist = distance(p.shoulder, p.pelvis) * scale;
  }
  if (frame === 'frame4' && p.club && p.shoulder && p.pelvis) {
    metrics.armShaftAngleDeg = crossCorrectionAngle(p.club, p.shoulder, p.pelvis);
    metrics.armShaftMissingReason = null;
  }
  if (frame === 'frame5') {
    // F5 uses the outward C7-to-hand vector, unlike F2/F6.
    metrics.lagAngleDeg5 = 180 - crossCorrectionAngle(p.c7, hand, p.clubHead);
  }
  if (frame === 'frame6') metrics.lagAngleDeg6 = crossCorrectionAngle(p.c7, hand, p.clubHead);
  metrics.crossCorrected = true;
}

function getCrossCorrectionScenario() {
  try {
    return get2dVirtualCorrectionScenario(getCrossCorrectionModel());
  } catch (error) {
    console.error('Cross correction failed', error);
    return { unavailable: getSwingUiText(`교차 보정 보류: ${error.message}`, `Cross correction withheld: ${error.message}`) };
  }
}

function validateCrossCorrectionData(data) {
  if (!data || typeof data !== 'object' || !data.references || !data.entries || !data.sources
    || Array.isArray(data.entries) || Array.isArray(data.references) || Array.isArray(data.sources)
    || Object.keys(data.entries).length > 12
    || Object.keys(data.references).some(key => !['front', 'side'].includes(key))
    || Object.keys(data.sources).some(key => !['front', 'side'].includes(key))
    || Object.values(data.sources).some(value => typeof value !== 'string' || value.length > 1024)) return false;
  const modern = data.version === 2;
  if (data.version != null && !modern) return false;
  if (modern && (Object.keys(data.entries).length > 4
    || (data.analysisSignature != null && (typeof data.analysisSignature !== 'string' || data.analysisSignature.length > 500000)))) return false;
  for (const reference of Object.values(data.references)) {
    if (!reference || !Number.isFinite(reference.aspect) || reference.aspect <= 0
      || (modern && (!Number.isFinite(reference.time) || reference.time < 0))
      || !Array.isArray(reference.points) || reference.points.length > 2 || !reference.points.every(isProjectCoordinate)) return false;
  }
  return Object.entries(data.entries).every(([key, entry]) => {
    const [frame, panel, extra] = key.split(':');
    if (modern ? !CROSS_CORRECTION_PHASES.includes(key)
      : extra !== undefined || !ANALYSIS_FRAME_IDS.includes(frame) || !['front', 'side'].includes(panel)) return false;
    const types = modern ? CROSS_CORRECTION_POINTS[key] : getCrossCorrectionTypes(frame, panel);
    return entry && (modern || typeof entry.signature === 'string' && entry.signature.length < 20000)
      && [entry.frontTime, entry.sideTime].every(value => Number.isFinite(value) && value >= 0)
      && [entry.frontAspect, entry.sideAspect].every(value => Number.isFinite(value) && value > 0)
      && ['frontPoints', 'sidePoints'].every(field => Array.isArray(entry[field])
        && entry[field].length === types.length
        && new Set(entry[field].map(point => point?.type)).size === types.length
        && entry[field].every(point => isProjectCoordinate(point) && types.includes(point.type)));
  });
}

(function setupCrossCorrectionInput() {
  const el = id => document.getElementById(`crossCorrection${id}`);
  const text = getSwingUiText;
  const videos = { front: el('FrontVideo'), side: el('SideVideo') };
  const canvases = { front: el('FrontCanvas'), side: el('SideCanvas') };
  const urls = { front: null, side: null };
  const loadedSources = { front: null, side: null };
  const manualSources = { front: false, side: false };
  for (const video of Object.values(videos)) video.muted = true;
  const activeSources = () => Object.fromEntries(Object.entries(loadedSources).filter(([, value]) => value !== null));
  let referenceMode = false;
  let draft = { front: [], side: [] };
  const selector = el('Frame');
  for (const [index, phase] of CROSS_CORRECTION_PHASES.entries()) {
      const option = document.createElement('option');
      option.value = phase;
      option.textContent = `${index + 1}. ${phase} · ${{
        P1: text('어드레스', 'Address'), P4: text('백스윙 탑', 'Backswing top'),
        P6: text('다운스윙 (샤프트 수평)', 'Downswing (shaft horizontal)'), P7: text('임팩트', 'Impact'),
      }[phase]}`;
      selector.append(option);
  }
  const selected = () => selector.value;
  const analysisTimes = () => ({
    P1: frameStateHistory.front.frame1?.videoTime,
    P4: frameStateHistory.side.frame1?.videoTime,
    P6: frameStateHistory.front.frame6?.videoTime ?? frameStateHistory.side.frame2?.videoTime,
    P7: frameStateHistory.side.frame6?.videoTime ?? frameStateHistory.side.frame4?.videoTime,
  });
  const pointLabels = {
    c7: ['C7 (목 뒤 돌출뼈의 같은 위치)', 'C7 (same neck landmark)'],
    rightShoulder: ['오른쪽 어깨', 'Right shoulder'], leftShoulder: ['왼쪽 어깨', 'Left shoulder'],
    pelvis: ['골반 중심 (가려지면 추정점으로 대체하지 마세요)', 'Pelvis center (do not substitute an occluded point)'],
    handMid: ['양손 중심', 'Hand center'], clubHead: ['클럽헤드', 'Clubhead'], leftWrist: ['왼쪽 손목', 'Left wrist'],
  };
  function loadSource(view, file, automatic = false) {
    const identity = getVideoFileIdentity(file);
    if (automatic && loadedSources[view] === identity
      && crossViewCorrectionData.version === 2 && crossViewCorrectionData.sources[view] === identity) return;
    if (urls[view]) URL.revokeObjectURL(urls[view]);
    if (crossViewCorrectionData.version !== 2 || crossViewCorrectionData.sources[view] !== identity) {
      crossViewCorrectionData = { version: 2, references: {}, entries: {}, sources: { ...activeSources(), [view]: identity } };
      draft = { front: [], side: [] };
    }
    urls[view] = URL.createObjectURL(file);
    loadedSources[view] = identity;
    manualSources[view] = !automatic;
    videos[view].src = urls[view];
    videos[view].load();
    crossViewCorrectionData.sources[view] = identity;
    const prefix = view === 'front' ? 'Front' : 'Side';
    el(`${prefix}Source`).textContent = automatic
      ? text(`${view === 'front' ? '2번 정면' : '1번 측면'} 자동 연결: ${file.name}`,
        `Auto-linked step ${view === 'front' ? '2 front' : '1 side'}: ${file.name}`)
      : text(`선택한 영상: ${file.name}`, `Selected video: ${file.name}`);
    crossCorrectionMode = 'roll';
    update2dCorrectionDiagnostics();
    notice();
    if (view === 'front' && identity !== videoFileIdentity.front) {
      el('Status').textContent = text('정면 영상은 열었습니다. 기존 점수와 비교하려면 2번 분석에 사용한 정면 원본을 선택하세요.',
        'Front video loaded. To compare scores, select the front source used in step 2.');
    }
  }
  function syncAnalysisSources() {
    const files = getCrossCorrectionSourceFiles();
    for (const view of ['front', 'side']) {
      if (files[view] && !manualSources[view]) loadSource(view, files[view], true);
      if (!files[view] && !loadedSources[view]) {
        el(`${view === 'front' ? 'Front' : 'Side'}Source`).textContent = text(
          '연결할 원본이 없습니다. 파일을 선택하세요.', 'Original source unavailable. Select a file.');
      }
    }
  }
  function draw(view) {
    const canvas = canvases[view], video = videos[view];
    const width = video.clientWidth, height = video.clientHeight;
    canvas.width = width || 480;
    canvas.height = Math.max(1, height);
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    const list = referenceMode ? crossViewCorrectionData.references[view]?.points || [] : draft[view];
    ctx.fillStyle = '#ffdf40';
    ctx.strokeStyle = '#ffdf40';
    ctx.font = 'bold 13px sans-serif';
    if (referenceMode && list.length === 2) {
      ctx.beginPath();
      ctx.moveTo(list[0].x * width, list[0].y * height);
      ctx.lineTo(list[1].x * width, list[1].y * height);
      ctx.stroke();
    }
    list.forEach((point, index) => {
      ctx.beginPath(); ctx.arc(point.x * width, point.y * height, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillText(String(index + 1), point.x * width + 7, point.y * height - 7);
    });
  }
  function notice() {
    if (crossViewCorrectionData.version !== 2) {
      el('Status').textContent = text('이전 12쌍 입력 대신 네 모션을 사용합니다. 정면·측면 파일을 선택해 새로 시작하세요.',
        'The four-motion workflow replaces the old 12 pairs. Select both video files to start again.');
      draw('front'); draw('side');
      return;
    }
    const phase = selected(), types = CROSS_CORRECTION_POINTS[phase];
    el('Status').textContent = referenceMode
      ? text('P1 어드레스에서 정면·측면 각각 머리끝 → 턱끝을 클릭하세요. 완료 후 ‘공통 포인트 다시 지정’을 누르세요.',
        'At P1 address, mark head top then chin in each view. Then choose Remark Common Points.')
        + '\n' + ['front', 'side'].map(view => `${view === 'front' ? text('정면', 'Front') : text('측면', 'Side')}: ${crossViewCorrectionData.references[view]?.points.length || 0}/2`).join(' · ')
      : ['front', 'side'].map(view => {
        const index = draft[view].length;
        return `${view === 'front' ? text('정면', 'Front') : text('측면', 'Side')} ${index}/${types.length}: ${index < types.length
          ? text(...pointLabels[types[index]]) : text('모션 저장 준비 완료', 'Ready to save motion')}`;
      }).join('\n') + `\n${text('저장한 모션', 'Saved motions')}: ${CROSS_CORRECTION_PHASES.filter(phase => crossViewCorrectionData.entries[phase]).join(' · ') || '—'} (${Object.keys(crossViewCorrectionData.entries).length}/4)`;
    draw('front'); draw('side');
  }
  function loadFrame() {
    referenceMode = false;
    const phase = selected(), saved = crossViewCorrectionData.entries[phase];
    draft = { front: [], side: [] };
    for (const view of ['front', 'side']) {
      if (!loadedSources[view]) continue;
      const time = saved?.[`${view}Time`] ?? (view === 'front' ? analysisTimes()[phase] : null);
      if (Number.isFinite(time) && videos[view].readyState >= 1) {
        videos[view].pause();
        if (Math.abs(videos[view].currentTime - time) > 0.002) videos[view].currentTime = time;
        else if (saved) draft[view] = structuredClone(saved[`${view}Points`]);
      }
    }
    notice();
  }
  for (const view of ['front', 'side']) {
    canvases[view].addEventListener('click', event => {
      const video = videos[view];
      if (video.readyState < 1) { el('Status').textContent = text('영상 업로드를 먼저 완료하세요.', 'Load the video first.'); return; }
      if (video.seeking) { el('Status').textContent = text('영상 이동이 끝난 뒤 점을 선택하세요.', 'Wait for seeking to finish before marking points.'); return; }
      video.pause();
      const rect = canvases[view].getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / video.clientHeight;
      const point = { x, y };
      if (!isProjectCoordinate(point)) return;
      if (referenceMode) {
        if (Math.abs((crossViewCorrectionData.references[view]?.time ?? video.currentTime) - video.currentTime) > 0.002) {
          crossViewCorrectionData.references[view] = null;
        }
        const reference = crossViewCorrectionData.references[view] || { points: [], aspect: getAnalysisAspect(video), time: video.currentTime };
        if (reference.points.length === 2) reference.points = [];
        reference.points.push(point);
        crossViewCorrectionData.references[view] = reference;
      } else {
        const types = CROSS_CORRECTION_POINTS[selected()];
        if (draft[view].length >= types.length) return;
        draft[view].push({ ...point, type: types[draft[view].length] });
      }
      if (crossCorrectionMode === 'cross') update2dCorrectionDiagnostics();
      notice();
    });
    videos[view].addEventListener('seeked', () => {
      if (!referenceMode) {
        const saved = crossViewCorrectionData.entries[selected()];
        draft[view] = saved && Math.abs(videos[view].currentTime - saved[`${view}Time`]) <= 0.002
          ? structuredClone(saved[`${view}Points`]) : [];
      }
      notice();
    });
    videos[view].addEventListener('play', () => { draft[view] = []; notice(); });
    videos[view].addEventListener('loadedmetadata', () => {
      if (!videos[view].videoWidth || !videos[view].videoHeight) {
        videos[view].pause();
        el('Status').textContent = text(
          '영상 화면을 읽을 수 없습니다. 영상 트랙과 코덱을 확인하거나 H.264 MP4로 변환해 다시 선택하세요.',
          'No video dimensions decoded. Check the video track/codec or convert to H.264 MP4 and select it again.');
        return;
      }
      loadFrame();
    });
    const prefix = view === 'front' ? 'Front' : 'Side';
    el(`${prefix}Play`).addEventListener('click', async () => {
      const video = videos[view];
      if (video.readyState < 1) { el('Status').textContent = text('원본 영상을 먼저 불러오세요.', 'Load the source video first.'); return; }
      if (!video.paused) video.pause();
      else {
        try { await video.play(); }
        catch (error) {
          console.error('Cross-correction video playback failed', error);
          el('Status').textContent = text(`영상 재생 실패: ${error.message}`, `Video playback failed: ${error.message}`);
        }
      }
    });
    el(`${prefix}Time`).addEventListener('change', event => {
      const time = Number(event.target.value), video = videos[view];
      if (event.target.value === '' || !Number.isFinite(time) || time < 0
        || !Number.isFinite(video.duration) || time > video.duration) {
        el('Status').textContent = text('영상 길이 안의 유효한 시점(초)을 입력하세요.', 'Enter a valid time within the video duration.');
        return;
      }
      video.pause();
      video.currentTime = time;
    });
    videos[view].addEventListener('timeupdate', () => {
      if (!videos[view].paused) draft[view] = [];
      const input = el(`${prefix}Time`);
      if (document.activeElement !== input) input.value = videos[view].currentTime.toFixed(3);
    });
    for (const [direction, offset] of [['Prev', -1 / 30], ['Next', 1 / 30]]) {
      el(`${prefix}${direction}`).addEventListener('click', () => {
        const video = videos[view];
        if (!Number.isFinite(video.duration)) {
          el('Status').textContent = text('영상을 먼저 불러오세요.', 'Load the video first.');
          return;
        }
        video.pause();
        video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + offset));
      });
    }
    videos[view].addEventListener('error', () => {
      console.error('Cross-correction video load failed', view, videos[view].error);
      el('Status').textContent = text('영상 로드 실패: 지원되는 MP4/WebM 파일인지 확인하세요.', 'Video load failed. Check that the MP4/WebM codec is supported.');
    });
    el(`${prefix}File`).addEventListener('change', event => {
      const file = event.target.files[0];
      if (!file) return;
      loadSource(view, file);
    });
  }
  selector.addEventListener('change', loadFrame);
  el('Setup').addEventListener('toggle', () => {
    if (el('Setup').open) { syncAnalysisSources(); loadFrame(); }
  });
  el('Reference').addEventListener('click', () => {
    selector.value = 'P1'; loadFrame();
    videos.front.pause(); videos.side.pause();
    referenceMode = true; notice();
  });
  el('Points').addEventListener('click', () => { referenceMode = false; draft = { front: [], side: [] }; notice(); });
  el('Capture').addEventListener('click', () => {
    const phase = selected(), types = CROSS_CORRECTION_POINTS[phase];
    if (referenceMode || ['front', 'side'].some(view => !loadedSources[view] || videos[view].readyState < 2
      || videos[view].seeking || !videos[view].paused || loadedSources[view] !== crossViewCorrectionData.sources[view]
      || draft[view].length !== types.length)) {
      el('Status').textContent = text('양 영상을 불러와 같은 모션에 정지하고 양쪽 안내점을 모두 선택하세요.', 'Load and pause both videos at the same motion and mark all prompted landmarks.');
      return;
    }
    if (phase === 'P1') {
      try {
        for (const view of ['front', 'side']) {
          getCrossCorrectionCalibration(crossViewCorrectionData.references[view]);
          if (Math.abs(crossViewCorrectionData.references[view].time - videos[view].currentTime) > 0.002) {
            crossCorrectionError('머리–턱 기준을 지정한 P1 시점에서 저장하세요.', 'Save P1 at its head-to-chin reference time.');
          }
        }
      } catch (error) {
        el('Status').textContent = error.message;
        return;
      }
    }
    const signature = getCrossCorrectionAnalysisSignature();
    if (crossViewCorrectionData.analysisSignature && crossViewCorrectionData.analysisSignature !== signature) {
      crossViewCorrectionData.entries = {};
    }
    crossViewCorrectionData.analysisSignature = signature;
    crossViewCorrectionData.entries[phase] = {
      frontPoints: structuredClone(draft.front), sidePoints: structuredClone(draft.side),
      frontTime: videos.front.currentTime, sideTime: videos.side.currentTime,
      frontAspect: getAnalysisAspect(videos.front), sideAspect: getAnalysisAspect(videos.side),
    };
    crossCorrectionMode = 'roll';
    update2dCorrectionDiagnostics();
    const next = CROSS_CORRECTION_PHASES[CROSS_CORRECTION_PHASES.indexOf(phase) + 1];
    if (next) { selector.value = next; loadFrame(); } else notice();
  });
  el('Calculate').addEventListener('click', () => {
    crossCorrectionMode = 'cross';
    update2dCorrectionDiagnostics();
    document.getElementById('analysis2dDiagnosticsResults').scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
  el('RollOnly').addEventListener('click', () => { crossCorrectionMode = 'roll'; update2dCorrectionDiagnostics(); });
  el('Clear').addEventListener('click', () => {
    if (!confirm(text('교차 보정 입력을 초기화할까요? 기존 분석은 유지합니다.', 'Reset cross-correction inputs? Existing analysis will be preserved.'))) return;
    crossViewCorrectionData = { version: 2, references: {}, entries: {}, sources: activeSources() };
    crossCorrectionMode = 'roll';
    draft = { front: [], side: [] };
    update2dCorrectionDiagnostics(); notice();
  });
  window.addEventListener('resize', () => { draw('front'); draw('side'); });
}());
