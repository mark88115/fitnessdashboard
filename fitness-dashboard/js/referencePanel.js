// fitness-dashboard/js/referencePanel.js

// InBody's own "% of normal for your build" convention (the same musclePct/
// fatPct values shown in the stats panel above) — this 3-band split
// (低/正常/高 at 90%/110%) is InBody's own commonly-published segmental
// analysis classification, not something we invented.
const SEGMENT_BANDS = [
  { label: '低', range: '低於 90%' },
  { label: '正常', range: '90% ~ 110%' },
  { label: '高', range: '高於 110%' },
];

// General adult-male body-fat-percentage reference bands (commonly cited
// fitness-industry ranges, e.g. ACE) — a population guideline, not a
// personalized medical reading.
const BODY_FAT_BANDS = [
  { label: '過低', range: '低於 10%' },
  { label: '正常', range: '10% ~ 20%' },
  { label: '稍高', range: '20% ~ 25%' },
  { label: '過高', range: '高於 25%' },
];

function bandRows(bands) {
  return bands
    .map(({ label, range }) => `<div class="detail-row"><span class="detail-row__label">${label}</span><span class="detail-row__value">${range}</span></div>`)
    .join('');
}

/** Wires the toggle button for the static (measurement-independent)
 * standard-reference-range panel. */
export function setupReferencePanel(toggleButton, panel) {
  panel.innerHTML = `
    <p class="reference-panel__note">部位肌肉%/脂肪%(InBody「% of normal」,以你的身高體重換算的標準值):</p>
    ${bandRows(SEGMENT_BANDS)}
    <p class="reference-panel__note">體脂肪率(一般成年男性參考範圍,非個人化醫學數值):</p>
    ${bandRows(BODY_FAT_BANDS)}
  `;

  toggleButton.onclick = () => {
    const expanded = toggleButton.getAttribute('aria-expanded') === 'true';
    toggleButton.setAttribute('aria-expanded', String(!expanded));
    panel.hidden = expanded;
    toggleButton.textContent = expanded ? '▸ 標準參考值' : '▾ 標準參考值';
  };
}
