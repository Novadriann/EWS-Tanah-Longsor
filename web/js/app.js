/* ============================================
   EWS MARGOREJO — Dashboard Application Logic
   Sistem Peringatan Dini Tanah Longsor
   Sampok, Sriharjo, Imogiri, Bantul, DIY
   ============================================ */

// =====================================
// AUTH CHECK
// =====================================
if (!localStorage.getItem('ews_auth')) {
  window.location.href = 'index.html';
}

function logout() {
  localStorage.removeItem('ews_auth');
  window.location.href = 'index.html';
}

// =====================================
// CONSTANTS & CONFIGURATION
// =====================================
const NODES = {
  NODE_1: {
    lat: -7.941043,
    lng: 110.404573,
    name: 'Node 1 — Sampok Utara',
    shortName: 'Node 1'
  },
  NODE_2: {
    lat: -7.941133,
    lng: 110.404663,
    name: 'Node 2 — Sampok Selatan',
    shortName: 'Node 2'
  }
};

const TILT_THRESHOLD = 45;       // Derajat - threshold bahaya
const ML_PER_TIP = 3.67;        // Volume per tip tipping bucket
const WS_RECONNECT_MS = 3000;   // Reconnect WebSocket setiap 3 detik
const OFFLINE_TIMEOUT_MS = 30000; // 30 detik tanpa data = offline

// =====================================
// STATE
// =====================================
const nodeData = {
  NODE_1: { tilt: 0, soil: 0, hall: 0, mag: 0, tip: 0, rain: 0, rssi: 0, snr: 0, timestamp: null, lastReceived: 0 },
  NODE_2: { tilt: 0, soil: 0, hall: 0, mag: 0, tip: 0, rain: 0, rssi: 0, snr: 0, timestamp: null, lastReceived: 0 }
};

let ws = null;
let isMuted = false;
let alertPlayed = { NODE_1: false, NODE_2: false };
let alertDismissed = false;
let map = null;
let markers = {};
let tiltChart = null;
let soilChart = null;

// =====================================
// CLOCK
// =====================================
function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent = now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}
setInterval(updateClock, 1000);
updateClock();

// =====================================
// WEBSOCKET
// =====================================
function connectWebSocket() {
  const wsUrl = `ws://${window.location.hostname}:1880/ws/ews`;
  console.log('[WS] Menghubungkan ke:', wsUrl);

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[WS] Terhubung!');
    const statusEl = document.getElementById('connection-status');
    statusEl.className = 'status-connected';
    statusEl.innerHTML = '<span class="status-dot"></span> Terhubung';
  };

  ws.onclose = () => {
    console.log('[WS] Terputus. Reconnect dalam 3 detik...');
    const statusEl = document.getElementById('connection-status');
    statusEl.className = 'status-disconnected';
    statusEl.innerHTML = '<span class="status-dot"></span> Terputus';
    setTimeout(connectWebSocket, WS_RECONNECT_MS);
  };

  ws.onerror = (err) => {
    console.error('[WS] Error:', err);
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log('[WS] Data diterima:', data);
      updateDashboard(data);
    } catch (e) {
      console.warn('[WS] Format data tidak valid:', event.data);
    }
  };
}

// =====================================
// LEAFLET MAP
// =====================================
function initMap() {
  // Titik tengah antara 2 node
  const centerLat = (NODES.NODE_1.lat + NODES.NODE_2.lat) / 2;
  const centerLng = (NODES.NODE_1.lng + NODES.NODE_2.lng) / 2;

  map = L.map('map', {
    center: [centerLat, centerLng],
    zoom: 19,
    zoomControl: true
  });

  // Layer: OpenStreetMap
  const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 22,
    attribution: '© OpenStreetMap'
  });

  // Layer: Satellite (Esri)
  const satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 22,
    attribution: '© Esri'
  });

  // Default: OpenStreetMap
  osmLayer.addTo(map);

  // Layer control
  L.control.layers({
    'Peta Jalan': osmLayer,
    'Satelit': satLayer
  }, null, { position: 'topright' }).addTo(map);

  // Buat marker untuk setiap node
  Object.keys(NODES).forEach(nodeId => {
    const node = NODES[nodeId];
    const number = nodeId === 'NODE_1' ? '1' : '2';

    const icon = createMarkerIcon(number, 'normal');
    const marker = L.marker([node.lat, node.lng], { icon: icon }).addTo(map);
    marker.bindPopup(buildPopupContent(nodeId, nodeData[nodeId]), {
      maxWidth: 300,
      className: 'ews-popup'
    });

    markers[nodeId] = marker;
  });
}

