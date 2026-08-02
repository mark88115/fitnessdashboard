export const SEGMENT_KEYS = ['left_arm', 'right_arm', 'trunk', 'left_leg', 'right_leg'];

/**
 * Validates and normalizes a raw parsed data.json object into a sorted,
 * predictable shape. Throws if required top-level fields are missing.
 */
export function parseUserData(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('parseUserData: raw data must be an object');
  }
  if (typeof raw.user !== 'string' || raw.user.length === 0) {
    throw new Error('parseUserData: missing "user" field');
  }
  if (!Array.isArray(raw.measurements)) {
    throw new Error('parseUserData: missing "measurements" array');
  }

  const measurements = raw.measurements
    .map(normalizeMeasurement)
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    user: raw.user,
    heightCm: raw.height_cm ?? null,
    sex: raw.sex ?? null,
    age: raw.age ?? null,
    measurements,
  };
}

function normalizeMeasurement(m) {
  if (typeof m.date !== 'string') {
    throw new Error('normalizeMeasurement: measurement missing "date"');
  }
  const segments = {};
  for (const key of SEGMENT_KEYS) {
    const seg = m.segments?.[key];
    segments[key] = {
      muscleKg: numberOrNull(seg?.muscle_kg),
      musclePct: numberOrNull(seg?.muscle_pct),
      fatKg: numberOrNull(seg?.fat_kg),
      fatPct: numberOrNull(seg?.fat_pct),
    };
  }
  return {
    date: m.date,
    time: m.time ?? null,
    weightKg: numberOrNull(m.weight_kg),
    smmKg: numberOrNull(m.smm_kg),
    pbfPercent: numberOrNull(m.pbf_percent),
    bmi: numberOrNull(m.bmi),
    inbodyScore: numberOrNull(m.inbody_score),
    visceralFatLevel: numberOrNull(m.visceral_fat_level),
    waistHipRatio: numberOrNull(m.waist_hip_ratio),
    bmrKcal: numberOrNull(m.bmr_kcal),
    recommendedKcal: numberOrNull(m.recommended_kcal),
    segments,
  };
}

function numberOrNull(v) {
  return typeof v === 'number' && !Number.isNaN(v) ? v : null;
}

/** Fetches and parses a user's data.json. Browser-only (uses fetch). */
export async function loadUserData(username) {
  const res = await fetch(`../workout/${encodeURIComponent(username)}/data.json?v=msblv1bj`);
  if (!res.ok) {
    throw new Error(`loadUserData: failed to fetch data for "${username}" (${res.status})`);
  }
  const raw = await res.json();
  return parseUserData(raw);
}

/** Fetches the list of available usernames from workout/users.json. Browser-only. */
export async function loadUserList() {
  const res = await fetch('../workout/users.json?v=msblv1bj');
  if (!res.ok) {
    throw new Error(`loadUserList: failed to fetch user list (${res.status})`);
  }
  const raw = await res.json();
  if (!Array.isArray(raw.users)) {
    throw new Error('loadUserList: users.json missing "users" array');
  }
  return raw.users;
}
