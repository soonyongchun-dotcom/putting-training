'use strict';

var crossCorrectionMode = 'roll';
var crossViewCorrectionData = { version: 2, workflow: 'frame-pairs', references: {}, entries: {}, backswingEntries: {}, sources: {} };

var CROSS_CORRECTION_FRAMES = ['frame1', 'frame2', 'frame3', 'frame4', 'frame5', 'frame6'];
var CROSS_CORRECTION_POINTS = {
  frame1: {
    front: ['wrist', 'club', 'shoulder', 'pelvis', 'handMid', 'clubHead'],
    side: ['wrist', 'club', 'shoulder', 'pelvis', 'handMid', 'clubHead'],
  },
  frame2: { front: ['handMid', 'club', 'shoulder', 'pelvis', 'c7'], side: ['handMid', 'club', 'shoulder', 'pelvis', 'c7'] },
  frame3: {
    front: ['wrist', 'club', 'shoulder', 'pelvis', 'pelvisCenter', 'clubHead', 'handMid'],
    side: ['wrist', 'club', 'shoulder', 'pelvis', 'pelvisCenter', 'clubHead', 'handMid'],
  },
  frame4: {
    front: ['wrist', 'club', 'shoulder', 'pelvis', 'pelvisCenter', 'handMid'],
    side: ['wrist', 'club', 'shoulder', 'pelvis', 'pelvisCenter', 'handMid'],
  },
  frame5: { front: ['handMid', 'c7', 'pelvis', 'clubHead'], side: ['handMid', 'c7', 'pelvis', 'clubHead'] },
  frame6: { front: ['c7', 'pelvis', 'handMid', 'clubHead'], side: ['c7', 'pelvis', 'handMid', 'clubHead'] },
};
var CROSS_CORRECTION_BACKSWING_PHASES = ['address', 'p1', 'p2', 'p3', 'p4', 'top', 'transition', 'downP6'];
var CROSS_CORRECTION_BACKSWING_POINTS = {
  address: ['ball', 'addressHand', 'elbow'],
  p1: ['handMid', 'clubHead'],
  p2: ['handMid', 'clubHead'],
  p3: ['handMid', 'clubHead'],
  p4: ['handMid', 'clubHead'],
  top: ['c7', 'handMid', 'clubHead'],
  transition: ['handMid', 'clubHead'],
  downP6: ['handMid', 'clubHead'],
};
var CROSS_CORRECTION_LEGACY_PHASES = ['P1', 'P4', 'P6', 'P7'];
var CROSS_CORRECTION_LEGACY_POINTS = {
  P1: ['c7', 'rightShoulder', 'leftShoulder', 'pelvis', 'handMid', 'clubHead'],
  P4: ['c7', 'rightShoulder', 'leftShoulder', 'pelvis', 'handMid', 'clubHead'],
  P6: ['c7', 'rightShoulder', 'pelvis', 'handMid', 'clubHead'],
  P7: ['c7', 'leftShoulder', 'leftWrist', 'pelvis', 'handMid', 'clubHead'],
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
    || !Array.isArray(reference.shaftPoints) || reference.shaftPoints.length !== 2
    || !Array.isArray(reference.stancePoints) || reference.stancePoints.length !== 2) {
    crossCorrectionError('교차 보정 영상에서 수평에 가까운 지면 기준선과 샤프트 양 끝점을 선택하고 저장하세요.',
      'Mark a near-horizontal ground line and both shaft endpoints in each correction video, then save the references.');
  }
  const [grip, clubHead] = reference.shaftPoints;
  if (!isProjectCoordinate(grip) || !isProjectCoordinate(clubHead)
    || !reference.stancePoints.every(isProjectCoordinate)) {
    crossCorrectionError('유효한 양발/지면 기준선과 샤프트 양 끝점을 선택하세요.',
      'Mark valid stance/ground-line points and shaft endpoints.');
  }
  const dx = (grip.x - clubHead.x) * reference.aspect, dy = grip.y - clubHead.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 0.02) {
    crossCorrectionError('샤프트 기준길이가 너무 짧습니다. 그립 끝과 클럽헤드를 다시 선택하세요.',
      'The shaft reference is too short. Re-mark the grip end and clubhead.');
  }
  return { bottom: clubHead, length, ux: 0, uy: -1, aspect: reference.aspect };
}

