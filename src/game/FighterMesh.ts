import * as THREE from 'three';
import { CharacterProfile, FighterState } from './types';

/**
 * FighterMesh — procedural humanoid rig for Cricket Clash fighters.
 * High-quality human martial arts aesthetic (bare fists, kicks, elbows).
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

  // Mesh materials
  private jerseyMat: THREE.MeshStandardMaterial;
  private pantsMat: THREE.MeshStandardMaterial;
  private skinMat: THREE.MeshStandardMaterial;
  private helmetMat: THREE.MeshStandardMaterial;
  private shoeMat: THREE.MeshStandardMaterial;

  private animTimer: number = 0;

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

    this.buildRig();
  }

  private buildRig(): void {
    this.root.castShadow = true;
    this.root.receiveShadow = true;

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
    dt: number = 0.016
  ): void {
    this.animTimer += dt;
    const t = this.animTimer;

    // Face the correct direction
    this.root.rotation.y = facingRight ? Math.PI / 2 : -Math.PI / 2;

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
        // Lying flat on ground
        this.root.rotation.x = -Math.PI / 2;
        this.hips.position.y = 0.18;
        break;
      }

      case 'GET_UP': {
        // Rolling back up to stance
        const p = Math.min(1, stateTimer * 4.0);
        this.root.rotation.x = (-Math.PI / 2) * (1 - p);
        this.hips.position.y = 0.18 + p * 0.77;
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

      case 'WIN': {
        // Dual fist pump victory
        this.hips.position.y = 1.0;
        this.leftArm.rotation.x = -2.6; // Skyward
        this.rightArm.rotation.x = -2.6;
        break;
      }

      case 'LOSE': {
        // Slumped in defeat
        this.hips.position.y = 0.78;
        this.torso.rotation.x = -0.45;
        this.head.rotation.x = -0.4;
        this.leftArm.rotation.x = 0.1;
        this.rightArm.rotation.x = 0.1;
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

    if (moveId.includes('lp') || moveId.includes('jab')) {
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

  public setFlashColor(color: number | null): void {
    if (color !== null) {
      this.jerseyMat.emissive.setHex(color);
      this.pantsMat.emissive.setHex(color);
    } else {
      this.jerseyMat.emissive.setHex(0x000000);
      this.pantsMat.emissive.setHex(0x000000);
    }
  }
}
