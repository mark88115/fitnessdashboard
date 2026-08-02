// fitness-dashboard/js/projection.js
import { SEGMENT_KEYS } from './dataStore.js?v=msblmu9p';

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * Least-squares linear regression slope of y over x.
 * points: [{x:number, y:number|null}]. Returns slope (Δy per unit x).
 * Returns 0 if fewer than 2 usable points, or if all x values are identical.
 */
export function linearRegressionSlope(points) {
  const pts = points.filter((p) => typeof p.y === 'number');
  const n = pts.length;
  if (n < 2) return 0;

  const meanX = pts.reduce((s, p) => s + p.x, 0) / n;
  const meanY = pts.reduce((s, p) => s + p.y, 0) / n;

  let num = 0;
  let den = 0;
  for (const p of pts) {
    num += (p.x - meanX) * (p.y - meanY);
    den += (p.x - meanX) * (p.x - meanX);
  }
  if (den === 0) return 0;
  return num / den;
}

function toWeekPoints(measurements, getValue) {
  if (measurements.length === 0) return [];
  const firstMs = new Date(measurements[0].date).getTime();
  return measurements.map((m) => ({
    x: (new Date(m.date).getTime() - firstMs) / MS_PER_WEEK,
    y: getValue(m),
  }));
}

/**
 * Computes weekly rate-of-change for muscle_kg and fat_kg of every segment,
 * based on the full (date-sorted) measurement history.
 */
export function computeSegmentTrends(measurements) {
  const trends = {};
  for (const key of SEGMENT_KEYS) {
    const musclePoints = toWeekPoints(measurements, (m) => m.segments[key]?.muscleKg ?? null);
    const fatPoints = toWeekPoints(measurements, (m) => m.segments[key]?.fatKg ?? null);
    trends[key] = {
      muscleKgPerWeek: linearRegressionSlope(musclePoints),
      fatKgPerWeek: linearRegressionSlope(fatPoints),
    };
  }
  return trends;
}

// --- Energy-balance constants -------------------------------------------
// Standard figure for the energy stored in a kilogram of body fat.
const KCAL_PER_KG_FAT = 7700;
// Lean tissue is ~70-75% water, so a kilogram of it stores far less energy
// than a kilogram of fat. Used to charge muscle gain against the same
// calorie budget fat is charged against.
const KCAL_PER_KG_MUSCLE = 1800;
// Resting energy expenditure per kilogram of each tissue (Elia's organ-level
// figures). This is why training changes maintenance calories even on rest
// days: the muscle it builds keeps burning.
const BMR_KCAL_PER_KG_MUSCLE_PER_DAY = 13;
const BMR_KCAL_PER_KG_FAT_PER_DAY = 4.5;
// Harris-Benedict style activity multiplier for someone who trains nothing.
// The gap between this and the user's own recommended intake is what their
// current activity is worth in calories.
const SEDENTARY_ACTIVITY_FACTOR = 1.2;
// How much of that activity gap is deliberate training rather than walking
// around, commuting, fidgeting and the rest of NEAT. The training slider
// scales this part, so it sets the whole training axis' calorie weight.
const TRAINING_SHARE_OF_ACTIVITY = 0.5;
// Lyle McDonald's widely-cited table of realistic annual muscle gain by
// training age, in kg/year (midpoints of its published ranges). Gains fall
// off steeply: a first-year lifter's whole-year figure is what a fourth-year
// lifter would need most of a decade to match.
//
// These are taken here to describe training at its hardest sustainable —
// programming, recovery and food all lined up. The slider is anchored so
// that a user's *current* habit sits at BASELINE_TRAINING_INTENSITY of that
// ceiling, and +100% reaches it.
const LYLE_ANNUAL_MUSCLE_KG_BY_YEAR = { 1: 10.15, 2: 4.95, 3: 2.5, 4: 1.15 };
const MAX_TRAINING_YEAR_BRACKET = 4;
export const DEFAULT_TRAINING_YEARS = 2;
const BASELINE_TRAINING_INTENSITY = 0.5;
const WEEKS_PER_YEAR = 52;

/** Annual muscle ceiling for a training age, clamped to the table's brackets
 * (year 4 is the "4 or more" row — gains keep shrinking after that, but not
 * on any schedule this table claims to describe). */