function getCrossCorrectionModel() {
  const data = crossViewCorrectionData;
  if (!validateCrossCorrectionData(data)) crossCorrectionError('교차 보정 입력 형식이 올바르지 않습니다.', 'Invalid cross-correction inputs.');
  if (data.version !== 2 || data.workflow !== 'frame-pairs') {
    crossCorrectionError('F1–F6 분석 프레임의 정면·측면 대응점을 다시 지정하세요.',
      'Re-enter matched front and side landmarks for F1–F6.');
  }
  if (!areVideoSourcesSame() || !data.sources.front || data.sources.front !== videoFileIdentity.front
    || !data.sources.side || data.sources.side === data.sources.front) {
    crossCorrectionError('2번 분석과 같은 정면 원본과 별도 측면 영상을 이 화면에 불러오세요.', 'Load the step 2 front source and a separate side video in this panel.');
  }
  if (data.analysisSignature !== getCrossCorrectionAnalysisSignature()) {
    crossCorrectionError('기존 분석이 변경되었습니다. F1–F6 대응점을 확인하고 다시 저장하세요.',
      'The original analysis changed. Recheck and save the F1–F6 pairs.');
  }
  if (data.calibration !== 'shaft-ground-v1') {
    crossCorrectionError('기존 머리–턱 기준은 더 이상 사용하지 않습니다. 보정 패널에서 양발/지면 기준선과 샤프트 양 끝점을 다시 선택하세요.',
      'The old head-to-chin reference is no longer used. Re-mark the stance/ground line and shaft endpoints in the correction panel.');
  }
  const calibrations = {};
  for (const view of ['front', 'side']) {
    const calibration = getCrossCorrectionCalibration(data.references[view]);
    const [start, end] = data.references[view].stancePoints;
    const angle = getStanceCorrectionAngle({ start, end }, calibration.aspect);
    if (Math.abs(angle) > Math.PI / 6) {
      const degrees = (Math.abs(angle) * 180 / Math.PI).toFixed(1);
      crossCorrectionError(`${view === 'front' ? '정면' : '측면'} 지면 기준선 기울기가 ${degrees}°입니다(허용 ±30°). 바닥의 수평에 가까운 두 점을 다시 선택하세요.`,
        `${view === 'front' ? 'Front' : 'Side'} ground reference tilt is ${degrees}° (allowed: ±30°). Re-mark two points along a near-horizontal floor line.`);
    }
    calibration.ux = Math.sin(angle);
    calibration.uy = -Math.cos(angle);
    calibrations[view] = calibration;
  }
  const front = calibrations.front, side = calibrations.side;
  for (const frame of CROSS_CORRECTION_FRAMES) {
    if (!data.entries[frame]) crossCorrectionError(
      `${frame.replace('frame', 'F')}: 대응점이 저장되지 않았습니다. 해당 프레임 점을 선택한 뒤 ‘정면·측면 프레임 저장’을 누르세요.`,
      `${frame.replace('frame', 'F')}: landmarks have not been saved. Mark the points, then click “Save matched front/side frame”.`);
  }
  const model = { correctedFrames: [], retainedFrames: [], retainedDetails: {} };
  const project = (point, calibration) => {
    if (!isProjectCoordinate(point)) crossCorrectionError('유효하지 않은 공통 포인트 좌표입니다.', 'Invalid common-landmark coordinates.');
    const dx = (point.x - calibration.bottom.x) * calibration.aspect;
    const dy = point.y - calibration.bottom.y;
    return { horizontal: (dx * -calibration.uy + dy * calibration.ux) / calibration.length,
      vertical: (dx * calibration.ux + dy * calibration.uy) / calibration.length };
  };
  for (const frame of CROSS_CORRECTION_FRAMES) {
    const entry = data.entries[frame];
    if (Math.abs(entry.frontAspect - front.aspect) > 0.001 || Math.abs(entry.sideAspect - side.aspect) > 0.001) {
      crossCorrectionError(`${frame.replace('frame', 'F')}: 기준 지정 후 영상 비율이 변경되었습니다.`, `${frame.replace('frame', 'F')}: video aspect changed after calibration.`);
    }
    const missingByView = {};
    for (const view of ['front', 'side']) {
      const required = CROSS_CORRECTION_POINTS[frame][view];
      const points = entry[`${view}Points`];
      missingByView[view] = required.filter(type => !points.some(point => point.type === type));
    }
    if (missingByView.front.length || missingByView.side.length) {
      model.retainedFrames.push(frame);
      model.retainedDetails[frame] = missingByView;
      continue;
    }
    const types = CROSS_CORRECTION_POINTS[frame].front.filter(type => CROSS_CORRECTION_POINTS[frame].side.includes(type));
    const points = {};
    for (const type of types) {
      const a = entry.frontPoints.find(point => point.type === type);
      const b = entry.sidePoints.find(point => point.type === type);
      if (!a || !b) crossCorrectionError(`${frame.replace('frame', 'F')} ${type}: 양쪽 공통 포인트를 지정하세요.`, `${frame.replace('frame', 'F')} ${type}: mark the common landmark in both videos.`);
      const pa = project(a, front), pb = project(b, side);
      points[type] = { x: pa.horizontal, y: (pa.vertical + pb.vertical) / 2, z: pb.horizontal };
    }
    model[frame] = {};
    for (const [index, panel] of ['front', 'side'].entries()) {
      const p = { ...points };
      const aliases = frame === 'frame1'
        ? { c7: p.wrist }
        : frame === 'frame3' ? { hip: p.wrist, knee: p.club, ankle: p.shoulder, c7: p.pelvis }
        : frame === 'frame4' ? { c7: p.wrist, pelvisCenter: p.pelvisCenter, clubHead: p.pelvis, leftShoulder: p.club, leftWrist: p.shoulder }
        : {};
      model[frame][panel] = { points: { ...p, ...aliases }, scale: front.length, headScale: true };
    }
    model.correctedFrames.push(frame);
  }
  return model;
}

