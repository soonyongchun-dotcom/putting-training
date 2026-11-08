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

function getCrossCorrectionPendingMessage() {
  const pending = [];
  if (crossViewCorrectionData.calibration !== 'shaft-ground-v1'
    || ['front', 'side'].some(view => !crossViewCorrectionData.references?.[view])) {
    pending.push(getSwingUiText(
      '보정 기준 미저장: ‘지면선·샤프트 기준 선택’에서 양쪽 기준점을 지정하고 ‘보정 기준 저장’을 누르세요.',
      'Calibration not saved: select ground/shaft references in both videos and save calibration.'));
  }
  const missing = CROSS_CORRECTION_FRAMES.filter(frame => !crossViewCorrectionData.entries?.[frame])
    .map(frame => frame.replace('frame', 'F'));
  if (missing.length) pending.push(getSwingUiText(
    `저장되지 않은 분석 프레임: ${missing.join(', ')}. 각 프레임의 점 또는 ‘안 보임’을 지정한 뒤 ‘선택한 점 저장’을 누르세요.`,
    `Unsaved analysis frames: ${missing.join(', ')}. Mark points or Not Visible, then save each frame.`));
  return pending.join('\n');
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
  const model = { correctedFrames: [], retainedFrames: [], retainedDetails: {}, visibility: {} };
  const project = (point, calibration) => {
    if (!isProjectCoordinate(point)) crossCorrectionError('유효하지 않은 공통 포인트 좌표입니다.', 'Invalid common-landmark coordinates.');
    const dx = (point.x - calibration.bottom.x) * calibration.aspect;
    const dy = point.y - calibration.bottom.y;
    const cosine = Math.cos(calibration.roll), sine = Math.sin(calibration.roll);
    return { horizontal: (dx * cosine + dy * sine) / calibration.length,
      vertical: (dx * sine - dy * cosine) / calibration.length };
  };
  for (const view of ['front', 'side']) {
    const reference = data.references[view];
    calibrations[view].roll = getStanceCorrectionAngle({
      start: reference.stancePoints[0], end: reference.stancePoints[1],
    }, reference.aspect);
  }
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
    const explicitVisibility = Array.isArray(entry.frontHidden) || Array.isArray(entry.sideHidden);
    if (!explicitVisibility && (missingByView.front.length || missingByView.side.length)) {
      model.retainedFrames.push(frame);
      model.retainedDetails[frame] = missingByView;
      continue;
    }
    const types = CROSS_CORRECTION_POINTS[frame].front.filter(type => CROSS_CORRECTION_POINTS[frame].side.includes(type));
    const points = {};
    for (const type of types) {
      const a = entry.frontPoints.find(point => point.type === type);
      const b = entry.sidePoints.find(point => point.type === type);
      if (!a || !b) continue;
      const pa = project(a, front), pb = project(b, side);
      // Camera pitch can reverse apparent shaft height; do not average incompatible vertical projections.
      points[type] = { x: pa.horizontal, y: pa.vertical, z: pb.horizontal };
    }
    const aliases = frame === 'frame1'
      ? { c7: points.wrist }
      : frame === 'frame3' ? { hip: points.wrist, knee: points.club, ankle: points.shoulder, c7: points.pelvis }
      : frame === 'frame4' ? { c7: points.wrist, clubHead: points.pelvis, leftShoulder: points.club, leftWrist: points.shoulder }
      : {};
    const projectView = view => entry[`${view}Points`].map(point => {
      const calibration = calibrations[view];
      const cosine = Math.cos(calibration.roll), sine = Math.sin(calibration.roll);
      const x = (point.x - 0.5) * calibration.aspect, y = point.y - 0.5;
      return { ...point, type: frame === 'frame1' && point.type === 'clubHead' ? 'clubHeadTop' : point.type,
        x: (cosine * x + sine * y) / calibration.aspect + 0.5,
        y: -sine * x + cosine * y + 0.5 };
    });
    const projectionPoints = projectView('front');
    const visibility = { both: 0, front: 0, side: 0, unavailable: 0 };
    for (const type of types) {
      const a = entry.frontPoints.some(point => point.type === type);
      const b = entry.sidePoints.some(point => point.type === type);
      visibility[a && b ? 'both' : a ? 'front' : b ? 'side' : 'unavailable']++;
    }
    model.visibility[frame] = visibility;
    // A is address / pre-impact / P6; the matched pair contains only the B action.
    model[frame] = { side: { points: { ...points, ...aliases }, projectionPoints,
      sideProjectionPoints: projectView('side'), sideAspect: side.aspect,
      explicitVisibility, aspect: front.aspect, scale: front.length } };
    model.correctedFrames.push(frame);
  }
  const radiusPoints = frame => {
    const points = model[frame]?.side?.points;
    return points && [points[['frame3', 'frame4'].includes(frame) ? 'pelvisCenter' : 'pelvis'], points.handMid];
  };
  // Compare temporal lengths only within one geometry, but an unrelated hidden point must not disable them.
  const temporalFrames = ['frame1', 'frame2', 'frame3', 'frame4'];
  model.geometryBasis = {
    radius: temporalFrames.every(frame => radiusPoints(frame)?.every(Boolean)) ? 'cross' : 'front',
    spread: temporalFrames.every(frame => {
      const points = model[frame]?.side?.points;
      return radiusPoints(frame)?.every(Boolean)
        && points?.[frame === 'frame1' || frame === 'frame4' ? 'wrist' : frame === 'frame3' ? 'pelvis' : 'c7'];
    }) ? 'cross' : 'front',
  };
  model.projectedRadii = Object.values(model.geometryBasis).includes('front');
  return model;
}

