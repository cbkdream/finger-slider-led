// 손가락 슬라이더 LED 밝기 조절 - 아두이노(Wokwi)
// 받는 값: "B:0~255"  ->  analogWrite(9, 값)  ->  "PWM:값" 으로 응답
// 시리얼 모니터에 B:0, B:64, B:128, B:255 입력해서 확인

const int LED_PIN = 9;   // PWM 핀 (~)
char buf[16];
byte len = 0;

void handleLine(const char *line);

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
  analogWrite(LED_PIN, 128);
  Serial.println("READY: B:0~255 를 입력하세요");
}

void loop() {
  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '\n') {
      buf[len] = '\0';
      handleLine(buf);
      len = 0;
    } else if (c != '\r') {
      if (len < sizeof(buf) - 1) buf[len++] = c;
      else len = 0;
    }
  }
}

void handleLine(const char *line) {
  if (line[0] != 'B' || line[1] != ':') return;
  int value = constrain(atoi(line + 2), 0, 255);
  analogWrite(LED_PIN, value);
  Serial.print("PWM:");
  Serial.println(value);
}
