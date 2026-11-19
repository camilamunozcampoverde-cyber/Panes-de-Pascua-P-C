import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RotateCcw } from 'lucide-react';
import { WEIGHTS, type FlavorId, type WeightId } from '../shared/catalog.ts';

interface PanDePascua3DProps {
  flavor: FlavorId;
  selectedWeight: WeightId;
  onSelectWeight: (w: WeightId) => void;
}

const WEIGHT_SCALES: Record<WeightId, number> = {
  '500 g': 1.0,
  '250 g': 0.81,
  '100 g': 0.62,
};

// Reusable scratch objects outside any render loop (zero GC)
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

function detectSoftwareGl(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createWoodBoardTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#5a351e';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 160; i++) {
    const y = (i / 160) * 512;
    const shade = 65 + Math.sin(i * 0.35) * 18 + (Math.random() - 0.5) * 14;
    ctx.strokeStyle = `rgb(${Math.round(shade * 1.45)}, ${Math.round(shade * 0.82)}, ${Math.round(
      shade * 0.44,
    )})`;
    ctx.lineWidth = 2 + Math.random() * 3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) {
      ctx.lineTo(x, y + Math.sin(x * 0.015 + i * 0.2) * 3);
    }
    ctx.stroke();
  }

  // Subtle plank seams
  ctx.strokeStyle = 'rgba(28, 14, 6, 0.45)';
  ctx.lineWidth = 2;
  for (const py of [128, 256, 384]) {
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(512, py);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createWrapperTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Rich Christmas midnight blue paper
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#163461');
  grad.addColorStop(0.5, '#10264A');
  grad.addColorStop(1, '#0A1933');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  // Subtle vertical pleated paper grooves
  for (let x = 0; x < 512; x += 8) {
    ctx.fillStyle = x % 16 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.09)';
    ctx.fillRect(x, 0, 4, 256);
  }

  // Gold horizontal trim bands
  ctx.fillStyle = '#d4a353';
  ctx.fillRect(0, 14, 512, 4);
  ctx.fillRect(0, 236, 512, 4);

  // Gold festive stars and snowflakes pattern
  ctx.strokeStyle = 'rgba(212, 163, 83, 0.55)';
  ctx.fillStyle = 'rgba(212, 163, 83, 0.55)';
  ctx.lineWidth = 1.5;

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 8; col++) {
      const cx = col * 64 + (row % 2 === 0 ? 32 : 0);
      const cy = 78 + row * 96;
      // 6-point delicate snowflake
      for (let a = 0; a < 3; a++) {
        const angle = (a * Math.PI) / 3;
        const r = 13;
        ctx.beginPath();
        ctx.moveTo(cx - Math.cos(angle) * r, cy - Math.sin(angle) * r);
        ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createBakedCrustTexture(maxAnisotropy: number): {
  colorMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = 512;
  colorCanvas.height = 512;
  const ctx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 512;
  bumpCanvas.height = 512;
  const bctx = bumpCanvas.getContext('2d')!;

  // Caramelized golden-brown brioche gradient (darker rich mahogany at crown)
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#7c3f14');
  grad.addColorStop(0.35, '#a85b1e');
  grad.addColorStop(0.75, '#c77c32');
  grad.addColorStop(1, '#d9994a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, 512, 512);

  // Baked pore & toasted speckles
  for (let i = 0; i < 1800; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 1 + Math.random() * 3.2;
    const dark = Math.random() > 0.45;
    ctx.fillStyle = dark ? 'rgba(68, 30, 8, 0.14)' : 'rgba(245, 198, 120, 0.14)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    bctx.fillStyle = dark ? 'rgba(40,40,40,0.35)' : 'rgba(220,220,220,0.3)';
    bctx.beginPath();
    bctx.arc(x, y, r * 1.1, 0, Math.PI * 2);
    bctx.fill();
  }

  const colorMap = new THREE.CanvasTexture(colorCanvas);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.anisotropy = maxAnisotropy;

  return { colorMap, bumpMap };
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 16, 128, 128, 124);
  grad.addColorStop(0, 'rgba(6, 10, 8, 0.72)');
  grad.addColorStop(0.55, 'rgba(6, 10, 8, 0.34)');
  grad.addColorStop(1, 'rgba(6, 10, 8, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function PanDePascua3D({
  flavor,
  selectedWeight,
  onSelectWeight,
}: PanDePascua3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<{
    flavor: FlavorId;
    targetScale: number;
    resetCamera: (() => void) | null;
    applyFlavor: ((f: FlavorId) => void) | null;
    requestRender: (() => void) | null;
  }>({
    flavor,
    targetScale: WEIGHT_SCALES[selectedWeight],
    resetCamera: null,
    applyFlavor: null,
    requestRender: null,
  });

  const [isLoaded, setIsLoaded] = useState(false);

  // Sync flavor & weight prop changes without tearing down WebGL
  useEffect(() => {
    stateRef.current.flavor = flavor;
    stateRef.current.targetScale = WEIGHT_SCALES[selectedWeight];
    stateRef.current.applyFlavor?.(flavor);
    stateRef.current.requestRender?.();
  }, [flavor, selectedWeight]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();
    const width = Math.max(container.clientWidth, 280);
    const height = Math.max(container.clientHeight, 240);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c192d);
    scene.fog = new THREE.FogExp2(0x0c192d, 0.095);

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 40);
    const defaultCamPos = new THREE.Vector3(0.15, 2.35, 4.25);
    const defaultTarget = new THREE.Vector3(0, 0.82, 0);
    camera.position.copy(defaultCamPos);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Mandatory studio environment reflection (RoomEnvironment via PMREMGenerator)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    // 3-Point Warm/Cool Studio Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0xd8e8ff, 0x3b2312, 0.65);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffe1b0, 2.1);
    keyLight.position.set(3.2, 5.2, 3.8);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 14;
    keyLight.shadow.camera.left = -2.6;
    keyLight.shadow.camera.right = 2.6;
    keyLight.shadow.camera.top = 2.6;
    keyLight.shadow.camera.bottom = -2.6;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xffb76b, 0.95);
    rimLight.position.set(-3.4, 2.8, -3.0);
    scene.add(rimLight);

    const disposables: Array<{ dispose: () => void }> = [envTex];
    const track = <T extends { dispose: () => void }>(item: T): T => {
      disposables.push(item);
      return item;
    };

    // Soft contact shadow grounding plane
    const shadowTex = track(createContactShadowTexture());
    const shadowPlane = new THREE.Mesh(
      track(new THREE.PlaneGeometry(3.8, 3.8)),
      track(
        new THREE.MeshBasicMaterial({
          map: shadowTex,
          transparent: true,
          depthWrite: false,
          opacity: 0.55,
        }),
      ),
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.005;
    scene.add(shadowPlane);

    // Part 1: Beveled Wooden Serving Board (pivoted at bottom y=0)
    const woodTex = track(createWoodBoardTexture(maxAniso));
    const boardPoints = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(1.48, 0.0),
      new THREE.Vector2(1.56, 0.045),
      new THREE.Vector2(1.54, 0.13),
      new THREE.Vector2(1.44, 0.155),
      new THREE.Vector2(0.0, 0.155),
    ];
    const boardGeo = track(new THREE.LatheGeometry(boardPoints, 48));
    const boardMat = track(
      new THREE.MeshStandardMaterial({
        map: woodTex,
        roughness: 0.74,
        metalness: 0.04,
      }),
    );
    const boardMesh = new THREE.Mesh(boardGeo, boardMat);
    boardMesh.receiveShadow = true;
    scene.add(boardMesh);

    // Part 2: Brass inlay ring on serving board
    const boardRimGeo = track(new THREE.TorusGeometry(1.38, 0.014, 12, 64));
    const goldMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xd9a84e,
        metalness: 0.88,
        roughness: 0.22,
      }),
    );
    const boardRim = new THREE.Mesh(boardRimGeo, goldMat);
    boardRim.rotation.x = Math.PI / 2;
    boardRim.position.y = 0.16;
    scene.add(boardRim);

    // Hero Subject Group: Pan de Pascua Artesanal (pivoted at y=0.155 flush on board)
    const breadGroup = new THREE.Group();
    breadGroup.position.y = 0.155;
    scene.add(breadGroup);

    // Part 3: Dark Green Festive Paper Baking Mold (Pirotín)
    const wrapperTex = track(createWrapperTexture(maxAniso));
    const moldPoints = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.66, 0.0),
      new THREE.Vector2(0.75, 0.92),
      new THREE.Vector2(0.785, 0.96),
      new THREE.Vector2(0.74, 0.965),
      new THREE.Vector2(0.65, 0.05),
    ];
    const moldGeo = track(new THREE.LatheGeometry(moldPoints, 48));
    const moldMat = track(
      new THREE.MeshStandardMaterial({
        map: wrapperTex,
        roughness: 0.86,
        metalness: 0.05,
      }),
    );
    const moldMesh = new THREE.Mesh(moldGeo, moldMat);
    moldMesh.castShadow = true;
    moldMesh.receiveShadow = true;
    breadGroup.add(moldMesh);

    // Part 4: Brushed Gold Foil Collar Ribbon around the wrapper top
    const collarGeo = track(new THREE.TorusGeometry(0.768, 0.018, 12, 48));
    const collarMesh = new THREE.Mesh(collarGeo, goldMat);
    collarMesh.rotation.x = Math.PI / 2;
    collarMesh.position.y = 0.945;
    breadGroup.add(collarMesh);

    // Part 5: Golden Baked Brioche Dome
    const { colorMap: crustColor, bumpMap: crustBump } = createBakedCrustTexture(maxAniso);
    track(crustColor);
    track(crustBump);
    const domePoints: THREE.Vector2[] = [];
    const domeSteps = 22;
    for (let i = 0; i <= domeSteps; i++) {
      const t = i / domeSteps; // 0 = edge at mold rim, 1 = crown top
      const angle = t * (Math.PI * 0.5);
      const radius = Math.cos(angle) * 0.785;
      // Classic Pan de Pascua rounded mushroom overhang slightly wider than rim
      const overhang = Math.sin(t * Math.PI) * 0.065;
      const y = 0.87 + Math.sin(angle) * 0.62;
      domePoints.push(new THREE.Vector2(Math.max(0, radius + overhang), y));
    }
    const domeGeo = track(new THREE.LatheGeometry(domePoints, 48));
    // Add subtle artisan baking irregularity
    const domePos = domeGeo.attributes.position;
    for (let i = 0; i < domePos.count; i++) {
      const vx = domePos.getX(i);
      const vy = domePos.getY(i);
      const vz = domePos.getZ(i);
      const wobble =
        Math.sin(vx * 5.2 + vz * 3.1) * 0.018 + Math.cos(vz * 6.0 - vx * 2.5) * 0.014;
      domePos.setXYZ(i, vx * (1 + wobble), vy + wobble * 0.5, vz * (1 + wobble));
    }
    domeGeo.computeVertexNormals();

    const domeMat = track(
      new THREE.MeshPhysicalMaterial({
        map: crustColor,
        bumpMap: crustBump,
        bumpScale: 0.03,
        roughness: 0.54,
        metalness: 0.0,
        clearcoat: 0.2,
        clearcoatRoughness: 0.35,
      }),
    );
    const domeMesh = new THREE.Mesh(domeGeo, domeMat);
    domeMesh.castShadow = true;
    domeMesh.receiveShadow = true;
    breadGroup.add(domeMesh);

    // Part 6A: Tradicional Topping Group (Candied fruits, raisins, sugar dusting)
    const tradicionalGroup = new THREE.Group();
    const fruitGeo = track(new THREE.BoxGeometry(0.085, 0.055, 0.085));
    const fruitMat = track(
      new THREE.MeshPhysicalMaterial({
        roughness: 0.25,
        metalness: 0.0,
        clearcoat: 0.65,
      }),
    );
    const fruitCount = 26;
    const fruitInst = new THREE.InstancedMesh(fruitGeo, fruitMat, fruitCount);
    const fruitPalette = [0xb91c1c, 0x15803d, 0xd97706, 0x2a1a1f]; // cherry, citron, orange peel, raisin
    for (let i = 0; i < fruitCount; i++) {
      const theta = (i * 2.39996) % (Math.PI * 2); // golden angle spiral
      const rNorm = Math.sqrt((i + 0.5) / fruitCount) * 0.72;
      const x = Math.cos(theta) * rNorm * 0.78;
      const z = Math.sin(theta) * rNorm * 0.78;
      const y = 0.91 + Math.sqrt(Math.max(0.04, 1 - rNorm * rNorm)) * 0.57;
      _dummy.position.set(x, y, z);
      _dummy.rotation.set(i * 0.6, theta, i * 0.4);
      const s = 0.75 + (i % 4) * 0.14;
      _dummy.scale.set(s, s * 0.85, s);
      _dummy.updateMatrix();
      fruitInst.setMatrixAt(i, _dummy.matrix);
      _color.setHex(fruitPalette[i % fruitPalette.length]);
      fruitInst.setColorAt(i, _color);
    }
    fruitInst.instanceMatrix.needsUpdate = true;
    if (fruitInst.instanceColor) fruitInst.instanceColor.needsUpdate = true;
    fruitInst.computeBoundingSphere();
    tradicionalGroup.add(fruitInst);

    // Delicate powdered sugar crown accent
    const sugarRingGeo = track(new THREE.CircleGeometry(0.42, 32));
    const sugarMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xfef8ec,
        roughness: 0.95,
        transparent: true,
        opacity: 0.38,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
    const sugarCrown = new THREE.Mesh(sugarRingGeo, sugarMat);
    sugarCrown.rotation.x = -Math.PI / 2;
    sugarCrown.position.y = 1.495;
    tradicionalGroup.add(sugarCrown);
    breadGroup.add(tradicionalGroup);

    // Part 6B: Nutella Topping Group (Glossy chocolate-hazelnut drizzle + roasted hazelnuts)
    const nutellaGroup = new THREE.Group();
    const chocoMat = track(
      new THREE.MeshPhysicalMaterial({
        color: 0x3b1d0f,
        roughness: 0.18,
        metalness: 0.04,
        clearcoat: 0.82,
        clearcoatRoughness: 0.14,
      }),
    );

    // Flowing chocolate ribbons draped across the dome
    for (let r = 0; r < 6; r++) {
      const baseAngle = (r / 6) * Math.PI * 2;
      const curvePts: THREE.Vector3[] = [];
      for (let s = 0; s <= 12; s++) {
        const u = s / 12;
        const rad = 0.08 + u * 0.69;
        const ang = baseAngle + Math.sin(u * 4.5) * 0.25;
        const y = 0.89 + Math.sqrt(Math.max(0.02, 1 - (rad / 0.8) ** 2)) * 0.62;
        curvePts.push(new THREE.Vector3(Math.cos(ang) * rad, y, Math.sin(ang) * rad));
      }
      const curve = new THREE.CatmullRomCurve3(curvePts);
      const ribbonGeo = track(new THREE.TubeGeometry(curve, 24, 0.038, 8, false));
      const ribbonMesh = new THREE.Mesh(ribbonGeo, chocoMat);
      ribbonMesh.castShadow = true;
      nutellaGroup.add(ribbonMesh);
    }

    // Glossy center Nutella swirl dollop
    const dollopGeo = track(new THREE.TorusGeometry(0.14, 0.055, 14, 32));
    const dollop = new THREE.Mesh(dollopGeo, chocoMat);
    dollop.rotation.x = Math.PI / 2;
    dollop.position.y = 1.48;
    nutellaGroup.add(dollop);

    // Toasted hazelnuts (InstancedMesh)
    const nutGeo = track(new THREE.SphereGeometry(0.058, 14, 12));
    const nutMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xc28a4b,
        roughness: 0.48,
        metalness: 0.02,
      }),
    );
    const nutCount = 14;
    const nutInst = new THREE.InstancedMesh(nutGeo, nutMat, nutCount);
    for (let i = 0; i < nutCount; i++) {
      const ang = (i / nutCount) * Math.PI * 2 + 0.3;
      const rad = 0.26 + (i % 3) * 0.14;
      const y = 0.92 + Math.sqrt(Math.max(0.05, 1 - (rad / 0.8) ** 2)) * 0.61;
      _dummy.position.set(Math.cos(ang) * rad, y, Math.sin(ang) * rad);
      _dummy.rotation.set(i * 0.5, ang, 0.2);
      _dummy.scale.set(1.0, 0.82, 0.9);
      _dummy.updateMatrix();
      nutInst.setMatrixAt(i, _dummy.matrix);
    }
    nutInst.instanceMatrix.needsUpdate = true;
    nutInst.computeBoundingSphere();
    nutellaGroup.add(nutInst);
    breadGroup.add(nutellaGroup);

    // Part 6C: Higos Topping Group (Caramelized fig halves + amber panela syrup)
    const higosGroup = new THREE.Group();
    const syrupMat = track(
      new THREE.MeshPhysicalMaterial({
        color: 0x7c3a0f,
        roughness: 0.14,
        metalness: 0.02,
        clearcoat: 0.9,
        clearcoatRoughness: 0.1,
      }),
    );
    const figSkinMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x3b1f2f,
        roughness: 0.42,
        metalness: 0.02,
      }),
    );
    const figFleshMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x9b3a4b,
        roughness: 0.36,
        metalness: 0.0,
      }),
    );

    // Honey-panela crown glaze cap
    const glazePoints: THREE.Vector2[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const angle = (0.45 + t * 0.55) * (Math.PI * 0.5);
      const r = Math.cos(angle) * 0.805;
      const y = 0.9 + Math.sin(angle) * 0.625;
      glazePoints.push(new THREE.Vector2(Math.max(0, r), y));
    }
    const glazeMesh = new THREE.Mesh(track(new THREE.LatheGeometry(glazePoints, 36)), syrupMat);
    higosGroup.add(glazeMesh);

    // 5 sculpted caramelized fig halves on top
    const figOuterGeo = track(new THREE.SphereGeometry(0.14, 16, 12, 0, Math.PI));
    const figInnerGeo = track(new THREE.CircleGeometry(0.138, 16));
    for (let f = 0; f < 5; f++) {
      const figUnit = new THREE.Group();
      const outer = new THREE.Mesh(figOuterGeo, figSkinMat);
      const inner = new THREE.Mesh(figInnerGeo, figFleshMat);
      inner.rotation.y = Math.PI;
      figUnit.add(outer, inner);

      const ang = (f / 5) * Math.PI * 2;
      const rad = f === 0 ? 0.04 : 0.32;
      const y = f === 0 ? 1.54 : 1.38;
      figUnit.position.set(Math.cos(ang) * rad, y, Math.sin(ang) * rad);
      figUnit.rotation.set(-0.45, ang + 0.6, 0.25);
      figUnit.scale.set(0.95, 1.15, 0.85);
      higosGroup.add(figUnit);
    }
    breadGroup.add(higosGroup);

    // Part 7: Artisan Cinnamon Stick & Star Anise accent on the board
    const cinnamonMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x6e3a1c,
        roughness: 0.85,
        metalness: 0.0,
      }),
    );
    const stickGeo = track(new THREE.CylinderGeometry(0.055, 0.06, 0.72, 16, 1, true));
    const stick1 = new THREE.Mesh(stickGeo, cinnamonMat);
    stick1.rotation.set(Math.PI / 2, 0, 0.45);
    stick1.position.set(0.96, 0.21, 0.54);
    stick1.castShadow = true;
    scene.add(stick1);

    const stick2 = new THREE.Mesh(stickGeo, cinnamonMat);
    stick2.rotation.set(Math.PI / 2, 0, 0.15);
    stick2.position.set(1.04, 0.21, 0.34);
    stick2.castShadow = true;
    scene.add(stick2);

    // Part 8: Subtle Golden Holiday Bokeh Motes (InstancedMesh, 28 items)
    const moteGeo = track(new THREE.SphereGeometry(0.024, 8, 8));
    const moteMat = track(
      new THREE.MeshBasicMaterial({
        color: 0xf7d07a,
        transparent: true,
        opacity: 0.5,
      }),
    );
    const moteCount = 28;
    const moteInst = new THREE.InstancedMesh(moteGeo, moteMat, moteCount);
    const moteSeeds = Array.from({ length: moteCount }, (_, i) => ({
      angle: (i / moteCount) * Math.PI * 2,
      radius: 1.55 + (i % 5) * 0.36,
      baseY: 0.35 + ((i * 0.37) % 1.9),
      speed: 0.25 + (i % 4) * 0.09,
      scale: 0.6 + (i % 3) * 0.35,
    }));
    moteInst.frustumCulled = false;
    scene.add(moteInst);

    const applyFlavor = (f: FlavorId) => {
      tradicionalGroup.visible = f === 'Tradicional';
      nutellaGroup.visible = f === 'Nutella';
      higosGroup.visible = f === 'Higos';
    };
    applyFlavor(stateRef.current.flavor);

    // OrbitControls with smooth damping
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(defaultTarget);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 2.6;
    controls.maxDistance = 6.2;
    controls.minPolarAngle = 0.28;
    controls.maxPolarAngle = Math.PI / 2 - 0.06;
    controls.update();

    let currentScale = stateRef.current.targetScale;
    breadGroup.scale.setScalar(currentScale);

    // Pre-warm shaders on GPU
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let frameId = 0;
    let disposed = false;
    const clock = new THREE.Clock();

    function updateScene(dt: number, elapsed: number) {
      // Smooth exponential damping on bread scale when switching 500g / 250g / 100g
      currentScale = THREE.MathUtils.damp(
        currentScale,
        stateRef.current.targetScale,
        7.5,
        dt,
      );
      breadGroup.scale.setScalar(currentScale);

      // Gentle turntable showcase rotation
      breadGroup.rotation.y += dt * 0.24;

      // Drift holiday motes (zero GC)
      for (let i = 0; i < moteCount; i++) {
        const s = moteSeeds[i];
        const a = s.angle + elapsed * s.speed * 0.35;
        _dummy.position.set(
          Math.cos(a) * s.radius,
          s.baseY + Math.sin(elapsed * s.speed + i) * 0.14,
          Math.sin(a) * s.radius,
        );
        _dummy.scale.setScalar(s.scale);
        _dummy.updateMatrix();
        moteInst.setMatrixAt(i, _dummy.matrix);
      }
      moteInst.instanceMatrix.needsUpdate = true;

      controls.update();
    }

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (status === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const dt = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();
      updateScene(dt, elapsed);
      renderer.render(scene, camera);
      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    stateRef.current.applyFlavor = applyFlavor;
    stateRef.current.resetCamera = () => {
      camera.position.copy(defaultCamPos);
      controls.target.copy(defaultTarget);
      controls.update();
    };
    stateRef.current.requestRender = () => {
      if (!disposed) {
        renderer.render(scene, camera);
      }
    };

    setIsLoaded(true);
    tick();

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || disposed) return;
      const w = Math.max(Math.floor(entry.contentRect.width), 240);
      const h = Math.max(Math.floor(entry.contentRect.height), 220);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      for (const d of disposables) {
        d.dispose();
      }
      renderer.dispose();
    };
  }, []);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#D4A353]/35 bg-[#0C192D]">
      {/* Dedicated isolated WebGL canvas mount */}
      <div
        ref={mountRef}
        className="h-[240px] sm:h-[270px] w-full cursor-grab active:cursor-grabbing"
        aria-label={`Vista 3D interactiva del Pan de Pascua ${flavor} de ${selectedWeight}`}
      />

      {!isLoaded && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#0C192D] text-xs text-[#FAF4E8]/70">
          Preparando vista artesanal 3D...
        </div>
      )}

      {/* Top minimal caption (solid rgba, zero backdrop-filter over WebGL) */}
      <div className="pointer-events-none absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
        <span className="rounded-md bg-[#081222]/90 px-2.5 py-1 text-xs font-medium text-[#FAF4E8] border border-[#D4A353]/25">
          Vista 3D · {flavor} · {selectedWeight}
        </span>
        <span className="hidden sm:inline-block rounded-md bg-[#081222]/85 px-2 py-1 text-[11px] text-[#FAF4E8]/75">
          Arrastra para girar
        </span>
      </div>

      {/* Compact bottom dock (solid rgba surface, no backdrop-filter over WebGL) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#D4A353]/20 bg-[#081222] px-3 py-2.5">
        <div className="flex items-center gap-1.5" role="group" aria-label="Comparar tamaño en 3D">
          <span className="text-[11px] text-[#FAF4E8]/70 mr-1">Tamaño:</span>
          {WEIGHTS.map((w) => {
            const active = selectedWeight === w;
            return (
              <button
                key={w}
                type="button"
                onClick={() => onSelectWeight(w)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-[#9E2A2B] text-[#FAF4E8]'
                    : 'bg-[#142744] text-[#FAF4E8]/80 hover:bg-[#1C365E]'
                }`}
              >
                {w}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => stateRef.current.resetCamera?.()}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#142744] px-2.5 py-1 text-xs font-medium text-[#FAF4E8]/85 hover:bg-[#1C365E] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Centrar
        </button>
      </div>
    </div>
  );
}
