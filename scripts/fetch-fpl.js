/**
 * fetch-fpl.js
 * ─────────────────────────────────────────────────────
 * Runs in GitHub Actions every hour.
 * Fetches FPL data server-side (no CORS issues) and
 * writes data/cache.json for the static site to read.
 */

import fetch from 'node-fetch';
import fs    from 'fs';
import path  from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────
const FPL_BASE  = 'https://fantasy.premierleague.com/api';
const TEAM_ID   = process.env.FPL_TEAM_ID || '';
const OUT_FILE  = path.join(__dirname, '..', 'data', 'cache.json');

// Position map
const POS_MAP = { 1:'GKP', 2:'DEF', 3:'MID', 4:'FWD' };

// FDR color helper
const fdrLabel = d => ['','Very Easy','Easy','Medium','Hard','Very Hard'][d] || 'Unknown';

// ── Fetch helpers ─────────────────────────────────────
async function fplFetch(path) {
  const url  = `${FPL_BASE}${path}`;
  const res  = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept':     'application/json',
    },
    timeout: 15000,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.json();
}

function safeRound(n, d = 1) {
  return Math.round(n * 10**d) / 10**d;
}

// ── Main ──────────────────────────────────────────────
async function main() {
  console.log('🚀 FPL data fetch started —', new Date().toUTCString());

  const cache = {
    fetchedAt:   new Date().toISOString(),
    currentGW:   null,
    nextDeadline: null,

    // Team data (requires TEAM_ID secret)
    team: null,

    // Global data
    topPlayers:  [],
    fixtures:    [],
    standings:   null,
  };

  // ── 1. Bootstrap static ─────────────────────────────
  console.log('📦 Fetching bootstrap-static…');
  const bootstrap = await fplFetch('/bootstrap-static/');

  // Build player lookup
  const playerMap = {};
  bootstrap.elements.forEach(p => { playerMap[p.id] = p; });

  // Build team lookup
  const teamMap = {};
  bootstrap.teams.forEach(t => { teamMap[t.id] = t; });

  // Current GW
  const liveGW = bootstrap.events.find(e => e.is_current);
  const nextGW = bootstrap.events.find(e => e.is_next);
  cache.currentGW   = liveGW?.id || nextGW?.id || null;
  cache.nextDeadline = nextGW?.deadline_time || liveGW?.deadline_time || null;

  console.log(`📅 Current GW: ${cache.currentGW}`);

  // ── 2. Top players (form leaders) ──────────────────
  console.log('⭐ Building top players list…');
  cache.topPlayers = bootstrap.elements
    .filter(p => p.minutes > 90 && parseFloat(p.form) > 0)
    .sort((a, b) => parseFloat(b.form) - parseFloat(a.form))
    .slice(0, 20)
    .map(p => ({
      id:          p.id,
      name:        p.web_name,
      fullName:    `${p.first_name} ${p.second_name}`,
      pos:         POS_MAP[p.element_type],
      team:        teamMap[p.team]?.short_name || '?',
      teamFull:    teamMap[p.team]?.name || '?',
      teamId:      p.team,
      form:        safeRound(parseFloat(p.form || 0)),
      price:       safeRound(p.now_cost / 10),
      priceChange: safeRound(p.cost_change_event / 10),
      own:         safeRound(parseFloat(p.selected_by_percent || 0)),
      gwPts:       p.event_points  || 0,
      totalPts:    p.total_points  || 0,
      bonus:       p.bonus         || 0,
      goals:       p.goals_scored  || 0,
      assists:     p.assists       || 0,
      cleanSheets: p.clean_sheets  || 0,
      minutes:     p.minutes       || 0,
    }));

  // ── 3. Fixtures (current + next GW) ─────────────────
  console.log('📋 Fetching fixtures…');
  const fixturesRaw = await fplFetch('/fixtures/');

  // Get ALL GW fixtures (for predictions page)
  cache.fixtures = fixturesRaw
    .filter(f => f.event != null)
    .map(f => {
      const home = teamMap[f.team_h];
      const away = teamMap[f.team_a];
      return {
        id:           f.id,
        gw:           f.event,
        kickoff:      f.kickoff_time,
        finished:     f.finished,
        homeTeam:     home?.name       || '?',
        homeShort:    home?.short_name || '?',
        homeId:       f.team_h,
        awayTeam:     away?.name       || '?',
        awayShort:    away?.short_name || '?',
        awayId:       f.team_a,
        homeScore:    f.team_h_score,
        awayScore:    f.team_a_score,
        homeDiff:     f.team_h_difficulty,
        awayDiff:     f.team_a_difficulty,
        homeDiffLabel: fdrLabel(f.team_h_difficulty),
        awayDiffLabel: fdrLabel(f.team_a_difficulty),
      };
    });

  // Attach next fixture FDR to top players
  cache.topPlayers = cache.topPlayers.map(p => {
    const nextFix = fixturesRaw.find(f =>
      f.event === (cache.currentGW + 1) &&
      (f.team_h === p.teamId || f.team_a === p.teamId) &&
      !f.finished
    );
    if (nextFix) {
      const isHome = nextFix.team_h === p.teamId;
      const fdr = isHome ? nextFix.team_h_difficulty : nextFix.team_a_difficulty;
      const opp = teamMap[isHome ? nextFix.team_a : nextFix.team_h]?.short_name || '?';
      return { ...p, nextFDR: fdr, nextFDRLabel: fdrLabel(fdr), nextOpp: (isHome ? '' : '@') + opp };
    }
    return { ...p, nextFDR: 3, nextFDRLabel: 'Medium', nextOpp: '?' };
  });

  // ── 4. Team picks (only if TEAM_ID is set) ──────────
  if (TEAM_ID) {
    console.log(`👤 Fetching team ID: ${TEAM_ID}…`);
    try {
      const entry = await fplFetch(`/entry/${TEAM_ID}/`);
      const gw    = cache.currentGW;
      const picks = await fplFetch(`/entry/${TEAM_ID}/event/${gw}/picks/`);

      // Build squad
      const squad = picks.picks.map(pick => {
        const pl  = playerMap[pick.element];
        if (!pl) return null;
        const pos = POS_MAP[pl.element_type];
        const pts = pl.event_points || 0;
        return {
          id:          pl.id,
          name:        pl.web_name,
          fullName:    `${pl.first_name} ${pl.second_name}`,
          pos,
          team:        teamMap[pl.team]?.short_name || '?',
          teamFull:    teamMap[pl.team]?.name || '?',
          price:       safeRound(pl.now_cost / 10),
          gwPts:       pts,
          totalPts:    pl.total_points || 0,
          form:        safeRound(parseFloat(pl.form || 0)),
          own:         safeRound(parseFloat(pl.selected_by_percent || 0)),
          isCaptain:   pick.is_captain,
          isVC:        pick.is_vice_captain,
          isStarter:   pick.position <= 11,
          benchOrder:  pick.position > 11 ? pick.position - 11 : null,
          multiplier:  pick.multiplier || 1,
          displayPts:  pts * (pick.multiplier || 1),
        };
      }).filter(Boolean);

      cache.team = {
        id:          TEAM_ID,
        name:        entry.name,
        managerName: `${entry.player_first_name} ${entry.player_last_name}`,
        gw:          gw,
        gwPoints:    picks.entry_history?.points || 0,
        totalPoints: entry.summary_overall_points || 0,
        overallRank: entry.summary_overall_rank  || null,
        gwRank:      entry.summary_event_rank    || null,
        teamValue:   safeRound((picks.entry_history?.value || 0) / 10),
        bank:        safeRound((picks.entry_history?.bank  || 0) / 10),
        transfers:   picks.entry_history?.event_transfers || 0,
        transferCost:picks.entry_history?.event_transfers_cost || 0,
        starters:    squad.filter(p => p.isStarter).sort((a,b) => {
          const order = { GKP:0, DEF:1, MID:2, FWD:3 };
          return order[a.pos] - order[b.pos];
        }),
        bench:       squad.filter(p => !p.isStarter).sort((a,b) => a.benchOrder - b.benchOrder),
      };

      console.log(`✅ Team loaded: ${cache.team.name} — GW${gw} — ${cache.team.gwPoints}pts`);
    } catch (e) {
      console.warn(`⚠️  Team fetch failed: ${e.message}`);
      cache.team = null;
    }
  } else {
    console.log('ℹ️  No FPL_TEAM_ID secret set — skipping team picks.');
  }

  // ── 5. Write cache.json ─────────────────────────────
  const dir = path.dirname(OUT_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(OUT_FILE, JSON.stringify(cache, null, 2), 'utf-8');
  console.log(`💾 Written → ${OUT_FILE}`);
  console.log(`   Players: ${cache.topPlayers.length}`);
  console.log(`   Fixtures: ${cache.fixtures.length}`);
  console.log(`   Team: ${cache.team ? cache.team.name : 'N/A'}`);
  console.log('✅ Done!');
}

main().catch(e => {
  console.error('❌ Fatal error:', e);
  process.exit(1);
});
