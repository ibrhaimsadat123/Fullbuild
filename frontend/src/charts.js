// AI-assisted (Claude): the two chart components.
// 1. Fingerprint radar: per-dimension match for one Earth cell.
// 2. OverlayChart: the ONE reusable Nerd Mode chart. Earth line vs Mars/Moon line,
//    with each series' source tag printed under the chart.
import {
  Chart,
  RadarController,
  LineController,
  BarController,
  BarElement,
  RadialLinearScale,
  LinearScale,
  CategoryScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';

Chart.register(RadarController, LineController, BarController, BarElement, RadialLinearScale, LinearScale, CategoryScale, PointElement, LineElement, Filler, Tooltip, Legend);
Chart.defaults.color = '#9aa1ad';
Chart.defaults.borderColor = 'rgba(255,255,255,0.1)';
Chart.defaults.font.family = "'Inter', system-ui, sans-serif";

const WORLD_COLORS = { earth: '#4aa3ff', mars: '#e0703a', moon: '#c9ccd3' };

export function dimLabel(dim) {
  return dim.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function radarChart(canvas, dims, labelOf = dimLabel) {
  const keys = Object.keys(dims).filter((k) => typeof dims[k] === 'number');
  return new Chart(canvas, {
    type: 'radar',
    data: {
      labels: keys.map(labelOf),
      datasets: [
        {
          label: 'Match',
          data: keys.map((k) => dims[k]),
          borderColor: '#ffb000',
          backgroundColor: 'rgba(255,176,0,0.2)',
          pointBackgroundColor: '#ffb000',
          borderWidth: 2,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false } },
      scales: {
        r: {
          min: 0,
          max: 1,
          ticks: { stepSize: 0.25, backdropColor: 'transparent', font: { size: 9 } },
          pointLabels: { font: { size: 11 } },
          grid: { color: 'rgba(255,255,255,0.12)' },
          angleLines: { color: 'rgba(255,255,255,0.12)' },
        },
      },
    },
  });
}

/**
 * OverlayChart. `spec` follows the nerd_<site>.json chart shape:
 * { title, x: {label, unit}, y: {label, unit}, series: [{ world, label, points: [[x, y], ...], source, source_type }] }
 * Returns the Chart; the caller places `sourcesHtml(spec)` under it.
 */
export function overlayChart(canvas, spec) {
  return new Chart(canvas, {
    type: 'line',
    data: {
      datasets: (spec.series || []).map((s) => ({
        label: s.label || s.world,
        data: (s.points || []).map(([x, y]) => ({ x, y })),
        borderColor: WORLD_COLORS[s.world] || '#ffffff',
        backgroundColor: WORLD_COLORS[s.world] || '#ffffff',
        pointRadius: 0,
        borderWidth: 2,
        borderDash: s.dash ? [5, 4] : [],
        tension: 0.25,
        spanGaps: false,
      })),
    },
    options: {
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
      scales: {
        x: { type: 'linear', title: { display: !!spec.x, text: axisTitle(spec.x) } },
        y: { type: 'linear', title: { display: !!spec.y, text: axisTitle(spec.y) } },
      },
    },
  });
}

function axisTitle(a) {
  if (!a) return '';
  return a.unit ? `${a.label} (${a.unit})` : a.label;
}

export function sourcesHtml(spec, esc) {
  return (spec.series || [])
    .map((s) => `<span class="src"><b>${esc(s.label || s.world)}:</b> ${esc(s.source || 'source missing')}${s.source_type ? ` <span class="chip">${esc(s.source_type)}</span>` : ''}</span>`)
    .join('');
}

/**
 * Histogram of Earth's values for one measurement, with vertical markers (target, selected place).
 * spec: { labels: [bin labels], counts: [n], markers: [{ pos: bin index (fractional), label, color, dash }] }
 */
export function histChart(canvas, spec) {
  const markers = {
    id: 'markers',
    afterDatasetsDraw(chart) {
      const { ctx, chartArea: a, scales } = chart;
      for (const m of spec.markers || []) {
        const x = scales.x.getPixelForValue(Math.max(0, Math.min(spec.labels.length - 1, m.pos)));
        ctx.save();
        ctx.strokeStyle = m.color; ctx.lineWidth = 2; ctx.setLineDash(m.dash ? [4, 3] : []);
        ctx.beginPath(); ctx.moveTo(x, a.top); ctx.lineTo(x, a.bottom); ctx.stroke();
        ctx.setLineDash([]); ctx.fillStyle = m.color; ctx.font = '600 10px Inter, system-ui, sans-serif';
        ctx.textAlign = x > (a.left + a.right) / 2 ? 'right' : 'left';
        ctx.fillText(m.label, x + (ctx.textAlign === 'left' ? 4 : -4), a.top + 10 + (m.row || 0) * 12);
        ctx.restore();
      }
    },
  };
  return new Chart(canvas, {
    type: 'bar',
    data: { labels: spec.labels, datasets: [{ data: spec.counts, backgroundColor: 'rgba(154,161,173,0.45)', borderWidth: 0, barPercentage: 1, categoryPercentage: 1 }] },
    options: {
      maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.raw.toLocaleString()} Earth cells` } } },
      scales: { x: { ticks: { maxTicksLimit: 6, font: { size: 9 } }, grid: { display: false } }, y: { display: false } },
    },
    plugins: [markers],
  });
}
