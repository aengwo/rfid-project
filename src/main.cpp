#include <Arduino.h>
#include <SPI.h>
#include <MFRC522.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <time.h>

// RFID pins
#define RST_PIN D3  // GPIO0
#define SS_PIN D4   // GPIO2

MFRC522 mfrc522(SS_PIN, RST_PIN);

// Buzzer and LED pins
#define BUZZER_PIN D1   // GPIO5
#define LED_PIN D2      // GPIO4

// Wi-Fi credentials
const char* ssid = "A9";
const char* password = "Nunzema21";

// Server details
const char* serverName = "http://192.168.100.4:3000";  // Replace with your server IP

// Function prototypes
bool checkAccess(String uid);
void logAccess(String uid);
String getTimeStamp();

void setup() {
  Serial.begin(115200);
  SPI.begin();          // Initialize SPI bus
  mfrc522.PCD_Init();   // Initialize MFRC522

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);

  // Connect to Wi-Fi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected to Wi-Fi");

  // Time synchronization
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  Serial.print("Synchronizing time");
  while (time(nullptr) < 100000) {
    Serial.print(".");
    delay(500);
  }
  Serial.println("\nTime synchronized");

  Serial.println("Place your card on the reader...");
}

void loop() {
  // Look for new cards
  if (!mfrc522.PICC_IsNewCardPresent()) {
    Serial.println("No new card present");
    return;
  }
  if (!mfrc522.PICC_ReadCardSerial()) {
    Serial.println("Failed to read card");
    return;
  }

  String uidStr = "";
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    uidStr += String(mfrc522.uid.uidByte[i] < 0x10 ? "0" : "");
    uidStr += String(mfrc522.uid.uidByte[i], HEX);
  }
  uidStr.toUpperCase();

  Serial.print("Card UID: ");
  Serial.println(uidStr);

  // Send UID to server
  bool accessGranted = checkAccess(uidStr);

  if (accessGranted) {
    Serial.println("Access Granted");
    digitalWrite(LED_PIN, HIGH);
    tone(BUZZER_PIN, 1000, 200);
    delay(1000);
    digitalWrite(LED_PIN, LOW);
    noTone(BUZZER_PIN);
  } else {
    Serial.println("Access Denied");
    for (int i = 0; i < 3; i++) {
      tone(BUZZER_PIN, 500, 200);
      delay(300);
    }
    noTone(BUZZER_PIN);
  }

  // Halt PICC
  mfrc522.PICC_HaltA();
  delay(1000);  // Add a small delay to prevent rapid triggering
}

bool checkAccess(String uid) {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClient client; // Create WiFiClient instance
    HTTPClient http;
    String url = String(serverName) + "/api/user/" + uid;
    http.begin(client, url); // Use updated begin()

    Serial.print("Sending GET request to: ");
    Serial.println(url);

    int httpCode = http.GET();
    if (httpCode > 0) {  // Check for valid response
      Serial.printf("HTTP response code: %d\n", httpCode);
      if (httpCode == HTTP_CODE_OK) {
        String payload = http.getString();
        Serial.println("Response: " + payload);

        // Log access attempt
        logAccess(uid);

        http.end();
        return true;
      } else if (httpCode == HTTP_CODE_NOT_FOUND) {
        Serial.println("User not found");
        http.end();
        return false;
      } else {
        Serial.printf("Server returned code: %d\n", httpCode);
        http.end();
        return false;
      }
    } else {
      Serial.printf("HTTP GET failed: %s\n", http.errorToString(httpCode).c_str());
      http.end();
      return false;
    }
  } else {
    Serial.println("Wi-Fi not connected");
    return false;
  }
}

void logAccess(String uid) {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClient client; // Create WiFiClient instance
    HTTPClient http;
    String url = String(serverName) + "/api/log";

    http.begin(client, url); // Use updated begin()
    http.addHeader("Content-Type", "application/json");

    String jsonData = "{\"uid\":\"" + uid + "\",\"userName\":\"\",\"timestamp\":\"" + getTimeStamp() + "\"}";

    Serial.print("Sending POST request to: ");
    Serial.println(url);
    Serial.print("JSON data: ");
    Serial.println(jsonData);

    int httpCode = http.POST(jsonData);
    if (httpCode > 0) {  // Check for valid response
      Serial.printf("HTTP response code: %d\n", httpCode);
      if (httpCode == HTTP_CODE_OK) {
        String payload = http.getString();
        Serial.println("Log Response: " + payload);
      } else {
        Serial.printf("Server returned code: %d\n", httpCode);
      }
    } else {
      Serial.printf("HTTP POST failed: %s\n", http.errorToString(httpCode).c_str());
    }
    http.end();
  } else {
    Serial.println("Wi-Fi not connected");
  }
}

String getTimeStamp() {
  time_t now = time(nullptr);
  struct tm* p_tm = localtime(&now);

  char timeStr[50]; // Increased buffer size

  snprintf(timeStr, sizeof(timeStr), "%04d-%02d-%02dT%02d:%02d:%02d",
           p_tm->tm_year + 1900,
           p_tm->tm_mon + 1,
           p_tm->tm_mday,
           p_tm->tm_hour,
           p_tm->tm_min,
           p_tm->tm_sec);

  return String(timeStr);
}
