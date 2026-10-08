/**
 * Olti qirrali gavhar toshining 3D modeli va uning berilgan burchakdagi
 * proyeksiyasi. Belgining o'lchamlari yassi logotip (`GemMark`) bilan bir xil,
 * shuning uchun aylanayotgan tosh ham o'sha belgidek ko'rinadi.
 */
const SIDES = 6;
const TABLE_RADIUS = 12;
const GIRDLE_RADIUS = 24;
const TABLE_Y = -21;
const GIRDLE_Y = -6;
const CULET_Y = 21;
/** Tosh tomoshabinga biroz egilgan — ustki yuzasi ko'rinib, hajm seziladi. */
const TILT = (18 * Math.PI) / 180;
const CAMERA_DISTANCE = 170;
const CENTER_X = 32;
const CENTER_Y = 33;
/** Yorug'lik yuqori-chapdan, tomoshabin tomondan tushadi (birlik vektor). */
const LIGHT = [-0.45, -0.65, 0.612] as const;

type Vec3 = readonly [number, number, number];

const ring = (radius: number, y: number): Vec3[] =>
  Array.from({ length: SIDES }, (_, index) => {
    const angle = (index / SIDES) * Math.PI * 2;
    return [radius * Math.cos(angle), y, radius * Math.sin(angle)] as const;
  });

const CULET = SIDES * 2;
const VERTICES: readonly Vec3[] = [
  ...ring(TABLE_RADIUS, TABLE_Y),
  ...ring(GIRDLE_RADIUS, GIRDLE_Y),
  [0, CULET_Y, 0],
];

const next = (index: number) => (index + 1) % SIDES;

/** Yuzalar: ustki maydoncha, toj qirralari, pastki (uchli) qirralar. */
const FACES: readonly (readonly number[])[] = [
  Array.from({ length: SIDES }, (_, index) => index),
  ...Array.from({ length: SIDES }, (_, i) => [i, next(i), SIDES + next(i), SIDES + i]),
  ...Array.from({ length: SIDES }, (_, i) => [SIDES + i, SIDES + next(i), CULET]),
];

/** Har bir qirra va unga tutash ikki yuza. */
const EDGES: readonly { from: number; to: number; faces: number[] }[] = (() => {
  const edges = new Map<string, { from: number; to: number; faces: number[] }>();
  FACES.forEach((face, faceIndex) => {
    face.forEach((from, position) => {
      const to = face[(position + 1) % face.length] as number;
      const key = from < to ? `${from}-${to}` : `${to}-${from}`;
      const edge = edges.get(key) ?? { from, to, faces: [] };
      edge.faces.push(faceIndex);
      edges.set(key, edge);
    });
  });
  return [...edges.values()];
})();

export const GEM_FACE_COUNT = FACES.length;
export const GEM_EDGE_COUNT = EDGES.length;

export interface GemFace {
  /** SVG `points` qiymati. */
  points: string;
  /** Yorug'lik tushishiga qarab yaltirash kuchi; orqa yuzada 0. */
  shine: number;
}

export interface GemEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** `outline` — tosh chegarasi, `front` — old qirra, `back` — orqadan ko'rinadigan qirra. */
  kind: 'outline' | 'front' | 'back';
}

export interface GemFrame {
  faces: GemFace[];
  edges: GemEdge[];
}

const round = (value: number) => Math.round(value * 100) / 100;
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Toshning `angle` (radian) burchakka burilgan holatdagi ko'rinishi, 64×64 maydonda. */
export function gemFrame(angle: number): GemFrame {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const cosT = Math.cos(TILT);
  const sinT = Math.sin(TILT);

  // Avval tik o'q atrofida buriladi, keyin tomoshabinga egiladi.
  const world = VERTICES.map(([x, y, z]): Vec3 => {
    const turnedX = x * cosA + z * sinA;
    const turnedZ = -x * sinA + z * cosA;
    return [turnedX, y * cosT + turnedZ * sinT, -y * sinT + turnedZ * cosT];
  });
  const screen = world.map(([x, y, z]) => {
    const scale = CAMERA_DISTANCE / (CAMERA_DISTANCE - z);
    return [round(CENTER_X + x * scale), round(CENTER_Y + y * scale)] as const;
  });
  const at = (index: number) => world[index] as Vec3;
  const camera: Vec3 = [0, 0, CAMERA_DISTANCE];

  const facing: boolean[] = [];
  const faces = FACES.map((face) => {
    const corners = face.map(at);
    const centroid = corners
      .reduce<Vec3>((sum, p) => [sum[0] + p[0], sum[1] + p[1], sum[2] + p[2]], [0, 0, 0])
      .map((value) => value / corners.length) as unknown as Vec3;
    let normal = cross(
      sub(at(face[1] as number), at(face[0] as number)),
      sub(at(face[2] as number), at(face[0] as number)),
    );
    // Tosh qavariq va markazi ichida — normal markazdan tashqariga qaratiladi.
    if (dot(normal, centroid) < 0) normal = [-normal[0], -normal[1], -normal[2]];
    const length = Math.hypot(...normal);
    const unit: Vec3 = [normal[0] / length, normal[1] / length, normal[2] / length];

    const visible = dot(unit, sub(camera, centroid)) > 0;
    facing.push(visible);
    return {
      points: face.map((index) => (screen[index] as readonly number[]).join(',')).join(' '),
      shine: visible ? round(Math.max(0, dot(unit, LIGHT)) ** 2.5) : 0,
    };
  });

  const edges = EDGES.map(({ from, to, faces: adjacent }): GemEdge => {
    const visible = adjacent.filter((faceIndex) => facing[faceIndex]).length;
    const [x1, y1] = screen[from] as readonly [number, number];
    const [x2, y2] = screen[to] as readonly [number, number];
    return {
      x1,
      y1,
      x2,
      y2,
      kind: visible === 0 ? 'back' : visible === adjacent.length ? 'front' : 'outline',
    };
  });

  return { faces, edges };
}
