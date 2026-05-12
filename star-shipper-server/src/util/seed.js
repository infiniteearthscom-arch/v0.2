// Server-side deterministic RNG. Mirrors star-shipper/src/utils/shipRenderer.js
// and galaxyGenerator.js so server-derived world state (city placement,
// faction assignments, future per-system seeding decisions) stays
// consistent with the client's procedural generation.
//
// Park-Miller LCG. Same seed → same sequence, on any platform.

export class SRng {
  constructor(seed) {
    this.s = (seed | 0) % 2147483647;
    if (this.s <= 0) this.s += 2147483646;
  }
  next() {
    this.s = (this.s * 16807) % 2147483647;
    return (this.s - 1) / 2147483646;
  }
  range(a, b) { return a + this.next() * (b - a); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  chance(p) { return this.next() < p; }
}

// City seeding rule (Phase A of the city/vendor system):
//   - 40% chance per system that any city exists at all
//   - If yes, one random planet index (0..planetCount-1) is the city
//   - All other planets in the system have no city
//
// Uses a salted seed so the city decision RNG is independent of the
// client's planet-generation RNG -- changing one doesn't perturb the other.
//
// bodyClientId is the client-generated body identifier ('planet_3',
// 'station_planet_3', 'asteroid_belt_0', etc.). Only 'planet_N' bodies
// can be cities; everything else returns false.
export function isCityPlanet(systemSeed, planetCount, bodyClientId) {
  if (typeof bodyClientId !== 'string') return false;
  if (!bodyClientId.startsWith('planet_')) return false;
  const planetIndex = parseInt(bodyClientId.slice('planet_'.length), 10);
  if (!Number.isInteger(planetIndex) || planetIndex < 0) return false;
  if (!Number.isInteger(planetCount) || planetCount <= 0) return false;

  // +0xCITY salt keeps this RNG stream independent of the planet-gen RNG.
  const cityRng = new SRng((systemSeed | 0) + 0xC1C0);
  if (cityRng.next() >= 0.4) return false;
  const cityIndex = cityRng.int(0, planetCount - 1);
  return planetIndex === cityIndex;
}