function annualMuscleCeilingKg(trainingYears) {
  const bracket = Math.min(
    MAX_TRAINING_YEAR_BRACKET,
    Math.max(1, Math.round(trainingYears || DEFAULT_TRAINING_YEARS))
  );
  return LYLE_ANNUAL_MUSCLE_KG_BY_YEAR[bracket];
}
// Daily deficit at which muscle gain is fully cancelled out; twice this and
// muscle is actively lost at CATABOLIC_MUSCLE_LOSS_KG_PER_WEEK. You cannot
// build tissue out of calories that were never eaten.
const DEFICIT_KCAL_ZEROING_GAINS = 500;
const CATABOLIC_MUSCLE_LOSS_KG_PER_WEEK = 0.05;
// Fraction of a calorie surplus that actually ends up stored as fat. The
// rest is spent rather than banked: digesting the extra food costs energy
// (diet-induced thermogenesis, very roughly 10% of intake), and overfeeding
// raises spontaneous movement and heat production — the effect Levine's
// overfeeding work measured as NEAT, which absorbs a large and highly
// variable share of a surplus. Treating a surplus as if every calorie became
// fat is the textbook 7700kcal/kg arithmetic, and it overstates real weight
// gain badly over long horizons.
//
// Only surpluses are damped. A deficit is left at full strength here: real
// metabolic adaptation blunts that direction too, but it is a different
// mechanism with a different size, and folding both into one number would
// hide that. So this model still loses fat faster than it gains it.
const SURPLUS_STORAGE_EFFICIENCY = 0.5;
// Fat below roughly this fraction of body weight is structural (organs,
// nerves, marrow) and is not available to be dieted away. Without the floor
// a large sustained deficit runs the projection into physically impossible
// body compositions.
const ESSENTIAL_BODY_FAT_FRACTION = 0.04;
// A projection can never take a segment's muscle/fat below this — a real
// segment always retains some minimal essential tissue; without a floor, a
// long projection at an extreme slider value could imply losing more fat
// than a segment actually has, producing negative fat/pbfPercent.
const MIN_SEGMENT_KG = 0.1;

function clamp(value, min, max) {
  return value < min ? min : (value > max ? max : value);
}

/**
 * Week-by-week energy balance, returning the whole-body muscle/fat change
 * the diet and training sliders cause *on top of* the person's own
 * historical trend. At 0%/0% it returns zero on both, so the projection
 * reduces to that trend and nothing is double-counted.
 *
 * The chain, per week:
 *   intake      = recommended × (1 + diet%)
 *   maintenance = recommended
 *               + extra training burn                    (training costs calories)
 *               + 13 × muscle gained so far              (new muscle raises BMR)
 *               + 4.5 × fat gained so far                (lost fat lowers BMR)
 *   balance     = intake − maintenance
 *   muscle      = training's potential, scaled by how much of the calories
 *                 needed to build it actually exist
 *   fat         = whatever calories are left after paying for that muscle,
 *                 with a surplus only half-stored (SURPLUS_STORAGE_EFFICIENCY)
 *
 * This is what makes the two sliders interact rather than act on separate
 * body parts: training alone (no extra food) produces a deficit, so it burns
 * fat but only partly delivers its muscle potential; eating more alongside
 * it restores the gain and the surplus lands as fat. Maintenance is
 * recomputed every week so the BMR gained from new muscle compounds.
 *
 * The muscle potential is the *difference* Lyle's ceiling implies between
 * the slider's intensity and the user's current one, not the whole ceiling —
 * the historical trend this is layered onto already contains what their
 * current training delivers, so charging the full ceiling again would count
 * it twice. At slider 0% the difference is zero and the projection is purely
 * their own measured trend.
 */
