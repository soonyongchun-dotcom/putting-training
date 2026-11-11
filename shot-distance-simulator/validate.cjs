const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const filename = path.join(__dirname, 'App.tsx');
const source = fs.readFileSync(filename, 'utf8');
const options = {
  strict: true, noEmit: true, noUnusedLocals: true, noUnusedParameters: true,
  jsx: ts.JsxEmit.React, esModuleInterop: true, target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.CommonJS, baseUrl: __dirname,
  paths: { react: [path.join(__dirname, 'node_modules', '@types', 'react')] },
  typeRoots: [path.join(__dirname, 'node_modules', '@types')],
};
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([filename, path.join(__dirname, 'main.tsx')], options));
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: value => value, getCurrentDirectory: () => __dirname, getNewLine: () => '\n',
  }));
  process.exitCode = 1;
}
const result = { exports: {} };
vm.runInNewContext(ts.transpileModule(source + `
exports.engine = { TOURS, TOUR_IDS, REFERENCE_ENV, calibrateClub, clubLaunch, calculateTrajectory, recommendShot, resolvePersonalClub, readPersonalProfiles, projectTopView, aimAngleForOffset, clampPinPosition, greenMapPoint, greenElevationM, buildGreenRelief, simulateGreenRoll, greenRollSvgPath, impactLaunch, LIE_OPTIONS, WIND_PRESETS, windDirectionLabel, toggleWindDirection, isWindSelected, windDirectionFromPoint, WindDirectionControl, formatDistance, DistanceTick, PersonalClubEditor, DistanceInput, distanceFromYards, distanceToYards, distanceGrid, solveSpeed, solveAimedShot, getAirDensity, GREEN_STIMP_OPTIONS };
`, { compilerOptions: { ...options, noEmit: false } }).outputText, {
  exports: result.exports, require,
}, { filename });
const { TOURS, TOUR_IDS, REFERENCE_ENV, calibrateClub, clubLaunch, calculateTrajectory, recommendShot } = result.exports.engine;
const { resolvePersonalClub, readPersonalProfiles } = result.exports.engine;
const { projectTopView } = result.exports.engine;
const { aimAngleForOffset } = result.exports.engine;
const { clampPinPosition, greenMapPoint } = result.exports.engine;
const { greenElevationM, buildGreenRelief, simulateGreenRoll, greenRollSvgPath } = result.exports.engine;
const { impactLaunch, LIE_OPTIONS, WIND_PRESETS, windDirectionLabel } = result.exports.engine;
const { toggleWindDirection, isWindSelected } = result.exports.engine;
const { windDirectionFromPoint, WindDirectionControl } = result.exports.engine;
const { formatDistance, DistanceTick, PersonalClubEditor } = result.exports.engine;
const { DistanceInput, distanceFromYards, distanceToYards, distanceGrid, solveSpeed, solveAimedShot, getAirDensity } = result.exports.engine;
const { GREEN_STIMP_OPTIONS } = result.exports.engine;
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
let assertions = 0;
const check = (condition, message) => { assertions++; assert(condition, message); };
const close = (actual, expected, tolerance, message) => check(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
const bags = Object.fromEntries(TOUR_IDS.map(id => [id, TOURS[id].clubs.map(club => calibrateClub(club))]));
for (const [yards, expectedYards, expectedMeters] of [
  [100, '100yd', '91.4m'], [140, '140yd', '128m'], [150.5, '150.5yd', '137.6m'],
  [0, '0yd', '0m'], [-10, '-10yd', '-9.1m'], [-0.001, '0yd', '0m'],
]) {
  check(formatDistance(yards, 'yd') === expectedYards, `yard distance ${yards}`);
  check(formatDistance(yards, 'm') === expectedMeters, `meter distance ${yards}`);
  close(distanceToYards(distanceFromYards(yards, 'm'), 'm'), yards, 1e-10, 'unit conversion round trip');
}
const editorBase = bags.LPGA.find(club => club.id === '7I');
check(distanceToYards(320.04, 'm') === 350, 'metric target upper limit is not rejected by multiplication rounding');
function editorMarkup(profile, unit = 'yd') {
  return renderToStaticMarkup(React.createElement(PersonalClubEditor, {
    base: editorBase, profile, unit, onChange: () => {}, onReset: () => {},
  }));
}
for (const unit of ['yd', 'm']) {
  const blankEditor = editorMarkup({}, unit);
  check(blankEditor.includes(`투어 기준: ${formatDistance(editorBase.carry, unit)}`), 'personal carry reference uses selected unit');
  check(blankEditor.includes(`투어 기준: ${formatDistance(editorBase.apex, unit)}`), 'personal height reference uses selected unit');
  for (const [carry, apex] of [['100', '30'], ['150.5', '25.3'], ['0', '0']]) {
    const markup = editorMarkup({ carry, apex }, unit);
    for (const value of [carry, apex]) {
      check(markup.includes(`value="${Number(distanceFromYards(Number(value), unit).toFixed(1))}"`), 'personal input uses selected unit');
    }
    check(markup.includes(`기준 캐리 (${unit})`) && markup.includes(`최고 높이 (${unit})`), 'input labels use selected unit');
  }
  const input = renderToStaticMarkup(React.createElement(DistanceInput, {
    value: '100', unit, min: 20, max: 400, label: 'distance', onChange: () => {}, className: '',
  }));
  check(input.includes(`min="${distanceFromYards(20, unit)}"`) && input.includes(`max="${distanceFromYards(400, unit)}"`),
    'distance input physical bounds are converted');
  const invalidDistance = resolvePersonalClub(editorBase, { carry: '401', apex: '81' }, unit);
  check(invalidDistance.errors.some(error => error.includes(`${formatDistance(20, unit, 4)}–${formatDistance(400, unit, 4)}`)),
    'carry validation range uses selected unit');
  check(invalidDistance.errors.some(error => error.includes(`${formatDistance(2, unit, 4)}–${formatDistance(80, unit, 4)}`)),
    'height validation range uses selected unit');
  for (const yards of [-10, 0, 50, 350]) {
    const markup = renderToStaticMarkup(React.createElement('svg', null,
      React.createElement(DistanceTick, { yards, unit, x: 100, y: 329, signed: true })));
    check(markup.includes(`${yards > 0 ? '+' : ''}${formatDistance(yards, unit, 0)}</text>`), 'chart tick uses selected unit and sign');
  }
  const grid = distanceGrid(350, unit);
  grid.forEach((value, i) => close(distanceFromYards(value, unit), 50 * (i + 1), 1e-10, 'chart grid uses round selected-unit ticks'));
  for (const boundary of [20, 400]) {
    const markup = renderToStaticMarkup(React.createElement(DistanceInput, {
      value: String(boundary), unit, min: 20, max: 400, label: 'distance', onChange: () => {}, className: '',
    }));
    const displayedValue = Number(markup.match(/ value="([^"]+)"/)[1]);
    check(displayedValue >= distanceFromYards(20, unit) && displayedValue <= distanceFromYards(400, unit),
      'unit-switch rounding does not invalidate boundary inputs');
  }
}
const appMarkup = renderToStaticMarkup(React.createElement(result.exports.default));
check(appMarkup.includes('ver26.1107-1f-ad'), 'app version is displayed');
const windGuideTitle = appMarkup.indexOf('실전 바람 판단 가이드');
const windGuideDetails = appMarkup.slice(appMarkup.lastIndexOf('<details', windGuideTitle), windGuideTitle);
check(windGuideTitle !== -1 && !/\sopen(?:=""|(?=[\s>]))/.test(windGuideDetails),
  'practical wind guide is collapsed by default');
check(appMarkup.includes('Beaufort Wind Scale') && appMarkup.includes('The Normalization feature explained'),
  'practical wind guide cites wind observation and golf-shot references');
for (const windBand of ['0~2 m/s', '2~4 m/s', '4~6 m/s', '6~8 m/s', '8~10 m/s', '10~12 m/s', '12~14 m/s', '14~16 m/s', '16~18 m/s']) {
  check(appMarkup.includes(windBand), `practical wind guide includes ${windBand} Beaufort observation band`);
}
check(appMarkup.includes('골프 현장 공통 기준 · 잔디 드리프트 기록법')
  && appMarkup.includes('비슷한 양의 마른 잔디') && appMarkup.includes('0.5m 미만')
  && appMarkup.includes('2m 초과 / 공중에 뜸')
  && appMarkup.includes('특정 m/s나 보포트 계급으로 환산하는 실험 기준은 아닙니다'),
  'grass toss has a repeatable qualitative protocol without unsupported speed conversion');
check(!appMarkup.includes('30° 이하: 약 1~2 m/s') && !appMarkup.includes('5 m/s에서 150야드 샷 기준 약 7~10야드'),
  'practical wind guide avoids unsupported precise flag-angle and crosswind conversions');
check(/data-testid="play-as"[^>]*>[\d.]+yd</.test(appMarkup), 'main expected carry uses default yards');
check(appMarkup.includes('조준점 좌우 이동') && appMarkup.includes('좌측은 음수, 우측은 양수'),
  'aim-point control explains signed lateral offsets');
check(source.includes('그린 확대 · 핀 위치 설정')
  && source.includes('data-testid="green-map"')
  && source.includes('data-testid="green-pin"')
  && source.includes('data-testid="pin-distance-label"'),
  'green view provides a movable pin and post-shot distance display');
check(source.includes('data-testid="green-stimp"')
  && source.includes('GREEN_STIMP_OPTIONS.map')
  && source.includes('등고선 간격은 4cm')
  && source.includes('착지 속도·각도·백스핀, 선택한 Stimp, 지형 기울기와 비를 반영'),
  'green roll UI explains contour, club, environment and Stimp effects');
check(source.includes('aria-label="그린 스피드 (Stimp)"')
  && GREEN_STIMP_OPTIONS.join(',') === '2,2.5,3,3.5,4'
  && source.includes('useState<number>(GREEN_STIMP_M)'),
  'green speed selector offers multiple Stimp settings and defaults to 3m');
check(source.includes('data-testid="green-width"')
  && source.includes('data-testid="green-length"')
  && source.includes("updateGreenDimension('widthYds'")
  && source.includes("updateGreenDimension('lengthYds'")
  && source.includes('widthYds: 40, lengthYds: 24')
  && source.includes('field === \'widthYds\' ? [20, 60] : [12, 40]')
  && source.includes('<ellipse cx="180" cy="110" rx="100" ry="53"')
  && source.includes('data-testid="green-roll-inputs"'),
  'tour-size green dimensions control the rendered and calculated ellipse');
check(/data-testid="recommendation"[^>]*>환경반영예상캐리 <strong>[\d.]+yd<\/strong>/.test(appMarkup),
  'analysis expected carry has no tour prefix');
check(appMarkup.includes('투어기준시뮬레이션') && !appMarkup.includes('투어·클럽 시뮬레이션'), 'tour mode title updated');
check(!/(LPGA|PGA|KLPGA) 환경반영/.test(appMarkup), 'expected carry labels have no tour prefix');
check(appMarkup.includes('거리 단위 선택'), 'global distance unit selector exists');
check(appMarkup.indexOf('fill="url(#grassGrad)"') < appMarkup.indexOf('>50yd</text>'),
  'side chart distance labels are painted above the fairway surface');

const vacuumShot = {
  ballSpeedMph: 100, launchAngleDeg: 30, spinRateRpm: 0, spinAxisDeg: 0, aimAngleDeg: 0,
  dragScale: 0, liftScale: 0,
};
for (const angle of [5, 15, 30, 45, 60]) {
  const v = vacuumShot.ballSpeedMph * 0.44704;
  const theta = angle * Math.PI / 180;
  for (const elevationDeltaM of [-15, 0, 10, 25]) {
    const flight = calculateTrajectory({ ...vacuumShot, launchAngleDeg: angle }, { ...REFERENCE_ENV, elevationDeltaM });
    const discriminant = (v * Math.sin(theta)) ** 2 - 2 * 9.81 * elevationDeltaM;
    check(flight.path[0].y === 0, 'launch origin matches laser/elevation origin');
    if (discriminant < 0) {
      check(!flight.landed, 'vacuum shot below raised plane must not land');
      continue;
    }
    const time = (v * Math.sin(theta) + Math.sqrt(discriminant)) / 9.81;
    close(flight.flightTimeSec, time, 0.001, 'vacuum analytical landing time');
    close(flight.carryYds * 0.9144, v * Math.cos(theta) * time, 0.01, 'vacuum analytical range');
    close(flight.apexYds * 0.9144, (v * Math.sin(theta)) ** 2 / (2 * 9.81), 0.0002, 'vacuum analytical apex');
    close(flight.path.at(-1).y, elevationDeltaM, 1e-10, 'descending landing exactly on target plane');
    check(flight.flightTimeSec >= v * Math.sin(theta) / 9.81, 'raised plane landing is descending, not ascending');
    const expectedAngle = Math.atan2(Math.sqrt(discriminant), v * Math.cos(theta)) * 180 / Math.PI;
    close(flight.landingAngleDeg, expectedAngle, 0.01, 'analytical landing angle');
  }
}
const verticalShot = { ...vacuumShot, launchAngleDeg: 90, spinAxisDeg: 90, dragScale: 1, liftScale: 1 };
const verticalNoSpin = calculateTrajectory(verticalShot);
const verticalSpin = calculateTrajectory({ ...verticalShot, spinRateRpm: 10000 });
close(verticalSpin.carryYds, 0, 1e-8, 'parallel spin axis produces no spurious horizontal lift');
close(verticalSpin.apexYds, verticalNoSpin.apexYds, 1e-8, 'parallel spin axis produces no spurious vertical lift');
close(verticalSpin.flightTimeSec, verticalNoSpin.flightTimeSec, 1e-8, 'parallel spin axis preserves flight time');
for (const dt of [0, -0.01, 0.1, NaN]) {
  assert.throws(() => calculateTrajectory(vacuumShot, REFERENCE_ENV, true, dt), /시간 간격/);
  assertions++;
}
check(getAirDensity(-10) > getAirDensity(20) && getAirDensity(20) > getAirDensity(40), 'air density follows inverse absolute temperature');
close(getAirDensity(20), 101325 / (287.058 * 293.15), 1e-12, 'sea-level ideal gas density');
for (const id of TOUR_IDS) {
  for (const club of bags[id]) {
    const sim = calculateTrajectory(clubLaunch(club));
    console.log(id, club.id, 'drag/lift', club.dragScale.toFixed(3), club.liftScale.toFixed(3),
      'carry/apex', sim.carryYds.toFixed(2), sim.apexYds.toFixed(2), club.calibrationError ?? '');
    check(!club.calibrationError, `${id} ${club.id} calibration`);
    check(sim.landed, `${id} ${club.id} landing`);
    close(sim.carryYds, club.carry, 0.3, `${id} ${club.id} reference carry`);
    close(sim.apexYds, club.apex, 0.15, `${id} ${club.id} reference apex`);
    const launch = clubLaunch(club);
    const head = calculateTrajectory(launch, { ...REFERENCE_ENV, windSpeedMs: 5 }, false);
    const tail = calculateTrajectory(launch, { ...REFERENCE_ENV, windSpeedMs: 5, windDirDeg: 180 }, false);
    check(head.carryYds < sim.carryYds, `${id}/${club.id} fixed-shot headwind carry`);
    check(tail.carryYds > sim.carryYds, `${id}/${club.id} fixed-shot tailwind carry`);
    const manual = recommendShot(bags[id], club.carry * 0.85, { ...REFERENCE_ENV, windSpeedMs: 3 }, club.id);
    check(!manual.warning, `${id}/${club.id} manual recommendation: ${manual.warning}`);
    check(manual.playAsYds > club.carry * 0.85, `${id}/${club.id} manual headwind compensation`);
    close(manual.trajectory.carryYds, manual.horizontalYds, 0.15, `${id}/${club.id} manual target`);
  }
}
function recommend(id, target, overrides = {}, selected = 'AUTO') {
  return recommendShot(bags[id], target, { ...REFERENCE_ENV, ...overrides }, selected);
}
function reachable(rec, label) {
  check(!rec.warning, `${label}: ${rec.warning}`);
  check(rec.playAsYds !== null, `${label} missing recommendation`);
  close(rec.trajectory.carryYds, rec.horizontalYds, 0.15, `${label} landing range`);
  close(rec.trajectory.sideOffsetYds, 0, 0.15, `${label} landing aim`);
  check(rec.trajectory.landed, `${label} not landed`);
}
for (const id of TOUR_IDS) {
  for (const target of [50, 80, 110, 140, 180, 200]) {
    const calm = recommend(id, target);
    reachable(calm, `${id}/${target} calm`);
    close(calm.playAsYds, target, 0.03, `${id}/${target} neutral`);
    for (const wind of [2, 5, 10]) {
      const head = recommend(id, target, { windSpeedMs: wind });
      if (!head.warning) {
        reachable(head, `${id}/${target} head${wind}`);
        check(head.playAsYds > target, `${id}/${target} head${wind}: ${head.playAsYds}`);
      }
      const tail = recommend(id, target, { windSpeedMs: wind, windDirDeg: 180 });
      reachable(tail, `${id}/${target} tail${wind}`);
      check(tail.playAsYds < target, `${id}/${target} tail${wind}: ${tail.playAsYds}`);
    }
  }
  const values = {};
  for (const [label, env] of Object.entries({
    calm: {}, head: { windSpeedMs: 5 }, tail: { windSpeedMs: 5, windDirDeg: 180 },
    uphill: { elevationDeltaM: 10 }, downhill: { elevationDeltaM: -10 },
    cold: { tempC: 0 }, warm: { tempC: 35 },
    rain: { rainLevel: 'HEAVY' },
    crossRight: { windSpeedMs: 5, windDirDeg: 90 }, crossLeft: { windSpeedMs: 5, windDirDeg: 270 },
  })) {
    const rec = recommend(id, 140, env);
    reachable(rec, `${id}/${label}`);
    values[label] = Number(rec.playAsYds.toFixed(2));
    if (label === 'uphill') check(rec.playAsYds > 140, `${id} uphill`);
    if (label === 'downhill') check(rec.playAsYds < 140, `${id} downhill`);
    if (label === 'crossRight') check(rec.aimOffsetYds > 0, `${id} right drift`);
    if (label === 'crossLeft') check(rec.aimOffsetYds < 0, `${id} left drift`);
  }
  close(values.crossRight, values.crossLeft, 0.02, `${id} crosswind symmetry`);
  check(values.cold > values.warm, `${id} cold should require more distance`);
  console.log(id, '140yd environment recommendations', values);
  const unreachable = recommend(id, 350, { windSpeedMs: 20, elevationDeltaM: 25 });
  check(unreachable.warning && unreachable.playAsYds === null, `${id} impossible target must warn`);
  const wedgeTooShort = recommend(id, 200, {}, 'LW');
  check(wedgeTooShort.warning && wedgeTooShort.playAsYds === null, `${id} short manual club must warn`);
  const shot = clubLaunch(bags[id].find(c => c.id === '7I'));
  const low = calculateTrajectory({ ...shot, ballSpeedMph: 30 }, { ...REFERENCE_ENV, elevationDeltaM: 25 });
  check(!low.landed, `${id} unreachable elevated plane cannot invent a landing`);
  for (const spinAxisDeg of [-15, 0, 15]) {
    const custom = recommendShot(bags[id], 140, { ...REFERENCE_ENV, windSpeedMs: 5, windDirDeg: 90 }, '7I',
      { ...shot, spinAxisDeg });
    reachable(custom, `${id} custom spin ${spinAxisDeg}`);
  }
  for (const elevationDeltaM of [-15, 0, 25]) {
    for (const windDirDeg of [0, 90, 180, 270, 360]) {
      const rec = recommend(id, 140, { elevationDeltaM, windDirDeg, windSpeedMs: 20, tempC: -10, rainLevel: 'HEAVY' });
      if (rec.warning) check(rec.playAsYds === null && rec.requiredSpeed === null, `${id} failed cases must not recommend`);
      else reachable(rec, `${id} extreme conditions ${elevationDeltaM}/${windDirDeg}`);
      check(rec.trajectory.path.every(p => [p.x, p.y, p.z, p.time, p.v].every(Number.isFinite)),
        `${id} finite extreme trajectory`);
      const last = rec.trajectory.path.at(-1);
      if (rec.trajectory.landed) close(last.y, elevationDeltaM, 1e-8, `${id} interpolated elevated landing`);
    }
  }
}
for (const id of TOUR_IDS) {
  for (const base of bags[id]) {
    const empty = resolvePersonalClub(base, {});
    check(!empty.hasPersonal && empty.errors.length === 0, `${id}/${base.id} empty fallback`);
    close(empty.club.speed, base.speed, 1e-10, 'empty speed fallback');
    close(empty.club.dragScale, base.dragScale, 1e-10, 'empty aero fallback');
    const personal = resolvePersonalClub(base, { carry: String(base.carry * 0.9) });
    check(!personal.club.calibrationError, `${id}/${base.id} personal carry calibration`);
    const calm = calculateTrajectory(clubLaunch(personal.club));
    close(calm.carryYds, base.carry * 0.9, 0.3, `${id}/${base.id} personal reference carry`);
    const weather = calculateTrajectory(clubLaunch(personal.club), { ...REFERENCE_ENV, windSpeedMs: 5 });
    check(weather.carryYds < calm.carryYds, `${id}/${base.id} personal weather response`);
    const speedOnly = resolvePersonalClub(base, { speed: String(base.speed * 0.9) });
    close(speedOnly.club.dragScale, base.dragScale, 1e-10, 'speed-only preserves aero');
    check(calculateTrajectory(clubLaunch(speedOnly.club)).carryYds < calculateTrajectory(clubLaunch(base)).carryYds,
      `${id}/${base.id} input speed affects flight without carry calibration`);
  }
}
const sample = bags.LPGA.find(c => c.id === '7I');
const relief = buildGreenRelief();
check(relief.contours.length === 9 && relief.contours.some(contour => contour.path.length > 0),
  'green elevation produces visible contour lines');
check(relief.high.heightM > relief.low.heightM
  && greenElevationM(relief.high.lateralYds, relief.high.forwardYds) > greenElevationM(relief.low.lateralYds, relief.low.forwardYds),
  'high and low contour markers match modeled terrain');
const rollFixture = {
  landed: true, carryYds: 100, sideOffsetYds: 0,
  landingVxMs: 0, landingVzMs: 15, landingAngleDeg: 45,
  appliedLaunch: { spinRateRpm: 6000 },
};
const baselineRoll = simulateGreenRoll(rollFixture, 100, { lateralYds: 0, forwardYds: 0 }, 3);
const slowGreenRoll = simulateGreenRoll(rollFixture, 100, { lateralYds: 0, forwardYds: 0 }, 2);
const fastGreenRoll = simulateGreenRoll(rollFixture, 100, { lateralYds: 0, forwardYds: 0 }, 4);
const relocatedPinRoll = simulateGreenRoll(rollFixture, 100, { lateralYds: 5, forwardYds: 0 }, 3);
check(baselineRoll.simulated && baselineRoll.path.length > 1 && baselineRoll.rollDistanceYds > 0,
  'landed ball rolls across the modeled green');
check(fastGreenRoll.rollDistanceYds > slowGreenRoll.rollDistanceYds,
  'higher Stimp distance yields less rolling resistance and farther roll');
const lowSpinRoll = simulateGreenRoll({ ...rollFixture, appliedLaunch: { spinRateRpm: 2000 } }, 100,
  { lateralYds: 0, forwardYds: 0 }, 3);
const highSpinRoll = simulateGreenRoll({ ...rollFixture, appliedLaunch: { spinRateRpm: 9000 } }, 100,
  { lateralYds: 0, forwardYds: 0 }, 3);
check(lowSpinRoll.rollDistanceYds > highSpinRoll.rollDistanceYds,
  'higher club backspin checks more rollout at the same landing speed');
const shallowLandingRoll = simulateGreenRoll({ ...rollFixture, landingAngleDeg: 25 }, 100,
  { lateralYds: 0, forwardYds: 0 }, 3);
const steepLandingRoll = simulateGreenRoll({ ...rollFixture, landingAngleDeg: 65 }, 100,
  { lateralYds: 0, forwardYds: 0 }, 3);
check(shallowLandingRoll.rollDistanceYds > steepLandingRoll.rollDistanceYds,
  'landing angle changes post-landing rollout');
const wetRoll = simulateGreenRoll(rollFixture, 100, { lateralYds: 0, forwardYds: 0 }, 3,
  undefined, { ...REFERENCE_ENV, rainLevel: 'HEAVY' });
check(wetRoll.rollDistanceYds < baselineRoll.rollDistanceYds,
  'rain increases modeled green resistance and reduces rollout');
const clubShot = clubLaunch(sample);
const calmFlight = calculateTrajectory(clubShot, REFERENCE_ENV);
const windEnv = { ...REFERENCE_ENV, windSpeedMs: 6, windDirDeg: 0 };
const windFlight = calculateTrajectory(clubShot, windEnv);
const calmRoll = simulateGreenRoll(calmFlight, calmFlight.carryYds, { lateralYds: 0, forwardYds: 0 }, 3,
  undefined, REFERENCE_ENV);
const windRoll = simulateGreenRoll(windFlight, windFlight.carryYds, { lateralYds: 0, forwardYds: 0 }, 3,
  undefined, windEnv);
check(Math.abs(calmRoll.rollDistanceYds - windRoll.rollDistanceYds) > 0.01,
  'wind changes flight landing speed and therefore the resulting green roll');
close(relocatedPinRoll.rollDistanceYds, baselineRoll.rollDistanceYds, 0,
  'moving only the pin does not alter the same ball path or roll');
check(relocatedPinRoll.distanceToPinYds !== baselineRoll.distanceToPinYds,
  'moving the pin changes the remaining distance, not the roll path');
const terrainRolls = [-3, 0, 3].map(forwardOffset =>
  simulateGreenRoll({ ...rollFixture, carryYds: 100 + forwardOffset }, 100,
    { lateralYds: 0, forwardYds: 0 }, 3).rollDistanceYds);
check(Math.max(...terrainRolls) - Math.min(...terrainRolls) > 0.01,
  'rolling distance responds to landing on different modeled terrain');
check(baselineRoll.distanceToPinYds > 0
  && baselineRoll.distanceToPinYds === Math.hypot(baselineRoll.finalPoint.lateralYds, baselineRoll.finalPoint.forwardYds),
  'post-roll remaining distance is measured directly from the pin');
check(greenRollSvgPath(baselineRoll.path).startsWith('M ')
  && greenRollSvgPath(baselineRoll.path).includes(' L '),
  'roll path can be drawn on the green');
const outsideGreenRoll = simulateGreenRoll({ ...rollFixture, sideOffsetYds: 30 }, 100,
  { lateralYds: 0, forwardYds: 0 });
check(!outsideGreenRoll.simulated && outsideGreenRoll.rollDistanceYds === 0,
  'roll is not simulated for a shot landing outside the green');
const smallGreenRoll = simulateGreenRoll({ ...rollFixture, sideOffsetYds: 9, landingVxMs: 10, landingVzMs: 0 }, 100,
  { lateralYds: 0, forwardYds: 0 }, 3, { widthYds: 20, lengthYds: 10 });
check(smallGreenRoll.leftGreen && smallGreenRoll.rollDistanceYds < baselineRoll.rollDistanceYds,
  'configured green dimensions change edge-out and roll distance');
close(
  (smallGreenRoll.finalPoint.lateralYds / 10) ** 2 + (smallGreenRoll.finalPoint.forwardYds / 5) ** 2,
  1, 1e-8, 'roll exit point is on the configured green boundary');
close(smallGreenRoll.path.at(-1).lateralYds, smallGreenRoll.finalPoint.lateralYds, 0,
  'roll path includes exact boundary exit point');
close(smallGreenRoll.path.reduce((sum, point, index, path) => index === 0 ? sum
  : sum + Math.hypot(point.lateralYds - path[index - 1].lateralYds, point.forwardYds - path[index - 1].forwardYds), 0),
smallGreenRoll.rollDistanceYds, 1e-8, 'reported edge-out distance matches displayed roll path');
const clubRollDistances = ['D', '7I', 'PW'].map(id => {
  const club = bags.LPGA.find(value => value.id === id);
  const flight = calculateTrajectory(clubLaunch(club));
  return simulateGreenRoll(flight, club.carry, { lateralYds: 0, forwardYds: 0 }).rollDistanceYds;
});
check(new Set(clubRollDistances.map(value => value.toFixed(2))).size > 1,
  'different club launch and backspin inputs produce different landing roll estimates');
const clampedPin = clampPinPosition(24, 11);
close(Math.hypot(clampedPin.lateralYds / 20, clampedPin.forwardYds / 12), 1, 1e-10,
  'pin remains inside the playable green boundary');
check(clampPinPosition(Number.NaN, Number.POSITIVE_INFINITY).lateralYds === 0
  && clampPinPosition(Number.NaN, Number.POSITIVE_INFINITY).forwardYds === 0,
  'pin coordinates recover safely from nonfinite input');
const mapPoint = greenMapPoint(-3, 2);
close(mapPoint.x, 165, 1e-10, 'left pin maps left on green');
close(mapPoint.y, 101.16666666666667, 1e-10, 'forward pin maps toward the far side of green');
close(aimAngleForOffset(-11, 140), Math.atan2(-11, 140) * 180 / Math.PI, 1e-10,
  'left aim offset converts to leftward launch angle');
check(aimAngleForOffset(11, 140) > 0 && aimAngleForOffset(-11, 140) < 0,
  'aim offset signs map to the matching side');
for (const axis of [-30, 30]) {
  const reference = calculateTrajectory({ ...clubLaunch(sample), spinAxisDeg: axis });
  const profile = resolvePersonalClub(sample, { carry: String(reference.carryYds), apex: String(reference.apexYds), axis: String(axis) });
  check(!profile.club.calibrationError, 'personal axis is included in reference calibration');
  const flight = calculateTrajectory({ ...clubLaunch(profile.club), spinAxisDeg: profile.axis });
  close(flight.carryYds, reference.carryYds, 0.3, 'personal reference carry retained with tilted spin axis');
  close(flight.apexYds, reference.apexYds, 0.15, 'personal reference apex retained with tilted spin axis');
}
const windyWedge = bags.LPGA.find(club => club.id === 'LW');
const strongHeadwind = { ...REFERENCE_ENV, windSpeedMs: 20 };
check(calculateTrajectory(clubLaunch(windyWedge), strongHeadwind).carryYds < 6.2,
  'non-monotonic strong-headwind fixture full shot is short');
const lowerSpeedSolution = solveSpeed(clubLaunch(windyWedge), strongHeadwind, 6.2, windyWedge.speed);
check(lowerSpeedSolution !== null && lowerSpeedSolution < windyWedge.speed, 'strong-wind solver finds intermediate speed despite full-shot shortfall');
close(calculateTrajectory({ ...clubLaunch(windyWedge), ballSpeedMph: lowerSpeedSolution }, strongHeadwind).carryYds, 6.2, 0.02,
  'intermediate strong-wind solution actually reaches target');
check(calibrateClub({ ...sample, speed: 20, carry: 400, apex: 80 }).calibrationError !== null,
  'physically incompatible personal reference must fail calibration');
for (const id of TOUR_IDS) {
  for (const clubId of ['D', '7I', 'LW']) {
    const club = bags[id].find(value => value.id === clubId);
    const shot = clubLaunch(club);
    const calm = calculateTrajectory(shot);
    let previousEnergy = Infinity;
    for (const point of calm.path) {
      const energy = 0.5 * point.v ** 2 + 9.81 * point.y;
      check(energy <= previousEnergy + 1e-5, `${id}/${clubId} still-air drag cannot create mechanical energy`);
      previousEnergy = energy;
    }
    const right = calculateTrajectory({ ...shot, spinAxisDeg: 20 }, { ...REFERENCE_ENV, windSpeedMs: 8, windDirDeg: 90 });
    const left = calculateTrajectory({ ...shot, spinAxisDeg: -20 }, { ...REFERENCE_ENV, windSpeedMs: 8, windDirDeg: 270 });
    close(right.carryYds, left.carryYds, 1e-8, 'spin/crosswind mirror forward distance');
    close(right.sideOffsetYds, -left.sideOffsetYds, 1e-8, 'spin/crosswind mirror lateral distance');
    close(right.apexYds, left.apexYds, 1e-8, 'spin/crosswind mirror height');
    for (const env of [
      REFERENCE_ENV,
      { ...REFERENCE_ENV, windSpeedMs: 20, windDirDeg: 45, elevationDeltaM: -15, rainLevel: 'HEAVY', lie: 'FLYER' },
      { ...REFERENCE_ENV, windSpeedMs: 5, windDirDeg: 270, elevationDeltaM: 10, lie: 'HALF_ROUGH' },
    ]) {
      const regular = calculateTrajectory({ ...shot, spinAxisDeg: 15 }, env, true, 0.01);
      const fine = calculateTrajectory({ ...shot, spinAxisDeg: 15 }, env, true, 0.005);
      check(regular.landed === fine.landed, 'time-step refinement preserves landing classification');
      close(regular.carryYds, fine.carryYds, 0.01, 'time-step range convergence within 0.01yd');
      close(regular.sideOffsetYds, fine.sideOffsetYds, 0.01, 'time-step lateral convergence within 0.01yd');
      close(regular.apexYds, fine.apexYds, 0.003, 'time-step height convergence within 0.003yd');
      close(regular.flightTimeSec, fine.flightTimeSec, 0.001, 'time-step flight time convergence');
    }
    const original = calculateTrajectory({ ...shot, spinAxisDeg: 10 }, { ...REFERENCE_ENV, windSpeedMs: 5, windDirDeg: 90 });
    const rotated = calculateTrajectory({ ...shot, spinAxisDeg: 10, aimAngleDeg: 30 },
      { ...REFERENCE_ENV, windSpeedMs: 5, windDirDeg: 60 });
    const radians = Math.PI / 6;
    close(rotated.sideOffsetYds, original.sideOffsetYds * Math.cos(radians) + original.carryYds * Math.sin(radians), 1e-8,
      'rotation covariance of wind/spin/aim lateral component');
    close(rotated.carryYds, original.carryYds * Math.cos(radians) - original.sideOffsetYds * Math.sin(radians), 1e-8,
      'rotation covariance of wind/spin/aim forward component');
    close(rotated.apexYds, original.apexYds, 1e-8, 'rotation preserves apex');
  }
}
const aimed = solveAimedShot({ ...clubLaunch(sample), aimAngleDeg: 12 }, REFERENCE_ENV, 100, sample.speed);
check(aimed !== null, 'aim solver handles nonzero initial aim');
close(aimed.trajectory.sideOffsetYds, 0, 0.02, 'aim solver maintains initial-aim trajectory consistency');
const smallSpeed = solveSpeed(vacuumShot, REFERENCE_ENV, 0.5, 100);
check(smallSpeed !== null && smallSpeed < 10, 'inverse speed solver supports speeds below old 10mph floor');
close(calculateTrajectory({ ...vacuumShot, ballSpeedMph: smallSpeed }).carryYds, 0.5, 0.02, 'low-speed inverse solution verified');
check(solveSpeed(vacuumShot, REFERENCE_ENV, NaN, 100) === null, 'nonfinite inverse target is not a valid solution');
for (const profile of [{carry:'-1'}, {speed:'NaN'}, {launch:'90'}, {spin:'-100'}, {apex:'0'}, {axis:'31'}]) {
  check(resolvePersonalClub(sample, profile).errors.length > 0, 'invalid profile must report errors');
}
check(resolvePersonalClub(sample, {carry:'',speed:'',spin:'0'}).club.spin === 0, 'zero spin is not missing');
check(readPersonalProfiles().error !== null, 'storage unavailable must report an error');
for (const windDirDeg of [0, 90, 180, 270]) {
  const flight = calculateTrajectory(clubLaunch(sample), { ...REFERENCE_ENV, windSpeedMs: 10, windDirDeg });
  const full = projectTopView(flight, 140, 1);
  const start = projectTopView(flight, 140, 0);
  close(full.landingZoom.target.x, 125, 1e-8, 'landing zoom anchors target lateral position');
  close(full.landingZoom.target.y, 83, 1e-8, 'landing zoom anchors target forward position');
  close(full.landingZoom.landing.x - full.landingZoom.target.x,
    flight.sideOffsetYds * 0.9144 * full.scale * full.landingZoom.factor, 1e-8,
    'landing zoom magnifies lateral miss relative to target');
  close(full.landingZoom.target.y - full.landingZoom.landing.y,
    (flight.carryYds - 140) * 0.9144 * full.scale * full.landingZoom.factor, 1e-8,
    'landing zoom magnifies forward miss relative to target');
  check(full.landingZoom.factor > 1 && !/NaN|Infinity/.test(full.landingZoom.path), 'landing zoom magnifies finite path');
  close(Number(full.landingZoom.path.trim().split(/\s+/).slice(-2)[0]), full.landingZoom.landing.x, 1e-8,
    'zoom path ends at landing point');
  close(Number(full.landingZoom.path.trim().split(/\s+/).slice(-1)[0]), full.landingZoom.landing.y, 1e-8,
    'zoom path ends at landing point');
  close(start.ball.x, 400, 1e-8, 'top view launch centered');
  close(start.ball.y, start.originY, 1e-8, 'top view launch at bottom');
  close(full.ball.x, full.landing.x, 1e-8, 'top view ends at landing');
  close(full.ball.y, full.landing.y, 1e-8, 'top view ends at landing y');
  if (windDirDeg === 90) check(full.ball.x > 400, 'right crosswind appears right');
  if (windDirDeg === 270) check(full.ball.x < 400, 'left crosswind appears left');
  check(full.ball.y < start.ball.y, 'forward motion appears upward');
  check(!/NaN|Infinity/.test(full.path), 'top path finite');
  close(full.scale, start.scale, 1e-10, 'top scale stable during animation');
  for (const point of flight.path) {
    const x = 400 + point.x * full.scale;
    const y = full.originY - point.z * full.scale;
    check(x >= 100 && x <= 700 && y >= 49 && y <= 311, 'top flight inside plot');
  }
}
const crosswindEnv = { ...REFERENCE_ENV, windSpeedMs: 5, windDirDeg: 90 };
const straightShot = calculateTrajectory(clubLaunch(sample), crosswindEnv, false);
const correctedShot = calculateTrajectory({
  ...clubLaunch(sample),
  aimAngleDeg: aimAngleForOffset(-straightShot.sideOffsetYds, 140),
}, crosswindEnv, false);
check(straightShot.sideOffsetYds > 0, 'rightward crosswind drifts right without aim correction');
check(Math.abs(correctedShot.sideOffsetYds) < Math.abs(straightShot.sideOffsetYds),
  'aiming against lateral drift reduces landing deviation');
const leftAimView = projectTopView(calculateTrajectory(clubLaunch(sample)), 140, 1, 'yd', -11);
close(leftAimView.aimTarget.x, 400 - 11 * 0.9144 * leftAimView.scale, 1e-8,
  'top view displays left aim point at the target distance');
const negativeAimInput = renderToStaticMarkup(React.createElement(DistanceInput, {
  value: '-11', unit: 'yd', min: -50, max: 50, label: 'aim', onChange: () => {}, className: '',
}));
check(negativeAimInput.includes('min="-50"') && negativeAimInput.includes('max="50"') && negativeAimInput.includes('value="-11"'),
  'aim input accepts a signed lateral distance');
const lieCoefficients = {
  FAIRWAY: [1, 1, 0],
  DOWNGRAIN: [1, 0.8, 0],
  AGAINST_GRAIN: [0.97, 1, 0],
  FLYER: [1, 0.65, 2],
  HALF_ROUGH: [0.94, 0.5, 0],
  DEEP_ROUGH: [0.85, 0.5, -3],
};
check(LIE_OPTIONS.length === Object.keys(lieCoefficients).length, 'all lie scenarios tested');
for (const id of TOUR_IDS) {
  for (const club of bags[id]) {
    const shot = clubLaunch(club);
    const original = JSON.stringify(shot);
    const neutral = calculateTrajectory(shot);
    for (const [lie, [speedFactor, spinFactor, angleDelta]] of Object.entries(lieCoefficients)) {
      const env = { ...REFERENCE_ENV, lie };
      const impact = impactLaunch(shot, env);
      close(impact.ballSpeedMph, club.speed * speedFactor, 1e-10, `${id}/${club.id}/${lie} speed coefficient`);
      close(impact.spinRateRpm, club.spin * spinFactor, 1e-10, `${id}/${club.id}/${lie} spin coefficient`);
      close(impact.launchAngleDeg, Math.max(1, club.launch + angleDelta), 1e-10, `${id}/${club.id}/${lie} launch coefficient`);
      const flight = calculateTrajectory(shot, env);
      const once = calculateTrajectory(impact, REFERENCE_ENV, false);
      close(flight.carryYds, once.carryYds, 1e-8, `${id}/${club.id}/${lie} apply exactly once`);
      check(flight.landed && flight.carryYds > 0, `${id}/${club.id}/${lie} valid landing`);
      check(flight.path.every(p => [p.x, p.y, p.z, p.time, p.v].every(Number.isFinite)), 'finite lie trajectory');
      close(flight.appliedLaunch.ballSpeedMph, impact.ballSpeedMph, 1e-10, 'reported impact speed is simulated');
      if (lie === 'FAIRWAY') close(flight.carryYds, neutral.carryYds, 1e-8, 'neutral preserves original carry');
      if (lie === 'DEEP_ROUGH') check(flight.carryYds < neutral.carryYds, `${id}/${club.id} deep rough reduces carry`);
      const rain = impactLaunch(shot, { ...env, rainLevel: 'HEAVY' });
      close(rain.spinRateRpm, club.spin * spinFactor * 0.85, 1e-8, 'rain and lie compose multiplicatively');
      const combined = calculateTrajectory(shot, { ...env, rainLevel: 'LIGHT', windSpeedMs: 8, windDirDeg: 90, elevationDeltaM: 10 });
      check(Number.isFinite(combined.carryYds) && Number.isFinite(combined.sideOffsetYds), 'combined weather/lie finite');
      const top = projectTopView(combined, 140, 1);
      check(!/NaN|Infinity/.test(top.path), 'lie reflected in valid top projection');
    }
    check(JSON.stringify(shot) === original, 'lie must not mutate saved reference shot');
  }
}
const personalLie = resolvePersonalClub(sample, { carry: '120', speed: '98', spin: '6000', launch: '20' });
check(!personalLie.club.calibrationError, 'personal lie baseline calibration');
const personalFlight = calculateTrajectory(clubLaunch(personalLie.club), { ...REFERENCE_ENV, lie: 'HALF_ROUGH' });
close(personalFlight.appliedLaunch.ballSpeedMph, 98 * 0.94, 1e-10, 'personal speed receives lie after calibration');
close(personalFlight.appliedLaunch.spinRateRpm, 3000, 1e-10, 'personal spin receives lie');
close(calculateTrajectory(clubLaunch(personalLie.club)).carryYds, 120, 0.3, 'personal neutral carry remains unchanged');
for (const lie of Object.keys(lieCoefficients)) {
  const rec = recommend('LPGA', 80, { lie, windSpeedMs: 5 });
  reachable(rec, `auto club recommendation includes ${lie}`);
  check(rec.requiredSpeed <= rec.club.speed + 0.01, 'auto club respects average speed after lie compensation');
}
const deepLong = recommend('LPGA', 140, { lie: 'DEEP_ROUGH', windSpeedMs: 5 });
if (deepLong.warning) {
  check(deepLong.playAsYds === null, 'unreachable deep rough must not recommend a distance');
  check(bags.LPGA.every(club => calculateTrajectory(clubLaunch(club),
    { ...REFERENCE_ENV, lie: 'DEEP_ROUGH', windSpeedMs: 5 }, false).carryYds < 140),
  'deep rough warning corresponds to actual insufficient carry');
} else reachable(deepLong, 'deep rough long target');
for (const preset of WIND_PRESETS) {
  check(windDirectionLabel(preset.degrees).includes(preset.label), 'wind preset label matches angle');
}
check(windDirectionLabel(360) === windDirectionLabel(0), '360 equals headwind');
check(windDirectionLabel(270).includes('훅바람') && windDirectionLabel(270).includes('우측 → 좌측'), 'right-handed hook direction');
check(windDirectionLabel(90).includes('슬라이스바람') && windDirectionLabel(90).includes('좌측 → 우측'), 'right-handed slice direction');
check(windDirectionLabel(45).includes('맞바람') && windDirectionLabel(45).includes('슬라이스바람'), 'diagonal wind label');
for (const [longitudinal, lateral, expected] of [[0, 90, 45], [0, 270, 315], [180, 90, 135], [180, 270, 225]]) {
  const angle = toggleWindDirection(longitudinal, lateral);
  close(angle, expected, 1e-8, 'compound wind angle');
  check(isWindSelected(angle, longitudinal) && isWindSelected(angle, lateral), 'both components selected');
  check(!isWindSelected(angle, (longitudinal + 180) % 360), 'opposite longitudinal off');
  close(toggleWindDirection(angle, lateral), longitudinal, 1e-8, 'remove lateral component');
  close(toggleWindDirection(angle, longitudinal), lateral, 1e-8, 'remove longitudinal component');
  close(toggleWindDirection(longitudinal, longitudinal), longitudinal, 1e-8, 'retain final direction');
  const flight = calculateTrajectory(clubLaunch(sample), { ...REFERENCE_ENV, windSpeedMs: 5, windDirDeg: angle });
  check(lateral === 90 ? flight.sideOffsetYds > 0 : flight.sideOffsetYds < 0, 'compound drift matches component');
  const radians = angle * Math.PI / 180;
  close(Math.hypot(5 * Math.sin(radians), 5 * Math.cos(radians)), 5, 1e-10, 'compound total speed unchanged');
}
close(toggleWindDirection(315, 180), 225, 1e-8, 'replace headwind with tailwind preserving hook');
close(toggleWindDirection(315, 90), 45, 1e-8, 'replace hook with slice preserving headwind');
check(isWindSelected(360, 0) && !isWindSelected(360, 90), 'cardinal float tolerance');
check(isWindSelected(30, 0) && isWindSelected(30, 90), 'slider components synchronized');
for (let degrees = 0; degrees < 360; degrees++) {
  const radians = degrees * Math.PI / 180;
  close(windDirectionFromPoint(30 * Math.sin(radians), 30 * Math.cos(radians)), degrees, 0,
    'compass airflow maps to exact one-degree wind');
  const markup = renderToStaticMarkup(React.createElement('svg', null,
    React.createElement(WindDirectionControl, { degrees, speed: 5, unit: 'm/s', onChange: () => {} })));
  const rotation = markup.match(/<g transform="rotate\(([-\d.]+)\)" pointer-events="none">/);
  check(rotation !== null, `rendered wind arrow has rotation at ${degrees} degrees`);
  const arrowRadians = Number(rotation[1]) * Math.PI / 180;
  const arrowX = Math.sin(arrowRadians);
  const arrowY = -Math.cos(arrowRadians);
  close(arrowX, Math.sin(radians), 1e-10, `rendered arrow lateral airflow at ${degrees} degrees`);
  close(arrowY, Math.cos(radians), 1e-10, `rendered arrow longitudinal airflow at ${degrees} degrees`);
  close(windDirectionFromPoint(30 * arrowX, 30 * arrowY), degrees, 0,
    `clicking rendered arrow preserves ${degrees} degrees`);
  if (degrees % 45 === 0 && Math.abs(arrowX) > 1e-8) {
    const flight = calculateTrajectory(clubLaunch(sample), { ...REFERENCE_ENV, windSpeedMs: 5, windDirDeg: degrees });
    check(Math.sign(flight.sideOffsetYds) === Math.sign(arrowX),
      `rendered arrow matches actual lateral drift at ${degrees} degrees`);
  }
}
check(windDirectionFromPoint(0, 0) === null && windDirectionFromPoint(2, 2) === null,
  'compass center preserves direction');
close(windDirectionFromPoint(0, 30), 0, 0, 'down arrow is headwind');
close(windDirectionFromPoint(30, 0), 90, 0, 'right arrow is slice wind');
close(windDirectionFromPoint(0, -30), 180, 0, 'up arrow is tailwind');
close(windDirectionFromPoint(-30, 0), 270, 0, 'left arrow is hook wind');
console.log(`PASS ${assertions} numerical assertions`);
if (!diagnostics.length) console.log('PASS strict TypeScript and unused-symbol checks');