function applyCrossCorrectionMetrics(metrics, model, frame, panel) {
  if (!model[frame]?.[panel]) return;
  const entry = model[frame][panel], p = entry.points, scale = entry.scale;
  // Temporal displacement must remain in the same front-camera coordinates as the unmodified A input.
  const projected = computeFrameMetrics(entry.projectionPoints, [], frame, 1, 1, entry.aspect);
  for (const key of Object.keys(metrics)) delete metrics[key];
  Object.assign(metrics, projected);
  metrics.crossCorrected = true;
  const sideProjected = computeFrameMetrics(entry.sideProjectionPoints, [], frame, 1, 1, entry.sideAspect);
  const absolute = (key) => Number.isFinite(projected[key]) ? projected[key] : sideProjected[key] ?? null;
  metrics.visibilityLimited = entry.explicitVisibility;
  // There is no matched side-camera P6 pair: keep both P6→P7 release radii in the front projection.
  if (frame === 'frame6') return;
  const distance = (a, b) => crossCorrectionLength(crossCorrectionVector(a, b));
  const core = ['frame3', 'frame4'].includes(frame) ? p.pelvisCenter : p.pelvis;
  const c7 = ['frame1', 'frame4'].includes(frame) ? p.wrist : p.c7;
  const hand = p.handMid;
  const temporal = ['frame1', 'frame2', 'frame3', 'frame4'].includes(frame);
  if ((!temporal || model.geometryBasis.radius === 'cross') && core && hand) {
    metrics.coreHandRadiusRaw = distance(core, hand) * scale;
    if (metrics.coreHandRadiusRaw < 1e-6) crossCorrectionError(`${frame}: 골반과 양손 중심이 겹칩니다.`, `${frame}: pelvis and hand center overlap.`);
    metrics.swingRadiusRaw = metrics.coreHandRadiusRaw;
    if (frame === 'frame4') metrics.rMaxNorm = metrics.coreHandRadiusRaw;
  }
  if ((!temporal || model.geometryBasis.spread === 'cross') && core && hand && c7) {
    const center = { x: (core.x + hand.x + c7.x) / 3, y: (core.y + hand.y + c7.y) / 3,
      z: (core.z + hand.z + c7.z) / 3 };
    metrics.threePointSpreadRaw = Math.sqrt([core, hand, c7].reduce((sum, point) =>
      sum + distance(center, point) ** 2, 0) / 3) * scale;
  }
  if (frame === 'frame2') {
    metrics.projectedLaggingAngleDeg = metrics.laggingAngleDeg;
    metrics.laggingAngleDeg = p.shoulder && hand && p.club
      ? crossCorrectionAngle(p.shoulder, hand, p.club) : absolute('laggingAngleDeg');
  }
  if (frame === 'frame3' && p.hip && p.knee && p.ankle) {
    const legLength = distance(p.hip, p.ankle);
    metrics.leadLegBraceRatio = legLength > 0.0005
      ? Math.hypot(p.knee.x - p.ankle.x, p.knee.z - p.ankle.z) / legLength : null;
  }
  if (frame === 'frame4') {
    metrics.projectedArmShaftAngleDeg = metrics.armShaftAngleDeg;
    metrics.projectedRMaxNorm = projected.rMaxNorm;
    metrics.armShaftAngleDeg = p.club && p.shoulder && p.pelvis
      ? crossCorrectionAngle(p.club, p.shoulder, p.pelvis) : absolute('armShaftAngleDeg');
    metrics.armShaftMissingReason = Number.isFinite(metrics.armShaftAngleDeg) ? null : 'missingPoints';
  }
  if (frame === 'frame5') {
    metrics.shaftAngleDeg = absolute('shaftAngleDeg');
    metrics.lagAngleDeg5 = absolute('lagAngleDeg5');
    if (hand && p.clubHead) metrics.shaftAngleDeg = Math.atan2(
      Math.abs(p.clubHead.y - hand.y),
      Math.hypot(p.clubHead.x - hand.x, p.clubHead.z - hand.z)) * 180 / Math.PI;
    if (p.c7 && hand && p.clubHead) metrics.lagAngleDeg5 = 180 - crossCorrectionAngle(p.c7, hand, p.clubHead);
  }
}

