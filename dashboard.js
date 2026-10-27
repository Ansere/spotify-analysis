const DATA = JSON.parse(document.getElementById("dash-data").textContent);

const DAY_EPOCH = DATA.coverage.day_epoch;

/** Calendar YYYY-MM-DD comparison for date inputs (timezone-agnostic). */
const di = (s) =>
  (!s ? 0 : (s.slice(0, 4) | 0) * 10000 + (s.slice(5, 7) | 0) * 100 + (s.slice(8, 10) | 0));

/** Days since DAY_EPOCH for a calendar date string (matches Python bundle / Central calendar days). */
function dayStrToOff(s) {
  if (!s || !DAY_EPOCH) return 0;
  const [Y, M, D] = s.split("-").map(Number);
  const [Y0, M0, D0] = DAY_EPOCH.split("-").map(Number);
  const t0 = Date.UTC(Y0, M0 - 1, D0);
  const t1 = Date.UTC(Y, M - 1, D);
  return Math.round((t1 - t0) / 86400000);
}

function offToDayStr(off) {
  if (DAY_EPOCH == null || DAY_EPOCH === "") return "";
  const [Y0, M0, D0] = DAY_EPOCH.split("-").map(Number);
  const d = new Date(Date.UTC(Y0, M0 - 1, D0));
  d.setUTCDate(d.getUTCDate() + off);
  return d.toISOString().slice(0, 10);
}

function dayOffFromSeriesRow(row) {
  return typeof row.i === "number" ? row.i : dayStrToOff(row.d);
}

function dayIsoFromSeriesRow(row) {
  return typeof row.i === "number" ? offToDayStr(row.i) : row.d;
}

Chart.defaults.font.family = "Inter, system-ui, sans-serif";
Chart.defaults.color = "#6b4e8a";
Chart.defaults.borderColor = "rgba(42, 10, 74, 0.12)";

function chartLayoutOpts(extra) {
  return Object.assign(
    {
      responsive: true,
      maintainAspectRatio: false,
      devicePixelRatio: Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2.25),
    },
    extra || {}
  );
}

const MINUTES_PER_MONTH = 30.4375 * 24 * 60;

const fmtMin = (m) =>
  m >= 1440 ? `${(m / 1440).toFixed(1)} d` :
  m >= 60 ? `${(m / 60).toFixed(1)} h` : `${m.toFixed(1)} min`;
const fmtNum = (n) => new Intl.NumberFormat().format(Math.round(n));
/** Place a tooltip near (x, y) inside a w x h box, flipping or clamping so it is never cut off. */
function placeTip(tip, x, y, w, h) {
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let left = x + 14, top = y + 14;
  if (left + tw > w - 4) left = x - tw - 14;
  if (top + th > h - 4) top = y - th - 14;
  tip.style.left = `${Math.max(4, Math.min(left, w - tw - 4))}px`;
  tip.style.top = `${Math.max(4, Math.min(top, h - th - 4))}px`;
}

/** Tooltip text for a chart value under the current Minutes/Plays toggle. */
const metricLabel = (v) => (metric === "plays" ? `${fmtNum(v)} plays` : listeningFriendlyPlain(v));

/** Short human label + exact rounded minutes for UI copy */
function listeningFriendlyWithExact(totalMinutes) {
  const t = Number(totalMinutes);
  if (!Number.isFinite(t) || t <= 0) return `<strong>0 min</strong> <span style="color:var(--muted)">(0 min)</span>`;
  const minsRounded = Math.round(t);
  const daysEquiv = t / 1440;
  let simple;
  if (daysEquiv >= 50) simple = `${(t / MINUTES_PER_MONTH).toFixed(1)} mo`;
  else if (daysEquiv >= 2.5) simple = `${daysEquiv.toFixed(1)} days`;
  else if (t >= 90) simple = `${(t / 60).toFixed(1)} hrs`;
  else simple = `${minsRounded} min`;
  return `<strong>${simple}</strong> <span style="color:var(--muted)">(${fmtNum(minsRounded)} min)</span>`;
}

function listeningFriendlyPlain(totalMinutes) {
  return listeningFriendlyWithExact(totalMinutes).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function sumDaysInRange(dayTuples, fromDay, toDay) {
  if (!dayTuples || !dayTuples.length) return { ms: 0, n: 0 };
  const lo = dayStrToOff(fromDay),
    hi = dayStrToOff(toDay);
  let ms = 0,
    n = 0;
  for (const row of dayTuples) {
    const idx = row[0];
    if (idx >= lo && idx <= hi) {
      ms += row[1];
      n += row[2];
    }
  }
  return { ms, n };
}

/** Filter global daily series */
function daysSlice(fromDay, toDay) {
  const lo = dayStrToOff(fromDay),
    hi = dayStrToOff(toDay);
  return DATA.series.day.filter((row) => {
    const idx = dayOffFromSeriesRow(row);
    return idx >= lo && idx <= hi;
  });
}

function totalsFromDays(days) {
  let ms = 0, n = 0;
  for (const x of days) {
    ms += x.ms;
    n += x.n;
  }
  return { ms, n };
}

function rankArtists(fromDay, toDay, metric = "minutes") {
  const out = [];
  for (const a of DATA.artists) {
    const s = sumDaysInRange(a.days, fromDay, toDay);
    if (s.ms <= 0) continue;
    out.push({ ...a, fm: s.ms, fn: s.n });
  }
  if (metric === "plays") out.sort((a,b)=>b.fn-a.fn||a.name.localeCompare(b.name));
  else out.sort((a,b)=>b.fm-a.fm||a.name.localeCompare(b.name));
  return out;
}
function rankTracks(fromDay, toDay, metric = "minutes") {
  const out = [];
  for (const t of DATA.tracks) {
    const s = sumDaysInRange(t.days, fromDay, toDay);
    if (s.ms <= 0) continue;
    out.push({ ...t, fm: s.ms, fn: s.n });
  }
  if (metric === "plays") out.sort((a,b)=>b.fn-a.fn||a.title.localeCompare(b.title));
  else out.sort((a,b)=>b.fm-a.fm||a.title.localeCompare(b.title));
  return out;
}
function rankAlbums(fromDay, toDay, metric = "minutes") {
  const out = [];
  for (const al of DATA.albums) {
    const s = sumDaysInRange(al.days, fromDay, toDay);
    if (s.ms <= 0) continue;
    out.push({ ...al, fm: s.ms, fn: s.n });
  }
  if (metric === "plays") out.sort((a,b)=>b.fn-a.fn||a.album.localeCompare(b.album));
  else out.sort((a,b)=>b.fm-a.fm||a.album.localeCompare(b.album));
  return out;
}

let state = {
  fromDay: "",
  toDay: "",
  charts: { month: null, year: null, artist: null },
};

function buildMonthSeriesFromDays(days, key = "ms") {
  const map = {};
  for (const x of days) {
    const iso = dayIsoFromSeriesRow(x);
    const m = iso.slice(0, 7);
    map[m] = (map[m] || 0) + x[key];
  }
  return Object.keys(map)
    .sort()
    .map((m) => ({ m, ms: map[m] }));
}
function buildYearSeriesFromDays(days, key = "ms") {
  const map = {};
  for (const x of days) {
    const iso = dayIsoFromSeriesRow(x);
    const y = iso.slice(0, 4);
    map[y] = (map[y] || 0) + x[key];
  }
  return Object.keys(map)
    .sort((a, b) => +a - +b)
    .map((y) => ({ y, ms: map[y] }));
}


function renderKpis({ fromDay, toDay }) {
  const days = daysSlice(fromDay, toDay);
  const { ms, n: plays } = totalsFromDays(days);
  const minutesTotal = ms / 60000;
  const uniqDays = days.length;

  const ar = rankArtists(fromDay, toDay);
  const uniqArtistsApprox = ar.length;
  const tr = rankTracks(fromDay, toDay).length;

  const months = buildMonthSeriesFromDays(days);
  let peak = months[0] || { m: "—", ms: 0 };
  for (const x of months) if (x.ms > peak.ms) peak = x;

  const top = ar[0];
  const topSharePct = ms > 0 && top ? (100 * top.fm) / ms : 0;

  const avgPerActiveDay = uniqDays ? minutesTotal / uniqDays : 0;

  const rows = [
    ["Filtered listening time", `${fmtNum(minutesTotal)} min`, plays ? `${fmtNum(plays)} plays` : ""],
    ["Artists in window", fmtNum(uniqArtistsApprox), ""],
    ["Tracks in window", fmtNum(tr), ""],
    ["Peak streaming month", peak.m || "—", peak.m ? fmtMin(peak.ms / 60000) : ""],
    ["#1 artist share in range", `${topSharePct.toFixed(1)}%`, top ? top.name : "—"],
    ["Avg active listening time per day", `${avgPerActiveDay.toFixed(1)} min/day`, ""]
  ];
  const host = document.getElementById("kpi-host");
  host.innerHTML = rows.map(([label,v,hint]) => `
    <div class="kpi">
      <div class="label">${label}</div>
      <div class="val">${v}</div>
      ${hint?`<div class="hint">${hint}</div>`:''}
    </div>`).join("");
}

function renderCharts() {
  const { fromDay, toDay } = state;
  const days = daysSlice(fromDay, toDay);

  const key = metric === "plays" ? "n" : "ms";
  const toVal = (v) => (metric === "plays" ? v : +(v / 60000).toFixed(2));
  const mSeries = buildMonthSeriesFromDays(days, key);
  const ySeries = buildYearSeriesFromDays(days, key);
  document.getElementById("h-month").textContent = metric === "plays" ? "Plays by month" : "Minutes by month";
  document.getElementById("h-year").textContent = metric === "plays" ? "Plays by year" : "Minutes by year";
  document.querySelector('#race-view option[value="value"]').textContent = metric === "plays" ? "Plays" : "Minutes";

  if (state.charts.month) state.charts.month.destroy();
  state.charts.month = new Chart(document.getElementById("c-month"), {
    type: "line",
    data: {
      labels: mSeries.map((x) => x.m),
      datasets: [
        {
          label: "Minutes",
          data: mSeries.map((x) => toVal(x.ms)),
          borderColor: "#c026d3",
          backgroundColor: "rgba(192,38,211,0.16)",
          fill: true,
          tension: 0.35,
        },
      ],
    },
    options: chartLayoutOpts({
      scales: {
        x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
        y: { ticks: { callback: (v) => `${v}` } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) =>
              metricLabel(Number(c.raw)),
          },
        },
      },
    }),
  });

  if (state.charts.year) state.charts.year.destroy();
  state.charts.year = new Chart(document.getElementById("c-year"), {
    type: "bar",
    data: {
      labels: ySeries.map((x) => x.y),
      datasets: [
        {
          label: "Minutes",
          data: ySeries.map((x) => toVal(x.ms)),
          backgroundColor: ySeries.map(
            (_, i) => (i % 2 ? "rgba(219,39,119,0.55)" : "rgba(192,38,211,0.55)")
          ),
          borderRadius: 8,
        },
      ],
    },
    options: chartLayoutOpts({
      scales: {
        x: { ticks: { maxRotation: 0 } },
        y: { ticks: { callback: (v) => `${v}` } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) =>
              metricLabel(Number(c.raw)),
          },
        },
      },
    }),
  });

  rebuildRankings();
  hydrateArtistExplorer();
  renderArtistChart();
  renderHeatmap();
  renderRace();
  renderRiver();
  renderTasteViews();
  renderArtistWeb();
}

let qArtists='', qAlbums='', qTracks='';
let ra=[], rt=[], ralb=[];
let metric = "minutes";

const RANK_CAP = { artists: 160, albums: 200, tracks: 250 };

function minutesCellHtml(ms, showHint = true) {
  const mins = Math.round(ms / 60000);
  const hint = showHint ? `<span class="hint">${fmtMin(ms / 60000)}</span>` : "";
  return `<span class="mn">${fmtNum(mins)} min${hint}</span>`;
}

function streamsCellHtml(n) {
  return `<span class="st">${fmtNum(n)}</span>`;
}

function artHtml(image, rank, label) {
  if (image) return `<img class="art" src="${escAttr(image)}" alt="" loading="lazy" />`;
  const initial = (label || "?").trim().slice(0, 1).toUpperCase() || "?";
  return `<div class="art art-fallback c${rank}">${initial}</div>`;
}

function rowSearchKey(kind, name, artist) {
  return `${name} ${kind === "artists" ? "" : artist || ""}`.toLowerCase();
}

function podiumTileHtml(kind, row, rank, metric) {
  const name = kind === "albums" ? row.album : kind === "tracks" ? row.title : row.name;
  const minStat = `${fmtNum(Math.round(row.fm / 60000))} min <span class="hint">${fmtMin(row.fm / 60000)}</span>`;
  const streamStat = `${fmtNum(row.fn)} streams`;
  let sub, mainStat;
  if (kind === "artists") {
    if (metric === "plays") {
      sub = `${fmtNum(Math.round(row.fm / 60000))} min`;
      mainStat = streamStat;
    } else {
      sub = streamStat;
      mainStat = minStat;
    }
  } else {
    sub = row.artist;
    mainStat = metric === "plays" ? streamStat : minStat;
  }
  return `
    <div class="podium-tile" data-rank="${rank}" data-name="${escAttr(rowSearchKey(kind, name, row.artist))}">
      ${artHtml(row.image, rank, name)}
      <div class="podium-meta-col">
        <div class="podium-rank">#${rank}</div>
        <div class="podium-name">${name}</div>
        <div class="podium-sub">${sub}</div>
        <div class="podium-min">${mainStat}</div>
      </div>
    </div>`;
}

function listRowHtml(kind, row, rank, metric) {
  const name = kind === "albums" ? row.album : kind === "tracks" ? row.title : row.name;
  let midCell, lastCell;
  if (kind === "artists") {
    if (metric === "plays") {
      midCell = minutesCellHtml(row.fm, false);
      lastCell = streamsCellHtml(row.fn);
    } else {
      midCell = streamsCellHtml(row.fn);
      lastCell = minutesCellHtml(row.fm, true);
    }
  } else {
    midCell = `<span class="ar">${row.artist}</span>`;
    lastCell = metric === "plays" ? streamsCellHtml(row.fn) : minutesCellHtml(row.fm, true);
  }
  return `
    <div class="row" data-name="${escAttr(rowSearchKey(kind, name, row.artist))}">
      <span class="rk">${rank}</span>
      <span class="nm">${name}</span>
      ${midCell}
      ${lastCell}
    </div>`;
}

function applySearchVisibility(kind, q) {
  const s = q.trim().toLowerCase();
  const card = document.querySelector(`.rank-card[data-section="${kind}"]`);
  if (!card) return;
  card.querySelectorAll(".podium-tile, .list .row:not(.head)").forEach((el) => {
    const hay = el.dataset.name || "";
    el.style.display = !s || hay.includes(s) ? "" : "none";
  });
}

function renderRankSection(kind, rows, q, metric) {
  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3, RANK_CAP[kind]);
  document.getElementById(`pod-${kind}`).innerHTML = top3.map((r, i) => podiumTileHtml(kind, r, i + 1, metric)).join("");
  document.getElementById(`list-${kind}`).innerHTML = rest.map((r, i) => listRowHtml(kind, r, i + 4, metric)).join("");
  applySearchVisibility(kind, q);
}

function updateRankHeaders(metric){
  const a2 = document.getElementById("hd-artists-2");
  const a3 = document.getElementById("hd-artists-3");
  if (a2 && a3) {
    if (metric === "plays") { a2.textContent = "Minutes"; a3.textContent = "Streams"; }
    else { a2.textContent = "Streams"; a3.textContent = "Minutes"; }
  }
  const albumsHd = document.getElementById("hd-albums-metric");
  if (albumsHd) albumsHd.textContent = metric === "plays" ? "Streams" : "Minutes";
  const tracksHd = document.getElementById("hd-tracks-metric");
  if (tracksHd) tracksHd.textContent = metric === "plays" ? "Streams" : "Minutes";
}

function rebuildRankings(){
  const { fromDay, toDay } = state;

  ra = rankArtists(fromDay, toDay, metric);
  rt = rankTracks(fromDay, toDay, metric);
  ralb = rankAlbums(fromDay, toDay, metric);

  renderRankSection("artists", ra, qArtists, metric);
  renderRankSection("albums", ralb, qAlbums, metric);
  renderRankSection("tracks", rt, qTracks, metric);

  updateRankHeaders(metric);
}

function escAttr(v) {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function hydrateArtistExplorer(){
  const dl = document.getElementById('artist-dl');
  const rows = rankArtists(state.fromDay, state.toDay).slice(0, 500);
  dl.innerHTML = rows.map(a => `<option value="${escAttr(a.name)}"></option>`).join("");
}

function renderArtistChart(){
  const name = (document.getElementById('artist-input').value||'').trim();
  const { fromDay, toDay } = state;

  const artist = DATA.artists.find(a=> a.name===name);

  let monthsFiltered = [];
  if (artist && artist.days && artist.days.length) {
    const lo = dayStrToOff(fromDay),
      hi = dayStrToOff(toDay);
    const dayByMonth = {};
    for (const row of artist.days) {
      const idx = row[0];
      if (idx >= lo && idx <= hi) {
        const ym = offToDayStr(idx).slice(0, 7);
        dayByMonth[ym] = (dayByMonth[ym] || 0) + row[metric === "plays" ? 2 : 1];
      }
    }
    monthsFiltered = Object.keys(dayByMonth)
      .sort()
      .map((ym) => [ym, dayByMonth[ym]]);
  }

  const blurbEl = document.getElementById("artist-blurb");
  if (artist) {
    const rangeMs = sumDaysInRange(artist.days, fromDay, toDay).ms;
    const rangeMin = rangeMs / 60000;
    blurbEl.innerHTML = `
      <p style="margin:0 0 0.5rem;"><strong>${artist.name}</strong></p>
      <p style="margin:0 0 0.45rem;line-height:1.45;">
        Inside filtered range: ${metric === "plays" ? `<strong>${fmtNum(sumDaysInRange(artist.days, fromDay, toDay).n)}</strong> plays` : listeningFriendlyWithExact(rangeMin)}
      </p>
    `;
  } else if (name) {
    blurbEl.innerHTML = `<span style="color:var(--danger)">No exact artist name match.</span>`;
  } else {
    blurbEl.innerHTML =
      `<span style="color:var(--muted)">Choose an artist. Chart bars are listening time per month; tooltips show simplified duration plus exact rounded minutes.</span>`;
  }

  let labels = monthsFiltered.map((m) => m[0]);
  let dataMin = monthsFiltered.map((m) => (metric === "plays" ? m[1] : +(m[1] / 60000).toFixed(2)));
  if (artist && labels.length === 0) {
    labels = ["(no months overlap this range)"];
    dataMin = [0];
  }

  if (state.charts.artist) state.charts.artist.destroy();
  state.charts.artist = new Chart(document.getElementById("c-artist"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Listening time by month",
          data: dataMin,
          borderRadius: 8,
          backgroundColor: "rgba(219,39,119,0.5)",
          borderColor: "rgba(219,39,119,0.85)",
          borderWidth: 1,
        },
      ],
    },
    options: chartLayoutOpts({
      scales: {
        x: {
          ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 },
          grid: { color: "rgba(192,132,252,0.12)" },
        },
        y: {
          ticks: { callback: (v) => `${v}` },
          grid: { color: "rgba(192,132,252,0.08)" },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: ([it]) => it.label || "",
            label: (c) =>
              metricLabel(Number(c.raw)),
          },
        },
      },
    }),
  });
}

function formatLatestEventChicago(iso) {
  if (!iso) return "";
  const d = new Date(iso.endsWith("Z") ? iso : iso.replace(/\.\d+$/, "Z"));
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    timeZone: "America/Chicago",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);
}

