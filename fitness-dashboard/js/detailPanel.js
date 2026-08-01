// fitness-dashboard/js/detailPanel.js

const DETAIL_FIELDS = [
  { key: 'bmi', label: 'BMI', unit: '' },
  { key: 'visceralFatLevel', label: '內臟脂肪級別', unit: '' },
  { key: 'waistHipRatio', label: '腰臀圍比', unit: '' },
  { key: 'bmrKcal', label: '基礎代謝率', unit: 'kcal' },
  { key: 'recommendedKcal', label: '建議熱量攝取', unit: 'kcal' },
];

/** Wires the toggle button and renders detail rows for `measurement`. */
export function setupDetailPanel(toggleButton, panel, measurement) {
  panel.innerHTML = DETAIL_FIELDS.map(({ key, label, unit }) => {
    const value = measurement[key];
    const display = value === null || value === undefined ? '無資料' : `${value}${unit}`;
    return `<div class="detail-row"><span class="detail-row__label">${label}</span><span class="detail-row__value">${display}</span></div>`;
  }).join('');

  toggleButton.onclick = () => {
    const expanded = toggleButton.getAttribute('aria-expanded') === 'true';
    toggleButton.setAttribute('aria-expanded', String(!expanded));
    panel.hidden = expanded;
    toggleButton.textContent = expanded ? '▸ 詳細數據' : '▾ 詳細數據';
  };
}
