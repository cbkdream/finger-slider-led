// 임베디드시스템개론 미션 - 손가락 슬라이더로 LED 밝기 조절
// 보드가 없어서 화면에 가상 LED를 그려서 구현함
// 중지 접고 엄지/검지 벌리면 밝아짐, 오므리면 어두워짐
// C키: LED 색 변경, S키: 화면 저장

let handPose, video, slider;
let hands = [];
let connections;
let ready = false;

let sliderValue = 128;     // 슬라이더 값 0~255
let ledPwm = 128;          // 가상 아두이노가 LED에 출력 중인 PWM 값 0~255

// ---- 가상 시리얼 ----
let serialLog = [];        // 화면에 보여 줄 송수신 기록
let lastSent = -1;
let lastSendTime = 0;
const SEND_INTERVAL = 50;  // 50ms 간격으로 전송

// ---- LED 색 ----
const LED_COLORS = [
  { name: '빨강', rgb: [255, 40, 30] },
  { name: '초록', rgb: [40, 255, 80] },
  { name: '파랑', rgb: [40, 120, 255] },
  { name: '노랑', rgb: [255, 210, 0] },
];
let colorIndex = 0;

async function setup() {
  createCanvas(640, 480);

  // ① 세로 슬라이더 (아래 0, 위 255)
  slider = createSlider(0, 255, 128, 1);
  slider.style('writing-mode', 'vertical-rl');
  slider.style('height', '440px');
  slider.style('width', '20px');
  slider.style('transform: rotate(180deg)');
  slider.position(10, 20);
  slider.input(updateSliderValue);

  // ② 카메라
  video = createCapture(VIDEO, { flipped: true });
  video.size(640, 480);
  video.hide();

  // ③ 손 인식 모델
  handPose = await ml5.handPose({ flipped: true });
  handPose.detectStart(video, gotHands);
  connections = handPose.getConnections();
  ready = true;
}

function draw() {
  background(20);
  if (video) image(video, 0, 0, width, height);

  // 영상을 살짝 어둡게 해서 LED 빛이 잘 보이게 함
  noStroke();
  fill(0, 0, 0, 90);
  rect(0, 0, width, height);

  // 주먹 모드일 때만 손가락으로 슬라이더 조절
  let grab = isGrabMode(hands);
  if (grab) {
    let c = slider.value();
    let v = getLedValue(hands);           // 0~255
    let next = c + 0.2 * (v - c);         // 차이의 20%씩 부드럽게 이동
    if (abs(v - c) < 3) next = v;         // step=1 반올림으로 멈추는 문제 보정
    slider.value(next);
  }
  sliderValue = Number(slider.value());

  // 가상 시리얼로 값 전송 → 가상 아두이노가 LED 갱신
  sendVirtualSerial(sliderValue);

  // 그리기 순서: LED → 손 → 정보 패널 (손이 LED 위에 보이도록)
  drawVirtualLed(width / 2, height / 2 - 10, ledPwm);
  drawSkeletons(hands);
  drawKeyPoints(hands);
  if (grab) drawConnectedLine(hands);
  drawInfoPanel(grab);
  drawPwmPanel(ledPwm);

  if (!ready) drawLoading();
}

function gotHands(results) {
  hands = results;
}

// ---------------- 가상 시리얼 · 가상 아두이노 ----------------

// 보드가 있으면 여기서 serial.send() 사용
// 값이 바뀌었을 때만 보냄
function sendVirtualSerial(value) {
  if (value === lastSent) return;
  if (millis() - lastSendTime < SEND_INTERVAL) return;
  lastSent = value;
  lastSendTime = millis();

  const msg = 'B:' + value;
  addLog('→ ' + msg);
  const reply = virtualArduino(msg);      // 아두이노가 받아서 처리
  if (reply) addLog('← ' + reply);
}

// wokwi/sketch.ino 의 handleLine() 과 같은 동작
function virtualArduino(line) {
  if (!line.startsWith('B:')) return null;          // 형식 검사
  let value = constrain(parseInt(line.substring(2), 10) || 0, 0, 255);
  ledPwm = value;                                   // analogWrite(LED_PIN, value)
  return 'PWM:' + value;                            // Serial.println("PWM:" + value)
}

