/**
 * ====================================================
 * EWS LAB RISET — CHART MODULE
 * File  : web/js/chart.js
 * Berisi: Inisialisasi Chart.js, fetch data historis,
 *         render grafik kemiringan & kelembapan
 * Depends: Chart.js (di-load di dashboard.html)
 *          dashboard.js (CONFIG)
 * ====================================================
 */

'use strict';

/* --------------------------------------------------
   CHART INSTANCES
   -------------------------------------------------- */
var tiltChart = null;
var soilChart = null;

/* --------------------------------------------------
   WARNA DATASET
   -------------------------------------------------- */
var COLORS = {
  NODE_1: {
    border: 'rgba(124, 58, 0, 1)',
    fill:   'rgba(124, 58, 0, 0.12)'
  },
  NODE_2: {
    border: 'rgba(245, 158, 11, 1)',
    fill:   'rgba(245, 158, 11, 0.12)'
  },
  danger: 'rgba(220, 38, 38, 0.75)'
};

/* --------------------------------------------------
   THRESHOLD LINE PLUGIN (garis merah batas 45°)
   -------------------------------------------------- */
var thresholdPlugin = {
  id: 'thresholdLine',
  afterDraw: function (chart) {
    if (chart.canvas.id !== 'tiltChart') return;

    var yScale = chart.scales.y;
    var xScale = chart.scales.x;
    var ctx    = chart.ctx;
    var yPx    = yScale.getPixelForValue(CONFIG.TILT_THRESHOLD);

    if (yPx < yScale.top || yPx > yScale.bottom) return;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(xScale.left, yPx);
    ctx.lineTo(xScale.right, yPx);
    ctx.strokeStyle = COLORS.danger;
    ctx.lineWidth   = 2;
    ctx.setLineDash([8, 5]);
    ctx.stroke();

    ctx.fillStyle = COLORS.danger;
    ctx.font      = 'bold 11px Inter, sans-serif';
    ctx.fillText('⚠ Batas Bahaya ' + CONFIG.TILT_THRESHOLD + '°', xScale.left + 8, yPx - 7);
    ctx.restore();
  }
};

/* --------------------------------------------------
   SHARED CHART OPTIONS
   -------------------------------------------------- */
function baseChartOptions(yLabel, yMax) {
  return {
    responsive:          true,
    animation:           false,
    interaction:         { intersect: false, mode: 'index' },
    scales: {
      x: {
        title: { display: true, text: 'Waktu', font: { size: 11 } },
        ticks: { maxTicksLimit: 12, font: { size: 10 }, color: '#9C7A5A' },
        grid:  { color: 'rgba(196,152,96,0.15)' }
      },
      y: {
        title: { display: true, text: yLabel, font: { size: 11 } },
        min:   0,
        max:   yMax,
        ticks: { font: { size: 10 }, color: '#9C7A5A' },
        grid:  { color: 'rgba(196,152,96,0.15)' }
      }
    },
    plugins: {
      legend: {
        position: 'top',
        labels:   { font: { size: 11 }, color: '#5C2D00' }
      },
      tooltip: {
        backgroundColor: 'rgba(30,10,0,0.85)',
        titleColor:      '#F0B86A',
        bodyColor:       '#FAE4C0'
      }
    }
  };
}

/* --------------------------------------------------
   INIT CHARTS
   -------------------------------------------------- */
function initCharts() {
  var tiltCtx = document.getElementById('tiltChart');
  var soilCtx = document.getElementById('soilChart');
  if (!tiltCtx || !soilCtx) return;

  tiltChart = new Chart(tiltCtx.getContext('2d'), {
    type: 'line',
    data: {
      labels:   [],
      datasets: [
        {
          label:           'Node 1 — Sampok Utara',
          data:            [],
          borderColor:     COLORS.NODE_1.border,
          backgroundColor: COLORS.NODE_1.fill,
          borderWidth:     2,
          pointRadius:     2,
          fill:            true,
          tension:         0.35
        },
        {
          label:           'Node 2 — Sampok Selatan',
          data:            [],
          borderColor:     COLORS.NODE_2.border,
          backgroundColor: COLORS.NODE_2.fill,
          borderWidth:     2,
          pointRadius:     2,
          fill:            true,
          tension:         0.35
        }
      ]
    },
    options: baseChartOptions('Kemiringan (°)', 90),
    plugins: [thresholdPlugin]
  });

  soilChart = new Chart(soilCtx.getContext('2d'), {
    type: 'line',
    data: {
      labels:   [],
      datasets: [
        {
          label:           'Node 1 — Sampok Utara',
          data:            [],
          borderColor:     COLORS.NODE_1.border,
          backgroundColor: COLORS.NODE_1.fill,
          borderWidth:     2,
          pointRadius:     2,
          fill:            true,
          tension:         0.35
        },
        {
          label:           'Node 2 — Sampok Selatan',
          data:            [],
          borderColor:     COLORS.NODE_2.border,
          backgroundColor: COLORS.NODE_2.fill,
          borderWidth:     2,
          pointRadius:     2,
          fill:            true,
          tension:         0.35
        }
      ]
    },
    options: baseChartOptions('Kelembapan (%)', 100)
  });
}

/* --------------------------------------------------
   FETCH DATA HISTORIS
   -------------------------------------------------- */
function fetchHistory() {
  var url = 'http://' + window.location.hostname + ':1880/api/history?hours=24';

  fetch(url)
    .then(function (res) { return res.json(); })
    .then(function (result) {
      if (!result.success || !result.data) return;

      var node1 = result.data.filter(function (d) { return d.node === 'NODE_1'; });
      var node2 = result.data.filter(function (d) { return d.node === 'NODE_2'; });

      var toLabel = function (d) {
        return new Date(d.timestamp).toLocaleTimeString('id-ID', {
          hour:   '2-digit',
          minute: '2-digit'
        });
      };

      var labels = (node1.length >= node2.length ? node1 : node2).map(toLabel);

      /* Tilt Chart */
      tiltChart.data.labels        = labels;
      tiltChart.data.datasets[0].data = node1.map(function (d) { return d.tilt; });
      tiltChart.data.datasets[1].data = node2.map(function (d) { return d.tilt; });
      tiltChart.update();

      /* Soil Chart */
      soilChart.data.labels        = labels;
      soilChart.data.datasets[0].data = node1.map(function (d) { return d.soil; });
      soilChart.data.datasets[1].data = node2.map(function (d) { return d.soil; });
      soilChart.update();

      console.log('[Chart] Historis dimuat:', result.data.length, 'record');
    })
    .catch(function (err) {
      console.warn('[Chart] Gagal memuat historis:', err.message);
    });
}

/* --------------------------------------------------
   START
   -------------------------------------------------- */
document.addEventListener('DOMContentLoaded', function () {
  initCharts();
  setTimeout(fetchHistory, 1200);
  /* Auto-refresh setiap 5 menit */
  setInterval(fetchHistory, 5 * 60 * 1000);
});
