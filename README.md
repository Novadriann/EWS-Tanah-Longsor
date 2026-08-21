# 🚨 EWS Margorejo — Sistem Peringatan Dini Tanah Longsor

Sistem Early Warning System (EWS) untuk mendeteksi potensi tanah longsor menggunakan sensor kemiringan (ADXL345), curah hujan (tipping bucket), dan kelembapan tanah. Data dikirim via LoRa ke gateway, diteruskan ke Node-RED, dan ditampilkan secara real-time di web dashboard interaktif.

**📍 Lokasi:** Sampok, Sriharjo, Imogiri, Bantul, DIY  
**🎓 Proyek:** PKM 2026

---

## 📐 Arsitektur Sistem

```
[T-BEAM NODE 1] ──LoRa──┐
                         ├──> [T-BEAM RECEIVER] ──WiFi──> [MQTT Mosquitto]
[T-BEAM NODE 2] ──LoRa──┘                                       │
                                                                 ▼
                                                          [NODE-RED]
                                                           │  │  │  │
                                                           │  │  │  └──> 📱 Telegram Bot (Alert)
                                                           │  │  └─────> 💾 SQLite (Database)
                                                           │  └────────> 🌐 WebSocket (Real-time)
                                                           └───────────> 📊 API REST (Historis)
                                                                              │
                                                                              ▼
                                                                    [WEB BROWSER / Dashboard]
```

---

## 📦 Struktur Folder

