import * as THREE from 'three'
import { OrbitControls }  from 'three/addons/controls/OrbitControls.js'
import { RGBELoader }     from 'three/addons/loaders/RGBELoader.js'
import { GLTFLoader }     from 'three/addons/loaders/GLTFLoader.js'
import { FontLoader }     from 'three/addons/loaders/FontLoader.js'
import { TextGeometry }   from 'three/addons/geometries/TextGeometry.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass }     from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass }from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass }     from 'three/addons/postprocessing/OutputPass.js'
import GUI from 'lil-gui'

// ─────────────────────────────────────────────────────────────────────────────
// Layout constants
// ─────────────────────────────────────────────────────────────────────────────
const L = {
  BLOCK_X: 13, BLOCK_Z: 11,
  WALK_X: 13,  WALK_Z: 11,
  ROAD_E: 24,  ROAD_W: -24, ROAD_N: 22, ROAD_S: -22,
  ROAD_CENTER_E: 19, ROAD_CENTER_W: -19, ROAD_CENTER_N: 17, ROAD_CENTER_S: -17,
  NB_PARK_X: 15.5, SB_PARK_X: 22.5, EB_PARK_Z: 13.5, WB_PARK_Z: 20.5,
}

// ─────────────────────────────────────────────────────────────────────────────
// Seeded xorshift RNG — deterministic rooftop clutter
// ─────────────────────────────────────────────────────────────────────────────
let _s = 42
const rng = () => {
  _s ^= _s << 13; _s ^= _s >> 17; _s ^= _s << 5
  return (_s >>> 0) / 0xFFFFFFFF
}

// ─────────────────────────────────────────────────────────────────────────────
// Renderer
// ─────────────────────────────────────────────────────────────────────────────
const canvas = document.querySelector('canvas.webgl')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.35

// ─────────────────────────────────────────────────────────────────────────────
// Scene
// ─────────────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene()
scene.background = new THREE.Color('#3a5578')
scene.fog = new THREE.FogExp2(0x8898b8, 0.0045)

// ─────────────────────────────────────────────────────────────────────────────
// Camera & controls
// ─────────────────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 800)
camera.position.set(0, 1, -26)
scene.add(camera)

const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.dampingFactor = 0.04
controls.target.set(0, 12, 0)
controls.maxPolarAngle = Math.PI / 2 - 0.01
controls.minDistance = 5
controls.maxDistance = 260
controls.update()

// ─────────────────────────────────────────────────────────────────────────────
// Post-processing
// ─────────────────────────────────────────────────────────────────────────────
const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.24, 0.52, 0.80
)
composer.addPass(bloomPass)
composer.addPass(new OutputPass())

// ─────────────────────────────────────────────────────────────────────────────
// HDRI environment (solid fallback already set above)
// ─────────────────────────────────────────────────────────────────────────────
// Replace the entire RGBELoader block with this:

scene.background = new THREE.Color(0x0a0020);
scene.fog = new THREE.FogExp2(0x0f0025, 0.008);

// ── AMBIENT LIGHT ──────────────────────────────────────────────────────────
const ambL = new THREE.AmbientLight(0x442266, 2.0);
scene.add(ambL);

// ── STARS ──────────────────────────────────────────────────────────────────
const starGeo = new THREE.BufferGeometry();
const starCount = 3000;
const starPositions = new Float32Array(starCount * 3);

for (let i = 0; i < starCount * 3; i += 3) {
  const theta = Math.random() * Math.PI * 2;
  const phi   = Math.acos((Math.random() * 2) - 1);
  const r     = 150 + Math.random() * 50;

  starPositions[i]     = r * Math.sin(phi) * Math.cos(theta);
  starPositions[i + 1] = r * Math.sin(phi) * Math.sin(theta);
  starPositions[i + 2] = r * Math.cos(phi);
}

starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));

const starMat = new THREE.PointsMaterial({
  color: 0xffeeff,
  size: 0.5,
  sizeAttenuation: true,
  transparent: true,
  opacity: 1.0,
});

scene.add(new THREE.Points(starGeo, starMat));

// ── MOON ───────────────────────────────────────────────────────────────────
const moonGeo = new THREE.SphereGeometry(4, 32, 32);
const moonMat = new THREE.MeshStandardMaterial({
  color: 0xe0d0ff,
  emissive: 0xcc99ff,
  emissiveIntensity: 1.2,
  roughness: 0.9,
  metalness: 0.0,
});

const moon = new THREE.Mesh(moonGeo, moonMat);
moon.position.set(-60, 55, -120);
scene.add(moon);

const moonLight = new THREE.PointLight(0xbb88ff, 2.5, 300);
moonLight.position.copy(moon.position);
scene.add(moonLight);

// ── ENVIRONMENT MAP (replaces HDR for PBR reflections) ─────────────────────
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();

const envScene = new THREE.Scene();
envScene.background = new THREE.Color(0x120028);
envScene.add(new THREE.PointLight(0x9955ff, 3, 50)).position.set(0, 10, 0);
envScene.add(new THREE.PointLight(0x00ffcc, 2, 50)).position.set(10, -5, -10);

scene.environment = pmremGenerator.fromScene(envScene).texture;
pmremGenerator.dispose();

// ─────────────────────────────────────────────────────────────────────────────
// Materials
// ─────────────────────────────────────────────────────────────────────────────
const limestoneMat  = new THREE.MeshStandardMaterial({ color: '#cec5a8', roughness: 0.84, metalness: 0.02 })
const chromeMat     = new THREE.MeshStandardMaterial({ color: '#bcc8d4', roughness: 0.10, metalness: 0.96 })
const goldMat       = new THREE.MeshStandardMaterial({ color: '#c8a840', roughness: 0.18, metalness: 0.90 })
const steelMat      = new THREE.MeshStandardMaterial({ color: '#8292a4', roughness: 0.30, metalness: 0.84 })
const beaconMat     = new THREE.MeshStandardMaterial({ emissive: '#ff2200', emissiveIntensity: 2.0, roughness: 0.4 })
const asphaltMat    = new THREE.MeshStandardMaterial({ color: '#262626', roughness: 0.96 })
const sidewalkMat   = new THREE.MeshStandardMaterial({ color: '#9a9080', roughness: 0.84 })
const windowGlowMat = new THREE.MeshStandardMaterial({ emissive: '#ffcc44', emissiveIntensity: 1.2, roughness: 0.5 })

