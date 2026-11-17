import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CharacterVisualConfig, getCharacterVisual } from '../characters/visuals';
import { CharacterProfile, FighterState } from './types';

/**
 * FighterMesh — procedural humanoid OR loaded GLB/FBX (see characters/visuals.ts).
 * Coordinate system:
 * - root.rotation.y is +PI/2 when facing right, -PI/2 when facing left.
 * - In both cases, local +Z points directly towards the opponent.
 * - Negative rotation.x swings limbs forward towards the opponent!
 * - Positive rotation.x swings limbs backward away from the opponent.
 */
export class FighterMesh {
  public root: THREE.Group = new THREE.Group();

  // Skeletal parts for procedural animation
  private hips: THREE.Group = new THREE.Group();
  private torso: THREE.Group = new THREE.Group();
  private head: THREE.Group = new THREE.Group();
  private leftArm: THREE.Group = new THREE.Group();  // Lead / front arm (closer to opponent)
  private rightArm: THREE.Group = new THREE.Group(); // Rear / power arm (further from opponent)
  private leftLeg: THREE.Group = new THREE.Group();  // Lead / front leg (closer to opponent)
  private rightLeg: THREE.Group = new THREE.Group(); // Rear / power leg (further from opponent)
  private shadowBlob: THREE.Mesh | null = null;

  // Mesh materials
  private jerseyMat: THREE.MeshStandardMaterial;
  private pantsMat: THREE.MeshStandardMaterial;
  private skinMat: THREE.MeshStandardMaterial;
  private helmetMat: THREE.MeshStandardMaterial;
  private shoeMat: THREE.MeshStandardMaterial;

  private animTimer: number = 0;

  // External model (config in characters/visuals.ts)
  private visual: CharacterVisualConfig | null = null;
  private useModel: boolean = false;
  /** Cancels hip/root drift so mesh sits on shadow/hitbox every frame */
  private alignPivot: THREE.Group = new THREE.Group();
  private modelPivot: THREE.Group = new THREE.Group();
  private modelMaterials: THREE.MeshStandardMaterial[] = [];
  private modelReady: boolean = false;
  private mixer: THREE.AnimationMixer | null = null;
  private clipActions: Map<string, THREE.AnimationAction> = new Map();
  private activeClipName: string = '';
  private hasSkinnedAnims: boolean = false;
  private introPlaying: boolean = false;
  private lastAttackClipKey: string = '';
  private lastReactKey: string = '';
  /** Keep punch/kick playing at natural speed after move frames end */
  private holdingAttackClip: boolean = false;
  private heldAttackClipName: string = '';
  private heldAttackWasKick: boolean = false;
  private hipsBone: THREE.Object3D | null = null;
  private leftFootBone: THREE.Object3D | null = null;
  private rightFootBone: THREE.Object3D | null = null;
  private leftHandBone: THREE.Object3D | null = null;
  private rightHandBone: THREE.Object3D | null = null;
  private leftToeBone: THREE.Object3D | null = null;
  private rightToeBone: THREE.Object3D | null = null;
  private readonly _alignHips = new THREE.Vector3();
  private readonly _alignFootL = new THREE.Vector3();
  private readonly _alignFootR = new THREE.Vector3();
  private readonly _alignLocal = new THREE.Vector3();
  private readonly _strikeWorld = new THREE.Vector3();