function simulateEnergyBalance({ weeks, dietPercent, trainingPercent, trainingYears, recommendedKcal, bmrKcal, weightKg, currentFatKg }) {
  if (!recommendedKcal) return { muscleKg: 0, fatKg: 0 };

  const activityKcalPerDay = bmrKcal
    ? Math.max(0, recommendedKcal - bmrKcal * SEDENTARY_ACTIVITY_FACTOR)
    : 0;
  const baselineTrainingKcalPerDay = activityKcalPerDay * TRAINING_SHARE_OF_ACTIVITY;

  const intakeKcalPerDay = recommendedKcal * (1 + dietPercent / 100);
  const extraTrainingKcalPerDay = baselineTrainingKcalPerDay * (trainingPercent / 100);

  // Slider 0% sits at BASELINE_TRAINING_INTENSITY of the ceiling and +100%
  // reaches it, so the intensity *change* is baseline × slider%.
  const intensityChange = BASELINE_TRAINING_INTENSITY * (trainingPercent / 100);
  const potentialMuscleKgPerWeek =
    (annualMuscleCeilingKg(trainingYears) / WEEKS_PER_YEAR) * intensityChange;

  const minTotalFatKg = weightKg ? weightKg * ESSENTIAL_BODY_FAT_FRACTION : 0;

  let muscleKg = 0;
  let fatKg = 0;
  for (let week = 0; week < weeks; week++) {
    const maintenanceKcalPerDay = recommendedKcal
      + extraTrainingKcalPerDay
      + BMR_KCAL_PER_KG_MUSCLE_PER_DAY * muscleKg
      + BMR_KCAL_PER_KG_FAT_PER_DAY * fatKg;
    const balanceKcalPerDay = intakeKcalPerDay - maintenanceKcalPerDay;

    // 1 at or above maintenance, 0 at a 500kcal/day deficit, -1 at 1000.
    const availability = clamp(1 + balanceKcalPerDay / DEFICIT_KCAL_ZEROING_GAINS, -1, 1);
    const muscleDeltaKg = potentialMuscleKgPerWeek * Math.max(0, availability)
      + CATABOLIC_MUSCLE_LOSS_KG_PER_WEEK * Math.min(0, availability);

    const kcalSpentOnMuscle = muscleDeltaKg * KCAL_PER_KG_MUSCLE;
    const kcalLeftForFat = balanceKcalPerDay * 7 - kcalSpentOnMuscle;
    const kcalStoredAsFat = kcalLeftForFat > 0
      ? kcalLeftForFat * SURPLUS_STORAGE_EFFICIENCY
      : kcalLeftForFat;
    const fatDeltaKg = kcalStoredAsFat / KCAL_PER_KG_FAT;

    muscleKg += muscleDeltaKg;
    fatKg += fatDeltaKg;
    if (currentFatKg + fatKg < minTotalFatKg) fatKg = minTotalFatKg - currentFatKg;
  }
  return { muscleKg, fatKg };
}

/**
 * Projects a measurement forward `weeks` weeks from `current`, using
 * per-segment trends plus diet/training adjustment percentages (diet
 * -30..+30, training -30..+100).
 * `heightCm` comes from the parsed user object (dataStore.parseUserData),
 * not from a measurement — BMI needs it and measurements don't carry height.
 *
 * The sliders are additive adjustments layered on top of the person's own
 * historical trend, not a multiplier on it — multiplying was the original
 * design, but it silently flips meaning depending on which direction the
 * trend already points: for someone whose fat_kg has been *rising*
 * historically, "eat less" (dietPercent < 0) only shrank the existing
 * upward trend instead of ever being able to reverse it, so "eating less"
 * could still show projected weight going up.
 *
 * Their combined effect comes from simulateEnergyBalance above, which runs
 * one shared calorie budget rather than letting diet own fat and training
 * own muscle. The earlier version did split them that way, and it made
 * training free: it added muscle without burning a single calorie and
 * without changing maintenance, so no amount of training could reduce fat
 * and eating more could only ever add fat.
 *
 * `trainingYears` is how long the user has been lifting, which sets how much
 * muscle any amount of training can still produce (see
 * LYLE_ANNUAL_MUSCLE_KG_BY_YEAR) — the same programme yields roughly nine
 * times as much in year one as in year four.
 */
