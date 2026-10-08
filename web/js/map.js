/**
 * ====================================================
 * EWS LAB RISET — MAP MODULE
 * File  : web/js/map.js
 * Berisi: Inisialisasi Leaflet, marker, popup
 * Depends: Leaflet.js (di-load di dashboard.html)
 *          dashboard.js (CONFIG, state)
 * ====================================================
 */

'use strict';

/* --------------------------------------------------
   VARIABLES
   -------------------------------------------------- */
var leafletMap  = null;
var mapMarkers  = {};
var mapPopups   = {};

/* --------------------------------------------------
   INIT MAP — dipanggil saat DOMContentLoaded
   -------------------------------------------------- */
function initMap() {
  var centerLat = (CONFIG.NODES.NODE_1.lat + CONFIG.NODES.NODE_2.lat) / 2;
  var centerLng = (CONFIG.NODES.NODE_1.lng + CONFIG.NODES.NODE_2.lng) / 2;

  leafletMap = L.map('map', {
    center:      [centerLat, centerLng],
    zoom:        19,
    zoomControl: true
  });

  /* Layer: OpenStreetMap */
  var osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom:     22,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  });

  /* Layer: Esri Satellite */
  var satLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom:     22,
      attribution: '© Esri — Tiles &copy; Esri'
    }
  );

  /* Default = OpenStreetMap */
  osmLayer.addTo(leafletMap);

  /* Layer Switcher */
  L.control.layers(
    { 'Peta Jalan (OSM)': osmLayer, 'Foto Satelit': satLayer },
    null,
    { position: 'topright' }
  ).addTo(leafletMap);

  /* Buat marker untuk setiap node */
  Object.keys(CONFIG.NODES).forEach(function (nodeId) {
    var node   = CONFIG.NODES[nodeId];
    var icon   = buildMarkerIcon(node.number, 'normal');
    var popup  = L.popup({ maxWidth: 300, className: 'ews-popup-container', closeButton: true });

    popup.setContent(buildPopupContent(nodeId, state.nodeData[nodeId], false));

    var marker = L.marker([node.lat, node.lng], { icon: icon })
      .addTo(leafletMap)
      .bindPopup(popup);

    mapMarkers[nodeId] = marker;
    mapPopups[nodeId]  = popup;
  });

  /* Auto fit bounds jika kedua node memiliki koordinat berbeda */
  if (CONFIG.NODES.NODE_1.lat !== CONFIG.NODES.NODE_2.lat || CONFIG.NODES.NODE_1.lng !== CONFIG.NODES.NODE_2.lng) {
    var initBounds = L.latLngBounds(
      Object.keys(CONFIG.NODES).map(function (id) {
        return [CONFIG.NODES[id].lat, CONFIG.NODES[id].lng];
      })
    );
    leafletMap.fitBounds(initBounds.pad(0.3), { maxZoom: 19 });
  }
}

/* --------------------------------------------------
   BUILD CUSTOM MARKER ICON
   -------------------------------------------------- */
function buildMarkerIcon(number, status) {
  /* status: 'normal' | 'danger' | 'offline' */
  var ringHtml = '';
  if (status === 'danger') {
    ringHtml = '<div class="ews-marker-ring danger"></div>';
  }

  var html = [
    '<div class="ews-marker-wrap">',
      ringHtml,
      '<div class="ews-marker-circle ' + status + '">' + number + '</div>',
    '</div>'
  ].join('');

  return L.divIcon({
    className:   '',
    html:        html,
    iconSize:    [34, 34],
    iconAnchor:  [17, 17],
    popupAnchor: [0, -22]
  });
}

/* --------------------------------------------------
   BUILD POPUP HTML CONTENT
   -------------------------------------------------- */
function buildPopupContent(nodeId, d, isDanger) {
  var node       = CONFIG.NODES[nodeId];
  var statusText = isDanger ? '🚨 BAHAYA' : '✅ Normal';
  var statusCls  = isDanger ? 'danger' : 'normal';
  var timeStr    = d.timestamp
    ? new Date(d.timestamp).toLocaleTimeString('id-ID')
    : '--:--:--';
  var rainMl     = (d.tip * CONFIG.ML_PER_TIP).toFixed(1);
  var tiltCls    = isDanger ? ' danger' : '';

  return [
    '<div class="popup-wrap">',
      '<div class="popup-header">',
        '<div class="popup-node-label">NODE ' + node.number + '</div>',
        '<div class="popup-location">📍 ' + node.name + '</div>',
        '<span class="popup-status-badge ' + statusCls + '">' + statusText + '</span>',
      '</div>',
      '<div class="popup-body">',
        popupRow('🔺', 'Kemiringan', '<span class="popup-row-value' + tiltCls + '">' + d.tilt.toFixed(2) + '°</span>'),
        popupRow('💧', 'Kelembapan', d.soil + '%'),
        popupRow('🌧️', 'Curah Hujan', d.tip + ' tip (' + rainMl + ' ml)'),
        popupRow('📶', 'RSSI', d.rssi + ' dBm'),
        popupRow('📡', 'SNR', d.snr + ' dB'),
        popupRow('⏰', 'Update', timeStr),
      '</div>',
    '</div>'
  ].join('');
}

function popupRow(icon, label, value) {
  var valueHtml = (typeof value === 'string' && value.indexOf('class=') !== -1)
    ? value
    : '<span class="popup-row-value">' + value + '</span>';

  return [
    '<div class="popup-row">',
      '<span class="popup-row-label">' + icon + ' ' + label + '</span>',
      valueHtml,
    '</div>'
  ].join('');
}

/* --------------------------------------------------
   UPDATE MARKER — dipanggil dari dashboard.js
   -------------------------------------------------- */
function updateMapMarker(nodeId, d, isDanger, isOffline) {
  var node   = CONFIG.NODES[nodeId];
  var status = isOffline ? 'offline' : (isDanger ? 'danger' : 'normal');
  var icon   = buildMarkerIcon(node.number, status);

  if (mapMarkers[nodeId]) {
    mapMarkers[nodeId].setIcon(icon);
  }

  if (mapPopups[nodeId]) {
    mapPopups[nodeId].setContent(buildPopupContent(nodeId, d, isDanger));
  }
}

/* --------------------------------------------------
   UPDATE NODE POSITION — dipanggil dari dashboard.js
   saat user mengubah koordinat di Settings
   -------------------------------------------------- */
function updateNodePosition(nodeId, lat, lng) {
  CONFIG.NODES[nodeId].lat = lat;
  CONFIG.NODES[nodeId].lng = lng;

  // Pindahkan marker
  if (mapMarkers[nodeId]) {
    mapMarkers[nodeId].setLatLng([lat, lng]);
  }

  // Refresh popup jika ada data
  if (mapPopups[nodeId] && typeof state !== 'undefined' && state.nodeData && state.nodeData[nodeId]) {
    var d = state.nodeData[nodeId];
    var isDanger = d.tilt >= (CONFIG.TILT_THRESHOLD || 45);
    mapPopups[nodeId].setContent(buildPopupContent(nodeId, d, isDanger));
  }

  // Re-center & fit peta ke semua node
  if (leafletMap) {
    var bounds = L.latLngBounds(
      Object.keys(CONFIG.NODES).map(function (id) {
        return [CONFIG.NODES[id].lat, CONFIG.NODES[id].lng];
      })
    );
    leafletMap.fitBounds(bounds.pad(0.3), { maxZoom: 19 });
  }
}

/* --------------------------------------------------
   START
   -------------------------------------------------- */
document.addEventListener('DOMContentLoaded', initMap);
