// fitness-dashboard/js/timeline.js

/**
 * Renders a dual-handle date timeline into `container`. Handles snap to the
 * nearest entry in `dates` — they can never land between two data points.
 * Calls onChange({ baselineDate, currentDate }) on setup and on every drag.
 */
export function createTimeline(container, dates, onChange) {
  if (dates.length === 0) {
    container.innerHTML = '<p class="timeline-empty">無資料</p>';
    onChange({ baselineDate: null, currentDate: null });
    return;
  }

  let baselineIndex = 0;
  let currentIndex = dates.length - 1;

  container.innerHTML = `
    <div class="timeline-labels">
      <span class="timeline-label timeline-label--baseline"></span>
      <span class="timeline-label timeline-label--current"></span>
    </div>
    <div class="timeline-track">
      <div class="timeline-handle timeline-handle--baseline" tabindex="0"></div>
      <div class="timeline-handle timeline-handle--current" tabindex="0"></div>
    </div>
  `;

  const track = container.querySelector('.timeline-track');
  const baselineHandle = container.querySelector('.timeline-handle--baseline');
  const currentHandle = container.querySelector('.timeline-handle--current');
  const baselineLabel = container.querySelector('.timeline-label--baseline');
  const currentLabel = container.querySelector('.timeline-label--current');

  function indexToPercent(i) {
    return dates.length === 1 ? 0 : (i / (dates.length - 1)) * 100;
  }

  function render() {
    baselineHandle.style.left = `${indexToPercent(baselineIndex)}%`;
    currentHandle.style.left = `${indexToPercent(currentIndex)}%`;
    baselineLabel.textContent = `基準 ${dates[baselineIndex]}`;
    currentLabel.textContent = `目前 ${dates[currentIndex]}`;
  }

  function nearestIndexForClientX(clientX) {
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(ratio * (dates.length - 1));
  }

  function emitChange() {
    onChange({ baselineDate: dates[baselineIndex], currentDate: dates[currentIndex] });
  }

  function attachDrag(handle, setIndex) {
    handle.addEventListener('pointerdown', (e) => {
      handle.setPointerCapture(e.pointerId);
      const onMove = (ev) => {
        setIndex(nearestIndexForClientX(ev.clientX));
        render();
        emitChange();
      };
      const onUp = () => {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
      };
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
    });
  }

  attachDrag(baselineHandle, (i) => { baselineIndex = i; });
  attachDrag(currentHandle, (i) => { currentIndex = i; });

  render();
  emitChange();
}
