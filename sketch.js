
let capture;
let previousFrame;
let blobs = []; 
let meshPoints = [];
let presenceButton;
let isHoldingButton = false;
let holdStartTime = 0;
let font; 
let textPoints = []; 
let textAnimation = { isAnimating: false, startTime: 0, duration: 3000 };
let glowBuffer; 
let blobBuffer; 

// --- FONT SELECTION ---
const FONT_PATH = 'Montserrat-Thin.ttf'; 

// --- SENSITIVITY CONTROL ---
const sensitivity = 0.7; 

// --- BLOB CONTROL ---
const MAX_BLOBS = 7;
const SPEED_MULTIPLIER = 1.5; 
const BLOB_LIFESPAN = 12000;
const SPAWN_COOLDOWN = 800;
const BLOB_FADE_OUT_DURATION = 4000;
const BLOB_GLOW_BLUR = 100;
const BLOB_CORE_BLUR = 25;

// --- BUTTON CONTROL ---
const BUTTON_VISIBILITY_TIMEOUT = 12000;
const BUTTON_SIZE = 80;
const BUTTON_FADE_SPEED = 0.05;
const MAX_HOLD_TIME = 3000; 
const BUTTON_GLOW_BLUR = 50;
const BUTTON_CORE_BLUR = 12;
const BUTTON_COOLDOWN_DURATION = 4000;
const BUTTON_GROW_SPEED = 0.2;
const BUTTON_GROW_FACTOR = 1.5;
const BUTTON_GLOW_GROW_FACTOR = 2.0;

// --- TEXT & MESSAGE BLOB CONTROL ---
const MESSAGES = ["Life is beautiful", "Chíp Già", "Stay curious", "Create your sunshine", "The future is bright", "Embrace the journey", "Choose joy", "Be present", "You are enough", "Invent your world"];
const TEXT_FONT_SIZE = 96;
const TEXT_OPACITY = 90;
const TEXT_BREATHING_MIN_SIZE = 6;
const TEXT_BREATHING_MAX_SIZE = 10;
const TEXT_BREATHING_SPEED = 0.002;
const TEXT_ANIM_MIN_DURATION = 1500;
const TEXT_ANIM_MAX_DURATION = 4000;

// --- MESH GRADIENT & COLOR CONTROL ---
const MESH_DENSITY = 4, MESH_WANDER_AMOUNT = 150, MESH_WANDER_SPEED = 0.003, MESH_BLUR = 120;
const GRADIENT_HUE_1 = 230, GRADIENT_SAT_1 = 90, GRADIENT_BRI_1 = 90;
const GRADIENT_HUE_2 = 220, GRADIENT_SAT_2 = 80, GRADIENT_BRI_2 = 60 ;
const PRESENCE_COLOR_HUE = 15, PRESENCE_COLOR_SAT = 90, PRESENCE_COLOR_BRI = 100;

// --- VISUAL EFFECTS ---
const GRAIN_AMOUNT = 0.3, BLENDING_MODE = 'DODGE', TEXT_GLOW_BLUR = 4;

// --- Internal Tuning Parameters ---
let motionSensitivityThreshold, activationThreshold;
let motionEnergy = 0, lastSpawnTime = 0;
let baseColor1, baseColor2, presenceColor;

function preload() {
  font = loadFont(FONT_PATH);
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB, 360, 100, 100, 100);
  glowBuffer = createGraphics(width, height);
  glowBuffer.colorMode(HSB, 360, 100, 100, 100);
  blobBuffer = createGraphics(width, height);
  blobBuffer.colorMode(HSB, 360, 100, 100, 100);
  
  motionSensitivityThreshold = map(sensitivity, 0, 1, 20, 70);
  activationThreshold = map(sensitivity, 0, 1, 50, 250);

  capture = createCapture(VIDEO);
  capture.size(160, 120);
  capture.hide();
  previousFrame = createGraphics(capture.width, capture.height);
  previousFrame.pixelDensity(1);

  baseColor1 = color(GRADIENT_HUE_1, GRADIENT_SAT_1, GRADIENT_BRI_1);
  baseColor2 = color(GRADIENT_HUE_2, GRADIENT_SAT_2, GRADIENT_BRI_2);
  presenceColor = color(PRESENCE_COLOR_HUE, PRESENCE_COLOR_SAT, PRESENCE_COLOR_BRI);
  
  setupMesh();
  setupButton();
  textFont(font);
}

