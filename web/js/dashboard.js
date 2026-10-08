/**
 * ====================================================
 * EWS LAB RISET — DASHBOARD CORE JAVASCRIPT
 * File  : web/js/dashboard.js
 * Berisi: Auth check, state management, UI updater,
 *         alert logic, clock, mute toggle, logout
 * ====================================================
 */

'use strict';

/* --------------------------------------------------
   AUTH GUARD — Redirect jika belum login
   -------------------------------------------------- */
(function authGuard() {
  if (!localStorage.getItem('ews_auth')) {
    window.location.href = 'index.html';
  }
})();

function logout() {
  localStorage.removeItem('ews_auth');
  window.location.href = 'index.html';
}

/* --------------------------------------------------
   GLOBAL CONFIGURATION
   -------------------------------------------------- */
const CONFIG = {
  TILT_THRESHOLD:    45,     // derajat — batas bahaya
  ML_PER_TIP:        3.67,   // mL per tip tipping bucket
  OFFLINE_TIMEOUT:   30000,  // 30 detik → offline
  NODES: {
    NODE_1: {
      lat:       -7.77,
      lng:       110.37,
      name:      'Node 1',
      shortName: 'Node 1',
      number:    '1'
    },
    NODE_2: {
      lat:       -7.77,
      lng:       110.37,
      name:      'Node 2',
      shortName: 'Node 2',
      number:    '2'
    }
  }
};

/* --------------------------------------------------
   LOAD NODE CONFIG FROM localStorage
   -------------------------------------------------- */
(function loadNodeConfig() {
  var saved = localStorage.getItem('ews_node_config');
  if (saved) {
    try {
      var parsed = JSON.parse(saved);
      Object.keys(parsed).forEach(function (nodeId) {
        if (CONFIG.NODES[nodeId]) {
          if (parsed[nodeId].lat !== undefined) CONFIG.NODES[nodeId].lat = parsed[nodeId].lat;
          if (parsed[nodeId].lng !== undefined) CONFIG.NODES[nodeId].lng = parsed[nodeId].lng;
          if (parsed[nodeId].name) {
            CONFIG.NODES[nodeId].name      = parsed[nodeId].name;
            CONFIG.NODES[nodeId].shortName = parsed[nodeId].name;
          }
        }
      });
    } catch (e) { /* abaikan JSON tidak valid */ }
  }
})();

/* --------------------------------------------------
   SHARED STATE
   -------------------------------------------------- */
const state = {
  isMuted: false,
  alertDismissed: false,
  alertPlayed: { NODE_1: false, NODE_2: false },
  nodeData: {
    NODE_1: { tilt:0, soil:0, hall:0, mag:0, tip:0, rain:0, rssi:0, snr:0, temp:0, hum:0, timestamp:null, lastReceived:0 },
    NODE_2: { tilt:0, soil:0, hall:0, mag:0, tip:0, rain:0, rssi:0, snr:0, temp:0, hum:0, timestamp:null, lastReceived:0 }
  }
};

/* --------------------------------------------------
   CLOCK
   -------------------------------------------------- */