export function projectMeasurement(
  current, trends, dietPercent, trainingPercent, heightCm, weeks = 4, trainingYears = DEFAULT_TRAINING_YEARS
) {
  const totalCurrentFatKg = sumSegmentValue(current, 'fatKg');
  const totalCurrentMuscleKg = sumSegmentValue(current, 'muscleKg');

  const fromSliders = simulateEnergyBalance({
    weeks,
    dietPercent,
    trainingPercent,
    trainingYears,
    recommendedKcal: current.recommendedKcal,
    bmrKcal: current.bmrKcal,
    weightKg: current.weightKg,
    currentFatKg: totalCurrentFatKg,
  });

  const segments = {};
  let muscleKgDeltaSum = 0;
  let fatKgDeltaSum = 0;

  for (const key of SEGMENT_KEYS) {
    const cur = current.segments[key];
    const trend = trends[key];

    const fatShare = totalCurrentFatKg > 0 && cur.fatKg !== null ? cur.fatKg / totalCurrentFatKg : 0;
    const muscleShare = totalCurrentMuscleKg > 0 && cur.muscleKg !== null ? cur.muscleKg / totalCurrentMuscleKg : 0;

    const muscleDelta = trend.muscleKgPerWeek * weeks + fromSliders.muscleKg * muscleShare;
    const fatDelta = trend.fatKgPerWeek * weeks + fromSliders.fatKg * fatShare;

    // Floored at a small positive minimum, not just 0 — a long enough
    // projection at the diet slider's extreme (e.g. -30% of recommended
    // intake sustained for 26 weeks) can imply losing more fat than a
    // segment actually has; clamping the *projected value* (not just the
    // delta) keeps every downstream figure (fatPct, pbfPercent, the 3D
    // figure's shape) consistent with what's actually shown here, rather
    // than fatKg looking sane while pbfPercent goes negative.
    const muscleKg = cur.muscleKg === null ? null : round2(Math.max(MIN_SEGMENT_KG, cur.muscleKg + muscleDelta));
    const fatKg = cur.fatKg === null ? null : round2(Math.max(MIN_SEGMENT_KG, cur.fatKg + fatDelta));

    if (cur.muscleKg !== null) muscleKgDeltaSum += muscleKg - cur.muscleKg;
    if (cur.fatKg !== null) fatKgDeltaSum += fatKg - cur.fatKg;

    segments[key] = {
      muscleKg,
      // The exact InBody "% of normal" formula isn't available to us, so this
      // isn't re-derived from first principles — instead the current % is
      // scaled by the same ratio the kg value moved by, which keeps the
      // projected figure's visual size consistent with the projected kg
      // (a flat kg-based mapping) rather than frozen at the current value.
      musclePct: scalePct(cur.musclePct, cur.muscleKg, muscleKg),
      fatKg,
      fatPct: scalePct(cur.fatPct, cur.fatKg, fatKg),
    };
  }

  const weightKg = current.weightKg === null
    ? null
    : round2(current.weightKg + muscleKgDeltaSum + fatKgDeltaSum);

  const smmKg = current.smmKg === null ? null : round2(current.smmKg + muscleKgDeltaSum);

  let pbfPercent = current.pbfPercent;
  if (current.weightKg !== null && current.pbfPercent !== null && weightKg !== null) {
    const currentFatTotalKg = current.weightKg * (current.pbfPercent / 100);
    const projectedFatTotalKg = currentFatTotalKg + fatKgDeltaSum;
    pbfPercent = round2((projectedFatTotalKg / weightKg) * 100);
  }

  let bmi = current.bmi;
  if (heightCm && weightKg !== null) {
    const heightM = heightCm / 100;
    bmi = round2(weightKg / (heightM * heightM));
  }

  return {
    date: null,
    time: null,
    weightKg,
    smmKg,
    pbfPercent,
    bmi,
    inbodyScore: null,
    visceralFatLevel: null,
    waistHipRatio: null,
    bmrKcal: null,
    recommendedKcal: null,
    segments,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Sums a numeric field (e.g. 'fatKg') across all 5 segments, treating null
 * as 0 — used to split a whole-body diet/training delta proportionally
 * across segments by each one's current share. */
function sumSegmentValue(measurement, field) {
  let sum = 0;
  for (const key of SEGMENT_KEYS) {
    const v = measurement.segments[key]?.[field];
    if (typeof v === 'number') sum += v;
  }
  return sum;
}

/** Scales `currentPct` by the ratio `projectedKg` moved from `currentKg`. */
function scalePct(currentPct, currentKg, projectedKg) {
  if (currentPct === null || !currentKg || projectedKg === null) return currentPct;
  return round2(currentPct * (projectedKg / currentKg));
}
