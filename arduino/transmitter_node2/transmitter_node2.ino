/*
 * ============================================
 * EWS MARGOREJO — TRANSMITTER NODE 2
 * Sistem Peringatan Dini Tanah Longsor
 * Sampok, Sriharjo, Imogiri, Bantul, DIY
 * ============================================
 * 
 * KODE UNTUK NODE 2
 * Interval berbeda (5300ms) untuk menghindari 
 * tabrakan sinyal LoRa dengan NODE_1
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
 * 
 * Format Data Kirim:
 *   NODE_2,SOIL:<val>,HALL:<val>,MAG:<val>,TIP:<val>,TILT:<val>,RAIN:<val>,TEMP:<val>,HUM:<val>,ALERT:<0/1>
 * 
 * Interval Kirim: 5300ms (NODE_2 — offset dari NODE_1)
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
String NODE_ID = "NODE_2";  // <-- NODE 2

// =====================================
// KONFIGURASI PIN LILYGO T-BEAM
// =====================================
#define HALL_PIN    15
#define SOIL_PIN    13

#define I2C_SDA     14
#define I2C_SCL     4

// DHT22 Sensor
#define DHT_PIN     33
#define DHT_TYPE    DHT22

// Sirene & Lampu Indikator (via transistor NPN)
#define SIREN_PIN   2     // Sirene 12V via transistor
#define LAMP_PIN    32    // Lampu LED via transistor

#define LORA_SCK    5
#define LORA_MISO   19
#define LORA_MOSI   27
#define LORA_SS     18
#define LORA_RST    23
#define LORA_DIO0   26
#define LORA_BAND   922E6

// =====================================
// KONFIGURASI HALL SENSOR (Tipping Bucket)
// =====================================
#define MAGNET_ACTIVE_LOW true

int lastHallState = -1;
bool lastMagnetDetected = false;

unsigned long countTip = 0;
unsigned long lastTipTime = 0;
const unsigned long debounceMs = 300;

const float ML_PER_TIP = 3.67;

// =====================================
// KONFIGURASI SOIL MOISTURE
// =====================================
int nilaiKering = 3200;
int nilaiBasah  = 1300;
const int jumlahSampling = 20;

// =====================================
// KONFIGURASI PENGIRIMAN LoRa
// =====================================
unsigned long lastSendTime = 0;
const unsigned long intervalSend = 5300;  // <-- 5300ms untuk NODE_2 (hindari tabrakan)

// =====================================
// KONFIGURASI ADXL345
// =====================================
Adafruit_ADXL345_Unified accel = Adafruit_ADXL345_Unified(12345);
const int TILT_SAMPLES = 10;

// =====================================
// KONFIGURASI DHT22
// =====================================
DHT dht(DHT_PIN, DHT_TYPE);
float suhuUdara = 0.0;
float kelembabanUdara = 0.0;
unsigned long lastDHTRead = 0;
const unsigned long intervalDHT = 2000;  // DHT22 minimal 2 detik antar pembacaan

// =====================================
// KONFIGURASI ALERT (Sirene & Lampu)
// =====================================
const float TILT_THRESHOLD = 45.0;    // Derajat kemiringan bahaya
bool alertActive = false;

// Pattern sirene: ON 2 detik, OFF 1 detik (berkedip)
unsigned long lastAlertToggle = 0;
const unsigned long ALERT_ON_MS = 2000;
const unsigned long ALERT_OFF_MS = 1000;
bool sirenState = false;

// =====================================
// FUNGSI: Baca Soil Moisture Rata-Rata
// =====================================
int bacaSoilRataRata() {
  long total = 0;
  for (int i = 0; i < jumlahSampling; i++) {
    total += analogRead(SOIL_PIN);
    delay(5);
  }
  return total / jumlahSampling;
}

// =====================================
// FUNGSI: Baca Kemiringan Rata-Rata
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
    delay(10);
  }
  
  if (validSamples > 0) {
    return totalTilt / validSamples;
  }
  return 0.0;
}

// =====================================
// FUNGSI: Baca DHT22 (Suhu & Kelembaban)
// =====================================
void bacaDHT22() {
  unsigned long now = millis();
  if (now - lastDHTRead >= intervalDHT) {
    lastDHTRead = now;
    
    float h = dht.readHumidity();
    float t = dht.readTemperature();  // Celsius
    
    if (!isnan(h) && !isnan(t)) {
      suhuUdara = t;
      kelembabanUdara = h;
    } else {
      Serial.println("[DHT22] Gagal membaca sensor!");
    }
  }
}

// =====================================
// FUNGSI: Kontrol Sirene & Lampu
// =====================================
void kontrolAlert(float tiltSaatIni) {
  if (tiltSaatIni >= TILT_THRESHOLD) {
    // === BAHAYA: Aktifkan alert ===
    if (!alertActive) {
      alertActive = true;
      Serial.println("🚨 [ALERT] BAHAYA! Kemiringan " + String(tiltSaatIni, 2) + "° >= " + String(TILT_THRESHOLD, 0) + "°");
      Serial.println("🚨 [ALERT] Sirene & Lampu AKTIF!");
    }
    
    // Lampu menyala terus saat bahaya
    digitalWrite(LAMP_PIN, HIGH);
    
    // Sirene berkedip (pattern ON/OFF)
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
    // === AMAN: Matikan alert ===
    if (alertActive) {
      alertActive = false;
      Serial.println("✅ [ALERT] Kemiringan kembali normal. Sirene & Lampu MATI.");
    }
    
    digitalWrite(SIREN_PIN, LOW);
    digitalWrite(LAMP_PIN, LOW);
    sirenState = false;
  }
}

// =====================================
// SETUP
// =====================================
void setup() {
  Serial.begin(115200);
  delay(1500);
  
  Serial.println("============================================");
  Serial.println("EWS MARGOREJO — TRANSMITTER " + NODE_ID);
  Serial.println("Interval: 5300ms (offset dari NODE_1)");
  Serial.println("+ DHT22 + Sirene + Lampu Indikator");
  Serial.println("============================================");

  analogReadResolution(12);
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);
  pinMode(HALL_PIN, INPUT_PULLUP);

  // Konfigurasi Sirene & Lampu (OUTPUT)
  pinMode(SIREN_PIN, OUTPUT);
  pinMode(LAMP_PIN, OUTPUT);
  digitalWrite(SIREN_PIN, LOW);
  digitalWrite(LAMP_PIN, LOW);
  Serial.println("[ALERT] Sirene (GPIO " + String(SIREN_PIN) + ") & Lampu (GPIO " + String(LAMP_PIN) + ") siap.");

  // Inisialisasi DHT22
  dht.begin();
  Serial.println("[DHT22] Sensor suhu & kelembaban siap (GPIO " + String(DHT_PIN) + ").");

  Wire.begin(I2C_SDA, I2C_SCL);
  Serial.print("[ADXL345] Memulai sensor kemiringan... ");
  if (!accel.begin(0x53)) {
    if (!accel.begin(0x1D)) {
      Serial.println("GAGAL! Periksa koneksi SDA/SCL.");
      while (1) { delay(1000); }
    }
  }
  accel.setRange(ADXL345_RANGE_2_G);
  Serial.println("OK!");

  Serial.print("[LoRa] Memulai modul LoRa... ");
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  
  if (!LoRa.begin(LORA_BAND)) {
    Serial.println("GAGAL!");
    while (1) { delay(1000); }
  }
  Serial.println("OK!");
  
  // Test singkat sirene & lampu (0.5 detik)
  Serial.println("[TEST] Test sirene & lampu...");
  digitalWrite(SIREN_PIN, HIGH);
  digitalWrite(LAMP_PIN, HIGH);
  delay(500);
  digitalWrite(SIREN_PIN, LOW);
  digitalWrite(LAMP_PIN, LOW);
  Serial.println("[TEST] OK!");
  
  Serial.println("[SISTEM] Transmitter " + NODE_ID + " Siap!");
  Serial.println("  Threshold Tilt: " + String(TILT_THRESHOLD, 0) + "°");
  Serial.println("--------------------------------------------");
}

// =====================================
// LOOP
// =====================================
void loop() {
  // 1. Baca Kelembapan Tanah
  int nilaiADC = bacaSoilRataRata();
  int kelembapan = map(nilaiADC, nilaiKering, nilaiBasah, 0, 100);
  kelembapan = constrain(kelembapan, 0, 100);

  // 2. Baca Hall Sensor (Tipping Bucket)
  int hallState = digitalRead(HALL_PIN);
  bool magnetDetected = MAGNET_ACTIVE_LOW ? (hallState == LOW) : (hallState == HIGH);

  if (hallState != lastHallState) {
    lastHallState = hallState;
  }

  if (magnetDetected && !lastMagnetDetected) {
    unsigned long now = millis();
    if (now - lastTipTime >= debounceMs) {
      countTip++;
      lastTipTime = now;
      Serial.println("[TIP] Tipping bucket terdeteksi! Total: " + String(countTip));
    }
  }
  lastMagnetDetected = magnetDetected;

  // 3. Baca Kemiringan (Tilt) ADXL345
  float sudutTilt = bacaTiltRataRata();

  // 4. Hitung Volume Curah Hujan
  float rainVolume = countTip * ML_PER_TIP;

  // 5. Baca DHT22 (Suhu & Kelembaban Udara)
  bacaDHT22();

  // 6. Kontrol Sirene & Lampu berdasarkan Tilt
  kontrolAlert(sudutTilt);

  // 7. Kirim Data via LoRa
  unsigned long currentMillis = millis();
  if (currentMillis - lastSendTime >= intervalSend) {
    lastSendTime = currentMillis;

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

    LoRa.beginPacket();
    LoRa.print(dataPaket);
    LoRa.endPacket();

    Serial.print("[TX] Mengirim: ");
    Serial.println(dataPaket);
    
    if (alertActive) {
      Serial.println("     🚨 STATUS: ALERT AKTIF — Sirene & Lampu MENYALA");
    }
  }
  
  delay(50);
}
