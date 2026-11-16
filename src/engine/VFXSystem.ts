import * as THREE from 'three';

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  scaleGrowth: number;
}

export class VFXSystem {
  private scene: THREE.Scene;
  private particleGroup: THREE.Group = new THREE.Group();
  private activeParticles: Particle[] = [];

  // Hit-stop frames remaining (stops physics/anim updates for impactful hits)
  private hitstopFrames: number = 0;

  // Flash plane overlay for Super activation or heavy hits
  private flashMesh: THREE.Mesh;
  private flashAlpha: number = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.scene.add(this.particleGroup);

    // Fullscreen quad for flashes
    const flashGeo = new THREE.PlaneGeometry(50, 50);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthTest: false
    });
    this.flashMesh = new THREE.Mesh(flashGeo, flashMat);
    this.flashMesh.position.set(0, 0, 5);
    this.flashMesh.renderOrder = 999;
    this.scene.add(this.flashMesh);
  }

  public setHitstop(frames: number): void {
    this.hitstopFrames = Math.max(this.hitstopFrames, frames);
  }

  public tickHitstop(): boolean {
    if (this.hitstopFrames > 0) {
      this.hitstopFrames--;
      return true; // Game should freeze this frame
    }
    return false; // Proceed normally
  }

  public isHitstopActive(): boolean {
    return this.hitstopFrames > 0;
  }

  // --- IMPACT SPARKS ---

  public spawnHitSparks(
    x: number,
    y: number,
    type: 'light' | 'heavy' | 'bat' | 'block' | 'super' = 'light'
  ): void {
    const count = type === 'super' ? 32 : type === 'heavy' || type === 'bat' ? 18 : 8;
    const baseColor =
      type === 'block' ? 0x60a5fa : // Blue for block
      type === 'bat' ? 0xf59e0b :   // Gold sparks for bat
      type === 'super' ? 0xef4444 : // Red fire for super
      0xfacc15;                    // Yellow for normals

    const sparkGeo = new THREE.SphereGeometry(type === 'heavy' ? 0.08 : 0.05, 4, 4);

    for (let i = 0; i < count; i++) {
      const sparkMat = new THREE.MeshBasicMaterial({
        color: baseColor,
        transparent: true,
        opacity: 1.0
      });
      const sparkMesh = new THREE.Mesh(sparkGeo, sparkMat);
      sparkMesh.position.set(x, y, (Math.random() - 0.5) * 0.4);

      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * (type === 'heavy' ? 6 : 4);
      const vel = new THREE.Vector3(
        Math.cos(angle) * speed,
        Math.sin(angle) * speed + 1.5,
        (Math.random() - 0.5) * 1.5
      );

      const life = 0.15 + Math.random() * 0.25;

      this.particleGroup.add(sparkMesh);
      this.activeParticles.push({
        mesh: sparkMesh,
        velocity: vel,
        life: life,
        maxLife: life,
        scaleGrowth: -0.6
      });
    }

    // Trigger hit flash
    if (type === 'heavy' || type === 'bat') {
      this.triggerScreenFlash(0.3, 0.08);
    } else if (type === 'super') {
      this.triggerScreenFlash(0.7, 0.2);
    }
  }

  // --- DUST PUFFS ---

  public spawnDustPuff(x: number, y: number, facingRight: boolean): void {
    const count = 6;
    const dustGeo = new THREE.SphereGeometry(0.12, 6, 6);

    for (let i = 0; i < count; i++) {
      const dustMat = new THREE.MeshBasicMaterial({
        color: 0x94a3b8,
        transparent: true,
        opacity: 0.5
      });
      const mesh = new THREE.Mesh(dustGeo, dustMat);
      mesh.position.set(x + (Math.random() - 0.5) * 0.2, y + 0.1, 0);

      const velX = (facingRight ? -1 : 1) * (1.2 + Math.random() * 1.5);
      const velY = 0.5 + Math.random() * 0.8;

      const life = 0.25 + Math.random() * 0.2;

      this.particleGroup.add(mesh);
      this.activeParticles.push({
        mesh: mesh,
        velocity: new THREE.Vector3(velX, velY, 0),
        life: life,
        maxLife: life,
        scaleGrowth: 0.8
      });
    }
  }

  // --- SCREEN FLASH ---

  public triggerScreenFlash(opacity: number = 0.5, _duration: number = 0.1): void {
    this.flashAlpha = opacity;
    (this.flashMesh.material as THREE.MeshBasicMaterial).opacity = this.flashAlpha;
  }

  // --- UPDATE PARTICLES ---

  public update(dt: number): void {
    // Decay screen flash
    if (this.flashAlpha > 0) {
      this.flashAlpha = Math.max(0, this.flashAlpha - dt * 6.0);
      (this.flashMesh.material as THREE.MeshBasicMaterial).opacity = this.flashAlpha;
    }

    // Update active particles
    for (let i = this.activeParticles.length - 1; i >= 0; i--) {
      const p = this.activeParticles[i];
      p.life -= dt;

      if (p.life <= 0) {
        this.particleGroup.remove(p.mesh);
        p.mesh.geometry.dispose();
        if (Array.isArray(p.mesh.material)) {
          p.mesh.material.forEach(m => m.dispose());
        } else {
          p.mesh.material.dispose();
        }
        this.activeParticles.splice(i, 1);
        continue;
      }

      // Physics
      p.velocity.y -= 9.8 * dt; // gravity
      p.mesh.position.addScaledVector(p.velocity, dt);

      // Opacity fade
      const progress = p.life / p.maxLife;
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = progress;

      // Scale
      const scale = Math.max(0.01, 1 + (1 - progress) * p.scaleGrowth);
      p.mesh.scale.set(scale, scale, scale);
    }
  }
}