function bootstrap(){
  const tzLab = document.getElementById("tz-label");
  if (tzLab && DATA.coverage.display_timezone) tzLab.textContent = DATA.coverage.display_timezone;

  const earliest =
    DATA.coverage.earliest_day || DATA.coverage.earliest_utc?.slice(0, 10) || "1970-01-01";
  const latest =
    DATA.coverage.latest_day ||
    DATA.coverage.as_of_day_chicago ||
    DATA.coverage.latest_utc?.slice(0, 10) ||
    "1970-01-01";
  const noteEl = document.getElementById("hero-data-note");
  const parts = [];
  if (DATA.coverage.latest_event_utc) {
    parts.push(
      "Latest row in export: " +
        formatLatestEventChicago(DATA.coverage.latest_event_utc)
    );
  }
  if (noteEl) {
    noteEl.textContent = parts.join(" · ");
    noteEl.hidden = parts.length === 0;
  }

  document.getElementById('pills-host').innerHTML =
    `<strong>${fmtNum(DATA.totals.streams)}</strong> plays · ` +
    `<strong>${fmtMin(DATA.totals.minutes)}</strong> listened · ` +
    `<strong>${fmtNum(DATA.totals.unique_artists)}</strong> artists · ` +
    `<strong>${fmtNum(DATA.totals.unique_tracks)}</strong> tracks`;

  state.fromDay = earliest;
  state.toDay = latest;

  document.getElementById('f-from').value = earliest;
  document.getElementById('f-to').value = latest;

  renderKpis({ fromDay: state.fromDay, toDay: state.toDay });
  wireInteractions();
  wireRaceControls();
  wireTasteMap();
  wireWalk();
  wireRiver();
  wireCompare();
  wireHeatmap();
  wireFullscreen();
  wireWebControls();
  document.getElementById('artist-input').addEventListener('change', renderArtistChart);
  document.getElementById('artist-input').addEventListener('keyup', renderArtistChart);

  document.getElementById('btn-apply').onclick = ()=>{
    state.fromDay = document.getElementById('f-from').value||earliest;
    state.toDay = document.getElementById('f-to').value||latest;
    if (di(state.fromDay)>di(state.toDay)){ const t = state.fromDay; state.fromDay = state.toDay; state.toDay = t; }
    renderKpis(state);
    renderCharts();
  };
  document.getElementById('btn-reset').onclick = ()=>{
    document.getElementById('f-from').value = earliest;
    document.getElementById('f-to').value = latest;
    document.getElementById('btn-apply').click();
  };

  renderCharts();
  const first = DATA.artists[0]?.name||'';
  if (first) {
    document.getElementById('artist-input').value = first;
    renderArtistChart();
  }

  renderRecentPlays();
  wireRefreshControls();
}