function getCrossCorrectionScenario() {
  const missingFrames = CROSS_CORRECTION_FRAMES
    .filter(frame => !crossViewCorrectionData.entries?.[frame])
    .map(frame => frame.replace('frame', 'F'));
  if (missingFrames.length) return { unavailable: getSwingUiText(
    `교차 보정 보류: 저장되지 않은 분석 프레임 ${missingFrames.join(', ')}. 각 프레임의 정면·측면 대응점을 저장하세요.`,
    `Cross correction withheld: unsaved analysis frames ${missingFrames.join(', ')}. Save the matched front/side points for each frame.`) };
  if (crossViewCorrectionData.analysisSignature !== getCrossCorrectionAnalysisSignature()) {
    return { unavailable: getSwingUiText(
      '교차 보정 보류: 기존 분석이 변경되었습니다. 보정 입력을 다시 열고 F1–F6 대응점을 확인한 뒤 다시 저장하세요. 원본 분석은 유지됩니다.',
      'Cross correction withheld: the original analysis changed. Reopen correction inputs, recheck and save the F1–F6 pairs. Original analysis is preserved.') };
  }
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
      const hidden = entry[`${view}Hidden`];
      return (hidden === undefined || (framePairs && Array.isArray(hidden) && hidden.length <= viewTypes.length
        && new Set(hidden).size === hidden.length && hidden.every(type => viewTypes.includes(type))))
        && Array.isArray(entry[field]) && (framePairs ? (entry[field].length > 0 || hidden?.length === viewTypes.length)
          && entry[field].length <= viewTypes.length
        : entry[field].length === viewTypes.length)
        && new Set(entry[field].map(point => point?.type)).size === entry[field].length
        && entry[field].every(point => isProjectCoordinate(point) && viewTypes.includes(point.type)
          && !hidden?.includes(point.type));
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
  let hiddenDraft = { front: [], side: [] };
  let pointUndoHistory = [];
  const realignedFrames = new Set();
  const selector = el('Frame');
  const frameLabels = [
    ['백스윙 탑 (P4)', 'Top of backswing (P4)'],
    ['다운스윙 중기 — 양손 허리 높이', 'Mid-downswing — hands at waist'],
    ['임팩트 직전 (다운스윙 4/5)', 'Just before impact (late downswing)'],
    ['임팩트 (P7)', 'Impact (P7)'],
    ['다운스윙 중기 — 양손 허리 높이 (일관성)', 'Mid-downswing — hands at waist (consistency)'],
    ['임팩트 (P7, P6→P7 시퀀스)', 'Impact (P7, P6→P7 sequence)'],
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
        option.textContent = pointLabel(frame, type) + (hiddenDraft[view].includes(type) ? text(' · 안 보임', ' · Not visible') : '');
        selector.append(option);
      }
      selector.value = requiredTypes(frame, view).includes(previous) ? previous
        : requiredTypes(frame, view).find(type => !draft[view].some(point => point.type === type)
          && !hiddenDraft[view].includes(type)) || '';
    }
  }
  function selectNextUnmarkedPoint(view) {
    const selector = pointSelectors[view];
    selector.value = requiredTypes(selected(), view).find(type => !draft[view].some(point => point.type === type)
      && !hiddenDraft[view].includes(type)) || '';
  }
  function restoreHidden(view, key) {
    const saved = crossViewCorrectionData.entries?.[key];
    hiddenDraft[view] = saved && loadedSources[view] === crossViewCorrectionData.sources[view]
      && Math.abs(videos[view].currentTime - saved[`${view}Time`]) <= 0.002
      ? structuredClone(saved[`${view}Hidden`] || []) : [];
  }
  const analysisSourceMatches = view => {
    const expected = view === 'front'
      ? [videoFileIdentity.front]
      : [videoFileIdentity.side, typeof backswingSourceIdentity === 'undefined' ? null : backswingSourceIdentity];
    return !expected.some(Boolean) || expected.includes(crossViewCorrectionData.sources[view]);
  };
  function getAnalysisMotion(view, key) {
    const identity = crossViewCorrectionData.sources[view];
    // Analysis A/B are reference/action panels, not front/side cameras.
    const history = view === 'front' && identity && identity === videoFileIdentity.side
      ? frameStateHistory.side?.[key] : null;
    if (Number.isFinite(history?.videoTime) && history.videoTime >= 0) {
      return { time: history.videoTime, points: history.points };
    }
    const phase = getBackswingPhaseForAnalysisFrame(key, 'side');
    const time = phase && typeof backswingSourceIdentity !== 'undefined'
      && identity && identity === backswingSourceIdentity ? backswingFrames[phase]?.time : null;
    return Number.isFinite(time) && time >= 0 ? { time, points: [] } : null;
  }
  function getAddressTime(view) {
    const identity = crossViewCorrectionData.sources[view];
    if (!identity) return null;
    const referenceTime = identity === videoFileIdentity.front
      ? frameStateHistory.front?.frame1?.videoTime : null;
    if (Number.isFinite(referenceTime) && referenceTime >= 0) return referenceTime;
    const time = typeof backswingSourceIdentity !== 'undefined' && identity === backswingSourceIdentity
      ? backswingFrames.address?.time : null;
    return Number.isFinite(time) && time >= 0 ? time : null;
  }
  function seekAddress(view) {
    const video = videos[view], time = getAddressTime(view);
    video.pause();
    if (Number.isFinite(time) && video.readyState >= 1
      && Math.abs(video.currentTime - time) > 0.002) video.currentTime = time;
  }
  function resetReferencePanelPairs() {
    if (crossViewCorrectionData.sources.front !== videoFileIdentity.front
      || crossViewCorrectionData.sources.front !== videoFileIdentity.side) return false;
    let changed = false;
    for (const key of CROSS_CORRECTION_FRAMES) {
      if (key === 'frame3') continue;
      const saved = crossViewCorrectionData.entries?.[key];
      const referenceTime = frameStateHistory.front?.[key]?.videoTime;
      const motionTime = frameStateHistory.side?.[key]?.videoTime;
      if (!Number.isFinite(saved?.frontTime) || !Number.isFinite(referenceTime) || !Number.isFinite(motionTime)
        || Math.abs(referenceTime - motionTime) <= 0.05
        || Math.abs(saved.frontTime - referenceTime) > 0.002) continue;
      delete crossViewCorrectionData.entries[key];
      realignedFrames.add(key);
      crossCorrectionMode = 'roll';
      changed = true;
    }
    return changed;
  }
  function restoreDraft(view, key) {
    const saved = crossViewCorrectionData.entries?.[key];
    const time = videos[view].currentTime;
    const required = requiredTypes(key, view);
    if (saved && loadedSources[view] === crossViewCorrectionData.sources[view]
      && Math.abs(time - saved[`${view}Time`]) <= 0.002) return structuredClone(saved[`${view}Points`]);
    if (!analysisSourceMatches(view)) return [];
    const motion = getAnalysisMotion(view, key);
    if (!motion || Math.abs(time - motion.time) > 0.05 || !Array.isArray(motion.points)) return [];
    return required.map(type => {
      const originalType = key === 'frame1' && type === 'clubHead' ? 'clubHeadTop' : type;
      const point = motion.points.find(point => point.type === originalType);
      return point && isProjectCoordinate(point) ? { ...structuredClone(point), type } : null;
    }).filter(Boolean);
  }
  function loadSource(view, file, automatic = false) {
    const identity = getVideoFileIdentity(file);
    if (automatic && loadedSources[view] === identity
      && crossViewCorrectionData.version === 2 && crossViewCorrectionData.workflow === 'frame-pairs'
      && crossViewCorrectionData.sources[view] === identity) return;
    pointUndoHistory = [];
    if (urls[view]) URL.revokeObjectURL(urls[view]);
    if (crossViewCorrectionData.version !== 2 || crossViewCorrectionData.workflow !== 'frame-pairs'
      || crossViewCorrectionData.sources[view] !== identity) {
      crossViewCorrectionData = {
        version: 2, workflow: 'frame-pairs', references: {}, entries: {}, backswingEntries: {},
        sources: { ...activeSources(), [view]: identity },
      };
      if (view === 'front') stanceReferenceLineFront = null;
      realignedFrames.clear();
      draft = { front: [], side: [] };
      hiddenDraft = { front: [], side: [] };
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
    el('Undo').disabled = pointUndoHistory.length === 0;
    el('Reference').textContent = referenceMode
      ? text('기준점 선택 취소', 'Cancel Reference Selection')
      : text('보정 기준 선택·저장', 'Select / Save Calibration');
    updatePointSelectors();
    for (const view of ['front', 'side']) {
      el(`${view === 'front' ? 'Front' : 'Side'}Hidden`).disabled = referenceMode || !pointSelectors[view].value;
    }
    if (crossViewCorrectionData.version !== 2 || crossViewCorrectionData.workflow !== 'frame-pairs') {
      el('Status').textContent = text('저장된 이전 형식은 새 대응점으로 자동 변환할 수 없습니다. 영상을 다시 연결한 뒤 F1–F6을 선택하세요.',
        'The saved legacy inputs cannot be converted into matched landmarks. Reconnect both videos and mark F1–F6.');
      draw('front'); draw('side');
      return;
    }
    const frame = selected();
    el('Status').textContent = referenceMode
      ? text('양쪽 영상의 어드레스에서 지면선 2점 → 샤프트의 그립 끝·클럽헤드 2점을 차례로 선택하세요. 보정 기준을 저장하면 F1부터 표시합니다.',
        'At address in both videos, mark 2 ground-line points, then the shaft grip end and clubhead. Calibration saves automatically when all references are marked.')
        + '\n' + ['front', 'side'].map(view => {
          const label = view === 'front' ? text('정면', 'Front') : text('측면', 'Side');
          const ref = referenceDraft[view];
          return `${label}: ${text('지면선 ', 'Ground ')}${ref.stancePoints.length}/2 · ${text('샤프트 ', 'Shaft ')}${ref.shaftPoints.length}/2 · ${videos[view].currentTime.toFixed(3)}s${
            getAddressTime(view) === null ? text(' · 저장된 어드레스 없음: 직접 어드레스로 이동하세요.',
              ' · No saved address: seek to address manually.') : ''}`;
        }).join(' | ')
      : ['front', 'side'].map(view => {
        const types = requiredTypes(frame, view);
        const missing = types.find(type => !draft[view].some(point => point.type === type) && !hiddenDraft[view].includes(type));
        const count = types.filter(type => draft[view].some(point => point.type === type)).length;
        const label = view === 'front' ? text('정면', 'Front') : text('측면', 'Side');
        const unlinked = !crossViewCorrectionData.entries[frame] && !getAnalysisMotion(view, frame);
        return `${label} ${count}/${types.length}: ${missing
          ? pointLabel(frame, missing) : text('필요 점 확인 완료', 'Required landmarks ready')}${
            hiddenDraft[view].length ? text(` · 안 보임 ${hiddenDraft[view].length}`, ` · Not visible ${hiddenDraft[view].length}`) : ''}${unlinked
            ? text(' · 같은 원본의 저장 동작 없음: 안내된 자세로 직접 이동하세요.',
              ' · No saved motion from this source: seek to the indicated pose manually.') : ''}`;
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
    if (!referenceMode) {
      const counts = { both: 0, front: 0, side: 0, unavailable: 0 };
      for (const type of requiredTypes(frame, 'front')) {
        const a = draft.front.some(point => point.type === type);
        const b = draft.side.some(point => point.type === type);
        if (a || b || (hiddenDraft.front.includes(type) && hiddenDraft.side.includes(type))) {
          counts[a && b ? 'both' : a ? 'front' : b ? 'side' : 'unavailable']++;
        }
      }
      el('Status').textContent += '\n' + text(
        `가시성: 양쪽 명확 ${counts.both} · 정면만 ${counts.front} · 측면만 ${counts.side} · 양쪽 안 보임 ${counts.unavailable}`,
        `Visibility: both ${counts.both} · front only ${counts.front} · side only ${counts.side} · neither ${counts.unavailable}`);
    }
    if (realignedFrames.size) el('Status').textContent += '\n' + text(
      `기존 A 기준 시점으로 저장된 ${Array.from(realignedFrames, frame => frame.replace('frame', 'F')).join('·')} 대응점은 초기화했습니다. 분석2 B의 동작 시점에서 다시 확인·저장하세요. 영상과 보정 기준은 유지됩니다.`,
      `Pairs saved at analysis A reference times (${Array.from(realignedFrames, frame => frame.replace('frame', 'F')).join(', ')}) were reset. Recheck and save at the analysis 2 B action times. Videos and calibration are retained.`);
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
    pointUndoHistory = [];
    referenceMode = false;
    const resetPairs = resetReferencePanelPairs();
    const frame = selected(), saved = crossViewCorrectionData.entries?.[frame];
    draft = { front: [], side: [] };
    hiddenDraft = { front: [], side: [] };
    for (const view of ['front', 'side']) {
      if (!loadedSources[view]) continue;
      const time = saved?.[`${view}Time`] ?? getAnalysisMotion(view, frame)?.time;
      if (Number.isFinite(time) && videos[view].readyState >= 1) {
        videos[view].pause();
        if (Math.abs(videos[view].currentTime - time) > 0.002) videos[view].currentTime = time;
        else {
          restoreHidden(view, frame);
          draft[view] = restoreDraft(view, frame);
        }
      }
    }
    notice();
    if (resetPairs) update2dCorrectionDiagnostics();
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
          pointUndoHistory = pointUndoHistory.filter(entry => entry.view !== view);
          referenceDraft[view] = { stancePoints: [], shaftPoints: [] };
          referenceDraftTimes[view] = video.currentTime;
        }
        const calibration = referenceDraft[view];
        const target = calibration.stancePoints.length < 2 ? calibration.stancePoints : calibration.shaftPoints;
        if (target.length < 2) {
          pointUndoHistory.push({ view, reference: structuredClone(calibration) });
          target.push(point);
        }
      } else {
        const type = pointSelectors[view].value;
        if (!type) {
          el('Status').textContent = text('찍을 점을 선택하세요. 가려진 점은 건너뛰고 보이는 점을 선택할 수 있습니다.',
            'Choose a landmark to mark. Skip occluded landmarks and select visible points.');
          return;
        }
        const index = draft[view].findIndex(savedPoint => savedPoint.type === type);
        pointUndoHistory.push({ view, points: structuredClone(draft[view]), hidden: [...hiddenDraft[view]], type });
        hiddenDraft[view] = hiddenDraft[view].filter(item => item !== type);
        if (index >= 0) draft[view][index] = { ...point, type };
        else draft[view].push({ ...point, type });
        selectNextUnmarkedPoint(view);
      }
      if (crossCorrectionMode === 'cross') update2dCorrectionDiagnostics();
      if (referenceMode && ['front', 'side'].every(referenceView =>
        referenceDraft[referenceView].stancePoints.length === 2
        && referenceDraft[referenceView].shaftPoints.length === 2)) {
        if (!saveReferenceCalibration()) {
          const errorMessage = el('Status').textContent;
          notice();
          el('Status').textContent += '\n' + errorMessage;
        }
        return;
      }
      notice();
    });
    videos[view].addEventListener('seeked', () => {
      pointUndoHistory = pointUndoHistory.filter(entry => entry.view !== view);
      if (referenceMode) {
        referenceDraft[view] = { stancePoints: [], shaftPoints: [] };
        referenceDraftTimes[view] = videos[view].currentTime;
      } else {
        restoreHidden(view, selected());
        draft[view] = restoreDraft(view, selected());
      }
      notice();
    });
    videos[view].addEventListener('play', () => {
      pointUndoHistory = pointUndoHistory.filter(entry => entry.view !== view);
      draft[view] = [];
      hiddenDraft[view] = [];
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
      if (referenceMode) {
        seekAddress(view);
        notice();
      } else loadFrame();
    });
    const prefix = view === 'front' ? 'Front' : 'Side';
    el(`${prefix}Hidden`).addEventListener('click', () => {
      if (referenceMode) return;
      const type = pointSelectors[view].value, video = videos[view];
      if (!type || video.readyState < 2 || video.seeking) {
        el('Status').textContent = text('영상을 불러오고 이동이 끝난 뒤 찍을 점을 선택하세요.',
          'Load the video, wait for seeking to finish, and choose a landmark.');
        return;
      }
      video.pause();
      pointUndoHistory.push({ view, points: structuredClone(draft[view]), hidden: [...hiddenDraft[view]], type });
      draft[view] = draft[view].filter(point => point.type !== type);
      if (!hiddenDraft[view].includes(type)) hiddenDraft[view].push(type);
      selectNextUnmarkedPoint(view);
      notice();
    });
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
      const analysisChanged = crossViewCorrectionData.analysisSignature
        && crossViewCorrectionData.analysisSignature !== signature;
      if (analysisChanged) {
        crossViewCorrectionData.entries = {};
        crossViewCorrectionData.backswingEntries = {};
        crossViewCorrectionData.analysisSignature = signature;
        crossCorrectionMode = 'roll';
      }
      loadFrame();
      if (analysisChanged) {
        update2dCorrectionDiagnostics();
        el('Status').textContent = text(
          '분석 프레임 자료가 변경되어 기존 F1–F6 대응점은 지웠습니다. 기준은 유지되며 각 프레임 점을 다시 저장하세요.',
          'Analysis frame data changed, so the saved F1–F6 pairs were cleared. Calibration is retained; save the points again for each frame.');
      }
    }
  });
  function saveReferenceCalibration() {
    if (!referenceMode || ['front', 'side'].some(view => !loadedSources[view]
      || videos[view].readyState < 2 || videos[view].seeking || !videos[view].paused
      || loadedSources[view] !== crossViewCorrectionData.sources[view]
      || referenceDraft[view].stancePoints.length !== 2 || referenceDraft[view].shaftPoints.length !== 2
      || !Number.isFinite(referenceDraftTimes[view])
      || Math.abs(referenceDraftTimes[view] - videos[view].currentTime) > 0.002)) {
      el('Status').textContent = text(
        '양쪽 영상의 기준점을 모두 선택해야 저장할 수 있습니다. 빠진 점을 선택하거나 ‘기준점 선택 취소’로 종료하세요.',
        'Mark all reference points in both videos. Select the missing points or cancel reference selection.');
      return false;
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
        return false;
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
    pointUndoHistory = [];
    crossCorrectionMode = 'roll';
    selector.value = 'frame1';
    loadFrame();
    update2dCorrectionDiagnostics();
    notice();
    el('Status').textContent += '\n' + text('보정 기준을 저장했습니다. F1 프레임으로 이동했습니다.',
      'Calibration references saved. Moved to F1.');
    return true;
  }
  el('Reference').addEventListener('click', () => {
    pointUndoHistory = [];
    if (referenceMode) {
      referenceMode = false;
      referenceDraft = { front: { stancePoints: [], shaftPoints: [] }, side: { stancePoints: [], shaftPoints: [] } };
      referenceDraftTimes = { front: null, side: null };
    } else {
      referenceDraft = { front: { stancePoints: [], shaftPoints: [] }, side: { stancePoints: [], shaftPoints: [] } };
      referenceMode = true;
      for (const view of ['front', 'side']) seekAddress(view);
      referenceDraftTimes = { front: videos.front.currentTime, side: videos.side.currentTime };
    }
    notice();
  });
  el('Points').addEventListener('click', () => {
    pointUndoHistory = [];
    referenceMode = false;
    draft = { front: [], side: [] };
    hiddenDraft = { front: [], side: [] };
    updatePointSelectors();
    notice();
  });
  el('Undo').addEventListener('click', () => {
    const previous = pointUndoHistory.pop();
    if (!previous) {
      notice();
      el('Status').textContent += '\n' + text('취소할 입력점이 없습니다.', 'No entered point to undo.');
      return;
    }
    if (previous.reference) {
      referenceDraft[previous.view] = previous.reference;
    } else {
      draft[previous.view] = previous.points;
      hiddenDraft[previous.view] = previous.hidden;
      pointSelectors[previous.view].value = previous.type;
    }
    if (crossCorrectionMode === 'cross') update2dCorrectionDiagnostics();
    notice();
  });
  el('Capture').addEventListener('click', () => {
    const frame = selected();
    if (referenceMode || ['front', 'side'].some(view => !loadedSources[view] || videos[view].readyState < 2
      || videos[view].seeking || !videos[view].paused || loadedSources[view] !== crossViewCorrectionData.sources[view]
      || (draft[view].length === 0 && hiddenDraft[view].length !== requiredTypes(frame, view).length))) {
      el('Status').textContent = text('정면 기준 프레임의 동작에 맞춰 측면 영상을 별도로 이동한 뒤, 양쪽 영상에서 빠진 점을 선택하세요. 시점의 초 단위 값은 서로 다를 수 있습니다.',
        'Move the side video independently until it matches the front reference motion, then mark the missing points in both views. Their time values may differ.');
      return;
    }
    const signature = getCrossCorrectionAnalysisSignature();
    if (crossViewCorrectionData.analysisSignature && crossViewCorrectionData.analysisSignature !== signature) {
      crossViewCorrectionData.entries = {};
      crossViewCorrectionData.backswingEntries = {};
      crossViewCorrectionData.analysisSignature = signature;
      crossCorrectionMode = 'roll';
      selector.value = 'frame1';
      loadFrame();
      update2dCorrectionDiagnostics();
      el('Status').textContent = text('기존 분석이 바뀌어 F1–F6 대응점을 초기화했습니다. 보정 기준은 유지했습니다. 각 프레임의 모션과 점을 확인하고 다시 저장하세요.',
        'The original analysis changed, so the F1–F6 pairs were reset. Calibration was retained. Check each motion and its landmarks, then save again.');
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
    if (hiddenDraft.front.length || hiddenDraft.side.length) {
      entry.frontHidden = [...hiddenDraft.front];
      entry.sideHidden = [...hiddenDraft.side];
    }
    crossViewCorrectionData.entries[frame] = entry;
    pointUndoHistory = [];
    realignedFrames.delete(frame);
    crossCorrectionMode = 'roll';
    update2dCorrectionDiagnostics();
    const next = CROSS_CORRECTION_FRAMES[CROSS_CORRECTION_FRAMES.indexOf(frame) + 1];
    if (next) { selector.value = next; loadFrame(); } else notice();
  });
  el('Calculate').addEventListener('click', () => {
    const pending = getCrossCorrectionPendingMessage();
    if (pending) {
      crossCorrectionMode = 'roll';
      update2dCorrectionDiagnostics();
      el('Status').textContent = pending;
      document.getElementById('analysis2dDiagnosticsResults').scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    if (crossViewCorrectionData.analysisSignature !== getCrossCorrectionAnalysisSignature()) {
      crossCorrectionMode = 'roll';
      update2dCorrectionDiagnostics();
      el('Status').textContent = text(
        '기존 분석이 변경되어 교차 보정을 보류했습니다. 보정 입력을 다시 열고 F1–F6 대응점을 확인한 뒤 다시 저장하세요. 원본 분석과 현재 입력은 유지했습니다.',
        'Cross correction was withheld because the original analysis changed. Reopen correction inputs, recheck and save the F1–F6 pairs. Original analysis and current inputs were preserved.');
      return;
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
    realignedFrames.clear();
    draft = { front: [], side: [] };
    hiddenDraft = { front: [], side: [] };
    pointUndoHistory = [];
    update2dCorrectionDiagnostics(); notice();
  });
  window.addEventListener('resize', () => { draw('front'); draw('side'); });
}());
