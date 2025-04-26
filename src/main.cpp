#include <Arduino.h>
#include <SPI.h>
#include <MFRC522.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <time.h>
#include <ArduinoJson.h>

// RFID pins
#define RST_PIN D3  // GPIO0
#define SS_PIN D4   // GPIO2

MFRC522 mfrc522(SS_PIN, RST_PIN);

// Buzzer and LED pins
#define BUZZER_PIN D1   // GPIO5
#define LED_PIN D2      // GPIO4

// Wi-Fi credentials
const char* ssid = "657";
const char* password = "12345678";

// Server details
// Update this line to use your PC's hotspot IP address
const char* serverName = "http://192.168.137.1:3000";

// Function prototypes
bool checkAccess(String uid);
void logAccess(String uid, bool accessGranted);
String getTimeStamp();
bool addNewUser(String uid, String userName);
bool updateUserName(String uid, String newName);
void handleError(int errorCode);
void retryWiFiConnection();
void testServerConnection();

// Error handling
void handleError(int errorCode) {
  Serial.printf("Error occurred: %d\n", errorCode);
  for (int i = 0; i < 3; i++) {
    digitalWrite(LED_PIN, HIGH);
    tone(BUZZER_PIN, 300, 200);
    delay(200);
    digitalWrite(LED_PIN, LOW);
    noTone(BUZZER_PIN);
    delay(200);
  }
}

void retryWiFiConnection() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi connection lost. Attempting to reconnect...");
    WiFi.begin(ssid, password);
    int retries = 0;
    while (WiFi.status() != WL_CONNECTED && retries < 10) {
      delay(500);
      Serial.print(".");
      retries++;
    }
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("\nWiFi reconnected!");
    } else {
      Serial.println("\nFailed to reconnect to WiFi");
    }
  }
}

void setup() {
  Serial.begin(115200);
  SPI.begin();
  mfrc522.PCD_Init();

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
  Serial.print("Local IP: ");
  Serial.println(WiFi.localIP());

  // Test server connection
  testServerConnection();

  // Time synchronization for Kenya (EAT timezone, UTC+3)
  configTime(3 * 3600, 0, "pool.ntp.org", "time.nist.gov");
  Serial.print("Synchronizing time for Kenya (EAT, UTC+3)");
  time_t now = time(nullptr);
  while (now < 100000) {
    Serial.print(".");
    delay(500);
    now = time(nullptr);
  }
  Serial.println("\nTime synchronized");
  
  // Display current time after synchronization
  String currentTime = getTimeStamp();
  Serial.print("Current time in Kenya: ");
  Serial.println(currentTime);

  Serial.println("Place your card on the reader...");
}

void loop() {
  // Look for new cards
  if (!mfrc522.PICC_IsNewCardPresent()) {
    delay(100); // Small delay to prevent CPU hogging
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
  // Check WiFi connection first
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected! Attempting to reconnect...");
    retryWiFiConnection();
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("Failed to reconnect to WiFi. Cannot check access.");
      return false;
    }
  }

  // Debug WiFi connection
  Serial.print("WiFi connected with IP: ");
  Serial.println(WiFi.localIP());

  WiFiClient client;
  HTTPClient http;
  
  // Use the hotspot IP address
  String url = String(serverName) + "/api/user/" + uid;
  
  Serial.print("Connecting to URL: ");
  Serial.println(url);
  
  // Begin HTTP request
  http.begin(client, url);
  http.setTimeout(10000); // 10 second timeout
  
  Serial.println("Sending GET request...");
  int httpCode = http.GET();
  
  Serial.print("HTTP response code: ");
  Serial.println(httpCode);
  
  if (httpCode > 0) {  // Check for valid response
    if (httpCode == HTTP_CODE_OK) {
      String payload = http.getString();
      Serial.println("Response payload: " + payload);
      
      // Parse JSON to extract user information
      StaticJsonDocument<256> doc;
      DeserializationError error = deserializeJson(doc, payload);
      
      if (!error) {
        // Check if name field exists
        if (doc.containsKey("name")) {
          // Extract user name from JSON response
          String userName = doc["name"].as<String>();
          
          // Check if the authorized field exists and default to true if missing
          bool accessGranted = true;
          if (doc.containsKey("authorized")) {
            accessGranted = doc["authorized"].as<bool>();
          }
          
          // Display the user's name
          Serial.print("Welcome, ");
          Serial.println(userName);
          
          // Log access attempt
          logAccess(uid, accessGranted);
          
          http.end();
          return accessGranted;
        } else {
          Serial.println("Error: JSON response missing 'name' field");
          logAccess(uid, false);
          http.end();
          return false;
        }
      } else {
        Serial.print("JSON parsing error: ");
        Serial.println(error.c_str());
        logAccess(uid, false);
        http.end();
        return false;
      }
    } else if (httpCode == HTTP_CODE_NOT_FOUND) {
      Serial.println("User not found");
      logAccess(uid, false);
      http.end();
      return false;
    } else {
      Serial.printf("Server returned error code: %d\n", httpCode);
      logAccess(uid, false);
      http.end();
      return false;
    }
  } else {
    Serial.printf("HTTP GET failed: %s\n", http.errorToString(httpCode).c_str());
    http.end();
    return false;
  }
}