function escHtml(v) {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatRecentPlayChicago(iso) {
  if (!iso) return "—";
  const s = String(iso);
  const d = new Date(s.endsWith("Z") ? s : s.includes("+") ? s : `${s}Z`);
  if (Number.isNaN(d.getTime())) return escHtml(s);
  const tz = DATA.coverage.display_timezone || "America/Chicago";
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(d);
}

function renderRecentPlays() {
  const body = document.getElementById("tb-recent");
  if (!body) return;
  const rows = Array.isArray(DATA.recent_streams) ? DATA.recent_streams : [];
  if (!rows.length) {
    body.innerHTML =
      `<tr><td colspan="4" style="padding:1rem;color:var(--muted);text-align:center;">No recent plays in this export.</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .slice(0, 10)
    .map((r) => {
      const t = escHtml(r.track || "—");
      const a = escHtml(r.artist || "—");
      const al = escHtml(r.album || "—");
      const ts = formatRecentPlayChicago(r.ts_utc);
      return `<tr><td>${t}</td><td>${a}</td><td>${al}</td><td class="recent-time">${escHtml(ts)}</td></tr>`;
    })
    .join("");
}

function wireRefreshControls() {
  const btn     = document.getElementById("btn-refresh");
  const status  = document.getElementById("refresh-status");
  const barWrap = document.getElementById("refresh-bar-wrap");
  const msg     = document.getElementById("refresh-msg");
  const authBtn = document.getElementById("btn-authorize");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    status.style.display = "block";
    barWrap.style.display = "block";
    msg.className = "";
    msg.textContent = "Refreshing…";
    try {
      const r = await fetch("/api/refresh", { method: "POST" });
      let data = {};
      try { data = await r.json(); } catch {}
      barWrap.style.display = "none";
      if (r.status === 200 && data.ok === true) {
        msg.className = "ok";
        msg.textContent = "✓ " + data.message;
        setTimeout(() => window.location.reload(), 1800);
      } else {
        btn.disabled = false;
        msg.className = "err";
        msg.textContent =
          typeof data.message === "string" ? data.message
          : r.status === 429 ? "You can refresh again after the cooldown."
          : r.statusText || "Unknown error";
      }
    } catch {
      btn.disabled = false;
      barWrap.style.display = "none";
      msg.className = "err";
      msg.textContent = "Could not reach the local server.";
    }
  });

  const pullBtn = document.getElementById("btn-pull");
  if (pullBtn) {
    pullBtn.addEventListener("click", async () => {
      pullBtn.disabled = true;
      status.style.display = "block";
      barWrap.style.display = "block";
      msg.className = "";
      msg.textContent = "Pulling latest data…";
      try {
        const r = await fetch("/api/pull", { method: "POST" });
        let data = {};
        try { data = await r.json(); } catch {}
        barWrap.style.display = "none";
        if (r.status === 200 && data.ok === true) {
          msg.className = "ok";
          msg.textContent = "✓ " + data.message;
          setTimeout(() => window.location.reload(), 1800);
        } else {
          pullBtn.disabled = false;
          msg.className = "err";
          msg.textContent =
            typeof data.message === "string" ? data.message
            : r.statusText || "Unknown error";
        }
      } catch {
        pullBtn.disabled = false;
        barWrap.style.display = "none";
        msg.className = "err";
        msg.textContent = "Could not reach the local server.";
      }
    });
  }

  if (authBtn) {
    authBtn.addEventListener("click", async () => {
      authBtn.disabled = true;
      status.style.display = "block";
      barWrap.style.display = "none";
      msg.className = "";
      msg.textContent = "Opening Spotify authorization in your browser…";
      try {
        const r = await fetch("/api/authorize", { method: "POST" });
        let data = {};
        try { data = await r.json(); } catch {}
        authBtn.disabled = false;
        if (r.status === 200 && data.ok === true) {
          msg.className = "ok";
          msg.textContent = "✓ " + data.message;
        } else {
          msg.className = "err";
          msg.textContent =
            typeof data.message === "string" ? data.message
            : r.statusText || "Unknown error";
        }
      } catch {
        authBtn.disabled = false;
        msg.className = "err";
        msg.textContent = "Could not reach the local server.";
      }
    });
  }
}

function wireInteractions(){
  document.getElementById('srch-artists').addEventListener('input', e=>{ qArtists=e.target.value; applySearchVisibility('artists', qArtists); });
  document.getElementById('srch-albums').addEventListener('input', e=>{ qAlbums=e.target.value; applySearchVisibility('albums', qAlbums); });
  document.getElementById('srch-tracks').addEventListener('input', e=>{ qTracks=e.target.value; applySearchVisibility('tracks', qTracks); });

  const metricSwitch = document.getElementById('metric-switch');
  const metricInput = document.getElementById('metric-toggle-input');
  if (metricSwitch && metricInput) {
    metricInput.addEventListener('change', () => {
      metric = metricInput.checked ? 'plays' : 'minutes';
      metricSwitch.dataset.metric = metric;
      renderCharts(); // also rebuilds the rankings
    });
  }
}

const prefersReducedMotion = () =>
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Animated top-artists line race (canvas) ----------
 * One line per artist, value = minutes in a trailing window (or all time). A
 * window of the last `win` days scrolls past as time advances, only each day's
 * top RACE_TOP artists are drawn, and the y-scale/gridlines ease with the data. */

const RACE_TOP = 10;
const RACE_LEAD_DAYS = 3; // empty days kept before the first listen when auto-trimming the start
const RACE_TOP_MAX = 15; // most lines shown when filtering to chosen artists
const RACE_KIND_LABEL = { artists: "artists", albums: "albums", tracks: "tracks", tags: "tags" };

/** What the line race plots. `usesTrail` views follow the 7/30/90-day/all-time dropdown. */
const RACE_VIEWS = {
  minutes: {
    usesTrail: true,
    min: 1,
    title: (t) => (t ? `minutes listened in the trailing ${t} days` : "total minutes listened (all time)"),
    fmt: (v) => fmtNum(v),
    tick: (c, v) => c.format(v),
  },
  plays: {
    usesTrail: true,
    min: 1,
    title: (t) => (t ? `plays in the trailing ${t} days` : "total plays (all time)"),
    fmt: (v) => fmtNum(v),
    tick: (c, v) => c.format(v),
  },
  share: {
    usesTrail: true,
    min: 1,
    title: (t, m) => `share of all ${m === "plays" ? "plays" : "listening time"} ${t ? `over the trailing ${t} days` : "(all time)"}`,
    fmt: (v) => `${v.toFixed(v < 10 ? 1 : 0)}%`,
    tick: (c, v) => `${c.format(v)}%`,
  },
  streak: {
    usesTrail: false,
    min: 4,
    title: () => "current listening streak (days played in a row)",
    fmt: (v) => `${fmtNum(v)} d`,
    tick: (c, v) => c.format(v),
  },
  top1: {
    usesTrail: false,
    min: 4,
    title: () => "longest run of days as the day's most-played, so far",
    fmt: (v) => `${fmtNum(v)} d`,
    tick: (c, v) => c.format(v),
  },
};

/** Effective RACE_VIEWS key: the first dropdown entry tracks the Minutes/Plays toggle. */
const raceView = () => (race.view === "value" ? metric : race.view);

const race = {
  data: null,
  t: 0, // current position, in days since the start of the filtered range
  playing: false,
  raf: 0,
  last: 0,
  speed: 45, // seconds the whole animation takes (same length for any date range)
  kind: "artists", // what is ranked: artists | albums | tracks | tags
  view: "value", // "value" follows the Minutes/Plays toggle; else a RACE_VIEWS key
  trail: 30, // trailing-window length in days; 0 = all time (cumulative)
  tag: "", // Last.fm tag filter ("" = any)
  filter: { mode: "only", names: new Set() }, // artist filter ("only" these / "hide" these)
  win: 84, // days visible on the x-axis
  pending: false,
  scrubbing: false, // user is dragging the slider
  observer: null,
  ctx: null,
  w: 0,
  h: 0,
};

/** Cosine-weighted average of `a` around fractional index `index` (eases scale changes). */
function raceAvg(a, index, width) {
  index = Math.min(a.length - 1, Math.max(0, index));
  const s = Math.max(0, Math.ceil(index - width));
  const e = Math.min(Math.floor(index + width), a.length - 1);
  let num = 0,
    den = 0;
  for (let d = s; d <= e; d++) {
    const wt = 0.5 + 0.5 * Math.cos(((d - index) / width) * Math.PI);
    num += a[d] * wt;
    den += wt;
  }
  return den ? num / den : a[Math.round(index)] || 0;
}

function raceUnit(i) {
  return [1, 2, 5][((i % 3) + 3) % 3] * Math.pow(10, Math.floor(i / 3));
}

const raceEntityCache = {};
/** Rankable things of one kind, normalised to {id, label, artist, image, days}. */
function raceEntities(kind) {
  if (raceEntityCache[kind]) return raceEntityCache[kind];
  const artistImg = new Map(DATA.artists.map((a) => [a.name, a.image]));
  let list;
  if (kind === "tracks") {
    list = DATA.tracks.map((t) => ({ id: t.key, label: t.title, artist: t.artist, image: t.image || artistImg.get(t.artist), days: t.days }));
  } else if (kind === "albums") {
    list = DATA.albums.map((al) => ({ id: al.key, label: al.album, artist: al.artist, image: al.image || artistImg.get(al.artist), days: al.days }));
  } else {
    list = DATA.artists.map((a) => ({ id: a.name, label: a.name, artist: a.name, image: a.image, days: a.days }));
  }
  return (raceEntityCache[kind] = list);
}

/** One entity per Last.fm tag: the summed daily minutes of its artists, iconned by its biggest artist. */
function raceTagEntities(artists) {
  const byTag = new Map();
  for (const a of artists) {
    let total = 0;
    for (const row of a.days) total += row[1];
    for (const tg of a.tags || []) {
      let e = byTag.get(tg);
      if (!e) byTag.set(tg, (e = { id: tg, label: tg, artist: "", image: a.image, days: new Map(), ms: 0, best: 0 }));
      for (const [i, ms, n] of a.days) {
        const cur = e.days.get(i);
        if (cur) {
          cur[0] += ms;
          cur[1] += n;
        } else e.days.set(i, [ms, n]);
      }
      e.ms += total;
      if (total > e.best) {
        e.best = total;
        e.image = a.image;
      }
    }
  }
  return [...byTag.values()]
    .sort((x, y) => y.ms - x.ms)
    .map((e) => ({ ...e, days: [...e.days].map(([i, v]) => [i, v[0], v[1]]) }));
}

/** Entities feeding the race, after applying the tag and artist filters. */
function raceSource() {
  const { mode, names } = race.filter;
  if (race.kind === "tags") {
    // Filters narrow which artists contribute, so a tag's value only counts the kept artists.
    let arts = DATA.artists.filter((a) => a.tags && a.tags.length);
    if (race.tag) arts = arts.filter((a) => a.tags.includes(race.tag));
    if (names.size) arts = arts.filter((a) => names.has(a.name) === (mode === "only"));
    return raceTagEntities(arts);
  }
  let list = raceEntities(race.kind);
  if (race.tag) {
    const tagged = new Set(DATA.artists.filter((a) => a.tags && a.tags.includes(race.tag)).map((a) => a.name));
    list = list.filter((e) => tagged.has(e.artist));
  }
  if (names.size) list = list.filter((e) => names.has(e.artist) === (mode === "only"));
  return list;
}

/** Trailing `trail`-day sums of a daily series, or running totals when trail is 0. */
function raceSums(dense, N, trail) {
  const out = new Float64Array(N);
  const pad = trail ? trail - 1 : 0;
  let run = 0;
  if (trail) {
    for (let j = 0; j < pad; j++) run += dense[j];
    for (let k = 0; k < N; k++) {
      run += dense[k + pad];
      out[k] = run;
      run -= dense[k];
    }
  } else {
    for (let k = 0; k < N; k++) {
      run += dense[k];
      out[k] = run;
    }
  }
  return out;
}

/**
 * Finds every entity that ever reaches a day's top `top`, without building a dense series for each
 * of the thousands of entities. Events are bucketed by day and swept once; only the (few hundred)
 * entities that make a top list go on to get full lines. Returns their indices and, for the
 * "#1 streak" view, the entity that won each day.
 */
function raceCandidates(ents, N, lo, view, trail, col, top) {
  const E = ents.length;
  const pad = trail ? trail - 1 : 0;
  const B = N + pad; // bucket b = day offset + pad
  const count = new Int32Array(B + 1);
  for (const e of ents) for (const row of e.days) {
    const b = row[0] - lo + pad;
    if (b < 0) continue;
    if (b >= B) break;
    count[b + 1]++;
  }
  for (let b = 0; b < B; b++) count[b + 1] += count[b];
  const evE = new Int32Array(count[B]), evV = new Float64Array(count[B]);
  const fill = count.slice(0, B);
  ents.forEach((e, ei) => {
    for (const row of e.days) {
      const b = row[0] - lo + pad;
      if (b < 0) continue;
      if (b >= B) break;
      const p = fill[b]++;
      evE[p] = ei;
      evV[p] = row[col];
    }
  });

  const seen = new Uint8Array(E);
  const winner = new Int32Array(N).fill(-1);
  // keep `best` (entity ids) sorted by value, at most `top` long
  const offer = (best, vals, e, val) => {
    if (best.length >= top && val <= vals[vals.length - 1]) return;
    let pos = best.length;
    while (pos > 0 && vals[pos - 1] < val) pos--;
    best.splice(pos, 0, e);
    vals.splice(pos, 0, val);
    if (best.length > top) { best.pop(); vals.pop(); }
  };

  if (view === "streak") {
    const run = new Int32Array(E), last = new Int32Array(E).fill(-2);
    for (let d = 0; d < N; d++) {
      for (let p = count[d]; p < count[d + 1]; p++) {
        if (evV[p] <= 0) continue;
        const e = evE[p];
        run[e] = last[e] === d - 1 ? run[e] + 1 : 1;
        last[e] = d;
      }
      const best = [], vals = [];
      for (let p = count[d]; p < count[d + 1]; p++) if (last[evE[p]] === d) offer(best, vals, evE[p], run[evE[p]]);
      for (const e of best) seen[e] = 1;
    }
  } else if (view === "top1") {
    const bestRun = new Float32Array(E);
    let list = [], run = 0, prev = -1;
    for (let d = 0; d < N; d++) {
      let w = -1, wv = 0;
      for (let p = count[d]; p < count[d + 1]; p++) if (evV[p] > wv) { wv = evV[p]; w = evE[p]; }
      winner[d] = w;
      run = w >= 0 && w === prev ? run + 1 : w >= 0 ? 1 : 0;
      prev = w;
      if (w >= 0 && run > bestRun[w]) {
        bestRun[w] = run;
        if (!list.includes(w)) list.push(w);
        list.sort((x, y) => bestRun[y] - bestRun[x]);
        if (list.length > top) list.length = top;
      }
      for (const e of list) seen[e] = 1;
    }
  } else {
    // minutes / plays / share: trailing sums (or running totals), updated as events enter and leave
    const sum = new Float64Array(E);
    for (let b = 0; b < B; b++) {
      for (let p = count[b]; p < count[b + 1]; p++) sum[evE[p]] += evV[p];
      if (trail && b - trail >= 0) for (let p = count[b - trail]; p < count[b - trail + 1]; p++) sum[evE[p]] -= evV[p];
      if (b < pad) continue;
      const best = [], vals = [];
      for (let e = 0; e < E; e++) {
        const val = sum[e];
        if (val > 0) offer(best, vals, e, val);
      }
      for (const e of best) seen[e] = 1;
    }
  }
  const indices = [];
  for (let e = 0; e < E; e++) if (seen[e]) indices.push(e);
  return { indices, winner };
}

function buildRaceData() {
  const lo = dayStrToOff(state.fromDay),
    hi = dayStrToOff(state.toDay);
  const N = hi - lo + 1;
  if (!(N >= 2)) return null;
  const view = raceView();
  const trail = RACE_VIEWS[view].usesTrail ? race.trail : 0;
  const pad = trail ? trail - 1 : 0;
  const col = view === "plays" || (view === "share" && metric === "plays") ? 2 : 1; // days rows are [day, ms, plays]
  const { mode, names } = race.filter;
  const top = race.kind === "artists" && mode === "only" && names.size ? Math.min(names.size, RACE_TOP_MAX) : RACE_TOP;

  let totalSums = null; // all listening per day, for the share view
  if (view === "share") {
    const totalDense = new Float64Array(N + pad);
    for (const row of DATA.series.day) {
      const j = dayOffFromSeriesRow(row) - (lo - pad);
      if (j >= 0 && j < totalDense.length) totalDense[j] += col === 2 ? row.n : row.ms;
    }
    totalSums = raceSums(totalDense, N, trail);
  }

  // Every artist/track/album is considered; only those that ever reach the top get a full line.
  const ents = raceSource();
  const cand = raceCandidates(ents, N, lo, view, trail, col, top);

  const pool = [];
  for (const ei of cand.indices) {
    const e = ents[ei];
    const dense = new Float64Array(N + pad); // index 0 = day (lo - pad)
    let any = false;
    for (const row of e.days) {
      const j = row[0] - (lo - pad);
      if (j >= 0 && j < dense.length) {
        dense[j] += row[col];
        any = true;
      }
    }
    if (!any) continue;
    const v = new Float32Array(N);
    if (view === "streak") {
      let run = 0;
      for (let k = 0; k < N; k++) {
        run = dense[k] > 0 ? run + 1 : 0;
        v[k] = run;
      }
    } else if (view !== "top1") {
      const sums = raceSums(dense, N, trail);
      for (let k = 0; k < N; k++) {
        v[k] = view === "plays" ? sums[k] : view === "share" ? (totalSums[k] > 0 ? (100 * sums[k]) / totalSums[k] : 0) : sums[k] / 60000;
      }
    }
    pool.push({ name: e.label, image: e.image, v, ei, shown: new Uint8Array(N) });
  }

  if (view === "top1") {
    // Longest run of days each entity has been the day's single most-played, as a running max,
    // driven by the global daily winners found in the sweep (a winner may not be in the pool).
    const bestRun = new Float32Array(ents.length);
    let run = 0, prev = -1;
    for (let k = 0; k < N; k++) {
      const w = cand.winner[k];
      run = w >= 0 && w === prev ? run + 1 : w >= 0 ? 1 : 0;
      prev = w;
      if (w >= 0 && run > bestRun[w]) bestRun[w] = run;
      for (const e of pool) e.v[k] = bestRun[e.ei];
    }
  }

  const maxes = new Float32Array(N);
  const leaders = new Array(N).fill(null); // who is #1 on each day of the chart
  for (let k = 0; k < N; k++) {
    const best = []; // pool indices, descending by value on day k
    for (let p = 0; p < pool.length; p++) {
      const val = pool[p].v[k];
      if (val <= 0) continue;
      if (best.length >= top && val <= pool[best[best.length - 1]].v[k]) continue;
      let pos = best.length;
      while (pos > 0 && pool[best[pos - 1]].v[k] < val) pos--;
      best.splice(pos, 0, p);
      if (best.length > top) best.pop();
    }
    for (const p of best) pool[p].shown[k] = 1;
    maxes[k] = best.length ? pool[best[0]].v[k] : 0;
    leaders[k] = best.length ? pool[best[0]] : null;
  }

  // #1 streak: consecutive days the same entity has topped the chart, plus the record so far.
  const streakLen = new Uint16Array(N), recLen = new Uint16Array(N);
  const recWho = new Array(N).fill(null);
  {
    let run = 0, rec = 0, who = null, prev = null;
    for (let k = 0; k < N; k++) {
      const cur = leaders[k];
      run = cur && cur === prev ? run + 1 : cur ? 1 : 0;
      prev = cur;
      if (run > rec) { rec = run; who = cur; }
      streakLen[k] = run;
      recLen[k] = rec;
      recWho[k] = who;
    }
  }

  const artists = pool.filter((a) => a.shown.includes(1));
  artists.forEach((a, i) => {
    a.color = `hsl(${(i * 137.508) % 360} 85% 63%)`;
    a.fs = a.shown.indexOf(1); // first and last day on the chart, so drawing can skip idle lines
    a.ls = a.shown.lastIndexOf(1);
  });
  // Start just before the first visible listen instead of at the beginning of the range.
  let first = N - 1;
  for (const a of artists) {
    const i = a.shown.indexOf(1);
    if (i >= 0 && i < first) first = i;
  }
  const start = Math.max(0, first - RACE_LEAD_DAYS);
  return { N, lo, start, artists, maxes, leaders, streakLen, recLen, recWho, top, trail, view, metric, minScale: RACE_VIEWS[view].min, kind: race.kind, scales: null, scalesWin: 0 };
}

const raceImgs = new Map();
/** Loaded image for a url, or null (starts loading it and repaints once ready if paused). */
function raceImg(url) {
  if (!url) return null;
  let im = raceImgs.get(url);
  if (!im) {
    im = new Image();
    im.onload = () => {
      im.ok = true;
      if (!race.playing) drawRace();
    };
    im.src = url;
    raceImgs.set(url, im);
  }
  return im.ok ? im : null;
}

/** Per-day y-axis maximum: the largest value seen in the visible window, smoothed. */
function raceScales(data, win) {
  if (data.scales && data.scalesWin === win) return data.scales;
  const { N, maxes } = data;
  const windowed = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    let m = 0;
    for (let j = Math.max(0, k - win); j <= k; j++) if (maxes[j] > m) m = maxes[j];
    windowed[k] = m;
  }
  const margin = Math.max(3, Math.round(win / 8));
  const out = new Float32Array(N);
  // Eased headroom, but never below the true peak in view (smoothing alone clips spikes).
  for (let k = 0; k < N; k++) out[k] = Math.max(data.minScale, raceAvg(windowed, k, margin) * 1.2, windowed[k] * 1.08);
  data.scales = out;
  data.scalesWin = win;
  return out;
}

function raceResize() {
  const canvas = document.getElementById("c-race");
  const host = canvas.parentElement;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  race.w = host.clientWidth;
  race.h = host.clientHeight;
  canvas.width = Math.round(race.w * dpr);
  canvas.height = Math.round(race.h * dpr);
  race.ctx = canvas.getContext("2d");
  race.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawRace() {
  const ctx = race.ctx;
  const data = race.data;
  if (!ctx) return;
  const { w, h } = race;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#12061f";
  ctx.fillRect(0, 0, w, h);
  if (!data) {
    ctx.fillStyle = "#c9b8e0";
    ctx.font = "14px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Pick a date range of at least two days.", w / 2, h / 2);
    return;
  }

  const { N, lo, artists } = data;
  const win = race.win || Math.max(1, N - data.start), // 0 = whole range
    interval = win / 4;
  const t = Math.min(Math.max(race.t, data.start), N - 1);
  const d = Math.floor(t),
    frac = t - d;
  const fs = Math.max(11, Math.min(16, w / 62));
  const x0 = Math.min(64, w * 0.09),
    x1 = w - Math.min(260, w * 0.28);
  const yTop = Math.max(70, h * 0.17),
    yBot = h - 34;
  const pw = x1 - x0,
    ph = yBot - yTop;

  const scales = raceScales(data, win);
  const scale = Math.max(data.minScale, scales[d] + (scales[Math.min(d + 1, N - 1)] - scales[d]) * frac);
  const viewMeta = RACE_VIEWS[data.view];
  const xOf = (i) => x1 - ((t - i) / win) * pw;
  const yOf = (val) => yBot - (val / scale) * ph;
  const valAt = (a, i) => a.v[i];

  // Horizontal unit lines, cross-fading between neighbouring 1-2-5 units.
  const f = 3 * Math.log10(scale / 4);
  const i0 = Math.floor(f),
    r = f - i0;
  const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
  ctx.font = `${fs - 1}px Inter, system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  const unitLines = (u, alpha) => {
    if (alpha < 0.01) return;
    ctx.globalAlpha = alpha;
    for (let val = 0; val <= scale; val += u) {
      const y = yOf(val);
      ctx.strokeStyle = "rgba(201,184,224,0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1 + 8, y);
      ctx.stroke();
      ctx.fillStyle = "#c9b8e0";
      ctx.textAlign = "right";
      ctx.fillText(viewMeta.tick(compact, val), x0 - 10, y);
    }
    ctx.globalAlpha = 1;
  };
  unitLines(raceUnit(i0), 1 - r);
  unitLines(raceUnit(i0 + 1), r);

  // Vertical date lines that scroll with the data.
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
  const shortDate = (off) => {
    const iso = offToDayStr(off);
    return `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(2, 4)}`;
  };
  for (let j = Math.ceil(t - win); j <= Math.floor(t); j++) {
    if (j < 0 || (lo + j) % Math.round(interval) !== 0) continue;
    const x = xOf(j);
    if (x < x0 + 2) continue;
    ctx.strokeStyle = "rgba(201,184,224,0.16)";
    ctx.beginPath();
    ctx.moveTo(x, yTop);
    ctx.lineTo(x, yBot);
    ctx.stroke();
    ctx.fillStyle = "#c9b8e0";
    ctx.fillText(shortDate(lo + j), x, yBot + fs + 6);
  }

  // Lines (clipped on the left so they slide under the y-axis).
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, yTop - 6, w - x0, ph + 12);
  ctx.clip();
  ctx.lineWidth = 2.6;
  ctx.lineJoin = "round";
  const labels = [];
  const iStart = Math.max(0, Math.floor(t - win) - 1);
  for (const a of artists) {
    if (a.ls + 1 < iStart || a.fs > d) continue; // never on the chart inside this window
    ctx.strokeStyle = a.color;
    let open = false;
    ctx.beginPath();
    for (let i = iStart; i <= d; i++) {
      if (!a.shown[i]) {
        if (open) {
          ctx.lineTo(xOf(i), yOf(valAt(a, i)));
          open = false;
        }
        continue;
      }
      const x = xOf(i),
        y = yOf(valAt(a, i));
      if (open) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      open = true;
    }
    if (open && a.shown[d]) {
      const next = d + 1 < N ? valAt(a, d + 1) : valAt(a, d);
      const cur = valAt(a, d) + (next - valAt(a, d)) * frac;
      ctx.lineTo(x1, yOf(cur));
      labels.push({ a, y: yOf(cur), val: cur });
    }
    ctx.stroke();
  }
  ctx.restore();

  // End-of-line icons and name labels (nudged apart so they stay readable).
  const R = Math.max(10, fs * 0.85);
  labels.sort((p, q) => p.y - q.y);
  const gap = Math.max(fs + 3, 2 * R + 2);
  let prev = -Infinity;
  for (const L of labels) {
    L.ly = Math.max(L.y, prev + gap);
    prev = L.ly;
  }
  for (let i = labels.length - 2; i >= 0; i--) {
    if (labels[i + 1].ly > yBot + 6) labels[i + 1].ly = yBot + 6;
    labels[i].ly = Math.min(labels[i].ly, labels[i + 1].ly - gap);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
  const maxLabelW = w - x1 - 2 * R - 20;
  for (const L of labels) {
    const cy = L.ly,
      cx = x1 + R;
    if (Math.abs(cy - L.y) > 1) {
      ctx.strokeStyle = L.a.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x1, L.y);
      ctx.lineTo(cx, cy);
      ctx.stroke();
    }
    const im = raceImg(L.a.image);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    if (im) {
      const side = Math.min(im.naturalWidth, im.naturalHeight);
      ctx.drawImage(im, (im.naturalWidth - side) / 2, (im.naturalHeight - side) / 2, side, side, cx - R, cy - R, 2 * R, 2 * R);
    } else {
      ctx.fillStyle = L.a.color;
      ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
      ctx.fillStyle = "#12061f";
      ctx.textAlign = "center";
      ctx.fillText((L.a.name.trim()[0] || "?").toUpperCase(), cx, cy + 1);
      ctx.textAlign = "left";
    }
    ctx.restore();
    ctx.strokeStyle = L.a.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = L.a.color;
    const val = `  ${viewMeta.fmt(L.val)}`;
    let name = L.a.name;
    while (name.length > 3 && ctx.measureText(name + val).width > maxLabelW) name = name.slice(0, -2).trimEnd() + "…";
    ctx.fillText(name + val, cx + R + 8, cy);
  }

  // Axes + title + big date.
  ctx.strokeStyle = "#f3e8ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, yTop);
  ctx.lineTo(x0, yBot);
  ctx.lineTo(x1 + 8, yBot);
  ctx.stroke();
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#c9b8e0";
  ctx.font = `${fs + 1}px Inter, system-ui, sans-serif`;
  ctx.fillText(
    `Top ${data.top} ${data.top === 1 ? RACE_KIND_LABEL[data.kind].slice(0, -1) : RACE_KIND_LABEL[data.kind]} · ` +
      viewMeta.title(data.trail, data.metric),
    x0 + 6,
    26
  );
  ctx.fillStyle = "#fff";
  ctx.font = `600 ${Math.max(24, Math.min(46, w / 24))}px Fraunces, Georgia, serif`;
  const dateStr = new Date(offToDayStr(lo + d) + "T00:00:00Z").toLocaleDateString(undefined, {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  ctx.fillText(dateStr, x0 + 6, 26 + Math.max(24, Math.min(46, w / 24)) + 4);

  // Side stat: how long the current #1 has held the top spot.
  const lead = data.leaders[d];
  if (lead && w >= 700) {
    const days = data.streakLen[d];
    const rec = data.recLen[d];
    const recName = data.recWho[d] ? data.recWho[d].name : "";
    const R = 11;
    const maxName = 230;
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
    let nm = lead.name;
    while (nm.length > 3 && ctx.measureText(nm).width > maxName) nm = nm.slice(0, -2).trimEnd() + "…";
    const nameW = ctx.measureText(nm).width;
    ctx.font = `${fs - 2}px Inter, system-ui, sans-serif`;
    let recTxt = `record ${rec} d · ${recName}`;
    while (recTxt.length > 12 && ctx.measureText(recTxt).width > maxName + 40) recTxt = recTxt.slice(0, -2).trimEnd() + "…";
    const panelW = Math.max(nameW + 2 * R + 12, ctx.measureText(recTxt).width, 120) + 24;
    const px = w - 14,
      py = 8,
      ph = Math.max(60, yTop - 14);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath();
    ctx.roundRect(px - panelW, py, panelW, ph, 8);
    ctx.fill();
    const rx = px - 12;
    ctx.fillStyle = "#c9b8e0";
    ctx.font = `700 ${fs - 3}px Inter, system-ui, sans-serif`;
    ctx.fillText("#1 STREAK", rx, py + 16);
    // icon + name
    ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = lead.color;
    ctx.fillText(nm, rx, py + 36);
    const cx = rx - nameW - R - 6,
      cy = py + 31;
    const im = raceImg(lead.image);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    if (im) {
      const side = Math.min(im.naturalWidth, im.naturalHeight);
      ctx.drawImage(im, (im.naturalWidth - side) / 2, (im.naturalHeight - side) / 2, side, side, cx - R, cy - R, 2 * R, 2 * R);
    } else {
      ctx.fillStyle = lead.color;
      ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    }
    ctx.restore();
    ctx.strokeStyle = lead.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    // streak length
    ctx.fillStyle = "#fff";
    ctx.font = `700 ${Math.max(20, fs + 6)}px Fraunces, Georgia, serif`;
    ctx.fillText(`${days} ${days === 1 ? "day" : "days"}`, rx, py + 62);
    ctx.fillStyle = "#c9b8e0";
    ctx.font = `${fs - 2}px Inter, system-ui, sans-serif`;
    if (ph >= 78) ctx.fillText(recTxt, rx, py + 78);
    ctx.textAlign = "left";
  }
}

function raceSyncControls() {
  const N = race.data ? race.data.N : 1;
  const scrub = document.getElementById("race-scrub");
  scrub.min = String(race.data ? race.data.start : 0);
  scrub.max = String(N - 1);
  if (!race.scrubbing) scrub.value = String(race.t);
  document.getElementById("race-play").textContent = race.playing ? "Pause" : "Play";
}

/** Date labels under a slider, spanning the (trimmed) playable range. */
function renderDateTicks(el, data) {
  if (!data) {
    el.innerHTML = "";
    return;
  }
  const span = data.N - 1 - data.start;
  const fmt = new Intl.DateTimeFormat(undefined, {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    ...(span > 240 ? {} : { day: "numeric" }),
  });
  const count = 5;
  el.innerHTML = Array.from({ length: count }, (_, i) => {
    const off = data.lo + data.start + Math.round((span * i) / (count - 1));
    return `<span>${fmt.format(new Date(offToDayStr(off) + "T00:00:00Z"))}</span>`;
  }).join("");
}

const raceRenderTicks = () => renderDateTicks(document.getElementById("race-ticks"), race.data);

function raceFrame(now) {
  if (!race.playing || !race.data) return;
  const dt = Math.max(0, Math.min((now - race.last) / 1000, 0.1));
  race.last = now;
  const end = race.data.N - 1;
  race.t = Math.min(end, race.t + ((end - race.data.start) / race.speed) * dt);
  if (race.t >= end) race.playing = false;
  drawRace();
  raceSyncControls();
  if (race.playing) race.raf = requestAnimationFrame(raceFrame);
}

function racePlay(fromStart) {
  if (!race.data) return;
  race.pending = false;
  if (fromStart || race.t >= race.data.N - 1) race.t = race.data.start;
  race.playing = true;
  race.last = performance.now();
  cancelAnimationFrame(race.raf);
  race.raf = requestAnimationFrame(raceFrame);
  raceSyncControls();
}

function racePause() {
  race.playing = false;
  cancelAnimationFrame(race.raf);
  raceSyncControls();
}

/** (Re)build for the current date range; autoplay once the card is on screen. */
function renderRace() {
  racePause();
  race.data = buildRaceData();
  race.t = race.data ? race.data.start : 0;
  raceResize();
  drawRace();
  raceSyncControls();
  raceRenderTicks();
  if (!race.data) return;
  // Rest on the finished chart; the user presses Play to watch it build up.
  race.t = race.data.N - 1;
  drawRace();
  raceSyncControls();
}

/** Rebuild after a kind/trail/filter change, keeping the current position and play state. */
function raceRebuild() {
  const t = race.t;
  race.data = buildRaceData();
  if (!race.data) racePause();
  race.t = race.data ? Math.max(race.data.start, Math.min(t, race.data.N - 1)) : 0;
  drawRace();
  raceSyncControls();
  raceRenderTicks();
}

function renderRaceChips() {
  const host = document.getElementById("race-chips");
  const byName = new Map(DATA.artists.map((a) => [a.name, a]));
  host.innerHTML = [...race.filter.names]
    .map((n) => {
      const img = byName.get(n)?.image;
      return `<span class="chip">${img ? `<img src="${escAttr(img)}" alt="" />` : ""}${escHtml(n)}` +
        `<button type="button" data-name="${escAttr(n)}" aria-label="Remove ${escAttr(n)}">×</button></span>`;
    })
    .join("");
  document.getElementById("race-clear").hidden = race.filter.names.size === 0;
}

/** Adds a Full screen button to every animated card (Fullscreen API, with a fixed-position fallback). */
function wireFullscreen() {
  for (const host of document.querySelectorAll(".race-host")) {
    const card = host.closest(".chart-card");
    const controls = card && card.querySelector(".anim-controls");
    if (!controls) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "secondary fs-btn";
    const ICON_ENTER = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
    const ICON_EXIT = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';
    const active = () => document.fullscreenElement === card || card.classList.contains("is-fullscreen");
    const sync = () => {
      const on = active();
      btn.innerHTML = on ? ICON_EXIT : ICON_ENTER;
      btn.title = on ? "Exit full screen" : "Full screen";
      btn.setAttribute("aria-label", btn.title);
    };
    btn.addEventListener("click", async () => {
      if (active()) {
        card.classList.remove("is-fullscreen");
        if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      } else if (card.requestFullscreen) {
        try {
          await card.requestFullscreen();
        } catch {
          card.classList.add("is-fullscreen");
        }
      } else {
        card.classList.add("is-fullscreen");
      }
      sync();
    });
    card.addEventListener("fullscreenchange", sync);
    sync();
    controls.appendChild(btn);
  }
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    document.querySelectorAll(".chart-card.is-fullscreen").forEach((c) => {
      c.classList.remove("is-fullscreen");
      c.dispatchEvent(new Event("fullscreenchange"));
    });
  });
}

function wireRaceControls() {
  const input = document.getElementById("race-artist-input");
  document.getElementById("race-artist-dl").innerHTML = DATA.artists
    .slice(0, 1000)
    .map((a) => `<option value="${escAttr(a.name)}"></option>`)
    .join("");
  const addArtist = () => {
    const name = input.value.trim();
    if (!DATA.artists.some((a) => a.name === name)) return;
    race.filter.names.add(name);
    input.value = "";
    renderRaceChips();
    raceRebuild();
  };
  input.addEventListener("input", addArtist); // fires when a datalist option is picked
  input.addEventListener("keydown", (e) => e.key === "Enter" && addArtist());
  document.getElementById("race-chips").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-name]");
    if (!btn) return;
    race.filter.names.delete(btn.dataset.name);
    renderRaceChips();
    raceRebuild();
  });
  document.getElementById("race-clear").addEventListener("click", () => {
    race.filter.names.clear();
    renderRaceChips();
    raceRebuild();
  });
  document.getElementById("race-fmode").addEventListener("change", (e) => {
    race.filter.mode = e.target.value;
    raceRebuild();
  });
  document.getElementById("race-trail").addEventListener("change", (e) => {
    race.trail = +e.target.value;
    raceRebuild();
  });
  document.querySelector('#race-kind option[value="tags"]').disabled = !tagsAvailable();
  const tagSel = document.getElementById("race-tag");
  const tagCounts = new Map();
  for (const a of DATA.artists) for (const tg of a.tags || []) tagCounts.set(tg, (tagCounts.get(tg) || 0) + 1);
  const topTags = [...tagCounts].filter(([, n]) => n >= 2).sort((x, y) => y[1] - x[1]).slice(0, 80);
  tagSel.hidden = topTags.length === 0;
  tagSel.innerHTML =
    `<option value="">Any tag</option>` +
    topTags.map(([tg, n]) => `<option value="${escAttr(tg)}">${escHtml(tg)} (${n})</option>`).join("");
  tagSel.addEventListener("change", (e) => {
    race.tag = e.target.value;
    raceRebuild();
  });
  const trailSel = document.getElementById("race-trail");
  document.getElementById("race-view").addEventListener("change", (e) => {
    race.view = e.target.value;
    trailSel.disabled = !RACE_VIEWS[raceView()].usesTrail; // streaks ignore the time-window setting
    raceRebuild();
  });
  document.getElementById("race-kind").addEventListener("change", (e) => {
    race.kind = e.target.value;
    raceRebuild();
  });
  renderRaceChips();

  race.speed = +document.getElementById("race-speed").value;
  race.win = +document.getElementById("race-window").value;
  document.getElementById("race-play").addEventListener("click", () => (race.playing ? racePause() : racePlay(false)));
  document.getElementById("race-restart").addEventListener("click", () => racePlay(true));
  document.getElementById("race-speed").addEventListener("change", (e) => (race.speed = +e.target.value));
  document.getElementById("race-window").addEventListener("change", (e) => {
    race.win = +e.target.value;
    drawRace();
  });
  document.getElementById("race-scrub").addEventListener("input", (e) => {
    race.pending = false;
    race.t = +e.target.value;
    racePause();
    drawRace();
  });
  const scrub = document.getElementById("race-scrub");
  scrub.addEventListener("pointerdown", () => (race.scrubbing = true));
  window.addEventListener("pointerup", () => (race.scrubbing = false));
  window.addEventListener("pointercancel", () => (race.scrubbing = false));
  const host = document.getElementById("c-race").parentElement;
  if ("ResizeObserver" in window) {
    new ResizeObserver(() => {
      if (host.clientWidth && (host.clientWidth !== race.w || host.clientHeight !== race.h)) {
        raceResize();
        drawRace();
      }
    }).observe(host);
  }
}

