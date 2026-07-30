async function loadPhenomena() {
  const res = await fetch('assets/data/phenomena.json');
  if (!res.ok) throw new Error('failed to load phenomena.json');
  return res.json();
}

function rowHTML(p, index) {
  return `
    <a class="row" href="phenomena/detail.html?id=${p.id}">
      <span class="row__index">${String(index).padStart(2, '0')}</span>
      <span class="row__code">${p.code}</span>
      <span>
        <div class="row__name-tr">${p.name_tr}</div>
        <div class="row__name-en">${p.name_en}</div>
      </span>
      <span class="row__altitude">${p.altitude_km[0]}–${p.altitude_km[1]} km</span>
    </a>
  `;
}

function categoryHTML(category, items, counterRef) {
  const rows = items.map((p) => {
    counterRef.i += 1;
    return rowHTML(p, counterRef.i);
  }).join('');

  return `
    <div class="category-block">
      <div class="category-block__title">${category.name}</div>
      <div class="index-list__head">
        <span>#</span><span>Code</span><span>Phenomenon</span><span>Altitude</span>
      </div>
      ${rows}
    </div>
  `;
}

async function init() {
  const { categories, phenomena } = await loadPhenomena();
  const root = document.getElementById('index-root');
  const counter = { i: 0 };

  root.innerHTML = categories
    .map((cat) => {
      const items = phenomena.filter((p) => p.category === cat.id);
      if (items.length === 0) return '';
      return categoryHTML(cat, items, counter);
    })
    .join('');

  const progress = document.getElementById('progress-readout');
  if (progress) progress.textContent = `${phenomena.length} phenomena`;
}

init().catch((err) => {
  console.error(err);
  document.getElementById('index-root').innerHTML =
    '<p style="padding:24px 0;color:#c77;">Failed to load phenomena.json.</p>';
});
