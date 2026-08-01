// fitness-dashboard/js/trendChart.js

// Each measurement gets one fixed-width slot instead of squeezing the whole
// history into a container-width chart — so the font/line spacing never has
// to shrink or fatten to fit. At the typical panel width that's roughly 30
// slots visible at once; past that the wrap container (overflow-x: auto)
// just scrolls/drags horizontally instead of cramming more in.
const SLOT_WIDTH = 36;
const PADDING_X = 16;
const PADDING_Y = 8;
const PLOT_HEIGHT = 70;
const AXIS_HEIGHT = 20;
const CHART_HEIGHT = PLOT_HEIGHT + AXIS_HEIGHT;

function formatDateShort(dateStr) {
  const parts = dateStr.split('-');
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : dateStr;
}

function buildXs(count) {
  return Array.from({ length: count }, (_, i) => PADDING_X + SLOT_WIDTH * (i + 0.5));
}

function buildPoints(measurements, xs, accessor) {
  const values = measurements.map(accessor).filter((v) => v !== null);
  if (values.length === 0) return { points: [] };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const points = measurements.map((m, i) => {
    const v = accessor(m);
    const y = v === null ? null : PLOT_HEIGHT - PADDING_Y - ((v - min) / span) * (PLOT_HEIGHT - PADDING_Y * 2);
    return { x: xs[i], y, value: v };
  });
  return { points };
}

/**
 * Renders an SVG line chart (weight / SMM / PBF) with a shared tooltip that
 * shows the date + all three values for the nearest measurement, on hover
 * (mouse) or tap (touch, via the click listener). Hover targets are full
 * height columns (one per slot), not tiny points, so the user only needs to
 * be near a date's x-position, not exactly on a line. No numbers are drawn
 * on the chart itself — exact values only show in the tooltip.
 */
export function renderTrendChart(container, measurements) {
  const xs = buildXs(measurements.length);
  const totalWidth = PADDING_X * 2 + SLOT_WIDTH * measurements.length;

  const weight = buildPoints(measurements, xs, (m) => m.weightKg);
  const smm = buildPoints(measurements, xs, (m) => m.smmKg);
  const pbf = buildPoints(measurements, xs, (m) => m.pbfPercent);

  const toPolyline = (built) =>
    built.points.filter((p) => p.y !== null).map((p) => `${p.x},${p.y}`).join(' ');

  const toDots = (built, cls) =>
    built.points
      .filter((p) => p.y !== null)
      .map((p) => `<circle cx="${p.x}" cy="${p.y}" r="3" class="trend-dot ${cls}" />`)
      .join('');

  const xAxisLabels = measurements
    .map((m, i) => `<text x="${xs[i]}" y="${PLOT_HEIGHT + 14}" text-anchor="middle" class="trend-axis-label">${formatDateShort(m.date)}</text>`)
    .join('');

  const hitRects = measurements
    .map((_, i) => `<rect x="${PADDING_X + SLOT_WIDTH * i}" y="0" width="${SLOT_WIDTH}" height="${PLOT_HEIGHT}" class="trend-hit" data-index="${i}" fill="transparent" />`)
    .join('');

  container.innerHTML = `
    <div class="trend-chart__title">歷程趨勢(體重 / 骨骼肌重 / 體脂率)</div>
    <div class="trend-chart__legend">
      <span class="trend-legend__item"><span class="trend-legend__swatch trend-legend__swatch--weight"></span>體重 kg</span>
      <span class="trend-legend__item"><span class="trend-legend__swatch trend-legend__swatch--smm"></span>骨骼肌重 kg</span>
      <span class="trend-legend__item"><span class="trend-legend__swatch trend-legend__swatch--pbf"></span>體脂率 %</span>
    </div>
    <div class="trend-chart__outer">
      <div class="trend-chart__wrap">
        <svg width="${totalWidth}" height="${CHART_HEIGHT}" viewBox="0 0 ${totalWidth} ${CHART_HEIGHT}" class="trend-chart__svg">
          <polyline points="${toPolyline(weight)}" class="trend-line trend-line--weight" />
          <polyline points="${toPolyline(smm)}" class="trend-line trend-line--smm" />
          <polyline points="${toPolyline(pbf)}" class="trend-line trend-line--pbf" />
          ${toDots(weight, 'trend-dot--weight')}
          ${toDots(smm, 'trend-dot--smm')}
          ${toDots(pbf, 'trend-dot--pbf')}
          ${xAxisLabels}
          ${hitRects}
        </svg>
      </div>
      <div class="trend-chart__tooltip" hidden></div>
    </div>
  `;

  const wrap = container.querySelector('.trend-chart__wrap');
  const tooltip = container.querySelector('.trend-chart__tooltip');
  const hitAreas = container.querySelectorAll('.trend-hit');

  hitAreas.forEach((hit) => {
    const index = Number(hit.dataset.index);
    const m = measurements[index];
    const show = () => {
      tooltip.hidden = false;
      tooltip.innerHTML = `
        <div class="tooltip__date">${m.date}</div>
        <div>體重 <span>${m.weightKg ?? '無資料'} kg</span></div>
        <div>骨骼肌重 <span>${m.smmKg ?? '無資料'} kg</span></div>
        <div>體脂率 <span>${m.pbfPercent ?? '無資料'} %</span></div>
      `;
      // xs[index] is relative to the scrolling wrap's content; subtract its
      // current scroll offset to place the tooltip in the outer container's
      // (non-scrolling) coordinate space.
      tooltip.style.left = `${xs[index] - wrap.scrollLeft}px`;
    };
    hit.addEventListener('mouseenter', show);
    hit.addEventListener('click', show);
    hit.addEventListener('mouseleave', () => { tooltip.hidden = true; });
  });
}
