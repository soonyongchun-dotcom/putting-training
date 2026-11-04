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
exports.engine = { TOURS, TOUR_IDS, REFERENCE_ENV, calibrateClub, clubLaunch, calculateTrajectory, recommendShot, resolvePersonalClub, readPersonalProfiles, projectTopView };
`, { compilerOptions: { ...options, noEmit: false } }).outputText, {
  exports: result.exports, require,
}, { filename });
const { TOURS, TOUR_IDS, REFERENCE_ENV, calibrateClub, clubLaunch, calculateTrajectory, recommendShot } = result.exports.engine;
const { resolvePersonalClub, readPersonalProfiles } = result.exports.engine;
const { projectTopView } = result.exports.engine;
let assertions = 0;
const check = (condition, message) => { assertions++; assert(condition, message); };
const close = (actual, expected, tolerance, message) => check(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
const bags = Object.fromEntries(TOUR_IDS.map(id => [id, TOURS[id].clubs.map(calibrateClub)]));
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
for (const profile of [{carry:'-1'}, {speed:'NaN'}, {launch:'90'}, {spin:'-100'}, {apex:'0'}, {axis:'31'}]) {
  check(resolvePersonalClub(sample, profile).errors.length > 0, 'invalid profile must report errors');
}
check(resolvePersonalClub(sample, {carry:'',speed:'',spin:'0'}).club.spin === 0, 'zero spin is not missing');
check(readPersonalProfiles().error !== null, 'storage unavailable must report an error');
for (const windDirDeg of [0, 90, 180, 270]) {
  const flight = calculateTrajectory(clubLaunch(sample), { ...REFERENCE_ENV, windSpeedMs: 10, windDirDeg });
  const full = projectTopView(flight, 140, 1);
  const start = projectTopView(flight, 140, 0);
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
console.log(`PASS ${assertions} numerical assertions`);
if (!diagnostics.length) console.log('PASS strict TypeScript and unused-symbol checks');
