/* ============================== SETTINGS UI ============================ */
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
$('finishPoly').addEventListener('click', finishDraft);
$('cancelPoly').addEventListener('click', cancelDraft);
$('setBar').addEventListener('change', e => { state.settings.barriers = e.target.checked; log(`Buildings/hoarding screening ${e.target.checked ? 'ON' : 'OFF'}.`); requestCompute(false); });
$('setTerr').addEventListener('change', e => { state.settings.terrain = e.target.checked; log(`Terrain screening ${e.target.checked ? 'ON' : 'OFF'}.`); requestCompute(false); });
$('setShade').addEventListener('change', e => { state.settings.shade = e.target.checked; requestRender(); });
$('setAir').addEventListener('change', e => { state.settings.air = e.target.checked; requestCompute(false); });
$('setGround').addEventListener('change', e => { state.settings.ground = e.target.value; log(`Ground: ${e.target.value}.`); requestCompute(false); });
bindNum($('setHr'), 0, 200, v => { state.settings.hr = v; });
bindNum($('setNewH'), 0.5, 300, v => { state.settings.newH = v; });
bindNum($('setNewHo'), 0.3, 20, v => { state.settings.newHo = v; });
$('setCell').addEventListener('change', e => { state.settings.cellPx = parseInt(e.target.value, 10); requestCompute(false); });
$('setMin').addEventListener('change', e => { state.settings.minDb = parseInt(e.target.value, 10); buildLegend(); requestCompute(false); });
$('setOp').addEventListener('input', e => { state.settings.opacity = parseFloat(e.target.value); requestRender(); });
function syncSettingsUI() {
  const S = state.settings;
  $('setBar').checked = S.barriers; $('setTerr').checked = S.terrain; $('setShade').checked = S.shade; $('setAir').checked = S.air;
  $('setGround').value = S.ground; $('setHr').value = S.hr; $('setNewH').value = S.newH; $('setNewHo').value = S.newHo;
  $('setCell').value = String(S.cellPx); $('setMin').value = String(S.minDb); $('setOp').value = S.opacity; buildLegend();
}
function buildLegend() {
  const min = state.settings.minDb;
  $('legend').innerHTML = BANDS.filter(b => b[0] >= min).map((b, i, arr) => `<div><i style="background:${b[1]}"></i>${b[0]}${i === arr.length - 1 ? '+' : '–' + (b[0] + 5)}</div>`).join('');
}

