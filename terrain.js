/* Original, hand-calibrated terrain geometry for assets/terrain.webp.
 * All positions are ground-plane pixels in the 1200 × 800 design space.
 * Walkable polygons describe LAND ONLY. They do not grant passage over water.
 */
(function () {
  'use strict';

  // [y, left water edge x, right water edge x], from top to bottom.
  // Interpolate between adjacent rows; the artwork's irregular banks are
  // approximated to within a few ground pixels, not a physical survey.
  const river = [
    [0, 626, 721], [40, 622, 713], [80, 599, 689],
    [120, 567, 656], [160, 550, 638], [200, 555, 645],
    [240, 574, 674], [280, 597, 696], [320, 610, 712],
    [360, 617, 724], [400, 614, 718], [440, 606, 704],
    [480, 589, 684], [520, 568, 665], [560, 551, 654],
    [600, 542, 655], [640, 548, 670], [680, 556, 684],
    [720, 558, 686], [760, 555, 688], [800, 545, 681]
  ];
  const leftBank = river.map(row => [row[1], row[0]]);
  const rightBank = river.map(row => [row[2], row[0]]);
  const riverPolygon = leftBank.concat(rightBank.slice().reverse());
  const riverSegments = river.slice(0, -1).map((row, i) => {
    const next = river[i + 1];
    return [[row[1], row[0]], [row[2], row[0]],
      [next[2], next[0]], [next[1], next[0]]];
  });

  // Conservative, closed-by-consumer land polygons. Points use the player's
  // foot position. Dense trees, stone walls, foreground foliage and water are
  // excluded. Ice or any future bridge must be handled separately by gameplay.
  const westLand = [
    [250, 145], [370, 105], [500, 100], [550, 120],
    [520, 170], [525, 220], [550, 255], [575, 305],
    [590, 345], [600, 380], [595, 420], [582, 460],
    [565, 500], [548, 525], [530, 560], [522, 600],
    [528, 645], [537, 685], [529, 724], [480, 733],
    [450, 717], [405, 733], [350, 720], [310, 705],
    [260, 692], [245, 645], [216, 620], [170, 604],
    [160, 560], [170, 520], [150, 495], [130, 480],
    [118, 450], [140, 423], [100, 410], [100, 370],
    [135, 347], [150, 325], [153, 280], [190, 270],
    [180, 230], [210, 215], [205, 180]
  ];
  const eastLand = [
    [720, 180], [790, 160], [890, 155], [970, 175],
    [1060, 198], [1125, 222], [1135, 300], [1145, 385],
    [1130, 440], [1080, 480], [1040, 484], [1010, 480],
    [974, 470], [938, 480], [924, 520], [920, 565],
    [900, 587], [864, 585], [831, 574], [785, 580],
    [735, 594], [696, 603], [684, 570], [686, 535],
    [701, 498], [714, 463], [730, 423], [738, 386],
    [734, 350], [721, 314], [705, 276], [685, 244],
    [672, 214], [676, 190]
  ];

  window.EchoTerrain = {
    version: 1,
    width: 1200,
    height: 800,
    image: 'assets/terrain.webp',
    coordinateSystem: 'ground-pixels-1200x800',
    spawn: [250, 395],
    bell: [969, 289],
    bellPlatform: { x: 969, y: 289, rx: 78, ry: 69 },
    westBankHint: [592, 395],
    eastBankHint: [742, 395],
    shootingSpot: [585, 355],
    // Layout guidance only: there is no pre-existing traversable bridge.
    intendedCrossing: {
      y: 395,
      from: [592, 395],
      to: [742, 395],
      waterSpan: [614.4, 718.8],
      traversable: false
    },
    river: river,
    leftBank: leftBank,
    rightBank: rightBank,
    riverPolygon: riverPolygon,
    riverSegments: riverSegments,
    walkable: [westLand, eastLand],
    walkableRegions: [
      { id: 'west', polygon: westLand },
      { id: 'east', polygon: eastLand }
    ],
    // Foreground trunks and masonry are also listed independently for engines
    // which use obstacle ellipses. These supplement, not replace, walkable land.
    obstacles: [
      { id: 'northwest-tree', x: 91, y: 184, rx: 78, ry: 91 },
      { id: 'west-moss-rocks', x: 92, y: 282, rx: 52, ry: 48 },
      { id: 'southwest-tree', x: 72, y: 597, rx: 72, ry: 98 },
      { id: 'southwest-rocks', x: 177, y: 698, rx: 75, ry: 51 },
      { id: 'north-stones', x: 429, y: 67, rx: 56, ry: 45 },
      { id: 'northeast-arch', x: 819, y: 106, rx: 94, ry: 54 },
      { id: 'east-wall', x: 1109, y: 143, rx: 91, ry: 56 },
      { id: 'southeast-arch', x: 1021, y: 576, rx: 64, ry: 72 },
      { id: 'south-wall', x: 869, y: 689, rx: 126, ry: 65 },
      { id: 'southeast-tree', x: 1165, y: 627, rx: 88, ry: 144 }
    ],
    relics: [
      { id: 'forest', name: '林间碎片', x: 370, y: 230 },
      { id: 'meadow', name: '草甸碎片', x: 355, y: 590 },
      { id: 'courtyard', name: '庭院碎片', x: 900, y: 475 }
    ],
    landmarks: [
      { id: 'arrival', name: '林间小径', x: 250, y: 395 },
      { id: 'west-shore', name: '西岸', x: 592, y: 395 },
      { id: 'east-shore', name: '东岸', x: 742, y: 395 },
      { id: 'bell-dais', name: '空圆石台', x: 969, y: 289 },
      { id: 'courtyard', name: '遗迹庭院', x: 900, y: 475 }
    ],
    attribution: {
      type: 'original-ai-generated-artwork',
      tool: 'OpenAI imagegen',
      reference: 'No third-party images or franchise characters used.',
      description: 'Original emerald woodland ruins with an unbridged stream; no characters, bell, labels or UI are baked into the image.'
    }
  };
}());
