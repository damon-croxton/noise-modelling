/* ============================== SETTINGS UI ============================ */
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
$('finishPoly').addEventListener('click', finishDraft);
$('cancelPoly').addEventListener('click', cancelDraft);
$('setBar').addEventListener('change', e => { state.settings.barriers = e.target.checked; log(`Buildings/hoarding screening ${e.target.checked ? 'ON' : 'OFF'}.`); requestCompute(false); });
$('setTerr').addEventListener('change', e => { state.settings.terrain = e.target.checked; log(`Terrain screening ${e.target.checked ? 'ON' : 'OFF'}.`); requestCompute(false); });
$('setShade').addEventListener('change', e => { state.settings.shade = e.target.checked; requestRender(); });
$('setAir').addEventListener('change', e => { state.settings.air = e.target.checked; requestCompute(false); });
$('setLat').addEventListener('change', e => { state.settings.lateral = e.target.checked; log(`Side diffraction ${e.target.checked ? 'ON' : 'OFF'}.`); requestCompute(false); });
$('setBands').addEventListener('change', e => { state.settings.bands = e.target.checked; log(`Octave-band calculation ${e.target.checked ? 'ON (ISO 9613-2, 63 Hz – 8 kHz, source spectra)' : 'OFF (A-weighted, 500 Hz)'}.`); requestCompute(false); });
$('setRefl').addEventListener('change', e => { state.settings.reflect = e.target.value; log(`Façade reflections: ${e.target.options[e.target.selectedIndex].text}.`); requestCompute(false); });
bindNum($('setReflLoss'), 0, 10, v => { state.settings.reflLoss = v; });
const METHOD_NOTES = {
  tfnsw: 'Same basis as the TfNSW Construction Noise Estimator: hemispherical spreading (20·lg d + 8), seasonal air absorption, CONCAWE ground × % soft, and screening from the modelled buildings, hoarding and terrain capped at the value below (the estimator allows at most 15 dB).',
  iso: 'ISO 9613-2: spherical spreading with ground per §7.3 (hard: G = 0, soft: eq. 10 with DΩ) full barrier diffraction (20/25 dB caps) and, with reflections on Auto, first-order façade reflections. Use for detailed checks; results can differ from the TfNSW estimator.'
};
function onMethodChange() {
  const iso = state.settings.method === 'iso';
  $('methodNote').textContent = METHOD_NOTES[state.settings.method];
  $('rowBarCap').hidden = iso; $('rowBands').hidden = !iso;
}
$('setMethod').addEventListener('change', e => { state.settings.method = e.target.value; onMethodChange(); log(`Method: ${e.target.options[e.target.selectedIndex].text}.`); requestCompute(false); });
$('setPeriod').addEventListener('change', e => { state.settings.period = e.target.value; log(`Time period: ${PERIODS[e.target.value]}.`); renderShiftPanel(); requestCompute(false); });
$('setSeason').addEventListener('change', e => { state.settings.season = e.target.value; log(`Season: ${e.target.value === 'warm' ? 'Oct–Apr' : 'May–Sep'} (air ${fmt(airAlpha(state.settings), 2)} dB/km).`); requestCompute(false); });
bindNum($('setSoft'), 0, 100, v => { state.settings.soft = v / 100; });
$('setCombine').addEventListener('change', e => { state.settings.combine = e.target.value; activeCache.sig = ''; log(`Plant combination: ${e.target.options[e.target.selectedIndex].text}.`); requestCompute(false); });
bindNum($('setBarCap'), 5, 25, v => { state.settings.barCap = v; });
bindNum($('setHr'), 0, 200, v => { state.settings.hr = v; });
bindNum($('setNewH'), 0.5, 300, v => { state.settings.newH = v; });
bindNum($('setNewHo'), 0.3, 20, v => { state.settings.newHo = v; });
$('setCell').addEventListener('change', e => { state.settings.cellPx = parseInt(e.target.value, 10); requestCompute(false); });
$('setMin').addEventListener('change', e => { state.settings.minDb = parseInt(e.target.value, 10); buildLegend(); requestCompute(false); });
$('setOp').addEventListener('input', e => { state.settings.opacity = parseFloat(e.target.value); requestRender(); });
function syncSettingsUI() {
  const S = state.settings;
  $('setBar').checked = S.barriers; $('setTerr').checked = S.terrain; $('setShade').checked = S.shade; $('setAir').checked = S.air; $('setLat').checked = S.lateral !== false;
  $('setBands').checked = !!S.bands; $('setRefl').value = S.reflect || 'auto'; $('setReflLoss').value = S.reflLoss == null ? 1 : S.reflLoss;
  $('setMethod').value = S.method; $('setPeriod').value = S.period; $('setSeason').value = S.season;
  $('setSoft').value = Math.round(S.soft * 100); $('setCombine').value = S.combine; $('setBarCap').value = S.barCap; onMethodChange();
  $('setHr').value = S.hr; $('setNewH').value = S.newH; $('setNewHo').value = S.newHo;
  $('setCell').value = String(S.cellPx); $('setMin').value = String(S.minDb); $('setOp').value = S.opacity; buildLegend(); renderShiftPanel();
}
/* Map legend: heat-map bands, and the impact categories (or respite counts) when the map shows them. */
function buildLegend() {
  const min = state.settings.minDb, AR = state.assess.results, L = UI.layers, D = state.assess.display;
  const showRes = L.impact && D === 'respite' && state.respite, showCat = L.impact && AR && !showRes && D !== 'heat';
  let h = '';
  if (L.heat && state.sources.length && !(showCat && D === 'cat') && !showRes)
    h += '<div class="lt">L<sub>Aeq,15min</sub> dB(A)</div>' + BANDS.filter(b => b[0] >= min).map((b, i, arr) => `<div><i style="background:${b[1]}"></i>${b[0]}${i === arr.length - 1 ? '+' : '–' + (b[0] + 5)}</div>`).join('');
  if (showCat) h += '<div class="lt">Impact (worst floor)</div>' + categoryList(AR.period).map(c => `<div><i style="background:${categoryColor(c)}"></i>${esc(c)}</div>`).join('');
  if (showRes) h += '<div class="lt">Dates above NML (all shifts)</div>' + RESPITE_RAMP.map(([k, c], i, a) => `<div><i style="background:${c}"></i>${k}${a[i + 1] ? (a[i + 1][0] - 1 > k ? '–' + (a[i + 1][0] - 1) : '') : '+'}</div>`).join('') + '<div><i style="border:2px solid #b91c1c"></i>respite issue</div>';
  $('legend').innerHTML = h; $('legend').hidden = !L.legend || !h;
}

