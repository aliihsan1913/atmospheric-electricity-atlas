async function loadPhenomena() {
  const res = await fetch('../assets/data/phenomena.json');
  if (!res.ok) throw new Error('failed to load phenomena.json');
  return res.json();
}

function textBlock(label, value) {
  const filled = value && value.trim();
  return `
    <div class="detail-section">
      <p class="detail-section__label">${label}</p>
      <p class="detail-section__body ${filled ? '' : 'detail-section__body--empty'}">
        ${filled ? value : 'Not yet filled in.'}
      </p>
    </div>
  `;
}

function readout(label, value) {
  const filled = value && String(value).trim();
  return `
    <div class="readout">
      <p class="readout__label">${label}</p>
      <p class="readout__value ${filled ? '' : 'readout__value--empty'}">${filled ? value : '—'}</p>
    </div>
  `;
}

function factsHTML(facts) {
  if (!facts || facts.length === 0) {
    return '<p class="detail-section__body detail-section__body--empty">Not yet filled in.</p>';
  }
  return `<ul class="fact-list">${facts.map((f) => `<li>${f}</li>`).join('')}</ul>`;
}

function sourcesHTML(sources) {
  if (!sources || sources.length === 0) {
    return '<p class="detail-section__body detail-section__body--empty">Not yet filled in.</p>';
  }
  return `<ul class="source-list">${sources.map((s) => `<li>${s.label || s.url || s}</li>`).join('')}</ul>`;
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const { phenomena } = await loadPhenomena();
  const p = phenomena.find((x) => x.id === id);

  const headerRoot = document.getElementById('header-root');
  const bodyRoot = document.getElementById('body-root');

  if (!p) {
    bodyRoot.innerHTML = `<p class="detail-section__body">Phenomenon not found: <code>${id}</code></p>`;
    return;
  }

  document.title = `${p.name_tr} — Atmospheric Electricity Atlas`;

  headerRoot.innerHTML = `
    <div class="detail-header__row">
      <span class="detail-header__code">${p.code}</span>
      <h1 class="detail-header__title">${p.name_tr}</h1>
    </div>
    <p class="detail-header__meta">${p.name_en} · ${p.altitude_km[0]}–${p.altitude_km[1]} km AGL</p>
  `;

  bodyRoot.innerHTML = `
    ${p.note ? `<div class="note-box">${p.note}</div>` : ''}

    <div class="sim-panel">
      <div class="sim-panel__canvas-wrap">
        <canvas id="sim-canvas"></canvas>
      </div>
      <div class="sim-panel__controls">
        <button class="strike-btn" id="strike-btn">Strike</button>
        <div class="speed-control">
          <span>SPEED</span>
          <input type="range" id="speed-slider" min="8" max="140" value="45" />
          <span class="speed-control__value" id="speed-value">45 ms/step</span>
        </div>
      </div>
      <p class="sim-readout" id="sim-readout">Press <strong>Strike</strong> to start the simulation.</p>
    </div>

    ${textBlock('What it is', p.what_it_is)}
    ${textBlock('How it forms', p.how_it_forms)}
    ${textBlock('Where it occurs', p.where_it_occurs)}

    <div class="detail-section">
      <p class="detail-section__label">Electrical characteristics</p>
      <div class="readout-grid">
        ${readout('Voltage', p.electrical.voltage)}
        ${readout('Current', p.electrical.current)}
        ${readout('Energy', p.electrical.energy)}
        ${readout('Duration', p.electrical.duration)}
        ${readout('Temperature', p.electrical.temperature)}
      </div>
    </div>

    <div class="detail-section">
      <p class="detail-section__label">Notable facts</p>
      ${factsHTML(p.fun_facts)}
    </div>

    <div class="detail-section">
      <p class="detail-section__label">Sources</p>
      ${sourcesHTML(p.sources)}
    </div>
  `;

  // Wire up the simulation
  const canvas = document.getElementById('sim-canvas');
  const strikeBtn = document.getElementById('strike-btn');
  const speedSlider = document.getElementById('speed-slider');
  const speedValue = document.getElementById('speed-value');
  const simReadout = document.getElementById('sim-readout');

  const sim = createPhenomenonSim(canvas, p.id, {
    initialSpeedMs: Number(speedSlider.value),
    currentRange: () => p.electrical.current,
    onComplete: (text) => {
      simReadout.innerHTML = `<strong>${text}</strong>`;
      strikeBtn.disabled = false;
    },
  });

  if (sim.isContinuous) {
    strikeBtn.textContent = 'On';
    simReadout.textContent = 'A continuous phenomenon — activate with "On".';
    strikeBtn.addEventListener('click', () => {
      const on = sim.toggle();
      strikeBtn.textContent = on ? 'Off' : 'On';
      strikeBtn.classList.toggle('is-active', on);
    });
  } else {
    strikeBtn.addEventListener('click', () => {
      strikeBtn.disabled = true;
      simReadout.textContent = 'channel developing…';
      sim.trigger();
    });
  }

  speedSlider.addEventListener('input', () => {
    sim.setSpeedMs(Number(speedSlider.value));
    speedValue.textContent = `${speedSlider.value} ms/step`;
  });
}

init().catch((err) => {
  console.error(err);
  document.getElementById('body-root').innerHTML =
    '<p style="color:#c77;">Failed to load phenomena.json.</p>';
});
