/*
 * ============================================
 * EWS MARGOREJO — RECEIVER (GATEWAY)
 * Sistem Peringatan Dini Tanah Longsor
 * Sampok, Sriharjo, Imogiri, Bantul, DIY
 * ============================================
 * 
 * Hardware: LILYGO TTGO T-BEAM V1.2
 * Fungsi: Menerima data LoRa dari Transmitter
 *         dan meneruskannya ke MQTT via WiFi
 * 
 * Fitur:
 *   - Terima data LoRa dari NODE_1 & NODE_2
 *   - Tambahkan info RSSI & SNR sinyal LoRa
 *   - Kirim ke MQTT topic "ews/lora_data"
 *   - Auto-reconnect WiFi & MQTT
 * ============================================
 */

#include <Arduino.h>
#include <SPI.h>
#include <LoRa.h>
#include <WiFi.h>
#include <PubSubClient.h>

// =====================================
// ⚠️ KONFIGURASI JARINGAN (WAJIB DIUBAH!)
// =====================================
const char* ssid        = "WIFI_SSID";         // Ganti dengan nama WiFi kamu
const char* password    = "WIFI_PASSWORD";      // Ganti dengan password WiFi
const char* mqtt_server = "192.168.1.100";      // Ganti dengan IP laptop (CMD -> ipconfig)
const int   mqtt_port   = 1883;                 // Port standar Mosquitto

// =====================================
// PIN LORA T-BEAM
// =====================================
#define LORA_SCK    5
#define LORA_MISO   19
#define LORA_MOSI   27
#define LORA_SS     18
#define LORA_RST    23
#define LORA_DIO0   26
#define LORA_BAND   922E6   // Frekuensi LoRa Indonesia

// =====================================
// MQTT
// =====================================
WiFiClient espClient;
PubSubClient client(espClient);

// Statistik
unsigned long packetCount = 0;

// =====================================
// FUNGSI: Koneksi WiFi
// =====================================
void setup_wifi() {
  delay(10);
  Serial.println("[WiFi] Menghubungkan ke: " + String(ssid));
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    attempts++;
    if (attempts > 60) { // Timeout 30 detik
      Serial.println("\n[WiFi] GAGAL konek! Restart...");
      ESP.restart();
    }
  }
  
  Serial.println();
  Serial.println("[WiFi] Terhubung!");
  Serial.print("[WiFi] IP Address Gateway: ");
  Serial.println(WiFi.localIP());
}

// =====================================
// FUNGSI: Cek & Reconnect WiFi
// =====================================
void checkWiFi() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Koneksi terputus! Menghubungkan ulang...");
    WiFi.disconnect();
    WiFi.begin(ssid, password);
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
      delay(500);
      Serial.print(".");
      attempts++;
    }
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("\n[WiFi] Terhubung kembali!");
    } else {
      Serial.println("\n[WiFi] Gagal reconnect, coba lagi nanti...");
    }
  }
}

// =====================================
// FUNGSI: Koneksi MQTT Mosquitto
// =====================================
void reconnect_mqtt() {
  int retries = 0;
  while (!client.connected() && retries < 3) {
    Serial.print("[MQTT] Menghubungkan ke " + String(mqtt_server) + ":" + String(mqtt_port) + "... ");
    
    // Buat Client ID unik
    String clientId = "EWS-Gateway-";
    clientId += String(random(0xffff), HEX);
    
    if (client.connect(clientId.c_str())) {
      Serial.println("Terhubung!");
    } else {
      Serial.print("Gagal (error=");
      Serial.print(client.state());
      Serial.println(") Coba lagi dalam 3 detik...");
      delay(3000);
      retries++;
    }
  }
}

// =====================================
// SETUP
// =====================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("============================================");
  Serial.println("EWS MARGOREJO — RECEIVER GATEWAY");
  Serial.println("Sistem Peringatan Dini Tanah Longsor");
  Serial.println("============================================");

  // 1. Setup WiFi
  setup_wifi();
  
  // 2. Setup MQTT
  client.setServer(mqtt_server, mqtt_port);
  client.setBufferSize(512); // Buffer lebih besar untuk data panjang

  // 3. Setup LoRa
  Serial.print("[LoRa] Memulai modul LoRa... ");
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  
  if (!LoRa.begin(LORA_BAND)) {
    Serial.println("GAGAL!");
    while (1) { delay(1000); }
  }
  Serial.println("OK!");
  
  Serial.println("[SISTEM] Receiver Gateway Siap Menunggu Data...");
  Serial.println("--------------------------------------------");
}

// =====================================
// LOOP
// =====================================
void loop() {
  // Periksa koneksi WiFi
  checkWiFi();
  
  // Jaga koneksi MQTT tetap hidup
  if (!client.connected()) {
    reconnect_mqtt();
  }
  client.loop();

  // ---- Dengarkan Sinyal LoRa Masuk ----
  int packetSize = LoRa.parsePacket();
  if (packetSize) {
    // Baca data dari LoRa
    String receivedData = "";
    while (LoRa.available()) {
      receivedData += (char)LoRa.read();
    }
    
    // Ambil info kualitas sinyal
    int rssi = LoRa.packetRssi();
    float snr = LoRa.packetSnr();
    
    // Tambahkan RSSI & SNR ke data
    String fullData = receivedData + 
                      ",RSSI:" + String(rssi) + 
                      ",SNR:"  + String(snr, 1);
    
    // Kirim ke MQTT topic utama
    if (client.connected()) {
      client.publish("ews/lora_data", fullData.c_str());
      packetCount++;
      
      // Log ke Serial Monitor
      Serial.println("[RX #" + String(packetCount) + "] " + fullData);
      Serial.println("     RSSI: " + String(rssi) + " dBm | SNR: " + String(snr) + " dB");
    } else {
      Serial.println("[ERROR] MQTT tidak terhubung! Data hilang: " + fullData);
    }
  }
}
