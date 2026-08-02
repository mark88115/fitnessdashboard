// fitness-dashboard/js/main.js
import { loadUserData } from './dataStore.js?v=msbmft4d';
import { computeSegmentTrends, projectMeasurement, DEFAULT_TRAINING_YEARS } from './projection.js?v=msbmft4d';
import { BodyScene } from './bodyScene.js?v=msbmft4d';
import { createTimeline } from './timeline.js?v=msbmft4d';
import { createAdjustSlider } from './sliders.js?v=msbmft4d';
import { setupBodytypeExplorer, muscleRateFromSmm } from './bodytypeExplorer.js?v=msbmft4d';
import { renderStatsPanel } from './statsPanel.js?v=msbmft4d';
import { setupDetailPanel } from './detailPanel.js?v=msbmft4d';
import { setupReferencePanel } from './referencePanel.js?v=msbmft4d';
import { renderTrendChart } from './trendChart.js?v=msbmft4d';
import { setupUserSelect } from './userSelect.js?v=msbmft4d';
import { setupLayoutToggle } from './layoutMode.js?v=msbmft4d';

const el = (id) => document.getElementById(id);

// Before anything measures itself: the 3D viewports size their canvases from
// their container, so the layout has to be settled first.
setupLayoutToggle(el('layout-toggle'));

const bodyScene = new BodyScene(el('body-scene-data'), el('body-scene-gallery'));
let bodySceneLoaded = false;

setupReferencePanel(el('reference-toggle'), el('reference-panel'));

let userData = null;
let dietPercent = 0;
let trainingPercent = 0;
let projectionMonths = 6;
let trainingYears = DEFAULT_TRAINING_YEARS;
// Only the current figure is drawn on arrival. The baseline and projection
// are overlays on top of it, and all three at once is a lot to read before
// you know what any of them mean; each is one checkbox away.
let showBaseline = false;
let showCurrent = true;
let showProjection = false;
let selectedBaselineDate = null;
let selectedCurrentDate = null;

/** Fallback body-fat % for a measurement that has none — the 'normal'
 * archetype's own value, i.e. the point where the fat axis contributes
 * nothing to the blend. */
const BODY_FAT_NEUTRAL = 18;

/** Average month length (365.25/12 days), not a flat 4 weeks — keeps a
 * 12-month projection close to a full year instead of drifting short. */
function monthsToWeeks(months) {
  return Math.round((months * 30.4375) / 7);
}

/** Rejects with `message` if `promise` hasn't settled within `ms` — so a
 * stalled load (e.g. a hung fetch/parse) surfaces as a visible error
 * instead of leaving the loading overlay up forever. */
function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

function showError(message) {
  const box = el('app-error');
  box.textContent = message;
  box.hidden = false;
}

function clearError() {
  const box = el('app-error');
  box.hidden = true;
  box.textContent = '';
}

async function loadUser(username) {
  try {
    clearError();
    userData = await loadUserData(username);
    selectedBaselineDate = null;
    selectedCurrentDate = null;

    if (!bodySceneLoaded) {
      await withTimeout(bodyScene.load(), 20000, '3D 模型載入逾時,請重新整理再試一次');
      bodySceneLoaded = true;
      el('body-scene-loading').hidden = true;
    }

    setupBodytypeExplorer(el('bodytype-explorer'), userData.heightCm, (musclePct, pbfPercent) => {
      bodyScene.setGalleryComposite(musclePct, pbfPercent);
    });

    const dates = userData.measurements.map((m) => m.date);
    createTimeline(el('timeline'), dates, ({ baselineDate, currentDate }) => {
      selectedBaselineDate = baselineDate;
      selectedCurrentDate = currentDate;
      render();
    });

    createAdjustSlider(el('diet-slider'), '飲食', '🍽', (value) => {
      dietPercent = value;
      render();
    });
    createAdjustSlider(el('training-slider'), '訓練', '🏋', (value) => {
      trainingPercent = value;
      render();
    }, { min: -30, max: 100, step: 10 });

    el('projection-period').value = String(projectionMonths);
    el('projection-period').onchange = (e) => {
      projectionMonths = Number(e.target.value);
      render();
    };

    el('training-years').value = String(trainingYears);
    el('training-years').onchange = (e) => {
      trainingYears = Number(e.target.value);
      render();
    };

    el('show-baseline').checked = showBaseline;
    el('show-baseline').onchange = (e) => {
      showBaseline = e.target.checked;
      render();
    };

    el('show-current').checked = showCurrent;
    el('show-current').onchange = (e) => {
      showCurrent = e.target.checked;
      render();
    };

    el('show-projection').checked = showProjection;
    el('show-projection').onchange = (e) => {
      showProjection = e.target.checked;
      render();
    };

    renderTrendChart(el('trend-chart'), userData.measurements);
  } catch (err) {
    showError(`載入使用者資料失敗:${err.message}`);
  }
}

