import * as THREE from 'three';
import { Box2D } from '../game/types';

export interface WorldBox2D {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export class HitboxSystem {
  private debugGroup: THREE.Group = new THREE.Group();
  private isDebugVisible: boolean = true; // ON while tuning hits — press H to toggle
  private debugMeshes: THREE.Object3D[] = [];

  constructor(scene: THREE.Scene) {
    scene.add(this.debugGroup);
    this.debugGroup.visible = this.isDebugVisible;
  }

  public setDebugVisible(visible: boolean): void {
    this.isDebugVisible = visible;
    this.debugGroup.visible = visible;
  }

  public toggleDebug(): boolean {
    this.setDebugVisible(!this.isDebugVisible);
    return this.isDebugVisible;
  }

  /**
   * Converts local Box2D (offset from fighter root) into 2.5D World coordinates
   */
  public toWorldBox(box: Box2D, rootX: number, rootY: number, facingRight: boolean): WorldBox2D {
    const xMin = facingRight ? rootX + box.x : rootX - box.x - box.w;
    const xMax = xMin + box.w;
    const yMin = rootY + box.y;
    const yMax = yMin + box.h;

    return { minX: xMin, maxX: xMax, minY: yMin, maxY: yMax };
  }

  /**
   * Checks if two 2D AABB boxes intersect
   */
  public checkOverlap(a: WorldBox2D, b: WorldBox2D): boolean {
    return (
      a.minX < b.maxX &&
      a.maxX > b.minX &&
      a.minY < b.maxY &&
      a.maxY > b.minY
    );
  }

  /** Circle (strike fist/foot) vs hurtbox AABB — Tekken-style contact */
  public pointHitsBox(
    x: number,
    y: number,
    radius: number,
    box: WorldBox2D
  ): boolean {
    const cx = Math.max(box.minX, Math.min(x, box.maxX));
    const cy = Math.max(box.minY, Math.min(y, box.maxY));
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= radius * radius;
  }

  public get isDebugOn(): boolean {
    return this.isDebugVisible;
  }

  /**
   * Calculates push resolution between two pushboxes
   * Returns shift to apply to fighter 1 and fighter 2
   */
  public resolvePush(
    p1Box: WorldBox2D,
    p2Box: WorldBox2D
  ): { p1Shift: number; p2Shift: number } {
    if (!this.checkOverlap(p1Box, p2Box)) {
      return { p1Shift: 0, p2Shift: 0 };
    }

    const p1Center = (p1Box.minX + p1Box.maxX) * 0.5;
    const p2Center = (p2Box.minX + p2Box.maxX) * 0.5;

    let overlap = 0;
    if (p1Center < p2Center) {
      overlap = p1Box.maxX - p2Box.minX;
      return { p1Shift: -overlap * 0.5, p2Shift: overlap * 0.5 };
    } else {
      overlap = p2Box.maxX - p1Box.minX;
      return { p1Shift: overlap * 0.5, p2Shift: -overlap * 0.5 };
    }
  }

  /**
   * Render translucent + wireframe debug boxes (hurt/hit/push).
   * Press H in-game to toggle.
   */
  public updateDebugBoxes(
    boxes: { box: WorldBox2D; type: 'hit' | 'hurt' | 'push' | 'throw' }[]
  ): void {
    // Always clear so leftover boxes don't stick when toggled off
    while (this.debugMeshes.length > 0) {
      const mesh = this.debugMeshes.pop();
      if (!mesh) continue;
      this.debugGroup.remove(mesh);
      mesh.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
    }

    if (!this.isDebugVisible) return;

    const colors: Record<string, number> = {
      hit: 0xef4444,    // Red = active attack
      hurt: 0x22c55e,   // Green = body hurtbox
      push: 0x3b82f6,   // Blue = pushbox
      throw: 0xeab308   // Yellow = throw
    };

    boxes.forEach((item) => {
      const b = item.box;
      const w = Math.max(0.05, b.maxX - b.minX);
      const h = Math.max(0.05, b.maxY - b.minY);
      const cx = (b.minX + b.maxX) * 0.5;
      const cy = (b.minY + b.maxY) * 0.5;
      const color = colors[item.type] || 0xffffff;

      const group = new THREE.Group();
      const boxGeo = new THREE.BoxGeometry(w, h, 0.35);

      const fill = new THREE.Mesh(
        boxGeo,
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: item.type === 'hit' ? 0.35 : 0.18,
          depthWrite: false
        })
      );
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(boxGeo),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 })
      );
      group.add(fill);
      group.add(edges);
      group.position.set(cx, cy, 0);

      this.debugGroup.add(group);
      this.debugMeshes.push(group);
    });
  }

  /** Magenta spheres = fist/foot strike sensors (Tekken-style) */
  public addDebugStrikePoints(
    points: { x: number; y: number }[],
    radius: number,
    hot: boolean
  ): void {
    if (!this.isDebugVisible) return;
    const color = hot ? 0xf43f5e : 0xa855f7;
    for (const p of points) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 10, 10),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: hot ? 0.55 : 0.25,
          depthWrite: false
        })
      );
      mesh.position.set(p.x, p.y, 0);
      this.debugGroup.add(mesh);
      this.debugMeshes.push(mesh);
    }
  }
}

