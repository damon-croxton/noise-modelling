/* ================================ INIT ================================= */
$('ver').textContent = 'v' + VERSION;
log(`Noise POC v${VERSION} starting. λ = ${LAMBDA.toFixed(3)} m (${F_BAND} Hz). DecompressionStream: ${typeof DecompressionStream !== 'undefined' ? 'yes' : 'NO'}.`);
const selftest = selfTest();
nextId = 1;
syncSettingsUI(); setMode('select'); loadDemo(); renderSelPanel(); updateDemInfo(); updateSiteInfo();
if (window.ResizeObserver) new ResizeObserver(resize).observe(wrap); else window.addEventListener('resize', resize);
resize();
requestAnimationFrame(() => zoomExtents());
window.__noise = { _t: { crsFromGeoKeys, fillHoles, mgaZoneToZone }, selftest, LAZ, loadLidar, osmXmlToElements, state, ground, contrib, prep, ll2mga, mga2ll, importOsm, local2ll, ll2local };
