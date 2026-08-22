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
      lat:       -7.941043,
      lng:       110.404573,
      name:      'Sampok Utara',
      shortName: 'Node 1',
      number:    '1'
    },
    NODE_2: {
      lat:       -7.941133,
      lng:       110.404663,
      name:      'Sampok Selatan',
      shortName: 'Node 2',
      number:    '2'
    }
  }
};

/* --------------------------------------------------
   SHARED STATE
   -------------------------------------------------- */
const state = {
  isMuted: false,
  alertDismissed: false,
  alertPlayed: { NODE_1: false, NODE_2: false },
  nodeData: {
    NODE_1: { tilt:0, soil:0, hall:0, mag:0, tip:0, rain:0, rssi:0, snr:0, timestamp:null, lastReceived:0 },
    NODE_2: { tilt:0, soil:0, hall:0, mag:0, tip:0, rain:0, rssi:0, snr:0, timestamp:null, lastReceived:0 }
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