// ─────────────────────────────────────────────────────────────────────────────
// Procedural canvas textures
// ─────────────────────────────────────────────────────────────────────────────
function makeWindowTexture(cols, rows, opts = {}) {
  const {
    wall = '#cec5a8', spandrel = '#a09880',
    litA = '#fffacc', litB = '#fff4aa', dark = '#1a1a22',
    litProb = 0.72, tw = 512, th = 512,
  } = opts
  const cv = document.createElement('canvas')
  cv.width = tw; cv.height = th
  const ctx = cv.getContext('2d')
  ctx.fillStyle = wall
  ctx.fillRect(0, 0, tw, th)
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`
    ctx.fillRect(Math.random() * tw, Math.random() * th, 1, 1)
  }
  const cw = tw / cols, rh = th / rows
  for (let r = 0; r < rows; r++) {
    ctx.fillStyle = spandrel
    ctx.fillRect(0, r * rh, tw, rh * 0.18)
    for (let c = 0; c < cols; c++) {
      const wx = c * cw + cw * 0.15
      const wy = r * rh + rh * 0.22
      const ww = cw * 0.70, wh = rh * 0.60
      ctx.fillStyle = Math.random() < litProb ? (Math.random() < 0.5 ? litA : litB) : dark
      ctx.fillRect(wx, wy, ww, wh)
      ctx.strokeStyle = wall
      ctx.lineWidth = 1.5
      ctx.strokeRect(wx, wy, ww, wh)
    }
    ctx.strokeStyle = '#b8b0a0'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, (r + 0.96) * rh)
    ctx.lineTo(tw, (r + 0.96) * rh)
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makeBrickWindowTexture(cols, rows) {
  const tw = 512, th = 512
  const cv = document.createElement('canvas')
  cv.width = tw; cv.height = th
  const ctx = cv.getContext('2d')
  ctx.fillStyle = '#7a3a2a'
  ctx.fillRect(0, 0, tw, th)
  const bh = th / (rows * 3), bw = tw / (cols * 2)
  for (let r = 0; r < rows * 3; r++) {
    const offset = (r % 2) * bw * 0.5
    for (let c = -1; c < cols * 2 + 1; c++) {
      ctx.fillStyle = `hsl(${10 + Math.random()*10},${50+Math.random()*20}%,${25+Math.random()*10}%)`
      ctx.fillRect(c * bw + offset + 1, r * bh + 1, bw - 2, bh - 2)
    }
  }
  const cw = tw / cols, rh = th / rows
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = Math.random() < 0.65 ? '#ffe8a0' : '#1a1822'
      ctx.fillRect(c * cw + cw * 0.2, r * rh + rh * 0.2, cw * 0.6, rh * 0.55)
    }
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makeGlassTexture(cols, rows) {
  const tw = 512, th = 512
  const cv = document.createElement('canvas')
  cv.width = tw; cv.height = th
  const ctx = cv.getContext('2d')
  const grad = ctx.createLinearGradient(0, 0, 0, th)
  grad.addColorStop(0, '#2a4a6a')
  grad.addColorStop(1, '#1a3a5a')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, tw, th)
  const cw = tw / cols, rh = th / rows
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = Math.random() < 0.45
        ? 'rgba(100,180,255,0.35)'
        : 'rgba(20,50,80,0.55)'
      ctx.fillRect(c * cw + 2, r * rh + 2, cw - 4, rh - 4)
    }
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// ─────────────────────────────────────────────────────────────────────────────
// Lighting
// ─────────────────────────────────────────────────────────────────────────────
const ambientLight = new THREE.AmbientLight('#5566aa', 0.82)
scene.add(ambientLight)

const sunLight = new THREE.DirectionalLight('#ffd070', 2.5)
sunLight.position.set(48, 55, 22)
sunLight.castShadow = true
sunLight.shadow.mapSize.set(4096, 4096)
sunLight.shadow.camera.left   = -80
sunLight.shadow.camera.right  =  80
sunLight.shadow.camera.top    =  100
sunLight.shadow.camera.bottom = -80
sunLight.shadow.bias       = -0.0004
sunLight.shadow.normalBias =  0.02
scene.add(sunLight)

const fillLight = new THREE.DirectionalLight('#7888c8', 0.55)
fillLight.position.set(-35, 22, -18)
scene.add(fillLight)

const streetLampLight = new THREE.PointLight('#ffecc0', 0.6, 60)
streetLampLight.position.set(0, 1.5, 0)
scene.add(streetLampLight)

const beaconLight = new THREE.PointLight('#ff2200', 0, 40)
scene.add(beaconLight)
const crownLights = [
  new THREE.PointLight('#c8a840', 1.3, 30),
  new THREE.PointLight('#ff8800', 1.3, 30),
  new THREE.PointLight('#ff2200', 1.3, 30),
]
crownLights.forEach((l, i) => {
  const a = (i / 3) * Math.PI * 2
  l.position.set(Math.cos(a) * 2, 44, Math.sin(a) * 2)
  scene.add(l)
})

// ─────────────────────────────────────────────────────────────────────────────
// Ground & sidewalk
// ─────────────────────────────────────────────────────────────────────────────

// Base terrain — noticeably lighter than road so the road square reads clearly
const outerMat = new THREE.MeshStandardMaterial({ color: '#38302e', roughness: 0.96 })
const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), outerMat)
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)

const ROAD_Y = 0.004   // slightly above base terrain, below markings (0.022)
;[
  //  [ planeW, planeD,  cx,   cz ]
  [ 10,  44,   19,   0 ],   // East avenue  (x=14-24,  z=-22–22)
  [ 10,  44,  -19,   0 ],   // West avenue  (x=-24–-14)
  [ 48,  10,    0,  17 ],   // North street (z=12–22,  full x=-24–24)
  [ 48,  10,    0, -17 ],   // South street (z=-22–-12)
].forEach(([w, d, cx, cz]) => {
  const rp = new THREE.Mesh(new THREE.PlaneGeometry(w, d), asphaltMat)
  rp.rotation.x = -Math.PI / 2
  rp.position.set(cx, ROAD_Y, cz)
  rp.receiveShadow = true
  scene.add(rp)
})

// Raised sidewalk plaza around the ESB block
const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(28, 0.10, 24), sidewalkMat)
sidewalk.position.set(0, 0.05, 0)
sidewalk.receiveShadow = true
scene.add(sidewalk)

// Chrome curb caps along sidewalk edges
;[
  [28, 0.06, 0.10,  0, 0.10,  12],
  [28, 0.06, 0.10,  0, 0.10, -12],
  [0.10, 0.06, 24, 14, 0.10,   0],
  [0.10, 0.06, 24,-14, 0.10,   0],
].forEach(([w, h, d, x, y, z]) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), chromeMat)
  m.position.set(x, y, z)
  scene.add(m)
})

// ─────────────────────────────────────────────────────────────────────────────
// Road markings
// ─────────────────────────────────────────────────────────────────────────────
const markMat   = new THREE.MeshBasicMaterial({ color: '#ffffff' })
const yellowMat = new THREE.MeshBasicMaterial({ color: '#ffdd00' })

function addMark(mat, w, d, x, z) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat)
  m.rotation.x = -Math.PI / 2
  m.position.set(x, 0.022, z)
  scene.add(m)
}

// ── Lane geometry constants (derived from L) ─────────────────────────────────
// East / West avenues  (run N-S, width 10 in X):
//   parking 2.5 | travel 2.5 | CENTER | travel 2.5 | parking 2.5
const E_NB_EDGE =  16.5   // NB-parking / NB-travel edge
const E_CTR     =  19.0   // avenue centre  (= L.ROAD_CENTER_E)
const E_SB_EDGE =  21.5   // SB-travel / SB-parking edge
const E_NB_MID  =  17.75  // NB travel lane centre
const E_SB_MID  =  20.25  // SB travel lane centre

// North / South streets  (run E-W, width 10 in Z):
//   parking 2.5 | travel 2.5 | CENTER | travel 2.5 | parking 2.5
const N_EB_EDGE =  14.5   // EB-parking / EB-travel edge  (z)
const N_CTR     =  17.0   // street centre  (= L.ROAD_CENTER_N)
const N_WB_EDGE =  19.5   // WB-travel / WB-parking edge  (z)
const N_EB_MID  =  15.75  // EB travel lane centre  (z)
const N_WB_MID  =  18.25  // WB travel lane centre  (z)

const LINEW  = 0.11   // generic line width
const CL_SEP = 0.13   // half-separation between the two yellow stripes
// Line lengths clamped to the actual road extents:
//   Avenues  (N-S, along Z): road goes from z = ROAD_S(-22) to ROAD_N(22)  → 44 units
//   Streets  (E-W, along X): road goes from x = ROAD_W(-24) to ROAD_E(24)  → 48 units
const AL = 22   // avenue marking length  (z = -22 to +22)
const SL = 26   // street marking length  (x = -24 to +24)

// ── Double yellow centre lines ───────────────────────────────────────────────
// Avenues run N-S (along Z) — centre at x = ±E_CTR
addMark(yellowMat, LINEW, AL,  E_CTR - CL_SEP, 0)
addMark(yellowMat, LINEW, AL,  E_CTR + CL_SEP, 0)
addMark(yellowMat, LINEW, AL, -E_CTR - CL_SEP, 0)
addMark(yellowMat, LINEW, AL, -E_CTR + CL_SEP, 0)
// Streets run E-W (along X) — centre at z = ±N_CTR
addMark(yellowMat, SL, LINEW, 0,  N_CTR - CL_SEP)
addMark(yellowMat, SL, LINEW, 0,  N_CTR + CL_SEP)
addMark(yellowMat, SL, LINEW, 0, -N_CTR - CL_SEP)
addMark(yellowMat, SL, LINEW, 0, -N_CTR + CL_SEP)


// ── Crosswalks ───────────────────────────────────────────────────────────────
// Piano-key (ladder) style.
// crossAvenue=true  → pedestrians cross an N-S avenue; stripes run N-S (in Z),
//                     offset in X, positioned just past the stop line in Z.
// crossAvenue=false → pedestrians cross an E-W street; stripes run E-W (in X),
//                     offset in Z, positioned just past the stop line in X.
function addCrosswalk(cx, cz, crossAvenue) {
  const n = 11, sw = 0.44, gap = 0.42
  const span = n * (sw + gap) - gap          // ≈ 9.5 fits inside 10-unit road
  for (let i = 0; i < n; i++) {
    const off = -span / 2 + i * (sw + gap) + sw / 2
    if (crossAvenue) {
      // stripe long in Z (parallel to car travel on avenue), offset in X
      addMark(markMat, sw, 1.4, cx + off, cz)
    } else {
      // stripe long in X (parallel to car travel on street), offset in Z
      addMark(markMat, 1.4, sw, cx, cz + off)
    }
  }
}

// Each crosswalk pair sits just inside the intersection box, after the stop line.
// Avenue crossings: pedestrians walk E-W across x=14-24 or x=-24 to -14
// Street crossings: pedestrians walk N-S across z=12-22 or z=-22 to -12
const CW_INSET = 1.0   // how far inside the intersection the crosswalk centre sits

// NE corner
addCrosswalk( E_CTR,  L.WALK_Z + CW_INSET, true)   // cross east avenue  (N side of ESB)
addCrosswalk( L.WALK_X + CW_INSET,  N_CTR, false)  // cross north street (E side)
// NW corner
addCrosswalk(-E_CTR,  L.WALK_Z + CW_INSET, true)
addCrosswalk(-L.WALK_X - CW_INSET,  N_CTR, false)
// SE corner
addCrosswalk( E_CTR, -L.WALK_Z - CW_INSET, true)
addCrosswalk( L.WALK_X + CW_INSET, -N_CTR, false)
// SW corner
addCrosswalk(-E_CTR, -L.WALK_Z - CW_INSET, true)
addCrosswalk(-L.WALK_X - CW_INSET, -N_CTR, false)

// ─────────────────────────────────────────────────────────────────────────────
// Empire State Building
// ─────────────────────────────────────────────────────────────────────────────
const esbGroup = new THREE.Group()
scene.add(esbGroup)

const floorData = [
  { name: 'Base Floors 1–25',       desc: 'Office spaces and retail spanning the first 25 floors of the Art Deco tower.' },
  { name: 'Floors 26–34',           desc: 'Upper office floors with sweeping views of Midtown Manhattan.' },
  { name: 'Floors 35–50',           desc: 'Prime office space with stunning panoramic city vistas.' },
  { name: '86th Floor Observatory', desc: 'Iconic outdoor observation deck at 1,050 ft — a New York City landmark.' },
  { name: 'Top Floors & Spire',     desc: 'The famous broadcast tower and spire reaching 1,454 ft into the sky.' },
]
const raycastSlabs = []

// Per-section window textures (narrow X face / wide Z face)
const sectionDefs = [
  { w: 12.0, d: 7.5, h:  4.0, yBase:  0 },
  { w:  9.5, d: 6.0, h:  8.0, yBase:  4 },
  { w:  7.0, d: 4.5, h: 16.0, yBase: 12 },
  { w:  4.5, d: 2.8, h:  6.0, yBase: 28 },
  { w:  2.4, d: 1.5, h:  5.0, yBase: 34 },
]

const xFaceTexCols = [4, 4, 4, 3, 2]
const zFaceTexCols = [7, 6, 5, 4, 3]
const texRows      = [6, 9, 14, 7, 6]

sectionDefs.forEach((sec, idx) => {
  const { w, d, h, yBase } = sec
  const cy = yBase + h / 2

  const xTex = makeWindowTexture(xFaceTexCols[idx], texRows[idx], { litProb: 0.74 - idx * 0.04 })
  const zTex = makeWindowTexture(zFaceTexCols[idx], texRows[idx], { litProb: 0.74 - idx * 0.04 })
  const xMat = new THREE.MeshStandardMaterial({ map: xTex, roughness: 0.75, metalness: 0.05 })
  const zMat = new THREE.MeshStandardMaterial({ map: zTex, roughness: 0.75, metalness: 0.05 })

  // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    [xMat, xMat, limestoneMat, limestoneMat, zMat, zMat]
  )
  mesh.position.set(0, cy, 0)
  mesh.castShadow = true
  mesh.receiveShadow = true
  esbGroup.add(mesh)

  // Chrome cornice ledge — sits exactly at top, no gap
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(w + 0.38, 0.22, d + 0.38), chromeMat)
  cornice.position.set(0, yBase + h + 0.11, 0)
  esbGroup.add(cornice)

  // Gold sub-cornice
  const subCornice = new THREE.Mesh(new THREE.BoxGeometry(w + 0.18, 0.10, d + 0.18), goldMat)
  subCornice.position.set(0, yBase + h - 0.06, 0)
  esbGroup.add(subCornice)

  // 4 corner pilasters
  const pilH = h, pilR = 0.12
  const px = w / 2 + 0.08, pz = d / 2 + 0.08
  ;[[px,pz],[px,-pz],[-px,pz],[-px,-pz]].forEach(([ex, ez]) => {
    const pil = new THREE.Mesh(new THREE.CylinderGeometry(pilR, pilR, pilH, 6), chromeMat)
    pil.position.set(ex, cy, ez)
    esbGroup.add(pil)
  })

  // Mid-pilasters on ±Z wide faces
  ;[-1, 1].forEach(s => {
    const mp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, pilH, 6), chromeMat)
    mp.position.set(0, cy, s * (d / 2 + 0.06))
    esbGroup.add(mp)
  })

  // Window glow strip at floor level
  const glow = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.08, d - 0.2), windowGlowMat)
  glow.position.set(0, yBase + 0.12, 0)
  esbGroup.add(glow)

  // Invisible raycast slab
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.5, h, d + 0.5),
    new THREE.MeshBasicMaterial({ visible: false })
  )
  slab.position.set(0, cy, 0)
  slab.userData.floorIndex = idx
  esbGroup.add(slab)
  raycastSlabs.push(slab)
})

// Art Deco horizontal reveals on main tower (section 2, h=16 starting at y=12)
;[24, 20, 16, 13].forEach(y => {
  const rev = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.07, 4.7), chromeMat)
  rev.position.set(0, y, 0)
  esbGroup.add(rev)
})

// ─────────────────────────────────────────────────────────────────────────────
// Spire — gap-free via accumulated spireY
// ─────────────────────────────────────────────────────────────────────────────
let spireY = 39  // 4+8+16+6+5

function addSpireSec(rTop, rBot, h, mat, segs = 12) {
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, segs), mat)
  cyl.position.set(0, spireY + h / 2, 0)
  cyl.castShadow = true
  esbGroup.add(cyl)
  spireY += h
}

addSpireSec(1.40, 1.40, 0.60, limestoneMat, 16)  // obs platform

// Observatory railing torus
const railTorus = new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.04, 6, 24), chromeMat)
railTorus.position.set(0, spireY - 0.02, 0)
railTorus.rotation.x = Math.PI / 2
esbGroup.add(railTorus)

addSpireSec(0.80, 1.40, 0.80, chromeMat)          // neck
addSpireSec(1.00, 0.80, 0.50, limestoneMat, 16)   // 2nd obs
addSpireSec(0.30, 1.00, 1.20, chromeMat)           // transition cone
addSpireSec(0.22, 0.30, 5.00, chromeMat)           // mast seg 1
addSpireSec(0.14, 0.22, 4.00, steelMat)            // mast seg 2
addSpireSec(0.06, 0.14, 2.80, steelMat)            // mast seg 3
addSpireSec(0.02, 0.06, 1.50, chromeMat)           // needle

// Beacon at tip
beaconLight.position.set(0, spireY - 0.6, 0)
const beaconMesh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), beaconMat)
beaconMesh.position.set(0, spireY - 0.6, 0)
esbGroup.add(beaconMesh)

// ─────────────────────────────────────────────────────────────────────────────
// 3D Text signs on south facade
// ─────────────────────────────────────────────────────────────────────────────
const fontLoader = new FontLoader()
fontLoader.load('/fonts/helvetiker_regular.typeface.json', (font) => {
  const signDefs = [
    { text: 'EMPIRE STATE',       size: 0.46, y: 2.30, mat: limestoneMat },
    { text: 'BUILDING',           size: 0.30, y: 1.72, mat: limestoneMat },
    { text: '350 FIFTH AVE · 1931', size: 0.17, y: 1.22, mat: goldMat    },
  ]
  signDefs.forEach(({ text, size, y, mat }) => {
    const geo = new TextGeometry(text, { font, size, depth: 0.04, curveSegments: 4 })
    geo.center()
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(0, y, -4.40)
    mesh.rotation.y = Math.PI
    esbGroup.add(mesh)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Surrounding buildings (all outside road corridors)
// ─────────────────────────────────────────────────────────────────────────────
const buildingDefs = [
  // NE block
  { x:  30, z:  30, w:  9, h: 18, d:  9, t: 2 },
  { x:  38, z:  28, w:  7, h: 15, d:  8, t: 0 },
  { x:  32, z:  40, w:  8, h: 11, d:  7, t: 1 },
  // NW block
  { x: -30, z:  30, w: 10, h: 19, d:  9, t: 1 },
  { x: -38, z:  35, w:  8, h: 16, d:  8, t: 2 },
  // SE block
  { x:  30, z: -30, w:  9, h: 17, d:  9, t: 0 },
  { x:  38, z: -28, w:  7, h: 14, d:  7, t: 2 },
  // SW block
  { x: -30, z: -30, w: 10, h: 12, d: 10, t: 1 },
  { x: -36, z: -36, w:  8, h: 19, d:  8, t: 0 },
  // Far east high-rises
  { x:  52, z:   5, w: 14, h: 13, d: 14, t: 2 },
  { x:  50, z: -12, w: 12, h: 16, d: 12, t: 0 },
  // Far west
  { x: -52, z:   5, w: 14, h: 17, d: 14, t: 1 },
  { x: -50, z: -10, w: 11, h: 12, d: 11, t: 2 },
  // North mid-block
  { x:   8, z:  35, w:  9, h: 14, d:  9, t: 0 },
  { x: -10, z:  38, w:  8, h: 16, d:  8, t: 3 },
  // South mid-block
  { x:   8, z: -35, w:  9, h: 8, d:  9, t: 1 },
  { x: -10, z: -38, w:  8, h: 10, d:  8, t: 0 },
  // Corner fills
  { x:  44, z:  44, w: 12, h: 10, d: 12, t: 3 },
  { x: -44, z:  44, w: 12, h: 15, d: 12, t: 0 },
  { x:  44, z: -44, w: 12, h: 11, d: 12, t: 2 },
]

const texBuilders = [
  (c, r) => makeWindowTexture(c, r, { litProb: 0.72 }),
  (c, r) => makeBrickWindowTexture(c, r),
  (c, r) => makeGlassTexture(c, r),
  (c, r) => makeWindowTexture(c, r, { wall: '#888880', spandrel: '#555550', litProb: 0.60 }),
]
const concreteMat = new THREE.MeshStandardMaterial({ color: '#aaaaaa', roughness: 0.85 })
const hvacMat     = new THREE.MeshStandardMaterial({ color: '#aaaaaa', roughness: 0.60 })
const wtMat       = new THREE.MeshStandardMaterial({ color: '#6b4a2a', roughness: 0.90 })

buildingDefs.forEach(({ x, z, w, h, d, t }) => {
  const tex = texBuilders[t](6, 10)
  const faceMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.80, metalness: 0.05 })
  const mats = [faceMat, faceMat, limestoneMat, asphaltMat, faceMat, faceMat]
  const bldg = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats)
  bldg.position.set(x, h / 2, z)
  bldg.castShadow = true
  bldg.receiveShadow = true
  scene.add(bldg)

  // Parapet walls
  const pH = 0.35
  ;[
    [w, pH, 0.15,   0, h + pH/2,  d/2],
    [w, pH, 0.15,   0, h + pH/2, -d/2],
    [0.15, pH, d,  w/2, h + pH/2,   0],
    [0.15, pH, d, -w/2, h + pH/2,   0],
  ].forEach(([pw, ph, pd, px, py, pz]) => {
    const par = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, pd), limestoneMat)
    par.position.set(x + px, py, z + pz)
    scene.add(par)
  })

  // Water towers (1–2)
  const numWT = rng() < 0.5 ? 1 : 2
  for (let i = 0; i < numWT; i++) {
    const wx = x + (rng() - 0.5) * (w - 2)
    const wz = z + (rng() - 0.5) * (d - 2)
    const wy = h + 0.1
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.60, 0.70, 1.8, 10), wtMat)
    barrel.position.set(wx, wy + 0.9, wz)
    scene.add(barrel)
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.72, 0.7, 10), wtMat)
    cap.position.set(wx, wy + 1.8 + 0.35, wz)
    scene.add(cap)
    for (let l = 0; l < 4; l++) {
      const la = (l / 4) * Math.PI * 2
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 4), steelMat)
      leg.position.set(wx + Math.cos(la) * 0.55, wy + 0.45, wz + Math.sin(la) * 0.55)
      leg.rotation.z =  Math.sin(la) * 0.35
      leg.rotation.x =  Math.cos(la) * 0.35
      scene.add(leg)
    }
  }

  // HVAC units (1–3)
  const numHVAC = Math.floor(rng() * 3) + 1
  for (let i = 0; i < numHVAC; i++) {
    const hx = x + (rng() - 0.5) * (w - 1.5)
    const hz = z + (rng() - 0.5) * (d - 1.5)
    const hv = new THREE.Mesh(
      new THREE.BoxGeometry(0.8 + rng() * 0.6, 0.4 + rng() * 0.3, 0.6 + rng() * 0.4),
      hvacMat
    )
    hv.position.set(hx, h + 0.25, hz)
    scene.add(hv)
  }

  // Penthouse (50%)
  if (rng() < 0.5) {
    const pw2 = w * (0.3 + rng() * 0.2)
    const pd2 = d * (0.3 + rng() * 0.2)
    const ph2 = 1.5 + rng() * 2
    const px2 = x + (rng() - 0.5) * (w - pw2) * 0.5
    const pz2 = z + (rng() - 0.5) * (d - pd2) * 0.5
    const ph_m = new THREE.Mesh(new THREE.BoxGeometry(pw2, ph2, pd2), limestoneMat)
    ph_m.position.set(px2, h + ph2 / 2, pz2)
    scene.add(ph_m)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Street lamps — fully connected groups
// ─────────────────────────────────────────────────────────────────────────────
function addLamp(x, z, rotY) {
  const g = new THREE.Group()

  // Anchor base (octagonal)
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.35, 8), steelMat)
  base.position.y = 0.175
  g.add(base)

  // Tapered pole
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.105, 6.6, 8), steelMat)
  pole.position.y = 0.35 + 3.30
  g.add(pole)

  // Neck collar
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.10, 0.22, 8), steelMat)
  neck.position.y = 0.35 + 6.6 + 0.11
  g.add(neck)

  // Horizontal arm
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.85, 6), steelMat)
  arm.rotation.z = Math.PI / 2
  arm.position.set(0.925, 0.35 + 6.6 + 0.22, 0)
  g.add(arm)

  // Diagonal brace
  const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6), steelMat)
  brace.rotation.z = Math.PI / 4
  brace.position.set(0.50, 0.35 + 6.35, 0)
  g.add(brace)

  // Cobra-head housing
  const headY = 0.35 + 6.6 + 0.22
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.38), steelMat)
  head.position.set(1.85, headY, 0)
  g.add(head)

  // Emissive lens panel
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 0.30), windowGlowMat)
  lens.position.set(1.85, headY - 0.07, 0)
  g.add(lens)

  // Point light
  const pl = new THREE.PointLight(0xffecc0, 2.0, 24)
  pl.position.set(1.85, headY - 0.10, 0)
  g.add(pl)

  g.position.set(x, 0, z)
  g.rotation.y = rotY
  scene.add(g)
}

// East curb (arm faces east = -π/2)
addLamp( L.WALK_X, -8.0, 0 )
addLamp( L.WALK_X,  0.0, 0 )
addLamp( L.WALK_X,  8.0, 0 )
// West curb (arm faces west = +π/2)
addLamp(-L.WALK_X, -8.0,  Math.PI )
addLamp(-L.WALK_X,  0.0,  Math.PI )
addLamp(-L.WALK_X,  8.0,  Math.PI )
// North curb (arm faces north = 0)
addLamp(-5.0,  L.WALK_Z,  -Math.PI / 2)
addLamp( 5.0,  L.WALK_Z,  -Math.PI / 2)
// South curb (arm faces south = π)
addLamp(-5.0, -L.WALK_Z,  Math.PI / 2)
addLamp( 5.0, -L.WALK_Z,  Math.PI / 2)

// ─────────────────────────────────────────────────────────────────────────────
// Trees — organic asymmetric canopy
// ─────────────────────────────────────────────────────────────────────────────
function addTree(x, z, h = 4.5) {
  const g = new THREE.Group()
  const trunkMat  = new THREE.MeshStandardMaterial({ color: '#5a3a18', roughness: 0.9 })
  const hue       = 100 + Math.floor(rng() * 30)
  const canopyMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(`hsl(${hue},45%,28%)`), roughness: 0.85,
  })
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.16, h * 0.45, 7), trunkMat)
  trunk.position.y = h * 0.225
  g.add(trunk)

  const cR = h * 0.30  // canopy radius
  const blobs = [
    [0,         cR * 1.0,  0,         1.00],
    [cR * 0.5,  cR * 0.85, cR * 0.30, 0.70],
    [-cR * 0.4, cR * 0.80,-cR * 0.40, 0.68],
    [cR * 0.3,  cR * 0.60, cR * 0.50, 0.62],
    [-cR * 0.5, cR * 0.55,-cR * 0.30, 0.58],
    [0,         cR * 0.40, cR * 0.20, 0.50],
  ]
  blobs.forEach(([ox, oy, oz, sc]) => {
    const blob = new THREE.Mesh(new THREE.SphereGeometry(cR * sc, 7, 6), canopyMat)
    blob.position.set(ox, h * 0.45 + oy, oz)
    g.add(blob)
  })
  g.position.set(x, 0, z)
  scene.add(g)
}

// East planting strip
addTree( L.WALK_X - 0.7, -4.0, 4.5)
addTree( L.WALK_X - 0.7,  4.0, 4.2)
// West planting strip
addTree(-L.WALK_X + 0.7, -4.0, 4.8)
addTree(-L.WALK_X + 0.7,  4.0, 4.3)
// North planting strip
addTree(-9.0,  L.WALK_Z - 0.7, 4.6)
addTree( 9.0,  L.WALK_Z - 0.7, 4.4)
// South planting strip
addTree(-9.0, -L.WALK_Z + 0.7, 4.7)
addTree( 9.0, -L.WALK_Z + 0.7, 4.5)

// ─────────────────────────────────────────────────────────────────────────────
// Parked cars
// ─────────────────────────────────────────────────────────────────────────────
function addCar(x, z, rotY, color) {
  const g = new THREE.Group()
  const bodyMat  = new THREE.MeshStandardMaterial({ color, roughness: 0.50, metalness: 0.30 })
  const glassMat = new THREE.MeshStandardMaterial({ color: '#88ccff', roughness: 0.10, metalness: 0.10, transparent: true, opacity: 0.70 })
  const rLightMat= new THREE.MeshStandardMaterial({ emissive: '#ff0000', emissiveIntensity: 1.5 })
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#222222', roughness: 0.90 })

  const body = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.70, 1.70), bodyMat)
  body.position.y = 0.50
  g.add(body)

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.65, 1.50), bodyMat)
  cabin.position.set(-0.2, 1.05, 0)
  g.add(cabin)

  const win = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.52, 1.42), glassMat)
  win.position.set(-0.2, 1.05, 0)
  g.add(win)

  const rl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 1.40), rLightMat)
  rl.position.set(-1.80, 0.52, 0)
  g.add(rl)

  ;[[-1.0, 0.26, 0.9],[-1.0, 0.26,-0.9],[1.0, 0.26, 0.9],[1.0, 0.26,-0.9]].forEach(([wx,wy,wz]) => {
    const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.22, 12), wheelMat)
    wh.rotation.z = Math.PI / 2
    wh.rotation.y = Math.PI / 2
    wh.position.set(wx, wy, wz)
    g.add(wh)
  })

  g.position.set(x, 0, z)
  g.rotation.y = rotY
  g.castShadow = true
  scene.add(g)
}

// Avenue cars (N-S road along Z): rotY = −π/2 → front faces +Z (NB)
//                                  rotY = +π/2 → front faces −Z (SB)
// The car body is 3.6 long in local X; after rotation it lies along Z.
addCar( L.NB_PARK_X, -6,  -Math.PI / 2, '#e03030')  // NB east parking — facing north
addCar( L.NB_PARK_X,  3,  -Math.PI / 2, '#3060c0')  // NB east parking
addCar( L.SB_PARK_X,  4,   Math.PI / 2, '#d0c020')  // SB east parking — facing south
addCar( L.SB_PARK_X, -4,   Math.PI / 2, '#20c040')  // SB east parking
addCar(-L.NB_PARK_X, -6,  -Math.PI / 2, '#c04020')  // NB west parking — facing north
addCar(-L.SB_PARK_X,  3,   Math.PI / 2, '#8040c0')  // SB west parking — facing south
// Street cars (E-W road along X): rotY = 0 → front faces +X (EB)
//                                  rotY = π → front faces −X (WB)
addCar( 5,  L.EB_PARK_Z,  0,        '#c0c0c0')  // EB north-street parking — facing east
addCar(-5,  L.WB_PARK_Z,  Math.PI,  '#4080c0')  // WB north-street parking — facing west

// ─────────────────────────────────────────────────────────────────────────────
// GLTF Milk Truck
// ─────────────────────────────────────────────────────────────────────────────
let truckMixer = null
const gltfLoader = new GLTFLoader()

// ─────────────────────────────────────────────────────────────────────────────
// Rain particles
// ─────────────────────────────────────────────────────────────────────────────
const RAIN_COUNT = 6000
const rainGeo = new THREE.BufferGeometry()
const rainPos = new Float32Array(RAIN_COUNT * 3)
const rainVel = new Float32Array(RAIN_COUNT)
for (let i = 0; i < RAIN_COUNT; i++) {
  rainPos[i * 3]     = (Math.random() - 0.5) * 130
  rainPos[i * 3 + 1] = Math.random() * 75
  rainPos[i * 3 + 2] = (Math.random() - 0.5) * 130
  rainVel[i] = 0.15 + Math.random() * 0.10
}
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3))
const rainMat = new THREE.PointsMaterial({ color: '#aaccff', size: 0.12, transparent: true, opacity: 0.55 })
const rain = new THREE.Points(rainGeo, rainMat)
rain.visible = false
scene.add(rain)

// ─────────────────────────────────────────────────────────────────────────────
// Info panel elements
// ─────────────────────────────────────────────────────────────────────────────
const infoPanel  = document.getElementById('info-panel')
const floorBadge = document.getElementById('floor-badge')
const floorName  = document.getElementById('floor-name')
const floorDesc  = document.getElementById('floor-desc')

// ─────────────────────────────────────────────────────────────────────────────
// Raycaster
// ─────────────────────────────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster()
const mouse = new THREE.Vector2(-9, -9)

window.addEventListener('mousemove', (e) => {
  mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1
})

window.addEventListener('click', () => {
  beaconLight.intensity = 14
  setTimeout(() => { beaconLight.intensity = 0 }, 220)
})

// ─────────────────────────────────────────────────────────────────────────────
// GUI — all folders start closed
// ─────────────────────────────────────────────────────────────────────────────
const gui = new GUI({ title: 'ESB Controls' })

const dbg = {
  environmentIntensity: 1.0,
  backgroundBlurriness: 0.0,
  toneMapping: 'ACESFilmic',
  toneMappingExposure: 1.35,
  bloomStrength: 0.24,
  bloomRadius: 0.52,
  bloomThreshold: 0.80,
  ambientIntensity: 0.82,
  sunIntensity: 2.5,
  sunShadow: true,
  limestoneColor: '#cec5a8',
  windowGlow: 1.2,
  rainEnabled: true,
  rainSpeed: 1.0,
  rainSize: 0.12,
  rainOpacity: 0.55,
  autoOrbit: false,
  orbitSpeed: 0.08,
}

const fEnv = gui.addFolder('Середовище').close()
fEnv.add(dbg, 'environmentIntensity', 0, 3, 0.01).name('env intensity').onChange(v => { scene.environmentIntensity = v })
fEnv.add(dbg, 'backgroundBlurriness', 0, 1, 0.01).name('bg blur').onChange(v => { scene.backgroundBlurriness = v })

const fRender = gui.addFolder('Рендер').close()
const toneMaps = { ACESFilmic: THREE.ACESFilmicToneMapping, Linear: THREE.LinearToneMapping, Reinhard: THREE.ReinhardToneMapping }
fRender.add(dbg, 'toneMapping', Object.keys(toneMaps)).name('tone map').onChange(v => { renderer.toneMapping = toneMaps[v] })
fRender.add(dbg, 'toneMappingExposure', 0, 3, 0.01).name('exposure').onChange(v => { renderer.toneMappingExposure = v })

const fBloom = gui.addFolder('Bloom').close()
fBloom.add(dbg, 'bloomStrength',   0, 3,   0.01).name('strength').onChange(v  => { bloomPass.strength  = v })
fBloom.add(dbg, 'bloomRadius',     0, 2,   0.01).name('radius').onChange(v    => { bloomPass.radius    = v })
fBloom.add(dbg, 'bloomThreshold',  0, 1,   0.01).name('threshold').onChange(v => { bloomPass.threshold = v })

const fLight = gui.addFolder('Освітлення').close()
fLight.add(dbg, 'ambientIntensity', 0, 3, 0.01).name('ambient').onChange(v => { ambientLight.intensity = v })
fLight.add(dbg, 'sunIntensity',     0, 5, 0.01).name('sun').onChange(v     => { sunLight.intensity     = v })
fLight.add(dbg, 'sunShadow').name('sun shadow').onChange(v => { sunLight.castShadow = v })

const fMat = gui.addFolder('Матеріали').close()
fMat.addColor(dbg, 'limestoneColor').name('limestone').onChange(v => { limestoneMat.color.set(v) })
fMat.add(dbg, 'windowGlow', 0, 5, 0.01).name('window glow').onChange(v => { windowGlowMat.emissiveIntensity = v })

const fRain = gui.addFolder('Дощ').close()
fRain.add(dbg, 'rainEnabled').name('enabled').onChange(v   => { rain.visible = v })
fRain.add(dbg, 'rainSpeed',   0.1, 5,    0.01).name('speed')
fRain.add(dbg, 'rainSize',    0.02, 0.5, 0.01).name('drop size').onChange(v => { rainMat.size    = v })
fRain.add(dbg, 'rainOpacity', 0,   1,    0.01).name('opacity').onChange(v   => { rainMat.opacity = v })

const fCam = gui.addFolder('Камера').close()
fCam.add(dbg, 'autoOrbit').name('auto orbit')
fCam.add(dbg, 'orbitSpeed', 0.01, 0.5, 0.001).name('orbit speed')

// ─────────────────────────────────────────────────────────────────────────────
// Keyboard shortcuts
// ─────────────────────────────────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  if (e.key === 'h' || e.key === 'H') gui.show(gui._hidden)
  if (e.key === 'r' || e.key === 'R') {
    dbg.rainEnabled = !dbg.rainEnabled
    rain.visible = dbg.rainEnabled
  }
})

canvas.addEventListener('dblclick', () => {
  if (!document.fullscreenElement) canvas.requestFullscreen?.()
  else document.exitFullscreen?.()
})

// ─────────────────────────────────────────────────────────────────────────────
// Resize
// ─────────────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  composer.setSize(window.innerWidth, window.innerHeight)
})

// ─────────────────────────────────────────────────────────────────────────────
// Animation loop
// ─────────────────────────────────────────────────────────────────────────────
const clock = new THREE.Clock()
let elapsed = 0
let prevHitIdx = -1

const tick = () => {
  const delta = clock.getDelta()
  elapsed += delta

  // GLTF truck animation
  if (truckMixer) truckMixer.update(delta)

  // Auto-orbit
  if (dbg.autoOrbit) {
    const r = Math.sqrt(camera.position.x ** 2 + camera.position.z ** 2)
    const angle = Math.atan2(camera.position.z, camera.position.x) + dbg.orbitSpeed * delta
    camera.position.x = Math.cos(angle) * r
    camera.position.z = Math.sin(angle) * r
    camera.lookAt(controls.target)
  }

  // Beacon double-flash every 2 s
  const bt = elapsed % 2.0
  if (bt < 0.08 || (bt > 0.18 && bt < 0.26)) {
    beaconLight.intensity = 6
  } else {
    beaconLight.intensity = Math.max(0, beaconLight.intensity - 18 * delta)
  }

  // Crown lights oscillate
  crownLights.forEach((l, i) => {
    l.intensity = 1.3 + 0.4 * Math.sin(elapsed * 1.4 + i * 2.1)
  })

  // Window glow breathing (~0.4 Hz)
  windowGlowMat.emissiveIntensity = dbg.windowGlow * (0.85 + 0.15 * Math.sin(elapsed * 2.51))

  // Rain
  if (rain.visible) {
    const pos = rainGeo.attributes.position.array
    for (let i = 0; i < RAIN_COUNT; i++) {
      pos[i * 3 + 1] -= rainVel[i] * dbg.rainSpeed
      if (pos[i * 3 + 1] < -5) pos[i * 3 + 1] = 72
    }
    rainGeo.attributes.position.needsUpdate = true
  }

  // Raycaster — floor hover
  raycaster.setFromCamera(mouse, camera)
  const hits = raycaster.intersectObjects(raycastSlabs)
  if (hits.length > 0) {
    const idx = hits[0].object.userData.floorIndex
    if (idx !== prevHitIdx) {
      prevHitIdx = idx
      const fd = floorData[idx]
      floorBadge.textContent = `SECTION ${idx + 1}`
      floorName.textContent  = fd.name
      floorDesc.textContent  = fd.desc
      infoPanel.classList.add('visible')
    }
  } else {
    if (prevHitIdx !== -1) {
      prevHitIdx = -1
      infoPanel.classList.remove('visible')
    }
  }

  controls.update()
  composer.render()
  requestAnimationFrame(tick)
}
tick()
