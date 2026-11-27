const VIEWPORT_MATRIX = [
  { width: 900, height: 600, zooms: [100, 150] },
  { width: 1100, height: 680, zooms: [100, 150, 200, 300] },
  { width: 1280, height: 720, zooms: [100, 125] },
  { width: 1440, height: 900, zooms: [100, 125, 150, 200] },
  { width: 1920, height: 1080, zooms: [100] },
  { width: 2560, height: 1440, zooms: [100] },
  { width: 3440, height: 1440, zooms: [100, 150] },
  { width: 5120, height: 1440, zooms: [100] },
].flatMap(({ width, height, zooms }) =>
  zooms.map((zoom) => ({ width, height, zoom })),
);

function sizeKey(viewport) {
  return `${viewport.width}x${viewport.height}`;
}

function rowKey(viewport) {
  return `${sizeKey(viewport)}@${viewport.zoom}`;
}

module.exports = { VIEWPORT_MATRIX, rowKey, sizeKey };
