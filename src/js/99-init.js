/* ================================ INIT ================================= */
$('ver').textContent = 'v' + VERSION;
log(`Noise POC v${VERSION} starting. λ = ${LAMBDA.toFixed(3)} m (${F_BAND} Hz). DecompressionStream: ${typeof DecompressionStream !== 'undefined' ? 'yes' : 'NO'}.`);
const selftest = selfTest();
nextId = 1;
syncSettingsUI(); updateLibInfo(); syncAssessUI(); renderCalPanel(); setMode('select'); loadDemo(); renderSelPanel(); updateDemInfo(); updateSiteInfo();
if (window.ResizeObserver) new ResizeObserver(resize).observe(wrap); else window.addEventListener('resize', resize);
resize();
requestAnimationFrame(() => zoomExtents());
window.__noise = { buildReferenceExample, runCalibration, runAllShifts, buildReport, _t: { openShiftCompare, parseDates, datesText, dateRuns, respiteCheck, computeRespite, switchShift, curShift, makeShift, parseCsv, levelAt, estimatorRowLevel, estimatorCombine, estimatorLevel, activeSources, setRuleSet, crsFromGeoKeys, fillHoles, mgaZoneToZone, effectiveLw, overMax, libItem, sanitizeSettings, nmlFor, classify, sleepCheck, landUseFromTags, luOf, floorsOf, addressOf, facadePoints, makeBuilding, makeNca, geomChanged, rules: () => RULES }, runAssessment, library: () => LIBRARY, selftest, LAZ, loadLidar, osmXmlToElements, state, ground, contrib, prep, ll2mga, mga2ll, importOsm, local2ll, ll2local };
