import React, { useState, useMemo, useEffect, useRef } from 'react';

// Safe Inline SVG Icons
const WindIcon = ({ size = 16, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" /><path d="M9.6 4.6A2 2 0 1 1 11 8H2" /><path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
  </svg>
);

const TargetIcon = ({ size = 22, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
  </svg>
);

const CompassIcon = ({ size = 20, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
  </svg>
);

const PlayIcon = ({ size = 18, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

const RotateCcwIcon = ({ size = 18, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
  </svg>
);

const ActivityIcon = ({ size = 20, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);

const LayersIcon = ({ size = 14, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" />
  </svg>
);

const AwardIcon = ({ size = 14, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="8" r="7" /><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
  </svg>
);

const SlidersIcon = ({ size = 16, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
  </svg>
);

const HelpCircleIcon = ({ size = 14, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

function HelpDetails({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="text-xs text-slate-400">
      <summary className="flex min-h-9 w-fit cursor-pointer list-none items-center gap-1.5 rounded px-1 font-bold text-sky-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 [&::-webkit-details-marker]:hidden">
        <HelpCircleIcon size={18} />
        <span>{title}</span>
      </summary>
      <div className="mt-1 space-y-2 leading-relaxed">{children}</div>
    </details>
  );
}

// CONSTANTS & CONVERSIONS
const GRAVITY = 9.81;
const BALL_MASS = 0.0459;
const BALL_RADIUS = 0.02135;
const BALL_AREA = Math.PI * BALL_RADIUS * BALL_RADIUS;

const YDS_TO_M = 0.9144;
const M_TO_YDS = 1 / YDS_TO_M;
const MPH_TO_MS = 0.44704;
const KMH_TO_MS = 1 / 3.6;
const TRACKMAN_SOURCE = 'https://www.trackman.media/tour-averages';

type DistanceUnit = 'yd' | 'm';

function distanceFromYards(yards: number, unit: DistanceUnit) {
  return unit === 'm' ? yards * YDS_TO_M : yards;
}

function distanceToYards(value: number, unit: DistanceUnit) {
  return unit === 'm' ? value / YDS_TO_M : value;
}

function formatDistance(yards: number, unit: DistanceUnit, precision = 1) {
  return `${Number(distanceFromYards(yards, unit).toFixed(precision))}${unit}`;
}

function distanceGrid(maxYards: number, unit: DistanceUnit) {
  return Array.from({ length: Math.floor(distanceFromYards(maxYards, unit) / 50) },
    (_, i) => distanceToYards((i + 1) * 50, unit));
}

function DistanceInput({ value, unit, min, max, reference, label, onChange, className }: {
  value: string; unit: DistanceUnit; min: number; max: number; reference?: number;
  label: string; onChange: (yards: string) => void; className: string;
}) {
  const [draft, setDraft] = useState<{ source: string; unit: DistanceUnit; text: string } | null>(null);
  const convertedValue = distanceFromYards(Number(value), unit);
  const roundedValue = Number(convertedValue.toFixed(1));
  const displayValue = roundedValue < distanceFromYards(min, unit) || roundedValue > distanceFromYards(max, unit)
    ? convertedValue : roundedValue;
  const converted = value.trim() && Number.isFinite(Number(value))
    ? String(displayValue) : value;
  const shown = draft?.source === value && draft.unit === unit ? draft.text : converted;
  return (
    <input type="number" aria-label={label} min={distanceFromYards(min, unit)} max={distanceFromYards(max, unit)} step="any"
      value={shown} placeholder={reference === undefined ? undefined : String(Number(distanceFromYards(reference, unit).toFixed(1)))}
      onChange={(event) => {
        const text = event.target.value;
        const yards = text.trim() ? String(distanceToYards(Number(text), unit)) : '';
        setDraft({ source: yards, unit, text });
        onChange(yards);
      }} className={className} />
  );
}

function DistanceTick({ yards, unit, x, y, signed = false, textAnchor = 'middle' }: {
  yards: number; unit: DistanceUnit; x: number; y: number; signed?: boolean; textAnchor?: 'middle' | 'end';
}) {
  return (
    <text x={x} y={y} textAnchor={textAnchor} fill="#94a3b8" fontSize="10">
      {signed && yards > 0 ? '+' : ''}{formatDistance(yards, unit, 0)}
    </text>
  );
}

type TourId = 'LPGA' | 'KLPGA' | 'PGA';
type RainLevel = 'NONE' | 'LIGHT' | 'HEAVY';
const WIND_PRESETS = [
  { degrees: 0, label: '맞바람', direction: '목표 → 선수' },
  { degrees: 180, label: '뒷바람', direction: '선수 → 목표' },
  { degrees: 270, label: '훅바람', direction: '우측 → 좌측' },
  { degrees: 90, label: '슬라이스바람', direction: '좌측 → 우측' },
] as const;
function windSelections(degrees: number) {
  const radians = degrees * Math.PI / 180;
  const component = (value: number) => Math.abs(value) < 1e-8 ? 0 : Math.sign(value);
  return { forward: component(Math.cos(radians)), lateral: component(Math.sin(radians)) };
}

function isWindSelected(degrees: number, preset: number) {
  const selected = windSelections(degrees);
  const option = windSelections(preset);
  return option.forward !== 0 ? selected.forward === option.forward : selected.lateral === option.lateral;
}

function toggleWindDirection(degrees: number, preset: number) {
  const selected = windSelections(degrees);
  const option = windSelections(preset);
  const forward = option.forward !== 0 ? (selected.forward === option.forward ? 0 : option.forward) : selected.forward;
  const lateral = option.lateral !== 0 ? (selected.lateral === option.lateral ? 0 : option.lateral) : selected.lateral;
  if (forward === 0 && lateral === 0) return degrees;
  return (Math.atan2(lateral, forward) * 180 / Math.PI + 360) % 360;
}

const LIE_OPTIONS = [
  { id: 'FAIRWAY', label: '페어웨이 · 중립', speed: 1, spin: 1, launchDelta: 0,
    note: '기준 라이입니다. 볼속도·발사각·스핀을 변경하지 않습니다.' },
  { id: 'DOWNGRAIN', label: '페어웨이 · 순결', speed: 1, spin: 0.80, launchDelta: 0,
    note: '볼속도 유지, 스핀 20% 감소(제시 범위 15–25%의 중간값). 착지 후 런 증가 가능성이 있습니다.' },
  { id: 'AGAINST_GRAIN', label: '페어웨이 · 역결', speed: 0.97, spin: 1, launchDelta: 0,
    note: '볼속도 3% 감소(제시 범위 2–4%의 중간값). 헤드 뒤틀림의 방향은 예측하지 않습니다.' },
  { id: 'FLYER', label: '러프 · 약간 잠김 (25% / 플라이어)', speed: 1, spin: 0.65, launchDelta: 2,
    note: '볼속도 유지, 스핀 35% 감소. 높은 출발을 위한 발사각 +2°는 모델 가정입니다. 런 증가 가능성이 있으나 캐리 증가는 보장하지 않습니다.' },
  { id: 'HALF_ROUGH', label: '러프 · 반쯤 잠김 (50%)', speed: 0.94, spin: 0.50, launchDelta: 0,
    note: '볼속도 6% 감소, 스핀 50% 감소. 발사각은 유지합니다.' },
  { id: 'DEEP_ROUGH', label: '러프 · 완전히 잠김 (100%)', speed: 0.85, spin: 0.50, launchDelta: -3,
    note: '볼속도 15% 감소. 발사각 -3°·스핀 50% 감소는 모델 가정입니다. 고정 거리 손실을 강제하지 않으며 클럽·샷별로 계산합니다.' },
] as const;
type LieId = typeof LIE_OPTIONS[number]['id'];

function getLie(id: LieId) {
  const lie = LIE_OPTIONS.find(option => option.id === id);
  if (!lie) throw new Error('지원하지 않는 라이입니다.');
  return lie;
}

function windDirectionLabel(degrees: number) {
  const normalized = ((degrees % 360) + 360) % 360;
  const preset = WIND_PRESETS.find(option => option.degrees === normalized);
  if (preset) return `${preset.label} (${preset.direction})`;
  const longitudinal = normalized < 90 || normalized > 270 ? '맞바람' : '뒷바람';
  const lateral = normalized < 180 ? '슬라이스바람 · 좌→우' : '훅바람 · 우→좌';
  return `${normalized}° ${longitudinal} + ${lateral}`;
}

function windDirectionFromPoint(x: number, y: number) {
  if (Math.hypot(x, y) < 4) return null;
  // The arrow shows airflow: down is headwind, right is slice wind.
  return (Math.round(Math.atan2(x, y) * 180 / Math.PI) + 360) % 360;
}

function WindDirectionControl({ degrees, speed, unit, onChange }: {
  degrees: number; speed: number; unit: string; onChange: (degrees: number) => void;
}) {
  const updateFromPointer = (event: React.PointerEvent<SVGGElement>) => {
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const angle = windDirectionFromPoint(point.x, point.y);
    if (angle !== null) onChange(angle);
  };
  return (
    <g transform="translate(90, 85)">
      <text x="0" y="-44" textAnchor="middle" fill="#cbd5e1" fontSize="11">목표 ↑</text>
      <g role="slider" tabIndex={0} aria-label="풍향계 직접 조절" aria-valuemin={0} aria-valuemax={359}
        aria-valuenow={degrees % 360} aria-valuetext={windDirectionLabel(degrees)}
        className="cursor-crosshair focus:outline focus:outline-2 focus:outline-sky-300"
        style={{ touchAction: 'none' }}
        onPointerDown={event => {
          if (!event.isPrimary || event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          updateFromPointer(event);
        }}
        onPointerMove={event => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) updateFromPointer(event);
        }}
        onPointerUp={event => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            updateFromPointer(event);
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancel={event => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onKeyDown={event => {
          const step = event.shiftKey ? 15 : 1;
          const delta = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step }[event.key];
          if (delta !== undefined || event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            onChange(event.key === 'Home' ? 0 : event.key === 'End' ? 359 : (degrees + (delta ?? 0) + 360) % 360);
          }
        }}>
        <title>클릭 또는 드래그로 풍향 조절 · 방향키 1° / Shift+방향키 15°</title>
        <circle r="34" fill="#020617" stroke="#38bdf8" strokeWidth="2" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map(angle => (
          <line key={angle} x1="0" y1="-27" x2="0" y2="-32" stroke="#64748b" transform={`rotate(${angle})`} />
        ))}
        <g transform={`rotate(${180 - degrees})`} pointerEvents="none">
          <line x1="0" y1="18" x2="0" y2="-18" stroke="#38bdf8" strokeWidth="3" />
          <polygon points="0,-24 8,-9 -8,-9" fill="#38bdf8" />
        </g>
      </g>
      <g pointerEvents="none" fill="#38bdf8" fontSize="12">
        <text x="46" y="-10" fontWeight="900">풍속 {Number(speed.toFixed(1))} {unit} · {degrees}°</text>
        <text x="46" y="9" fontSize="11">풍향계 클릭·드래그로 조절</text>
        <text x="46" y="26" fontSize="10" fill="#94a3b8">화살표 = 바람이 부는 방향 · 목표 ↑ 기준</text>
      </g>
    </g>
  );
}
type ClubData = {
  id: string;
  name: string;
  clubSpeed: number;
  speed: number;
  launch: number;
  spin: number;
  carry: number;
  apex: number;
  landAngle: number;
  estimated: boolean;
};
type AeroModel = { dragScale: number; liftScale: number };
type CalibratedClub = ClubData & AeroModel & { calibrationError: string | null };
const PERSONAL_FIELDS = [
  { key: 'carry', label: '기준 캐리', unit: 'yd', min: 20, max: 400, step: 0.1 },
  { key: 'clubSpeed', label: '클럽 스피드', unit: 'mph', min: 20, max: 150, step: 0.1 },
  { key: 'speed', label: '볼 스피드', unit: 'mph', min: 20, max: 220, step: 0.1 },
  { key: 'launch', label: '발사각', unit: '°', min: 3, max: 60, step: 0.1 },
  { key: 'spin', label: '백스핀', unit: 'rpm', min: 0, max: 15000, step: 1 },
  { key: 'apex', label: '최고 높이', unit: 'yd', min: 2, max: 80, step: 0.1 },
  { key: 'axis', label: '스핀축', unit: '°', min: -30, max: 30, step: 0.1 },
] as const;
type PersonalField = typeof PERSONAL_FIELDS[number]['key'];
type PersonalProfile = Partial<Record<PersonalField, string>>;
type PersonalProfiles = Record<string, PersonalProfile>;
const PROFILE_STORAGE_KEY = 'sy-shot-personal-clubs-v1';

function readPersonalProfiles(): { profiles: PersonalProfiles; error: string | null } {
  try {
    const stored = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!stored) return { profiles: {}, error: null };
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('잘못된 저장 형식');
    const profiles: PersonalProfiles = {};
    for (const [clubId, raw] of Object.entries(parsed)) {
      if (!/^(D|3W|5W|HY|3I|4I|5I|6I|7I|8I|9I|PW|GW|SW|LW)$/.test(clubId)
        || !raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('잘못된 클럽 데이터');
      const profile: PersonalProfile = {};
      for (const field of PERSONAL_FIELDS) {
        if (field.key in raw) {
          const value: unknown = Reflect.get(raw, field.key);
          if (typeof value !== 'string') throw new Error('잘못된 입력값 형식');
          profile[field.key] = value;
        }
      }
      profiles[clubId] = profile;
    }
    return { profiles, error: null };
  } catch (error) {
    return { profiles: {}, error: `개인 클럽 데이터를 불러오지 못했습니다: ${error instanceof Error ? error.message : String(error)}. 현재 투어 평균을 표시하며, 입력하면 저장 데이터를 교체합니다.` };
  }
}

function resolvePersonalClub(base: CalibratedClub, profile: PersonalProfile, unit: DistanceUnit = 'yd') {
  const errors: string[] = [];
  const values: Partial<Record<PersonalField, number>> = {};
  for (const field of PERSONAL_FIELDS) {
    const raw = profile[field.key]?.trim();
    if (!raw) continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < field.min || value > field.max) {
      const range = field.unit === 'yd'
        ? `${formatDistance(field.min, unit, 4)}–${formatDistance(field.max, unit, 4)}`
        : `${field.min}–${field.max}${field.unit}`;
      errors.push(`${field.label}: ${range} 범위로 입력하세요.`);
    } else values[field.key] = value;
  }
  const carry = values.carry ?? base.carry;
  const data: ClubData = {
    ...base, carry, clubSpeed: values.clubSpeed ?? base.clubSpeed,
    speed: values.speed ?? base.speed, launch: values.launch ?? base.launch, spin: values.spin ?? base.spin,
    apex: values.apex ?? (values.carry !== undefined ? base.apex * carry / base.carry : base.apex),
  };
  const club = values.carry !== undefined || values.apex !== undefined ? calibrateClub(data, values.axis ?? 0) : { ...base, ...data };
  return { club, axis: values.axis ?? 0, errors, hasPersonal: Object.keys(values).length > 0 };
}

function PersonalClubEditor({ base, profile, unit, onChange, onReset }: {
  base: CalibratedClub; profile: PersonalProfile; unit: DistanceUnit;
  onChange: (field: PersonalField, value: string) => void; onReset: () => void;
}) {
  return (
    <div className="space-y-2 border border-emerald-500/30 bg-slate-900 rounded-xl p-3">
      <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold">
        <SlidersIcon size={16} /><span>{base.name} 개인 데이터 입력</span>
      </div>
      <p className="text-[11px] text-slate-400">빈칸은 선택 투어 평균 적용 · 입력값은 클럽별로 이 브라우저에 자동 저장됩니다.</p>
      <div className="grid grid-cols-2 gap-2">
        {PERSONAL_FIELDS.map((field) => {
          const reference = field.key === 'axis' ? 0 : base[field.key];
          const isDistance = field.unit === 'yd';
          const raw = profile[field.key] ?? '';
          return (
            <label key={field.key} className="block text-[11px] text-slate-300">
              {field.label} ({isDistance ? unit : field.unit})
              <span className="block text-sky-300">투어 기준: {isDistance ? formatDistance(reference, unit) : `${Number(reference.toFixed(1))}${field.unit}`}</span>
              {isDistance ? (
                <DistanceInput value={raw} unit={unit} min={field.min} max={field.max} reference={reference}
                  label={`개인 ${field.label}`} onChange={(value) => onChange(field.key, value)}
                  className="mt-1 w-full bg-slate-950 border border-slate-600 rounded-lg px-2 py-1.5 focus:border-emerald-400" />
              ) : (
                <input type="number" aria-label={`개인 ${field.label}`} min={field.min} max={field.max} step={field.step}
                  value={raw} placeholder={String(Number(reference.toFixed(1)))}
                  onChange={(e) => onChange(field.key, e.target.value)}
                  className="mt-1 w-full bg-slate-950 border border-slate-600 rounded-lg px-2 py-1.5 focus:border-emerald-400" />
              )}
            </label>
          );
        })}
      </div>
      <HelpDetails title="개인 입력 기준 안내">
      <p className="text-[11px] text-slate-400">
        기준 캐리는 무풍·20°C·평지의 런 제외 거리입니다. 캐리 또는 높이를 입력하면 개인 발사 데이터로 항력·양력을 재보정합니다.
        거리와 높이는 화면 상단에서 선택한 단위로 입력합니다. 단위를 바꿔도 저장된 실제 거리는 유지됩니다.
        캐리만 입력한 경우 높이는 투어 높이에 거리 비율을 적용한 추정값입니다.
        캐리·높이가 모두 비어 있으면 투어 공력 모델에 입력 발사 데이터를 적용합니다.
        입력한 스핀축도 기준 캐리·높이 보정에 적용됩니다.
        클럽 스피드는 참고용이며 비행 계산은 볼 스피드를 사용합니다.
      </p>
      </HelpDetails>
      <button onClick={onReset} className="w-full border border-slate-600 rounded-lg p-2 text-xs text-slate-300">
        이 클럽 개인 입력 지우기 (투어 평균 복원)
      </button>
    </div>
  );
}
type Environment = {
  windSpeedMs: number;
  windDirDeg: number;
  tempC: number;
  elevationDeltaM: number;
  rainLevel: RainLevel;
  lie: LieId;
};
type Launch = AeroModel & {
  ballSpeedMph: number;
  launchAngleDeg: number;
  spinRateRpm: number;
  spinAxisDeg: number;
  aimAngleDeg: number;
};

const REFERENCE_ENV: Environment = {
  windSpeedMs: 0, windDirDeg: 0, tempC: 20, elevationDeltaM: 0, rainLevel: 'NONE', lie: 'FAIRWAY',
};
const TOUR_IDS: TourId[] = ['LPGA', 'KLPGA', 'PGA'];

// Transcribed from the official TrackMan yards charts linked by the media kit.
const PGA_CLUBS: ClubData[] = [
  { id: 'D', name: '드라이버', clubSpeed: 115, speed: 171, launch: 10.4, spin: 2545, carry: 282, apex: 35, landAngle: 39, estimated: false },
  { id: '3W', name: '3번 우드', clubSpeed: 110, speed: 162, launch: 9.3, spin: 3663, carry: 249, apex: 32, landAngle: 44, estimated: false },
  { id: '5W', name: '5번 우드', clubSpeed: 106, speed: 156, launch: 9.7, spin: 4322, carry: 236, apex: 33, landAngle: 48, estimated: false },
  { id: 'HY', name: '하이브리드 15–18°', clubSpeed: 102, speed: 149, launch: 10.2, spin: 4587, carry: 231, apex: 31, landAngle: 49, estimated: false },
  { id: '3I', name: '3번 아이언', clubSpeed: 100, speed: 145, launch: 10.3, spin: 4404, carry: 218, apex: 30, landAngle: 48, estimated: false },
  { id: '4I', name: '4번 아이언', clubSpeed: 98, speed: 140, launch: 10.8, spin: 4782, carry: 209, apex: 31, landAngle: 49, estimated: false },
  { id: '5I', name: '5번 아이언', clubSpeed: 96, speed: 135, launch: 11.9, spin: 5280, carry: 199, apex: 33, landAngle: 50, estimated: false },
  { id: '6I', name: '6번 아이언', clubSpeed: 94, speed: 130, launch: 14.0, spin: 6204, carry: 188, apex: 32, landAngle: 50, estimated: false },
  { id: '7I', name: '7번 아이언', clubSpeed: 92, speed: 123, launch: 16.1, spin: 7124, carry: 176, apex: 34, landAngle: 51, estimated: false },
  { id: '8I', name: '8번 아이언', clubSpeed: 89, speed: 118, launch: 17.8, spin: 8078, carry: 164, apex: 33, landAngle: 51, estimated: false },
  { id: '9I', name: '9번 아이언', clubSpeed: 87, speed: 112, launch: 20.0, spin: 8793, carry: 152, apex: 32, landAngle: 52, estimated: false },
  { id: 'PW', name: '피칭 웨지', clubSpeed: 84, speed: 104, launch: 23.7, spin: 9316, carry: 142, apex: 32, landAngle: 52, estimated: false },
];
const LPGA_CLUBS: ClubData[] = [
  { id: 'D', name: '드라이버', clubSpeed: 96, speed: 143, launch: 12.6, spin: 2506, carry: 223, apex: 26, landAngle: 36, estimated: false },
  { id: '3W', name: '3번 우드', clubSpeed: 92, speed: 135, launch: 11.6, spin: 2595, carry: 200, apex: 25, landAngle: 38, estimated: false },
  { id: '5W', name: '5번 우드', clubSpeed: 90, speed: 130, launch: 12.3, spin: 4320, carry: 189, apex: 25, landAngle: 43, estimated: false },
  { id: 'HY', name: '하이브리드 15–18°', clubSpeed: 87, speed: 125, launch: 13.9, spin: 4504, carry: 178, apex: 25, landAngle: 45, estimated: false },
  { id: '4I', name: '4번 아이언', clubSpeed: 82, speed: 118, launch: 13.9, spin: 4608, carry: 175, apex: 25, landAngle: 43, estimated: false },
  { id: '5I', name: '5번 아이언', clubSpeed: 81, speed: 114, launch: 14.6, spin: 4966, carry: 166, apex: 25, landAngle: 45, estimated: false },
  { id: '6I', name: '6번 아이언', clubSpeed: 80, speed: 111, launch: 16.7, spin: 5904, carry: 155, apex: 25, landAngle: 46, estimated: false },
  { id: '7I', name: '7번 아이언', clubSpeed: 78, speed: 106, launch: 18.5, spin: 6630, carry: 143, apex: 26, landAngle: 47, estimated: false },
  { id: '8I', name: '8번 아이언', clubSpeed: 76, speed: 102, launch: 20.8, spin: 7413, carry: 133, apex: 27, landAngle: 47, estimated: false },
  { id: '9I', name: '9번 아이언', clubSpeed: 74, speed: 95, launch: 23.5, spin: 7605, carry: 123, apex: 27, landAngle: 48, estimated: false },
  { id: 'PW', name: '피칭 웨지', clubSpeed: 72, speed: 88, launch: 25.2, spin: 8465, carry: 111, apex: 27, landAngle: 48, estimated: false },
];

function withEstimatedWedges(clubs: ClubData[]): ClubData[] {
  const pw = clubs[clubs.length - 1];
  return [...clubs, ...[
    { id: 'GW', name: '갭 웨지', ratio: 0.86, speedRatio: 0.90, launchDelta: 4.5, apexRatio: 0.90 },
    { id: 'SW', name: '샌드 웨지', ratio: 0.72, speedRatio: 0.80, launchDelta: 9, apexRatio: 0.82 },
    { id: 'LW', name: '로브 웨지', ratio: 0.58, speedRatio: 0.70, launchDelta: 14, apexRatio: 0.72 },
  ].map((w) => ({
    id: w.id, name: w.name, clubSpeed: Math.round(pw.clubSpeed * w.speedRatio),
    speed: pw.speed * w.speedRatio, launch: pw.launch + w.launchDelta,
    spin: pw.spin, carry: Math.round(pw.carry * w.ratio), apex: pw.apex * w.apexRatio,
    landAngle: pw.landAngle + w.launchDelta * 0.5, estimated: true,
  }))];
}

const TOURS: Record<TourId, { name: string; note: string; clubs: ClubData[] }> = {
  PGA: { name: 'PGA', note: 'TrackMan 공개 PGA 평균 · GW/SW/LW는 추정', clubs: withEstimatedWedges(PGA_CLUBS) },
  LPGA: { name: 'LPGA', note: 'TrackMan 공개 LPGA 평균 · GW/SW/LW는 추정', clubs: withEstimatedWedges(LPGA_CLUBS) },
  KLPGA: {
    name: 'KLPGA',
    note: '전체 추정 · LPGA 대비 볼·클럽속도 97%, 캐리·높이 96% 가정. KLPGA 공식 평균 아님.',
    clubs: withEstimatedWedges(LPGA_CLUBS.map((c) => ({
      ...c, speed: c.speed * 0.97, clubSpeed: c.clubSpeed * 0.97,
      carry: c.carry * 0.96, apex: c.apex * 0.96, estimated: true,
    }))),
  },
};

function getAirDensity(tempCelsius: number) {
  const tempKelvin = tempCelsius + 273.15;
  const p0 = 101325;
  const R = 287.058;
  return p0 / (R * tempKelvin);
}

function getCd(velocity: number) {
  return 0.23 + Math.max(0, 30 - velocity) * 0.003;
}

function getCl(spinRps: number, velocity: number) {
  if (velocity < 1) return 0;
  const spinSpeed = spinRps * 2 * Math.PI * BALL_RADIUS;
  const spinRatio = spinSpeed / velocity;
  return Math.min(0.40, 0.60 * spinRatio);
}

function impactLaunch(shot: Launch, env: Environment): Launch {
  const lie = getLie(env.lie);
  const rainSpinMult = env.rainLevel === 'HEAVY' ? 0.85 : env.rainLevel === 'LIGHT' ? 0.95 : 1;
  return {
    ...shot,
    ballSpeedMph: shot.ballSpeedMph * lie.speed,
    launchAngleDeg: Math.max(1, shot.launchAngleDeg + lie.launchDelta),
    spinRateRpm: shot.spinRateRpm * lie.spin * rainSpinMult,
  };
}

function calculateTrajectory(shot: Launch, env: Environment = REFERENCE_ENV, recordPath = true, timeStep = 0.01) {
  if (!Number.isFinite(timeStep) || timeStep <= 0 || timeStep > 0.05) throw new Error('비행 적분 시간 간격은 0초 초과 0.05초 이하여야 합니다.');
  const appliedLaunch = impactLaunch(shot, env);
  const { ballSpeedMph, launchAngleDeg, spinRateRpm, spinAxisDeg, aimAngleDeg, dragScale, liftScale } = appliedLaunch;
  const { windSpeedMs, windDirDeg, tempC, elevationDeltaM, rainLevel } = env;
  const v0 = ballSpeedMph * MPH_TO_MS;
  const theta = (launchAngleDeg * Math.PI) / 180;
  const phi = (aimAngleDeg * Math.PI) / 180;
  let vx = v0 * Math.cos(theta) * Math.sin(phi);
  let vy = v0 * Math.sin(theta);
  let vz = v0 * Math.cos(theta) * Math.cos(phi);
  const rainDragMult = rainLevel === 'HEAVY' ? 1.08 : rainLevel === 'LIGHT' ? 1.03 : 1;
  const spinRps = spinRateRpm / 60;
  const spinAxisRad = (spinAxisDeg * Math.PI) / 180;
  const axisX = -Math.cos(spinAxisRad) * Math.cos(phi);
  const axisY = Math.sin(spinAxisRad);
  const axisZ = Math.cos(spinAxisRad) * Math.sin(phi);
  const windRad = (windDirDeg * Math.PI) / 180;
  const windVx = windSpeedMs * Math.sin(windRad);
  const windVz = -windSpeedMs * Math.cos(windRad);
  const rho = getAirDensity(tempC);
  const dt = timeStep;
  let x = 0, y = 0, z = 0;
  let t = 0;
  const path = [{ x: 0, y: 0, z: 0, time: 0, v: v0 }];
  let maxApex = y;
  let landed = false;
  const acceleration = (ux: number, uy: number, uz: number, time: number) => {
    const rx = ux - windVx;
    const rz = uz - windVz;
    const speed = Math.hypot(rx, uy, rz);
    const pressure = 0.5 * rho * speed * speed * BALL_AREA / BALL_MASS;
    const drag = pressure * getCd(speed) * dragScale * rainDragMult;
    const lift = pressure * getCl(spinRps * Math.exp(-0.04 * time), speed) * liftScale;
    const lx = axisY * rz - axisZ * uy;
    const ly = axisZ * rx - axisX * rz;
    const lz = axisX * uy - axisY * rx;
    // Keep the sin(angle) factor: a spin axis parallel to airflow produces no Magnus force.
    return {
      x: speed > 0 ? (-drag * rx + lift * lx) / speed : 0,
      y: (speed > 0 ? (-drag * uy + lift * ly) / speed : 0) - GRAVITY,
      z: speed > 0 ? (-drag * rz + lift * lz) / speed : 0,
    };
  };
  while (t < 20 && !landed) {
    const previous = { x, y, z, vx, vy, vz, t };
    const a = acceleration(vx, vy, vz, t);
    const midVx = vx + a.x * dt / 2;
    const midVy = vy + a.y * dt / 2;
    const midVz = vz + a.z * dt / 2;
    const midA = acceleration(midVx, midVy, midVz, t + dt / 2);
    x += midVx * dt;
    y += midVy * dt;
    z += midVz * dt;
    vx += midA.x * dt;
    vy += midA.y * dt;
    vz += midA.z * dt;
    t += dt;
    maxApex = Math.max(maxApex, y);

    // Intersect only a descending crossing; an unreachable raised green is not a landing.
    if (vy < 0 && previous.y >= elevationDeltaM && y <= elevationDeltaM) {
      const fraction = (previous.y - elevationDeltaM) / (previous.y - y);
      x = previous.x + (x - previous.x) * fraction;
      y = elevationDeltaM;
      z = previous.z + (z - previous.z) * fraction;
      vx = previous.vx + (vx - previous.vx) * fraction;
      vy = previous.vy + (vy - previous.vy) * fraction;
      vz = previous.vz + (vz - previous.vz) * fraction;
      t = previous.t + dt * fraction;
      landed = true;
    }
    if (recordPath) path.push({ x, y, z, time: t, v: Math.hypot(vx, vy, vz) });
    if (y < Math.min(0, elevationDeltaM) - 5) break;
  }
  return {
    path, landed, appliedLaunch, carryYds: z * M_TO_YDS, sideOffsetYds: x * M_TO_YDS,
    apexYds: maxApex * M_TO_YDS, flightTimeSec: t,
    landingAngleDeg: Math.abs(Math.atan2(vy, Math.hypot(vx, vz)) * 180 / Math.PI),
  };
}

function clubLaunch(club: ClubData & AeroModel): Launch {
  return {
    ballSpeedMph: club.speed, launchAngleDeg: club.launch, spinRateRpm: club.spin,
    spinAxisDeg: 0, aimAngleDeg: 0, dragScale: club.dragScale, liftScale: club.liftScale,
  };
}

function calibrateClub(club: ClubData, spinAxisDeg = 0): CalibratedClub {
  const launch = (dragScale: number, liftScale: number): Launch => ({
    ...clubLaunch({ ...club, dragScale, liftScale }), spinAxisDeg,
  });
  let dragScale = 1;
  let liftScale = 1;
  let error = Infinity;
  for (let iteration = 0; iteration < 24; iteration++) {
    const shot = launch(dragScale, liftScale);
    const base = calculateTrajectory(shot, REFERENCE_ENV, false);
    const r = (base.carryYds - club.carry) / club.carry;
    const h = (base.apexYds - club.apex) / club.apex;
    error = Math.max(Math.abs(r), Math.abs(h));
    if (error < 0.0005) break;
    const step = 0.02;
    const drag = calculateTrajectory({ ...shot, dragScale: dragScale * Math.exp(step) }, REFERENCE_ENV, false);
    const lift = calculateTrajectory({ ...shot, liftScale: liftScale * Math.exp(step) }, REFERENCE_ENV, false);
    const a = (drag.carryYds - base.carryYds) / club.carry / step;
    const b = (lift.carryYds - base.carryYds) / club.carry / step;
    const c = (drag.apexYds - base.apexYds) / club.apex / step;
    const d = (lift.apexYds - base.apexYds) / club.apex / step;
    const determinant = a * d - b * c;
    if (Math.abs(determinant) < 1e-8) break;
    const deltaDrag = Math.max(-0.5, Math.min(0.5, (-r * d + b * h) / determinant));
    const deltaLift = Math.max(-0.5, Math.min(0.5, (c * r - a * h) / determinant));
    dragScale = Math.max(0.15, Math.min(4, dragScale * Math.exp(deltaDrag)));
    liftScale = Math.max(0.15, Math.min(4, liftScale * Math.exp(deltaLift)));
  }
  const final = calculateTrajectory(launch(dragScale, liftScale), REFERENCE_ENV, false);
  error = Math.max(Math.abs(final.carryYds - club.carry) / club.carry, Math.abs(final.apexYds - club.apex) / club.apex);
  return {
    ...club, dragScale, liftScale,
    calibrationError: final.landed && Number.isFinite(error) && error < 0.003 ? null : `${club.name} 기준 캐리·높이 보정 실패: 입력한 거리·높이·발사 조건의 조합을 확인하세요.`,
  };
}

type Trajectory = ReturnType<typeof calculateTrajectory>;

function projectTopView(trajectory: Trajectory, targetYds: number, progress: number, unit: DistanceUnit = 'yd') {
  const maxForward = Math.max(targetYds * YDS_TO_M, ...trajectory.path.map(p => p.z), 30);
  const maxLateral = Math.max(...trajectory.path.map(p => Math.abs(p.x)), 1);
  const minForward = Math.min(0, ...trajectory.path.map(p => p.z));
  const scale = Math.min(260 / (maxForward - minForward), 290 / maxLateral);
  const landingZoomFactor = 4;
  const targetSource = { x: 0, z: targetYds * YDS_TO_M };
  const targetOverview = {
    x: 400 + targetSource.x * scale,
    y: 310 + minForward * scale - targetSource.z * scale,
  };
  const zoomTarget = { x: 125, y: 83 };
  const projectTargetZoom = (point: { x: number; z: number }) => ({
    x: zoomTarget.x + (400 + point.x * scale - targetOverview.x) * landingZoomFactor,
    y: zoomTarget.y + (310 + minForward * scale - point.z * scale - targetOverview.y) * landingZoomFactor,
  });
  const tickStep = distanceToYards([5, 10, 20, 40, 80, 160, 320, 640]
    .find(value => distanceToYards(value, unit) * YDS_TO_M * scale >= 48) ?? 1280, unit);
  const tickCount = Math.floor(330 / (tickStep * YDS_TO_M * scale));
  const lateralTicks = Array.from({ length: tickCount * 2 + 1 }, (_, i) => (i - tickCount) * tickStep)
    .filter(yd => yd !== 0);
  const originY = 310 + minForward * scale;
  const project = (point: { x: number; z: number }) => ({
    x: 400 + point.x * scale, y: originY - point.z * scale,
  });
  const count = Math.max(1, Math.min(trajectory.path.length, Math.floor(trajectory.path.length * progress)));
  const points = trajectory.path.slice(0, count).map(project);
  const zoomPoints = trajectory.path.slice(0, count).map(projectTargetZoom);
  return {
    scale, originY, lateralTicks,
    path: points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' '),
    ball: points[points.length - 1],
    landing: project(trajectory.path[trajectory.path.length - 1]),
    target: project({ x: 0, z: targetYds * YDS_TO_M }),
    landingZoom: {
      factor: landingZoomFactor,
      landing: projectTargetZoom(trajectory.path[trajectory.path.length - 1]),
      target: zoomTarget,
      path: zoomPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' '),
    },
  };
}

type Recommendation = {
  club: CalibratedClub;
  playAsYds: number | null;
  requiredSpeed: number | null;
  aimOffsetYds: number;
  trajectory: Trajectory;
  uncorrected: Trajectory;
  horizontalYds: number;
  warning: string | null;
};

function solveSpeed(shot: Launch, env: Environment, targetYds: number, maxSpeed: number) {
  if (!Number.isFinite(targetYds) || targetYds <= 0 || !Number.isFinite(maxSpeed) || maxSpeed <= 0) return null;
  let low = 0;
  let high: number | null = null;
  // Strong winds can make range non-monotonic; bracket the first reachable speed, not just full speed.
  for (let i = 0; i <= 32; i++) {
    const speed = maxSpeed * i / 32;
    const result = calculateTrajectory({ ...shot, ballSpeedMph: speed }, env, false);
    if (result.landed && result.carryYds >= targetYds) {
      high = speed;
      break;
    }
    low = speed;
  }
  if (high === null) return null;
  let upper = high;
  for (let i = 0; i < 25; i++) {
    const mid = (low + upper) / 2;
    const result = calculateTrajectory({ ...shot, ballSpeedMph: mid }, env, false);
    if (!result.landed || result.carryYds < targetYds) low = mid;
    else upper = mid;
  }
  const speed = (low + upper) / 2;
  const result = calculateTrajectory({ ...shot, ballSpeedMph: speed }, env, false);
  return result.landed && Math.abs(result.carryYds - targetYds) <= 0.02 ? speed : null;
}

function solveAimedShot(shot: Launch, env: Environment, targetYds: number, maxSpeed: number) {
  let requiredSpeed = solveSpeed(shot, env, targetYds, maxSpeed);
  if (requiredSpeed === null) return null;
  let aimAngleDeg = shot.aimAngleDeg;
  let trajectory = calculateTrajectory({ ...shot, ballSpeedMph: requiredSpeed }, env);
  for (let i = 0; i < 6; i++) {
    if (Math.abs(trajectory.sideOffsetYds) < 0.02) break;
    aimAngleDeg -= Math.atan2(trajectory.sideOffsetYds, trajectory.carryYds) * 180 / Math.PI;
    requiredSpeed = solveSpeed({ ...shot, aimAngleDeg }, env, targetYds, maxSpeed);
    if (requiredSpeed === null) return null;
    trajectory = calculateTrajectory({ ...shot, ballSpeedMph: requiredSpeed, aimAngleDeg }, env);
  }
  const missYds = Math.hypot(trajectory.carryYds - targetYds, trajectory.sideOffsetYds);
  return trajectory.landed && missYds <= 0.15 ? { requiredSpeed, aimAngleDeg, trajectory } : null;
}

function recommendShot(
  clubs: CalibratedClub[], targetLaserYds: number, env: Environment,
  selectedClubId = 'AUTO', customShot?: Launch,
): Recommendation {
  const horizontalYds = Math.sqrt(Math.max(0, (targetLaserYds * YDS_TO_M) ** 2 - env.elevationDeltaM ** 2)) * M_TO_YDS;
  const candidates = selectedClubId === 'AUTO' && !customShot
    ? [...clubs].sort((a, b) => a.carry - b.carry)
    : clubs.filter((c) => c.id === selectedClubId);
  if (candidates.length === 0) throw new Error('선택한 투어에 해당 클럽이 없습니다.');
  let club = candidates[candidates.length - 1];
  let solution: ReturnType<typeof solveAimedShot> = null;
  for (const candidate of candidates) {
    if (candidate.calibrationError) continue;
    const launch = customShot ?? clubLaunch(candidate);
    const aimed = solveAimedShot(launch, env, horizontalYds, customShot ? 210 : candidate.speed);
    if (aimed !== null) {
      club = candidate;
      solution = aimed;
      break;
    }
  }
  const launch = customShot ?? clubLaunch(club);
  const baselineSpeed = customShot ? customShot.ballSpeedMph
    : solveSpeed(launch, REFERENCE_ENV, horizontalYds, club.speed) ?? club.speed;
  const uncorrected = calculateTrajectory({ ...launch, ballSpeedMph: baselineSpeed }, env);
  const fail = (warning: string): Recommendation => ({
    club, playAsYds: null, requiredSpeed: null, aimOffsetYds: uncorrected.sideOffsetYds,
    trajectory: uncorrected, uncorrected, horizontalYds, warning,
  });
  if (club.calibrationError) return fail(club.calibrationError);
  if (targetLaserYds * YDS_TO_M <= Math.abs(env.elevationDeltaM)) {
    return fail('레이저 거리는 고도 차이보다 커야 합니다.');
  }
  if (solution === null) return fail('현재 조건에서 선택 가능한 클럽·볼속도·조준으로 목표에 도달할 수 없습니다. 거리를 줄이거나 다른 클럽을 선택하세요.');
  const { requiredSpeed, aimAngleDeg, trajectory } = solution;
  // Play-as is the calm, level carry of the required launch, not 2 * target - actual carry.
  const calm = calculateTrajectory({ ...launch, ballSpeedMph: requiredSpeed, aimAngleDeg: 0 }, REFERENCE_ENV, false);
  return {
    club, playAsYds: Math.hypot(calm.carryYds, calm.sideOffsetYds), requiredSpeed,
    aimOffsetYds: -Math.tan(aimAngleDeg * Math.PI / 180) * horizontalYds,
    trajectory, uncorrected, horizontalYds, warning: null,
  };
}

export default function App() {
  const [calcMode, setCalcMode] = useState('GENERAL');
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>('yd');
  const [targetInputYds, setTargetInputYds] = useState('140');
  const targetValue = Number(targetInputYds);
  const targetValid = targetInputYds.trim() !== '' && Number.isFinite(targetValue) && targetValue >= 50 && targetValue <= 350;
  const targetDistYds = targetValid ? targetValue : 140;
  const [selectedTour, setSelectedTour] = useState<TourId>('LPGA');
  const [selectedClubId, setSelectedClubId] = useState('AUTO');
  const [viewMode, setViewMode] = useState<'SIDE' | 'TOP'>('SIDE');

  const [windUnit, setWindUnit] = useState('m/s');
  const [windSpeedVal, setWindSpeedVal] = useState(5.0);

  const [tempUnit, setTempUnit] = useState('C');
  const [tempVal, setTempVal] = useState(20);

  const [windDirDeg, setWindDirDeg] = useState(0);
  const [elevationM, setElevationM] = useState(0);
  const [rainLevel, setRainLevel] = useState<RainLevel>('NONE');
  const [lie, setLie] = useState<LieId>('FAIRWAY');

  const [personalState, setPersonalState] = useState(readPersonalProfiles);
  const [storageError, setStorageError] = useState<string | null>(null);

  const [isAnimating, setIsAnimating] = useState(false);
  const [animProgress, setAnimProgress] = useState(1.0);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const windSpeedMs = useMemo(() => {
    if (windUnit === 'mph') return windSpeedVal * MPH_TO_MS;
    if (windUnit === 'km/h') return windSpeedVal * KMH_TO_MS;
    return windSpeedVal;
  }, [windSpeedVal, windUnit]);

  const tempCelsius = useMemo(() => {
    if (tempUnit === 'F') return (tempVal - 32) * (5 / 9);
    return tempVal;
  }, [tempVal, tempUnit]);

  const tourClubs = useMemo(() => TOURS[selectedTour].clubs.map(club => calibrateClub(club)), [selectedTour]);
  const environment = useMemo<Environment>(() => ({
    windSpeedMs, windDirDeg, tempC: tempCelsius, elevationDeltaM: elevationM, rainLevel, lie,
  }), [windSpeedMs, windDirDeg, tempCelsius, elevationM, rainLevel, lie]);
  const customClub = tourClubs.find((c) => c.id === selectedClubId) ?? tourClubs.find((c) => c.id === '7I') ?? tourClubs[0];
  const profile = personalState.profiles[customClub.id];
  const personal = useMemo(() => resolvePersonalClub(customClub, profile ?? {}, distanceUnit), [customClub, profile, distanceUnit]);
  const recommendation = useMemo(() => recommendShot(
    tourClubs, targetDistYds, environment,
    calcMode === 'TRACKMAN' ? customClub.id : selectedClubId,
  ), [tourClubs, targetDistYds, environment, calcMode, customClub, selectedClubId]);
  const isCustom = calcMode === 'TRACKMAN';
  const activeClub = isCustom ? personal.club : recommendation.club;
  const trajResult = useMemo(() => calculateTrajectory({
    ...clubLaunch(activeClub),
    spinAxisDeg: isCustom ? personal.axis : 0,
  }, environment), [activeClub, isCustom, personal.axis, environment]);
  const displayedDistance = trajResult.landed ? trajResult.carryYds : null;
  const distanceAdjustment = displayedDistance === null ? null
    : displayedDistance - recommendation.horizontalYds;
  const targetError = targetValid ? null : `목표 거리는 ${formatDistance(50, distanceUnit, 4)}–${formatDistance(350, distanceUnit, 4)} 범위로 입력하세요. 입력을 수정할 때까지 궤적은 기본 목표 기준입니다.`;
  const geometryError = targetValid && targetDistYds * YDS_TO_M <= Math.abs(elevationM) ? '레이저 거리는 고도 차이보다 커야 합니다.' : null;
  const displayWarning = targetError ?? geometryError ?? (isCustom && personal.errors.length ? personal.errors.join(' ') : null) ?? activeClub.calibrationError
    ?? (!trajResult.landed ? '샷이 그린 높이의 하강 착지점에 도달하지 못했습니다. 예상 캐리를 산출할 수 없습니다.' : null);
  const sideOffsetYds = trajResult.sideOffsetYds;

  const saveProfiles = (profiles: PersonalProfiles) => {
    setPersonalState({ profiles, error: null });
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profiles));
      setStorageError(null);
    } catch (error) {
      setStorageError(`개인 입력을 저장하지 못했습니다. 현재 화면에는 적용되지만 새로고침하면 사라질 수 있습니다: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const updatePersonalField = (field: PersonalField, value: string) => {
    saveProfiles({
      ...personalState.profiles,
      [customClub.id]: { ...profile, [field]: value },
    });
  };
  const resetPersonalClub = () => {
    const profiles = { ...personalState.profiles };
    delete profiles[customClub.id];
    saveProfiles(profiles);
  };

  useEffect(() => {
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
    setAnimProgress(1);
    setIsAnimating(false);
  }, [trajResult]);

  const triggerShotAnimation = () => {
    if (animationFrameRef.current !== null) return;
    setIsAnimating(true);
    setAnimProgress(0);

    const startTime = performance.now();
    const duration = Math.max(1200, trajResult.flightTimeSec * 400);

    const animateFrame = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1.0, elapsed / duration);
      setAnimProgress(progress);

      if (progress < 1.0) {
        animationFrameRef.current = requestAnimationFrame(animateFrame);
      } else {
        animationFrameRef.current = null;
        setIsAnimating(false);
      }
    };

    animationFrameRef.current = requestAnimationFrame(animateFrame);
  };

  const resetShotAnimation = () => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setAnimProgress(1.0);
    setIsAnimating(false);
  };

  const changeWindUnit = (unit: string) => {
    const factor = unit === 'mph' ? MPH_TO_MS : unit === 'km/h' ? KMH_TO_MS : 1;
    setWindSpeedVal(windSpeedMs / factor);
    setWindUnit(unit);
  };

  const changeTempUnit = (unit: string) => {
    setTempVal(unit === 'F' ? tempCelsius * (9 / 5) + 32 : tempCelsius);
    setTempUnit(unit);
  };

  const airDensityText = useMemo(() => {
    return String(getAirDensity(tempCelsius).toFixed(3));
  }, [tempCelsius]);

  // Enhanced High-Contrast SVG Trajectory & Animation Renderer
  const svgPathData = useMemo(() => {
    const path = trajResult.path;
    const targetDistM = recommendation.horizontalYds * YDS_TO_M;
    const maxDistM = Math.max(targetDistM * 1.15, ...path.map((pt) => pt.z * 1.1), 80);
    const startX = 70;
    const width = 800;
    const scaleX = (width - 140) / maxDistM;
    const maxHeight = Math.max(trajResult.apexYds * YDS_TO_M, elevationM + 10, 20);
    const minHeight = Math.min(elevationM, 0);
    const scaleY = 220 / (maxHeight - minHeight);
    const groundY = 300 + minHeight * scaleY;

    const drawCount = Math.max(1, Math.floor(path.length * animProgress));
    let d = "";

    for (let i = 0; i < drawCount; i++) {
      const pt = path[i];
      const px = startX + pt.z * scaleX;
      const py = groundY - pt.y * scaleY;
      if (i === 0) d += `M ${px} ${py}`;
      else d += ` L ${px} ${py}`;
    }

    const currentPt = path[Math.min(drawCount - 1, path.length - 1)];
    const ballPos = {
      x: startX + currentPt.z * scaleX,
      y: groundY - currentPt.y * scaleY
    };

    const pinPos = {
      x: startX + targetDistM * scaleX,
      y: groundY - elevationM * scaleY
    };

    return { pathString: d, ballPos, pinPos, groundY, startX, scaleX, scaleY };
  }, [trajResult, animProgress, recommendation.horizontalYds, elevationM]);
  const topView = useMemo(() => projectTopView(trajResult, recommendation.horizontalYds, animProgress, distanceUnit),
    [trajResult, recommendation.horizontalYds, animProgress, distanceUnit]);

  return (
    <div className="flex flex-col min-h-screen lg:h-screen w-full bg-slate-950 text-slate-100 font-sans lg:overflow-hidden">
      <header className="shrink-0 border-b border-amber-400/30 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-4 py-3">
        <h1 className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-lg sm:text-2xl font-black tracking-wide text-amber-300 drop-shadow-lg">
            SY-Shot Distance Estamater
          </span>
          <span className="text-xs sm:text-sm font-mono font-normal italic tracking-normal text-slate-300">
            ver26.1107-1f-ad
          </span>
        </h1>
        <div role="group" aria-label="거리 단위 선택" className="mt-2 flex items-center gap-2 text-xs">
          <span className="text-slate-300">거리 단위</span>
          {([{ id: 'm', label: '미터 (m)' }, { id: 'yd', label: '야드 (yd)' }] as const).map(({ id, label }) => (
            <button key={id} onClick={() => setDistanceUnit(id)} aria-pressed={distanceUnit === id}
              className={`rounded-lg border px-3 py-1 font-bold ${distanceUnit === id ? 'border-sky-400 bg-sky-500/20 text-sky-300' : 'border-slate-700 text-slate-400'}`}>
              {label}
            </button>
          ))}
        </div>
      </header>
      <div className="flex flex-col lg:flex-row flex-1 lg:min-h-0">
      
      {/* LEFT: HIGH-CONTRAST VISUALIZER & ANIMATION CANVAS */}
      <div className="relative flex-1 min-h-[480px] lg:min-h-0 lg:h-full bg-slate-950 border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col">
        
        {/* Top Header Bar */}
        <div className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 bg-slate-900/95 p-3.5 rounded-2xl border border-slate-700/80 shadow-2xl">
          
          <div className="flex items-center space-x-3">
            <span className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/40 flex items-center justify-center">
              <TargetIcon size={22} />
            </span>
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">목표 레이저 거리</span>
              <div className="flex items-center space-x-1">
                <DistanceInput
                  label="목표 레이저 거리"
                  min={50} max={350} unit={distanceUnit}
                  value={targetInputYds}
                  onChange={setTargetInputYds}
                  className="w-20 bg-slate-950 border border-slate-700 rounded-lg text-xl font-black text-white px-2 py-0.5 text-center focus:outline-none focus:border-emerald-500"
                />
                <span className="text-xs text-slate-400 font-bold">{distanceUnit}</span>
              </div>
            </div>
          </div>

          {/* Caddie Play-As Distance Recommendation */}
          <div className="flex items-center space-x-3 bg-gradient-to-r from-indigo-950 to-slate-900 border border-indigo-500/50 px-4 py-2 rounded-xl">
            <div className="text-right">
              <span className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider block">
                환경반영예상캐리
              </span>
              <div className="flex items-baseline justify-end space-x-1">
                <span data-testid="play-as" className="text-xl sm:text-2xl font-black text-indigo-200">{displayWarning || displayedDistance === null ? '—' : formatDistance(displayedDistance, distanceUnit)}</span>
              </div>
            </div>
            <div className={`p-1.5 rounded-lg font-black text-xs ${distanceAdjustment !== null && distanceAdjustment > 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'}`}>
              {displayWarning || distanceAdjustment === null ? '입력·산출 확인'
                : Math.abs(distanceFromYards(distanceAdjustment, distanceUnit)) < 0.05 ? '목표 일치' : `목표보다 ${formatDistance(Math.abs(distanceAdjustment), distanceUnit)} ${distanceAdjustment > 0 ? '김' : '짧음'}`}
            </div>
          </div>

          {/* Precise Aim Offset */}
          <div className="flex items-center space-x-3 bg-slate-900/90 px-3.5 py-2 rounded-xl border border-slate-700">
            <span className="text-sky-400 flex items-center justify-center">
              <CompassIcon size={20} />
            </span>
            <div>
              <span className="text-[10px] text-slate-400 block font-medium">예상 좌우 편차</span>
              <span className="text-xs font-black text-slate-200">
                {displayWarning ? '—' : Math.abs(distanceFromYards(sideOffsetYds, distanceUnit)) < 0.05 ? '중앙 예상'
                  : `${sideOffsetYds > 0 ? '우측' : '좌측'} ${formatDistance(Math.abs(sideOffsetYds), distanceUnit)} 예상`}
              </span>
            </div>
          </div>

        </div>

        <div role="group" aria-label="시뮬레이션 뷰 선택" className="mx-4 mt-3 flex gap-2">
          {([{ id: 'SIDE', label: '측면 보기' }, { id: 'TOP', label: '위에서 보기 (좌우 편차)' }] as const).map((view) => (
            <button key={view.id} onClick={() => setViewMode(view.id)} aria-pressed={viewMode === view.id}
              className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${viewMode === view.id ? 'bg-sky-500/20 text-sky-300 border-sky-400' : 'text-slate-400 border-slate-700'}`}>
              {view.label}
            </button>
          ))}
        </div>
        {/* HIGH CONTRAST SVG VECTOR TRAJECTORY DISPLAY */}
        <div className="w-full flex-1 min-h-[220px] lg:min-h-0 flex items-center justify-center p-4 bg-slate-950">
          {viewMode === 'TOP' ? (
            <svg aria-label="위에서 본 비행 궤적" data-testid="top-view" viewBox="0 0 800 380" className="w-full h-full max-h-[520px] rounded-2xl border border-slate-800 shadow-2xl">
              <rect width="800" height="380" rx="16" fill="#022c22" />
              <text x="400" y="23" textAnchor="middle" fill="#e2e8f0" fontSize="12">목표 방향 ↑ · 좌측 ← → 우측 · 가로·세로 동일 축척</text>
              {topView.lateralTicks.map((yd) => {
                const x = 400 + yd * YDS_TO_M * topView.scale;
                if (x < 65 || x > 735) return null;
                return (
                  <g key={yd}>
                    <line x1={x} y1="40" x2={x} y2="310" stroke="#065f46" strokeDasharray="3 4" />
                    <DistanceTick yards={yd} unit={distanceUnit} x={x} y={329} signed />
                  </g>
                );
              })}
              {distanceGrid((topView.originY - 40) / topView.scale * M_TO_YDS, distanceUnit).map((yd) => {
                const y = topView.originY - yd * YDS_TO_M * topView.scale;
                if (y < 40 || y > 310) return null;
                return <g key={yd}>
                  <line x1="65" y1={y} x2="735" y2={y} stroke="#065f46" />
                  <DistanceTick yards={yd} unit={distanceUnit} x={55} y={y} textAnchor="end" />
                </g>;
              })}
              <line x1="400" y1="40" x2="400" y2={topView.originY} stroke="#fbbf24" strokeDasharray="6 4" />
              <circle cx={topView.target.x} cy={topView.target.y} r="10" fill="#059669" stroke="#fbbf24" strokeWidth="2" />
              <text x={topView.target.x + 15} y={topView.target.y - 7} fill="#fbbf24" fontSize="11">목표 {formatDistance(recommendation.horizontalYds, distanceUnit)}</text>
              <circle cx="400" cy={topView.originY} r="4" fill="#ffffff" />
              <text x="415" y={topView.originY + 4} fill="#cbd5e1" fontSize="10">출발</text>
              {animProgress >= 1 && (
                <g data-testid="top-landing">
                  <line x1="400" y1={topView.landing.y} x2={topView.landing.x} y2={topView.landing.y} stroke="#f472b6" strokeDasharray="3 3" />
                  <circle cx={topView.landing.x} cy={topView.landing.y} r="7" fill="none" stroke="#f472b6" strokeWidth="2" />
                  <text x={topView.landing.x + (sideOffsetYds >= 0 ? 14 : -14)} y={topView.landing.y + 18}
                    textAnchor={sideOffsetYds >= 0 ? 'start' : 'end'} fill="#f9a8d4" fontSize="11">
                    {trajResult.landed ? '착지' : '비행 종료'} · {Math.abs(distanceFromYards(sideOffsetYds, distanceUnit)) < 0.05 ? '중앙' : `${sideOffsetYds > 0 ? '우측' : '좌측'} ${formatDistance(Math.abs(sideOffsetYds), distanceUnit)}`}
                  </text>
                </g>
              )}
              <path data-testid="top-trajectory" d={topView.path} fill="none" stroke="#38bdf8" strokeWidth="3" />
              <circle data-testid="top-ball" cx={topView.ball.x} cy={topView.ball.y} r="5" fill="#ffffff" stroke="#38bdf8" strokeWidth="2" />
              <WindDirectionControl degrees={windDirDeg} speed={windSpeedVal} unit={windUnit} onChange={setWindDirDeg} />
              <text x="400" y="360" textAnchor="middle" fill="#cbd5e1" fontSize="11">
                {displayWarning ? '입력·산출 확인 필요 · 참고 궤적 (예상캐리 없음)' : '수평면 투영 · 높이는 측면 보기에서 확인 · 좌우 편차는 목표선 기준'}
              </text>
              <svg x="535" y="48" width="245" height="160" viewBox="0 0 250 160" aria-label="착지점 확대 보기">
                <rect x="1" y="1" width="248" height="158" rx="12" fill="#020617" fillOpacity="0.94" stroke="#f472b6" strokeWidth="2" />
                <text x="125" y="17" textAnchor="middle" fill="#f9a8d4" fontSize="11" fontWeight="700">
                  목표 기준 착지 확대 · {topView.landingZoom.factor}×
                </text>
                <line x1="20" y1={topView.landingZoom.target.y} x2="230" y2={topView.landingZoom.target.y}
                  stroke="#065f46" strokeDasharray="3 4" />
                <line x1={topView.landingZoom.target.x} y1="26" x2={topView.landingZoom.target.x} y2="140"
                  stroke="#065f46" strokeDasharray="3 4" />
                <path d={topView.landingZoom.path} fill="none" stroke="#38bdf8" strokeWidth="2.5" />
                <line x1={topView.landingZoom.target.x} y1={topView.landingZoom.target.y}
                  x2={topView.landingZoom.landing.x} y2={topView.landingZoom.target.y}
                  stroke="#f472b6" strokeDasharray="3 2" />
                <line x1={topView.landingZoom.landing.x} y1={topView.landingZoom.target.y}
                  x2={topView.landingZoom.landing.x} y2={topView.landingZoom.landing.y}
                  stroke="#f472b6" strokeDasharray="3 2" />
                <circle cx={topView.landingZoom.target.x} cy={topView.landingZoom.target.y} r="5"
                  fill="#059669" stroke="#fbbf24" strokeWidth="2" />
                <circle cx={topView.landingZoom.landing.x} cy={topView.landingZoom.landing.y} r="5"
                  fill="#f472b6" stroke="#fff" strokeWidth="1.5" />
                <text x="125" y="153" textAnchor="middle" fill="#cbd5e1" fontSize="9">
                  목표 대비 {Math.abs(distanceFromYards(sideOffsetYds, distanceUnit)) < 0.05 ? '좌우 중앙' : `${sideOffsetYds > 0 ? '우측' : '좌측'} ${formatDistance(Math.abs(sideOffsetYds), distanceUnit)}`} · 분홍 점: 착지
                </text>
              </svg>
            </svg>
          ) : (
          <svg aria-label="측면 비행 궤적" viewBox="0 0 800 380" className="w-full h-full max-h-[520px] rounded-2xl border border-slate-800 shadow-2xl">
            <defs>
              {/* Vibrant Sky Gradient */}
              <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#020617" />
                <stop offset="60%" stopColor="#0f172a" />
                <stop offset="100%" stopColor="#1e293b" />
              </linearGradient>

              {/* Fairway Grass Gradient */}
              <linearGradient id="grassGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#059669" />
                <stop offset="100%" stopColor="#022c22" />
              </linearGradient>

              {/* Neon Neon Glow Effect for Animated Ball & Arc */}
              <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="5" result="blur1" />
                <feGaussianBlur stdDeviation="10" result="blur2" />
                <feMerge>
                  <feMergeNode in="blur2" />
                  <feMergeNode in="blur1" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Deep Contrast Background */}
            <rect x="0" y="0" width="800" height="380" fill="url(#skyGrad)" rx="16" />

            {/* Fairway Surface */}
            <rect x="0" y={svgPathData.groundY} width="800" height={380 - svgPathData.groundY} fill="url(#grassGrad)" />
            <line x1="0" y1={svgPathData.groundY} x2="800" y2={svgPathData.groundY} stroke="#10b981" strokeWidth="2" />

            {/* Distance Grid & Yardage Lines */}
            {distanceGrid(660 / svgPathData.scaleX * M_TO_YDS, distanceUnit).map((yd) => {
              const xPos = svgPathData.startX + (yd * YDS_TO_M) * svgPathData.scaleX;
              if (xPos > 760) return null;
              return (
                <g key={yd}>
                  <line x1={xPos} y1="40" x2={xPos} y2={svgPathData.groundY} stroke="#334155" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
                  <DistanceTick yards={yd} unit={distanceUnit} x={xPos} y={332} />
                </g>
              );
            })}

            {/* Target Green Surface & Elevated Platform */}
            <ellipse cx={svgPathData.pinPos.x} cy={svgPathData.pinPos.y + 2} rx="36" ry="10" fill="#34d399" filter="url(#neonGlow)" opacity="0.4" />
            <ellipse cx={svgPathData.pinPos.x} cy={svgPathData.pinPos.y + 2} rx="30" ry="8" fill="#059669" stroke="#34d399" strokeWidth="2" />

            {/* Elevated Flag Pole & Animated Red Flag */}
            <line x1={svgPathData.pinPos.x} y1={svgPathData.pinPos.y} x2={svgPathData.pinPos.x} y2={svgPathData.pinPos.y - 50} stroke="#ffffff" strokeWidth="3.5" filter="url(#neonGlow)" />
            <polygon points={`${svgPathData.pinPos.x},${svgPathData.pinPos.y - 50} ${svgPathData.pinPos.x - 22},${svgPathData.pinPos.y - 42} ${svgPathData.pinPos.x},${svgPathData.pinPos.y - 34}`} fill="#ef4444" stroke="#f8fafc" strokeWidth="1" />

            <text x="400" y="355" fill="#cbd5e1" fontSize="11" textAnchor="middle">
              {displayWarning ? '입력·산출 확인 필요 · 참고 궤적 (예상캐리 없음)'
                : isCustom ? '입력한 선수 샷 · 환경반영 예상 궤적' : `${selectedTour} ${activeClub.name} 평균 샷 · 환경반영 예상 궤적`}
            </text>

            {/* Animated High-Glow Trajectory Path */}
            {svgPathData.pathString && (
              <>
                {/* Outer Neon Cyan Trail */}
                <path d={svgPathData.pathString} fill="none" stroke="#0ea5e9" strokeWidth="6" opacity="0.5" filter="url(#neonGlow)" />
                {/* Inner Bright Core */}
                <path d={svgPathData.pathString} fill="none" stroke="#38bdf8" strokeWidth="3" />
              </>
            )}

            {/* Animated High-Brightness Golf Ball */}
            <g transform={`translate(${svgPathData.ballPos.x}, ${svgPathData.ballPos.y})`}>
              <circle cx="0" cy="0" r="10" fill="#38bdf8" opacity="0.4" filter="url(#neonGlow)" />
              <circle cx="0" cy="0" r="6" fill="#ffffff" stroke="#38bdf8" strokeWidth="2" />
            </g>
            <WindDirectionControl degrees={windDirDeg} speed={windSpeedVal} unit={windUnit} onChange={setWindDirDeg} />
          </svg>
          )}
        </div>

        {/* Bottom Control Bar */}
        <div className="mx-4 mb-4 flex flex-wrap gap-3 items-center justify-between bg-slate-900/95 px-4 py-3 rounded-2xl border border-slate-800 shadow-2xl">
          <div className="flex items-center space-x-3">
            <button
              onClick={triggerShotAnimation}
              disabled={isAnimating}
              className="flex items-center space-x-2 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 disabled:opacity-50 text-slate-950 font-black px-6 py-2.5 rounded-xl shadow-lg transition-all transform active:scale-95"
            >
              <PlayIcon size={18} />
              <span>{isAnimating ? '비행 중...' : '샷 실행 (Launch Shot)'}</span>
            </button>

            <button
              onClick={resetShotAnimation}
              className="p-2.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-all"
              title="리셋"
            >
              <RotateCcwIcon size={18} />
            </button>
          </div>

          <div className="hidden md:flex items-center space-x-6 text-xs text-slate-300 font-mono">
            <div>
              <span className="text-slate-500 block font-sans">{trajResult.landed ? '수평 캐리 (Carry)' : '미도달 비행거리'}</span>
              <span className="text-base font-black text-emerald-400">{displayWarning ? '—' : formatDistance(trajResult.carryYds, distanceUnit)}</span>
            </div>
            <div className="h-6 w-px bg-slate-800" />
            <div>
              <span className="text-slate-500 block font-sans">최고 높이 (Apex)</span>
              <span className="text-base font-black text-sky-400">{displayWarning ? '—' : formatDistance(trajResult.apexYds, distanceUnit)}</span>
            </div>
            <div className="h-6 w-px bg-slate-800" />
            <div>
              <span className="text-slate-500 block font-sans">체공 시간 (Hang Time)</span>
              <span className="text-base font-black text-indigo-400">{displayWarning ? '—' : `${trajResult.flightTimeSec.toFixed(1)}s`}</span>
            </div>
            <div className="h-6 w-px bg-slate-800" />
            <div>
              <span className="text-slate-500 block font-sans">낙하 각도 (Landing)</span>
              <span className="text-base font-black text-amber-400">{displayWarning ? '—' : `${Math.round(trajResult.landingAngleDeg)}°`}</span>
            </div>
          </div>
        </div>

      </div>

      {/* RIGHT: CADDIE ENGINE CONTROLS */}
      <div className="w-full lg:w-[460px] lg:shrink-0 lg:h-full bg-slate-950 flex flex-col lg:overflow-y-auto divide-y divide-slate-800/80">
        
        {/* MODEL ENGINE MODE SELECTOR */}
        <div className="p-4 bg-slate-900/80 sticky top-0 z-20 backdrop-blur-md border-b border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <span className="text-emerald-400 flex items-center justify-center">
                <ActivityIcon size={20} />
              </span>
              <h2 className="text-sm font-black text-white tracking-wide">캐디 분석 엔진 (Caddie Simulator)</h2>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-bold">PHYSICS ESTIMATE</span>
          </div>

          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800">
            <button
              onClick={() => setCalcMode('GENERAL')}
              className={`py-2 px-3 rounded-lg text-xs font-black transition-all flex items-center justify-center space-x-1.5 ${
                calcMode === 'GENERAL'
                  ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayersIcon size={14} />
              <span>투어기준시뮬레이션</span>
            </button>
            <button
              onClick={() => setCalcMode('TRACKMAN')}
              className={`py-2 px-3 rounded-lg text-xs font-black transition-all flex items-center justify-center space-x-1.5 ${
                calcMode === 'TRACKMAN'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <AwardIcon size={14} />
              <span>선수개별맞춤시뮬레이션</span>
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3 bg-gradient-to-b from-slate-900/80 to-slate-950">
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="투어 선택">
            {TOUR_IDS.map((id) => (
              <button key={id} onClick={() => { setSelectedTour(id); if (!isCustom) setSelectedClubId('AUTO'); }}
                aria-pressed={selectedTour === id}
                className={`py-2 rounded-xl border text-xs font-bold ${selectedTour === id ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300' : 'border-slate-700 text-slate-300'}`}>
                {id}{id === 'KLPGA' ? ' (추정)' : ''}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-amber-200">{TOURS[selectedTour].note}</p>
          <label className="block text-xs text-slate-300">
            클럽 선택
            <select aria-label="클럽 선택" value={selectedClubId}
              onChange={(e) => setSelectedClubId(e.target.value)}
              className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg p-2">
              <option value="AUTO">{calcMode === 'GENERAL' ? '자동 추천 (현재 환경에서 도달 가능한 클럽)' : '7번 아이언 기준 모델'}</option>
              {tourClubs.map((c) => <option key={c.id} value={c.id}>{c.name} · {formatDistance(c.carry, distanceUnit)}{c.estimated ? ' (추정)' : ''}</option>)}
            </select>
          </label>
          {isCustom && (
            <PersonalClubEditor key={customClub.id} base={customClub} profile={profile ?? {}} unit={distanceUnit} onChange={updatePersonalField} onReset={resetPersonalClub} />
          )}
          {isCustom && (personalState.error || storageError) && (
            <p role="alert" className="text-xs text-amber-200">{personalState.error ?? storageError}</p>
          )}
          {displayWarning ? (
            <p role="alert" className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/40 p-3 rounded-lg">{displayWarning}</p>
          ) : (
            <div className="text-xs space-y-2 bg-slate-900 border border-slate-700 rounded-xl p-3">
              <p className="font-bold text-emerald-300">
                {isCustom && personal.hasPersonal ? '개인 입력 · ' : `${selectedTour} 기준 · `}{activeClub.name}{activeClub.estimated ? ' (투어 기준 추정 포함)' : ''}
              </p>
              <p>레이저 {formatDistance(targetDistYds, distanceUnit)} → 수평 {formatDistance(recommendation.horizontalYds, distanceUnit)}</p>
              <p data-testid="recommendation">환경반영예상캐리 <strong>{formatDistance(trajResult.carryYds, distanceUnit)}</strong> (런 제외)</p>
              <p>{isCustom ? `적용 볼속도 ${activeClub.speed.toFixed(1)}mph` : `투어 평균 볼속도 ${activeClub.speed.toFixed(1)}mph`} · {isCustom ? '기준 캐리' : '클럽 풀샷 평균'} {formatDistance(activeClub.carry, distanceUnit)}</p>
              <p className="text-amber-200">라이: {getLie(lie).label} · 런 제외</p>
              <p className="text-slate-400">
                {isCustom ? '입력 볼속도·발사각·스핀에 현재 환경을 적용한 수평 캐리와 미보정 궤적입니다. 목표 거리에 맞춰 샷을 변경하지 않습니다.'
                  : '선택 투어·클럽의 평균 볼속도·발사각·스핀에 현재 환경을 적용한 풀샷입니다. 목표에 맞춰 볼속도나 조준을 변경하지 않습니다.'}
              </p>
            </div>
          )}
          {!isCustom && selectedClubId === 'AUTO' && recommendation.warning && (
            <p role="alert" className="text-xs text-amber-200">자동 추천 범위 초과: {recommendation.warning} 아래 궤적과 예상캐리는 최장 클럽의 평균 샷입니다.</p>
          )}
          <details className="text-xs text-slate-300">
            <summary className="cursor-pointer font-bold text-sky-300">선택 투어 클럽별 평균 데이터</summary>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-[10px] text-right">
                <thead><tr className="text-slate-400"><th className="text-left">클럽</th><th>캐리 {distanceUnit}</th><th>클럽 mph</th><th>볼 mph</th><th>발사 °</th><th>스핀 rpm</th><th>높이 {distanceUnit}</th></tr></thead>
                <tbody>{tourClubs.map((c) => (
                  <tr key={c.id} className="border-t border-slate-800">
                    <td className="py-1.5 text-left">{c.id}{c.estimated ? '*' : ''}</td>
                    <td className="whitespace-nowrap">{formatDistance(c.carry, distanceUnit)}</td><td>{c.clubSpeed.toFixed(1)}</td><td>{c.speed.toFixed(1)}</td><td>{c.launch.toFixed(1)}</td><td>{Math.round(c.spin)}</td><td className="whitespace-nowrap">{formatDistance(c.apex, distanceUnit)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <p className="mt-2 text-amber-200">* 추정값. GW/SW/LW는 공개 표에 없어 PW 대비 거리 86/72/58%, 속도 90/80/70%, 발사각 +4.5/+9/+14° 가정.</p>
            <a href={TRACKMAN_SOURCE} target="_blank" rel="noreferrer" className="block mt-2 text-sky-400 underline">출처: TrackMan 공식 Tour Averages (공개 표, 실시간 시즌 통계 아님)</a>
          </details>
        </div>

        {/* SECTION 1: ENVIRONMENTAL CONDITIONS */}
        <div className="p-4 space-y-4">
          <div className="flex items-center space-x-2 text-sky-400 text-xs font-black uppercase tracking-wider">
            <span className="flex items-center justify-center">
              <WindIcon size={16} />
            </span>
            <span>필드 환경 변수 설정 (Environment)</span>
          </div>

          {/* Target Distance Slider */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">목표 그린 레이저 거리 (Target)</span>
              <span className="font-bold text-white font-mono">{targetValid ? formatDistance(targetDistYds, distanceUnit) : '입력 확인'}</span>
            </div>
            <input
              type="range"
              aria-label="목표 거리 슬라이더"
              min={distanceFromYards(50, distanceUnit)}
              max={distanceFromYards(350, distanceUnit)}
              step="any"
              value={distanceFromYards(targetDistYds, distanceUnit)}
              onChange={(e) => setTargetInputYds(String(distanceToYards(Number(e.target.value), distanceUnit)))}
              className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Wind Speed & Wind Unit Toggle */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">풍속 (Wind Speed)</span>
              <div className="flex items-center space-x-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                {['m/s', 'mph', 'km/h'].map((u) => (
                  <button
                    key={u}
                    onClick={() => changeWindUnit(u)}
                    className={`px-2 py-0.5 text-[10px] font-bold rounded ${windUnit === u ? 'bg-sky-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <input
                type="range"
                aria-label="풍속"
                min="0"
                max={20 / (windUnit === 'mph' ? MPH_TO_MS : windUnit === 'km/h' ? KMH_TO_MS : 1)}
                step="0.1"
                value={windSpeedVal}
                onChange={(e) => setWindSpeedVal(Number(e.target.value))}
                className="flex-1 accent-sky-500 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
              />
              <span className="font-bold text-sky-300 text-xs font-mono w-16 text-right">{Number(windSpeedVal.toFixed(1))} {windUnit}</span>
            </div>
          </div>

          {/* Wind Direction */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">풍향 (Wind Direction)</span>
            </div>
            <div role="group" aria-label="풍향 빠른 선택" className="grid grid-cols-2 gap-2">
              {WIND_PRESETS.map(preset => (
                <button key={preset.degrees} type="button" onClick={() => setWindDirDeg(current => toggleWindDirection(current, preset.degrees))}
                  aria-pressed={isWindSelected(windDirDeg, preset.degrees)}
                  className={`px-2 py-2 text-xs rounded-lg border font-bold ${isWindSelected(windDirDeg, preset.degrees)
                    ? 'bg-sky-500/20 text-sky-300 border-sky-400' : 'bg-slate-900 text-slate-300 border-slate-700'}`}>
                  <span className="block">{preset.label}</span>
                  <span className="block text-[10px] font-normal">{preset.direction}</span>
                </button>
              ))}
            </div>
            <p data-testid="wind-direction-label" className="text-xs font-bold text-sky-300">{windDirectionLabel(windDirDeg)}</p>
            <HelpDetails title="풍향 설정 안내">
            <p className="text-[11px] text-slate-400">
              맞바람/뒷바람 중 하나와 훅바람/슬라이스바람 중 하나를 조합할 수 있습니다.
              같은 축의 반대 바람은 교체되며, 선택한 항목을 다시 누르면 해당 성분을 해제합니다(최소 한 방향 유지).
              두 성분 선택 시 45° 대각선으로 설정하며, 화면 풍향계를 클릭·드래그하거나 아래 각도로 1°씩 조정할 수 있습니다.
              풍속은 합성 바람의 전체 속도로 유지됩니다(5m/s 대각선이면 각 성분 약 3.5m/s).
              선수 → 목표 방향, 오른손잡이 기준이며 풍속 0이면 방향 영향이 없습니다.
              목표가 위쪽일 때 화살표는 훅바람 ←, 슬라이스바람 →, 맞바람 ↓, 뒷바람 ↑로 표시됩니다.
            </p>
            </HelpDetails>
            <input
              type="range"
              aria-label="풍향"
              min="0"
              max="360"
              step="1"
              value={windDirDeg}
              onChange={(e) => setWindDirDeg(Number(e.target.value))}
              className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <details className="rounded-xl border border-sky-500/30 bg-slate-900/70 p-3 text-xs text-slate-300">
            <summary className="cursor-pointer list-none font-black text-sky-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 [&::-webkit-details-marker]:hidden">
              실전 바람 판단 가이드 <span className="ml-1 font-normal text-slate-400">· 풍속표, 추정법, A/B/C 시퀀스</span>
            </summary>
            <div className="mt-3 space-y-3 leading-relaxed">
              <p className="text-[11px] text-amber-200">
                아래 수치는 현장 판단을 위한 대략적인 참고값입니다. 코스 지형·깃발 형태·돌풍에 따라 달라지며, 앱의 물리 시뮬레이션 입력이나 결과를 자동 변경하지 않습니다.
              </p>
              <p className="text-[11px] text-amber-200">
                비거리 보정은 샷별 편차가 큰 참고값입니다. 시뮬레이터는 볼 속도·발사각·스핀과 상대풍속에 따른 비행을 계산하므로, 현재 샷 비교에는 캐디 분석 결과를 참고하되 실측 예측으로 간주하지 마세요.
              </p>

              <section aria-labelledby="wind-feel-title">
                <h3 id="wind-feel-title" className="mb-1 font-bold text-white">풍속별 관찰 단서 (보포트 풍력 계급의 지상 관측 참고)</h3>
                <p className="mb-1 text-[10px] text-slate-400">
                  0~18 m/s를 2 m/s 간격으로 나눴습니다. 보포트 계급 경계는 이 구간과 일치하지 않아 경계 구간에는 두 계급을 함께 표기합니다. 지상 관측 단서이며 골프공의 상공 풍속·비거리를 직접 뜻하지 않습니다.
                </p>
                <div className="overflow-x-auto rounded-lg border border-slate-700">
                  <table className="min-w-[620px] w-full text-left text-[10px]">
                    <thead className="bg-slate-800 text-slate-300">
                      <tr>
                        <th className="p-2">풍속</th><th className="p-2">바람 종류 (보포트)</th><th className="p-2">지상 관찰 단서</th><th className="p-2">골프 현장 참고</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      <tr><td className="whitespace-nowrap p-2 font-bold text-sky-300">0~2 m/s</td><td className="p-2">고요~남실바람 (B0~B2 일부)</td><td className="p-2">연기가 거의 곧게 오르거나 약하게 흐름. 잎 움직임은 거의 없거나 약함.</td><td className="p-2">깃발은 늘어지거나 가볍게 움직일 수 있음. 미풍이라도 방향을 확인.</td></tr>
                      <tr><td className="whitespace-nowrap p-2 font-bold text-sky-300">2~4 m/s</td><td className="p-2">남실바람~산들바람 (B2~B3)</td><td className="p-2">얼굴에 바람이 느껴지기 시작하고 잎이 바스락거리거나 작은 잔가지가 움직임.</td><td className="p-2">얼굴에 느껴지는 바람과 주변 잎의 움직임으로 대략적인 풍향을 살피고, 한 지점의 깃발만으로 풍속을 단정하지 않음.</td></tr>
                      <tr><td className="whitespace-nowrap p-2 font-bold text-sky-300">4~6 m/s</td><td className="p-2">산들바람~건들바람 (B3~B4)</td><td className="p-2">잎과 작은 잔가지가 계속 움직이며, 윗구간에서는 먼지·가벼운 종이가 날릴 수 있음.</td><td className="p-2">깃발이 펴지는지 관찰하고 맞바람·뒷바람·옆바람 방향을 구분.</td></tr>
                      <tr><td className="whitespace-nowrap p-2 font-bold text-sky-300">6~8 m/s</td><td className="p-2">건들바람~흔들바람 (B4~B5 일부)</td><td className="p-2">먼지와 종이가 날고 작은 가지가 움직임. 상단 구간에서 작은 나무가 흔들리기 시작할 수 있음.</td><td className="p-2">깃발의 지속적인 펄럭임과 돌풍을 함께 확인하고 탄도·체공시간을 고려.</td></tr>
                      <tr><td className="whitespace-nowrap p-2 font-bold text-sky-300">8~10 m/s</td><td className="p-2">흔들바람 (B5)</td><td className="p-2">잎이 있는 작은 나무가 흔들리기 시작함.</td><td className="p-2">평균과 순간 돌풍을 나눠 관찰하고, 안전한 타깃 여유를 고려.</td></tr>
                      <tr><td className="whitespace-nowrap p-2 font-bold text-sky-300">10~12 m/s</td><td className="p-2">흔들바람~된바람 (B5~B6)</td><td className="p-2">작은 나무가 흔들리고 큰 가지가 움직이기 시작할 수 있음.</td><td className="p-2">샷 간 바람 변동이 커질 수 있으므로 돌풍과 목표 주변의 흐름을 재확인.</td></tr>
                      <tr><td className="whitespace-nowrap p-2 font-bold text-sky-300">12~14 m/s</td><td className="p-2">된바람~센바람 (B6~B7 일부)</td><td className="p-2">큰 가지가 움직이며, 윗구간에서는 나무 전체가 흔들리기 시작할 수 있음.</td><td className="p-2">클럽 선택뿐 아니라 좌우 위험 구역과 균형 유지도 함께 고려.</td></tr>
                      <tr><td className="whitespace-nowrap p-2 font-bold text-sky-300">14~16 m/s</td><td className="p-2">센바람 (B7)</td><td className="p-2">나무가 크게 흔들리고 바람을 거슬러 걷기 불편할 수 있음.</td><td className="p-2">깃발만 믿지 말고 코스의 강풍·플레이 중단 안내를 확인.</td></tr>
                      <tr><td className="whitespace-nowrap p-2 font-bold text-sky-300">16~18 m/s</td><td className="p-2">센바람~큰바람 (B7~B8 일부)</td><td className="p-2">큰바람 구간에선 잔가지가 부러질 수 있고 보행이 매우 불편할 수 있음.</td><td className="p-2">샷 판단보다 안전이 우선. 코스 운영 및 기상 안전 지침을 따름.</td></tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[10px] text-slate-400">
                  보포트 계급의 영문 등급과 지상 영향 설명은 <a href="https://www.canada.ca/en/environment-climate-change/services/general-marine-weather-information/understanding-forecasts/beaufort-wind-scale-table.html" target="_blank" rel="noreferrer" className="text-sky-300 underline">Environment and Climate Change Canada</a> 자료를 참고했습니다. m/s 구간은 2 m/s 단위로 보기 쉽게 묶은 값입니다.
                </p>
                <div className="mt-2 rounded-lg border border-sky-500/20 bg-slate-950/80 p-2">
                  <h4 className="font-bold text-sky-300">골프 현장 공통 기준 · 잔디 드리프트 기록법</h4>
                  <p className="mt-1 text-[10px]">
                    비슷한 양의 마른 잔디를 어깨·얼굴 높이(약 1.5m)에서 던지지 말고 놓습니다. 놓은 지점부터 처음 닿은 곳까지의 옆 이동을 같은 방식으로 3회 관찰하고, 2회 이상 비슷한 결과일 때만 대표 경향으로 기록합니다.
                  </p>
                  <div className="mt-1 grid grid-cols-2 gap-1 text-[10px] sm:grid-cols-4">
                    <span className="rounded bg-slate-900 p-1">근거리 · 0.5m 미만</span>
                    <span className="rounded bg-slate-900 p-1">짧은 이동 · 0.5~1m</span>
                    <span className="rounded bg-slate-900 p-1">뚜렷한 이동 · 1~2m</span>
                    <span className="rounded bg-slate-900 p-1">긴 이동 · 2m 초과 / 공중에 뜸</span>
                  </div>
                  <p className="mt-1 text-[10px] text-amber-200">
                    이 구간은 관찰 결과를 일관되게 기록하기 위한 편의상 분류이지, 특정 m/s나 보포트 계급으로 환산하는 실험 기준은 아닙니다. 잔디의 크기·수분·낙하 시간과 지면 난류가 달라지므로 풍속 수치나 비거리 보정에는 쓰지 말고, 풍향·돌풍 여부를 깃발·주변 자연물과 함께 판단하세요. 강풍에는 잔디를 놓는 시험을 생략하고 안전 지침을 우선합니다.
                  </p>
                </div>
              </section>

              <section aria-labelledby="wind-methods-title">
                <h3 id="wind-methods-title" className="mb-1 font-bold text-white">시합 현장 4단계 바람 추정법</h3>
                <ol className="space-y-2">
                  <li className="rounded-lg bg-slate-950/80 p-2">
                    <strong className="text-sky-300">① 핀 깃발 관찰 (정량계가 아닌 방향·지속성 단서)</strong>
                    <p>깃발이 처지는지, 간헐적으로 펴지는지, 계속 펴져 있는지 관찰합니다. 깃발의 크기·재질·설치 방식·돌풍에 따라 모양이 달라지므로 각도를 특정 m/s로 환산하지 말고, 다른 지표와 함께 보세요.</p>
                  </li>
                  <li className="rounded-lg bg-slate-950/80 p-2">
                    <strong className="text-sky-300">② 잔디 날리기 (Grass Toss, 방향 확인)</strong>
                    <p>위 공통 기준대로 같은 높이에서 마른 잔디를 3회 놓고, 이동 거리 구간과 반복되는 방향만 기록합니다. 이동 거리로 풍속을 환산하지 마세요. 잔디 조각의 크기·수분·낙하 시간과 지형 난류가 결과를 크게 바꿉니다.</p>
                  </li>
                  <li className="rounded-lg bg-slate-950/80 p-2">
                    <strong className="text-sky-300">③ 높이에 따른 바람 변화 확인</strong>
                    <p>티잉 지점·페어웨이·그린의 깃발과 나무 윗부분, 구름의 이동이 서로 다르면 고도별 풍향·풍속이 다를 수 있습니다. 나무나 구름의 움직임만으로 공의 Apex 풍속을 수치로 추정할 수는 없습니다.</p>
                  </li>
                  <li className="rounded-lg bg-slate-950/80 p-2">
                    <strong className="text-sky-300">④ 얼굴 감각과 계측값 교차 확인</strong>
                    <p>얼굴에 느껴지는 바람과 소리는 순간 변화나 대략적인 방향을 알아차리는 보조 단서입니다. 풍속 수치가 필요하면 타격 지점의 노출된 곳에서 휴대용 풍속계를 여러 번 읽고 평균과 돌풍을 따로 기록하세요. 지면 계측값이 상공 바람과 같다고 가정하지 않습니다.</p>
                  </li>
                </ol>
                <p className="mt-2 text-[10px] text-slate-400">
                  지상 풍속 관찰표: <a href="https://www.canada.ca/en/environment-climate-change/services/general-marine-weather-information/understanding-forecasts/beaufort-wind-scale-table.html" target="_blank" rel="noreferrer" className="text-sky-300 underline">Environment and Climate Change Canada · Beaufort Wind Scale</a>
                </p>
              </section>

              <section aria-labelledby="wind-patterns-title">
                <h3 id="wind-patterns-title" className="mb-1 font-bold text-white">선수별 바람 결정 시퀀스</h3>
                <div className="space-y-2">
                  <article className="rounded-lg border border-indigo-500/30 bg-indigo-950/30 p-2">
                    <h4 className="font-bold text-indigo-200">Pattern A · 분석적 지표 시퀀스 (정밀 수치형)</h4>
                    <p className="text-[10px] text-slate-400">트랙맨 데이터와 수치 기반 계산을 선호하는 골퍼</p>
                    <ol className="mt-1 list-inside list-decimal space-y-0.5">
                      <li>풍층 비교: 티잉 지점·그린의 깃발과 나무 윗부분을 비교해 높이에 따른 변화 가능성을 파악하며, 관찰만으로 Apex 풍속을 단정하지 않음.</li>
                      <li>타깃 구역 관찰: 그린 주변 깃발을 여러 순간 관찰해 평균적인 흐름과 돌풍을 구분.</li>
                      <li>수치 합산: 레이저 거리 + 고도 보정에 바람 영향을 더해 Play-As 거리를 판단. m/s당 고정 야드 환산은 샷마다 달라지는 참고값으로만 사용.</li>
                      <li>클럽 결정: 템포를 바꾸기보다 클럽 번호로 조절. 필요한 클럽 수는 바람만으로 고정하지 말고 샷 탄도와 클럽 간 거리 차이를 함께 고려.</li>
                    </ol>
                  </article>
                  <article className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-2">
                    <h4 className="font-bold text-emerald-200">Pattern B · 직관·감각적 시퀀스 (구질 컨트롤형)</h4>
                    <p className="text-[10px] text-slate-400">구질과 탄도 조절로 바람을 이용하거나 이기려는 골퍼</p>
                    <ol className="mt-1 list-inside list-decimal space-y-0.5">
                      <li>체감 센싱: 어드레스에서 얼굴과 귀에 닿는 바람으로 순간 변화를 감지.</li>
                      <li>잔디 날리기: 공 주변의 순간적인 풍향과 돌풍 여부를 확인하되, 이동 거리나 잔디만으로 공의 초반 궤적·풍속을 확정하지 않음.</li>
                      <li>구질 매칭: 맞바람은 한 클럽 크게 잡고 3/4 스윙의 낮은 펀치샷으로 백스핀을 억제. 옆바람은 바람을 태우는 Wind-Rider와 바람을 이기는 Wind-Cheater 중 선택.</li>
                      <li>에이밍 확정: 나무나 벙커 가장자리 등 그린 주변 시각화 지점을 조준선으로 선택.</li>
                    </ol>
                  </article>
                  <article className="rounded-lg border border-amber-500/30 bg-amber-950/30 p-2">
                    <h4 className="font-bold text-amber-200">Pattern C · 위협 관리 시퀀스 (코스 매니지먼트형)</h4>
                    <p className="text-[10px] text-slate-400">6 m/s 이상이거나 돌풍이 심해 실수를 줄여야 하는 상황</p>
                    <ol className="mt-1 list-inside list-decimal space-y-0.5">
                      <li>위험 요소 스캔: 바람에 밀릴 때의 해저드, OB, 벙커 등 징벌 구역을 확인.</li>
                      <li>돌풍 주기 측정: 10~15초간 깃발을 관찰해 평균 풍속과 최대 돌풍의 차이를 파악.</li>
                      <li>최악 조건 설정: 맞바람이 가장 강한 순간을 기준으로 거리와 클럽을 결정.</li>
                      <li>안전 구역 타깃팅: 핀 대신 그린 중앙을 겨냥해 빗나가도 안전하게 안착할 여지를 확보.</li>
                    </ol>
                  </article>
                </div>
              </section>

              <section aria-labelledby="wind-distance-title">
                <h3 id="wind-distance-title" className="mb-1 font-bold text-white">실전 비거리 보정 참고</h3>
                <ul className="space-y-1 rounded-lg bg-slate-950/80 p-2">
                  <li><strong className="text-sky-300">맞바람·뒷바람:</strong> TrackMan 투어 6번 아이언의 일정 풍속 사례에서 20 mph 맞바람 캐리 손실은 같은 세기 뒷바람 캐리 증가보다 거의 두 배 컸습니다. 이는 해당 샷 조건의 비교이며, 풍향 효과는 비선형이고 탄도·스핀·체공시간에 따라 달라 단일한 m/s당 야드 공식으로 일반화하지 마세요.</li>
                  <li><strong className="text-sky-300">옆바람:</strong> 보편적으로 신뢰할 수 있는 고정 야드 환산값을 제시하기 어렵습니다. 목표선 대비 착지 편차는 풍속뿐 아니라 공의 체공시간, 스핀축, 높이에 따른 풍속 변화에 좌우됩니다.</li>
                  <li><strong className="text-sky-300">현장 적용:</strong> 풍속 1 m/s는 약 2.24 mph입니다. 이 환산은 단위 변환일 뿐, 비거리 변화가 풍속에 정비례한다는 뜻은 아닙니다. 런은 별도이며 이 기준은 캐리 참고입니다.</li>
                </ul>
                <p className="mt-2 text-[10px] text-slate-400">
                  샷 자료: <a href="https://www.trackman.com/blog/normalization-feature-explained" target="_blank" rel="noreferrer" className="text-sky-300 underline">TrackMan · The Normalization feature explained</a>
                  {' · '}
                  실측 궤적 연구: <a href="https://link.springer.com/content/pdf/10.1007/978-0-387-46050-5_27.pdf" target="_blank" rel="noreferrer" className="text-sky-300 underline">Naruo &amp; Mizota · Experimental Verification of Trajectory Analysis of Golf Ball under Atmospheric Boundary Layer</a>
                </p>
              </section>
            </div>
          </details>

          <div className="space-y-2">
            <label className="block text-xs text-slate-300">
              잔디 및 라이 (임팩트 추정 시나리오)
              <select aria-label="잔디 및 라이" value={lie}
                onChange={(e) => {
                  const option = LIE_OPTIONS.find(item => item.id === e.target.value);
                  if (!option) throw new Error('지원하지 않는 라이입니다.');
                  setLie(option.id);
                }}
                className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg p-2">
                {LIE_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
            <div className="text-[11px] text-slate-300 bg-slate-900 p-2.5 rounded-lg border border-slate-700">
              <p className="font-bold text-sky-300">라이·강우 반영 전 → 반영 후 출발 조건</p>
              <p data-testid="impact-speed">볼속도 {activeClub.speed.toFixed(1)} → {trajResult.appliedLaunch.ballSpeedMph.toFixed(1)} mph</p>
              <p data-testid="impact-launch">발사각 {activeClub.launch.toFixed(1)} → {trajResult.appliedLaunch.launchAngleDeg.toFixed(1)}°</p>
              <p data-testid="impact-spin">백스핀 {Math.round(activeClub.spin)} → {Math.round(trajResult.appliedLaunch.spinRateRpm)} rpm</p>
            </div>
            <HelpDetails title="라이 보정 안내">
            <p data-testid="lie-assumptions" className="text-[11px] text-amber-200">{getLie(lie).note}</p>
            <p className="text-[11px] text-slate-400">
              라이 보정은 양 모드에 적용합니다. 개인 입력은 라이·강우 보정 전 기준 샷으로 입력하세요.
              실측한 러프 샷을 이미 입력했다면 중립 라이를 선택해 중복 보정을 피하세요.
              수치는 실측 보장값이 아닌 가정이며, 캐리 증감은 클럽·발사 조건별 계산 결과입니다.
              런은 계산하지 않습니다.
            </p>
            </HelpDetails>
          </div>

          {/* Temperature & Temp Unit Toggle */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">기온 (Air Temp / Density)</span>
              <div className="flex items-center space-x-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                {['C', 'F'].map((u) => (
                  <button
                    key={u}
                    onClick={() => changeTempUnit(u)}
                    className={`px-2.5 py-0.5 text-[10px] font-bold rounded ${tempUnit === u ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
                  >
                    °{u}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <input
                type="range"
                aria-label="기온"
                min={tempUnit === 'C' ? -10 : 14}
                max={tempUnit === 'C' ? 40 : 104}
                step="0.1"
                value={tempVal}
                onChange={(e) => setTempVal(Number(e.target.value))}
                className="flex-1 accent-amber-500 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
              />
              <span className="font-bold text-amber-300 text-xs font-mono w-16 text-right">{Number(tempVal.toFixed(1))} °{tempUnit}</span>
            </div>
          </div>

          {/* Green Elevation Delta */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">그린 고도 차이 (ΔH)</span>
              <span className={`font-bold font-mono ${elevationM >= 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {elevationM > 0 ? '+' : ''}{formatDistance(elevationM * M_TO_YDS, distanceUnit)} ({elevationM === 0 ? '평지' : elevationM > 0 ? '오르막' : '내리막'})
              </span>
            </div>
            <input
              type="range"
              aria-label="그린 고도 차이"
              min={distanceFromYards(-15 * M_TO_YDS, distanceUnit)}
              max={distanceFromYards(25 * M_TO_YDS, distanceUnit)}
              step="any"
              value={distanceFromYards(elevationM * M_TO_YDS, distanceUnit)}
              onChange={(e) => setElevationM(distanceToYards(Number(e.target.value), distanceUnit) * YDS_TO_M)}
              className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Rain / Moisture */}
          <div className="space-y-1.5">
            <span className="text-xs text-slate-400 block">강우 (비행 항력·스핀 추정 보정)</span>
            <div className="grid grid-cols-3 gap-2">
              {(['NONE', 'LIGHT', 'HEAVY'] satisfies RainLevel[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRainLevel(r)}
                  className={`py-1.5 text-xs font-bold rounded-lg border transition-all ${
                    rainLevel === r
                      ? 'bg-sky-500/20 text-sky-300 border-sky-500/50'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  {r === 'NONE' ? '건조 (Dry)' : r === 'LIGHT' ? '약한 비' : '강한 비'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* SECTION 3: SUMMARY FOOTER */}
        <div className="p-4 bg-slate-900/60 space-y-2">
          <HelpDetails title="산출 방식과 한계">
          <p className="text-xs text-slate-400 leading-relaxed">
            기준은 무풍·20°C·해수면·평지·중립 페어웨이 캐리(런 제외)입니다. 공개 캐리·최고 높이에 클럽별 항력·양력을 보정하고,
            상대풍속의 3차원 항력·마그누스 양력·중력·스핀 감쇠를 적분합니다.
            출발점을 높이 0으로 두고 스핀축과 상대풍속의 각도에 따라 양력을 줄입니다.
            레이저 거리와 고도 차이에서 수평 거리를 구해 예상캐리와 비교합니다.
            예상캐리는 목표선 방향 수평 성분이며, 좌우 편차는 별도로 표시합니다. 목표 높이의 수평면과 하강 궤적의 교점을 착지로 봅니다.
            투어 모드는 클럽 평균 풀샷, 선수개별맞춤은 입력 샷의 환경반영 예상캐리를 표시합니다.
            모든 거리·높이와 입력 단위는 화면 상단의 미터/야드 선택을 따릅니다.
            자동 추천은 목표 도달 가능성을 역산해 클럽만 선택하며, 표시 샷의 속도·조준은 바꾸지 않습니다.
            현재 공기밀도 {airDensityText} kg/m³.
            라이 보정은 기준 모델 보정 이후 임팩트 볼속도·발사각·스핀에 한 번만 적용하며 강우 스핀 계수와 곱합니다.
            순결·플라이어의 스핀 감소가 모든 클럽의 캐리 증가를 의미하지는 않으며 딥러프 손실도 고정 야드로 강제하지 않습니다.
            캐리·최고 높이 두 값으로 공력 계수를 맞춘 경험적 모델이므로 체공 시간·낙하각·바람 반응의 실측 일치를 보증하지 않습니다.
            부분 샷 추천 역산은 동일 발사각·스핀 가정이며, 강우는 항력 +3/+8%, 초기 스핀 -5/-15%의 추정 시나리오입니다.
            고도 차이는 착지 높이이며 해발고도 입력이 아닙니다. 공기밀도는 해수면 표준기압과 선택 기온 기준입니다.
            실제 경사면·중간 지형·습도·볼 온도·난류·돌풍·지면 런은 반영하지 않으며 실제 TrackMan 비행 엔진이나 실측 예측 정확도를 보증하지 않습니다.
          </p>
          </HelpDetails>
        </div>

        </div>
      </div>

    </div>
  );
}