(function startClock() {
  function tick() {
    const el = document.getElementById('clock');
    if (el) {
      el.textContent = new Date().toLocaleTimeString('id-ID', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    }
  }
  tick();
  setInterval(tick, 1000);
})();

/* --------------------------------------------------
   MUTE TOGGLE
   -------------------------------------------------- */
function toggleMute() {
  state.isMuted = !state.isMuted;
  const btn = document.getElementById('btnMute');
  if (btn) btn.textContent = state.isMuted ? '🔕' : '🔔';
}

/* --------------------------------------------------
   ALERT BANNER
   -------------------------------------------------- */
function showAlertBanner(nodeId, tilt) {
  if (state.alertDismissed) return;
  const banner = document.getElementById('alertBanner');
  const detail = document.getElementById('alertDetail');
  if (!banner || !detail) return;

  detail.textContent =
    CONFIG.NODES[nodeId].shortName +
    ': Kemiringan ' + tilt.toFixed(2) + '° melebihi batas aman ' +
    CONFIG.TILT_THRESHOLD + '°';

  banner.classList.add('active');
}

function hideAlertBannerIfSafe() {
  const anyDanger = Object.keys(state.nodeData).some(function (id) {
    const d = state.nodeData[id];
    return d.lastReceived > 0 && d.tilt >= CONFIG.TILT_THRESHOLD;
  });
  if (!anyDanger) {
    const banner = document.getElementById('alertBanner');
    if (banner) banner.classList.remove('active');
    state.alertDismissed = false;
  }
}

function dismissAlertBanner() {
  const banner = document.getElementById('alertBanner');
  if (banner) banner.classList.remove('active');
  state.alertDismissed = true;
}

/* --------------------------------------------------
   AUDIO ALERT
   -------------------------------------------------- */
function playAlert() {
  if (state.isMuted) return;
  try {
    var ctx  = new (window.AudioContext || window.webkitAudioContext)();
    var times = [[800, 0], [1050, 0.22], [1300, 0.44]];

    times.forEach(function (pair) {
      var osc  = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = pair[0];
      osc.type            = 'square';
      gain.gain.value     = 0.18;
      osc.start(ctx.currentTime + pair[1]);
      osc.stop(ctx.currentTime  + pair[1] + 0.15);
    });
  } catch (e) {
    // Browser tidak mendukung Web Audio API
  }
}

/* --------------------------------------------------
   MAIN UPDATE FUNCTION — dipanggil oleh websocket.js
   -------------------------------------------------- */
function updateDashboard(data) {
  var nodeId = data.node;
  if (!state.nodeData[nodeId]) return;

  /* Simpan ke state */
  state.nodeData[nodeId] = {
    tilt:         parseFloat(data.tilt)  || 0,
    soil:         parseInt(data.soil)    || 0,
    hall:         parseInt(data.hall)    || 0,
    mag:          parseInt(data.mag)     || 0,
    tip:          parseInt(data.tip)     || 0,
    rain:         parseFloat(data.rain)  || 0,
    rssi:         parseInt(data.rssi)    || 0,
    snr:          parseFloat(data.snr)   || 0,
    temp:         parseFloat(data.temp)  || 0,
    hum:          parseFloat(data.hum)   || 0,
    timestamp:    data.timestamp || new Date().toISOString(),
    lastReceived: Date.now()
  };

  var d        = state.nodeData[nodeId];
  var isDanger = d.tilt >= CONFIG.TILT_THRESHOLD;
  var suffix   = nodeId === 'NODE_1' ? 'Node1' : 'Node2';

  /* ---- Update Sidebar Card ---- */
  var card  = document.getElementById('card' + suffix);
  var chip  = document.getElementById('chip' + suffix);
  var badge = document.getElementById('nodeBadge' + suffix);

  if (card)  card.dataset.state  = isDanger ? 'danger' : 'normal';
  if (chip) {
    chip.className = 'node-status-chip ' + (isDanger ? 'danger' : 'normal');
    chip.textContent = isDanger ? '🚨 BAHAYA' : '✅ Normal';
  }

  setText('tilt' + suffix, d.tilt.toFixed(2) + '°');
  setText('soil' + suffix, d.soil + '%');
  setText('rain' + suffix, d.tip + ' tip');
  setText('rssi' + suffix, d.rssi + ' dBm');
  setText('temp' + suffix, d.temp.toFixed(1) + '°C');
  setText('hum'  + suffix, d.hum.toFixed(1) + '%');
  setText('time' + suffix, new Date(d.timestamp).toLocaleTimeString('id-ID'));

  /* ---- Alert ---- */
  if (isDanger) {
    showAlertBanner(nodeId, d.tilt);
    if (!state.alertPlayed[nodeId]) {
      playAlert();
      state.alertPlayed[nodeId] = true;
    }
  } else {
    state.alertPlayed[nodeId] = false;
    hideAlertBannerIfSafe();
  }

  /* ---- Notifikasi ke Map (map.js) ---- */
  if (typeof updateMapMarker === 'function') {
    updateMapMarker(nodeId, d, isDanger);
  }
}

/* --------------------------------------------------
   OFFLINE DETECTION
   -------------------------------------------------- */
setInterval(function () {
  var now = Date.now();
  ['NODE_1', 'NODE_2'].forEach(function (nodeId) {
    var d      = state.nodeData[nodeId];
    var suffix = nodeId === 'NODE_1' ? 'Node1' : 'Node2';
    var card   = document.getElementById('card' + suffix);
    var chip   = document.getElementById('chip' + suffix);

    if (d.lastReceived > 0 && (now - d.lastReceived) > CONFIG.OFFLINE_TIMEOUT) {
      if (card && card.dataset.state !== 'offline') {
        card.dataset.state = 'offline';
        if (chip) {
          chip.className   = 'node-status-chip offline';
          chip.textContent = '⚫ Offline';
        }
        if (typeof updateMapMarker === 'function') {
          updateMapMarker(nodeId, d, false, true);
        }
      }
    }
  });
}, 5000);

/* --------------------------------------------------
   HELPER
   -------------------------------------------------- */
function setText(id, value) {
  var el = document.getElementById(id);
  if (el) el.textContent = value;
}

/* --------------------------------------------------
   LOCATION SETTINGS MODAL
   -------------------------------------------------- */
function openLocationSettings() {
  var modal = document.getElementById('locationModal');
  if (!modal) return;
  // Isi field dari CONFIG saat ini
  document.getElementById('lat1').value = CONFIG.NODES.NODE_1.lat;
  document.getElementById('lng1').value = CONFIG.NODES.NODE_1.lng;
  document.getElementById('name1').value = CONFIG.NODES.NODE_1.name;
  document.getElementById('lat2').value = CONFIG.NODES.NODE_2.lat;
  document.getElementById('lng2').value = CONFIG.NODES.NODE_2.lng;
  document.getElementById('name2').value = CONFIG.NODES.NODE_2.name;
  modal.classList.add('active');
}

function closeLocationSettings() {
  var modal = document.getElementById('locationModal');
  if (modal) modal.classList.remove('active');
}

function saveLocationSettings() {
  var lat1  = parseFloat(document.getElementById('lat1').value);
  var lng1  = parseFloat(document.getElementById('lng1').value);
  var name1 = document.getElementById('name1').value.trim() || 'Node 1';
  var lat2  = parseFloat(document.getElementById('lat2').value);
  var lng2  = parseFloat(document.getElementById('lng2').value);
  var name2 = document.getElementById('name2').value.trim() || 'Node 2';

  // Validasi koordinat
  if (isNaN(lat1) || lat1 < -90 || lat1 > 90 ||
      isNaN(lng1) || lng1 < -180 || lng1 > 180 ||
      isNaN(lat2) || lat2 < -90 || lat2 > 90 ||
      isNaN(lng2) || lng2 < -180 || lng2 > 180) {
    alert('Koordinat tidak valid!\nLatitude: -90 s/d 90\nLongitude: -180 s/d 180');
    return;
  }

  // Update CONFIG
  CONFIG.NODES.NODE_1.lat  = lat1;
  CONFIG.NODES.NODE_1.lng  = lng1;
  CONFIG.NODES.NODE_1.name = name1;
  CONFIG.NODES.NODE_1.shortName = name1;
  CONFIG.NODES.NODE_2.lat  = lat2;
  CONFIG.NODES.NODE_2.lng  = lng2;
  CONFIG.NODES.NODE_2.name = name2;
  CONFIG.NODES.NODE_2.shortName = name2;

  // Simpan ke localStorage
  localStorage.setItem('ews_node_config', JSON.stringify({
    NODE_1: { lat: lat1, lng: lng1, name: name1 },
    NODE_2: { lat: lat2, lng: lng2, name: name2 }
  }));

  // Update label di sidebar card
  updateNodeLabels();

  // Update posisi marker di peta (map.js)
  if (typeof updateNodePosition === 'function') {
    updateNodePosition('NODE_1', lat1, lng1);
    updateNodePosition('NODE_2', lat2, lng2);
  }

  closeLocationSettings();
}

function updateNodeLabels() {
  setText('nameNode1', CONFIG.NODES.NODE_1.name);
  setText('nameNode2', CONFIG.NODES.NODE_2.name);
  // Update koordinat di legend
  var coordEl = document.getElementById('legendCoords');
  if (coordEl) {
    coordEl.textContent =
      'N1: ' + CONFIG.NODES.NODE_1.lat.toFixed(6) + ', ' + CONFIG.NODES.NODE_1.lng.toFixed(6) +
      '  |  N2: ' + CONFIG.NODES.NODE_2.lat.toFixed(6) + ', ' + CONFIG.NODES.NODE_2.lng.toFixed(6);
  }
}

/* Inisialisasi label saat halaman dimuat */
document.addEventListener('DOMContentLoaded', updateNodeLabels);