  constructor(profile: CharacterProfile, isP2: boolean = false) {
    const colors = profile.colorScheme;
    const primaryColor = isP2 ? colors.secondary : colors.primary;
    const secondaryColor = isP2 ? colors.primary : colors.secondary;

    this.jerseyMat = new THREE.MeshStandardMaterial({
      color: primaryColor,
      roughness: 0.5,
      metalness: 0.1
    });

    this.pantsMat = new THREE.MeshStandardMaterial({
      color: secondaryColor,
      roughness: 0.7,
      metalness: 0.05
    });

    this.skinMat = new THREE.MeshStandardMaterial({
      color: 0xd49b6a,
      roughness: 0.8
    });

    this.helmetMat = new THREE.MeshStandardMaterial({
      color: colors.accent,
      roughness: 0.3,
      metalness: 0.4
    });

    this.shoeMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.8
    });

    // All fighters use visuals.ts (Rohit pack for everyone until unique GLBs)
    const visual = getCharacterVisual(profile.id);
    this.visual = visual;
    this.useModel = true;
    this.buildShadowOnly();
    // root → alignPivot (auto snap) → modelPivot (manual offset/yaw) → model
    this.root.add(this.alignPivot);
    this.alignPivot.add(this.modelPivot);
    this.loadCharacterModel(visual.modelUrl);
  }

  private buildShadowOnly(): void {
    this.root.castShadow = true;
    this.root.receiveShadow = true;

    const shadowGeo = new THREE.CircleGeometry(0.42, 16);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x030712,
      transparent: true,
      opacity: 0.55,
      depthWrite: false
    });
    this.shadowBlob = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadowBlob.position.set(0, 0.012, 0);
    this.root.add(this.shadowBlob);
  }

  private loadCharacterModel(url: string): void {
    const lower = url.toLowerCase();
    if (lower.endsWith('.fbx')) {
      const loader = new FBXLoader();
      loader.load(
        url,
        (fbx) => this.onModelLoaded(fbx, fbx.animations || []),
        undefined,
        (err) => console.error('[FighterMesh] FBX load failed', url, err)
      );
      return;
    }

    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => this.onModelLoaded(gltf.scene, gltf.animations || []),
      undefined,
      (err) => console.error('[FighterMesh] GLB load failed', url, err)
    );
  }

  private onModelLoaded(model: THREE.Object3D, animations: THREE.AnimationClip[]): void {
    model.traverse((obj) => {
      const n = obj.name;
      if (n === 'Hips' || n === 'hips' || n === 'mixamorigHips') this.hipsBone = obj;
      if (n === 'LeftHand' || n === 'mixamorigLeftHand') this.leftHandBone = obj;
      if (n === 'RightHand' || n === 'mixamorigRightHand') this.rightHandBone = obj;
      if (n === 'LeftToeBase' || n === 'mixamorigLeftToeBase') {
        this.leftToeBone = obj;
        this.leftFootBone = obj;
      } else if (!this.leftFootBone && (n === 'LeftFoot' || n === 'mixamorigLeftFoot')) {
        this.leftFootBone = obj;
      }
      if (n === 'RightToeBase' || n === 'mixamorigRightToeBase') {
        this.rightToeBone = obj;
        this.rightFootBone = obj;
      } else if (!this.rightFootBone && (n === 'RightFoot' || n === 'mixamorigRightFoot')) {
        this.rightFootBone = obj;
      }

      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh && !(mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        const std = mat as THREE.MeshStandardMaterial;
        if (std && 'color' in std) {
          if ('metalness' in std) {
            std.metalness = Math.min(std.metalness ?? 0.1, 0.2);
            std.roughness = Math.max(std.roughness ?? 0.7, 0.55);
          }
          if (!std.emissive) std.emissive = new THREE.Color(0x000000);
          this.modelMaterials.push(std);
        }
      }
    });

    this.fitModelToFighterHeight(model);
    this.modelPivot.add(model);

    const off = this.visual?.offset;
    this.modelPivot.position.set(off?.x ?? 0, off?.y ?? 0, off?.z ?? 0);
    this.modelPivot.rotation.y = this.visual?.yaw ?? 0;

    let usable = animations.filter((c) => c.tracks.length > 0 && c.duration > 0);
    if (this.visual?.stripRootMotion !== false) {
      usable = usable.map((c) => this.stripHipRootMotion(c));
    }

    if (usable.length > 0) {
      this.mixer = new THREE.AnimationMixer(model);
      this.hasSkinnedAnims = true;
      for (const clip of usable) {
        const action = this.mixer.clipAction(clip);
        action.enabled = true;
        this.clipActions.set(clip.name, action);
      }
      const introName = this.visual?.introClip ?? 'Bow_RT';
      const idleName = this.visual?.clips.idle ?? 'Fighting_Idle_RT';
      this.mixer.addEventListener('finished', (e) => {
        const action = (e as { action?: THREE.AnimationAction }).action;
        if (this.introPlaying && action === this.clipActions.get(introName)) {
          this.introPlaying = false;
          this.playClip(idleName, true);
        }
      });
      console.info('[FighterMesh] clips:', usable.map((c) => `${c.name} (${c.duration.toFixed(2)}s)`));
      this.playIntro();
    } else {
      this.hasSkinnedAnims = false;
      console.warn('[FighterMesh] Model has no usable animation clips — static / lean only');
    }

    this.modelReady = true;
    // Snap once after first pose so bow doesn't flash off-shadow
    this.alignModelToRoot();
  }

  /**
   * Lock Hips XZ to each clip's FIRST keyframe (not 0).
   * Rest pose hips sit at Z≈89; Bow keys are Z≈-1 — zeroing caused the huge shadow gap.
   */
  private stripHipRootMotion(clip: THREE.AnimationClip): THREE.AnimationClip {
    const cloned = clip.clone();
    for (const track of cloned.tracks) {
      if (!/\.position$/.test(track.name)) continue;
      if (!/hips/i.test(track.name)) continue;
      const values = track.values;
      if (values.length < 3) continue;
      const lockX = values[0];
      const lockZ = values[2];
      for (let i = 0; i < values.length; i += 3) {
        values[i] = lockX;
        values[i + 2] = lockZ;
      }
    }
    return cloned;
  }

  /**
   * Force visual hips/feet over fighter.root (shadow + hitboxes).
   * prone = knockdown/lose — plant by mesh AABB so body doesn't sink underground.
   */
  private alignModelToRoot(prone: boolean = false): void {
    if (!this.hipsBone) return;

    this.root.updateMatrixWorld(true);
    this.hipsBone.getWorldPosition(this._alignHips);
    this.root.worldToLocal(this._alignLocal.copy(this._alignHips));

    // Pull hips XZ onto root origin (where shadow blob lives)
    this.alignPivot.position.x -= this._alignLocal.x;
    this.alignPivot.position.z -= this._alignLocal.z;

    const clearance = this.visual?.groundClearance ?? 0.06;

    if (prone) {
      // Death/knockdown: feet plant digs character into floor — use whole-mesh floor
      this.root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(this.alignPivot);
      const minLocal = this.root.worldToLocal(box.min.clone());
      this.alignPivot.position.y -= minLocal.y - clearance;
      return;
    }

    // Standing: plant lowest toe on ground + clearance
    if (this.leftFootBone && this.rightFootBone) {
      this.root.updateMatrixWorld(true);
      this.leftFootBone.getWorldPosition(this._alignFootL);
      this.rightFootBone.getWorldPosition(this._alignFootR);
      const yL = this.root.worldToLocal(this._alignFootL).y;
      const yR = this.root.worldToLocal(this._alignFootR).y;
      this.alignPivot.position.y -= Math.min(yL, yR) - clearance;
    } else {
      this.alignPivot.position.y += clearance;
    }
  }

  private isKickMove(moveId: string): boolean {
    const id = moveId.toLowerCase();
    return (
      id.includes('hk') ||
      id.includes('lk') ||
      id.includes('kick') ||
      id.includes('stomp') ||
      id.includes('sweep') ||
      id.includes('slide') ||
      id.includes('launcher')
    );
  }

  /** Skinned model with fist/foot bones — use Tekken-style contact hits */
  public usesVisualStrikes(): boolean {
    return this.hasSkinnedAnims && !!(this.leftHandBone || this.rightHandBone || this.leftFootBone);
  }

  /** 0–1 progress through current attack clip */
  public getAttackClipProgress(): number {
    if (!this.activeClipName) return 0;
    const action = this.clipActions.get(this.activeClipName);
    if (!action) return 0;
    const dur = action.getClip().duration;
    if (dur <= 0) return 0;
    return Math.min(1, Math.max(0, action.time / dur));
  }

  private contactWindowForMove(moveId: string): { start: number; end: number } {
    const w = this.visual?.contactWindows;
    const fallback = w?.default ?? { start: 0.33, end: 0.7 };
    if (!w) return fallback;
    const id = moveId.toLowerCase();
    if (id.includes('special') || id.includes('super')) return w.special ?? fallback;
    if (id.includes('throw')) return w.throw ?? fallback;
    if (id.includes('c_hk') || id.includes('hk') || id.includes('launcher')) return w.hk ?? fallback;
    if (id.includes('lk') || id.includes('kick') || id.includes('stomp')) return w.lk ?? fallback;
    if (id.includes('hp') || id.includes('hook') || id.includes('haymaker')) return w.hp ?? fallback;
    if (id.includes('lp') || id.includes('jab')) return w.lp ?? fallback;
    return fallback;
  }

  /** True when attack clip is in the "fist/foot reaches out" window */
  public isInStrikeContactWindow(moveId: string): boolean {
    if (!this.usesVisualStrikes()) return true;
    const { start, end } = this.contactWindowForMove(moveId);
    const p = this.getAttackClipProgress();
    return p >= start && p <= end;
  }

  public getStrikeRadius(): number {
    return this.visual?.strikeRadius ?? 0.32;
  }

  /**
   * World-space strike points (2.5D: x,y) for fist/foot bones based on move.
   */
  public getStrikePoints2D(moveId: string): { x: number; y: number }[] {
    const bones = this.strikeBonesForMove(moveId);
    const out: { x: number; y: number }[] = [];
    for (const bone of bones) {
      if (!bone) continue;
      bone.getWorldPosition(this._strikeWorld);
      out.push({ x: this._strikeWorld.x, y: this._strikeWorld.y });
    }
    return out;
  }

  private strikeBonesForMove(moveId: string): (THREE.Object3D | null)[] {
    const id = moveId.toLowerCase();
    if (id.includes('special') || id.includes('super')) {
      return [this.rightHandBone, this.leftHandBone, this.rightFootBone, this.leftFootBone];
    }
    if (id.includes('throw')) {
      return [this.leftHandBone, this.rightHandBone];
    }
    if (
      id.includes('hk') ||
      id.includes('lk') ||
      id.includes('kick') ||
      id.includes('stomp') ||
      id.includes('sweep') ||
      id.includes('slide') ||
      id.includes('launcher')
    ) {
      return [
        this.rightToeBone ?? this.rightFootBone,
        this.leftToeBone ?? this.leftFootBone,
        this.rightFootBone,
        this.leftFootBone
      ];
    }
    // Punches / elbows / default — lead with both hands
    return [this.leftHandBone, this.rightHandBone];
  }

  /** Round start intro from visuals.introClip (bow). */
  public playIntro(): void {
    const intro = this.visual?.introClip;
    if (!this.hasSkinnedAnims || !intro || !this.clipActions.has(intro)) return;
    this.introPlaying = true;
    this.lastAttackClipKey = '';
    this.playClip(intro, false, true);
  }

  private playClip(name: string, loop: boolean, restart: boolean = false): void {
    if (!this.mixer) return;
    const resolved = this.resolveClipName(name);
    if (!resolved) return;
    const next = this.clipActions.get(resolved)!;
    const same = this.activeClipName === resolved && next.isRunning() && !restart;
    if (same) {
      next.paused = false;
      next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
      return;
    }
    const prev = this.activeClipName ? this.clipActions.get(this.activeClipName) : null;
    const fade = this.visual?.fadeSeconds ?? 0.25;
    next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.enabled = true;
    next.timeScale = 1;
    next.setEffectiveWeight(1);
    if (prev && prev !== next) {
      prev.setEffectiveWeight(1);
      next.play();
      next.crossFadeFrom(prev, fade, true);
    } else {
      next.fadeIn(fade * 0.5);
      next.play();
    }
    this.activeClipName = resolved;
  }

  private resolveClipName(preferred: string): string | null {
    if (this.clipActions.has(preferred)) return preferred;
    const idle = this.visual?.clips.idle;
    if (idle && this.clipActions.has(idle)) return idle;
    const first = this.clipActions.keys().next().value as string | undefined;
    return first ?? null;
  }

  private pickClipForState(
    state: FighterState,
    activeMoveId: string
  ): { name: string; loop: boolean } | null {
    if (this.clipActions.size === 0) return null;
    const c = this.visual?.clips;
    if (!c) return null;

    switch (state) {
      case 'IDLE':
        return { name: c.idle, loop: true };
      case 'WALK_FWD':
        return { name: c.walkFwd, loop: true };
      case 'DASH_FWD':
        return { name: c.dashFwd ?? c.walkFwd, loop: true };
      case 'WALK_BACK':
        return { name: c.walkBack, loop: true };
      case 'DASH_BACK':
        return { name: c.dashBack ?? c.walkBack, loop: false };
      case 'CROUCH_START':
      case 'CROUCHING':
        return { name: c.crouch, loop: true };
      case 'JUMP_START':
        return { name: c.jumpStart ?? c.jumpAir ?? c.idle, loop: false };
      case 'JUMPING':
        return { name: c.jumpAir ?? c.idle, loop: true };
      case 'JUMP_LAND':
        return { name: c.jumpLand ?? c.idle, loop: false };
      case 'BLOCK_STUN':
        return { name: c.block, loop: false };
      case 'HIT_STUN':
      case 'GUARD_CRUSH':
        return { name: c.hit, loop: false };
      case 'KNOCKDOWN':
        return { name: c.knockdown, loop: false };
      case 'GET_UP':
        return { name: c.getUp ?? c.jumpLand ?? c.idle, loop: false };
      case 'THROW_START':
      case 'BEING_THROWN':
      case 'THROW_WHIFF':
      case 'THROW_TECH':
        return { name: c.throw, loop: false };
      case 'SUPER_CINEMATIC':
        return { name: c.special, loop: false };
      case 'WIN':
        return { name: c.win, loop: true };
      case 'LOSE':
        return { name: c.lose, loop: false };
      case 'ATTACK':
        return { name: this.pickAttackClip(activeMoveId), loop: false };
      default:
        return { name: c.idle, loop: true };
    }
  }

  private pickAttackClip(moveId: string): string {
    const c = this.visual!.clips;
    const id = moveId.toLowerCase();
    if (id.includes('special') || id.includes('super')) return c.special;
    if (id.includes('throw')) return c.throw;
    if (id.includes('c_hk') || id.includes('sweep') || id.includes('slide')) {
      return c.crouchHk ?? c.hk;
    }
    if (id.includes('c_lp')) return c.crouchLp ?? c.lp;
    if (id.includes('hk') || id.includes('launcher') || id.includes('roundhouse')) return c.hk;
    if (id.includes('lk') || id.includes('kick') || id.includes('stomp')) return c.lk;
    if (id.includes('hp') || id.includes('hook') || id.includes('haymaker') || id.includes('elbow')) {
      return c.hp;
    }
    if (id.includes('j_')) return c.airAttack ?? c.lp;
    if (id.includes('lp') || id.includes('jab')) return c.lp;
    return c.lp;
  }

  private fitModelToFighterHeight(model: THREE.Object3D): void {
    const TARGET_HEIGHT = this.visual?.height ?? 1.85;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    if (size.y > 0.001) {
      model.scale.multiplyScalar(TARGET_HEIGHT / size.y);
    }
    model.updateMatrixWorld(true);
    box.setFromObject(model);
    const center = new THREE.Vector3();
    box.getCenter(center);
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;
  }

  private buildRig(): void {
    this.buildShadowOnly();

    // --- Hips / Pelvis ---
    const hipsGeo = new THREE.BoxGeometry(0.38, 0.22, 0.26);
    const hipsMesh = new THREE.Mesh(hipsGeo, this.pantsMat);
    hipsMesh.castShadow = true;
    this.hips.position.set(0, 0.95, 0);
    this.hips.add(hipsMesh);
    this.root.add(this.hips);

    // --- Torso ---
    const torsoGeo = new THREE.BoxGeometry(0.44, 0.52, 0.28);
    const torsoMesh = new THREE.Mesh(torsoGeo, this.jerseyMat);
    torsoMesh.position.set(0, 0.32, 0);
    torsoMesh.castShadow = true;

    // Jersey number badge
    const badgeGeo = new THREE.BoxGeometry(0.14, 0.14, 0.005);
    const badgeMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const badge = new THREE.Mesh(badgeGeo, badgeMat);
    badge.position.set(0.14, 0.32, 0.141);

    this.torso.position.set(0, 0.1, 0);
    this.torso.add(torsoMesh);
    this.torso.add(badge);
    this.hips.add(this.torso);

    // --- Head with helmet & protective grill ---
    const headGeo = new THREE.SphereGeometry(0.18, 12, 12);
    const headMesh = new THREE.Mesh(headGeo, this.skinMat);
    headMesh.position.set(0, 0.18, 0);
    headMesh.castShadow = true;

    // Helmet shell
    const helmetGeo = new THREE.SphereGeometry(0.19, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.65);
    const helmetMesh = new THREE.Mesh(helmetGeo, this.helmetMat);
    helmetMesh.position.set(0, 0.2, 0);
    helmetMesh.castShadow = true;

    // Visor peak
    const visorGeo = new THREE.BoxGeometry(0.24, 0.04, 0.15);
    const visorMesh = new THREE.Mesh(visorGeo, this.helmetMat);
    visorMesh.position.set(0.14, 0.22, 0);
    helmetMesh.add(visorMesh);

    // Face guard wire grill
    const grillMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 });
    for (let g = -1; g <= 1; g++) {
      const grillGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.22, 4);
      const bar = new THREE.Mesh(grillGeo, grillMat);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(0.16, 0.12 + g * 0.04, 0);
      helmetMesh.add(bar);
    }

    this.head.position.set(0, 0.6, 0);
    this.head.add(headMesh);
    this.head.add(helmetMesh);
    this.torso.add(this.head);

    // --- Arms — bare fist martial artists ---
    // Left arm = front arm (+Z)
    this.leftArm = this.buildArm();
    this.leftArm.position.set(0, 0.5, 0.24);
    this.torso.add(this.leftArm);

    // Right arm = rear arm (-Z)
    this.rightArm = this.buildArm();
    this.rightArm.position.set(0, 0.5, -0.24);
    this.torso.add(this.rightArm);

    // --- Legs ---
    // Left leg = front leg (+Z)
    this.leftLeg = this.buildLeg();
    this.leftLeg.position.set(0, 0, 0.12);
    this.hips.add(this.leftLeg);

    // Right leg = rear leg (-Z)
    this.rightLeg = this.buildLeg();
    this.rightLeg.position.set(0, 0, -0.12);
    this.hips.add(this.rightLeg);
  }

  private buildArm(): THREE.Group {
    const armGroup = new THREE.Group();

    // Bicep
    const bicepGeo = new THREE.CylinderGeometry(0.07, 0.065, 0.28, 8);
    const bicep = new THREE.Mesh(bicepGeo, this.jerseyMat);
    bicep.position.set(0, -0.14, 0);
    bicep.castShadow = true;
    armGroup.add(bicep);

    // Forearm
    const forearmGeo = new THREE.CylinderGeometry(0.06, 0.055, 0.26, 8);
    const forearm = new THREE.Mesh(forearmGeo, this.skinMat);
    forearm.position.set(0, -0.38, 0);
    forearm.castShadow = true;
    armGroup.add(forearm);

    // Fist knuckle wraps
    const fistGeo = new THREE.BoxGeometry(0.12, 0.11, 0.12);
    const fistMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.6 });
    const fist = new THREE.Mesh(fistGeo, fistMat);
    fist.position.set(0, -0.53, 0);
    fist.castShadow = true;
    armGroup.add(fist);

    return armGroup;
  }

  private buildLeg(): THREE.Group {
    const legGroup = new THREE.Group();

    // Thigh
    const thighGeo = new THREE.CylinderGeometry(0.09, 0.075, 0.44, 8);
    const thigh = new THREE.Mesh(thighGeo, this.pantsMat);
    thigh.position.set(0, -0.22, 0);
    thigh.castShadow = true;
    legGroup.add(thigh);

    // Shin
    const shinGeo = new THREE.CylinderGeometry(0.075, 0.065, 0.44, 8);
    const shin = new THREE.Mesh(shinGeo, this.pantsMat);
    shin.position.set(0, -0.66, 0);
    shin.castShadow = true;
    legGroup.add(shin);

    // Foot / Shoe
    const shoeGeo = new THREE.BoxGeometry(0.24, 0.1, 0.13);
    const shoe = new THREE.Mesh(shoeGeo, this.shoeMat);
    shoe.position.set(0.05, -0.92, 0);
    shoe.castShadow = true;
    legGroup.add(shoe);

    return legGroup;
  }

  /**
   * Procedural animation system synchronized to fighter state and frame data.
   * - facingRight = true  → root.rotation.y = +PI/2 → local +Z is World +X (opponent on RIGHT)
   * - facingRight = false → root.rotation.y = -PI/2 → local +Z is World -X (opponent on LEFT)
   * Therefore in BOTH cases:
   *   rotation.x < 0 moves limbs FORWARD TOWARDS OPPONENT!
   *   rotation.x > 0 moves limbs BACKWARD AWAY FROM OPPONENT!
   */
  public updateAnimation(
    state: FighterState,
    stateTimer: number,
    facingRight: boolean,
    moveProgress: number = 0,
    activeMoveId: string = '',
    dt: number = 0.016,
    fighterY: number = 0,
    moveDurationSec: number = 0,
    stateDurationSec: number = 0,
    reactNonce: number = 0
  ): void {
    this.animTimer += dt;
    const t = this.animTimer;

    // Face the correct direction
    this.root.rotation.set(0, facingRight ? Math.PI / 2 : -Math.PI / 2, 0);

    // Update Ground Shadow Blob
    if (this.shadowBlob) {
      const clampedY = Math.max(0, fighterY);
      const scale = Math.max(0.35, 1.0 - clampedY * 0.16);
      this.shadowBlob.scale.set(scale, scale, scale);
      this.shadowBlob.position.set(0, -clampedY + 0.012, 0);
      (this.shadowBlob.material as THREE.MeshBasicMaterial).opacity = Math.max(0.12, 0.55 - clampedY * 0.12);
    }

    if (this.useModel) {
      this.updateModelAnimation(
        state,
        stateTimer,
        moveProgress,
        activeMoveId,
        t,
        dt,
        moveDurationSec,
        stateDurationSec,
        reactNonce
      );
      return;
    }

    // Reset default transforms
    this.hips.position.y = 0.95;
    this.hips.position.x = 0;
    this.hips.position.z = 0;
    this.hips.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
    this.leftArm.rotation.set(0, 0, 0);
    this.rightArm.rotation.set(0, 0, 0);
    this.leftLeg.rotation.set(0, 0, 0);
    this.rightLeg.rotation.set(0, 0, 0);

    switch (state) {
      case 'IDLE': {
        // Natural athletic bounce — boxing guard stance with both fists raised forward
        const bounce = Math.sin(t * 4.0);
        this.hips.position.y = 0.95 + bounce * 0.015;
        this.torso.rotation.x = -0.06; // Slight forward combat crouch
        this.head.rotation.x = 0.06;

        // Front lead arm (+Z) — high guard protecting face
        this.leftArm.rotation.x = -0.85 + bounce * 0.04;
        this.leftArm.rotation.y = 0.2;
        this.leftArm.rotation.z = 0.2;

        // Rear arm (-Z) — tight chin guard
        this.rightArm.rotation.x = -0.75 + bounce * 0.04;
        this.rightArm.rotation.y = -0.2;
        this.rightArm.rotation.z = -0.2;

        // Staggered footwork — lead foot slightly forward, rear foot slightly back
        this.leftLeg.rotation.x = -0.15;
        this.rightLeg.rotation.x = 0.15;
        break;
      }

      case 'WALK_FWD': {
        const step = t * 8.0;
        const swing = Math.sin(step);
        this.hips.position.y = 0.95 + Math.abs(Math.sin(step)) * 0.035;
        this.torso.rotation.x = -0.12; // Forward momentum lean

        // Alternating stride
        this.leftLeg.rotation.x = swing * 0.5;
        this.rightLeg.rotation.x = -swing * 0.5;

        // Arm swing in guard
        this.leftArm.rotation.x = -0.7 + swing * 0.3;
        this.rightArm.rotation.x = -0.7 - swing * 0.3;
        break;
      }

      case 'WALK_BACK': {
        const step = t * 6.5;
        const swing = Math.sin(step);
        this.hips.position.y = 0.95 + Math.abs(Math.sin(step)) * 0.025;
        this.torso.rotation.x = 0.08; // Defensive upright posture

        this.leftLeg.rotation.x = -swing * 0.4;
        this.rightLeg.rotation.x = swing * 0.4;

        this.leftArm.rotation.x = -0.8;
        this.rightArm.rotation.x = -0.8;
        break;
      }

      case 'DASH_FWD': {
        // Deep sprint burst forward
        this.hips.position.y = 0.82;
        this.torso.rotation.x = -0.4; // Strong forward lean
        this.leftLeg.rotation.x = -0.8; // Lead leg driven forward
        this.rightLeg.rotation.x = 0.7; // Rear leg trailing back
        this.leftArm.rotation.x = -1.3;
        this.rightArm.rotation.x = 0.4;
        break;
      }

      case 'DASH_BACK': {
        // Quick evasive back-hop
        this.hips.position.y = 0.88;
        this.torso.rotation.x = 0.25; // Lean away from danger
        this.leftLeg.rotation.x = 0.5;
        this.rightLeg.rotation.x = -0.6;
        this.leftArm.rotation.x = -0.9;
        this.rightArm.rotation.x = -0.9;
        break;
      }

      case 'CROUCHING':
      case 'CROUCH_START': {
        // Low defensive crouch
        this.hips.position.y = 0.65;
        this.torso.rotation.x = -0.15;
        this.leftLeg.rotation.x = -0.6;
        this.rightLeg.rotation.x = 0.5;
        this.leftArm.rotation.x = -1.0;
        this.rightArm.rotation.x = -0.9;
        break;
      }

      case 'JUMPING':
      case 'JUMP_START': {
        // Airborne jump tuck
        this.hips.position.y = 0.95;
        this.torso.rotation.x = -0.15;
        this.leftLeg.rotation.x = -0.5;
        this.rightLeg.rotation.x = -0.3;
        this.leftArm.rotation.x = -1.2;
        this.rightArm.rotation.x = -0.8;
        break;
      }

      case 'BLOCK_STUN': {
        // Rigid defensive forearm shield absorbing the impact
        this.hips.position.y = 0.88;
        this.torso.rotation.x = 0.15; // Bracing backward
        this.leftArm.rotation.x = -1.35;
        this.leftArm.rotation.y = 0.3;
        this.rightArm.rotation.x = -1.30;
        this.rightArm.rotation.y = -0.3;
        this.leftLeg.rotation.x = -0.3;
        this.rightLeg.rotation.x = 0.4;
        break;
      }

      case 'HIT_STUN': {
        // Head and torso snap back from blow
        const recoil = Math.sin(stateTimer * 25.0) * 0.15;
        this.hips.position.y = 0.90;
        this.torso.rotation.x = 0.38 + recoil; // Snaps BACKWARD
        this.head.rotation.x = 0.3;
        this.leftArm.rotation.x = 0.3; // Flails back
        this.rightArm.rotation.x = 0.3;
        this.leftLeg.rotation.x = 0.2;
        break;
      }

      case 'KNOCKDOWN': {
        // Lying flat on the mat along the X fighting axis, head pointing away from opponent
        this.hips.position.y = 0.20;
        this.hips.rotation.x = -Math.PI / 2;
        this.torso.rotation.x = -0.05;
        this.leftLeg.rotation.x = -0.15;
        this.rightLeg.rotation.x = 0.15;
        this.leftArm.rotation.x = 0.2;
        this.rightArm.rotation.x = 0.2;
        break;
      }

      case 'GET_UP': {
        // Rising from the canvas back into combat stance
        const p = Math.min(1.0, stateTimer * 3.5);
        this.hips.position.y = 0.20 + p * 0.75;
        this.hips.rotation.x = (-Math.PI / 2) * (1.0 - p);
        this.leftArm.rotation.x = -0.8 * p;
        this.rightArm.rotation.x = -0.7 * p;
        break;
      }

      case 'ATTACK': {
        this.animateAttack(activeMoveId, moveProgress);
        break;
      }

      case 'SUPER_CINEMATIC': {
        // Dramatic energy gathering stance
        this.hips.position.y = 1.05;
        this.torso.rotation.x = 0.2;
        this.leftArm.rotation.x = -1.8;
        this.rightArm.rotation.x = -1.8;
        break;
      }

      case 'GUARD_CRUSH': {
        // Stunned backwards, guard broken, completely open
        const wobble = Math.sin(t * 12.0) * 0.06;
        this.hips.position.y = 0.88;
        this.torso.rotation.x = 0.25 + wobble;
        this.head.rotation.x = 0.35;
        this.leftArm.rotation.x = 0.3;
        this.rightArm.rotation.x = 0.3;
        break;
      }

      case 'THROW_WHIFF': {
        // Failed grab forward, off-balance
        this.torso.rotation.x = -0.35;
        this.leftArm.rotation.x = -1.2;
        this.rightArm.rotation.x = -1.2;
        this.hips.position.y = 0.88;
        break;
      }

      case 'THROW_TECH': {
        // Tech separation push
        this.torso.rotation.x = 0.15;
        this.leftArm.rotation.x = -0.8;
        this.rightArm.rotation.x = -0.8;
        break;
      }

      case 'WIN': {
        // Dual fist pump victory
        this.hips.position.y = 1.0;
        this.leftArm.rotation.x = -2.6; // Skyward
        this.rightArm.rotation.x = -2.6;
        break;
      }

      case 'LOSE': {
        // Collapsed on the ground in defeat
        this.hips.position.y = 0.22;
        this.hips.rotation.x = -Math.PI / 2 * 0.8;
        this.torso.rotation.x = -0.3;
        this.head.rotation.x = -0.3;
        this.leftArm.rotation.x = 0.2;
        this.rightArm.rotation.x = 0.2;
        break;
      }
    }
  }

  /**
   * Procedural attack kinematics:
   * In our rig, rotation.x < 0 swings limbs forward towards the opponent.
   * - Left limbs are lead/front (closer to opponent)
   * - Right limbs are rear/power (further from opponent)
   */
  private animateAttack(moveId: string, progress: number): void {
    const p = Math.sin(progress * Math.PI);

    if (moveId.includes('jump') || moveId.includes('j_')) {
      // --- Aerial Downward Strike ---
      this.torso.rotation.x = -p * 0.35;
      this.leftArm.rotation.x = -0.6 - p * 1.6;
      this.rightArm.rotation.x = -0.5 - p * 1.5;
      this.leftLeg.rotation.x = -0.4;
      this.rightLeg.rotation.x = 0.3;
    } else if (moveId.includes('lp') || moveId.includes('jab')) {
      // --- Fast Lead Jab (Front Arm) ---
      // Front arm punches straight forward towards opponent!
      this.torso.rotation.x = -p * 0.15; // Lean into punch
      this.leftArm.rotation.x = -0.5 - p * 1.5; // Extends straight forward (up to -2.0 rad)
      this.rightArm.rotation.x = -0.7; // Rear hand stays glued to chin
      this.leftLeg.rotation.x = -0.2;
      this.rightLeg.rotation.x = 0.2;
    } else if (moveId.includes('hp') || moveId.includes('cross') || moveId.includes('power') || moveId.includes('elbow')) {
      // --- Heavy Cross / Power Elbow (Rear Arm) ---
      // Rear shoulder and hip torque forward, driving rear fist straight through target
      this.torso.rotation.y = p * 0.6; // Torso rotates to bring rear side forward
      this.torso.rotation.x = -p * 0.25; // Forward step-in
      this.rightArm.rotation.x = -0.4 - p * 1.8; // Rear arm punches forward with full extension!
      this.leftArm.rotation.x = -0.6; // Front arm stays up in guard
      this.hips.position.y = 0.95 - p * 0.05;
    } else if (moveId.includes('lk') || (moveId.includes('kick') && !moveId.includes('hk') && !moveId.includes('c_hk'))) {
      // --- Lead Front Snap Kick (Front Leg) ---
      // Front leg snaps straight forward and upward directly into opponent's midsection!
      this.torso.rotation.x = p * 0.15; // Lean back slightly for balance
      this.leftLeg.rotation.x = -p * 1.7; // Front leg snaps FORWARD towards opponent!
      this.rightLeg.rotation.x = 0.15; // Rear leg stays planted
      this.hips.position.y = 0.95 + p * 0.04;
      this.leftArm.rotation.x = -0.7;
      this.rightArm.rotation.x = -0.8;
    } else if (moveId.includes('hk') || moveId.includes('roundhouse') || moveId.includes('launcher')) {
      // --- High Roundhouse / Launcher Kick (Rear Leg) ---
      // Rear leg whips forward in a devastating high arc towards opponent's head!
      this.torso.rotation.y = p * 0.55; // Hip rotation into kick
      this.torso.rotation.x = -p * 0.1;
      this.rightLeg.rotation.x = -p * 2.2; // Rear leg kicks HIGH FORWARD towards opponent!
      this.leftLeg.rotation.x = 0.1; // Planted lead foot
      this.hips.position.y = 0.95 + p * 0.08;
      this.rightArm.rotation.x = 0.4; // Counter-balance swing
      this.leftArm.rotation.x = -1.1; // Guard high
    } else if (moveId.includes('crouch_hk') || moveId.includes('c_hk') || moveId.includes('sweep') || moveId.includes('slide')) {
      // --- Low Slide / Shin Sweep ---
      // Deep crouch with lead leg sweeping forward along the ground
      this.hips.position.y = 0.55 - p * 0.1;
      this.torso.rotation.x = -0.2;
      this.leftLeg.rotation.x = -p * 1.6; // Sweeps low forward along the mat!
      this.rightLeg.rotation.x = 0.5; // Planted bent crouch leg
      this.leftArm.rotation.x = -0.9;
    } else if (moveId.includes('crouch_lp') || moveId.includes('c_lp')) {
      // --- Low Crouch Jab ---
      this.hips.position.y = 0.65;
      this.leftArm.rotation.x = -0.6 - p * 1.3; // Low punch forward
      this.rightArm.rotation.x = -0.7;
    } else if (moveId.includes('throw')) {
      // --- Close Grab & Takedown ---
      this.torso.rotation.x = -p * 0.3;
      this.leftArm.rotation.x = -1.4; // Both arms reach forward to clinch
      this.rightArm.rotation.x = -1.4;
    } else if (moveId.includes('special') || moveId.includes('super')) {
      // --- Flying Strike / Ultimate Assault ---
      // Lunging forward double strike / flying knee
      this.hips.position.y = 0.95 + p * 0.25; // Leaping off the canvas
      this.torso.rotation.x = -p * 0.35;
      this.leftArm.rotation.x = -0.8 - p * 1.4;
      this.rightArm.rotation.x = -0.6 - p * 1.5;
      this.leftLeg.rotation.x = -p * 1.4; // Flying knee forward
      this.rightLeg.rotation.x = 0.4;
    } else {
      // Generic forward strike
      this.torso.rotation.x = -p * 0.15;
      this.leftArm.rotation.x = -0.5 - p * 1.4;
    }
  }

  /**
   * Rigged GLB → AnimationMixer.
   * Attacks play near natural clip speed (see visuals.attackAnimSpeed).
   * After frame-data ends, clip keeps playing until finished so kicks aren't cut.
   */
  private updateModelAnimation(
    state: FighterState,
    stateTimer: number,
    moveProgress: number,
    activeMoveId: string,
    t: number,
    dt: number,
    moveDurationSec: number = 0,
    stateDurationSec: number = 0,
    reactNonce: number = 0
  ): void {
    if (!this.modelReady) return;

    if (this.hasSkinnedAnims && this.mixer) {
      const punchSpeed = this.visual?.attackAnimSpeed ?? 0.85;
      const kickSpeed = this.visual?.kickAnimSpeed ?? 1.25;
      const reactSpeed = this.visual?.reactAnimSpeed ?? 0.9;
      const attackSpeedFor = (moveId: string) =>
        this.isKickMove(moveId) ? kickSpeed : punchSpeed;
      const prone = state === 'KNOCKDOWN' || state === 'LOSE';

      // Intro bow locks out other clips until finished (or fight input starts mid-bow)
      if (this.introPlaying) {
        if (state !== 'IDLE' && state !== 'WIN' && state !== 'LOSE') {
          this.introPlaying = false;
        } else {
          this.mixer.update(dt);
          this.alignModelToRoot(false);
          return;
        }
      }

      // Finish punch/kick at natural speed even after move → IDLE
      if (this.holdingAttackClip && state !== 'ATTACK') {
        const interrupt =
          state === 'HIT_STUN' ||
          state === 'BLOCK_STUN' ||
          state === 'GUARD_CRUSH' ||
          state === 'KNOCKDOWN' ||
          state === 'LOSE' ||
          state === 'JUMP_START' ||
          state === 'JUMPING' ||
          state === 'DASH_FWD' ||
          state === 'DASH_BACK';
        const held = this.clipActions.get(this.heldAttackClipName);
        const stillGoing =
          !!held &&
          held.isRunning() &&
          held.time < held.getClip().duration - 0.03;

        if (!interrupt && stillGoing) {
          held!.timeScale = this.heldAttackWasKick ? kickSpeed : punchSpeed;
          this.mixer.update(dt);
          this.alignModelToRoot(false);
          return;
        }
        this.holdingAttackClip = false;
        this.heldAttackClipName = '';
        this.heldAttackWasKick = false;
      }

      const pick = this.pickClipForState(state, activeMoveId);
      if (pick) {
        let restart = false;
        if (state === 'ATTACK') {
          const key = activeMoveId || pick.name;
          restart = key !== this.lastAttackClipKey;
          this.lastAttackClipKey = key;
          this.lastReactKey = '';
          this.holdingAttackClip = true;
          this.heldAttackWasKick = this.isKickMove(activeMoveId);
        } else if (
          state === 'HIT_STUN' ||
          state === 'BLOCK_STUN' ||
          state === 'GUARD_CRUSH' ||
          state === 'KNOCKDOWN' ||
          state === 'LOSE'
        ) {
          const reactId = `${state}:${pick.name}:${reactNonce}`;
          restart = this.lastReactKey !== reactId;
          this.lastReactKey = reactId;
          this.lastAttackClipKey = '';
          this.holdingAttackClip = false;
          this.heldAttackWasKick = false;
        } else {
          this.lastAttackClipKey = '';
          this.lastReactKey = '';
          restart = false;
        }

        this.playClip(pick.name, pick.loop, restart);
        if (state === 'ATTACK') {
          this.heldAttackClipName = this.activeClipName;
        }

        const action = this.clipActions.get(this.activeClipName);
        if (action) {
          const clipDur = Math.max(0.05, action.getClip().duration);
          if (state === 'ATTACK') {
            action.timeScale = attackSpeedFor(activeMoveId);
          } else if (
            state === 'HIT_STUN' ||
            state === 'BLOCK_STUN' ||
            state === 'GUARD_CRUSH'
          ) {
            if (stateDurationSec > 0.05) {
              const fit = clipDur / stateDurationSec;
              action.timeScale = Math.min(1.15, Math.max(0.7, fit)) * reactSpeed;
            } else {
              action.timeScale = reactSpeed;
            }
          } else if (state === 'WALK_FWD' || state === 'DASH_FWD') {
            action.timeScale = 1.05;
          } else if (state === 'WALK_BACK') {
            action.timeScale = 0.9;
          } else {
            action.timeScale = 1.0;
          }
        }
      }

      this.mixer.update(dt);
      this.alignModelToRoot(prone);
      return;
    }

    // Static mesh fallback (old Rohit scan)
    const p = this.modelPivot;
    p.position.set(0, 0, 0);
    p.rotation.set(0, 0, 0);
    p.scale.set(1, 1, 1);

    switch (state) {
      case 'IDLE': {
        p.position.y = Math.sin(t * 4.0) * 0.02;
        p.rotation.x = -0.04;
        break;
      }
      case 'WALK_FWD': {
        p.position.y = Math.abs(Math.sin(t * 8.0)) * 0.04;
        p.rotation.x = -0.12;
        break;
      }
      case 'WALK_BACK': {
        p.position.y = Math.abs(Math.sin(t * 6.5)) * 0.03;
        p.rotation.x = 0.06;
        break;
      }
      case 'CROUCH_START':
      case 'CROUCHING': {
        p.scale.y = 0.78;
        p.position.y = -0.2;
        break;
      }
      case 'ATTACK': {
        const swing = Math.sin(moveProgress * Math.PI);
        p.rotation.x = -swing * 0.28;
        break;
      }
      case 'HIT_STUN': {
        p.rotation.x = 0.25;
        break;
      }
      case 'KNOCKDOWN':
      case 'LOSE': {
        p.rotation.x = -Math.PI / 2 * 0.85;
        p.position.y = 0.15;
        break;
      }
      case 'GET_UP': {
        const rise = Math.min(1, stateTimer * 3.5);
        p.rotation.x = (-Math.PI / 2) * (1 - rise);
        break;
      }
      default:
        break;
    }
  }

  public setFlashColor(color: number | null): void {
    if (this.useModel) {
      for (const mat of this.modelMaterials) {
        mat.emissive.setHex(color !== null ? color : 0x000000);
      }
      return;
    }
    if (color !== null) {
      this.jerseyMat.emissive.setHex(color);
      this.pantsMat.emissive.setHex(color);
    } else {
      this.jerseyMat.emissive.setHex(0x000000);
      this.pantsMat.emissive.setHex(0x000000);
    }
  }
}
