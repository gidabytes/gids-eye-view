/**
 * Exploration submarine physics. Pure and framework-free (no Cesium, no DOM)
 * so it runs under `node --test`.
 *
 * Kinematic model: throttle -> speed (with drag), rudder -> yaw rate scaled by
 * speed, ballast -> vertical speed. Position integrates along great circles.
 * Depth is clamped between the surface and the seafloor (from bathymetry),
 * keeping a safety margin above the bottom. Land/shallows block movement.
 */

/** @typedef {{lat:number, lon:number, depth:number, heading:number, speed:number, vSpeed:number}} SubState */
/** @typedef {{throttle:number, rudder:number, ballast:number, boost?:boolean}} SubInput */

export const SUB_LIMITS = Object.freeze({
  maxSpeed: 12, // m/s (~23 kn)
  boostMultiplier: 40, // "explore" speed, crosses ocean basins in minutes
  accel: 1.5, // m/s²
  drag: 0.25, // 1/s
  turnRate: 18, // deg/s at full rudder and full speed
  maxVSpeed: 5, // m/s
  maxDepth: 10_935, // Challenger Deep
  floorClearance: 15, // m kept above the seabed
});

const EARTH_RADIUS = 6_371_000;
const D2R = Math.PI / 180;

/** Clamp `v` into [lo, hi]. */
export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Destination point along a great circle.
 * @returns {{lat:number, lon:number}} lon normalised to [-180, 180).
 */
export function moveOnSphere(lat, lon, headingDeg, distanceM) {
  const p1 = lat * D2R;
  const l1 = lon * D2R;
  const th = headingDeg * D2R;
  const d = distanceM / EARTH_RADIUS;
  const p2 = Math.asin(
    Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(th),
  );
  const l2 =
    l1 +
    Math.atan2(
      Math.sin(th) * Math.sin(d) * Math.cos(p1),
      Math.cos(d) - Math.sin(p1) * Math.sin(p2),
    );
  return { lat: p2 / D2R, lon: ((((l2 / D2R + 540) % 360) + 360) % 360) - 180 };
}

/**
 * Advance one step.
 * @param {SubState} s
 * @param {SubInput} input each axis -1..1
 * @param {number} dt seconds
 * @param {number|null} seafloorDepth seabed depth (positive m) at the current
 *   position, or null if unknown. A value <= floorClearance means land or
 *   shallows: horizontal movement is blocked.
 * @returns {SubState & {blocked:boolean}}
 */
export function stepSub(s, input, dt, seafloorDepth = null) {
  const L = SUB_LIMITS;
  const mult = input.boost ? L.boostMultiplier : 1;
  const target = clamp(input.throttle, -0.3, 1) * L.maxSpeed * mult;
  const accel = L.accel * dt * mult;
  let speed = s.speed + clamp(target - s.speed, -accel, accel);
  if (!input.throttle) speed -= speed * L.drag * dt;

  const turnFactor = clamp(Math.abs(speed) / L.maxSpeed, 0.15, 1);
  const heading =
    (((s.heading + clamp(input.rudder, -1, 1) * L.turnRate * turnFactor * dt) %
      360) +
      360) %
    360;

  const vTarget = clamp(input.ballast, -1, 1) * L.maxVSpeed;
  const vSpeed = s.vSpeed + clamp(vTarget - s.vSpeed, -2 * dt, 2 * dt);

  const blocked = seafloorDepth !== null && seafloorDepth <= L.floorClearance;
  const pos = blocked
    ? { lat: s.lat, lon: s.lon }
    : moveOnSphere(s.lat, s.lon, heading, speed * dt);

  const floor =
    seafloorDepth !== null && seafloorDepth > 0
      ? Math.min(seafloorDepth, L.maxDepth)
      : L.maxDepth;
  const bottom = Math.max(0, floor - L.floorClearance);
  const depth = clamp(s.depth + vSpeed * dt, 0, bottom);

  return {
    ...pos,
    depth,
    heading,
    speed: blocked ? 0 : speed,
    vSpeed: depth === 0 || depth === bottom ? 0 : vSpeed,
    blocked,
  };
}

/** Light reaching `depth` metres (0..1); drives the underwater tint. */
export function lightAtDepth(depth) {
  if (depth <= 0) return 1;
  return clamp(Math.exp(-depth / 120), 0.02, 1);
}

/** Oceanographic zone name for a depth in metres. */
export function zoneName(depth) {
  if (depth < 1) return 'Surface';
  if (depth < 200) return 'Sunlight zone';
  if (depth < 1000) return 'Twilight zone';
  if (depth < 4000) return 'Midnight zone';
  if (depth < 6000) return 'Abyssal zone';
  return 'Hadal zone';
}

/** Notable dive sites for quick travel. */
export const DIVE_SITES = Object.freeze({
  'challenger deep': {
    lat: 11.3733,
    lon: 142.5917,
    note: 'Deepest known point, Mariana Trench (~10,935 m)',
  },
  'philippine trench': {
    lat: 10.4,
    lon: 126.7,
    note: 'Emden Deep (~10,540 m)',
  },
  tubbataha: { lat: 8.95, lon: 119.9, note: 'UNESCO reef, Sulu Sea' },
  'cebu strait': { lat: 10.25, lon: 123.95, note: 'Between Cebu and Bohol' },
  'great barrier reef': { lat: -18.29, lon: 147.7, note: 'Coral Sea' },
  'mid-atlantic ridge': { lat: 30.0, lon: -42.0, note: 'Spreading ridge' },
  titanic: { lat: 41.7325, lon: -49.9469, note: 'Wreck site (~3,800 m)' },
  'puerto rico trench': {
    lat: 19.77,
    lon: -66.92,
    note: 'Deepest Atlantic point',
  },
});

/** Find a dive site by free text ("take me to the challenger deep"). */
export function findDiveSite(text) {
  const t = String(text || '').toLowerCase();
  const key = Object.keys(DIVE_SITES).find((k) => t.includes(k));
  return key ? { key, ...DIVE_SITES[key] } : null;
}