/** True once Last.fm tags have been fetched (the tag-based views stay hidden until then). */
const tagsAvailable = () => DATA.artists.some((a) => a.tags && a.tags.length);

/* ---------- Taste map (canvas) ----------
 * Top artists laid out once by Last.fm similarity (d3 force, run to rest), so related
 * artists sit close together. Time then lights the map up: either everything heard so
 * far ("ever") or only what you played in the trailing TASTE_TRAIL_DAYS ("recent"). */

const TASTE_TRAIL_DAYS = 30;
const TASTE_PULSE_DAYS = 14; // how long a first-listen ring keeps expanding

const tasteMap = {
  layout: null,
  data: null,
  t: 0,
  playing: false,
  raf: 0,
  last: 0,
  speed: 45, // seconds for the whole animation
  mode: "ever", // ever | recent
  overlay: "none", // none | trail | trailAll | explore
  color: "tag", // tag | recency (date-anchored) | rank (relative)
  zoom: { k: 1, x: 0, y: 0 }, // pan/zoom applied on top of the fitted view
  layouts: {}, // computed layouts by mode
  layoutMode: "similarity", // similarity | genre
  labels: "artists", // artists | zones | both | none
  ghosts: "dim", // not-yet-discovered artists: dim | hide
  zoneMode: "steady", // genre labels: steady | reactive (fade/grow with current listening)
  pending: false,
  scrubbing: false,
  observer: null,
  ctx: null,
  w: 0,
  h: 0,
  view: null, // {sx, sy, ox, oy} layout -> canvas
  hover: -1,
};

const tasteAvailable = () => typeof d3 !== "undefined" && (DATA.lastfm_links || []).length > 0;

/**
 * Force layout shared by the Web Worker and the main-thread fallback (it is stringified into the worker, so
 * it must stay self-contained). Links are `[i, j, match]`.
 *  - similarity: Last.fm links only. Link strength is divided by the smaller node degree (d3's own default), so
 *    hub artists don't collapse everything around them.
 *  - genre (opts.genre = genre index per node, -1 = none): first lay out the genres themselves by how similar
 *    their members are, then arrange each artist around its genre's anchor with the same link forces.
 */
function tasteRunSim(d3lib, n, links, ticks, opts) {
  opts = opts || {};
  const nodes = Array.from({ length: n }, (_, i) => ({ i }));
  const deg = new Int32Array(n);
  for (const l of links) { deg[l[0]]++; deg[l[1]]++; }
  const genre = opts.genre || null;

  let ax = null, ay = null;
  if (genre) {
    const G = opts.genreCount;
    const size = new Int32Array(G);
    for (let i = 0; i < n; i++) if (genre[i] >= 0) size[genre[i]]++;
    const mass = new Map();
    for (const l of links) {
      const a = genre[l[0]], b = genre[l[1]];
      if (a < 0 || b < 0 || a === b) continue;
      const k = a < b ? a * G + b : b * G + a;
      mass.set(k, (mass.get(k) || 0) + l[2]);
    }
    const gl = [];
    let vmax = 1e-9;
    for (const [k, m] of mass) {
      const a = Math.floor(k / G), b = k % G;
      const v = m / Math.sqrt(size[a] * size[b]);
      vmax = Math.max(vmax, v);
      gl.push({ source: a, target: b, v });
    }
    gl.forEach((l) => (l.v /= vmax));
    const R = (i) => 7.5 * Math.sqrt(size[i]) + 10; // a genre's disc, sized to hold its artists
    const gn = Array.from({ length: G }, (_, i) => ({ i }));
    const gsim = d3lib.forceSimulation(gn)
      .force("link", d3lib.forceLink(gl).id((d) => d.i)
        .distance((l) => R(l.source.i) + R(l.target.i) + 70 * (1 - l.v)).strength((l) => 0.15 + 0.7 * l.v))
      .force("charge", d3lib.forceManyBody().strength(-250))
      .force("collide", d3lib.forceCollide((d) => R(d.i) + 6))
      .force("x", d3lib.forceX(0).strength(0.02))
      .force("y", d3lib.forceY(0).strength(0.02))
      .stop();
    for (let k = 0; k < 400; k++) gsim.tick();
    ax = gn.map((d) => d.x);
    ay = gn.map((d) => d.y);
  }

  const link = d3lib.forceLink(links.map((l) => ({ source: l[0], target: l[1], w: l[2] }))).id((d) => d.i)
    .distance((l) => 8 + 40 * (1 - l.w))
    .strength((l) => (2.5 * (0.3 + 0.7 * l.w)) / Math.min(deg[l.source.i], deg[l.target.i]));
  const sim = d3lib.forceSimulation(nodes)
    .force("link", link)
    .force("charge", d3lib.forceManyBody().strength(-50))
    .force("collide", d3lib.forceCollide(5))
    .stop();
  if (genre) {
    sim.force("gx", d3lib.forceX((d) => (genre[d.i] >= 0 ? ax[genre[d.i]] : 0)).strength((d) => (genre[d.i] >= 0 ? opts.pull : 0.01)))
      .force("gy", d3lib.forceY((d) => (genre[d.i] >= 0 ? ay[genre[d.i]] : 0)).strength((d) => (genre[d.i] >= 0 ? opts.pull : 0.01)));
  } else {
    sim.force("x", d3lib.forceX(0).strength(0.02)).force("y", d3lib.forceY(0).strength(0.02));
  }
  for (let k = 0; k < ticks; k++) sim.tick();
  return nodes.map((d) => [d.x, d.y]);
}

/** Keep each artist's `k` strongest links: drops the noisy tail of weak similarities. */
function pruneLinks(links, k) {
  const by = new Map();
  links.forEach((l, idx) => {
    for (const e of [l[0], l[1]]) (by.get(e) || by.set(e, []).get(e)).push(idx);
  });
  const keep = new Set();
  for (const ks of by.values()) {
    ks.sort((a, b) => links[b][2] - links[a][2]);
    ks.slice(0, k).forEach((i) => keep.add(i));
  }
  return links.filter((_, i) => keep.has(i));
}

/** Nodes (every graph artist) and links for the layout in the current layout mode. */
function tasteInputs() {
  const mode = tasteMap.layoutMode;
  const cap = Math.min(DATA.graph_artist_cap || 0, DATA.artists.length);
  const nodes = DATA.artists.slice(0, cap).map((a, i) => ({ i, name: a.name, tag: a.g !== undefined ? DATA.genres[a.g] || "" : "", g: a.g !== undefined ? a.g : -1, ms: a.ms }));
  let links = pruneLinks((DATA.lastfm_links || []).map(([i, j, m]) => [i, j, m]), 15);
  if (mode !== "genre") {
    // A weak same-genre chain keeps genres from fraying apart in the similarity-only layout.
    const groups = new Map();
    for (const n of nodes) if (n.tag) (groups.get(n.tag) || groups.set(n.tag, []).get(n.tag)).push(n);
    for (const g of groups.values()) for (let k = 1; k < g.length; k++) links.push([g[k].i, g[k - 1].i, 0.12]);
  }
  const opts = mode === "genre" ? { genre: nodes.map((n) => n.g), genreCount: DATA.genres.length, pull: 0.4 } : {};
  return { nodes, links, ticks: nodes.length > 2000 ? 250 : 400, opts, mode };
}

/** Attach positions and colours to the nodes and work out the view bounds. */
function tasteFinish(inp, xy) {
  const { nodes } = inp;
  nodes.forEach((n, k) => { n.x = xy[k][0]; n.y = xy[k][1]; });

  // One colour per genre (DATA.genres is ordered by minutes, which also orders the legend); unclassified is grey.
  const present = new Set(nodes.map((n) => n.tag));
  const topTags = DATA.genres.filter((t) => present.has(t));
  const tagColor = new Map(topTags.map((t, i) => [t, `hsl(${(i * 137.508) % 360} 78% ${i % 2 ? 68 : 58}%)`]));
  for (const n of nodes) n.color = tagColor.get(n.tag) || "#8b7aa8";

  // Fit the view to the 1st-99th percentile so a few far-flung artists don't shrink the map
  // (the map is pannable, so outliers stay reachable).
  const pct = (arr, p) => [...arr].sort((a, b) => a - b)[Math.floor((arr.length - 1) * p)];
  const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
  return (tasteMap.layouts[inp.mode] = {
    mode: inp.mode,
    nodes,
    legend: topTags.slice(0, 12).map((tag) => ({ tag, color: tagColor.get(tag) })),
    legendMore: Math.max(0, topTags.length - 12),
    // Where each genre sits: the minutes-weighted centre of the artists whose genre it is.
    regions: topTags.map((tag) => {
      const g = nodes.filter((n) => n.tag === tag);
      const w = g.reduce((sum, n) => sum + n.ms, 0) || 1;
      const x = g.reduce((sum, n) => sum + n.x * n.ms, 0) / w, y = g.reduce((sum, n) => sum + n.y * n.ms, 0) / w;
      const spread = g.reduce((sum, n) => sum + Math.hypot(n.x - x, n.y - y), 0) / g.length;
      return { tag, color: tagColor.get(tag), count: g.length, x, y, spread };
    }).filter((r) => r.count >= 6),
    minX: pct(xs, 0.01), maxX: pct(xs, 0.99),
    minY: pct(ys, 0.01), maxY: pct(ys, 0.99),
  });
}

/** Synchronous layout. Only a fallback: with thousands of artists this blocks the page for seconds. */
function tasteLayout() {
  if (tasteMap.layout) return tasteMap.layout;
  const inp = tasteInputs();
  return (tasteMap.layout = tasteFinish(inp, tasteRunSim(d3, inp.nodes.length, inp.links, inp.ticks, inp.opts)));
}

const tasteLayoutPromises = {};
const f32ToB64 = (arr) => {
  const bytes = new Uint8Array(arr.buffer);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const b64ToF32 = (b64) => {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return new Float32Array(bytes.buffer);
};

/** Lays the map out off the main thread (and remembers the result per layout mode), resolving once it is ready. */
function ensureTasteLayout() {
  const mode = tasteMap.layoutMode;
  if (tasteMap.layouts[mode]) return Promise.resolve(tasteMap.layouts[mode]);
  if (tasteLayoutPromises[mode]) return tasteLayoutPromises[mode];
  const inp = tasteInputs();
  let h = 0;
  for (const [i, j, m] of inp.links) h = (h * 31 + i * 7 + j * 13 + Math.round(m * 1000)) | 0;
  for (const n of inp.nodes) h = (h * 31 + n.g + 1) | 0; // genre assignments feed the layout too
  h = (h * 31 + Math.round(((inp.opts && inp.opts.pull) || 0) * 100)) | 0; // so does the anchoring strength
  const prefix = `taste-layout:v3:${mode}:`;
  const key = `${prefix}${inp.nodes.length}:${inp.links.length}:${h}`;

  try {
    const hit = localStorage.getItem(key);
    if (hit) {
      const f = b64ToF32(hit);
      if (f.length === inp.nodes.length * 2) {
        const xy = Array.from({ length: inp.nodes.length }, (_, k) => [f[2 * k], f[2 * k + 1]]);
        return (tasteLayoutPromises[mode] = Promise.resolve(tasteFinish(inp, xy)));
      }
    }
  } catch { /* storage unavailable: just recompute */ }

  const remember = (xy) => {
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith("taste-layout:v1") || k.startsWith("taste-layout:v2") || k.startsWith(prefix)) localStorage.removeItem(k);
      localStorage.setItem(key, f32ToB64(Float32Array.from(xy.flat())));
    } catch { /* too big or blocked: fine */ }
  };
  tasteLayoutPromises[mode] = new Promise((resolve) => {
    const fallback = () => setTimeout(() => {
      const xy = tasteRunSim(d3, inp.nodes.length, inp.links, inp.ticks, inp.opts);
      remember(xy);
      resolve(tasteFinish(inp, xy));
    }, 0);
    try {
      const src = `${tasteRunSim.toString()}\nimportScripts("https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js");\n` +
        `self.onmessage = (e) => self.postMessage(tasteRunSim(self.d3, e.data.n, e.data.links, e.data.ticks, e.data.opts));`;
      const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
      const worker = new Worker(url);
      worker.onmessage = (e) => {
        worker.terminate();
        URL.revokeObjectURL(url);
        remember(e.data);
        resolve(tasteFinish(inp, e.data));
      };
      worker.onerror = () => {
        worker.terminate();
        fallback();
      };
      worker.postMessage({ n: inp.nodes.length, links: inp.links, ticks: inp.ticks, opts: inp.opts });
    } catch {
      fallback();
    }
  });
  return tasteLayoutPromises[mode];
}

/** Renders the taste cards, laying the map out first if that has not happened yet for the current layout mode. */
function renderTasteViews() {
  const status = document.getElementById("taste-status");
  const mode = tasteMap.layoutMode;
  const all = () => {
    status.hidden = true;
    renderTasteMap();
    renderWalk();
    renderCompare();
  };
  if (!tasteAvailable()) return all();
  if (tasteMap.layouts[mode]) {
    tasteMap.layout = tasteMap.layouts[mode];
    return all();
  }
  document.getElementById("taste-section").hidden = false;
  status.hidden = false;
  status.textContent = `Laying out ${fmtNum(Math.min(DATA.graph_artist_cap || 0, DATA.artists.length))} artists… (first time only; it is saved afterwards)`;
  ensureTasteLayout().then(() => {
    if (tasteMap.layoutMode !== mode) return; // the user switched layouts while this one was computing
    tasteMap.layout = tasteMap.layouts[mode];
    all();
  });
}

function buildTasteData() {
  const layout = tasteLayout();
  const lo = dayStrToOff(state.fromDay), hi = dayStrToOff(state.toDay);
  const N = hi - lo + 1;
  if (!(N >= 2)) return null;
  const unit = metric === "plays" ? 1 : 1 / 60000;
  const col = metric === "plays" ? 2 : 1;
  const nodes = layout.nodes, K = nodes.length;

  // Sparse per-artist series inside the range: day offsets plus running totals. Dense per-day arrays
  // for thousands of artists would cost tens of MB, and most artists are played on few days.
  const days = new Array(K), cum = new Array(K), cumDV = new Array(K);
  const first = new Float64Array(K).fill(Infinity);
  const buckets = new Array(N); // per day: [artist, value, artist, value, ...]
  let firstAny = N - 1, maxEver = 1;
  for (let k = 0; k < K; k++) {
    const dd = [], cc = [], dv = [];
    let run = 0, runDV = 0;
    for (const row of DATA.artists[nodes[k].i].days) {
      const d = row[0] - lo;
      if (d < 0) continue;
      if (d >= N) break;
      const v = row[col] * unit;
      run += v;
      runDV += d * v;
      dd.push(d);
      cc.push(run);
      dv.push(runDV);
      (buckets[d] || (buckets[d] = [])).push(k, v);
    }
    days[k] = Int32Array.from(dd);
    cum[k] = Float32Array.from(cc);
    cumDV[k] = Float64Array.from(dv);
    if (dd.length) {
      first[k] = dd[0];
      if (dd[0] < firstAny) firstAny = dd[0];
    }
    if (run > maxEver) maxEver = run;
  }

  // One sweep over the days gives both centres of mass (last 30 days, and everything so far)
  // and the busiest 30-day total any artist reached, without touching idle artists.
  const tw = new Float64Array(K);
  const rawX = new Float32Array(N), rawY = new Float32Array(N), allX = new Float32Array(N), allY = new Float32Array(N);
  let swR = 0, sxR = 0, syR = 0, swA = 0, sxA = 0, syA = 0, pxR = 0, pyR = 0, pxA = 0, pyA = 0, maxRecent = 1;
  for (let d = 0; d < N; d++) {
    const old = buckets[d - TASTE_TRAIL_DAYS];
    if (old) for (let j = 0; j < old.length; j += 2) {
      const k = old[j], v = old[j + 1];
      tw[k] -= v; swR -= v; sxR -= v * nodes[k].x; syR -= v * nodes[k].y;
    }
    const cur = buckets[d];
    if (cur) for (let j = 0; j < cur.length; j += 2) {
      const k = cur[j], v = cur[j + 1];
      tw[k] += v; swR += v; sxR += v * nodes[k].x; syR += v * nodes[k].y;
      swA += v; sxA += v * nodes[k].x; syA += v * nodes[k].y;
      if (tw[k] > maxRecent) maxRecent = tw[k];
    }
    if (swR > 1e-9) { pxR = sxR / swR; pyR = syR / swR; }
    if (swA > 1e-9) { pxA = sxA / swA; pyA = syA / swA; }
    rawX[d] = pxR; rawY[d] = pyR; allX[d] = pxA; allY[d] = pyA;
  }
  const smooth = (a) => {
    const o = new Float32Array(N);
    for (let d = 0; d < N; d++) {
      let sum = 0, c = 0;
      for (let j = Math.max(0, d - 3); j <= Math.min(N - 1, d + 3); j++) { sum += a[j]; c++; }
      o[d] = sum / c;
    }
    return o;
  };

  const startDay = Math.max(0, firstAny - RACE_LEAD_DAYS);
  // "Recency of listening": each artist's minutes/plays-weighted average listening date. A single song
  // in 2020 plus a 2025 binge averages out near 2025. Colours use the date's percentile among artists,
  // so the whole ramp is used even when most listening bunches up in a few years.
  const meanDay = new Float64Array(K).fill(NaN);
  for (let k = 0; k < K; k++) {
    const dd = days[k], cc = cum[k];
    let sw = 0, sd = 0, prev = 0;
    for (let j = 0; j < dd.length; j++) {
      const v = cc[j] - prev;
      prev = cc[j];
      sw += v;
      sd += v * dd[j];
    }
    if (sw > 0) meanDay[k] = sd / sw;
  }
  const sorted = Float64Array.from(meanDay.filter(Number.isFinite)).sort();
  const cdf = (x) => {
    let lo2 = 0, hi2 = sorted.length;
    while (lo2 < hi2) {
      const mid = (lo2 + hi2) >> 1;
      if (sorted[mid] <= x) lo2 = mid + 1;
      else hi2 = mid;
    }
    return sorted.length ? lo2 / sorted.length : 0;
  };
  const stops = (f) => `linear-gradient(90deg, ${Array.from({ length: 25 }, (_, i) => `${f(i / 24)} ${((i / 24) * 100).toFixed(1)}%`).join(", ")})`;
  // Date-anchored key: the ramp laid out linearly over the timeline (what an artist centred on that date shows).
  const gradient = stops((u) => discoveryRamp(u));
  // Rank key: each date's percentile among artists' final average dates.
  const gradientRank = stops((u) => discoveryRamp(cdf(startDay + u * Math.max(1, N - 1 - startDay))));
  return { N, lo, start: startDay, gradient, gradientRank, days, cum, cumDV, first, maxEver, maxRecent, cx: smooth(rawX), cy: smooth(rawY), cx2: allX, cy2: allY, metric };
}

