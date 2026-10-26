/* ============================== CONSTANTS ============================== */
const VERSION = '0.4.0';
const C_AIR = 343, F_BAND = 500, LAMBDA = C_AIR / F_BAND;
const ALPHA_DBKM = 1.9;
const MAX_TERRAIN_SAMPLES = 160;
const MAX_DEM_CELLS = 4.5e6;

const BANDS = [
  [30, '#d4edc4'], [35, '#a5d68a'], [40, '#5fb85a'], [45, '#2e8b3e'],
  [50, '#f4e04d'], [55, '#e7b23a'], [60, '#f07f22'], [65, '#e0352b'],
  [70, '#a3173a'], [75, '#8a2a9b'], [80, '#3e4fb0'], [85, '#142266']
];
const BAND_RGB = BANDS.map(b => hexToRgb(b[1]));

const EQUIP = [
  ['Excavator (~20 t)', 105], ['Excavator + hydraulic hammer', 118], ['Bored piling rig', 111],
  ['Concrete saw', 117], ['Jackhammer', 113], ['Concrete pump', 108], ['Concrete agitator truck', 109],
  ['Dump truck', 108], ['Mobile crane', 104], ['Skid steer loader', 104], ['Vibratory roller', 109],
  ['Generator', 99], ['Hand tools (electric)', 102], ['Custom', null]
];
const CUSTOM_EQ = EQUIP.length - 1;