function addLog(text) {
  serialLog.push(text);
  if (serialLog.length > 4) serialLog.shift();
}

// ---------------- 가상 LED ----------------

// pwm(0~255) → 투명도(alpha) = pwm, 크기 = 기본 + pwm 비례
function drawVirtualLed(x, y, pwm) {
  const [r, g, b] = LED_COLORS[colorIndex].rgb;
  const k = pwm / 255;                 // 0~1
  const size = 70 + 40 * k;            // 몸체 지름 70~110px

  push();
  // 다리 2개 (+ 긴 다리, - 짧은 다리)
  stroke(190);
  strokeWeight(5);
  line(x - 14, y + size * 0.45, x - 14, y + size * 0.45 + 70);
  line(x + 14, y + size * 0.45, x + 14, y + size * 0.45 + 55);

  // 빛 번짐(글로우): 밝을수록 크고 진하게
  noStroke();
  for (let i = 6; i >= 1; i--) {
    fill(r, g, b, pwm * 0.07);
    circle(x, y, size + i * 35 * k);
  }

  // 꺼진 LED 몸체 (항상 보임)
  fill(70, 70, 70, 220);
  stroke(220);
  strokeWeight(2);
  arc(x, y, size, size, PI, TWO_PI);                 // 둥근 머리
  rect(x - size / 2, y, size, size * 0.45);          // 원통 몸체
  rect(x - size / 2 - 6, y + size * 0.45 - 8, size + 12, 10, 3); // 테두리

  // 켜진 빛: 같은 모양을 alpha = pwm 으로 겹쳐 그림
  drawingContext.shadowBlur = 60 * k;
  drawingContext.shadowColor = `rgba(${r},${g},${b},${k})`;
  noStroke();
  fill(r, g, b, pwm);
  arc(x, y, size - 4, size - 4, PI, TWO_PI);
  rect(x - size / 2 + 2, y, size - 4, size * 0.45 - 2);
  drawingContext.shadowBlur = 0;

  // 반짝이는 하이라이트
  fill(255, 255, 255, 60 + 120 * k);
  ellipse(x - size * 0.18, y - size * 0.22, size * 0.18, size * 0.28);
  pop();
}

// ---------------- 정보 패널 ----------------

function drawInfoPanel(grab) {
  push();
  noStroke();
  fill(0, 0, 0, 160);
  rect(420, 10, 210, 100, 10);

  fill(255);
  textSize(14);
  textAlign(LEFT, TOP);
  text('LED 값: ' + ledPwm + ' / 255', 434, 22);
  text('밝기: ' + round((ledPwm / 255) * 100) + ' %', 434, 44);
  text('색: ' + LED_COLORS[colorIndex].name + '  (C 키)', 434, 66);

  // 모드 표시 (주황 = 손가락 조절 중)
  fill(grab ? color(255, 140, 0) : color(140));
  text(grab ? '● 손가락 조절 중' : '○ 고정 (중지를 접으면 조절)', 434, 88);

  // 전체 값 막대
  fill(60);
  rect(40, 12, 360, 10, 5);
  fill(...LED_COLORS[colorIndex].rgb);
  rect(40, 12, map(ledPwm, 0, 255, 0, 360), 10, 5);
  pop();
}

// 하단: PWM 파형 + 가상 시리얼 모니터
function drawPwmPanel(pwm) {
  push();
  noStroke();
  fill(0, 0, 0, 170);
  rect(40, 380, 590, 92, 10);

  fill(255);
  textSize(12);
  textAlign(LEFT, TOP);
  text('PWM 파형 (듀티비 ' + round((pwm / 255) * 100) + '%)', 52, 386);
  text('가상 시리얼 모니터 · 9600 baud', 400, 386);

  // 파형: 한 주기 50px, 5주기
  const x0 = 52, yHigh = 410, yLow = 460, period = 60;
  const duty = pwm / 255;
  stroke(...LED_COLORS[colorIndex].rgb);
  strokeWeight(2);
  noFill();
  if (duty >= 1) {                          // 100%: 계속 HIGH
    line(x0, yHigh, x0 + 5 * period, yHigh);
    pop();
    drawSerialLog();
    return;
  }
  beginShape();
  for (let i = 0; i < 5; i++) {
    const xs = x0 + i * period;
    const xOn = xs + period * duty;
    if (duty > 0) { vertex(xs, yHigh); vertex(xOn, yHigh); }
    vertex(xOn, yLow);
    vertex(xs + period, yLow);
    if (duty > 0 && i < 4) vertex(xs + period, yHigh);
  }
  endShape();
  pop();
  drawSerialLog();
}

