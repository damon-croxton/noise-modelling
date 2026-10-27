/* ======================== LAND USE, FLOORS, ADDRESS ===================== */
/* OSM tags kept on each building (everything else is dropped on import). */
const KEEP_TAGS = ['building', 'amenity', 'shop', 'office', 'name', 'building:levels', 'building:use', 'height',
  'addr:unit', 'addr:housenumber', 'addr:street', 'addr:suburb', 'addr:postcode'];
function keepTags(tags) {
  const t = {}; let n = 0;
  for (const k of KEEP_TAGS) if (tags && tags[k] != null) { t[k] = String(tags[k]).slice(0, 80); n++; }
  return n ? t : null;
}

/* Land use from OSM tags, using RULES.osmLandUse: amenity first, then the
   building value, then any shop/office tag. Anything else falls back to the
   'unknown' land use (residential by default) and is marked as assumed. */
function landUseFromTags(tags) {
  const M = RULES.osmLandUse; tags = tags || {};
  if (tags.amenity && M.amenity[tags.amenity]) return { lu: M.amenity[tags.amenity], src: `OSM amenity=${tags.amenity}` };
  const bu = tags['building:use'] || tags.building;
  if (bu && M.building[bu]) return { lu: M.building[bu], src: `OSM building=${bu}` };
  for (const k of M.commercialKeys || []) if (tags[k]) return { lu: 'commercial', src: `OSM ${k}=${tags[k]}` };
  return { lu: M.unknown, src: `assumed – OSM building=${bu || 'not tagged'}`, assumed: true };
}
/* Effective land use of a building: manual/file value, else OSM-derived. */
function luOf(b) {
  if (b.landUse && RULES.landUses[b.landUse]) return { lu: b.landUse, src: b.luSrc === 'file' ? 'imported file' : 'set by user' };
  if (b.tags) return landUseFromTags(b.tags);
  if (b.btype) return landUseFromTags({ building: b.btype });
  return { lu: RULES.osmLandUse.unknown, src: 'assumed – no land use data', assumed: true };
}

/* Floor count: user value, else OSM building:levels, else height ÷ floor height
   (rounded down, at least 1, so pitched roofs don't add a storey). */
function floorsOf(b) {
  if (b.floors != null && b.floors >= 1) return { n: Math.round(b.floors), src: 'set by user' };
  const lv = b.tags && parseFloat(b.tags['building:levels']);
  if (isFinite(lv) && lv >= 1 && lv < 200) return { n: Math.round(lv), src: 'OSM building:levels' };
  const fh = state.assess.floorH;
  return { n: Math.max(1, Math.floor((b.h + 0.25) / fh)), src: `height ${fmt(b.h, 1)} m ÷ ${fmt(fh, 1)} m` };
}
function floorLabel(k) { return k === 0 ? 'G' : 'L' + k; }

/* Address: user value, else OSM addr:* tags, else the building name. */
function addressOf(b) {
  if (b.address) return b.address;
  const t = b.tags || {};
  if (t['addr:housenumber'] || t['addr:street']) {
    return [t['addr:unit'] ? t['addr:unit'] + '/' : '', t['addr:housenumber'] || '', t['addr:housenumber'] ? ' ' : '', t['addr:street'] || '', t['addr:suburb'] ? ', ' + t['addr:suburb'] : ''].join('').trim();
  }
  return '';
}
