import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stepSub,
  moveOnSphere,
  lightAtDepth,
  zoneName,
  findDiveSite,
  SUB_LIMITS,
} from './subPhysics.js';

const base = { lat: 10, lon: 124, depth: 100, heading: 0, speed: 0, vSpeed: 0 };
const run = (s, input, secs, floor = 5000) => {
  let x = s;
  for (let i = 0; i < secs * 10; i++) x = stepSub(x, input, 0.1, floor);
  return x;
};
const near = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('moveOnSphere goes ~1° north per 111 km', () => {
  const p = moveOnSphere(0, 0, 0, 111_195);
  near(p.lat, 1, 0.01);
  near(p.lon, 0, 1e-6);
});

test('moveOnSphere wraps across the antimeridian', () => {
  assert.ok(moveOnSphere(0, 179.9, 90, 30_000).lon < -179);
});

test('sub accelerates to but not past max speed', () => {
  const s = run(base, { throttle: 1, rudder: 0, ballast: 0 }, 30);
  near(s.speed, SUB_LIMITS.maxSpeed, 0.05);
  assert.ok(s.lat > base.lat);
});

test('explore boost is much faster', () => {
  const s = run(base, { throttle: 1, rudder: 0, ballast: 0, boost: true }, 30);
  assert.ok(s.speed > SUB_LIMITS.maxSpeed * 10);
});

test('positive rudder turns right', () => {
  const s = run(
    { ...base, speed: 12 },
    { throttle: 1, rudder: 1, ballast: 0 },
    2,
  );
  assert.ok(s.heading > 20 && s.heading < 60, String(s.heading));
});

test('never rises above the surface', () => {
  assert.equal(
    run(base, { throttle: 0, rudder: 0, ballast: -1 }, 120).depth,
    0,
  );
});

test('stops above the seafloor with clearance', () => {
  const s = run(base, { throttle: 0, rudder: 0, ballast: 1 }, 300, 400);
  assert.equal(s.depth, 400 - SUB_LIMITS.floorClearance);
});

test('land blocks horizontal movement', () => {
  const s = stepSub(
    { ...base, speed: 10 },
    { throttle: 1, rudder: 0, ballast: 0 },
    1,
    -50,
  );
  assert.equal(s.blocked, true);
  assert.equal(s.lat, base.lat);
  assert.equal(s.speed, 0);
});

test('depth is capped at Challenger Deep when the floor is unknown', () => {
  const s = run(
    { ...base, depth: 10_900 },
    { throttle: 0, rudder: 0, ballast: 1 },
    60,
    null,
  );
  assert.ok(s.depth <= SUB_LIMITS.maxDepth);
});

test('light fades with depth and zones are named', () => {
  assert.equal(lightAtDepth(0), 1);
  assert.ok(lightAtDepth(500) < 0.05);
  assert.equal(zoneName(0), 'Surface');
  assert.equal(zoneName(50), 'Sunlight zone');
  assert.equal(zoneName(10_000), 'Hadal zone');
});

test('dive sites resolve from free text', () => {
  assert.equal(
    findDiveSite('take me to the Challenger Deep').key,
    'challenger deep',
  );
  assert.equal(findDiveSite('sail to tubbataha reef').key, 'tubbataha');
  assert.equal(findDiveSite('mars'), null);
});