function findMeasurement(date) {
  return userData.measurements.find((m) => m.date === date);
}

function clearDashboard() {
  el('personal-info-body').innerHTML = '';
  el('panel-left').innerHTML = '';
  el('detail-panel').innerHTML = '';
  el('projected-summary').textContent = '';
  if (bodySceneLoaded) {
    bodyScene.setVisible('baseline', false);
    bodyScene.setVisible('current', false);
    bodyScene.setVisible('projected', false);
  }
}

function render() {
  if (!userData || !selectedBaselineDate || !selectedCurrentDate) {
    clearDashboard();
    return;
  }

  const baseline = findMeasurement(selectedBaselineDate);
  const current = findMeasurement(selectedCurrentDate);
  if (!baseline || !current) {
    clearDashboard();
    return;
  }

  bodyScene.setVisible('baseline', showBaseline);
  bodyScene.setVisible('current', showCurrent);
  if (showBaseline) setFigureComposition('baseline', baseline);
  if (showCurrent) setFigureComposition('current', current);

  bodyScene.setVisible('projected', showProjection);
  if (showProjection) {
    const trends = computeSegmentTrends(userData.measurements);
    const projected = projectMeasurement(
      current, trends, dietPercent, trainingPercent, userData.heightCm,
      monthsToWeeks(projectionMonths), trainingYears
    );
    setFigureComposition('projected', projected);
    renderProjectedSummary(el('projected-summary'), projected);
  } else {
    el('projected-summary').textContent = '';
  }

  renderPersonalInfo(el('personal-info-body'), current);
  renderStatsPanel(el('panel-left'), current);
  setupDetailPanel(el('detail-toggle'), el('detail-panel'), current);
}

/** Drives a left-viewport figure from a measurement, converting it to the
 * same (muscle rate, body-fat %) pair the explorer's sliders produce so that
 * both viewports render identical bodies for identical composition. The
 * measurement's own smmKg/pbfPercent are used directly rather than an
 * average of its per-segment "% of standard" fields, which are on a
 * different scale than anything the explorer can express. */
function setFigureComposition(stateKey, measurement) {
  const musclePct = muscleRateFromSmm(measurement.smmKg, userData.heightCm);
  bodyScene.setComposition(
    stateKey,
    musclePct === null ? 100 : musclePct,
    measurement.pbfPercent === null ? BODY_FAT_NEUTRAL : measurement.pbfPercent
  );
}

const SEX_LABELS = { male: '男性', female: '女性' };

function renderPersonalInfo(container, current) {
  const fmt = (v, unit) => (v === null || v === undefined ? '無資料' : `${v}${unit}`);
  const row = (label, value) =>
    `<div class="stat-row"><div class="stat-row__label">${label}</div><div class="stat-row__value">${value}</div></div>`;
  container.innerHTML =
    row('身高', fmt(userData.heightCm, 'cm')) +
    row('體重', fmt(current.weightKg, 'kg')) +
    row('年齡', fmt(userData.age, '歲')) +
    row('性別', SEX_LABELS[userData.sex] ?? '無資料');
}

function renderProjectedSummary(container, projected) {
  const fmt = (v, unit) => (v === null || v === undefined ? '無資料' : `${v}${unit}`);
  container.textContent =
    `預估${projectionMonths}個月後:體重 ${fmt(projected.weightKg, 'kg')}` +
    `｜骨骼肌重 ${fmt(projected.smmKg, 'kg')}` +
    `｜體脂率 ${fmt(projected.pbfPercent, '%')}`;
}

setupUserSelect(el('user-select'), loadUser).catch((err) => {
  showError(`載入使用者清單失敗:${err.message}`);
});