// 가상 시리얼 기록
function drawSerialLog() {
  push();
  noStroke();
  fill(180, 255, 180);
  textFont('monospace');
  textSize(12);
  textAlign(LEFT, TOP);
  for (let i = 0; i < serialLog.length; i++) {
    text(serialLog[i], 400, 404 + i * 16);
  }
  pop();
}

function drawLoading() {
  push();
  fill(0, 0, 0, 180);
  rect(170, 200, 300, 50, 10);
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(16);
  text('손 인식 모델을 불러오는 중…', width / 2, 225);
  pop();
}

// ---------------- 손 그리기 (강의 코드) ----------------

function drawKeyPoints(hs) {
  for (let i = 0; i < hs.length; i++) {
    let hand = hs[i];
    for (let j = 0; j < hand.keypoints.length; j++) {
      let keypoint = hand.keypoints[j];
      fill(255, 0, 0);
      noStroke();
      circle(keypoint.x, keypoint.y, 10);
    }
  }
}

function drawSkeletons(hs) {
  if (!connections) return;
  for (let i = 0; i < hs.length; i++) {
    let hand = hs[i];
    stroke(0, 255, 0);
    strokeWeight(2);
    for (const [a, b] of connections) {
      const start = hand.keypoints[a];
      const end = hand.keypoints[b];
      if (start && end) {
        line(start.x, start.y, end.x, end.y);
      }
    }
  }
}

function drawConnectedLine(hs) {
  if (hs.length > 0) {
    let hand = hs[0];
    const a = hand.keypoints[4]; // 엄지 끝
    const b = hand.keypoints[8]; // 검지 끝
    stroke(255, 140, 0);
    strokeWeight(4);
    line(a.x, a.y, b.x, b.y);
    noFill();
    circle(a.x, a.y, 22);
    circle(b.x, b.y, 22);
  }
}

// ---------------- 손 제스처 판별 ----------------

// 중지 끝(12)이 손바닥 길이(0~9)보다 손목에 가까우면 주먹 모드
function isGrabMode(hs) {
  if (hs == null) return false;
  if (hs.length == 0) return false;
  let ks = hs[0].keypoints;
  if (ks.length != 21) return false;

  let palmLength = dist(ks[0].x, ks[0].y, ks[9].x, ks[9].y);
  let grabDistance = dist(ks[0].x, ks[0].y, ks[12].x, ks[12].y);
  if (grabDistance > palmLength) return false;
  return true;
}

// 엄지-검지 거리 ÷ 손바닥 길이 → 0~100 (강의 코드)
function getNormalizedDistance(hs) {
  if (hs.length > 0) {
    let ks = hs[0].keypoints;
    const a = ks[4]; // 엄지 끝
    const b = ks[8]; // 검지 끝
    const c = ks[0]; // 손목
    const d = ks[9]; // 중지 시작점
    let v = dist(a.x, a.y, b.x, b.y);
    let p = dist(c.x, c.y, d.x, d.y);
    let s = round(100 * (v / p)) - 15;
    return constrain(s, 0, 100);
  }
  return 0;
}

// 0~100 → LED 값 0~255
function getLedValue(hs) {
  return round(map(getNormalizedDistance(hs), 0, 100, 0, 255));
}

function updateSliderValue() {
  sliderValue = Number(slider.value());
}

function keyPressed() {
  if (key === 'c' || key === 'C') colorIndex = (colorIndex + 1) % LED_COLORS.length;
  if (key === 's' || key === 'S') saveCanvas('virtual-led-' + ledPwm, 'png');
}
