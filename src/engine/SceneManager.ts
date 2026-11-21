import * as THREE from 'three';

export interface CameraShakeConfig {
  intensity: number;
  duration: number; // in seconds
}

export class SceneManager {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  private canvas: HTMLCanvasElement;

  // 2.5D Camera tracking variables
  private readonly cameraZ: number = 7.5;
  private readonly minFOV: number = 38;
  private readonly maxFOV: number = 52;
  private targetFOV: number = 44;
  private readonly minX: number = -12;
  private readonly maxX: number = 12;

  // Screen shake
  private shakeTimer: number = 0;
  private shakeDuration: number = 0;
  private shakeIntensity: number = 0;
  private shakeOffset: THREE.Vector3 = new THREE.Vector3();

  // Arena elements
  private arenaGroup: THREE.Group = new THREE.Group();
  private crowdInstances: THREE.InstancedMesh | null = null;
  private floodlights: THREE.SpotLight[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a1128);
    this.scene.fog = new THREE.FogExp2(0x0a1128, 0.018);

    // 2. Camera
    const aspect = canvas.clientWidth / (canvas.clientHeight || 1);
    this.camera = new THREE.PerspectiveCamera(44, aspect, 0.1, 100);
    this.camera.position.set(0, 2.2, this.cameraZ);
    this.camera.lookAt(0, 1.6, 0);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene.add(this.arenaGroup);