```
WEB EWS/
├── arduino/
│   ├── transmitter_node1/
│   │   └── transmitter_node1.ino    ← Kode sensor NODE 1
│   ├── transmitter_node2/
│   │   └── transmitter_node2.ino    ← Kode sensor NODE 2
│   └── receiver/
│       └── receiver.ino              ← Kode gateway receiver
├── web/
│   ├── index.html                    ← Halaman login
│   ├── dashboard.html                ← Dashboard utama (peta + data)
│   ├── css/
│   │   └── style.css                 ← Stylesheet dashboard
│   └── js/
│       └── app.js                    ← Logic WebSocket, Leaflet, Chart.js
├── node-red/
│   └── flows.json                    ← Flow Node-RED (import langsung)
└── README.md                         ← Dokumentasi ini
```

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
- [Node-RED](https://nodered.org/)
- [Mosquitto MQTT Broker](https://mosquitto.org/download/)

### Library Arduino (Install via Library Manager)
- `LoRa` by Sandeep Mistry
- `Adafruit ADXL345` by Adafruit
- `Adafruit Unified Sensor` by Adafruit
- `PubSubClient` by Nick O'Leary

---

## 🚀 Instalasi & Setup

### 1. Install Mosquitto MQTT Broker

**Windows:**
1. Download dari https://mosquitto.org/download/
2. Install (centang semua default)
3. Buka Command Prompt sebagai Administrator:
   ```cmd
   net start mosquitto
   ```
4. Verifikasi:
   ```cmd
   mosquitto -v
   ```

### 2. Install Node-RED

```bash
npm install -g node-red
```

Jalankan Node-RED:
```bash
node-red
```

Buka browser: **http://localhost:1880**

### 3. Install Node-RED Palettes

Buka Command Prompt, masuk ke direktori Node-RED:

```bash
cd %USERPROFILE%\.node-red
npm install node-red-node-sqlite
npm install node-red-contrib-telegrambot
```

Restart Node-RED setelah install.

### 4. Konfigurasi httpStatic (Penting!)

Edit file `settings.js` Node-RED:
- Lokasi: `C:\Users\<username>\.node-red\settings.js`

Cari baris `httpStatic` (biasanya dikomentari), ubah menjadi:

```javascript
httpStatic: 'D:/KULIAH/PKM - Margorejo/WEB EWS/web',
```

> ⚠️ **Sesuaikan path dengan lokasi folder `web` kamu!**  
> Gunakan forward slash (`/`) bukan backslash (`\`).

Restart Node-RED setelah mengubah settings.

### 5. Import Flow Node-RED

1. Buka Node-RED: http://localhost:1880
2. Klik menu ☰ (kanan atas) → **Import**
3. Pilih tab **Clipboard**
4. Buka file `node-red/flows.json`, copy semua isinya
5. Paste ke dalam kotak import
6. Klik **Import**
7. Klik **Deploy** (tombol merah kanan atas)

### 6. Konfigurasi MQTT Broker di Node-RED

1. Double-click node **📡 ews/lora_data**
2. Klik ikon pensil di sebelah "Server"
3. Pastikan:
   - Server: `localhost`
   - Port: `1883`
4. Klik **Update** → **Done** → **Deploy**

### 7. Konfigurasi Telegram Bot

1. Buka Telegram, cari **@BotFather**
2. Ketik `/newbot` dan ikuti instruksi
3. Copy **Token** yang diberikan
4. Cari **@userinfobot** untuk mendapatkan **Chat ID** kamu
5. Di Node-RED:
   - Double-click node **📱 Kirim Telegram**
   - Klik ikon pensil di "Bot"
   - Masukkan **Bot Name** dan **Token**
   - Klik **Update**
6. Double-click node **🚨 Alert Logic**
   - Di dalam kode, cari baris: `chatId: ''`
   - Ganti dengan Chat ID kamu, misal: `chatId: '123456789'`
7. Klik **Done** → **Deploy**

---

## 📡 Upload Kode Arduino

### Transmitter NODE 1
1. Buka `arduino/transmitter_node1/transmitter_node1.ino` di Arduino IDE
2. Pilih Board: **ESP32 Dev Module** (atau TTGO T-BEAM)
3. Upload ke T-BEAM pertama

### Transmitter NODE 2
1. Buka `arduino/transmitter_node2/transmitter_node2.ino`
2. Upload ke T-BEAM kedua

### Receiver Gateway
1. Buka `arduino/receiver/receiver.ino`
2. **WAJIB EDIT** baris berikut sebelum upload:
   ```cpp
   const char* ssid        = "NAMA_WIFI_KAMU";
   const char* password    = "PASSWORD_WIFI";
   const char* mqtt_server = "IP_LAPTOP_KAMU";  // Dari CMD: ipconfig
   ```
3. Upload ke T-BEAM ketiga

> 💡 **Cara mendapatkan IP laptop:**
> Buka CMD → ketik `ipconfig` → cari **IPv4 Address** (misal: `192.168.1.100`)
> Pastikan receiver dan laptop dalam **satu jaringan WiFi yang sama**.

---

## 🖥️ Akses Dashboard

1. Pastikan Node-RED sudah berjalan (`node-red`)
2. Pastikan Mosquitto sudah berjalan
3. Buka browser: **http://localhost:1880/index.html**
4. Login:
   - **Username:** `admin`
   - **Password:** `ews2026`
5. Dashboard akan menampilkan peta dengan 2 marker sensor

> Untuk akses dari HP/perangkat lain dalam jaringan yang sama:
> Gunakan `http://<IP_LAPTOP>:1880/index.html`

---

## 🧪 Testing Tanpa Hardware

Kamu bisa mengirim data simulasi menggunakan `mosquitto_pub`:

```bash
# Simulasi NODE_1 - Kondisi Normal
mosquitto_pub -h localhost -t "ews/lora_data" -m "NODE_1,SOIL:65,HALL:1,MAG:0,TIP:12,TILT:15.20,RAIN:44.04,RSSI:-65,SNR:8.5"

# Simulasi NODE_1 - BAHAYA (kemiringan > 45°)
mosquitto_pub -h localhost -t "ews/lora_data" -m "NODE_1,SOIL:80,HALL:0,MAG:1,TIP:45,TILT:52.30,RAIN:165.15,RSSI:-70,SNR:7.0"

# Simulasi NODE_2 - Kondisi Normal
mosquitto_pub -h localhost -t "ews/lora_data" -m "NODE_2,SOIL:45,HALL:1,MAG:0,TIP:8,TILT:12.50,RAIN:29.36,RSSI:-60,SNR:9.0"

# Simulasi NODE_2 - BAHAYA
mosquitto_pub -h localhost -t "ews/lora_data" -m "NODE_2,SOIL:90,HALL:0,MAG:1,TIP:60,TILT:48.75,RAIN:220.20,RSSI:-75,SNR:6.0"
```

> 💡 Jika `mosquitto_pub` tidak ditemukan, tambahkan path Mosquitto ke PATH:
> `C:\Program Files\mosquitto\`

---

## 📋 Format Data Sensor

Data dikirim dalam format string, dipisahkan koma:

```
NODE_1,SOIL:65,HALL:1,MAG:0,TIP:12,TILT:26.91,RAIN:44.04,RSSI:-65,SNR:8.5
```

| Field | Keterangan | Satuan |
|-------|------------|--------|
| `NODE_x` | Identitas sensor (NODE_1 / NODE_2) | - |
| `SOIL` | Kelembapan tanah | % (0-100) |
| `HALL` | Status hall sensor | 0/1 |
| `MAG` | Magnet terdeteksi | 0/1 |
| `TIP` | Total jumlah tip tipping bucket | count |
| `TILT` | Kemiringan tanah | derajat (°) |
| `RAIN` | Volume curah hujan (TIP × 3.67) | ml |
| `RSSI` | Kekuatan sinyal LoRa | dBm |
| `SNR` | Signal-to-Noise Ratio | dB |

---

## 🚨 Sistem Alert

| Kondisi | Threshold | Aksi |
|---------|-----------|------|
| **Normal** | Kemiringan < 45° | Marker hijau, status normal |
| **BAHAYA** | Kemiringan ≥ 45° | Marker merah berkedip, banner alert, suara, kirim Telegram |

**Cooldown Telegram:** 5 menit per node (mencegah spam)

---

## 🔧 Troubleshooting

| Masalah | Solusi |
|---------|--------|
| WiFi tidak konek | Periksa SSID & password di `receiver.ino` |
| MQTT error | Pastikan Mosquitto sudah berjalan: `net start mosquitto` |
| LoRa tidak terima data | Periksa frekuensi (922MHz) dan jarak antar perangkat |
| WebSocket terputus | Periksa Node-RED masih berjalan, refresh browser |
| Telegram error "fetch failed" | Cooldown sudah diterapkan, periksa koneksi internet |
| Data tidak masuk ke web | Cek tab Debug di Node-RED untuk melihat apakah data masuk |
| Dashboard tidak bisa diakses | Pastikan `httpStatic` di settings.js sudah benar |
| SQLite error | Install ulang: `cd ~/.node-red && npm install node-red-node-sqlite` |

---

## 📄 Lisensi

MIT License — PKM Margorejo 2026
