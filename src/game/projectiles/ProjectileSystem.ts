import * as THREE from "three";
import { ProjectileDef, ProjectileSimState, Box2D } from "../types";
import { Fighter } from "../Fighter";

export class ProjectileSystem {
  public projectiles: ProjectileSimState[] = [];
  private scene?: THREE.Scene;
  private visualMeshes: Map<string, THREE.Mesh> = new Map();
  private sphereGeo?: THREE.SphereGeometry;
  private ballMat?: THREE.MeshStandardMaterial;
  private nextProjectileId: number = 1;

  constructor(scene?: THREE.Scene) {
    this.scene = scene;
    if (this.scene) {
      this.sphereGeo = new THREE.SphereGeometry(0.16, 12, 12);
      this.ballMat = new THREE.MeshStandardMaterial({
        color: 0xef4444, // Leather cricket red
        roughness: 0.4,
        metalness: 0.2,
        emissive: 0x7f1d1d,
        emissiveIntensity: 0.3,
      });
    }
  }

  /**
   * Spawn a projectile. Enforces rule: max 1 active projectile per fighter.
   */
  public spawn(owner: Fighter, def: ProjectileDef): boolean {
    const ownerId = owner.playerIndex;
    // Check if owner already has an active projectile
    const hasActive = this.projectiles.some(
      (p) => p.isActive && p.ownerId === ownerId,
    );
    if (hasActive) {
      return false; // Max 1 active projectile on screen per fighter
    }

    const dir = owner.facingRight ? 1 : -1;
    const spawnX = owner.x + dir * 0.6;
    const spawnY = Math.max(0.2, owner.y + (def.hitbox.yOffset ?? 0.8));

    const simState: ProjectileSimState = {
      id: `${def.id}_${ownerId}_${this.nextProjectileId++}`,
      ownerId,
      x: spawnX,
      y: spawnY,
      vx: dir * def.speed,
      vy: def.vy ?? 0,
      gravity: def.gravity ?? 0,
      life: def.life,
      maxLife: def.life,
      facingRight: owner.facingRight,
      priority: def.priority,
      isActive: true,
      hasHit: false,
      def,
    };

    this.projectiles.push(simState);

    // Create visual mesh if scene exists
    if (this.scene && this.sphereGeo && this.ballMat) {
      const mesh = new THREE.Mesh(this.sphereGeo, this.ballMat);
      mesh.position.set(spawnX, spawnY, 0);
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.visualMeshes.set(simState.id, mesh);
    }

    return true;
  }

  /**
   * Update all projectiles for 1 simulation frame (1/60s).
   */
  public update(dt: number, p1: Fighter, p2: Fighter): void {
    // 1. Advance physics & lifetime
    for (const p of this.projectiles) {
      if (!p.isActive) continue;

      p.life--;
      if (p.life <= 0) {
        p.isActive = false;
        continue;
      }

      p.x += p.vx;
      p.y += p.vy;
      p.vy -= p.gravity;

      // Special behaviors
      if (p.def.behavior === "ground") {
        p.y = 0.15; // hugs ground
      } else if (p.def.behavior === "zigzag") {
        // Curve shift at half-life (Carrom Ball)
        if (p.life === Math.floor(p.maxLife * 0.5)) {
          p.vx = -p.vx * 0.4; // feint direction hitch
          p.vy = 0.08;
        }
      }

      // Despawn bounds
      if (Math.abs(p.x) > 13.0 || p.y < -0.2) {
        p.isActive = false;
      }
    }

    // 2. Projectile vs Projectile Clash
    this.resolveClashes();

    // 3. Projectile vs Fighter Collision
    for (const p of this.projectiles) {
      if (!p.isActive) continue;

      const defender = p.ownerId === 1 ? p2 : p1;
      const attacker = p.ownerId === 1 ? p1 : p2;

      if (this.checkFighterOverlap(p, defender)) {
        p.hasHit = true;
        this.applyHitToDefender(p, attacker, defender);

        if (p.def.destroyOnHit) {
          p.isActive = false;
        }
      }
    }

    // 4. Update visual meshes & cleanup dead ones
    this.syncVisuals();
  }

