/* ============================== CONSTANTS ============================== */
const VERSION = '0.6.0';
const C_AIR = 343, F_BAND = 500, LAMBDA = C_AIR / F_BAND;
/* Air absorption, dB/km, from ISO 9613-1 at 250 / 500 / 1000 Hz, averaged over
   the three bands – the same values and conditions as the TfNSW Construction
   Noise Estimator ("Air Atten calcs"). warm = Oct–Apr (day 20 °C/80 %,
   night 15 °C/80 %), cool = May–Sep (day 15 °C/70 %, night 5 °C/70 %). */
const AIR_ATTEN = {
  warm: { day: [1.04, 2.77, 5.15], night: [1.07, 2.4, 4.15] },
  cool: { day: [1.13, 2.36, 4.08], night: [0.897, 1.64, 3.8] }
};
/* CONCAWE ground attenuation for meteorological category 4 (neutral), cubic
   fits in log10(d) at 250 / 500 / 1000 Hz, each including the +3 dB correction
   the TfNSW estimator applies so they sit on top of hemispherical spreading. */
const CONCAWE_CAT4 = [[-61.2, 48.6, -9.53, 0.634], [-71.9, 82.23, -26.921, 2.9258], [-97.1, 104.68, -34.693, 3.8068]];
const PERIODS = {
  std: 'Standard hours', p1day: 'OOHW Period 1 – day', p1eve: 'OOHW Period 1 – evening',
  p2eve: 'OOHW Period 2 – evening (Sun/PH)', p2night: 'OOHW Period 2 – night'
};
const DEFAULT_NCA_CAT = 'R3';
const MAX_TERRAIN_SAMPLES = 160;
const MAX_DEM_CELLS = 4.5e6;

const BANDS = [
  [30, '#d4edc4'], [35, '#a5d68a'], [40, '#5fb85a'], [45, '#2e8b3e'],
  [50, '#f4e04d'], [55, '#e7b23a'], [60, '#f07f22'], [65, '#e0352b'],
  [70, '#a3173a'], [75, '#8a2a9b'], [80, '#3e4fb0'], [85, '#142266']
];
const BAND_RGB = BANDS.map(b => hexToRgb(b[1]));

/* Equipment library: src/data/equipment.json, editable in the app and
   exported/imported as JSON. lw is the sound power without the special
   audible characteristics correction; sac items get SAC_PENALTY by default. */
let LIBRARY = DATA.equipment.items.map(o => Object.assign({}, o));
const DEFAULT_EQ = 't19-excavator-tracked-20-t', SAC_PENALTY = 5;
function libItem(id) { return LIBRARY.find(o => o.id === id) || LIBRARY.find(o => o.id === 'custom'); }

