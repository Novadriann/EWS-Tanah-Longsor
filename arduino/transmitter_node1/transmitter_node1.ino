/*
 * ============================================
 * EWS MARGOREJO — TRANSMITTER NODE 1 (ULTRA RESPONSIVE)
 * Sistem Peringatan Dini Tanah Longsor
 * Sampok, Sriharjo, Imogiri, Bantul, DIY
 * ============================================
 * 
 * Versi Responsif Cepat:
 *   - Interval pengiriman LoRa dipercepat menjadi 1000ms (1 detik)
 *   - Penghapusan semua blocking delay() pada sampling sensor
 *   - Instant Alert Trigger: jika kemiringan >= threshold, langsung kirim seketika
 *   - DHT22 dibaca non-blocking di background (cache 2 detik)
 *   - Hall Sensor & Sirene beroperasi mulus tanpa lagging
 * 
 * Hardware: LILYGO TTGO T-BEAM V1.2
 * Sensor:
 *   - ADXL345 (Kemiringan/Tilt)
 *   - Hall Effect (Tipping Bucket / Curah Hujan)
 *   - Soil Moisture (Kelembapan Tanah)
 *   - DHT22 (Suhu & Kelembapan Udara)
 * 
 * Aktuator:
 *   - Sirene 12V (via transistor NPN, GPIO 2)
 *   - Lampu LED (via transistor NPN, GPIO 32)
 * ============================================
 */

#include <Arduino.h>
#include <SPI.h>
#include <Wire.h>
#include <LoRa.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_ADXL345_U.h>
#include <DHT.h>

// =====================================
// ⚠️ IDENTITAS NODE
// =====================================
String NODE_ID = "NODE_1";

// =====================================
// KONFIGURASI PIN LILYGO T-BEAM
// =====================================
#define HALL_PIN    15    // Hall Effect (Tipping Bucket)
#define SOIL_PIN    13    // Soil Moisture (Analog)

// I2C untuk ADXL345
#define I2C_SDA     14
#define I2C_SCL     4

// DHT22 Sensor
#define DHT_PIN     33
#define DHT_TYPE    DHT22

// Sirene & Lampu Indikator (via transistor NPN)
#define SIREN_PIN   2     // Sirene 12V
#define LAMP_PIN    32    // Lampu LED 3.3V

// Pin LoRa SPI
#define LORA_SCK    5
#define LORA_MISO   19
#define LORA_MOSI   27
#define LORA_SS     18
#define LORA_RST    23
#define LORA_DIO0   26
#define LORA_BAND   922E6  // Frekuensi LoRa Indonesia

// =====================================
// KONFIGURASI INTERVAL & RESPONSIVITAS
// =====================================
// ⚡ Interval pengiriman data normal (1000ms = 1 detik untuk respon sangat cepat)
const unsigned long intervalSend = 1000;
unsigned long lastSendTime = 0;

// =====================================
// KONFIGURASI HALL SENSOR (Tipping Bucket)
// =====================================
#define MAGNET_ACTIVE_LOW true

int lastHallState = -1;
bool lastMagnetDetected = false;

unsigned long countTip = 0;
unsigned long lastTipTime = 0;
const unsigned long debounceMs = 250; // Debounce 250ms

const float ML_PER_TIP = 3.67;

// =====================================
// KONFIGURASI SOIL MOISTURE
// =====================================
int nilaiKering = 3200;
int nilaiBasah  = 1300;
const int jumlahSamplingSoil = 5; // Cukup 5 sample tanpa blocking delay

// =====================================
// KONFIGURASI ADXL345
// =====================================
Adafruit_ADXL345_Unified accel = Adafruit_ADXL345_Unified(12345);
const int TILT_SAMPLES = 3;       // 3 sample cepat langsung via I2C

// =====================================
// KONFIGURASI DHT22
// =====================================
DHT dht(DHT_PIN, DHT_TYPE);
float suhuUdara = 0.0;
float kelembabanUdara = 0.0;
unsigned long lastDHTRead = 0;
const unsigned long intervalDHT = 2000; // Cache 2 detik agar tidak menghambat pengiriman

// =====================================
// KONFIGURASI ALERT (Sirene & Lampu)
// =====================================
const float TILT_THRESHOLD = 45.0; // Derajat batas bahaya
bool alertActive = false;
bool lastAlertActive = false;

