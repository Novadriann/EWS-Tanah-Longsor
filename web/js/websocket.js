/**
 * ====================================================
 * EWS LAB RISET — WEBSOCKET MODULE
 * File  : web/js/websocket.js
 * Berisi: Koneksi WebSocket real-time ke Node-RED,
 *         auto-reconnect, update status indikator
 * Depends: dashboard.js (updateDashboard, state)
 * ====================================================
 */

'use strict';

/* --------------------------------------------------
   KONFIGURASI
   -------------------------------------------------- */
var WS_RECONNECT_MS = 3000;   // Coba reconnect setiap 3 detik
var wsConn          = null;

/* --------------------------------------------------
   BUAT / BUKA KONEKSI
   -------------------------------------------------- */
function connectWebSocket() {
  var url = 'ws://' + window.location.hostname + ':1880/ws/ews';
  console.log('[WS] Menghubungkan ke:', url);

  wsConn = new WebSocket(url);

  /* ---- OPEN ---- */
  wsConn.onopen = function () {
    console.log('[WS] ✅ Terhubung!');
    setWsStatus('connected', '● Terhubung');
  };

  /* ---- CLOSE ---- */
  wsConn.onclose = function () {
    console.warn('[WS] ⚠️ Terputus — mencoba ulang dalam', WS_RECONNECT_MS / 1000, 'detik...');
    setWsStatus('disconnected', '● Terputus');
    setTimeout(connectWebSocket, WS_RECONNECT_MS);
  };

  /* ---- ERROR ---- */
  wsConn.onerror = function (err) {
    console.error('[WS] ❌ Error:', err);
    setWsStatus('disconnected', '● Error');
  };

  /* ---- MESSAGE ---- */
  wsConn.onmessage = function (event) {
    try {
      var data = JSON.parse(event.data);
      /* Validasi field wajib */
      if (!data.node || typeof data.tilt === 'undefined') {
        console.warn('[WS] Paket tidak lengkap, diabaikan:', data);
        return;
      }
      updateDashboard(data);
    } catch (e) {
      console.warn('[WS] Payload tidak valid JSON:', event.data);
    }
  };
}

/* --------------------------------------------------
   UPDATE UI STATUS INDICATOR
   -------------------------------------------------- */
function setWsStatus(state, label) {
  var el = document.getElementById('wsStatus');
  if (!el) return;

  el.className = 'ws-status ws-' + state;
  var labelEl  = el.querySelector('.ws-label');
  if (labelEl) labelEl.textContent = label;
}

/* --------------------------------------------------
   START saat DOM siap
   -------------------------------------------------- */
document.addEventListener('DOMContentLoaded', connectWebSocket);