function draw() {
  let now = millis();
  let totalMotion = detectMotion();
  if (totalMotion > 10) motionEnergy += totalMotion;
  motionEnergy *= 0.95; 

  if (motionEnergy > activationThreshold && now > lastSpawnTime + SPAWN_COOLDOWN && blobs.length < MAX_BLOBS) {
    spawnBlob();
    motionEnergy = 0; lastSpawnTime = now;
    presenceButton.isVisible = true; presenceButton.lastActiveTime = now;
  }

  background(0);
  drawMesh();
  
  blobBuffer.clear();
  for (let blob of blobs) { 
    blob.update(); 
    blob.draw(blobBuffer);
  }
  updateButton();
  drawButton(blobBuffer);
  
  blendMode(window[BLENDING_MODE]);
  image(blobBuffer, 0, 0);
  blendMode(BLEND);

  updateAndDrawText();
  applyGrain();

  blobs = blobs.filter(blob => !blob.isDead());
}

// --- MOUSE AND TOUCH INPUT HANDLERS ---
function mousePressed() {
  handlePress();
}

function mouseReleased() {
  handleRelease();
}

function touchStarted() {
  handlePress();
  return false; // Prevents default browser actions like zoom
}

function touchEnded() {
  handleRelease();
  return false; // Prevents default browser actions
}

function handlePress() {
  if (presenceButton.isVisible && !isHoldingButton && !presenceButton.isOnCooldown && presenceButton.currentAlpha > 50) {
    // p5.js maps the first touch x/y to mouseX/mouseY
    let d = dist(mouseX, mouseY, presenceButton.pos.x, presenceButton.pos.y);
    if (d < presenceButton.currentSize / 2) {
      isHoldingButton = true;
      holdStartTime = millis();
      textPoints = [];
      textAnimation.isAnimating = false;
    }
  }
}

function handleRelease() {
  if (isHoldingButton) {
    isHoldingButton = false;
    let holdDuration = min(millis() - holdStartTime, MAX_HOLD_TIME);
    startTextAnimation(holdDuration);
    presenceButton.isOnCooldown = true;
    presenceButton.cooldownStartTime = millis();
  }
}


// ---- "FLY-IN WARPED CIRCLE" BLOB LOGIC ----
function spawnBlob() {
  let newBlob = {
    birthTime: millis(), lifespan: BLOB_LIFESPAN,
    pos: createVector(0, 0), vel: createVector(0, 0),
    xPhase: random(TWO_PI),
    maxSize: random(width * 0.2, width * 0.5),
    isFading: false, fadeStartTime: 0,

    update: function() {
      if (!this.isFading && !presenceButton.isVisible) { this.isFading = true; this.fadeStartTime = millis(); }
      
      this.pos.add(this.vel);
      this.pos.x += sin(this.xPhase + frameCount * 0.02) * 0.5;
      this.pos.y += cos(this.xPhase + frameCount * 0.02) * 0.5;
    },

    draw: function(pg) {
      let size = this.maxSize;
      let alpha = sin((millis() - this.birthTime) / this.lifespan * PI) * 95;

      if (this.isFading) {
        const fadeProgress = (millis() - this.fadeStartTime) / BLOB_FADE_OUT_DURATION;
        alpha *= (1.0 - constrain(fadeProgress, 0, 1));
      }
      if (alpha <= 0) return;

      const blobColor = color(hue(presenceColor), saturation(presenceColor), brightness(presenceColor), alpha);
      this.drawShape(pg, blobColor, size, BLOB_GLOW_BLUR);
      this.drawShape(pg, blobColor, size, BLOB_CORE_BLUR);
    },
    
    drawShape: function(pg, c, size, blurAmount) {
        pg.drawingContext.filter = `blur(${blurAmount}px)`;
        pg.noStroke(); pg.fill(c);
        pg.push(); 
        pg.translate(this.pos.x, this.pos.y);
        pg.circle(0, 0, size);
        pg.pop();
        pg.drawingContext.filter = 'none';
    },

    isDead: function() {
      if (this.isFading) return millis() > this.fadeStartTime + BLOB_FADE_OUT_DURATION;
      const buffer = this.maxSize;
      if (this.pos.x < -buffer || this.pos.x > width + buffer || this.pos.y < -buffer || this.pos.y > height + buffer) {
        return true;
      }
      return false;
    }
  };

  let side = floor(random(4)); let buffer = newBlob.maxSize / 2;
  switch (side) {
    case 0: newBlob.pos.set(random(width), height + buffer); newBlob.vel.set(random(-0.5, 0.5), random(-1, -0.5)); break;
    case 1: newBlob.pos.set(random(width), -buffer); newBlob.vel.set(random(-0.5, 0.5), random(0.5, 1)); break;
    case 2: newBlob.pos.set(width + buffer, random(height)); newBlob.vel.set(random(-1, -0.5), random(-0.5, 0.5)); break;
    case 3: newBlob.pos.set(-buffer, random(height)); newBlob.vel.set(random(0.5, 1), random(-0.5, 0.5)); break;
  }
  newBlob.vel.mult(SPEED_MULTIPLIER);
  blobs.push(newBlob);
}