unsigned long lastAlertToggle = 0;
const unsigned long ALERT_ON_MS = 1500;  // Sirene ON 1.5 detik
const unsigned long ALERT_OFF_MS = 500;  // Sirene OFF 0.5 detik
bool sirenState = false;

// =====================================
// FUNGSI: Baca Soil Moisture (Cepat & Non-blocking)
// =====================================
int bacaSoilRataRata() {
  long total = 0;
  for (int i = 0; i < jumlahSamplingSoil; i++) {
    total += analogRead(SOIL_PIN);
    delayMicroseconds(50); // Cepat tanpa delay ms
  }
  return total / jumlahSamplingSoil;
}

// =====================================
// FUNGSI: Baca Kemiringan (Cepat via I2C)
// =====================================
float bacaTiltRataRata() {
  float totalTilt = 0;
  int validSamples = 0;
  
  for (int i = 0; i < TILT_SAMPLES; i++) {
    sensors_event_t event;
    accel.getEvent(&event);
    
    float gTotal = sqrt(
      pow(event.acceleration.x, 2) + 
      pow(event.acceleration.y, 2) + 
      pow(event.acceleration.z, 2)
    );
    
    if (gTotal < 0.001) gTotal = 0.001;
    
    float sudut = acos(event.acceleration.z / gTotal) * 180.0 / PI;
    
    if (!isnan(sudut)) {
      totalTilt += sudut;
      validSamples++;
    }
  }
  
  if (validSamples > 0) {
    return totalTilt / validSamples;
  }
  return 0.0;
}

// =====================================
// FUNGSI: Baca DHT22 di Background (Non-blocking)
// =====================================
void bacaDHT22() {
  unsigned long now = millis();
  if (now - lastDHTRead >= intervalDHT) {
    lastDHTRead = now;
    
    float h = dht.readHumidity();
    float t = dht.readTemperature();
    
    if (!isnan(h) && !isnan(t)) {
      suhuUdara = t;
      kelembabanUdara = h;
    }
  }
}

// =====================================
// FUNGSI: Kontrol Sirene & Lampu
// =====================================
void kontrolAlert(float tiltSaatIni) {
  if (tiltSaatIni >= TILT_THRESHOLD) {
    if (!alertActive) {
      alertActive = true;
      Serial.println("🚨 [ALERT] BAHAYA! Kemiringan " + String(tiltSaatIni, 2) + "° >= " + String(TILT_THRESHOLD, 0) + "°");
    }
    
    // Lampu ON terus
    digitalWrite(LAMP_PIN, HIGH);
    
    // Sirene berkedip
    unsigned long now = millis();
    if (sirenState) {
      if (now - lastAlertToggle >= ALERT_ON_MS) {
        sirenState = false;
        digitalWrite(SIREN_PIN, LOW);
        lastAlertToggle = now;
      }
    } else {
      if (now - lastAlertToggle >= ALERT_OFF_MS) {
        sirenState = true;
        digitalWrite(SIREN_PIN, HIGH);
        lastAlertToggle = now;
      }
    }
    
  } else {
    if (alertActive) {
      alertActive = false;
      Serial.println("✅ [ALERT] Kemiringan kembali normal (" + String(tiltSaatIni, 2) + "°).");
    }
    
    digitalWrite(SIREN_PIN, LOW);
    digitalWrite(LAMP_PIN, LOW);
    sirenState = false;
  }
}

// =====================================
// FUNGSI: Kirim Paket LoRa
// =====================================
void kirimDataLoRa(int kelembapan, int hallState, bool magnetDetected, float sudutTilt, float rainVolume) {
  // Susun paket data
  String dataPaket = NODE_ID + 
                     ",SOIL:" + String(kelembapan) +
                     ",HALL:" + String(hallState) +
                     ",MAG:"  + String(magnetDetected ? 1 : 0) +
                     ",TIP:"  + String(countTip) +
                     ",TILT:" + String(sudutTilt, 2) +
                     ",RAIN:" + String(rainVolume, 2) +
                     ",TEMP:" + String(suhuUdara, 1) +
                     ",HUM:"  + String(kelembabanUdara, 1) +
                     ",ALERT:" + String(alertActive ? 1 : 0);

  // Kirim via LoRa
  LoRa.beginPacket();
  LoRa.print(dataPaket);
  LoRa.endPacket();

  // Log Serial
  Serial.print("[TX] ");
  Serial.println(dataPaket);
}