  /**
   * Resolve clashes between P1 and P2 projectiles.
   * Higher priority wins; equal priority destroys both.
   */
  private resolveClashes(): void {
    const p1Projectiles = this.projectiles.filter(
      (p) => p.isActive && p.ownerId === 1,
    );
    const p2Projectiles = this.projectiles.filter(
      (p) => p.isActive && p.ownerId === 2,
    );

    for (const proj1 of p1Projectiles) {
      for (const proj2 of p2Projectiles) {
        if (!proj1.isActive || !proj2.isActive) continue;

        if (this.checkProjectileOverlap(proj1, proj2)) {
          if (proj1.priority > proj2.priority) {
            proj2.isActive = false;
          } else if (proj2.priority > proj1.priority) {
            proj1.isActive = false;
          } else {
            // Equal priority cancels both!
            proj1.isActive = false;
            proj2.isActive = false;
          }
        }
      }
    }
  }

  private checkProjectileOverlap(
    a: ProjectileSimState,
    b: ProjectileSimState,
  ): boolean {
    const halfWa = a.def.hitbox.w * 0.5;
    const halfHa = a.def.hitbox.h * 0.5;
    const halfWb = b.def.hitbox.w * 0.5;
    const halfHb = b.def.hitbox.h * 0.5;

    return (
      Math.abs(a.x - b.x) < halfWa + halfWb &&
      Math.abs(a.y - b.y) < halfHa + halfHb
    );
  }

  private checkFighterOverlap(
    p: ProjectileSimState,
    defender: Fighter,
  ): boolean {
    const hurt = defender.getHurtbox();
    const hurtMinX =
      defender.x + (defender.facingRight ? hurt.x : -hurt.x - hurt.w);
    const hurtMaxX = hurtMinX + hurt.w;
    const hurtMinY = defender.y + hurt.y;
    const hurtMaxY = hurtMinY + hurt.h;

    const projMinX = p.x - p.def.hitbox.w * 0.5;
    const projMaxX = p.x + p.def.hitbox.w * 0.5;
    const projMinY = p.y - p.def.hitbox.h * 0.5;
    const projMaxY = p.y + p.def.hitbox.h * 0.5;

    return (
      projMinX < hurtMaxX &&
      projMaxX > hurtMinX &&
      projMinY < hurtMaxY &&
      projMaxY > hurtMinY
    );
  }

  private applyHitToDefender(
    p: ProjectileSimState,
    attacker: Fighter,
    defender: Fighter,
  ): void {
    // Projectiles act as simulated moves
    const pseudoMove = {
      id: p.def.id,
      name: p.def.name,
      input: "",
      startup: 0,
      active: 1,
      recovery: 0,
      damage: p.def.damage,
      chipDamage: p.def.chipDamage,
      guardDamage: p.def.guardDamage ?? 15,
      hitLevel: p.def.hitLevel,
      onHitFrameAdvantage: 2,
      onBlockFrameAdvantage: -2,
      hitstop: p.def.hitstop,
      knockback: p.def.knockback,
      meterGain: p.def.meterGain,
    };

    defender.takeHit(attacker, pseudoMove, false);
  }

  private syncVisuals(): void {
    // Clean dead meshes
    for (const [id, mesh] of this.visualMeshes.entries()) {
      const proj = this.projectiles.find((p) => p.id === id);
      if (!proj || !proj.isActive) {
        if (this.scene) this.scene.remove(mesh);
        this.visualMeshes.delete(id);
      }
    }

    // Update active meshes
    for (const p of this.projectiles) {
      if (!p.isActive) continue;
      const mesh = this.visualMeshes.get(p.id);
      if (mesh) {
        mesh.position.set(p.x, p.y, 0);
      }
    }

    // Prune dead projectile states from array
    this.projectiles = this.projectiles.filter((p) => p.isActive);
  }

  public clear(): void {
    if (this.scene) {
      for (const mesh of this.visualMeshes.values()) {
        this.scene.remove(mesh);
      }
    }
    this.visualMeshes.clear();
    this.projectiles = [];
  }

  public toSimState(): ProjectileSimState[] {
    return this.projectiles.map((p) => ({ ...p }));
  }

  public loadSimState(states: ProjectileSimState[]): void {
    this.clear();
    this.projectiles = states.map((s) => ({ ...s }));
    if (this.scene && this.sphereGeo && this.ballMat) {
      for (const p of this.projectiles) {
        if (!p.isActive) continue;
        const mesh = new THREE.Mesh(this.sphereGeo, this.ballMat);
        mesh.position.set(p.x, p.y, 0);
        this.scene.add(mesh);
        this.visualMeshes.set(p.id, mesh);
      }
    }
  }
}
