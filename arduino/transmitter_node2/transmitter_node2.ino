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
 * 
 * Format Data Kirim:
 *   NODE_2,SOIL:<val>,HALL:<val>,MAG:<val>,TIP:<val>,TILT:<val>,RAIN:<val>
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
// SETUP
// =====================================
void setup() {
  Serial.begin(115200);
  delay(1500);
  
  Serial.println("============================================");
  Serial.println("EWS MARGOREJO — TRANSMITTER " + NODE_ID);
  Serial.println("Interval: 5300ms (offset dari NODE_1)");
  Serial.println("============================================");

  analogReadResolution(12);
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);
  pinMode(HALL_PIN, INPUT_PULLUP);

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
  
  Serial.println("[SISTEM] Transmitter " + NODE_ID + " Siap!");
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

  // 5. Kirim Data via LoRa
  unsigned long currentMillis = millis();
  if (currentMillis - lastSendTime >= intervalSend) {
    lastSendTime = currentMillis;

    String dataPaket = NODE_ID + 
                       ",SOIL:" + String(kelembapan) +
                       ",HALL:" + String(hallState) +
                       ",MAG:"  + String(magnetDetected ? 1 : 0) +
                       ",TIP:"  + String(countTip) +
                       ",TILT:" + String(sudutTilt, 2) +
                       ",RAIN:" + String(rainVolume, 2);

    LoRa.beginPacket();
    LoRa.print(dataPaket);
    LoRa.endPacket();

    Serial.print("[TX] Mengirim: ");
    Serial.println(dataPaket);
  }
  
  delay(50);
}
