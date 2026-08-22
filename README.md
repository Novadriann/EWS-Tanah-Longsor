# ⚠️ EWS Lab Riset Elektronika dan Instrumentasi
## Sistem Peringatan Dini Tanah Longsor

Sistem Early Warning System (EWS) untuk mendeteksi potensi tanah longsor menggunakan sensor kemiringan (ADXL345), curah hujan (tipping bucket), dan kelembapan tanah. Data dikirim via LoRa ke gateway, diteruskan ke Node-RED, dan ditampilkan secara real-time di web dashboard interaktif bertemakan cokelat/earth-tone.

**📍 Lokasi:** Sampok, Sriharjo, Imogiri, Bantul, DIY  
**🎓 Proyek:** PKM 2026  
**🏫 Lab Riset Elektronika dan Instrumentasi — Universitas Gadjah Mada**

---

## 📐 Arsitektur Sistem

```
[T-BEAM NODE 1] ──LoRa──┐
                         ├──> [T-BEAM RECEIVER] ──WiFi──> [MQTT Mosquitto :1883]
[T-BEAM NODE 2] ──LoRa──┘                                       │
                                                                 ▼
                                                          [NODE-RED :1880]
                                                           │  │  │  │
                                                           │  │  │  └──> 📱 Telegram Bot (Alert + Cooldown 5 menit)
                                                           │  │  └─────> 💾 SQLite (Database historis)
                                                           │  └────────> 🌐 WebSocket /ws/ews (Real-time)
                                                           └───────────> 📊 REST API /api/history & /api/latest
                                                                              │
                                                                              ▼
                                                                    [WEB BROWSER / Dashboard]
```

---

## 📦 Struktur Folder

```
WEB EWS/
├── README.md                                    ← Dokumentasi ini
│
├── arduino/
│   ├── transmitter_node1/
│   │   └── transmitter_node1.ino               ← Kode sensor NODE 1 (interval 5000ms)
│   ├── transmitter_node2/
│   │   └── transmitter_node2.ino               ← Kode sensor NODE 2 (interval 5300ms)
│   └── receiver/
│       └── receiver.ino                        ← Kode gateway: LoRa → WiFi → MQTT
│
├── web/                                        ← Folder statis (httpStatic Node-RED)
│   ├── index.html                              ← Halaman login (2 kolom, hero panel)
│   ├── dashboard.html                          ← Dashboard utama (peta + sidebar + grafik)
│   │
│   ├── css/                                    ← Stylesheet dipisah per halaman/fungsi
│   │   ├── login.css                           ← Gaya khusus halaman login
│   │   ├── dashboard.css                       ← Layout dashboard, sidebar, node card, chart
│   │   └── map.css                             ← Gaya Leaflet map, marker, popup
│   │
│   └── js/                                     ← JavaScript dipisah per modul/fungsi
│       ├── login.js                            ← Auth, toggle password, redirect
│       ├── dashboard.js                        ← State, clock, alert banner, audio, offline
│       ├── map.js                              ← Leaflet map init, marker, popup builder
│       ├── chart.js                            ← Chart.js historis, threshold line plugin
│       └── websocket.js                        ← Koneksi WebSocket Node-RED, auto-reconnect
│
└── node-red/
    └── flows.json                              ← Flow Node-RED (siap import)
```

> ℹ️ **Catatan Revisi v2:** File web kini dipisahkan secara modular (1 file per fungsi/bahasa) untuk kemudahan pemeliharaan. File lama `style.css` dan `app.js` sudah dihapus dan digantikan oleh file-file di atas.

---

## ⚙️ Kebutuhan (Prerequisites)

### Hardware
| Komponen | Jumlah | Keterangan |
|----------|--------|------------|
| LILYGO T-BEAM V1.2 | 3 | 2 transmitter + 1 receiver |
| ADXL345 Accelerometer | 2 | Sensor kemiringan |
| Hall Effect Sensor | 2 | Tipping bucket (curah hujan) |
| Soil Moisture Sensor | 2 | Kelembapan tanah |

