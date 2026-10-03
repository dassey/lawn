// Renders the live conditions card (alerts, drought tracker, soil temp,
// rain history bars, 7-day forecast).
import { html, render, on, fmtNum } from './dom.js';
import { icon, wxIcon } from './icons.js';
import { store } from './store.js';
import { fmtDate, realToday, previewDate } from './dates.js';
import { fetchWeather, analyze } from './weather.js';
import { loadJSON } from './data.js';
import { openLogDialog } from './logdlg.js';

export async function mountWeatherCard(el, { compact = false, onAnalysis } = {}) {
  const draw = async (force = false) => {
    const s = store.settings;
    if (!s.weather) {
      render(el, html`<div class="card-head"><h2>${icon('cloud')}Conditions</h2></div>
        <p class="subtle">Live weather is turned off. Turn it on in <button type="button" class="btn-link" data-action="settings">Settings</button> to get drought, frost, brown patch and planting alerts.</p>`);
      return;
    }
    if (!el.dataset.loaded) render(el, html`<div class="card-head"><h2>${icon('cloud')}Conditions</h2></div><div class="loading"><span class="spinner"></span>Checking the weather for ${s.location.name}…</div>`);
    try {
      const [res, climate] = await Promise.all([fetchWeather(s.location, { force }), loadJSON('climate').catch(() => null)]);
      const a = analyze(res.data, { climate, date: realToday() });
      el.dataset.loaded = '1';
      onAnalysis?.(a);
      drawCard(a, res, climate);
    } catch (err) {
      render(el, html`<div class="card-head"><h2>${icon('cloud')}Conditions</h2><button type="button" class="icon-btn" data-wx-refresh aria-label="Retry">${icon('refresh')}</button></div>
        <div class="callout callout-warn">${icon('alert')}<div><strong>Couldn't load live weather.</strong><p>${err.message || err}. The plan still works offline. You can log rain from your own gauge.</p></div></div>
        <p style="margin-top:10px"><button type="button" class="btn btn-sm" data-log-rain>${icon('rain')}Log rain gauge</button></p>`);
    }
  };

  const drawCard = (a, res, climate) => {
    const m = a.m;
    const s = store.settings;
    const alerts = compact ? a.alerts.slice(0, 4) : a.alerts;
    const hist = a.past.slice(-30);
    const fut = a.future.slice(0, 7);
    const bars = hist.concat(a.today ? [a.today] : [], fut);
    const maxRain = Math.max(0.5, ...bars.map((b) => b.rain + (b.past ? b.water : 0)));
    const soakCls = m.daysSinceSoak >= 21 ? 'is-bad' : m.daysSinceSoak >= 14 ? 'is-warn' : 'is-good';
    const balCls = m.balance14 <= -1.5 ? 'is-bad' : m.balance14 <= -0.5 ? 'is-warn' : 'is-good';
    const updated = new Date(res.at);
    const forecastDays = [a.today, ...fut].filter(Boolean).slice(0, 7);
    render(el, html`
      <div class="card-head">
        <h2>${icon('cloud')}Conditions · ${s.location.name}</h2>
        <button type="button" class="icon-btn" data-wx-refresh aria-label="Refresh weather" title="Refresh">${icon('refresh')}</button>
      </div>
      ${previewDate() ? html`<p class="wx-preview-note">${icon('info')}Live weather for today, ${fmtDate(realToday())}, not the date you're previewing.</p>` : ''}
      ${alerts.length ? html`<div class="wx-alerts" aria-live="polite">${alerts.map((x) => html`<div class="wx-alert lvl-${x.level}">${icon(x.icon)}<div><b>${x.title}</b>${x.text}${x.href ? html` <a href="${x.href}">More</a>` : ''}</div></div>`)}</div>`
        : html`<p class="subtle" style="margin:0">No weather alerts right now.</p>`}
      <div class="wx-stats" style="margin-top:14px">
        <div class="stat ${soakCls}"><span class="stat-label">Since ½″ of rain</span><span class="stat-value">${m.daysSinceSoak >= 42 ? '42+' : m.daysSinceSoak}<small> days</small></span><span class="stat-note">Soak lawn at 21+ in heat</span></div>
        <div class="stat ${balCls}"><span class="stat-label">Rain vs lawn use · 14d</span><span class="stat-value">${m.balance14 > 0 ? '+' : ''}${fmtNum(m.balance14, 1)}<small> in</small></span><span class="stat-note">${fmtNum(m.rain14 + m.water14, 2)} in fell or watered · ~${fmtNum(m.use14, 1)} in used</span></div>
        <div class="stat"><span class="stat-label">Rain · 30 days</span><span class="stat-value">${fmtNum(m.rain30, 2)}<small> in</small></span><span class="stat-note">${m.normal30 != null ? `Normal ≈ ${fmtNum(m.normal30, 1)} in` : ''}</span></div>
        <div class="stat"><span class="stat-label">Soil at 2 in</span><span class="stat-value">${m.soil5 != null ? Math.round(m.soil5) : '—'}<small>°F</small></span><span class="stat-note">5-day average</span></div>
      </div>
      ${compact ? '' : html`
      <div style="margin-top:16px">
        <div class="row-between"><span class="stat-label">Rain: last 30 days + forecast</span><span class="subtle">${m.gaugeDays ? html`${icon('check')} ${m.gaugeDays} gauge readings used` : ''}</span></div>
        <div class="rain-bars" role="img" aria-label="Daily rainfall for the last 30 days and next 7 days">
          ${bars.map((b) => html`<i class="${b.future ? 'is-future' : ''} ${b.gauge != null ? 'is-gauge' : ''}" style="height:${Math.max(2, ((b.rain + (b.past ? b.water : 0)) / maxRain) * 100)}%" title="${fmtDate(b.dt)}: ${fmtNum(b.rain, 2)} in${b.gauge != null ? ' (your gauge)' : ''}${b.water ? ` + ${fmtNum(b.water, 2)} in watering` : ''}"></i>`)}
        </div>
        <div class="meter-labels"><span>${fmtDate(bars[0].dt)}</span><span>Today</span><span>${fmtDate(bars[bars.length - 1].dt)}</span></div>
      </div>`}
      <div class="wx-days" style="margin-top:14px">
        ${forecastDays.map((x) => html`<div class="wx-day ${x.isToday ? 'is-today' : ''}"><div class="d">${x.isToday ? 'Today' : fmtDate(x.dt, { weekday: 'short' })}</div>${icon(wxIcon(x.code))}<div class="hi">${Math.round(x.hi)}°</div><div class="lo">${Math.round(x.lo)}°</div><div class="rain">${x.rain >= 0.01 ? `${fmtNum(x.rain, 2)}″` : x.pop >= 30 ? `${x.pop}%` : ''}</div></div>`)}
      </div>
      <div class="row-between" style="margin-top:12px">
        <p class="subtle" style="margin:0">Open-Meteo model estimates${res.stale ? ' (offline copy)' : ''}, updated ${updated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}. Your gauge readings override them.</p>
        <button type="button" class="btn btn-sm" data-log-rain>${icon('rain')}Log rain gauge</button>
      </div>`);
  };

  if (!el.dataset.wxWired) {
    el.dataset.wxWired = '1';
    on(el, 'click', '[data-wx-refresh]', () => draw(true));
    on(el, 'click', '[data-log-rain]', () => openLogDialog({ type: 'rain', cat: 'yard', title: 'Rain gauge' }));
    document.addEventListener('journal-changed', () => draw(false));
    document.addEventListener('settings-closed', () => draw(false));
  }
  await draw(false);
}