// ---- TEXT ANIMATION FUNCTIONS ----
function startTextAnimation(holdDuration) {
  const currentMessage = random(MESSAGES);
  const bounds = font.textBounds(currentMessage, 0, 0, TEXT_FONT_SIZE);
  const x = width / 2 - bounds.w / 2, y = height / 3 + bounds.h / 2;
  textPoints = font.textToPoints(currentMessage, x, y, TEXT_FONT_SIZE, { sampleFactor: 0.1, simplifyThreshold: 0 });
  textAnimation.duration = map(holdDuration, 0, MAX_HOLD_TIME, TEXT_ANIM_MIN_DURATION, TEXT_ANIM_MAX_DURATION);
  textAnimation.startTime = millis();
  textAnimation.isAnimating = true;
}

function updateAndDrawText() {
  if (textPoints.length === 0) return;
  
  push();
  blendMode(BLEND); 
  
  glowBuffer.clear();
  
  let progress = 1.0;
  if (textAnimation.isAnimating) {
    progress = constrain((millis() - textAnimation.startTime) / textAnimation.duration, 0, 1);
    if (progress >= 1) textAnimation.isAnimating = false;
  }
  
  const pointsToDraw = floor(progress * textPoints.length);
  const time = millis() * TEXT_BREATHING_SPEED;

  glowBuffer.noStroke();
  glowBuffer.fill(0, 0, 100, TEXT_OPACITY); 
  
  for (let i = 0; i < pointsToDraw; i++) {
    const p = textPoints[i];
     if (i > 0) { const prev = textPoints[i - 1]; if (dist(prev.x, prev.y, p.x, p.y) > TEXT_FONT_SIZE * 0.5) continue; }
    
    const noiseValue = noise(i * 0.1, time);
    const currentDotSize = map(noiseValue, 0, 1, TEXT_BREATHING_MIN_SIZE, TEXT_BREATHING_MAX_SIZE);
    
    glowBuffer.circle(p.x, p.y, currentDotSize);
  }

  drawingContext.filter = `blur(${TEXT_GLOW_BLUR}px)`;
  image(glowBuffer, 0, 0);
  
  drawingContext.filter = 'none';
  image(glowBuffer, 0, 0);
  
  pop();
}


// ---- PRESENCE BUTTON FUNCTIONS ----
function setupButton() {
  presenceButton = {
    pos: createVector(width / 2, height * 3 / 4), size: BUTTON_SIZE, isVisible: false, lastActiveTime: 0,
    currentAlpha: 0, targetAlpha: 0, currentSize: BUTTON_SIZE, targetSize: BUTTON_SIZE,
    currentGlow: BUTTON_GLOW_BLUR, targetGlow: BUTTON_GLOW_BLUR,
    isOnCooldown: false, cooldownStartTime: 0
  };
}

function updateButton() {
  const now = millis();
  if (presenceButton.isOnCooldown && now > presenceButton.cooldownStartTime + BUTTON_COOLDOWN_DURATION) {
    presenceButton.isOnCooldown = false;
  }

  if (isHoldingButton) {
    presenceButton.targetSize = BUTTON_SIZE * BUTTON_GROW_FACTOR;
    presenceButton.targetGlow = BUTTON_GLOW_BLUR * BUTTON_GLOW_GROW_FACTOR;
    presenceButton.targetAlpha = 100;
  } else if (presenceButton.isOnCooldown) {
    presenceButton.targetAlpha = 0;
    presenceButton.targetSize = BUTTON_SIZE;
    presenceButton.targetGlow = BUTTON_GLOW_BLUR;
  } else {
    presenceButton.targetSize = BUTTON_SIZE;
    presenceButton.targetGlow = BUTTON_GLOW_BLUR;
    if (presenceButton.isVisible && now > presenceButton.lastActiveTime + BUTTON_VISIBILITY_TIMEOUT) {
      presenceButton.isVisible = false;
    }
    presenceButton.targetAlpha = presenceButton.isVisible ? 100 : 0;
  }
  presenceButton.currentAlpha = lerp(presenceButton.currentAlpha, presenceButton.targetAlpha, BUTTON_FADE_SPEED);
  presenceButton.currentSize = lerp(presenceButton.currentSize, presenceButton.targetSize, BUTTON_GROW_SPEED);
  presenceButton.currentGlow = lerp(presenceButton.currentGlow, presenceButton.targetGlow, BUTTON_GROW_SPEED);
}