function applyCrossCorrectionMetrics(metrics, model, frame, panel) {
  if (!model[frame]?.[panel]) return;
  const entry = model[frame][panel], p = entry.points, scale = entry.scale;
  const distance = (a, b) => crossCorrectionLength(crossCorrectionVector(a, b));
  const core = ['frame3', 'frame4'].includes(frame) ? p.pelvisCenter : p.pelvis;
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
  if (frame === 'frame1') {
    if (p.wrist && p.pelvis) {
      metrics.spineAngleDeg = Math.atan2(Math.hypot(p.pelvis.x - p.wrist.x, p.pelvis.z - p.wrist.z),
        Math.abs(p.pelvis.y - p.wrist.y)) * 180 / Math.PI;
      metrics.c7NormX = p.wrist.x;
      metrics.c7NormY = p.wrist.y;
      metrics.pelvisNormX = p.pelvis.x;
    }
    if (p.club && p.shoulder) {
      const dx = p.shoulder.x - p.club.x, dy = p.shoulder.y - p.club.y, dz = p.shoulder.z - p.club.z;
      const shoulderWidth = Math.hypot(dx, dz);
      metrics.xFactorDeg = -Math.atan2(dy, shoulderWidth) * 180 / Math.PI;
      metrics.shoulderHorzWidth = Math.hypot(dx, dz);
      metrics.shoulderVertDiff = Math.abs(dy);
      metrics.shoulderTotalDist = distance(p.club, p.shoulder);
    }
    if (p.topHandMid && p.clubHeadTop) metrics.topShaftAngleDeg = Math.atan2(
      p.topHandMid.y - p.clubHeadTop.y, Math.abs(p.topHandMid.z - p.clubHeadTop.z)) * 180 / Math.PI;
  }
  if (frame === 'frame2') {
    metrics.laggingAngleDeg = crossCorrectionAngle(p.shoulder, hand, p.club);
    metrics.torsoRefDist = distance(p.shoulder, p.pelvis) * scale;
    metrics.pelvisNormX = p.pelvis.x;
    metrics.c7NormX2 = p.c7.x;
  }
  if (frame === 'frame3' && p.hip && p.knee && p.ankle) {
    metrics.kneeExtensionDeg = crossCorrectionAngle(p.hip, p.knee, p.ankle);
    const legLength = distance(p.hip, p.ankle);
    metrics.leadLegBraceRatio = legLength > 0.0005
      ? Math.hypot(p.knee.x - p.ankle.x, p.knee.z - p.ankle.z) / legLength : null;
    metrics.hipNormY = p.hip.y;
    metrics.c7NormX = p.pelvis.x;
    metrics.c7NormY = p.pelvis.y;
    const bodyLength = distance(p.ankle, p.pelvis);
    metrics.bodyLength = bodyLength > 0.0005 ? bodyLength : null;
  }
  if (frame === 'frame4' && p.club && p.shoulder && p.pelvis) {
    metrics.armShaftAngleDeg = crossCorrectionAngle(p.club, p.shoulder, p.pelvis);
    metrics.armShaftMissingReason = null;
    metrics.lateralLeanAngle = Math.atan2(p.club.x - p.wrist.x, Math.abs(p.club.y - p.wrist.y)) * 180 / Math.PI;
    metrics.c7NormX = p.wrist.x;
    metrics.c7NormY = p.wrist.y;
    metrics.pelvisCenterNormX = p.pelvisCenter.x;
  }
  if (frame === 'frame5') {
    const spine = crossCorrectionVector(p.c7, p.pelvis);
    const spineLength = crossCorrectionLength(spine);
    if (spineLength > 0.0005) {
      const unit = { x: spine.x / spineLength, y: spine.y / spineLength, z: spine.z / spineLength };
      const handOffset = crossCorrectionVector(p.c7, hand);
      const along = handOffset.x * unit.x + handOffset.y * unit.y + handOffset.z * unit.z;
      const handDistance = crossCorrectionLength(handOffset);
      const cross = handOffset.x * unit.y - handOffset.y * unit.x;
      metrics.spineLen5 = spineLength * scale;
      metrics.handAlongRatio = along / spineLength;
      metrics.handOffsetRatio = Math.sign(cross || handOffset.z * unit.y) *
        Math.sqrt(Math.max(0, handDistance ** 2 - along ** 2)) / spineLength;
      metrics.spineAngleDeg5 = Math.atan2(Math.hypot(spine.x, spine.z), Math.abs(spine.y)) * 180 / Math.PI;
      metrics.handX = hand.x * scale;
      metrics.handY = hand.y * scale;
      metrics.c7X = p.c7.x * scale;
      metrics.c7Y = p.c7.y * scale;
      metrics.pelvisX = p.pelvis.x * scale;
      metrics.pelvisY = p.pelvis.y * scale;
    }
    if (hand && p.clubHead) metrics.shaftAngleDeg = Math.atan2(
      Math.abs(p.clubHead.y - hand.y),
      Math.hypot(p.clubHead.x - hand.x, p.clubHead.z - hand.z)) * 180 / Math.PI;
    metrics.lagAngleDeg5 = 180 - crossCorrectionAngle(p.c7, hand, p.clubHead);
  }
  if (frame === 'frame6') {
    metrics.lagAngleDeg6 = crossCorrectionAngle(p.c7, hand, p.clubHead);
    metrics.c7NormX6 = p.c7.x;
    metrics.comNormX6 = p.pelvis.x;
    metrics.sideBendDeg6 = Math.atan2(
      Math.hypot(p.pelvis.x - p.c7.x, p.pelvis.z - p.c7.z),
      Math.abs(p.pelvis.y - p.c7.y)) * 180 / Math.PI;
  }
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
    || (data.backswingEntries != null && (!data.backswingEntries || typeof data.backswingEntries !== 'object' || Array.isArray(data.backswingEntries)))
    || Object.keys(data.entries).length > 12
    || Object.keys(data.references).some(key => !['front', 'side'].includes(key))
    || Object.keys(data.sources).some(key => !['front', 'side'].includes(key))
    || Object.values(data.sources).some(value => typeof value !== 'string' || value.length > 1024)) return false;
  const modern = data.version === 2;
  if (data.version != null && !modern) return false;
  const framePairs = modern && data.workflow === 'frame-pairs';
  if (modern && data.workflow != null && !framePairs) return false;
  if (modern && (Object.keys(data.entries).length > (framePairs ? 6 : 4)
    || Object.keys(data.backswingEntries || {}).length > (framePairs ? 8 : 0)
    || (data.analysisSignature != null && (typeof data.analysisSignature !== 'string' || data.analysisSignature.length > 500000))
    || (data.calibration != null && data.calibration !== 'shaft-ground-v1'))) return false;
  for (const reference of Object.values(data.references)) {
    if (!reference || !Number.isFinite(reference.aspect) || reference.aspect <= 0
      || (modern && (!Number.isFinite(reference.time) || reference.time < 0))
      || (reference.points != null && (!Array.isArray(reference.points) || reference.points.length > 2
        || !reference.points.every(isProjectCoordinate)))
      || (reference.shaftPoints != null && (!Array.isArray(reference.shaftPoints) || reference.shaftPoints.length > 2
        || !reference.shaftPoints.every(isProjectCoordinate)))
      || (reference.stancePoints != null && (!Array.isArray(reference.stancePoints) || reference.stancePoints.length > 2
        || !reference.stancePoints.every(isProjectCoordinate)))) return false;
  }
  const validEntry = (entry, types) => entry
    && [entry.frontTime, entry.sideTime].every(value => Number.isFinite(value) && value >= 0)
    && [entry.frontAspect, entry.sideAspect].every(value => Number.isFinite(value) && value > 0)
    && ['front', 'side'].every(view => {
      const field = `${view}Points`;
      const viewTypes = Array.isArray(types[view]) ? types[view] : types;
      return Array.isArray(entry[field]) && (framePairs ? entry[field].length > 0 && entry[field].length <= viewTypes.length
        : entry[field].length === viewTypes.length)
        && new Set(entry[field].map(point => point?.type)).size === entry[field].length
        && entry[field].every(point => isProjectCoordinate(point) && viewTypes.includes(point.type));
    });
  const entriesValid = Object.entries(data.entries).every(([key, entry]) => {
    const [frame, panel, extra] = key.split(':');
    if (framePairs ? !CROSS_CORRECTION_FRAMES.includes(key)
      : modern ? !CROSS_CORRECTION_LEGACY_PHASES.includes(key)
      : extra !== undefined || !ANALYSIS_FRAME_IDS.includes(frame) || !['front', 'side'].includes(panel)) return false;
    const types = framePairs ? null : modern ? CROSS_CORRECTION_LEGACY_POINTS[key] : getCrossCorrectionTypes(frame, panel);
    return entry && (modern || typeof entry.signature === 'string' && entry.signature.length < 20000)
      && validEntry(entry, framePairs ? CROSS_CORRECTION_POINTS[key] : { front: types, side: types });
  });
  if (!entriesValid) return false;
  return !framePairs || Object.entries(data.backswingEntries || {}).every(([phase, entry]) =>
    CROSS_CORRECTION_BACKSWING_PHASES.includes(phase)
    && validEntry(entry, CROSS_CORRECTION_BACKSWING_POINTS[phase]));
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
  let referenceDraft = { front: { stancePoints: [], shaftPoints: [] }, side: { stancePoints: [], shaftPoints: [] } };
  let referenceDraftTimes = { front: null, side: null };
  let draft = { front: [], side: [] };
  const selector = el('Frame');
  const frameLabels = [
    ['정면 기준 동작에 측면 맞춤', 'Match side to front reference motion'],
    ['정면 기준 동작에 측면 맞춤', 'Match side to front reference motion'],
    ['정면 기준 동작에 측면 맞춤', 'Match side to front reference motion'],
    ['정면 기준 동작에 측면 맞춤', 'Match side to front reference motion'],
    ['정면 기준 동작에 측면 맞춤', 'Match side to front reference motion'],
    ['정면 기준 동작에 측면 맞춤', 'Match side to front reference motion'],
  ];
  for (const [index, frame] of CROSS_CORRECTION_FRAMES.entries()) {
      const option = document.createElement('option');
      option.value = frame;
      option.textContent = `F${index + 1} · ${text(...frameLabels[index])}`;
      selector.append(option);
  }
  const selected = () => selector.value;
  const pointLabels = {
    frame1: { wrist: ['C7 (목 뒤 돌출뼈)', 'C7 (same neck landmark)'], club: ['오른쪽 어깨', 'Right shoulder'],
      shoulder: ['왼쪽 어깨', 'Left shoulder'], pelvis: ['골반 중심', 'Pelvis center'],
      handMid: ['양손 중심', 'Hand center'], clubHead: ['클럽헤드', 'Clubhead'], clubHeadTop: ['탑 클럽헤드', 'Top clubhead'] },
    frame2: { handMid: ['양손 중심', 'Hand center'], club: ['클럽헤드', 'Clubhead'],
      shoulder: ['오른쪽 어깨', 'Right shoulder'], pelvis: ['골반 중심', 'Pelvis center'], c7: ['C7', 'C7'] },
    frame3: { wrist: ['왼쪽 골반', 'Left hip'], club: ['왼쪽 무릎', 'Left knee'],
      shoulder: ['왼쪽 발목', 'Left ankle'], pelvis: ['C7', 'C7'], pelvisCenter: ['골반 중심', 'Pelvis center'],
      clubHead: ['클럽헤드', 'Clubhead'], handMid: ['양손 중심', 'Hand center'] },
    frame4: { wrist: ['C7', 'C7'], club: ['왼쪽 어깨', 'Left shoulder'], shoulder: ['왼쪽 손목', 'Left wrist'],
      pelvis: ['클럽헤드', 'Clubhead'], pelvisCenter: ['골반 중심', 'Pelvis center'], handMid: ['양손 중심', 'Hand center'] },
    frame5: { handMid: ['양손 중심', 'Hand center'], c7: ['C7', 'C7'],
      pelvis: ['골반 중심', 'Pelvis center'], clubHead: ['클럽헤드', 'Clubhead'] },
    frame6: { c7: ['C7', 'C7'], pelvis: ['골반 중심', 'Pelvis center'],
      handMid: ['양손 중심', 'Hand center'], clubHead: ['클럽헤드', 'Clubhead'] },
    backswing: {
      ball: ['공/클럽헤드 위치', 'Ball / clubhead position'], addressHand: ['어드레스 손/그립', 'Address hand / grip'],
      elbow: ['오른 팔꿈치', 'Right elbow'], handMid: ['손/그립', 'Hand / grip'],
      clubHead: ['클럽헤드', 'Clubhead'], c7: ['탑 C7/어깨 기준점', 'Top C7 / shoulder reference'],
    },
  };
  const pointLabel = (key, type) => text(...(pointLabels[key][type] || [type, type]));
  const requiredTypes = (key, view) => CROSS_CORRECTION_POINTS[key][view];
  const pointSelectors = { front: el('FrontPointType'), side: el('SidePointType') };
  function updatePointSelectors() {
    const frame = selected();
    for (const view of ['front', 'side']) {
      const selector = pointSelectors[view];
      const previous = selector.value;
      selector.options.length = 0;
      for (const type of requiredTypes(frame, view)) {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = pointLabel(frame, type);
        selector.append(option);
      }
      selector.value = requiredTypes(frame, view).includes(previous) ? previous
        : requiredTypes(frame, view).find(type => !draft[view].some(point => point.type === type)) || '';
    }
  }
  function selectNextUnmarkedPoint(view) {
    const selector = pointSelectors[view];
    selector.value = requiredTypes(selected(), view).find(type => !draft[view].some(point => point.type === type)) || '';
  }
  const analysisSourceMatches = view => {
    const expected = view === 'front'
      ? [videoFileIdentity.front]
      : [videoFileIdentity.side, typeof backswingSourceIdentity === 'undefined' ? null : backswingSourceIdentity];
    return !expected.some(Boolean) || expected.includes(crossViewCorrectionData.sources[view]);
  };
  function restoreDraft(view, key) {
    const saved = crossViewCorrectionData.entries?.[key];
    const time = videos[view].currentTime;
    const required = requiredTypes(key, view);
    if (!analysisSourceMatches(view)) return [];
    if (saved && Math.abs(time - saved[`${view}Time`]) <= 0.002) return structuredClone(saved[`${view}Points`]);
    if (crossViewCorrectionData.sources[view] !== videoFileIdentity[view]) return [];
    const history = frameStateHistory[view]?.[key];
    if (!history || !Number.isFinite(history.videoTime) || Math.abs(time - history.videoTime) > 0.05
      || !Array.isArray(history.points)) return [];
    return required.map(type => history.points.find(point => point.type === type))
      .filter(point => point && isProjectCoordinate(point)).map(point => structuredClone(point));
  }
  function loadSource(view, file, automatic = false) {
    const identity = getVideoFileIdentity(file);
    if (automatic && loadedSources[view] === identity
      && crossViewCorrectionData.version === 2 && crossViewCorrectionData.workflow === 'frame-pairs'
      && crossViewCorrectionData.sources[view] === identity) return;
    if (urls[view]) URL.revokeObjectURL(urls[view]);
    if (crossViewCorrectionData.version !== 2 || crossViewCorrectionData.workflow !== 'frame-pairs'
      || crossViewCorrectionData.sources[view] !== identity) {
      crossViewCorrectionData = {
        version: 2, workflow: 'frame-pairs', references: {}, entries: {}, backswingEntries: {},
        sources: { ...activeSources(), [view]: identity },
      };
      if (view === 'front') stanceReferenceLineFront = null;
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
  window.syncCrossCorrectionAnalysisSources = syncAnalysisSources;
  function draw(view) {
    const canvas = canvases[view], video = videos[view];
    const width = video.clientWidth, height = video.clientHeight;
    canvas.width = width || 480;
    canvas.height = Math.max(1, height);
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    const list = referenceMode
      ? [...referenceDraft[view].stancePoints, ...referenceDraft[view].shaftPoints]
      : draft[view];
    ctx.fillStyle = '#ffdf40';
    ctx.strokeStyle = '#ffdf40';
    ctx.font = 'bold 13px sans-serif';
    if (referenceMode) {
      for (const pair of [referenceDraft[view].stancePoints, referenceDraft[view].shaftPoints]) {
        if (pair.length === 2) {
          ctx.beginPath();
          ctx.moveTo(pair[0].x * width, pair[0].y * height);
          ctx.lineTo(pair[1].x * width, pair[1].y * height);
          ctx.stroke();
        }
      }
    }
    list.forEach(point => {
      ctx.beginPath(); ctx.arc(point.x * width, point.y * height, 5, 0, Math.PI * 2); ctx.fill();
      const index = referenceMode ? list.indexOf(point) : requiredTypes(selected(), view).indexOf(point.type);
      ctx.fillText(String(index + 1), point.x * width + 7, point.y * height - 7);
    });
  }
  function notice() {
    updatePointSelectors();
    if (crossViewCorrectionData.version !== 2 || crossViewCorrectionData.workflow !== 'frame-pairs') {
      el('Status').textContent = text('저장된 이전 형식은 새 대응점으로 자동 변환할 수 없습니다. 영상을 다시 연결한 뒤 F1–F6을 선택하세요.',
        'The saved legacy inputs cannot be converted into matched landmarks. Reconnect both videos and mark F1–F6.');
      draw('front'); draw('side');
      return;
    }
    const frame = selected();
    el('Status').textContent = referenceMode
      ? text('보정용 프레임에서 양쪽 영상의 같은 동작을 맞춘 뒤, 각 영상에 바닥의 수평에 가까운 지면선 2점 → 샤프트의 그립 끝·클럽헤드 2점을 차례로 선택하고 기준을 저장하세요.',
        'Align both videos to the same swing action. In each, mark 2 points along a near-horizontal floor line, then 2 shaft endpoints (grip end and clubhead), and save the references.')
        + '\n' + ['front', 'side'].map(view => {
          const label = view === 'front' ? text('정면', 'Front') : text('측면', 'Side');
          const ref = referenceDraft[view];
          return `${label}: ${text('지면선 ', 'Ground ')}${ref.stancePoints.length}/2 · ${text('샤프트 ', 'Shaft ')}${ref.shaftPoints.length}/2 · ${videos[view].currentTime.toFixed(3)}s`;
        }).join(' | ')
      : ['front', 'side'].map(view => {
        const types = requiredTypes(frame, view);
        const missing = types.find(type => !draft[view].some(point => point.type === type));
        const count = types.filter(type => draft[view].some(point => point.type === type)).length;
        return `${view === 'front' ? text('정면', 'Front') : text('측면', 'Side')} ${count}/${types.length}: ${missing
          ? pointLabel(frame, missing) : text('필요 점 확인 완료', 'Required landmarks ready')}`;
      }).join('\n') + `\n${text('저장 입력', 'Saved inputs')}: ${
        CROSS_CORRECTION_FRAMES.map((item, index) => {
          const entry = crossViewCorrectionData.entries[item];
          if (!entry) return null;
          const complete = ['front', 'side'].every(view => requiredTypes(item, view)
            .every(type => entry[`${view}Points`]?.some(point => point.type === type)));
          return `F${index + 1}${complete ? '' : '*'}`;
        }).filter(Boolean).join(' · ') || '—'} (${Object.keys(crossViewCorrectionData.entries).length}/6; * ${text('일부 점만 저장', 'partial points saved')})\n${text('보정 기준', 'Calibration references')}: ${
          crossViewCorrectionData.calibration === 'shaft-ground-v1'
            ? `${text('저장 완료', 'Saved')} · ${['front', 'side'].map(view =>
              `${view === 'front' ? text('정면', 'Front') : text('측면', 'Side')} ${
                Number(crossViewCorrectionData.references?.[view]?.time).toFixed(3)}s${
                  Number.isFinite(getReferenceTiltDegrees(view))
                    ? ` (${getReferenceTiltDegrees(view).toFixed(1)}°)` : ''}`).join(' · ')}`
            : text('미지정', 'Not set')}`;
    draw('front'); draw('side');
  }
  function getReferenceTiltDegrees(view, reference = crossViewCorrectionData.references?.[view]) {
    if (!Array.isArray(reference?.stancePoints) || reference.stancePoints.length !== 2
      || !Number.isFinite(reference.aspect) || reference.aspect <= 0) return null;
    const [start, end] = reference.stancePoints;
    if (![start?.x, start?.y, end?.x, end?.y].every(Number.isFinite)
      || Math.hypot((end.x - start.x) * reference.aspect, end.y - start.y) <= 0.01 * reference.aspect) return null;
    return Math.abs(getStanceCorrectionAngle({ start, end }, reference.aspect)) * 180 / Math.PI;
  }
  function loadFrame() {
    referenceMode = false;
    const frame = selected(), saved = crossViewCorrectionData.entries?.[frame];
    draft = { front: [], side: [] };
    for (const view of ['front', 'side']) {
      if (!loadedSources[view]) continue;
      const historyTime = crossViewCorrectionData.sources[view] === videoFileIdentity[view]
        ? frameStateHistory[view]?.[frame]?.videoTime : null;
      const time = saved?.[`${view}Time`] ?? historyTime;
      if (Number.isFinite(time) && videos[view].readyState >= 1) {
        videos[view].pause();
        if (Math.abs(videos[view].currentTime - time) > 0.002) videos[view].currentTime = time;
        else draft[view] = restoreDraft(view, frame);
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
        if (referenceDraftTimes[view] == null
          || Math.abs(referenceDraftTimes[view] - video.currentTime) > 0.002) {
          referenceDraft[view] = { stancePoints: [], shaftPoints: [] };
          referenceDraftTimes[view] = video.currentTime;
        }
        const calibration = referenceDraft[view];
        const target = calibration.stancePoints.length < 2 ? calibration.stancePoints : calibration.shaftPoints;
        if (target.length < 2) target.push(point);
      } else {
        const type = pointSelectors[view].value;
        if (!type) {
          el('Status').textContent = text('찍을 점을 선택하세요. 가려진 점은 건너뛰고 보이는 점을 선택할 수 있습니다.',
            'Choose a landmark to mark. Skip occluded landmarks and select visible points.');
          return;
        }
        const index = draft[view].findIndex(savedPoint => savedPoint.type === type);
        if (index >= 0) draft[view][index] = { ...point, type };
        else draft[view].push({ ...point, type });
        selectNextUnmarkedPoint(view);
      }
      if (crossCorrectionMode === 'cross') update2dCorrectionDiagnostics();
      notice();
    });
    videos[view].addEventListener('seeked', () => {
      if (referenceMode) {
        referenceDraft[view] = { stancePoints: [], shaftPoints: [] };
        referenceDraftTimes[view] = videos[view].currentTime;
      } else {
        draft[view] = restoreDraft(view, selected());
      }
      notice();
    });
    videos[view].addEventListener('play', () => {
      draft[view] = [];
      if (referenceMode) {
        referenceDraft[view] = { stancePoints: [], shaftPoints: [] };
        referenceDraftTimes[view] = null;
      }
      notice();
    });
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
  for (const selector of Object.values(pointSelectors)) {
    selector.addEventListener('change', notice);
  }
  el('Setup').addEventListener('toggle', () => {
    if (el('Setup').open) {
      syncAnalysisSources();
      const signature = getCrossCorrectionAnalysisSignature();
      if (crossViewCorrectionData.analysisSignature && crossViewCorrectionData.analysisSignature !== signature) {
        crossViewCorrectionData.entries = {};
        crossViewCorrectionData.backswingEntries = {};
        crossViewCorrectionData.analysisSignature = signature;
        el('Status').textContent = text(
          '분석 프레임 자료가 변경되어 기존 F1–F6 대응점은 지웠습니다. 기준은 유지되며 각 프레임 점을 다시 저장하세요.',
          'Analysis frame data changed, so the saved F1–F6 pairs were cleared. Calibration is retained; save the points again for each frame.');
      }
      loadFrame();
    }
  });
  el('Reference').addEventListener('click', () => {
    selector.value = 'frame1';
    videos.front.pause(); videos.side.pause();
    const savedFrame = crossViewCorrectionData.entries?.frame1;
    const addressTimes = {
      front: savedFrame?.frontTime ?? frameStateHistory.front?.frame1?.videoTime,
      side: savedFrame?.sideTime ?? crossViewCorrectionData.references?.side?.time,
    };
    for (const view of ['front', 'side']) {
      const time = addressTimes[view];
      if (Number.isFinite(time) && videos[view].readyState >= 1
        && Math.abs(videos[view].currentTime - time) > 0.002) videos[view].currentTime = time;
    }
    referenceDraft = { front: { stancePoints: [], shaftPoints: [] }, side: { stancePoints: [], shaftPoints: [] } };
    referenceDraftTimes = { front: videos.front.currentTime, side: videos.side.currentTime };
    referenceMode = true;
    notice();
  });
  el('ReferenceSave').addEventListener('click', () => {
    if (!referenceMode || ['front', 'side'].some(view => !loadedSources[view]
      || videos[view].readyState < 2 || videos[view].seeking || !videos[view].paused
      || loadedSources[view] !== crossViewCorrectionData.sources[view]
      || referenceDraft[view].stancePoints.length !== 2 || referenceDraft[view].shaftPoints.length !== 2
      || !Number.isFinite(referenceDraftTimes[view])
      || Math.abs(referenceDraftTimes[view] - videos[view].currentTime) > 0.002)) {
      el('Status').textContent = text(
        '양쪽 영상에서 지면/양발선 2점과 샤프트의 그립 끝·클럽헤드 2점을 모두 선택한 뒤 저장하세요.',
        'Mark both ground/stance-line points and both shaft endpoints (grip end and clubhead) in each paused video, then save.');
      return;
    }
    for (const view of ['front', 'side']) {
      const angle = getStanceCorrectionAngle({
        start: referenceDraft[view].stancePoints[0], end: referenceDraft[view].stancePoints[1],
      }, getAnalysisAspect(videos[view]));
      if (Math.abs(angle) > Math.PI / 6) {
        const label = view === 'front' ? text('정면', 'Front') : text('측면', 'Side');
        el('Status').textContent = text(
          `${label} 지면 기준선 기울기 ${Math.abs(angle * 180 / Math.PI).toFixed(1)}°입니다. 허용 범위는 수평 기준 ±30° 이내이므로 바닥의 수평에 가까운 두 점을 다시 선택하세요.`,
          `${label} ground-line tilt is ${Math.abs(angle * 180 / Math.PI).toFixed(1)}°. The allowed range is within ±30° of horizontal; reselect two points along the floor.`);
        return;
      }
    }
    for (const view of ['front', 'side']) {
      crossViewCorrectionData.references[view] = {
        ...structuredClone(referenceDraft[view]),
        aspect: getAnalysisAspect(videos[view]),
        time: videos[view].currentTime,
      };
    }
    stanceReferenceLineFront = {
      start: structuredClone(referenceDraft.front.stancePoints[0]),
      end: structuredClone(referenceDraft.front.stancePoints[1]),
    };
    crossViewCorrectionData.calibration = 'shaft-ground-v1';
    referenceMode = false;
    crossCorrectionMode = 'roll';
    selector.value = 'frame1';
    loadFrame();
    update2dCorrectionDiagnostics();
    notice();
  });
  el('Points').addEventListener('click', () => {
    referenceMode = false;
    draft = { front: [], side: [] };
    updatePointSelectors();
    notice();
  });
  el('Capture').addEventListener('click', () => {
    const frame = selected();
    if (referenceMode || ['front', 'side'].some(view => !loadedSources[view] || videos[view].readyState < 2
      || videos[view].seeking || !videos[view].paused || loadedSources[view] !== crossViewCorrectionData.sources[view]
      || draft[view].length === 0)) {
      el('Status').textContent = text('정면 기준 프레임의 동작에 맞춰 측면 영상을 별도로 이동한 뒤, 양쪽 영상에서 빠진 점을 선택하세요. 시점의 초 단위 값은 서로 다를 수 있습니다.',
        'Move the side video independently until it matches the front reference motion, then mark the missing points in both views. Their time values may differ.');
      return;
    }
    const signature = getCrossCorrectionAnalysisSignature();
    if (crossViewCorrectionData.analysisSignature && crossViewCorrectionData.analysisSignature !== signature) {
      crossViewCorrectionData.entries = {};
      crossViewCorrectionData.backswingEntries = {};
      crossViewCorrectionData.references = {};
      stanceReferenceLineFront = null;
      el('Status').textContent = text('기존 분석이 바뀌어 저장된 점을 지웠습니다. F1 기준점부터 다시 지정하세요.',
        'The existing analysis changed, so saved landmarks were cleared. Re-mark the F1 references.');
      return;
    }
    crossViewCorrectionData.version = 2;
    crossViewCorrectionData.workflow = 'frame-pairs';
    crossViewCorrectionData.backswingEntries = {};
    crossViewCorrectionData.analysisSignature = signature;
    const entry = {
      frontPoints: structuredClone(draft.front), sidePoints: structuredClone(draft.side),
      frontTime: videos.front.currentTime, sideTime: videos.side.currentTime,
      frontAspect: getAnalysisAspect(videos.front), sideAspect: getAnalysisAspect(videos.side),
    };
    crossViewCorrectionData.entries[frame] = entry;
    crossCorrectionMode = 'roll';
    update2dCorrectionDiagnostics();
    const next = CROSS_CORRECTION_FRAMES[CROSS_CORRECTION_FRAMES.indexOf(frame) + 1];
    if (next) { selector.value = next; loadFrame(); } else notice();
  });
  el('Calculate').addEventListener('click', () => {
    const missingFrames = CROSS_CORRECTION_FRAMES
      .filter(frame => !crossViewCorrectionData.entries[frame])
      .map(frame => frame.replace('frame', 'F'));
    if (missingFrames.length) {
      el('Status').textContent = text(
        `저장되지 않은 분석 프레임: ${missingFrames.join(', ')}. 각 프레임에서 점을 선택한 뒤 ‘정면·측면 프레임 저장’을 누르세요. 현재 선택점은 아직 저장된 입력이 아닙니다.`,
        `Unsaved analysis frames: ${missingFrames.join(', ')}. Mark the points for each frame, then click “Save matched front/side frame”. Current selections are not saved yet.`);
    }
    crossCorrectionMode = 'cross';
    update2dCorrectionDiagnostics();
    document.getElementById('analysis2dDiagnosticsResults').scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
  el('RollOnly').addEventListener('click', () => { crossCorrectionMode = 'roll'; update2dCorrectionDiagnostics(); });
  el('Clear').addEventListener('click', () => {
    if (!confirm(text('교차 보정 입력을 초기화할까요? 기존 분석은 유지합니다.', 'Reset cross-correction inputs? Existing analysis will be preserved.'))) return;
    crossViewCorrectionData = {
      version: 2, workflow: 'frame-pairs', references: {}, entries: {}, backswingEntries: {}, sources: activeSources(),
    };
    stanceReferenceLineFront = null;
    crossCorrectionMode = 'roll';
    draft = { front: [], side: [] };
    update2dCorrectionDiagnostics(); notice();
  });
  window.addEventListener('resize', () => { draw('front'); draw('side'); });
}());