// =====================================
// CUSTOM MARKER ICONS
// =====================================
function createMarkerIcon(number, status) {
  const pulseHtml = status === 'danger'
    ? '<div class="marker-pulse-ring danger"></div>'
    : '';

  return L.divIcon({
    className: 'marker-container',
    html: `
      ${pulseHtml}
      <div class="marker-icon-inner ${status}">${number}</div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -20]
  });
}

// =====================================
// POPUP CONTENT
// =====================================
function buildPopupContent(nodeId, data) {
  const node = NODES[nodeId];
  const isDanger = data.tilt >= TILT_THRESHOLD;
  const statusClass = isDanger ? 'danger' : 'normal';
  const statusText = isDanger ? '🚨 BAHAYA' : '✅ Normal';
  const timeStr = data.timestamp
    ? new Date(data.timestamp).toLocaleTimeString('id-ID')
    : '--:--:--';

  return `
    <div class="popup-content">
      <div class="popup-title">📍 ${node.name}</div>
      <div class="popup-status ${statusClass}">${statusText}</div>
      <div class="popup-data">
        <div class="popup-data-row">
          <span>🔺 Kemiringan</span>
          <span>${data.tilt.toFixed(2)}°</span>
        </div>
        <div class="popup-data-row">
          <span>💧 Kelembapan</span>
          <span>${data.soil}%</span>
        </div>
        <div class="popup-data-row">
          <span>🌧️ Curah Hujan</span>
          <span>${data.tip} tip (${(data.tip * ML_PER_TIP).toFixed(1)} ml)</span>
        </div>
        <div class="popup-data-row">
          <span>📶 RSSI</span>
          <span>${data.rssi} dBm</span>
        </div>
        <div class="popup-data-row">
          <span>📡 SNR</span>
          <span>${data.snr} dB</span>
        </div>
        <div class="popup-data-row">
          <span>⏰ Update</span>
          <span>${timeStr}</span>
        </div>
      </div>
    </div>
  `;
}

// =====================================
// UPDATE DASHBOARD
// =====================================
function updateDashboard(data) {
  const nodeId = data.node;
  if (!nodeData[nodeId]) return;

  // Update state
  nodeData[nodeId] = {
    tilt: parseFloat(data.tilt) || 0,
    soil: parseInt(data.soil) || 0,
    hall: parseInt(data.hall) || 0,
    mag: parseInt(data.mag) || 0,
    tip: parseInt(data.tip) || 0,
    rain: parseFloat(data.rain) || 0,
    rssi: parseInt(data.rssi) || 0,
    snr: parseFloat(data.snr) || 0,
    timestamp: data.timestamp || new Date().toISOString(),
    lastReceived: Date.now()
  };

  const d = nodeData[nodeId];
  const isDanger = d.tilt >= TILT_THRESHOLD;
  const suffix = nodeId === 'NODE_1' ? 'node1' : 'node2';
  const number = nodeId === 'NODE_1' ? '1' : '2';

  // ---- Update Sidebar Card ----
  // Values
  document.getElementById(`tilt-${suffix}`).textContent = `${d.tilt.toFixed(2)}°`;
  document.getElementById(`soil-${suffix}`).textContent = `${d.soil}%`;
  document.getElementById(`rain-${suffix}`).textContent = `${d.tip} tip`;
  document.getElementById(`rssi-${suffix}`).textContent = `${d.rssi} dBm`;
  document.getElementById(`time-${suffix}`).textContent =
    new Date(d.timestamp).toLocaleTimeString('id-ID');

  // Card class & badge
  const card = document.getElementById(`card-${suffix}`);
  const badge = document.getElementById(`badge-${suffix}`);
  const indicator = document.getElementById(`indicator-${suffix}`);

  card.className = `node-card ${isDanger ? 'danger' : 'normal'}`;
  badge.className = `node-status-badge ${isDanger ? 'danger' : 'normal'}`;
  badge.textContent = isDanger ? '🚨 BAHAYA' : '✅ Normal';
  indicator.style.color = isDanger ? '#D32F2F' : '#4CAF50';

  // Tilt value color
  const tiltEl = document.getElementById(`tilt-${suffix}`);
  tiltEl.style.color = isDanger ? '#D32F2F' : '#212121';

  // ---- Update Map Marker ----
  if (markers[nodeId]) {
    const newIcon = createMarkerIcon(number, isDanger ? 'danger' : 'normal');
    markers[nodeId].setIcon(newIcon);
    markers[nodeId].setPopupContent(buildPopupContent(nodeId, d));
  }

  // ---- Alert Logic ----
  handleAlert(nodeId, isDanger);
}

// =====================================
// ALERT HANDLER
// =====================================
function handleAlert(nodeId, isDanger) {
  if (isDanger) {
    // Show alert banner
    if (!alertDismissed) {
      const banner = document.getElementById('alert-banner');
      const detail = document.getElementById('alert-detail');
      detail.textContent = `${NODES[nodeId].shortName}: Kemiringan ${nodeData[nodeId].tilt.toFixed(2)}° melebihi batas ${TILT_THRESHOLD}°`;
      banner.classList.add('active');
    }

    // Play sound (only once per alert activation)
    if (!alertPlayed[nodeId] && !isMuted) {
      playAlertSound();
      alertPlayed[nodeId] = true;
    }
  } else {
    alertPlayed[nodeId] = false;

    // Hide banner only if ALL nodes are normal
    const anyDanger = Object.keys(nodeData).some(id =>
      nodeData[id].tilt >= TILT_THRESHOLD && nodeData[id].lastReceived > 0
    );
    if (!anyDanger) {
      document.getElementById('alert-banner').classList.remove('active');
      alertDismissed = false;
    }
  }
}

function dismissAlert() {
  document.getElementById('alert-banner').classList.remove('active');
  alertDismissed = true;
}

// =====================================
// AUDIO ALERT
// =====================================
function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Beep 1
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.frequency.value = 800;
    osc1.type = 'square';
    gain1.gain.value = 0.2;
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.15);

    // Beep 2 (higher pitch)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.frequency.value = 1000;
    osc2.type = 'square';
    gain2.gain.value = 0.2;
    osc2.start(ctx.currentTime + 0.2);
    osc2.stop(ctx.currentTime + 0.35);

    // Beep 3 (highest)
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.frequency.value = 1200;
    osc3.type = 'square';
    gain3.gain.value = 0.2;
    osc3.start(ctx.currentTime + 0.4);
    osc3.stop(ctx.currentTime + 0.6);
  } catch (e) {
    console.warn('[Audio] Tidak bisa memutar suara alert:', e);
  }
}

function toggleMute() {
  isMuted = !isMuted;
  document.getElementById('btn-mute').textContent = isMuted ? '🔕' : '🔔';
}

// =====================================
// OFFLINE DETECTION
// =====================================
function checkOfflineNodes() {
  const now = Date.now();
  Object.keys(nodeData).forEach(nodeId => {
    const d = nodeData[nodeId];
    const suffix = nodeId === 'NODE_1' ? 'node1' : 'node2';
    const number = nodeId === 'NODE_1' ? '1' : '2';

    if (d.lastReceived > 0 && (now - d.lastReceived) > OFFLINE_TIMEOUT_MS) {
      const card = document.getElementById(`card-${suffix}`);
      const badge = document.getElementById(`badge-${suffix}`);
      const indicator = document.getElementById(`indicator-${suffix}`);

      card.className = 'node-card offline';
      badge.className = 'node-status-badge';
      badge.textContent = '⚫ Offline';
      badge.style.background = '#eeeeee';
      badge.style.color = '#757575';
      indicator.style.color = '#bdbdbd';

      // Update marker
      if (markers[nodeId]) {
        const offlineIcon = createMarkerIcon(number, 'offline');
        markers[nodeId].setIcon(offlineIcon);
      }
    }
  });
}
setInterval(checkOfflineNodes, 5000);

// =====================================
// CHARTS (Chart.js)
// =====================================
function initCharts() {
  const tiltCtx = document.getElementById('tiltChart').getContext('2d');
  const soilCtx = document.getElementById('soilChart').getContext('2d');

  // Threshold line plugin
  const thresholdPlugin = {
    id: 'thresholdLine',
    afterDraw(chart) {
      if (chart.canvas.id !== 'tiltChart') return;
      const yScale = chart.scales.y;
      const xScale = chart.scales.x;
      const ctx = chart.ctx;
      const yPos = yScale.getPixelForValue(TILT_THRESHOLD);

      if (yPos >= yScale.top && yPos <= yScale.bottom) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(xScale.left, yPos);
        ctx.lineTo(xScale.right, yPos);
        ctx.strokeStyle = 'rgba(211, 47, 47, 0.7)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();

        ctx.fillStyle = 'rgba(211, 47, 47, 0.8)';
        ctx.font = '11px Inter';
        ctx.fillText(`Batas Bahaya (${TILT_THRESHOLD}°)`, xScale.left + 8, yPos - 6);
        ctx.restore();
      }
    }
  };

  tiltChart = new Chart(tiltCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Node 1',
          data: [],
          borderColor: '#2196F3',
          backgroundColor: 'rgba(33, 150, 243, 0.1)',
          borderWidth: 2,
          pointRadius: 1,
          fill: true,
          tension: 0.3
        },
        {
          label: 'Node 2',
          data: [],
          borderColor: '#FF9800',
          backgroundColor: 'rgba(255, 152, 0, 0.1)',
          borderWidth: 2,
          pointRadius: 1,
          fill: true,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      animation: false,
      interaction: { intersect: false, mode: 'index' },
      scales: {
        x: {
          title: { display: true, text: 'Waktu' },
          ticks: { maxTicksLimit: 12, font: { size: 10 } }
        },
        y: {
          title: { display: true, text: 'Kemiringan (°)' },
          min: 0,
          suggestedMax: 60
        }
      },
      plugins: {
        legend: { position: 'top' }
      }
    },
    plugins: [thresholdPlugin]
  });

  soilChart = new Chart(soilCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Node 1',
          data: [],
          borderColor: '#2196F3',
          backgroundColor: 'rgba(33, 150, 243, 0.1)',
          borderWidth: 2,
          pointRadius: 1,
          fill: true,
          tension: 0.3
        },
        {
          label: 'Node 2',
          data: [],
          borderColor: '#FF9800',
          backgroundColor: 'rgba(255, 152, 0, 0.1)',
          borderWidth: 2,
          pointRadius: 1,
          fill: true,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      animation: false,
      interaction: { intersect: false, mode: 'index' },
      scales: {
        x: {
          title: { display: true, text: 'Waktu' },
          ticks: { maxTicksLimit: 12, font: { size: 10 } }
        },
        y: {
          title: { display: true, text: 'Kelembapan (%)' },
          min: 0,
          max: 100
        }
      },
      plugins: {
        legend: { position: 'top' }
      }
    }
  });
}

// Fetch historical data dari API Node-RED
function fetchHistory() {
  const apiUrl = `http://${window.location.hostname}:1880/api/history?hours=24`;

  fetch(apiUrl)
    .then(res => res.json())
    .then(result => {
      if (!result.success || !result.data) return;

      const node1Data = result.data.filter(d => d.node === 'NODE_1');
      const node2Data = result.data.filter(d => d.node === 'NODE_2');

      // Time labels (dari semua data, ambil unik)
      const allTimes = result.data.map(d => {
        const dt = new Date(d.timestamp);
        return dt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      });
      const uniqueTimes = [...new Set(allTimes)];

      // Build chart data
      const formatChartData = (nodeArr, key) => {
        return nodeArr.map(d => d[key]);
      };

      const node1Labels = node1Data.map(d => {
        const dt = new Date(d.timestamp);
        return dt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      });
      const node2Labels = node2Data.map(d => {
        const dt = new Date(d.timestamp);
        return dt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      });

      // Gunakan label terbanyak
      const labels = node1Labels.length >= node2Labels.length ? node1Labels : node2Labels;

      // Tilt Chart
      tiltChart.data.labels = labels;
      tiltChart.data.datasets[0].data = formatChartData(node1Data, 'tilt');
      tiltChart.data.datasets[1].data = formatChartData(node2Data, 'tilt');
      tiltChart.update();

      // Soil Chart
      soilChart.data.labels = labels;
      soilChart.data.datasets[0].data = formatChartData(node1Data, 'soil');
      soilChart.data.datasets[1].data = formatChartData(node2Data, 'soil');
      soilChart.update();

      console.log('[Chart] Data historis dimuat:', result.data.length, 'records');
    })
    .catch(err => {
      console.warn('[Chart] Gagal memuat data historis:', err.message);
    });
}

// =====================================
// INITIALIZE
// =====================================
document.addEventListener('DOMContentLoaded', () => {
  console.log('=== EWS Margorejo Dashboard ===');
  console.log('Threshold kemiringan:', TILT_THRESHOLD + '°');
  console.log('Kalibrasi tip:', ML_PER_TIP, 'ml/tip');

  // Init map
  initMap();

  // Init charts
  initCharts();

  // Connect WebSocket
  connectWebSocket();

  // Fetch historical data
  setTimeout(fetchHistory, 1000);

  // Refresh history setiap 5 menit
  setInterval(fetchHistory, 5 * 60 * 1000);
});