### Software
- [Arduino IDE](https://www.arduino.cc/en/software) (atau PlatformIO)
- [Node.js](https://nodejs.org/) (versi 18+)
- [Node-RED](https://nodered.org/) v3+
- [Mosquitto MQTT Broker](https://mosquitto.org/download/)

### Library Arduino (Install via Library Manager)
- `LoRa` by Sandeep Mistry
- `Adafruit ADXL345` by Adafruit
- `Adafruit Unified Sensor` by Adafruit
- `PubSubClient` by Nick O'Leary

---

## 🚀 Instalasi & Setup

### Langkah 1 — Install Mosquitto MQTT Broker

**Windows:**
1. Download dari https://mosquitto.org/download/
2. Install (centang semua default)
3. Buka **PowerShell sebagai Administrator**, jalankan:
   ```powershell
   net start mosquitto
   ```
4. Verifikasi berjalan:
   ```powershell
   Get-Service mosquitto
   # Status harus: Running
   ```

### Langkah 2 — Install Node-RED

```powershell
# Install Node-RED secara global
npm install -g node-red
```

### Langkah 3 — Install Plugin Node-RED (SQLite & Telegram)

```powershell
# Masuk ke direktori konfigurasi Node-RED
cd $env:USERPROFILE\.node-red

# Install kedua plugin
npm install node-red-node-sqlite
npm install node-red-contrib-telegrambot

# Setujui script instalasi sqlite3
npm install-scripts approve sqlite3
```

### Langkah 4 — Konfigurasi httpStatic (Penting!)

Edit file `settings.js` Node-RED:
- Lokasi file: `C:\Users\<username>\.node-red\settings.js`

Cari baris yang mengandung `//httpStatic:`, hapus tanda `//` dan ubah nilainya:

```javascript
httpStatic: 'D:/KULIAH/PKM - Margorejo/WEB EWS/web',
```

> ⚠️ **Sesuaikan path dengan lokasi folder `web` di komputermu!**  
> Gunakan forward slash (`/`) bukan backslash (`\`).  
> Konfigurasi ini sudah dilakukan jika mengikuti setup sebelumnya — cukup verifikasi saja.

### Langkah 5 — Salin & Import Flow Node-RED

**Cara tercepat (salin file langsung):**
```powershell
Copy-Item "d:\KULIAH\PKM - Margorejo\WEB EWS\node-red\flows.json" "$env:USERPROFILE\.node-red\flows.json" -Force
```

**Atau via UI Node-RED (jika sudah ada flow lain):**
1. Buka Node-RED: http://localhost:1880
2. Klik menu ☰ (kanan atas) → **Import** → **Clipboard**
3. Buka file `node-red/flows.json`, salin semua isinya, paste, klik **Import**
4. Klik tombol **Deploy** (merah, kanan atas)

### Langkah 6 — Konfigurasi Telegram Bot (Opsional)

> Lewati langkah ini jika belum membutuhkan notifikasi Telegram.

1. Buka Telegram → cari **@BotFather** → ketik `/newbot` → ikuti instruksi
2. Copy **Token bot** yang diberikan
3. Cari **@userinfobot** untuk mendapatkan **Chat ID**-mu
4. Di Node-RED, double-click node **📱 Kirim Telegram**:
   - Klik ikon pensil → masukkan **Bot Name** & **Token** → Update
5. Double-click node **🚨 Alert Logic** → cari baris `chatId: ''` → isi dengan Chat ID-mu
6. Klik **Deploy**
7. **Ganti URL Telegram di web:** Buka `web/index.html` dan `web/dashboard.html`, cari teks `https://t.me/YourBotUsername`, ganti dengan username bot-mu (contoh: `https://t.me/EWSLabBot`)

### Langkah 7 — Jalankan Server

```powershell
# Jalankan Node-RED (terminal baru, biarkan tetap terbuka)
node-red
```

Tunggu hingga muncul pesan:
```
[info] Server now running at http://127.0.0.1:1880/
[info] Started flows
[info] [mqtt-broker:Mosquitto Lokal] Connected to broker: mqtt://localhost:1883
```

> ℹ️ Mosquitto sudah berjalan otomatis sebagai Windows Service — tidak perlu dijalankan manual setiap kali.

---

## 📡 Upload Kode Arduino

### Transmitter NODE 1
1. Buka `arduino/transmitter_node1/transmitter_node1.ino` di Arduino IDE
2. Pilih Board: **ESP32 Dev Module** (atau TTGO LoRa T-Beam)
3. Pilih Port yang sesuai
4. Upload ke T-BEAM pertama (NODE 1)

### Transmitter NODE 2
1. Buka `arduino/transmitter_node2/transmitter_node2.ino`
2. Upload ke T-BEAM kedua (NODE 2)

### Receiver Gateway
1. Buka `arduino/receiver/receiver.ino`
2. **WAJIB EDIT** 3 baris berikut sebelum upload:
   ```cpp
   const char* ssid        = "NAMA_WIFI_KAMU";
   const char* password    = "PASSWORD_WIFI_KAMU";
   const char* mqtt_server = "IP_LAPTOP_KAMU";  // Cari via: ipconfig
   ```
3. Upload ke T-BEAM ketiga (Receiver)

**Cara mendapatkan IP laptop:**
```powershell
ipconfig
# Cari: IPv4 Address . . . . . . : 10.x.x.x atau 192.168.x.x
```
> Pastikan receiver dan laptop terhubung ke **jaringan WiFi yang sama**.

---

## 🌐 Akses Dashboard

| Perangkat | URL | Keterangan |
|-----------|-----|------------|
| Laptop (lokal) | `http://localhost:1880/index.html` | Langsung |
| HP / laptop lain | `http://<IP_LAPTOP>:1880/index.html` | Harus 1 jaringan WiFi |
| Node-RED Editor | `http://localhost:1880` | Kelola flow |

**Kredensial Login:**
| Field | Nilai |
|-------|-------|
| Username | `admin` |
| Password | `ews2026` |

---

## 🧪 Testing Tanpa Hardware

Kirim data simulasi dari PowerShell/CMD untuk menguji dashboard:

```powershell
# ---- Kondisi Normal ----
# NODE 1 Normal
& "C:\Program Files\mosquitto\mosquitto_pub.exe" -h localhost -t "ews/lora_data" -m "NODE_1,SOIL:65,HALL:1,MAG:0,TIP:12,TILT:20.50,RAIN:44.04,RSSI:-65,SNR:8.5"

# NODE 2 Normal
& "C:\Program Files\mosquitto\mosquitto_pub.exe" -h localhost -t "ews/lora_data" -m "NODE_2,SOIL:45,HALL:1,MAG:0,TIP:8,TILT:14.20,RAIN:29.36,RSSI:-60,SNR:9.0"

# ---- Kondisi BAHAYA (tilt >= 45°) ----
# NODE 1 Bahaya — marker merah berkedip, banner alert, suara berbunyi
& "C:\Program Files\mosquitto\mosquitto_pub.exe" -h localhost -t "ews/lora_data" -m "NODE_1,SOIL:85,HALL:0,MAG:1,TIP:50,TILT:53.20,RAIN:183.50,RSSI:-72,SNR:6.5"

# NODE 2 Bahaya
& "C:\Program Files\mosquitto\mosquitto_pub.exe" -h localhost -t "ews/lora_data" -m "NODE_2,SOIL:90,HALL:0,MAG:1,TIP:60,TILT:48.75,RAIN:220.20,RSSI:-75,SNR:6.0"
```

> 💡 Jika `mosquitto_pub` tidak ditemukan di PATH, gunakan path lengkap seperti contoh di atas, atau tambahkan `C:\Program Files\mosquitto\` ke Environment Variables PATH.

---

## 📋 Format Data Sensor

Data dikirim dalam format string CSV, dipisahkan koma:

```
NODE_1,SOIL:65,HALL:1,MAG:0,TIP:12,TILT:26.91,RAIN:44.04,RSSI:-65,SNR:8.5
```

| Field | Keterangan | Satuan |
|-------|------------|--------|
| `NODE_x` | Identitas sensor (`NODE_1` atau `NODE_2`) | — |
| `SOIL` | Kelembapan tanah | % (0–100) |
| `HALL` | Status Hall effect sensor | 0/1 |
| `MAG` | Magnet terdeteksi | 0/1 |
| `TIP` | Total jumlah tip tipping bucket | count |
| `TILT` | Kemiringan tanah | derajat (°) |
| `RAIN` | Volume curah hujan (`TIP × 3,67 ml`) | ml |
| `RSSI` | Kekuatan sinyal LoRa (ditambah Receiver) | dBm |
| `SNR` | Signal-to-Noise Ratio (ditambah Receiver) | dB |

---

## 🚨 Sistem Alert

| Kondisi | Threshold | Aksi Otomatis |
|---------|-----------|---------------|
| **Normal** | Kemiringan < 45° | Marker hijau, status normal |
| **BAHAYA** | Kemiringan ≥ 45° | Marker merah berkedip (pulse), banner merah muncul, suara 3-nada, kirim Telegram |
| **Offline** | Tidak ada data > 30 detik | Marker abu-abu, status offline |

**Cooldown Telegram:** 5 menit per node — mencegah spam alert

---

## 🔧 Troubleshooting

| Masalah | Penyebab | Solusi |
|---------|----------|--------|
| WiFi tidak konek (Receiver) | SSID/password salah | Periksa & upload ulang `receiver.ino` |
| MQTT error di Node-RED | Mosquitto tidak berjalan | `net start mosquitto` (sebagai Admin) |
| LoRa tidak terima data | Jarak/frekuensi | Periksa frekuensi 922 MHz, dekatkan perangkat |
| WebSocket terputus terus | Node-RED tidak jalan | Jalankan `node-red` di terminal |
| Dashboard tidak bisa diakses | `httpStatic` belum diset | Periksa `settings.js`, pastikan path benar |
| Halaman putih / error 404 | File web tidak ditemukan | Pastikan folder `web/` sesuai path di `httpStatic` |
| SQLite error saat startup | Plugin belum di-approve | Jalankan `npm install-scripts approve sqlite3` |
| Data tidak tampil di web | Flow belum di-deploy | Buka Node-RED → klik Deploy |
| Telegram "fetch failed" | Token/Chat ID kosong | Isi token & chat ID di node Telegram |
| Suara alert tidak bunyi | Browser memblokir audio | Klik area manapun di halaman terlebih dahulu |

---

## 🗂️ Penjelasan Modul JavaScript

| File | Fungsi |
|------|--------|
| `js/login.js` | Cek sesi, validasi form login, redirect ke dashboard |
| `js/dashboard.js` | Manajemen state sensor, update sidebar, alert banner, suara, deteksi offline |
| `js/map.js` | Inisialisasi Leaflet, buat/update marker & popup per node |
| `js/chart.js` | Inisialisasi Chart.js, fetch `/api/history`, tampilkan grafik kemiringan & kelembapan |
| `js/websocket.js` | Koneksi WebSocket ke Node-RED, auto-reconnect 3 detik, panggil `updateDashboard()` |

---

## 📄 Lisensi

MIT License — PKM Margorejo 2026  
Lab Riset Elektronika dan Instrumentasi — Universitas Gadjah Mada