    this.setupLighting();
    this.buildStadiumArena('stadium_day');
    this.setupResizeListener();
  }

  private setupLighting(): void {
    // Ambient stadium light
    const ambientLight = new THREE.AmbientLight(0xd9e8ff, 0.7);
    this.scene.add(ambientLight);

    // Main stadium sun / key light
    const dirLight = new THREE.DirectionalLight(0xfff5e6, 1.8);
    dirLight.position.set(5, 12, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 30;
    dirLight.shadow.camera.left = -16;
    dirLight.shadow.camera.right = 16;
    dirLight.shadow.camera.top = 10;
    dirLight.shadow.camera.bottom = -2;
    dirLight.shadow.bias = -0.0005;
    this.scene.add(dirLight);

    // Back rim light for sharp fighter silhouette separation (Tekken / SF style!)
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.4);
    rimLight.position.set(-6, 8, -8);
    this.scene.add(rimLight);
  }

  public buildStadiumArena(arenaType: 'stadium_day' | 'gully_cricket' | 'rooftop'): void {
    // Clear existing
    while (this.arenaGroup.children.length > 0) {
      const obj = this.arenaGroup.children[0];
      this.arenaGroup.remove(obj);
    }

    if (arenaType === 'stadium_day') {
      this.buildCricketStadium();
    } else if (arenaType === 'gully_cricket') {
      this.buildGullyArena();
    } else {
      this.buildRooftopArena();
    }
  }

  private buildCricketStadium(): void {
    this.scene.background = new THREE.Color(0x0b1329);
    this.scene.fog = new THREE.FogExp2(0x0b1329, 0.015);

    // 1. Lush Green Ground / Outfield
    const groundGeo = new THREE.PlaneGeometry(60, 40);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1e5a2e,
      roughness: 0.85,
      metalness: 0.05
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.arenaGroup.add(ground);

    // 2. Center Cricket Pitch (clay / turf strip)
    const pitchGeo = new THREE.PlaneGeometry(28, 4.4);
    const pitchMat = new THREE.MeshStandardMaterial({
      color: 0xc8aa78,
      roughness: 0.9,
      metalness: 0.0
    });
    const pitch = new THREE.Mesh(pitchGeo, pitchMat);
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.set(0, 0.002, 0); // slightly above outfield to prevent z-fighting
    pitch.receiveShadow = true;
    this.arenaGroup.add(pitch);

    // 3. Crease Lines (white chalk lines)
    const creaseMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const popCreaseGeo = new THREE.PlaneGeometry(0.12, 4.2);
    // Left crease
    const leftCrease = new THREE.Mesh(popCreaseGeo, creaseMat);
    leftCrease.rotation.x = -Math.PI / 2;
    leftCrease.position.set(-10, 0.005, 0);
    this.arenaGroup.add(leftCrease);
    // Right crease
    const rightCrease = new THREE.Mesh(popCreaseGeo, creaseMat);
    rightCrease.rotation.x = -Math.PI / 2;
    rightCrease.position.set(10, 0.005, 0);
    this.arenaGroup.add(rightCrease);

    // Center pitch line
    const centerLineGeo = new THREE.PlaneGeometry(0.08, 4.2);
    const centerLine = new THREE.Mesh(centerLineGeo, new THREE.MeshBasicMaterial({ color: 0xffe099, opacity: 0.6, transparent: true }));
    centerLine.rotation.x = -Math.PI / 2;
    centerLine.position.set(0, 0.004, 0);
    this.arenaGroup.add(centerLine);

    // 4. Stumps & Bails (Wooden Wickets on both sides)
    this.addWickets(-11, 0);
    this.addWickets(11, 0);

    // 5. Boundary Ropes & Foam Wedges
    this.buildBoundaryRope();

    // 6. Stadium Stands & Instanced Crowd
    this.buildCrowdStands();

    // 7. Floodlight Towers
    this.buildFloodlightTowers();
  }

  private addWickets(x: number, z: number): void {
    const wicketGroup = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0xd49b45, roughness: 0.6 });

    // 3 Stumps
    const stumpGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.72, 8);
    for (let i = -1; i <= 1; i++) {
      const stump = new THREE.Mesh(stumpGeo, woodMat);
      stump.position.set(0, 0.36, i * 0.12);
      stump.castShadow = true;
      wicketGroup.add(stump);
    }

    // 2 Bails on top
    const bailGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.12, 6);
    const bail1 = new THREE.Mesh(bailGeo, woodMat);
    bail1.rotation.x = Math.PI / 2;
    bail1.position.set(0, 0.73, -0.06);
    wicketGroup.add(bail1);

    const bail2 = new THREE.Mesh(bailGeo, woodMat);
    bail2.rotation.x = Math.PI / 2;
    bail2.position.set(0, 0.73, 0.06);
    wicketGroup.add(bail2);

    wicketGroup.position.set(x, 0, z);
    this.arenaGroup.add(wicketGroup);
  }

  private buildBoundaryRope(): void {
    // Foam wedges along Z boundary
    const wedgeGeo = new THREE.BoxGeometry(0.5, 0.25, 0.3);
    const wedgeMat1 = new THREE.MeshStandardMaterial({ color: 0x2563eb }); // Blue
    const wedgeMat2 = new THREE.MeshStandardMaterial({ color: 0xf59e0b }); // Gold

    for (let x = -13; x <= 13; x += 0.8) {
      const mat = Math.abs(x) % 1.6 < 0.8 ? wedgeMat1 : wedgeMat2;
      const wedge = new THREE.Mesh(wedgeGeo, mat);
      wedge.position.set(x, 0.125, -2.4);
      wedge.castShadow = true;
      this.arenaGroup.add(wedge);
    }
  }

  private buildCrowdStands(): void {
    // Tiered stadium seating behind the pitch
    const standMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
    for (let tier = 0; tier < 6; tier++) {
      const tierGeo = new THREE.BoxGeometry(36, 0.6, 1.2);
      const stand = new THREE.Mesh(tierGeo, standMat);
      stand.position.set(0, 0.4 + tier * 0.65, -3.8 - tier * 1.1);
      this.arenaGroup.add(stand);
    }

    // Instanced Crowd spectators (thousands of stylized crowd heads/torsos)
    const crowdCount = 180;
    const crowdGeo = new THREE.SphereGeometry(0.16, 6, 6);
    const crowdMat = new THREE.MeshStandardMaterial({
      roughness: 0.7,
      metalness: 0.1
    });

    this.crowdInstances = new THREE.InstancedMesh(crowdGeo, crowdMat, crowdCount);
    const dummy = new THREE.Object3D();
    const colors = [
      new THREE.Color(0xef4444),
      new THREE.Color(0x3b82f6),
      new THREE.Color(0xfacc15),
      new THREE.Color(0x10b981),
      new THREE.Color(0xffffff),
      new THREE.Color(0x8b5cf6)
    ];

    let index = 0;
    for (let tier = 0; tier < 6; tier++) {
      for (let i = -15; i <= 15; i += 1.0) {
        if (index >= crowdCount) break;
        const xOffset = i + (Math.random() - 0.5) * 0.2;
        const yOffset = 0.85 + tier * 0.65 + (Math.random() - 0.5) * 0.1;
        const zOffset = -3.8 - tier * 1.1 + (Math.random() - 0.5) * 0.2;

        dummy.position.set(xOffset, yOffset, zOffset);
        dummy.scale.set(1, 1.2, 1);
        dummy.updateMatrix();

        this.crowdInstances.setMatrixAt(index, dummy.matrix);
        this.crowdInstances.setColorAt(index, colors[Math.floor(Math.random() * colors.length)]);
        index++;
      }
    }
    this.crowdInstances.instanceMatrix.needsUpdate = true;
    if (this.crowdInstances.instanceColor) {
      this.crowdInstances.instanceColor.needsUpdate = true;
    }
    this.arenaGroup.add(this.crowdInstances);
  }

  private buildFloodlightTowers(): void {
    const towerGeo = new THREE.CylinderGeometry(0.12, 0.2, 12, 8);
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.4 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    const positions = [
      { x: -14, z: -7 },
      { x: 14, z: -7 }
    ];

    positions.forEach(pos => {
      // Tower Pole
      const tower = new THREE.Mesh(towerGeo, metalMat);
      tower.position.set(pos.x, 6, pos.z);
      this.arenaGroup.add(tower);

      // Light Bank Head
      const headGeo = new THREE.BoxGeometry(2.4, 1.2, 0.4);
      const head = new THREE.Mesh(headGeo, metalMat);
      head.position.set(pos.x, 12, pos.z);
      head.lookAt(0, 2, 0);
      this.arenaGroup.add(head);

      // Glowing bulbs
      const bulbGeo = new THREE.PlaneGeometry(2.2, 1.0);
      const bulb = new THREE.Mesh(bulbGeo, lampMat);
      bulb.position.set(pos.x, 12, pos.z + 0.22);
      bulb.lookAt(0, 2, 0);
      this.arenaGroup.add(bulb);
    });
  }

  private buildGullyArena(): void {
    this.scene.background = new THREE.Color(0x1a120b);
    this.scene.fog = new THREE.FogExp2(0x1a120b, 0.02);

    // Rough brick street pavement
    const streetGeo = new THREE.PlaneGeometry(36, 16);
    const streetMat = new THREE.MeshStandardMaterial({ color: 0x3d3228, roughness: 0.9 });
    const street = new THREE.Mesh(streetGeo, streetMat);
    street.rotation.x = -Math.PI / 2;
    street.receiveShadow = true;
    this.arenaGroup.add(street);

    // Brick wall backdrop
    const wallGeo = new THREE.BoxGeometry(32, 6, 0.5);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.95 });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(0, 3, -3);
    this.arenaGroup.add(wall);

    // Plastic chair wickets
    this.addWickets(-9, 0);
    this.addWickets(9, 0);
  }

  private buildRooftopArena(): void {
    this.scene.background = new THREE.Color(0xf59e0b); // Sunset orange
    this.scene.fog = new THREE.FogExp2(0xf59e0b, 0.012);

    const roofGeo = new THREE.PlaneGeometry(32, 16);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.rotation.x = -Math.PI / 2;
    roof.receiveShadow = true;
    this.arenaGroup.add(roof);

    this.addWickets(-9, 0);
    this.addWickets(9, 0);
  }

  // --- CAMERA UPDATE & SHAKE ---

  public updateCamera(p1Pos: THREE.Vector3, p2Pos: THREE.Vector3, dt: number): void {
    // 1. Calculate midpoint between fighters
    const midX = (p1Pos.x + p2Pos.x) * 0.5;
    const clampedMidX = Math.max(this.minX + 3, Math.min(this.maxX - 3, midX));

    // Dynamic zoom based on horizontal distance
    const dist = Math.abs(p1Pos.x - p2Pos.x);
    const targetFOV = this.minFOV + (dist / 14) * (this.maxFOV - this.minFOV);
    this.targetFOV = Math.max(this.minFOV, Math.min(this.maxFOV, targetFOV));

    // Smooth lerp
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.targetFOV, dt * 6);
    this.camera.updateProjectionMatrix();

    // Smooth camera X tracking
    const targetCamX = clampedMidX;
    this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, targetCamX, dt * 8);

    // Apply Screen Shake
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      const progress = this.shakeTimer / this.shakeDuration;
      const currentIntensity = this.shakeIntensity * progress;
      this.shakeOffset.set(
        (Math.random() - 0.5) * currentIntensity,
        (Math.random() - 0.5) * currentIntensity,
        0
      );
    } else {
      this.shakeOffset.set(0, 0, 0);
    }

    this.camera.position.y = 2.2 + this.shakeOffset.y;
    this.camera.position.z = this.cameraZ + this.shakeOffset.z;
    this.camera.lookAt(this.camera.position.x + this.shakeOffset.x, 1.6, 0);
  }

  public triggerScreenShake(intensity: number = 0.25, duration: number = 0.2): void {
    this.shakeIntensity = intensity;
    this.shakeDuration = duration;
    this.shakeTimer = duration;
  }

  /** Brief FOV punch-in on heavy hits / launchers (~2–3°) */
  public punchCamera(degrees: number = 2.5, recoverMs: number = 120): void {
    this.camera.fov = Math.max(this.minFOV - 4, this.camera.fov - degrees);
    this.camera.updateProjectionMatrix();
    window.setTimeout(() => {
      /* recover via updateCamera lerp toward targetFOV */
    }, recoverMs);
  }

  public render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private setupResizeListener(): void {
    window.addEventListener('resize', () => {
      const width = this.canvas.clientWidth;
      const height = this.canvas.clientHeight || 1;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height, false);
    });
  }

  public setQuality(quality: 'low' | 'med' | 'high'): void {
    if (quality === 'low') {
      this.renderer.shadowMap.enabled = false;
      this.renderer.setPixelRatio(1);
    } else if (quality === 'med') {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.BasicShadowMap;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    } else {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }
  }
}