// Listening that is mostly old is cool and dark; mostly recent is warm and bright.
const DISCOVERY_STOPS = [[67, 56, 202], [192, 38, 211], [251, 146, 60], [253, 224, 71]];
function discoveryRamp(f) {
  const x = Math.max(0, Math.min(1, f)) * (DISCOVERY_STOPS.length - 1);
  const i = Math.min(DISCOVERY_STOPS.length - 2, Math.floor(x));
  const u = x - i;
  const [a, b] = [DISCOVERY_STOPS[i], DISCOVERY_STOPS[i + 1]];
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * u)).join(",")})`;
}

/**
 * Recency colours at time t from each artist's minutes/plays-weighted average listening date *up to t*.
 *  - "abs":  the colour of that date on the fixed timeline (start -> end of the range), the same key the
 *            time slider is painted with. Yellow only appears once the animation reaches late dates.
 *  - "rank": the date ranked against the other artists heard so far, so the whole ramp is always in use
 *            and artists you stop playing cool relative to everyone else.
 * Cached per day so redraws are cheap.
 */
function tasteRecencyColors(data, t, mode = "abs") {
  const d = Math.floor(t);
  if (data.recCache && data.recCache.d === d && data.recCache.mode === mode) return data.recCache.colors;
  const K = data.days.length;
  const mean = new Float64Array(K).fill(NaN);
  const heard = [];
  for (let k = 0; k < K; k++) {
    const dd = data.days[k];
    if (!dd.length || dd[0] > d) continue;
    let lo = 0, hi = dd.length; // rows with day <= d
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (dd[mid] <= d) lo = mid + 1;
      else hi = mid;
    }
    const total = data.cum[k][lo - 1];
    if (total > 0) {
      mean[k] = data.cumDV[k][lo - 1] / total;
      heard.push(k);
    }
  }
  const colors = new Array(K).fill("#8b7aa8");
  if (mode === "rank") {
    heard.sort((a, b) => mean[a] - mean[b]);
    heard.forEach((k, r) => (colors[k] = discoveryRamp(heard.length > 1 ? r / (heard.length - 1) : 1)));
  } else {
    const span = Math.max(1, data.N - 1 - data.start);
    for (const k of heard) colors[k] = discoveryRamp((mean[k] - data.start) / span);
  }
  data.recCache = { d, mode, colors };
  return colors;
}

/** Dot colour under the current Color setting. */
function tasteNodeColor(data, n, k) {
  return tasteMap.color === "tag" ? n.color : tasteMap.recColors[k];
}

/** Minutes/plays through (fractional) day x for node k, linearly interpolated across the next day. */
function tasteCum(data, k, x) {
  const dd = data.days[k], n = dd.length;
  if (!n) return 0;
  const cc = data.cum[k];
  const fx = Math.floor(x), frac = x - fx;
  let lo = 0, hi = n; // rows with day <= fx
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dd[mid] <= fx) lo = mid + 1;
    else hi = mid;
  }
  const P = lo ? cc[lo - 1] : 0;
  const next = lo < n && dd[lo] === fx + 1 ? cc[lo] - P : 0;
  return P + next * frac;
}

function tasteValue(data, k, t) {
  return tasteMap.mode === "ever" ? tasteCum(data, k, t) : tasteCum(data, k, t) - tasteCum(data, k, t - TASTE_TRAIL_DAYS);
}

function tasteResize() {
  const canvas = document.getElementById("c-map");
  const host = canvas.parentElement;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  tasteMap.w = host.clientWidth;
  tasteMap.h = host.clientHeight;
  canvas.width = Math.round(tasteMap.w * dpr);
  canvas.height = Math.round(tasteMap.h * dpr);
  tasteMap.ctx = canvas.getContext("2d");
  tasteMap.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (tasteMap.layout) tasteMap.view = tasteFitView(tasteMap.w, tasteMap.h);
}

/**
 * Wheel-zoom (about the cursor), drag-pan and double-click-to-reset for a map canvas. `holder.zoom` is
 * {k, x, y}. Returns `{ dragged() }` so click handlers can ignore the end of a drag.
 */
function wirePanZoom(canvas, holder, redraw, resetBtn, tip) {
  holder.zoom = holder.zoom || { k: 1, x: 0, y: 0 };
  const sync = () => {
    const z = holder.zoom;
    if (resetBtn) resetBtn.hidden = z.k === 1 && z.x === 0 && z.y === 0;
    redraw();
  };
  const reset = () => {
    holder.zoom = { k: 1, x: 0, y: 0 };
    sync();
  };
  if (resetBtn) resetBtn.addEventListener("click", reset);
  canvas.addEventListener("dblclick", reset);
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const z = holder.zoom;
    const k2 = Math.max(0.6, Math.min(14, z.k * Math.exp(-e.deltaY * 0.0015)));
    holder.zoom = { k: k2, x: mx - (mx - z.x) * (k2 / z.k), y: my - (my - z.y) * (k2 / z.k) };
    if (tip) tip.hidden = true;
    sync();
  }, { passive: false });
  let drag = null, wasDrag = false;
  canvas.addEventListener("pointerdown", (e) => {
    drag = { px: e.clientX, py: e.clientY, x: holder.zoom.x, y: holder.zoom.y };
    wasDrag = false;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add("grabbing");
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.px, dy = e.clientY - drag.py;
    if (!wasDrag && Math.hypot(dx, dy) < 3) return;
    wasDrag = true;
    if (tip) tip.hidden = true;
    holder.zoom = { k: holder.zoom.k, x: drag.x + dx, y: drag.y + dy };
    sync();
  });
  const end = () => {
    drag = null;
    canvas.classList.remove("grabbing");
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  return { dragged: () => wasDrag };
}

/** Fit the layout into a w x h canvas (shared by the map and the daily walk). */
function tasteFitView(w, h) {
  const L = tasteLayout();
  const padX = 50,
    top = Math.max(80, h * 0.2),
    bottom = 28;
  const s = Math.min((w - 2 * padX) / Math.max(1, L.maxX - L.minX), (h - top - bottom) / Math.max(1, L.maxY - L.minY));
  return {
    s,
    ox: w / 2 - ((L.minX + L.maxX) / 2) * s,
    oy: top + (h - top - bottom) / 2 - ((L.minY + L.maxY) / 2) * s,
  };
}

/** Layout coords -> canvas px, clamping far-flung artists to the drawable area. */
function tasteProject(n, v, w, h, clamp = true) {
  const x = n.x * v.s + v.ox, y = n.y * v.s + v.oy;
  if (!clamp) return [x, y];
  return [Math.min(w - 18, Math.max(18, x)), Math.min(h - 14, Math.max(Math.max(80, h * 0.2) - 6, y))];
}

/* ---------- Daily map walk (canvas) ----------
 * One day or week of plays as a dot hopping between artists on the taste map. */

const walk = {
  events: [],
  p: 0, // position in the event list
  playing: false,
  raf: 0,
  last: 0,
  duration: 30, // seconds for the whole walk
  ctx: null,
  w: 0,
  h: 0,
  view: null,
  byDay: null,
  scrubbing: false,
  span: 1,
  cnt: null,
  cntTo: -1,
  cntEvents: null,
  distinct: 0,
  maxCount: 8,
  zoom: { k: 1, x: 0, y: 0 },
  hover: -1,
  totals: new Map(),
  labels: "reactive", // genre labels on the walk: off | steady | reactive
  zonesDrawn: [],
};

/** Layout coords -> walk canvas px, with the walk's own pan/zoom (nothing is clamped, so you can pan to outliers). */
function walkPt(n) {
  const [x, y] = tasteProject(n, walk.view, walk.w, walk.h, false);
  const z = walk.zoom;
  return [x * z.k + z.x, y * z.k + z.y];
}

const walkAvailable = () => tasteAvailable() && (DATA.map_walk || []).length > 0;

function walkBuild() {
  walk.byDay = walk.byDay || new Map(DATA.map_walk.map(([d, flat]) => [d, flat]));
  const start = dayStrToOff(document.getElementById("walk-date").value);
  const span = +document.getElementById("walk-span").value;
  walk.span = span;
  const events = [];
  if (span === 0) {
    // All time: every play by the top artists, in order.
    for (const [d, flat] of DATA.map_walk) for (let j = 0; j < flat.length; j += 2) events.push({ day: d, min: flat[j], k: flat[j + 1] });
  } else for (let d = start; d < start + span; d++) {
    const flat = walk.byDay.get(d);
    if (flat) for (let j = 0; j < flat.length; j += 2) events.push({ day: d, min: flat[j], k: flat[j + 1] });
  }
  walk.events = events;
  walk.p = 0;
  const per = new Map();
  for (const e of events) per.set(e.k, (per.get(e.k) || 0) + 1);
  walk.maxCount = Math.max(8, ...per.values());
  walk.totals = per;
}

/** Per-artist play counts up to event `i`, updated incrementally so a 150k-play walk stays cheap. */
function walkCounts(i) {
  const n = tasteLayout().nodes.length;
  if (!walk.cnt || walk.cnt.length !== n || walk.cntEvents !== walk.events || i < walk.cntTo) {
    walk.cnt = new Int32Array(n);
    walk.cntTo = -1;
    walk.distinct = 0;
    walk.cntEvents = walk.events;
  }
  for (let j = walk.cntTo + 1; j <= i; j++) {
    if (walk.cnt[walk.events[j].k]++ === 0) walk.distinct++;
  }
  walk.cntTo = Math.max(walk.cntTo, i);
  return walk.cnt;
}

function walkResize() {
  const canvas = document.getElementById("c-walk");
  const host = canvas.parentElement;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  walk.w = host.clientWidth;
  walk.h = host.clientHeight;
  canvas.width = Math.round(walk.w * dpr);
  canvas.height = Math.round(walk.h * dpr);
  walk.ctx = canvas.getContext("2d");
  walk.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  walk.view = walk.w ? tasteFitView(walk.w, walk.h) : null;
}

const walkClock = (ev) => {
  const day = new Date(offToDayStr(ev.day) + "T00:00:00Z");
  const h = Math.floor(ev.min / 60),
    m = ev.min % 60;
  const dayTxt = day.toLocaleDateString(undefined, { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", ...(walk.span === 1 ? {} : { year: "numeric" }) });
  return `${dayTxt} · ${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

function drawWalk() {
  const ctx = walk.ctx;
  if (!ctx || !walk.view) return;
  const { w, h, events: ev } = walk;
  const L = tasteLayout();
  const xy = (k) => walkPt(L.nodes[k]);
  const zs = Math.max(1, Math.min(3, Math.sqrt(walk.zoom.k)));
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#12061f";
  ctx.fillRect(0, 0, w, h);
  const fs = Math.max(11, Math.min(15, w / 66));

  const n = ev.length;
  const p = Math.max(0, Math.min(walk.p, Math.max(0, n - 1)));
  const i = Math.floor(p),
    f = p - i;
  const ease = f * f * (3 - 2 * f);
  const cnt = walkCounts(Math.min(i, n - 1));

  ctx.globalAlpha = 0.16;
  for (const node of L.nodes) {
    const [x, y] = walkPt(node);
    ctx.fillStyle = node.color;
    ctx.beginPath();
    ctx.arc(x, y, 2.4 * zs, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (!n) {
    ctx.fillStyle = "#c9b8e0";
    ctx.font = `${fs + 2}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("No plays by your top artists in this period. Try another date.", w / 2, h / 2);
    return;
  }

  for (let k = 0; k < cnt.length; k++) {
    const c = cnt[k];
    if (!c) continue;
    const [x, y] = xy(k);
    ctx.fillStyle = L.nodes[k].color;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(x, y, (3 + 17 * Math.sqrt(c / walk.maxCount)) * zs, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Genre labels. Only genres the walk has visited get a name. *Reactive* weights the last ~40 hops
  // (halving every 8 plays), so the genre you are in right now is large and bright, the ones you just
  // left fade, and the rest recede; *steady* shows every visited genre at one moderate strength.
  walk.zonesDrawn = [];
  if (walk.labels !== "off" && L.regions) {
    const reactive = walk.labels === "reactive";
    const visited = new Set();
    for (let k = 0; k < cnt.length; k++) if (cnt[k] && L.nodes[k].tag) visited.add(L.nodes[k].tag);
    const recent = new Map();
    let top = 1e-9;
    if (reactive) {
      for (let j = Math.min(i, n - 1); j >= Math.max(0, i - 40); j--) {
        const tg = L.nodes[ev[j].k].tag;
        if (tg) recent.set(tg, (recent.get(tg) || 0) + Math.pow(0.5, (i - j + f) / 8));
      }
      for (const v of recent.values()) top = Math.max(top, v);
    }
    const score = (tg) => (reactive ? Math.sqrt((recent.get(tg) || 0) / top) : 1);
    const zBase = Math.max(13, Math.min(24, w / 46)) * Math.min(2.2, Math.sqrt(walk.zoom.k));
    const maxCount = L.regions.reduce((m, r) => Math.max(m, r.count), 1);
    const taken = [];
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    const order = L.regions.filter((r) => visited.has(r.tag)).sort((p, q) => (reactive ? score(q.tag) - score(p.tag) : q.count - p.count));
    for (const r of order) {
      const sc = score(r.tag);
      const fade = reactive ? 0.1 + 0.9 * sc : 0.6;
      if (fade < 0.08) continue;
      const [x, y] = walkPt(r);
      if (x < -60 || x > w + 60 || y < 70 || y > h + 20) continue;
      const zf = zBase * (0.72 + 0.5 * Math.sqrt(r.count / maxCount)) * (reactive ? 0.8 + 0.55 * sc : 1);
      ctx.font = `800 ${zf}px Inter, system-ui, sans-serif`;
      ctx.lineWidth = Math.max(3, zf / 4.5);
      const tw = ctx.measureText(r.tag).width;
      let placed = null;
      for (const dy of [0, -1.15, 1.15, -2.3, 2.3]) {
        const yy = y + dy * zf;
        const bx = { x0: x - tw / 2, x1: x + tw / 2, y0: yy - zf / 2, y1: yy + zf / 2 };
        if (yy < 76 || yy > h - 8) continue;
        if (!taken.some((b) => bx.x0 < b.x1 && bx.x1 > b.x0 && bx.y0 < b.y1 && bx.y1 > b.y0)) {
          placed = { bx, yy };
          break;
        }
      }
      if (!placed) continue;
      taken.push(placed.bx);
      walk.zonesDrawn.push(r.tag);
      ctx.globalAlpha = fade;
      ctx.strokeStyle = "rgba(18,6,31,0.92)";
      ctx.strokeText(r.tag, x, placed.yy);
      ctx.fillStyle = r.color;
      ctx.fillText(r.tag, x, placed.yy);
      ctx.globalAlpha = 1;
    }
    ctx.textBaseline = "alphabetic";
  }

  if (walk.hover >= 0) {
    const [hx, hy] = xy(walk.hover);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hx, hy, 10 * zs, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Fading trail of the last hops, ending at the moving head.
  // The faster the walk, the longer the trail, so it still reads as a path at high speed.
  const TRAIL = Math.min(600, Math.max(14, Math.round((n / walk.duration) * 0.5)));
  const [hx0, hy0] = xy(ev[i].k);
  const [hx1, hy1] = xy(ev[Math.min(i + 1, n - 1)].k);
  const hx = hx0 + (hx1 - hx0) * ease,
    hy = hy0 + (hy1 - hy0) * ease;
  ctx.lineWidth = TRAIL > 60 ? 1.1 : 2.2;
  ctx.lineCap = "round";
  for (let j = Math.max(0, i - TRAIL); j < i; j++) {
    const [ax, ay] = xy(ev[j].k),
      [bx, by] = xy(ev[j + 1].k);
    ctx.strokeStyle = L.nodes[ev[j + 1].k].color;
    ctx.globalAlpha = 0.12 + 0.7 * ((j - (i - TRAIL)) / TRAIL);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  ctx.strokeStyle = L.nodes[ev[Math.min(i + 1, n - 1)].k].color;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(hx0, hy0);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.shadowColor = "#fff";
  ctx.shadowBlur = 16;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(hx, hy, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const cur = ev[f > 0.5 ? Math.min(i + 1, n - 1) : i];
  const [lx, ly] = xy(cur.k);
  ctx.font = `600 ${fs + 1}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#f3e8ff";
  ctx.fillText(L.nodes[cur.k].name, Math.min(w - 80, Math.max(80, lx)), ly - 16);

  ctx.textAlign = "left";
  ctx.fillStyle = "#c9b8e0";
  ctx.font = `${fs + 1}px Inter, system-ui, sans-serif`;
  ctx.fillText("Your path across the map, one play at a time", 14, 26);
  ctx.fillStyle = "#fff";
  const big = Math.max(22, Math.min(40, w / 28));
  ctx.font = `600 ${big}px Fraunces, Georgia, serif`;
  ctx.fillText(walkClock(cur), 14, 26 + big + 4);
  ctx.textAlign = "right";
  ctx.fillStyle = "#c9b8e0";
  ctx.font = `${fs + 1}px Inter, system-ui, sans-serif`;
  ctx.fillText(`play ${Math.min(n, (f > 0.5 ? i + 1 : i) + 1)} of ${n} · ${walk.distinct} artists`, w - 14, 26);
}

function walkSync() {
  const n = walk.events.length;
  const scrub = document.getElementById("walk-scrub");
  scrub.max = String(Math.max(0, n - 1));
  if (!walk.scrubbing) scrub.value = String(walk.p);
  const playBtn = document.getElementById("walk-play");
  playBtn.textContent = walk.playing ? "Pause" : "Play";
  playBtn.disabled = n < 2; // nothing to hop between on days with fewer than two plays
  playBtn.title = n < 2 ? "Needs at least two plays in this period" : "";
}

function walkFrame(now) {
  if (!walk.playing) return;
  const dt = Math.max(0, Math.min((now - walk.last) / 1000, 0.1)); // never negative
  walk.last = now;
  const end = Math.max(0, walk.events.length - 1);
  walk.p = Math.max(0, Math.min(end, walk.p + (end / walk.duration) * dt));
  if (walk.p >= end) walk.playing = false;
  drawWalk();
  walkSync();
  if (walk.playing) walk.raf = requestAnimationFrame(walkFrame);
}

function walkPlay(fromStart) {
  if (walk.events.length < 2) return;
  if (fromStart || walk.p >= walk.events.length - 1) walk.p = 0;
  walk.playing = true;
  walk.last = performance.now();
  cancelAnimationFrame(walk.raf);
  walk.raf = requestAnimationFrame(walkFrame);
  walkSync();
}

function walkPause() {
  walk.playing = false;
  cancelAnimationFrame(walk.raf);
  walkSync();
}

function renderWalk() {
  const card = document.getElementById("walk-card");
  card.hidden = !walkAvailable();
  if (card.hidden) return;
  walkPause();
  const days = DATA.map_walk.map((r) => r[0]);
  const input = document.getElementById("walk-date");
  input.min = offToDayStr(days[0]);
  input.max = offToDayStr(days[days.length - 1]);
  if (!input.value) input.value = input.max;
  walkBuild();
  walkResize();
  drawWalk();
  walkSync();
}

function wireWalk() {
  const input = document.getElementById("walk-date");
  const rebuild = () => {
    walkPause();
    walkBuild();
    drawWalk();
    walkSync();
  };
  input.addEventListener("change", rebuild);
  const syncSpan = () => {
    const all = +document.getElementById("walk-span").value === 0;
    for (const id of ["walk-date", "walk-prev", "walk-next"]) document.getElementById(id).disabled = all;
  };
  document.getElementById("walk-span").addEventListener("change", () => {
    syncSpan();
    rebuild();
  });
  const step = (dir) => {
    if (!input.value) return;
    input.value = offToDayStr(dayStrToOff(input.value) + dir);
    rebuild();
  };
  document.getElementById("walk-prev").addEventListener("click", () => step(-1));
  document.getElementById("walk-next").addEventListener("click", () => step(1));
  document.getElementById("walk-play").addEventListener("click", () => (walk.playing ? walkPause() : walkPlay(false)));
  document.getElementById("walk-restart").addEventListener("click", () => walkPlay(true));
  document.getElementById("walk-speed").addEventListener("change", (e) => (walk.duration = +e.target.value));
  walk.duration = +document.getElementById("walk-speed").value;
  walk.labels = document.getElementById("walk-labels").value;
  document.getElementById("walk-labels").addEventListener("change", (e) => {
    walk.labels = e.target.value;
    drawWalk();
  });
  const scrub = document.getElementById("walk-scrub");
  scrub.addEventListener("input", (e) => {
    walk.p = +e.target.value;
    walkPause();
    drawWalk();
  });
  scrub.addEventListener("pointerdown", () => (walk.scrubbing = true));
  window.addEventListener("pointerup", () => (walk.scrubbing = false));
  window.addEventListener("pointercancel", () => (walk.scrubbing = false));
  const canvas = document.getElementById("c-walk");
  const tip = document.getElementById("walk-tip");
  const pz = wirePanZoom(canvas, walk, () => { if (!walk.playing) drawWalk(); }, document.getElementById("walk-reset"), tip);
  canvas.addEventListener("mousemove", (e) => {
    if (e.buttons || !walk.view) return;
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const L = tasteLayout();
    let best = -1, bd = 12 * 12;
    L.nodes.forEach((n, k) => {
      const [x, y] = walkPt(n);
      const dd = (x - mx) ** 2 + (y - my) ** 2;
      if (dd < bd) { bd = dd; best = k; }
    });
    if (best !== walk.hover) {
      walk.hover = best;
      if (!walk.playing) drawWalk();
    }
    if (best < 0) return void (tip.hidden = true);
    const a = DATA.artists[L.nodes[best].i];
    const so = walk.cnt ? walk.cnt[best] : 0, tot = walk.totals.get(best) || 0;
    tip.innerHTML =
      `<strong>${escHtml(L.nodes[best].name)}</strong>${a.g !== undefined ? ` <span class="web-tags">· ${escHtml(DATA.genres[a.g])}</span>` : ""}<br>${tot ? `${so} of ${tot} plays so far in this walk` : "Not played in this walk"}` +
      (tot ? `<br><span class="web-tags">Click to jump to its next play</span>` : "") +
      (a.tags && a.tags.length ? `<br><span class="web-tags">${escHtml(a.tags.join(" · "))}</span>` : "");
    tip.hidden = false;
    placeTip(tip, mx, my, r.width, r.height);
  });
  canvas.addEventListener("mouseleave", () => {
    walk.hover = -1;
    tip.hidden = true;
    if (!walk.playing) drawWalk();
  });
  // Click a dot to jump to that artist's next play (wrapping to its first).
  canvas.addEventListener("click", () => {
    if (pz.dragged() || walk.hover < 0 || walk.events.length < 2) return;
    const ev = walk.events, cur = Math.floor(walk.p);
    let j = -1;
    for (let i = cur + 1; i < ev.length && j < 0; i++) if (ev[i].k === walk.hover) j = i;
    for (let i = 0; i <= cur && j < 0; i++) if (ev[i].k === walk.hover) j = i;
    if (j < 0) return;
    walk.p = j;
    walkPause();
    drawWalk();
    walkSync();
  });
  const host = canvas.parentElement;
  if ("ResizeObserver" in window) {
    new ResizeObserver(() => {
      if (host.clientWidth && (host.clientWidth !== walk.w || host.clientHeight !== walk.h)) {
        walkResize();
        drawWalk();
      }
    }).observe(host);
  }
}

// The map itself is pannable/zoomable, so nothing is clamped to the canvas edge (the walk and compare views still clamp).
const tasteXY = (n) => {
  const [x, y] = tasteProject(n, tasteMap.view, tasteMap.w, tasteMap.h, false);
  const z = tasteMap.zoom;
  return [x * z.k + z.x, y * z.k + z.y];
};
/** How much dots grow with zoom (gently, so zooming in separates them without huge blobs). */
const tasteDotScale = () => Math.max(1, Math.min(3, Math.sqrt(tasteMap.zoom.k)));

function drawTasteMap() {
  const ctx = tasteMap.ctx, data = tasteMap.data;
  if (!ctx) return;
  const { w, h } = tasteMap;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#12061f";
  ctx.fillRect(0, 0, w, h);
  if (!data || !tasteMap.view) return;

  const L = tasteMap.layout;
  const zs = tasteDotScale();
  const t = Math.min(Math.max(tasteMap.t, data.start), data.N - 1);
  tasteMap.recColors = tasteMap.color === "tag" ? null : tasteRecencyColors(data, t, tasteMap.color === "rank" ? "rank" : "abs");
  const d = Math.floor(t);
  const ever = tasteMap.mode === "ever";
  const maxVal = ever ? data.maxEver : data.maxRecent;
  const fs = Math.max(11, Math.min(15, w / 66));

  const showNames = tasteMap.labels === "artists" || tasteMap.labels === "both";
  const showZones = tasteMap.labels === "zones" || tasteMap.labels === "both";

  if (tasteMap.overlay === "explore") {
    // Explored territory glows; the dark gaps are what you haven't visited yet.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.13;
    const many = L.nodes.length > 1500; // thousands of per-frame gradients would crawl; flat discs are cheap
    L.nodes.forEach((n, k) => {
      if (!(data.first[k] <= t)) return;
      const [x, y] = tasteXY(n);
      if (many) {
        ctx.globalAlpha = 0.035;
        ctx.fillStyle = tasteNodeColor(data, n, k);
        ctx.beginPath();
        ctx.arc(x, y, 34 * zs, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      const g = ctx.createRadialGradient(x, y, 0, x, y, 50 * zs);
      g.addColorStop(0, tasteNodeColor(data, n, k));
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 50 * zs, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  const live = [];
  L.nodes.forEach((n, k) => {
    const [x, y] = tasteXY(n);
    const v = tasteValue(data, k, t);
    const heard = data.first[k] <= t;
    const active = ever ? heard : v > 0.05;
    const base = (2.2 + 12 * Math.sqrt(Math.max(0, v) / maxVal)) * zs;
    if (!active) {
      // Ghost: part of the map but not lit (never heard yet, or quiet right now).
      if (!heard && tasteMap.ghosts === "hide") return;
      ctx.globalAlpha = heard ? 0.3 : 0.1;
      ctx.fillStyle = heard ? tasteNodeColor(data, n, k) : "#c9b8e0";
      ctx.beginPath();
      ctx.arc(x, y, (heard ? 2.6 : 2) * zs, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }
    live.push({ n, k, x, y, v });
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = tasteNodeColor(data, n, k);
    ctx.beginPath();
    ctx.arc(x, y, base, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    const age = t - data.first[k];
    if (ever && age >= 0 && age < TASTE_PULSE_DAYS) {
      ctx.strokeStyle = tasteNodeColor(data, n, k);
      ctx.globalAlpha = 1 - age / TASTE_PULSE_DAYS;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, base + (age / TASTE_PULSE_DAYS) * 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  });

  // Names for the biggest lit artists (skip ones that would overlap).
  live.sort((a, b) => b.v - a.v);
  ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
  ctx.textBaseline = "alphabetic";
  const boxes = [];
  ctx.textAlign = "center";
  if (showZones) {
    // Genre names: big, bold and outlined so they read over the dots; biggest clusters get first pick of space.
    const zBase = Math.max(13, Math.min(24, w / 46)) * Math.min(2.2, Math.sqrt(tasteMap.zoom.k));
    const maxCount = L.regions.reduce((m, r) => Math.max(m, r.count), 1);
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    const scale = L.regions.reduce((m, r) => Math.max(m, r.spread), 1);
    const priority = (r) => r.count / (r.spread / scale + 0.08);
    tasteMap.zonesDrawn = [];
    // A genre's name only appears once its cluster has lit up: >= 3 lit artists and 15% of its members,
    // fading in as it fills (lit = heard so far, or active in the last 30 days in that mode).
    const litByTag = new Map();
    for (const p of live) litByTag.set(p.n.tag, (litByTag.get(p.n.tag) || 0) + 1);
    // Reactive mode: how much of the last 30 days of listening belongs to each genre (0..1, square-rooted
    // so mid-sized genres stay legible). Relevant genres grow, brighten and win label space; idle ones fade.
    let zoneScore = () => 1;
    if (tasteMap.zoneMode === "reactive") {
      if (!(data.zoneCache && data.zoneCache.d === Math.floor(t))) {
        const byTag = new Map();
        let tot = 0;
        L.nodes.forEach((n, k) => {
          if (!n.tag) return;
          const r = tasteCum(data, k, t) - tasteCum(data, k, t - TASTE_TRAIL_DAYS);
          if (r > 0) {
            byTag.set(n.tag, (byTag.get(n.tag) || 0) + r);
            tot += r;
          }
        });
        const mx = Math.max(1e-9, ...[...byTag.values()].map((v) => v / Math.max(tot, 1e-9)));
        data.zoneCache = { d: Math.floor(t), score: (tag) => (tot > 0 ? Math.sqrt((byTag.get(tag) || 0) / tot / mx) : 0) };
      }
      zoneScore = data.zoneCache.score;
    }
    tasteMap.zoneScores = {};
    const prio = (r) => priority(r) * (tasteMap.zoneMode === "reactive" ? 0.2 + zoneScore(r.tag) : 1);
    for (const r of [...L.regions].sort((p, q) => prio(q) - prio(p))) {
      const lit = litByTag.get(r.tag) || 0, frac = lit / r.count;
      const sc = zoneScore(r.tag);
      tasteMap.zoneScores[r.tag] = sc;
      if (lit < 3 || frac < 0.15) continue;
      const reactive = tasteMap.zoneMode === "reactive";
      const fade = Math.min(1, 0.3 + (frac - 0.15) / 0.35) * (reactive ? 0.1 + 0.9 * sc : 1);
      if (fade < 0.07) continue;
      const [x, y] = tasteXY(r);
      if (x < -60 || x > w + 60 || y < 70 || y > h + 20) continue;
      const zf = zBase * (0.72 + 0.5 * Math.sqrt(r.count / maxCount)) * (reactive ? 0.8 + 0.55 * sc : 1); // bigger clusters, bigger names; in reactive mode, current genres grow
      ctx.font = `800 ${zf}px Inter, system-ui, sans-serif`;
      ctx.lineWidth = Math.max(3, zf / 4.5);
      const tw = ctx.measureText(r.tag).width;
      // Blocked? Try nudging up/down a little before giving up (small clusters would otherwise vanish).
      let placed = null;
      for (const dy of [0, -1.15, 1.15, -2.3, 2.3]) {
        const yy = y + dy * zf;
        const bx = { x0: x - tw / 2, x1: x + tw / 2, y0: yy - zf / 2, y1: yy + zf / 2 };
        if (yy < 76 || yy > h - 8) continue;
        if (!boxes.some((b) => bx.x0 < b.x1 && bx.x1 > b.x0 && bx.y0 < b.y1 && bx.y1 > b.y0)) {
          placed = { bx, yy };
          break;
        }
      }
      if (!placed) continue;
      boxes.push(placed.bx);
      tasteMap.zonesDrawn.push(r.tag);
      ctx.globalAlpha = fade;
      ctx.strokeStyle = "rgba(18,6,31,0.92)";
      ctx.strokeText(r.tag, x, placed.yy);
      ctx.fillStyle = tasteMap.color === "tag" ? r.color : "#f3e8ff"; // keeps its genre colour; focus comes from size and opacity
      ctx.fillText(r.tag, x, placed.yy);
      ctx.globalAlpha = 1;
    }
    ctx.textBaseline = "alphabetic";
    ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
  }
  for (const p of showNames ? live.slice(0, 14) : []) {
    if (p.x < -20 || p.x > w + 20 || p.y < 76 || p.y > h + 20) continue; // off screen, or under the title/date/counter
    const tw = ctx.measureText(p.n.name).width;
    const lx = Math.min(Math.max(p.x, tw / 2 + 6), w - tw / 2 - 6); // keep the whole name on the canvas
    const bx = { x0: lx - tw / 2, x1: lx + tw / 2, y0: p.y - 22, y1: p.y - 8 };
    if (boxes.some((b) => bx.x0 < b.x1 && bx.x1 > b.x0 && bx.y0 < b.y1 && bx.y1 > b.y0)) continue;
    boxes.push(bx);
    ctx.fillStyle = "#f3e8ff";
    ctx.fillText(p.n.name, lx, p.y - 12);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  if (tasteMap.overlay === "trail" || tasteMap.overlay === "trailAll") {
    const CX = tasteMap.overlay === "trailAll" ? data.cx2 : data.cx;
    const CY = tasteMap.overlay === "trailAll" ? data.cy2 : data.cy;
    const last = Math.max(data.start + 1, d);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    let prev = null;
    for (let i = data.start; i <= d; i += 2) {
      const pt = tasteXY({ x: CX[i], y: CY[i] });
      if (prev) {
        const f = (i - data.start) / (last - data.start);
        ctx.strokeStyle = `hsl(${220 + 110 * f} 85% 66%)`;
        ctx.globalAlpha = 0.12 + 0.85 * f * f;
        ctx.beginPath();
        ctx.moveTo(prev[0], prev[1]);
        ctx.lineTo(pt[0], pt[1]);
        ctx.stroke();
      }
      prev = pt;
    }
    ctx.globalAlpha = 1;
    const d1 = Math.min(d + 1, data.N - 1), fr = t - d;
    const [hx, hy] = tasteXY({ x: CX[d] + (CX[d1] - CX[d]) * fr, y: CY[d] + (CY[d1] - CY[d]) * fr });
    ctx.save();
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(hx, hy, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  const hv = tasteMap.hover >= 0 ? L.nodes[tasteMap.hover] : null;
  if (hv) {
    const [x, y] = tasteXY(hv);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.textAlign = "left";
  ctx.fillStyle = "#c9b8e0";
  ctx.font = `${fs + 1}px Inter, system-ui, sans-serif`;
  ctx.fillText(
    ever ? `Artists you've heard so far · similar artists sit closer` : `Artists played in the last ${TASTE_TRAIL_DAYS} days · similar artists sit closer`,
    14, 26
  );
  ctx.fillStyle = "#fff";
  const big = Math.max(24, Math.min(46, w / 24));
  ctx.font = `600 ${big}px Fraunces, Georgia, serif`;
  ctx.fillText(
    new Date(offToDayStr(data.lo + d) + "T00:00:00Z").toLocaleDateString(undefined, { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" }),
    14, 26 + big + 4
  );
  const heardCount = ever ? data.first.filter((f) => f <= t).length : live.length;
  ctx.fillStyle = "#c9b8e0";
  ctx.font = `${fs + 1}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "right";
  ctx.fillText(`${heardCount} of ${L.nodes.length} artists ${ever ? "discovered" : "active"}`, w - 14, 26);
}

function tasteSync() {
  const N = tasteMap.data ? tasteMap.data.N : 1;
  const scrub = document.getElementById("map-scrub");
  scrub.min = String(tasteMap.data ? tasteMap.data.start : 0);
  scrub.max = String(N - 1);
  if (!tasteMap.scrubbing) scrub.value = String(tasteMap.t);
  document.getElementById("map-play").textContent = tasteMap.playing ? "Pause" : "Play";
}

function tasteFrame(now) {
  if (!tasteMap.playing || !tasteMap.data) return;
  const dt = Math.max(0, Math.min((now - tasteMap.last) / 1000, 0.1));
  tasteMap.last = now;
  const end = tasteMap.data.N - 1;
  tasteMap.t = Math.min(end, tasteMap.t + ((end - tasteMap.data.start) / tasteMap.speed) * dt);
  if (tasteMap.t >= end) tasteMap.playing = false;
  drawTasteMap();
  tasteSync();
  if (tasteMap.playing) tasteMap.raf = requestAnimationFrame(tasteFrame);
}

function tastePlay(fromStart) {
  if (!tasteMap.data) return;
  tasteMap.pending = false;
  if (fromStart || tasteMap.t >= tasteMap.data.N - 1) tasteMap.t = tasteMap.data.start;
  tasteMap.playing = true;
  tasteMap.last = performance.now();
  cancelAnimationFrame(tasteMap.raf);
  tasteMap.raf = requestAnimationFrame(tasteFrame);
  tasteSync();
}

function tastePause() {
  tasteMap.playing = false;
  cancelAnimationFrame(tasteMap.raf);
  tasteSync();
}

/** Colour key above the map for the current Color setting; also paints the time slider to match. */
function renderTasteLegend() {
  const el = document.getElementById("map-legend");
  const scrub = document.getElementById("map-scrub");
  const data = tasteMap.data;
  const timeColored = tasteMap.color !== "tag" && data;
  scrub.classList.toggle("colored", !!timeColored);
  if (timeColored) {
    const rank = tasteMap.color === "rank";
    const grad = rank ? data.gradientRank : data.gradient;
    scrub.style.setProperty("--track-bg", grad);
    const what = metric === "plays" ? "plays" : "minutes";
    el.innerHTML = rank
      ? `<span>Listening centred</span><span>earlier</span><i class="map-grad" style="background:${grad}"></i><span>more recently</span>` +
        `<span class="map-legend-note">(each artist's average ${what} date so far, ranked against the others)</span>`
      : `<span>Average date of your ${what} per artist, so far:</span><i class="map-grad" style="background:${grad}"></i>` +
        `<span class="map-legend-note">(colours match the dates on the time slider)</span>`;
    return;
  }
  scrub.style.removeProperty("--track-bg");
  el.innerHTML =
    tasteMap.layout.legend.map((l) => `<span><i style="background:${l.color}"></i>${escHtml(l.tag)}</span>`).join("") +
    (tasteMap.layout.legendMore ? `<span class="map-legend-note">+${tasteMap.layout.legendMore} more genres (see Labels: genres)</span>` : "") +
    `<span><i style="background:#8b7aa8"></i>unclassified</span>`;
}

function renderTasteMap() {
  const card = document.getElementById("c-map").closest(".chart-card");
  card.hidden = !tasteAvailable();
  document.getElementById("taste-section").hidden = card.hidden;
  document.getElementById("toc-taste").hidden = card.hidden;
  if (card.hidden) return;
  tastePause();
  tasteMap.data = buildTasteData();
  tasteMap.t = tasteMap.data ? tasteMap.data.start : 0;
  tasteResize();
  drawTasteMap();
  tasteSync();
  renderDateTicks(document.getElementById("map-ticks"), tasteMap.data);
  renderTasteLegend();
  if (!tasteMap.data) return;
  tasteMap.t = tasteMap.data.N - 1;
  drawTasteMap();
  tasteSync();
}

function wireTasteMap() {
  tasteMap.speed = +document.getElementById("map-speed").value;
  tasteMap.mode = document.getElementById("map-mode").value;
  tasteMap.labels = document.getElementById("map-labels").value;
  tasteMap.ghosts = document.getElementById("map-ghosts").value;
  tasteMap.layoutMode = document.getElementById("map-layout").value;
  tasteMap.zoneMode = document.getElementById("map-zonemode").value;
  tasteMap.color = document.getElementById("map-color").value;
  tasteMap.overlay = document.getElementById("map-overlay").value;
  document.getElementById("map-play").addEventListener("click", () => (tasteMap.playing ? tastePause() : tastePlay(false)));
  document.getElementById("map-restart").addEventListener("click", () => tastePlay(true));
  document.getElementById("map-speed").addEventListener("change", (e) => (tasteMap.speed = +e.target.value));
  document.getElementById("map-overlay").addEventListener("change", (e) => {
    tasteMap.overlay = e.target.value;
    drawTasteMap();
  });
  document.getElementById("map-color").addEventListener("change", (e) => {
    tasteMap.color = e.target.value;
    renderTasteLegend();
    drawTasteMap();
  });
  document.getElementById("map-zonemode").addEventListener("change", (e) => {
    tasteMap.zoneMode = e.target.value;
    drawTasteMap();
  });
  document.getElementById("map-layout").addEventListener("change", (e) => {
    // A different layout means different coordinates: drop everything derived from them and rebuild.
    tasteMap.layoutMode = e.target.value;
    tastePause();
    walkPause();
    tasteMap.layout = null;
    tasteMap.data = null;
    tasteMap.view = null;
    for (const z of [tasteMap, walk, cmp]) z.zoom = { k: 1, x: 0, y: 0 };
    for (const id of ["map-reset", "walk-reset", "cmp-reset"]) document.getElementById(id).hidden = true;
    renderTasteViews();
  });
  document.getElementById("map-ghosts").addEventListener("change", (e) => {
    tasteMap.ghosts = e.target.value;
    tasteMap.hover = -1;
    drawTasteMap();
  });
  document.getElementById("map-labels").addEventListener("change", (e) => {
    tasteMap.labels = e.target.value;
    drawTasteMap();
  });
  document.getElementById("map-mode").addEventListener("change", (e) => {
    tasteMap.mode = e.target.value;
    drawTasteMap();
  });
  const scrub = document.getElementById("map-scrub");
  scrub.addEventListener("input", (e) => {
    tasteMap.pending = false;
    tasteMap.t = +e.target.value;
    tastePause();
    drawTasteMap();
  });
  scrub.addEventListener("pointerdown", () => (tasteMap.scrubbing = true));
  window.addEventListener("pointerup", () => (tasteMap.scrubbing = false));
  window.addEventListener("pointercancel", () => (tasteMap.scrubbing = false));

  const canvas = document.getElementById("c-map");
  const tip = document.getElementById("map-tip");
  const resetBtn = document.getElementById("map-reset");
  const syncZoom = () => {
    const z = tasteMap.zoom;
    resetBtn.hidden = z.k === 1 && z.x === 0 && z.y === 0;
    if (!tasteMap.playing) drawTasteMap();
  };
  const resetZoom = () => {
    tasteMap.zoom = { k: 1, x: 0, y: 0 };
    syncZoom();
  };
  resetBtn.addEventListener("click", resetZoom);
  canvas.addEventListener("dblclick", resetZoom);
  // Wheel zooms around the cursor; dragging pans.
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const z = tasteMap.zoom;
    const k2 = Math.max(0.6, Math.min(14, z.k * Math.exp(-e.deltaY * 0.0015)));
    tasteMap.zoom = { k: k2, x: mx - (mx - z.x) * (k2 / z.k), y: my - (my - z.y) * (k2 / z.k) };
    tip.hidden = true;
    syncZoom();
  }, { passive: false });
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    drag = { px: e.clientX, py: e.clientY, x: tasteMap.zoom.x, y: tasteMap.zoom.y, moved: false };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add("grabbing");
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.px, dy = e.clientY - drag.py;
    if (!drag.moved && Math.hypot(dx, dy) < 3) return;
    drag.moved = true;
    tip.hidden = true;
    tasteMap.zoom = { k: tasteMap.zoom.k, x: drag.x + dx, y: drag.y + dy };
    syncZoom();
  });
  const endDrag = () => {
    drag = null;
    canvas.classList.remove("grabbing");
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("mousemove", (e) => {
    if (!tasteMap.data || !tasteMap.view || e.buttons) return;
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    let best = -1, bd = 12 * 12;
    tasteMap.layout.nodes.forEach((n, k) => {
      if (tasteMap.ghosts === "hide" && !(tasteMap.data.first[k] <= tasteMap.t)) return; // hidden, so not hoverable
      const [x, y] = tasteXY(n);
      const dd = (x - mx) ** 2 + (y - my) ** 2;
      if (dd < bd) { bd = dd; best = k; }
    });
    if (best !== tasteMap.hover) {
      tasteMap.hover = best;
      if (!tasteMap.playing) drawTasteMap();
    }
    if (best < 0) return void (tip.hidden = true);
    const n = tasteMap.layout.nodes[best], a = DATA.artists[n.i];
    const f = tasteMap.data.first[best];
    const total = tasteCum(tasteMap.data, best, tasteMap.data.N);
    tip.innerHTML =
      `<strong>${escHtml(n.name)}</strong><br>${metric === "plays" ? `${fmtNum(total)} plays` : listeningFriendlyPlain(total)}` +
      (a.g !== undefined ? `<br>Genre: ${escHtml(DATA.genres[a.g])}${a.gi ? " (inferred from similar artists)" : ""}` : "") +
      (f < Infinity ? `<br>First played ${offToDayStr(tasteMap.data.lo + f)}` : "") +
      (a.tags && a.tags.length ? `<br><span class="web-tags">${escHtml(a.tags.join(" · "))}</span>` : "");
    tip.hidden = false;
    placeTip(tip, mx, my, r.width, r.height);
  });
  canvas.addEventListener("mouseleave", () => {
    tasteMap.hover = -1;
    tip.hidden = true;
    if (!tasteMap.playing) drawTasteMap();
  });
  const host = canvas.parentElement;
  if ("ResizeObserver" in window) {
    new ResizeObserver(() => {
      if (host.clientWidth && (host.clientWidth !== tasteMap.w || host.clientHeight !== tasteMap.h)) {
        tasteResize();
        drawTasteMap();
      }
    }).observe(host);
  }
}

/* ---------- Daily heatmap (SVG calendar) ----------
 * One cell per day, a block per year, shaded by plays (or minutes when the toggle says so). */

const HEAT_STOPS = [
  [0.0, [234, 215, 251]],
  [0.5, [192, 38, 211]],
  [1.0, [74, 15, 122]],
];

function heatColor(f) {
  for (let i = 1; i < HEAT_STOPS.length; i++) {
    const [f1, c1] = HEAT_STOPS[i];
    if (f <= f1) {
      const [f0, c0] = HEAT_STOPS[i - 1];
      const u = (f - f0) / (f1 - f0);
      return `rgb(${c0.map((v, k) => Math.round(v + (c1[k] - v) * u)).join(",")})`;
    }
  }
  return `rgb(${HEAT_STOPS[HEAT_STOPS.length - 1][1].join(",")})`;
}

const heatValueLabel = (v) => (metric === "plays" ? `${fmtNum(v)} ${v === 1 ? "play" : "plays"}` : listeningFriendlyPlain(v));

function renderHeatmap() {
  const host = document.getElementById("heat-host");
  const lo = dayStrToOff(state.fromDay),
    hi = dayStrToOff(state.toDay);
  const byDay = new Map();
  for (const row of DATA.series.day) byDay.set(dayOffFromSeriesRow(row), metric === "plays" ? row.n : row.ms / 60000);

  const inRange = [];
  for (let off = lo; off <= hi; off++) {
    const v = byDay.get(off) || 0;
    if (v > 0) inRange.push(v);
  }
  inRange.sort((a, b) => a - b);
  // Cap at the 95th percentile so a few huge days don't wash out everything else.
  const cap = inRange.length ? inRange[Math.min(inRange.length - 1, Math.floor(inRange.length * 0.95))] : 1;

  document.getElementById("heat-title").textContent = metric === "plays" ? "Plays per day" : "Minutes per day";
  let busiest = { off: -1, v: 0 };
  for (let off = lo; off <= hi; off++) {
    const v = byDay.get(off) || 0;
    if (v > busiest.v) busiest = { off, v };
  }
  const span = hi - lo + 1;
  document.getElementById("heat-summary").innerHTML = inRange.length
    ? `<strong>${fmtNum(inRange.length)}</strong> active days out of ${fmtNum(span)} · busiest day <strong>${offToDayStr(busiest.off)}</strong> (${heatValueLabel(busiest.v)})`
    : "No listening in this range.";

  const y0 = +offToDayStr(lo).slice(0, 4),
    y1 = +offToDayStr(hi).slice(0, 4);
  const W = host.clientWidth || 900;
  const left = 38,
    gap = 2;
  const cell = Math.max(8, Math.min(16, Math.floor((W - left - 6) / 53) - gap));
  const step = cell + gap;
  const blockH = 18 + 7 * step + 14;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const parts = [];
  let yi = 0;
  for (let y = y1; y >= y0; y--, yi++) {
    const top = yi * blockH;
    const jan1 = Date.UTC(y, 0, 1);
    const wd0 = new Date(jan1).getUTCDay(); // 0 = Sunday
    parts.push(`<text class="heat-year" x="0" y="${top + 12}">${y}</text>`);
    for (let m = 0; m < 12; m++) {
      const doy = (Date.UTC(y, m, 1) - jan1) / 864e5;
      parts.push(`<text class="heat-lbl" x="${left + Math.floor((doy + wd0) / 7) * step}" y="${top + 12}">${months[m]}</text>`);
    }
    [1, 3, 5].forEach((r) =>
      parts.push(`<text class="heat-lbl" x="${left - 6}" y="${top + 18 + r * step + cell - 2}" text-anchor="end">${["Mon", "Wed", "Fri"][(r - 1) / 2]}</text>`)
    );
    const days = (Date.UTC(y + 1, 0, 1) - jan1) / 864e5;
    for (let d = 0; d < days; d++) {
      const dt = new Date(jan1 + d * 864e5);
      const iso = dt.toISOString().slice(0, 10);
      const off = dayStrToOff(iso);
      const col = Math.floor((d + wd0) / 7),
        row = dt.getUTCDay();
      const x = left + col * step,
        yy = top + 18 + row * step;
      const inside = off >= lo && off <= hi;
      const v = byDay.get(off) || 0;
      const fill = !inside ? "#f6f2fa" : v > 0 ? heatColor(Math.min(1, Math.sqrt(v / cap))) : "#f1eaf8";
      parts.push(
        `<rect class="heat-cell${inside ? " in" : ""}" x="${x}" y="${yy}" width="${cell}" height="${cell}" rx="2" fill="${fill}"` +
          (inside ? ` data-d="${iso}" data-v="${v}"` : "") + `${inside ? "" : ' opacity="0.5"'}/>`
      );
    }
  }
  host.innerHTML = `<svg width="${left + 53 * step + 4}" height="${(y1 - y0 + 1) * blockH}" role="img" aria-label="Calendar heatmap of daily listening">${parts.join("")}</svg>`;

  const legend = document.getElementById("heat-legend");
  legend.innerHTML =
    `Less ${[0, 0.2, 0.4, 0.65, 1].map((f) => `<i style="background:${f === 0 ? "#f1eaf8" : heatColor(f)}"></i>`).join("")} More` +
    `<span> · scaled to your busier days (95th percentile)</span>`;
}

function wireHeatmap() {
  const host = document.getElementById("heat-host");
  const tip = document.getElementById("heat-tip");
  const wrap = host.parentElement;
  host.addEventListener("mousemove", (e) => {
    const c = e.target.closest(".heat-cell.in");
    if (!c) return void (tip.hidden = true);
    const date = new Date(c.dataset.d + "T00:00:00Z").toLocaleDateString(undefined, {
      timeZone: "UTC",
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    const v = +c.dataset.v;
    tip.innerHTML = `<strong>${date}</strong><br>${v > 0 ? heatValueLabel(v) : "No listening"}` + (walkAvailable() && v > 0 ? `<br><span class="web-tags">Click to walk this day</span>` : "");
    tip.hidden = false;
    const r = wrap.getBoundingClientRect();
    placeTip(tip, e.clientX - r.left, e.clientY - r.top, r.width, r.height);
  });
  host.addEventListener("mouseleave", () => (tip.hidden = true));
  host.addEventListener("click", (e) => {
    const c = e.target.closest(".heat-cell.in");
    if (!c || !walkAvailable()) return;
    const input = document.getElementById("walk-date");
    input.value = c.dataset.d;
    input.dispatchEvent(new Event("change"));
    document.getElementById("walk-card").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  let timer = 0,
    lastW = 0;
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const w = host.clientWidth;
      if (w && w !== lastW) {
        lastW = w;
        renderHeatmap();
      }
    }, 200);
  });
}

/* ---------- Taste river (d3 streamgraph of Last.fm tags) ---------- */

function renderRiver() {
  const card = document.getElementById("river-card");
  card.hidden = !(tagsAvailable() && typeof d3 !== "undefined");
  if (card.hidden) return;
  const host = document.getElementById("river-host");
  const tip = document.getElementById("river-tip");
  tip.hidden = true;
  host.innerHTML = "";

  const lo = dayStrToOff(state.fromDay),
    hi = dayStrToOff(state.toDay);
  const span = hi - lo + 1;
  if (span < 14) {
    host.innerHTML = `<p class="web-empty">Pick a range of at least two weeks to draw the river.</p>`;
    return;
  }

  // Monthly buckets for long ranges, weekly for short ones.
  const monthly = span > 240;
  const bIdx = new Int32Array(span);
  const labels = [];
  if (monthly) {
    const base = (() => { const s = offToDayStr(lo); return +s.slice(0, 4) * 12 + (+s.slice(5, 7) - 1); })();
    for (let o = 0; o < span; o++) {
      const s = offToDayStr(lo + o);
      const b = +s.slice(0, 4) * 12 + (+s.slice(5, 7) - 1) - base;
      bIdx[o] = b;
      labels[b] = s.slice(0, 7);
    }
  } else {
    for (let o = 0; o < span; o++) {
      bIdx[o] = Math.floor(o / 7);
      labels[bIdx[o]] = offToDayStr(lo + bIdx[o] * 7);
    }
  }
  const B = labels.length;
  const col = metric === "plays" ? 2 : 1;
  const unit = metric === "plays" ? 1 : 1 / 60000;

  const byTag = new Map();
  for (const a of DATA.artists) {
    if (!a.tags || !a.tags.length) continue;
    for (const row of a.days) {
      if (row[0] < lo || row[0] > hi) continue;
      const b = bIdx[row[0] - lo];
      for (const tg of a.tags) {
        let arr = byTag.get(tg);
        if (!arr) byTag.set(tg, (arr = new Float64Array(B)));
        arr[b] += row[col] * unit;
      }
    }
  }
  const count = +document.getElementById("river-count").value || 12;
  const keys = [...byTag]
    .map(([tg, arr]) => [tg, arr.reduce((s, v) => s + v, 0)])
    .sort((x, y) => y[1] - x[1])
    .slice(0, count)
    .map(([tg]) => tg);
  if (!keys.length) {
    host.innerHTML = `<p class="web-empty">No tagged listening in this range.</p>`;
    return;
  }
  // Drop half-finished buckets at either end; they would pinch the stream to a point.
  const dayCount = new Int32Array(B);
  for (let o = 0; o < span; o++) dayCount[bIdx[o]]++;
  const minDays = monthly ? 10 : 4;
  let b0 = 0,
    b1 = B - 1;
  while (b0 < b1 - 3 && dayCount[b0] < minDays) b0++;
  while (b1 > b0 + 3 && dayCount[b1] < minDays) b1--;
  const nb = b1 - b0 + 1;
  const rows = Array.from({ length: nb }, (_, b) => Object.fromEntries(keys.map((k) => [k, byTag.get(k)[b + b0]])));
  const series = d3.stack().keys(keys).order(d3.stackOrderInsideOut).offset(d3.stackOffsetWiggle)(rows);

  const W = host.clientWidth || 900,
    H = host.clientHeight || 400;
  const m = { l: 16, r: 16, t: 14, b: 30 };
  const x = d3.scaleLinear([0, nb - 1], [m.l, W - m.r]);
  const y = d3.scaleLinear(
    [d3.min(series, (s) => d3.min(s, (d) => d[0])), d3.max(series, (s) => d3.max(s, (d) => d[1]))],
    [H - m.b, m.t]
  );
  const area = d3.area().x((_, i) => x(i)).y0((d) => y(d[0])).y1((d) => y(d[1])).curve(d3.curveBasis);
  const color = (k) => `hsl(${(keys.indexOf(k) * 137.508) % 360} 75% 58%)`;

  const svg = d3.select(host).append("svg").attr("width", W).attr("height", H)
    .attr("role", "img").attr("aria-label", "Streamgraph of your top Last.fm tags over time");
  const layers = svg.append("g").selectAll("path").data(series).join("path")
    .attr("class", "river-layer").attr("fill", (s) => color(s.key)).attr("d", area);

  // Name each stream where it is thickest, if it is thick enough to hold text.
  const fs = Math.max(10, Math.min(13, W / 80));
  svg.append("g").selectAll("text").data(series).join("text")
    .attr("class", "river-label").style("font-size", `${fs}px`)
    .each(function (s) {
      let bi = 0, bt = -1;
      s.forEach((d, i) => { const t = d[1] - d[0]; if (t > bt) { bt = t; bi = i; } });
      const px = Math.abs(y(s[bi][0]) - y(s[bi][1]));
      if (px < fs + 6) return d3.select(this).remove();
      const cx = Math.min(W - m.r - 40, Math.max(m.l + 40, x(bi)));
      d3.select(this).attr("x", cx).attr("y", (y(s[bi][0]) + y(s[bi][1])) / 2).attr("dy", "0.35em").attr("text-anchor", "middle").text(s.key);
    });

  // Time axis: a label at each January (every other year when there are many), else evenly spaced.
  let ticks = monthly ? d3.range(nb).filter((i) => labels[i + b0].endsWith("-01")) : [];
  if (ticks.length > 9) ticks = ticks.filter((_, j) => j % 2 === 0);
  const tickText = (i) => (monthly && ticks.length ? labels[i + b0].slice(0, 4) : monthly
    ? new Date(labels[i + b0] + "-01T00:00:00Z").toLocaleDateString(undefined, { timeZone: "UTC", month: "short", year: "numeric" })
    : labels[i + b0].slice(5));
  if (!ticks.length) ticks = d3.range(0, nb, Math.max(1, Math.round(nb / 6)));
  svg.append("g").selectAll("text").data(ticks).join("text")
    .attr("class", "river-axis").attr("x", (i) => x(i)).attr("y", H - 10).attr("text-anchor", "middle")
    .text(tickText);

  layers
    .on("mouseenter", function (e, s) {
      layers.classed("dim", (o) => o !== s);
    })
    .on("mousemove", function (e, s) {
      const r = host.getBoundingClientRect();
      const i = Math.max(0, Math.min(nb - 1, Math.round(x.invert(e.clientX - r.left))));
      const v = byTag.get(s.key)[i + b0];
      tip.innerHTML = `<strong>${escHtml(s.key)}</strong><br>${monthly ? labels[i + b0] : "week of " + labels[i + b0]}<br>${metricLabel(v)}`;
      tip.hidden = false;
      placeTip(tip, e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    })
    .on("mouseleave", () => {
      layers.classed("dim", false);
      tip.hidden = true;
    });
}

function wireRiver() {
  document.getElementById("river-count").addEventListener("change", renderRiver);
  let timer = 0,
    lastW = 0;
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const w = document.getElementById("river-host").clientWidth;
      if (w && w !== lastW) {
        lastW = w;
        renderRiver();
      }
    }, 200);
  });
}

/* ---------- Compare two periods (taste map) ----------
 * Each artist is coloured by where its share of listening moved between period A and B. */

const CMP_A = [56, 189, 248], CMP_MID = [233, 213, 255], CMP_B = [251, 146, 60];
const cmp = { ctx: null, w: 0, h: 0, view: null, res: null, hover: -1, ready: false, zoom: { k: 1, x: 0, y: 0 } };
function cmpPt(n) {
  const [x, y] = tasteProject(n, cmp.view, cmp.w, cmp.h, false);
  const z = cmp.zoom;
  return [x * z.k + z.x, y * z.k + z.y];
}

function cmpColor(mix) {
  const [c0, c1, f] = mix < 0.5 ? [CMP_A, CMP_MID, mix / 0.5] : [CMP_MID, CMP_B, (mix - 0.5) / 0.5];
  return `rgb(${c0.map((v, k) => Math.round(v + (c1[k] - v) * f)).join(",")})`;
}

function cmpPreset(name) {
  const earliest = 0; // offsets are measured from the first listen
  const latest = dayStrToOff(DATA.coverage.latest_day);
  let a0, a1, b0, b1;
  if (name === "prev30") {
    b1 = latest; b0 = latest - 29; a1 = b0 - 1; a0 = a1 - 29;
  } else if (name === "year") {
    const y = +offToDayStr(latest).slice(0, 4);
    b0 = dayStrToOff(`${y}-01-01`); b1 = latest;
    a0 = dayStrToOff(`${y - 1}-01-01`); a1 = a0 + (b1 - b0);
  } else {
    b1 = latest; b0 = latest - 89; a1 = b1 - 365; a0 = b0 - 365;
    if (a0 < earliest) { a1 = b0 - 1; a0 = a1 - 89; }
  }
  const set = (id, off) => (document.getElementById(id).value = offToDayStr(Math.max(0, off)));
  set("cmp-a0", a0); set("cmp-a1", a1); set("cmp-b0", b0); set("cmp-b1", b1);
}

function cmpRange(i0, i1) {
  const a = dayStrToOff(document.getElementById(i0).value),
    b = dayStrToOff(document.getElementById(i1).value);
  return a <= b ? [a, b] : [b, a];
}

function cmpCompute() {
  const L = tasteLayout();
  const col = metric === "plays" ? 2 : 1,
    unit = metric === "plays" ? 1 : 1 / 60000;
  const [a0, a1] = cmpRange("cmp-a0", "cmp-a1"),
    [b0, b1] = cmpRange("cmp-b0", "cmp-b1");
  const a = new Float64Array(L.nodes.length),
    b = new Float64Array(L.nodes.length);
  L.nodes.forEach((nd, k) => {
    for (const row of DATA.artists[nd.i].days) {
      const d = row[0];
      if (d >= a0 && d <= a1) a[k] += row[col] * unit;
      if (d >= b0 && d <= b1) b[k] += row[col] * unit;
    }
  });
  const ta = a.reduce((s, v) => s + v, 0),
    tb = b.reduce((s, v) => s + v, 0);
  const share = (arr, t, k) => (t > 0 ? arr[k] / t : 0);
  let cax = 0, cay = 0, cbx = 0, cby = 0, maxShare = 1e-9;
  const delta = [];
  L.nodes.forEach((nd, k) => {
    const sa = share(a, ta, k), sb = share(b, tb, k);
    cax += sa * nd.x; cay += sa * nd.y; cbx += sb * nd.x; cby += sb * nd.y;
    maxShare = Math.max(maxShare, sa, sb);
    delta.push(sb - sa);
  });
  const order = [...delta.keys()];
  const into = order.filter((k) => delta[k] > 0).sort((p, q) => delta[q] - delta[p]).slice(0, 6);
  const left = order.filter((k) => delta[k] < 0).sort((p, q) => delta[p] - delta[q]).slice(0, 6);
  cmp.res = { a, b, ta, tb, delta, into, left, maxShare, cA: ta > 0 ? { x: cax, y: cay } : null, cB: tb > 0 ? { x: cbx, y: cby } : null, ranges: [[a0, a1], [b0, b1]] };
}

function cmpResize() {
  const canvas = document.getElementById("c-cmp");
  const host = canvas.parentElement;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cmp.w = host.clientWidth;
  cmp.h = host.clientHeight;
  canvas.width = Math.round(cmp.w * dpr);
  canvas.height = Math.round(cmp.h * dpr);
  cmp.ctx = canvas.getContext("2d");
  cmp.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cmp.view = cmp.w ? tasteFitView(cmp.w, cmp.h) : null;
}

const cmpValue = (v) => (metric === "plays" ? `${fmtNum(v)} plays` : listeningFriendlyPlain(v));

function drawCompare() {
  const ctx = cmp.ctx, r = cmp.res;
  if (!ctx || !cmp.view || !r) return;
  const { w, h } = cmp;
  const L = tasteLayout();
  const xy = (n) => cmpPt(n);
  const zs = Math.max(1, Math.min(3, Math.sqrt(cmp.zoom.k)));
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#12061f";
  ctx.fillRect(0, 0, w, h);
  const fs = Math.max(11, Math.min(15, w / 66));

  ctx.globalAlpha = 0.14;
  ctx.fillStyle = "#c9b8e0";
  for (const n of L.nodes) {
    const [x, y] = xy(n);
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const order = L.nodes.map((_, k) => k).filter((k) => r.a[k] > 0 || r.b[k] > 0)
    .sort((p, q) => Math.max(r.a[p] / (r.ta || 1), r.b[p] / (r.tb || 1)) - Math.max(r.a[q] / (r.ta || 1), r.b[q] / (r.tb || 1)));
  for (const k of order) {
    const sa = r.ta > 0 ? r.a[k] / r.ta : 0, sb = r.tb > 0 ? r.b[k] / r.tb : 0;
    const [x, y] = xy(L.nodes[k]);
    ctx.fillStyle = cmpColor(sb / (sa + sb));
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(x, y, (2.5 + 14 * Math.sqrt(Math.max(sa, sb) / r.maxShare)) * zs, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Arrow between the two periods' centres of mass.
  if (r.cA && r.cB) {
    const [ax, ay] = xy(r.cA), [bx, by] = xy(r.cB);
    ctx.strokeStyle = "#fff";
    ctx.fillStyle = "#fff";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);
    const ang = Math.atan2(by - ay, bx - ax);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx - 13 * Math.cos(ang - 0.4), by - 13 * Math.sin(ang - 0.4));
    ctx.lineTo(bx - 13 * Math.cos(ang + 0.4), by - 13 * Math.sin(ang + 0.4));
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 3;
    for (const [px, py, c] of [[ax, ay, CMP_A], [bx, by, CMP_B]]) {
      ctx.strokeStyle = `rgb(${c.join(",")})`;
      ctx.beginPath();
      ctx.arc(px, py, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Names of the biggest movers, skipping overlaps.
  ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "center";
  const boxes = [];
  const movers = [...r.into.slice(0, 4), ...r.left.slice(0, 4)];
  for (const k of movers) {
    const [x, y] = xy(L.nodes[k]);
    const tw = ctx.measureText(L.nodes[k].name).width;
    const bx = { x0: x - tw / 2, x1: x + tw / 2, y0: y - 24, y1: y - 8 };
    if (boxes.some((b) => bx.x0 < b.x1 && bx.x1 > b.x0 && bx.y0 < b.y1 && bx.y1 > b.y0)) continue;
    boxes.push(bx);
    ctx.fillStyle = "#fff";
    ctx.fillText(L.nodes[k].name, x, y - 12);
  }
  if (cmp.hover >= 0) {
    const [x, y] = xy(L.nodes[cmp.hover]);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.textAlign = "left";
  ctx.fillStyle = "#c9b8e0";
  ctx.font = `${fs + 1}px Inter, system-ui, sans-serif`;
  if (!r.ta || !r.tb) ctx.fillText(!r.ta && !r.tb ? "No listening in either period." : `No listening in period ${r.ta ? "B" : "A"}.`, 14, 26);
  else ctx.fillText("Dashed arrow: where the centre of your listening moved, A → B", 14, 26);
}

function renderCmpLists() {
  const r = cmp.res, L = tasteLayout();
  const el = document.getElementById("cmp-lists");
  if (!r || !r.ta || !r.tb) return void (el.innerHTML = "");
  const item = (k) => `<li><strong>${escHtml(L.nodes[k].name)}</strong> <span>${r.delta[k] > 0 ? "+" : ""}${(r.delta[k] * 100).toFixed(1)} pts of your listening</span></li>`;
  const fmtR = ([a, b]) => `${offToDayStr(a)} – ${offToDayStr(b)}`;
  el.innerHTML =
    `<div><h4>Moved into (B)</h4><ul>${r.into.map(item).join("") || "<li>Nothing stands out.</li>"}</ul></div>` +
    `<div><h4>Left behind (A)</h4><ul>${r.left.map(item).join("") || "<li>Nothing stands out.</li>"}</ul></div>` +
    `<p class="race-note">A: ${fmtR(r.ranges[0])} · ${cmpValue(r.ta)} &nbsp;|&nbsp; B: ${fmtR(r.ranges[1])} · ${cmpValue(r.tb)}</p>`;
}

function renderCompare() {
  const card = document.getElementById("cmp-card");
  card.hidden = !tasteAvailable();
  if (card.hidden) return;
  if (!cmp.ready) {
    cmpPreset("yoy90");
    cmp.ready = true;
  }
  cmpResize();
  cmpCompute();
  drawCompare();
  renderCmpLists();
}

function wireCompare() {
  const preset = document.getElementById("cmp-preset");
  const update = () => {
    cmpCompute();
    drawCompare();
    renderCmpLists();
  };
  preset.addEventListener("change", () => {
    if (preset.value !== "custom") cmpPreset(preset.value);
    update();
  });
  for (const id of ["cmp-a0", "cmp-a1", "cmp-b0", "cmp-b1"]) {
    document.getElementById(id).addEventListener("change", () => {
      preset.value = "custom";
      update();
    });
  }
  const canvas = document.getElementById("c-cmp");
  const tip = document.getElementById("cmp-tip");
  wirePanZoom(canvas, cmp, drawCompare, document.getElementById("cmp-reset"), tip);
  canvas.addEventListener("mousemove", (e) => {
    if (!cmp.res || !cmp.view || e.buttons) return;
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    let best = -1, bd = 12 * 12;
    tasteLayout().nodes.forEach((n, k) => {
      if (!(cmp.res.a[k] > 0 || cmp.res.b[k] > 0)) return;
      const [x, y] = cmpPt(n);
      const dd = (x - mx) ** 2 + (y - my) ** 2;
      if (dd < bd) { bd = dd; best = k; }
    });
    if (best !== cmp.hover) {
      cmp.hover = best;
      drawCompare();
    }
    if (best < 0) return void (tip.hidden = true);
    tip.innerHTML =
      `<strong>${escHtml(tasteLayout().nodes[best].name)}</strong><br>A: ${cmpValue(cmp.res.a[best])}<br>B: ${cmpValue(cmp.res.b[best])}`;
    tip.hidden = false;
    placeTip(tip, mx, my, r.width, r.height);
  });
  canvas.addEventListener("mouseleave", () => {
    cmp.hover = -1;
    tip.hidden = true;
    drawCompare();
  });
  const host = canvas.parentElement;
  if ("ResizeObserver" in window) {
    new ResizeObserver(() => {
      if (host.clientWidth && (host.clientWidth !== cmp.w || host.clientHeight !== cmp.h)) {
        cmpResize();
        drawCompare();
      }
    }).observe(host);
  }
}

/* ---------- Artist web (d3 force graph) ---------- */

const WEB_PALETTE = ["#c026d3", "#db2777", "#6366f1", "#f97316", "#0ea5e9", "#10b981", "#eab308", "#9333ea"];
const WEB_MIN_SHARED = 2;     // sessions two artists must share to be linked
const WEB_LINKS_PER_NODE = 3; // strongest links kept per artist (declutters the graph)
const WEB_PAIR_STRIDE = 1e5;  // pair key = lo * stride + hi (artist idx < graph_artist_cap)

let webSim = null;

/** Co-listening links among the top `count` artists in the current date range. */
function buildWebGraph(count, linkMode) {
  const cap = DATA.graph_artist_cap || 0;
  const idxByName = new Map(DATA.artists.slice(0, cap).map((a, i) => [a.name, i]));
  const top = rankArtists(state.fromDay, state.toDay, metric)
    .filter((a) => idxByName.has(a.name))
    .slice(0, count)
    .map((a) => ({ ...a, idx: idxByName.get(a.name) }));
  const nodeByIdx = new Map(top.map((n) => [n.idx, n]));

  const cand = [];
  if (linkMode === "lastfm") {
    for (const [i, j, m] of DATA.lastfm_links || []) {
      if (nodeByIdx.has(i) && nodeByIdx.has(j)) cand.push({ s: i, t: j, w: m, label: `${Math.round(m * 100)}% match` });
    }
  } else {
    const lo = dayStrToOff(state.fromDay),
      hi = dayStrToOff(state.toDay);
    const sessCount = new Map();
    const pair = new Map();
    for (const [day, arts] of DATA.artist_sessions || []) {
      if (day < lo || day > hi) continue;
      const members = arts.filter((i) => nodeByIdx.has(i)); // arts is sorted ascending
      for (const i of members) sessCount.set(i, (sessCount.get(i) || 0) + 1);
      for (let a = 0; a < members.length; a++) {
        for (let b = a + 1; b < members.length; b++) {
          const k = members[a] * WEB_PAIR_STRIDE + members[b];
          pair.set(k, (pair.get(k) || 0) + 1);
        }
      }
    }
    // Cosine-normalised strength so heavy-rotation artists don't link to everything.
    for (const [k, shared] of pair) {
      if (shared < WEB_MIN_SHARED) continue;
      const s = Math.floor(k / WEB_PAIR_STRIDE),
        t = k % WEB_PAIR_STRIDE;
      cand.push({ s, t, w: shared / Math.sqrt(sessCount.get(s) * sessCount.get(t)), label: `${shared} sessions` });
    }
  }
  cand.sort((x, y) => y.w - x.w);
  const used = new Map();
  const links = [];
  for (const l of cand) {
    if ((used.get(l.s) || 0) < WEB_LINKS_PER_NODE || (used.get(l.t) || 0) < WEB_LINKS_PER_NODE) {
      used.set(l.s, (used.get(l.s) || 0) + 1);
      used.set(l.t, (used.get(l.t) || 0) + 1);
      links.push(l);
    }
  }

  const linked = new Set(links.flatMap((l) => [l.s, l.t]));
  const nodes = top.filter((n) => linked.has(n.idx));
  const byIdx = new Map(nodes.map((n) => [n.idx, n]));

  // Weighted label propagation to colour clusters.
  const adj = new Map(nodes.map((n) => [n.idx, []]));
  for (const l of links) {
    adj.get(l.s).push([l.t, l.w]);
    adj.get(l.t).push([l.s, l.w]);
  }
  const label = new Map(nodes.map((n) => [n.idx, n.idx]));
  for (let it = 0; it < 15; it++) {
    let changed = false;
    for (const n of nodes) {
      const tally = new Map();
      for (const [o, w] of adj.get(n.idx)) tally.set(label.get(o), (tally.get(label.get(o)) || 0) + w);
      let best = label.get(n.idx),
        bw = -1;
      for (const [lab, w] of tally) if (w > bw || (w === bw && lab < best)) { best = lab; bw = w; }
      if (best !== label.get(n.idx)) { label.set(n.idx, best); changed = true; }
    }
    if (!changed) break;
  }
  const groupIds = [...new Set(nodes.map((n) => label.get(n.idx)))];
  nodes.forEach((n) => (n.group = groupIds.indexOf(label.get(n.idx))));

  return {
    nodes,
    links: links.map((l) => ({ source: byIdx.get(l.s), target: byIdx.get(l.t), w: l.w, label: l.label })),
    hidden: top.length - nodes.length,
  };
}

function renderArtistWeb() {
  const host = document.getElementById("web-host");
  const hint = document.getElementById("web-hint");
  const tip = document.getElementById("web-tip");
  if (webSim) webSim.stop();
  host.innerHTML = "";
  tip.hidden = true;

  if (typeof d3 === "undefined") {
    host.innerHTML = `<p class="web-empty">d3 failed to load, so the artist web is unavailable.</p>`;
    return;
  }
  const count = +document.getElementById("web-count").value || 40;
  const linkMode = document.getElementById("web-links").value;
  const { nodes, links, hidden } = buildWebGraph(count, linkMode);
  if (nodes.length < 2) {
    host.innerHTML = `<p class="web-empty">Not enough shared listening sessions in this range to link artists.</p>`;
    return;
  }
  hint.textContent =
    "Drag nodes · scroll to zoom · hover to highlight · click to open Artist dive" +
    (hidden ? ` · ${hidden} unlinked artist${hidden > 1 ? "s" : ""} hidden` : "");

  const W = host.clientWidth || 900;
  const H = Math.max(420, Math.min(680, Math.round(W * 0.62)));
  const nodeVal = (n) => (metric === "plays" ? n.fn : n.fm);
  const maxMs = Math.max(...nodes.map(nodeVal));
  const radius = (n) => 9 + 24 * Math.sqrt(nodeVal(n) / maxMs);
  // Colour by each artist's top Last.fm tag (commonest tags get palette colours) or by link cluster.
  const byTag = document.getElementById("web-color").value === "tag";
  const tagTally = new Map();
  for (const n of nodes) if (n.tags && n.tags[0]) tagTally.set(n.tags[0], (tagTally.get(n.tags[0]) || 0) + 1);
  const legendTags = [...tagTally].sort((x, y) => y[1] - x[1]).slice(0, WEB_PALETTE.length).map(([tg]) => tg);
  const color = (n) => {
    if (!byTag) return WEB_PALETTE[n.group % WEB_PALETTE.length];
    const i = n.tags && n.tags[0] ? legendTags.indexOf(n.tags[0]) : -1;
    return i >= 0 ? WEB_PALETTE[i] : "#8b7aa8";
  };
  document.getElementById("web-legend").innerHTML = byTag
    ? legendTags.map((tg, i) => `<span><i style="background:${WEB_PALETTE[i]}"></i>${escHtml(tg)}</span>`).join("") +
      `<span><i style="background:#8b7aa8"></i>other</span>`
    : "";

  const svg = d3.select(host).append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`).attr("width", "100%").attr("height", H)
    .attr("role", "img").attr("aria-label", "Force graph of related top artists");
  const defs = svg.append("defs");
  nodes.forEach((n) => {
    if (!n.image) return;
    defs.append("pattern").attr("id", `web-img-${n.idx}`)
      .attr("patternContentUnits", "objectBoundingBox").attr("width", 1).attr("height", 1)
      .append("image").attr("href", n.image).attr("width", 1).attr("height", 1)
      .attr("preserveAspectRatio", "xMidYMid slice");
  });

  const root = svg.append("g");
  svg.call(d3.zoom().scaleExtent([0.4, 4]).on("zoom", (e) => root.attr("transform", e.transform)));

  const wMax = Math.max(...links.map((l) => l.w));
  const link = root.append("g").attr("class", "web-links").selectAll("line").data(links).join("line")
    .attr("stroke-width", (l) => 1 + 5 * (l.w / wMax))
    .attr("stroke-opacity", (l) => 0.18 + 0.5 * (l.w / wMax));

  const node = root.append("g").selectAll("g").data(nodes).join("g").attr("class", "web-node");
  node.append("circle").attr("r", radius)
    .attr("fill", (n) => (n.image ? `url(#web-img-${n.idx})` : color(n)))
    .attr("stroke", color).attr("stroke-width", 3);
  node.filter((n) => !n.image).append("text").attr("class", "web-initial")
    .attr("text-anchor", "middle").attr("dy", "0.35em")
    .text((n) => (n.name.trim()[0] || "?").toUpperCase());
  node.append("text").attr("class", "web-label").attr("text-anchor", "middle")
    .attr("dy", (n) => radius(n) + 12).text((n) => n.name);

  const nbrs = new Map(nodes.map((n) => [n, new Map()]));
  for (const l of links) {
    nbrs.get(l.source).set(l.target, l);
    nbrs.get(l.target).set(l.source, l);
  }

  node
    .on("mouseenter", (e, n) => {
      const near = nbrs.get(n);
      node.classed("dim", (o) => o !== n && !near.has(o));
      link.classed("dim", (l) => l.source !== n && l.target !== n)
        .classed("hot", (l) => l.source === n || l.target === n);
      const top5 = [...near].sort((a, b) => b[1].w - a[1].w).slice(0, 5);
      tip.innerHTML =
        `<strong>${escHtml(n.name)}</strong><br>${metric === "plays" ? `${fmtNum(n.fn)} plays` : listeningFriendlyPlain(n.fm / 60000)}` +
        (n.tags && n.tags.length ? `<br><span class="web-tags">${escHtml(n.tags.join(" · "))}</span>` : "") +
        `<ul>${top5.map(([o, l]) => `<li>${escHtml(o.name)} <span>${l.label}</span></li>`).join("")}</ul>`;
      tip.hidden = false;
    })
    .on("mousemove", (e) => {
      const r = host.getBoundingClientRect();
      placeTip(tip, e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    })
    .on("mouseleave", () => {
      node.classed("dim", false);
      link.classed("dim", false).classed("hot", false);
      tip.hidden = true;
    })
    .on("click", (e, n) => {
      document.getElementById("artist-input").value = n.name;
      renderArtistChart();
      document.getElementById("artist").scrollIntoView({ behavior: "smooth" });
    });

  const tick = () => {
    link.attr("x1", (l) => l.source.x).attr("y1", (l) => l.source.y)
      .attr("x2", (l) => l.target.x).attr("y2", (l) => l.target.y);
    node.attr("transform", (n) => `translate(${n.x},${n.y})`);
  };
  webSim = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).distance((l) => 190 - 100 * (l.w / wMax)).strength((l) => 0.15 + 0.6 * (l.w / wMax)))
    .force("charge", d3.forceManyBody().strength(-520))
    .force("center", d3.forceCenter(W / 2, H / 2))
    .force("x", d3.forceX(W / 2).strength(0.04))
    .force("y", d3.forceY(H / 2).strength(0.06))
    .force("collide", d3.forceCollide((n) => radius(n) + 18))
    .on("tick", tick);
  if (prefersReducedMotion()) {
    webSim.stop().tick(300);
    tick();
  }

  node.call(d3.drag()
    .on("start", (e, n) => { if (!e.active) webSim.alphaTarget(0.25).restart(); n.fx = n.x; n.fy = n.y; })
    .on("drag", (e, n) => { n.fx = e.x; n.fy = e.y; })
    .on("end", (e, n) => { if (!e.active) webSim.alphaTarget(0); n.fx = n.fy = null; }));
}

function wireWebControls() {
  // Default to Last.fm links / tag colours when that data has been fetched.
  const hasLinks = (DATA.lastfm_links || []).length > 0;
  const linksSel = document.getElementById("web-links"),
    colorSel = document.getElementById("web-color");
  linksSel.querySelector('option[value="lastfm"]').disabled = !hasLinks;
  colorSel.querySelector('option[value="tag"]').disabled = !tagsAvailable();
  linksSel.value = hasLinks ? "lastfm" : "session";
  colorSel.value = tagsAvailable() ? "tag" : "cluster";
  for (const id of ["web-count", "web-links", "web-color"])
    document.getElementById(id).addEventListener("change", renderArtistWeb);
  let timer = 0,
    lastW = 0;
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const w = document.getElementById("web-host").clientWidth;
      if (w && w !== lastW) { lastW = w; renderArtistWeb(); }
    }, 250);
  });
}

/**
 * Canvas text is drawn with whatever font is available at that instant. The web fonts (Fraunces for the
 * big dates, Inter for everything else) arrive a moment after the first paint, so without this the
 * resting frame used a fallback font and then switched to the real one once playback redrew the canvas.
 * Wait for them, then redraw every canvas so the first frame already matches.
 */
function redrawCanvases() {
  if (race.data) drawRace();
  if (tasteMap.data && tasteMap.layout) drawTasteMap();
  if (walk.view && tasteMap.layout) drawWalk();
  if (cmp.res && cmp.view) drawCompare();
}
if (document.fonts && document.fonts.load) {
  const faces = ["600 24px Fraunces", "400 14px Inter", "500 14px Inter", "600 14px Inter", "700 14px Inter", "800 14px Inter"];
  Promise.all(faces.map((f) => document.fonts.load(f)))
    .then(() => document.fonts.ready)
    .then(redrawCanvases)
    .catch(() => {});
  document.fonts.addEventListener("loadingdone", redrawCanvases);
}

bootstrap();