function drawButton(pg) {
  if (presenceButton.currentAlpha < 1) return;
  const buttonColor = color(0, 0, 100, presenceButton.currentAlpha);
  
  pg.drawingContext.filter = `blur(${presenceButton.currentGlow}px)`;
  pg.noStroke();
  pg.fill(buttonColor);
  pg.circle(presenceButton.pos.x, presenceButton.pos.y, presenceButton.currentSize);
  
  pg.drawingContext.filter = `blur(${BUTTON_CORE_BLUR}px)`;
  pg.circle(presenceButton.pos.x, presenceButton.pos.y, presenceButton.currentSize);
  
  pg.drawingContext.filter = 'none';
}

// ---- MESH GRADIENT FUNCTIONS ----
function setupMesh() {
  meshPoints = [];
  let cols = MESH_DENSITY; let rows = MESH_DENSITY;
  for (let i = 0; i <= cols; i++) {
    for (let j = 0; j <= rows; j++) {
      let x = map(i, 0, cols, 0, width); let y = map(j, 0, rows, 0, height);
      let inter = (x + y) / (width + height); let c = lerpColor(baseColor1, baseColor2, inter);
      meshPoints.push({ basePos: createVector(x, y), pos: createVector(x, y), color: c, noiseSeedX: random(1000), noiseSeedY: random(1000) });
    }
  }
}

function drawMesh() {
  noStroke();
  drawingContext.filter = `blur(${MESH_BLUR}px)`;
  for (let p of meshPoints) {
    let time = frameCount * MESH_WANDER_SPEED;
    let wanderX = map(noise(p.noiseSeedX + time), 0, 1, -MESH_WANDER_AMOUNT, MESH_WANDER_AMOUNT);
    let wanderY = map(noise(p.noiseSeedY + time), 0, 1, -MESH_WANDER_AMOUNT, MESH_WANDER_AMOUNT);
    p.pos.x = p.basePos.x + wanderX; p.pos.y = p.basePos.y + wanderY;
    fill(p.color); let circleSize = width / (MESH_DENSITY - 1) * 1.5;
    circle(p.pos.x, p.pos.y, circleSize);
  }
  drawingContext.filter = 'none';
}

// ---- OTHER FUNCTIONS ----
function applyGrain() {
  if (GRAIN_AMOUNT <= 0) return;
  push();
  let numParticles = (width * height / 500) * GRAIN_AMOUNT;
  let alpha = map(GRAIN_AMOUNT, 0, 1, 0, 25);
  strokeWeight(1);
  for (let i = 0; i < numParticles; i++) {
    let x = random(width); let y = random(height);
    if (random() > 0.5) { stroke(0, 0, 100, alpha); } else { stroke(0, 0, 0, alpha); }
    point(x, y);
  }
  pop();
}

function detectMotion() {
  let motionCount = 0;
  capture.loadPixels();
  if (capture.pixels.length > 0) {
    for (let y = 0; y < capture.height; y++) {
      for (let x = 0; x < capture.width; x++) {
        const i = (x + y * capture.width) * 4;
        const d = dist(capture.pixels[i], capture.pixels[i+1], capture.pixels[i+2], previousFrame.pixels[i], previousFrame.pixels[i+1], previousFrame.pixels[i+2]);
        if (d > motionSensitivityThreshold) { motionCount++; }
      }
    }
    previousFrame.drawingContext.drawImage(capture.elt, 0, 0, previousFrame.width, previousFrame.height);
    previousFrame.loadPixels();
  }
  return motionCount;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  glowBuffer = createGraphics(width, height);
  glowBuffer.colorMode(HSB, 360, 100, 100, 100);
  blobBuffer = createGraphics(width, height);
  blobBuffer.colorMode(HSB, 360, 100, 100, 100);
  setupMesh();
  setupButton();
  textPoints = [];
  textAnimation.isAnimating = false;
}