bool addNewUser(String uid, String userName) {
  if (WiFi.status() != WL_CONNECTED) {
    retryWiFiConnection();
    if (WiFi.status() != WL_CONNECTED) return false;
  }

  WiFiClient client;
  HTTPClient http;
  String url = String(serverName) + "/api/add_user";
  
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<200> doc;
  doc["uid"] = uid;
  doc["name"] = userName;
  String jsonData;
  serializeJson(doc, jsonData);

  int httpCode = http.POST(jsonData);
  bool success = false;

  if (httpCode > 0) {
    if (httpCode == HTTP_CODE_OK) {
      success = true;
      Serial.println("User added successfully");
    } else {
      Serial.printf("Failed to add user. HTTP code: %d\n", httpCode);
    }
  } else {
    Serial.printf("HTTP POST failed: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();
  return success;
}

bool updateUserName(String uid, String newName) {
  if (WiFi.status() != WL_CONNECTED) {
    retryWiFiConnection();
    if (WiFi.status() != WL_CONNECTED) return false;
  }

  WiFiClient client;
  HTTPClient http;
  String url = String(serverName) + "/api/update_user";
  
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<200> doc;
  doc["uid"] = uid;
  doc["name"] = newName;
  String jsonData;
  serializeJson(doc, jsonData);

  int httpCode = http.PUT(jsonData);
  bool success = false;

  if (httpCode > 0) {
    if (httpCode == HTTP_CODE_OK) {
      success = true;
      Serial.println("User updated successfully");
    } else {
      Serial.printf("Failed to update user. HTTP code: %d\n", httpCode);
    }
  } else {
    Serial.printf("HTTP PUT failed: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();
  return success;
}

void logAccess(String uid, bool accessGranted) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected. Cannot log access.");
    return;
  }

  // Get current timestamp
  String timestamp = getTimeStamp();
  Serial.print("Logging access at time: ");
  Serial.println(timestamp);

  WiFiClient client;
  HTTPClient http;
  
  String url = String(serverName) + "/api/log";
  
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  
  // Create JSON payload
  StaticJsonDocument<256> doc;
  doc["uid"] = uid;
  doc["accessGranted"] = accessGranted;
  doc["timestamp"] = timestamp; // Using the format YYYY-MM-DD HH:MM:SS
  doc["accessPoint"] = "School of Engineering";
  doc["accessType"] = "time_in";
  
  String jsonPayload;
  serializeJson(doc, jsonPayload);
  
  // Debug the payload
  Serial.print("Sending JSON payload: ");
  Serial.println(jsonPayload);
  
  int httpCode = http.POST(jsonPayload);
  
  if (httpCode > 0) {
    if (httpCode == HTTP_CODE_OK) {
      Serial.println("Access logged successfully");
      
      // Let's also print the server response if available
      String response = http.getString();
      if (response.length() > 0) {
        Serial.print("Server response: ");
        Serial.println(response);
      }
    } else {
      Serial.printf("Failed to log access. HTTP code: %d\n", httpCode);
      // Print response body which might contain error details
      String errorResponse = http.getString();
      Serial.print("Error details: ");
      Serial.println(errorResponse);
    }
  } else {
    Serial.printf("HTTP POST failed: %s\n", http.errorToString(httpCode).c_str());
  }
  
  http.end();
}

String getTimeStamp() {
  time_t now = time(nullptr);
  struct tm* p_tm = localtime(&now);
  
  char timeStr[20];
  // Format the date as YYYY-MM-DD HH:MM:SS which is the exact format needed
  snprintf(timeStr, sizeof(timeStr), "%04d-%02d-%02d %02d:%02d:%02d",
           p_tm->tm_year + 1900,
           p_tm->tm_mon + 1,
           p_tm->tm_mday,
           p_tm->tm_hour,
           p_tm->tm_min,
           p_tm->tm_sec);
  
  return String(timeStr);
}

void testServerConnection() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected. Cannot test server.");
    return;
  }
  
  WiFiClient client;
  HTTPClient http;
  
  Serial.println("\nNetwork Information:");
  Serial.print("ESP8266 IP: ");
  Serial.println(WiFi.localIP());
  Serial.print("Subnet Mask: ");
  Serial.println(WiFi.subnetMask());
  Serial.print("Gateway IP: ");
  Serial.println(WiFi.gatewayIP());
  
  // Test connection to server base URL
  Serial.print("Testing connection to: ");
  Serial.println(serverName);
  
  http.begin(client, serverName);
  http.setTimeout(5000);
  
  int httpCode = http.GET();
  
  if (httpCode > 0) {
    Serial.printf("Response code: %d\n", httpCode);
    if (httpCode == HTTP_CODE_OK) {
      Serial.println("Server base URL is accessible!");
    } else {
      Serial.println("Server returned non-OK response.");
    }
  } else {
    Serial.printf("Connection failed: %s\n", http.errorToString(httpCode).c_str());
  }
  
  http.end();
  delay(1000);
  
  // Test API test endpoint
  String testUrl = String(serverName) + "/api/test";
  Serial.print("Testing API endpoint: ");
  Serial.println(testUrl);
  
  http.begin(client, testUrl);
  http.setTimeout(5000);
  
  httpCode = http.GET();
  
  if (httpCode > 0) {
    Serial.printf("Response code: %d\n", httpCode);
    if (httpCode == HTTP_CODE_OK) {
      String payload = http.getString();
      Serial.println("Response: " + payload);
      Serial.println("API endpoint is working!");
    } else {
      Serial.println("API endpoint returned non-OK response.");
    }
  } else {
    Serial.printf("Connection to API failed: %s\n", http.errorToString(httpCode).c_str());
  }
  
  http.end();
  
  // Test ping to the server by IP rather than hostname
  IPAddress serverIP;
  String serverHost = String(serverName).substring(7); // Remove "http://"
  int colonPos = serverHost.indexOf(':');
  if (colonPos > 0) {
    serverHost = serverHost.substring(0, colonPos); // Remove port if present
  }
  
  Serial.println("\nChecking server connection via IP...");
  if (WiFi.hostByName(serverHost.c_str(), serverIP)) {
    Serial.print("Resolved server IP: ");
    Serial.println(serverIP);
    
    // Check if ESP8266 and server are on same subnet
    IPAddress espIP = WiFi.localIP();
    IPAddress espSubnet = WiFi.subnetMask();
    
    boolean sameSubnet = true;
    for (int i = 0; i < 4; i++) {
      if ((espIP[i] & espSubnet[i]) != (serverIP[i] & espSubnet[i])) {
        sameSubnet = false;
      }
    }
    
    if (sameSubnet) {
      Serial.println("ESP8266 and server are on the same subnet - good!");
    } else {
      Serial.println("WARNING: ESP8266 and server appear to be on different subnets!");
      Serial.println("This may cause connection problems.");
    }
  } else {
    Serial.println("Failed to resolve server hostname.");
  }
}
