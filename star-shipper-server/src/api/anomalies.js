// api/anomalies.js -- cosmic signatures: list / probe / investigate.
// docs/anomalies-spec.md. Sites: game/anomalies.js (pure). Progress per
// pilot per daily bucket: player_anomaly_progress (083).

import express from 'express';
import { authMiddleware } from '../auth/index.js';
import { query, queryOne, queryAll, transaction } from '../db/index.js';
import { getPlayerBonuses } from '../util/playerBonuses.js';
import { addResourceStack, insertModuleItem } from '../lib/wrecks.js';
import { logActivity } from '../lib/activity.js';
import { buildAmbushFleet } from '../game/enemyManifest.js';
import { registerUserAmbush } from './combat.js';
import { SRng } from '../util/seed.js';
import {
  sitesFor, estimateFor, cyclesNeededFor, probeCycleSeconds, rollRewards, currentBucket, hashStr, INVESTIGATE_RANGE, SITE_TYPES,
} from '../game/anomalies.js';

const router = express.Router();
router.use(authMiddleware);

// Best probe launcher across the ACTIVE fleet (pitfall #15).
async function fleetLauncher(userId) {
  const ships = await queryAll(`SELECT fitted_modules FROM ships WHERE user_id = $1 AND storage_body_id IS NULL`, [userId]);
  let best = null;
  for (const s of ships) {
    for (const m of Object.values(s.fitted_modules || {})) {
      if (m?.stats?.probe_launcher) {
        const cycle = Number(m.stats.probe_cycle) || 20;
        if (!best || cycle < best.cycle) best = { cycle, module_type_id: m.module_type_id };
      }
    }
  }
  return best;
}
async function techSet(userId) {
  const rows = await queryAll(`SELECT tech_id FROM player_research WHERE user_id = $1`, [userId]);
  return new Set(rows.map(r => r.tech_id));
}
let _moduleCatalog = null;
async function moduleCatalog() {
  if (!_moduleCatalog) _moduleCatalog = await queryAll(`SELECT id, tier, slot_type FROM module_types WHERE buy_price IS NOT NULL OR tier >= 3`);
  return _moduleCatalog;
}

async function shapeSites(userId, systemId, bucket, bonuses, launcher) {
  const sites = sitesFor(systemId, bucket);
  if (!sites) return null;
  const rows = await queryAll(
    `SELECT * FROM player_anomaly_progress WHERE user_id = $1 AND system_procedural_id = $2 AND bucket = $3`, [userId, systemId, bucket]);
  const byIdx = new Map(rows.map(r => [r.site_index, r]));
  const needed = cyclesNeededFor(bonuses);
  const cycleS = launcher ? probeCycleSeconds(launcher.cycle, bonuses) : null;
  return sites.map(site => {
    const p = byIdx.get(site.index);
    const done = p?.cycles_done || 0;
    const pinned = !!p?.pinned || done >= needed;
    const est = pinned ? { x: site.x, y: site.y, radius: 0 } : estimateFor(site, done, needed, bonuses.probe_scan_deviation_pct || 0, userId);
    const nextAt = p?.last_probe_at && cycleS ? new Date(new Date(p.last_probe_at).getTime() + cycleS * 1000) : null;
    return {
      index: site.index, type: site.type, name: site.name, icon: site.icon, tier: site.tier, guarded: site.guarded,
      cycles_done: done, cycles_needed: needed, pinned, resolved: !!p?.resolved_at,
      estimate: launcher ? est : null,
      position: pinned ? { x: site.x, y: site.y } : null,
      next_probe_at: nextAt && nextAt.getTime() > Date.now() ? nextAt.toISOString() : null,
    };
  });
}

// GET /anomalies/system/:id
router.get('/system/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const systemId = String(req.params.id);
    const bucket = currentBucket();
    const bonuses = await getPlayerBonuses(userId);
    const launcher = await fleetLauncher(userId);
    const sites = await shapeSites(userId, systemId, bucket, bonuses, launcher);
    if (!sites) return res.status(404).json({ error: 'Unknown system' });
    res.json({
      system_id: systemId, bucket, refreshes_at: new Date((bucket + 1) * 24 * 3600 * 1000).toISOString(),
      has_launcher: !!launcher, cycle_seconds: launcher ? probeCycleSeconds(launcher.cycle, bonuses) : null,
      sites, investigate_range: INVESTIGATE_RANGE,
    });
  } catch (e) { console.error('anomalies/system:', e); res.status(500).json({ error: 'Failed to load signatures' }); }
});