// =====================================
// INISIALISASI POWER MANAGEMENT (AXP2101 / AXP192)
// Wajib untuk TTGO T-Beam V1.2 agar modul LoRa (ALDO3) 
// mendapat daya 3.3V saat menggunakan Powerbank / PSU!
// =====================================
void initPMU() {
  Serial.println("[PMU] Menginisialisasi Power Management AXP2101...");
  TwoWire pmuWire = TwoWire(1); // Gunakan I2C internal port 1 (GPIO 21 & 22)
  pmuWire.begin(21, 22, 100000);
  
  // Cek apakah PMU AXP merespons di address 0x34
  pmuWire.beginTransmission(0x34);
  byte error = pmuWire.endTransmission();
  
  if (error == 0) {
    Serial.println("[PMU] Chip AXP2101 terdeteksi!");

    // 1. Set tegangan ALDO3 ke 3.3V (Register 0x94 = 0x1C untuk 3.3V)
    pmuWire.beginTransmission(0x34);
    pmuWire.write(0x94);
    pmuWire.write(0x1C); // 3.3V
    pmuWire.endTransmission();

    // 2. Baca register 0x90, aktifkan Bit 2 (ALDO3 = Daya Modul LoRa) & Bit 1 (ALDO2)
    pmuWire.beginTransmission(0x34);
    pmuWire.write(0x90);
    pmuWire.endTransmission(false);
    pmuWire.requestFrom((uint8_t)0x34, (uint8_t)1);
    uint8_t val90 = pmuWire.available() ? pmuWire.read() : 0;

    pmuWire.beginTransmission(0x34);
    pmuWire.write(0x90);
    pmuWire.write(val90 | 0x04 | 0x02); // Enable ALDO3 (LoRa) & ALDO2 (Sensors)
    pmuWire.endTransmission();

    // 3. Cadangan kompatibilitas untuk AXP192 (T-Beam V1.0/V1.1):
    // Register 0x12 di AXP192: Bit 2 = LDO2 (LoRa)
    pmuWire.beginTransmission(0x34);
    pmuWire.write(0x12);
    pmuWire.endTransmission(false);
    pmuWire.requestFrom((uint8_t)0x34, (uint8_t)1);
    if (pmuWire.available()) {
      uint8_t val12 = pmuWire.read();
      pmuWire.beginTransmission(0x34);
      pmuWire.write(0x12);
      pmuWire.write(val12 | 0x04); // Enable LDO2
      pmuWire.endTransmission();
    }

    Serial.println("[PMU] ✅ Jalur daya LoRa (ALDO3 3.3V) BERHASIL dinyalakan!");
  } else {
    Serial.println("[PMU] ℹ️ AXP2101 tidak merespons (mungkin versi board non-PMU).");
  }
}

