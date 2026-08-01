// fitness-dashboard/js/sliders.js

/**
 * Renders one percentage slider into `container`, defaulting to -30~+30 in
 * steps of 10. Calls onChange(value) immediately with 0, then on every change.
 *
 * The range is a parameter because the two sliders are not symmetric: diet
 * runs -30~+30 (both directions are equally realistic), while training runs
 * -30~+100, since doubling one's training volume is an ordinary thing to
 * plan for but halving one's food intake is not.
 */
export function createAdjustSlider(container, labelText, iconText, onChange, { min = -30, max = 30, step = 10 } = {}) {
  container.innerHTML = `
    <label class="slider-label">${iconText} ${labelText}</label>
    <input type="range" class="slider-input" min="${min}" max="${max}" step="${step}" value="0" />
    <span class="slider-value">0%</span>
  `;

  const input = container.querySelector('.slider-input');
  const valueLabel = container.querySelector('.slider-value');

  input.addEventListener('input', () => {
    const value = Number(input.value);
    valueLabel.textContent = `${value > 0 ? '+' : ''}${value}%`;
    onChange(value);
  });

  onChange(0);
}
