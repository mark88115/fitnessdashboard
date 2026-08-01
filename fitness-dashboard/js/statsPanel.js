// fitness-dashboard/js/statsPanel.js

const SEGMENT_LABELS = {
  left_arm: '左手', right_arm: '右手', trunk: '軀幹', left_leg: '左腿', right_leg: '右腿',
};

function fmt(v, unit) {
  return v === null || v === undefined ? '無資料' : `${v}${unit}`;
}

function statRow(label, seg) {
  return `
    <div class="stat-row">
      <div class="stat-row__label">${label}</div>
      <div class="stat-row__value">肌肉 ${fmt(seg.muscleKg, 'kg')}${seg.musclePct !== null ? ` (${seg.musclePct}%)` : ''}</div>
      <div class="stat-row__value stat-row__value--fat">脂肪 ${fmt(seg.fatKg, 'kg')}${seg.fatPct !== null ? ` (${seg.fatPct}%)` : ''}</div>
    </div>
  `;
}

/** Renders every segment (both arms, both legs, trunk) plus body-fat % and
 * InBody score into one left-side panel. */
export function renderStatsPanel(container, measurement) {
  const trunk = measurement.segments.trunk;
  container.innerHTML =
    statRow(SEGMENT_LABELS.left_arm, measurement.segments.left_arm) +
    statRow(SEGMENT_LABELS.right_arm, measurement.segments.right_arm) +
    statRow(SEGMENT_LABELS.trunk, trunk) +
    statRow(SEGMENT_LABELS.left_leg, measurement.segments.left_leg) +
    statRow(SEGMENT_LABELS.right_leg, measurement.segments.right_leg) +
    `<div class="stat-row"><div class="stat-row__label">體脂率</div><div class="stat-row__value">${fmt(measurement.pbfPercent, '%')}</div></div>` +
    `<div class="stat-row"><div class="stat-row__label">骨骼肌重</div><div class="stat-row__value">${fmt(measurement.smmKg, 'kg')}</div></div>` +
    `<div class="stat-row"><div class="stat-row__label">InBody 評分</div><div class="stat-row__value">${fmt(measurement.inbodyScore, '')}</div></div>`;
}