// =====================================
// SETUP
// =====================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("============================================");
  Serial.println("EWS MARGOREJO — TRANSMITTER " + NODE_ID + " (FAST RESPONSIVE)");
  Serial.println("Interval Kirim: " + String(intervalSend) + "ms (1 Detik)");
  Serial.println("============================================");

  // ⚡ Langkah Pertama: Nyalakan Daya PMU (LoRa & Sensor)
  initPMU();

  // Konfigurasi ADC
  analogReadResolution(12);
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);
  
  // Konfigurasi Hall Sensor
  pinMode(HALL_PIN, INPUT_PULLUP);

  // Konfigurasi Sirene & Lampu
  pinMode(SIREN_PIN, OUTPUT);
  pinMode(LAMP_PIN, OUTPUT);
  digitalWrite(SIREN_PIN, LOW);
  digitalWrite(LAMP_PIN, LOW);

  // Inisialisasi DHT22
  dht.begin();
  Serial.println("[DHT22] Siap pada GPIO " + String(DHT_PIN));

  // Inisialisasi I2C & ADXL345
  Wire.begin(I2C_SDA, I2C_SCL, 100000); // 100kHz stabil untuk kabel jumper
  Wire.setTimeOut(50);                   // Timeout 50ms (cegah freeze jika kabel goyang)
  Serial.print("[ADXL345] Memulai sensor kemiringan... ");
  if (!accel.begin(0x53)) {
    if (!accel.begin(0x1D)) {
      Serial.println("GAGAL! Periksa koneksi SDA/SCL.");
      while (1) { delay(1000); }
    }
  }
  accel.setRange(ADXL345_RANGE_2_G);
  Serial.println("OK!");

  // Inisialisasi LoRa dengan Hardware Reset
  Serial.print("[LoRa] Memulai modul LoRa... ");
  pinMode(LORA_RST, OUTPUT);
  digitalWrite(LORA_RST, LOW);
  delay(50);
  digitalWrite(LORA_RST, HIGH);
  delay(50);

  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  
  int loraRetries = 0;
  while (!LoRa.begin(LORA_BAND) && loraRetries < 5) {
    Serial.print(".");
    digitalWrite(LORA_RST, LOW);
    delay(50);
    digitalWrite(LORA_RST, HIGH);
    delay(50);
    loraRetries++;
  }

  if (loraRetries >= 5) {
    Serial.println(" GAGAL!");
    Serial.println("⚠️ Modul LoRa belum merespons. Mencoba restart ESP32 dalam 3 detik...");
    delay(3000);
    ESP.restart(); // Auto-recovery: restart sistem agar mencoba inisialisasi ulang
  }
  
  // Pengaturan LoRa yang aman untuk USB (14 dBm = stabil & tidak drop tegangan)
  LoRa.setTxPower(14);
  LoRa.setSpreadingFactor(7);   // SF7 = transmisi cepat di udara (~50ms)
  LoRa.setSignalBandwidth(125E3);
  LoRa.setCodingRate4(5);
  Serial.println(" OK!");
  
  // Test singkat sirene & lampu saat startup (200ms)
  digitalWrite(SIREN_PIN, HIGH);
  digitalWrite(LAMP_PIN, HIGH);
  delay(200);
  digitalWrite(SIREN_PIN, LOW);
  digitalWrite(LAMP_PIN, LOW);
  
  Serial.println("[SISTEM] Transmitter " + NODE_ID + " Siap Mengirim Data Cepat!");
  Serial.println("--------------------------------------------");
}

// =====================================
// LOOP (BEBAS BLOCKING DELAY)
// =====================================
void loop() {
  unsigned long currentMillis = millis();

  // ---- 1. Baca Kelembapan Tanah (Sangat Cepat) ----
  int nilaiADC = bacaSoilRataRata();
  int kelembapan = map(nilaiADC, nilaiKering, nilaiBasah, 0, 100);
  kelembapan = constrain(kelembapan, 0, 100);

  // ---- 2. Baca Hall Sensor (Tipping Bucket) ----
  int hallState = digitalRead(HALL_PIN);
  bool magnetDetected = MAGNET_ACTIVE_LOW ? (hallState == LOW) : (hallState == HIGH);

  if (hallState != lastHallState) {
    lastHallState = hallState;
  }

  // Deteksi tip baru
  if (magnetDetected && !lastMagnetDetected) {
    if (currentMillis - lastTipTime >= debounceMs) {
      countTip++;
      lastTipTime = currentMillis;
      Serial.println("[TIP] Tipping bucket terdeteksi! Total: " + String(countTip));
    }
  }
  lastMagnetDetected = magnetDetected;

  // ---- 3. Baca Kemiringan ADXL345 (Real-time) ----
  float sudutTilt = bacaTiltRataRata();

  // ---- 4. Hitung Volume Curah Hujan ----
  float rainVolume = countTip * ML_PER_TIP;

  // ---- 5. Baca DHT22 di Background (Non-blocking) ----
  bacaDHT22();

  // ---- 6. Kontrol Sirene & Lampu ----
  kontrolAlert(sudutTilt);

  // ---- 7. Trigger Pengiriman Data LoRa ----
  // Syarat kirim:
  // a) Timer interval tercapai (setiap 1 detik), ATAU
  // b) Status ALERT berubah mendadak (misal baru saja melewati 45°) -> langsung kirim seketika!
  bool alertStateChanged = (alertActive != lastAlertActive);
  bool timeToSend = (currentMillis - lastSendTime >= intervalSend);

  if (timeToSend || alertStateChanged) {
    lastSendTime = currentMillis;
    lastAlertActive = alertActive;

    kirimDataLoRa(kelembapan, hallState, magnetDetected, sudutTilt, rainVolume);
  }

  delay(10); // Memberi jeda kecil agar FreeRTOS Watchdog tidak terpicu
}