// POST /anomalies/probe { system_id, site_index }
router.post('/probe', async (req, res) => {
  try {
    const userId = req.user.id;
    const systemId = String(req.body?.system_id || '');
    const idx = Number(req.body?.site_index);
    const bucket = currentBucket();
    const sites = sitesFor(systemId, bucket);
    const site = sites?.find(s => s.index === idx);
    if (!site) return res.status(404).json({ error: 'No such signature' });
    const launcher = await fleetLauncher(userId);
    if (!launcher) return res.status(403).json({ error: 'Fit a Signature Probe Launcher to probe' });
    const bonuses = await getPlayerBonuses(userId);
    const cycleS = probeCycleSeconds(launcher.cycle, bonuses);
    const needed = cyclesNeededFor(bonuses);
    const result = await transaction(async (client) => {
      const r = await client.query(
        `SELECT * FROM player_anomaly_progress WHERE user_id = $1 AND system_procedural_id = $2 AND site_index = $3 AND bucket = $4 FOR UPDATE`,
        [userId, systemId, idx, bucket]);
      const p = r.rows[0];
      if (p?.resolved_at) throw Object.assign(new Error('Already investigated'), { statusCode: 409 });
      if (p?.pinned) throw Object.assign(new Error('Already pinned -- fly there'), { statusCode: 409 });
      if (p?.last_probe_at && Date.now() - new Date(p.last_probe_at).getTime() < cycleS * 1000) {
        const wait = Math.ceil((cycleS * 1000 - (Date.now() - new Date(p.last_probe_at).getTime())) / 1000);
        throw Object.assign(new Error(`Probe recharging (${wait}s)`), { statusCode: 429 });
      }
      const done = (p?.cycles_done || 0) + 1;
      const pinned = done >= needed;
      await client.query(`
        INSERT INTO player_anomaly_progress (user_id, system_procedural_id, site_index, bucket, cycles_done, pinned, last_probe_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (user_id, system_procedural_id, site_index, bucket)
        DO UPDATE SET cycles_done = $5, pinned = $6, last_probe_at = NOW()`, [userId, systemId, idx, bucket, done, pinned]);
      return { done, pinned };
    });
    const sitesNow = await shapeSites(userId, systemId, bucket, bonuses, launcher);
    res.json({ success: true, ...result, site: sitesNow.find(s => s.index === idx), cycle_seconds: cycleS });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    console.error('anomalies/probe:', e); res.status(500).json({ error: 'Probe failed' });
  }
});

// POST /anomalies/resolve { system_id, site_index, x, y }
router.post('/resolve', async (req, res) => {
  try {
    const userId = req.user.id;
    const systemId = String(req.body?.system_id || '');
    const idx = Number(req.body?.site_index);
    const px = Number(req.body?.x), py = Number(req.body?.y);
    const bucket = currentBucket();
    const site = sitesFor(systemId, bucket)?.find(s => s.index === idx);
    if (!site) return res.status(404).json({ error: 'No such signature' });
    if (!Number.isFinite(px) || !Number.isFinite(py) || Math.hypot(px - site.x, py - site.y) > INVESTIGATE_RANGE) {
      return res.status(400).json({ error: `Fly within ${INVESTIGATE_RANGE} units of the site` });
    }
    const bonuses = await getPlayerBonuses(userId);
    const techs = await techSet(userId);
    if (site.type === 'relic_cache' && site.tier >= 4 && !techs.has('tech_xenoarchaeology')) {
      return res.status(403).json({ error: 'Research Xenoarchaeology to open tier IV+ relic caches' });
    }
    const catalog = await moduleCatalog();
    const result = await transaction(async (client) => {
      const r = await client.query(
        `SELECT * FROM player_anomaly_progress WHERE user_id = $1 AND system_procedural_id = $2 AND site_index = $3 AND bucket = $4 FOR UPDATE`,
        [userId, systemId, idx, bucket]);
      const p = r.rows[0];
      if (!p?.pinned && (p?.cycles_done || 0) < cyclesNeededFor(bonuses)) throw Object.assign(new Error('Pin the site first'), { statusCode: 400 });
      if (p?.resolved_at) throw Object.assign(new Error('Already investigated'), { statusCode: 409 });
      const rng = new SRng(hashStr(`res|${userId}|${systemId}|${idx}|${bucket}`));
      const rewards = rollRewards(site, rng, bonuses, techs, catalog);
      const awarded = { credits: rewards.credits, rp: rewards.rp, resources: [], modules: [] };
      if (rewards.credits > 0) await client.query(`UPDATE users SET credits = credits + $1 WHERE id = $2`, [rewards.credits, userId]);
      if (rewards.rp > 0) await client.query(`UPDATE users SET research_points = COALESCE(research_points, 0) + $1 WHERE id = $2`, [rewards.rp, userId]);
      for (const rs of rewards.resources) {
        const rt = await client.query(`SELECT id FROM resource_types WHERE name = $1`, [rs.name]);
        if (!rt.rows[0]) continue;
        const qv = rs.quality;
        await addResourceStack(client, userId, rt.rows[0].id, rs.quantity, { stat_purity: qv, stat_stability: qv, stat_potency: qv, stat_density: qv });
        awarded.resources.push({ name: rs.name, quantity: rs.quantity, quality: qv });
      }
      for (const m of rewards.modules) {
        const name = await insertModuleItem(client, userId, m.module_type_id, m.quality);
        if (name) awarded.modules.push({ name, quality: m.quality.purity });
      }
      await client.query(`
        UPDATE player_anomaly_progress SET resolved_at = NOW(), pinned = TRUE
         WHERE user_id = $1 AND system_procedural_id = $2 AND site_index = $3 AND bucket = $4`, [userId, systemId, idx, bucket]);
      return awarded;
    });
    // Guarded sites: a raider fleet arrives as you crack it open.
    let ambush = null;
    if (site.guarded) {
      try {
        const fleetId = `ambush_site${idx}_${bucket % 1000}`;
        const built = await buildAmbushFleet({ systemId, tier: site.tier, seed: hashStr(`amb|${userId}|${systemId}|${idx}|${bucket}`), fleetId, label: site.name });
        registerUserAmbush(userId, systemId, built.claimIndex);
        ambush = { fleet: built.fleet, enemies: built.enemies };
      } catch (e) { console.warn('site ambush failed:', e.message); }
    }
    logActivity({ userId, senderName: req.user.username, type: 'anomaly_resolved', systemId, payload: { site: site.name, tier: site.tier, modules: result.modules.length } });
    res.json({ success: true, site: { index: idx, type: site.type, name: site.name, tier: site.tier }, awarded: result, ambush });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    console.error('anomalies/resolve:', e); res.status(500).json({ error: 'Investigation failed' });
  }
});

export default router;
