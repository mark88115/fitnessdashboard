// fitness-dashboard/js/bodytypeExplorer.js

const FAT_MIN = 5, FAT_MAX = 40, FAT_STEP = 0.5, FAT_DEFAULT = 18;
// The slider's top end deliberately coincides with buff.dae's own musclePct
// coordinate in bodyScene.js, so dragging to the end shows exactly that
// archetype's sculpted shape and nothing beyond it.
const MUSCLE_MIN = 70, MUSCLE_MAX = 160, MUSCLE_STEP = 1, MUSCLE_DEFAULT = 100;

// Calibrated against a real InBody 270 report (poya, 181cm male) instead of
// a guessed ratio — the previous version assumed SMM was ~36% of a BMI-22
// "standard" weight, which was off by ~13kg/6kg against poya's real report
// (weight 78.3kg, SMM 39.0kg, PBF 12.9%, at an estimated musclePct≈111%,
// averaged from that report's 5 segment muscle% figures: 113.0/113.1/107.3/
// 110.3/111.4). Two constants, solved from that one real data point:
//   smmKg = STANDARD_SMM_PER_HEIGHT_SQ × height(m)² × (musclePct/100)
//   otherMassKg (bone/organ/water, not modeled by either slider, assumed
//     constant regardless of the sliders) = OTHER_MASS_PER_HEIGHT_SQ × height(m)²
//   weightKg = (smmKg + otherMassKg) / (1 - pbfPercent/100)
// — the last line solved so pbfPercent stays internally consistent with its
// own meaning (fatKg / weightKg). Plugging in poya's own real musclePct≈111
// and pbfPercent=12.9 reproduces weightKg=78.3/smmKg=39.0 almost exactly;
// STANDARD_BMI=22 (used only as a sanity check, not in the formula below)
// separately matches InBody's own published "standard weight" formula.
const STANDARD_SMM_PER_HEIGHT_SQ = 10.72;
const OTHER_MASS_PER_HEIGHT_SQ = 8.92;

/** The inverse of the smmKg line above: what muscle rate a real measured
 * skeletal-muscle mass corresponds to at a given height. This is what lets
 * the data viewport and the explorer viewport be driven by the same pair of
 * numbers — muscle rate and body-fat percentage — so that dialling the
 * sliders to a measurement's own values reproduces that measurement's
 * figure. Before this, the data side fed the blend a 5-segment average of
 * InBody's "% of standard" fields while the explorer fed it slider values on
 * a different scale, and the two viewports disagreed by ~1.65x at the same
 * stated body composition. */
export function muscleRateFromSmm(smmKg, heightCm) {
  if (typeof smmKg !== 'number' || typeof heightCm !== 'number' || heightCm <= 0) return null;
  const standardSmmKg = STANDARD_SMM_PER_HEIGHT_SQ * (heightCm / 100) ** 2;
  return (smmKg / standardSmmKg) * 100;
}

function estimateFromSliders(heightCm, musclePct, pbfPercent) {
  if (typeof heightCm !== 'number' || heightCm <= 0) return null;
  const heightSq = (heightCm / 100) ** 2;
  const standardSmmKg = STANDARD_SMM_PER_HEIGHT_SQ * heightSq;
  const otherMassKg = OTHER_MASS_PER_HEIGHT_SQ * heightSq;

  const smmKg = standardSmmKg * (musclePct / 100);
  const weightKg = (smmKg + otherMassKg) / (1 - pbfPercent / 100);

  return {
    smmKg: Math.round(smmKg * 10) / 10,
    weightKg: Math.round(weightKg * 10) / 10,
  };
}

/**
 * Renders the 體脂/肌肉量率 sliders plus live 肌肉量(kg)/預估體重 readouts into
 * `container`, all computed at `heightCm`. Calls onChange(musclePct,
 * pbfPercent) immediately with the defaults, then on every slider input.
 */
export function setupBodytypeExplorer(container, heightCm, onChange) {
  container.innerHTML = `
    <div class="slider-row">
      <label class="slider-label">體脂</label>
      <input type="range" class="slider-input" id="bte-fat" min="${FAT_MIN}" max="${FAT_MAX}" step="${FAT_STEP}" value="${FAT_DEFAULT}" />
      <span class="bodytype-explorer__readout">
        <span class="slider-value" id="bte-fat-value">${FAT_DEFAULT}%</span>
        <span class="bodytype-explorer__highlight"></span>
      </span>
    </div>
    <div class="slider-row">
      <label class="slider-label">肌肉量率</label>
      <input type="range" class="slider-input" id="bte-muscle" min="${MUSCLE_MIN}" max="${MUSCLE_MAX}" step="${MUSCLE_STEP}" value="${MUSCLE_DEFAULT}" />
      <span class="bodytype-explorer__readout">
        <span class="slider-value" id="bte-muscle-value">${MUSCLE_DEFAULT}%</span>
        <span class="bodytype-explorer__highlight" id="bte-muscle-kg"></span>
      </span>
    </div>
    <p class="bodytype-explorer__weight" id="bte-weight"></p>
    <p class="bodytype-explorer__note">同等身高情況下(${heightCm ? heightCm + 'cm' : '無身高資料'})</p>
  `;

  const fatInput = container.querySelector('#bte-fat');
  const muscleInput = container.querySelector('#bte-muscle');
  const fatValueEl = container.querySelector('#bte-fat-value');
  const muscleValueEl = container.querySelector('#bte-muscle-value');
  const muscleKgEl = container.querySelector('#bte-muscle-kg');
  const weightEl = container.querySelector('#bte-weight');

  function update() {
    const pbfPercent = Number(fatInput.value);
    const musclePct = Number(muscleInput.value);
    fatValueEl.textContent = `${pbfPercent}%`;
    muscleValueEl.textContent = `${musclePct}%`;

    const estimate = estimateFromSliders(heightCm, musclePct, pbfPercent);
    if (estimate) {
      muscleKgEl.textContent = `肌肉量 ${estimate.smmKg}kg`;
      weightEl.textContent = `預估體重 ${estimate.weightKg}kg`;
    } else {
      muscleKgEl.textContent = '';
      weightEl.textContent = '無身高資料,無法估算體重';
    }
    onChange(musclePct, pbfPercent);
  }

  fatInput.addEventListener('input', update);
  muscleInput.addEventListener('input', update);
  update();
}
