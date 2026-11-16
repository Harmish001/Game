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
  private isDebugVisible: boolean = false;
  private debugMeshes: THREE.LineSegments[] = [];

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
   * Render wireframe debug boxes
   */
  public updateDebugBoxes(
    boxes: { box: WorldBox2D; type: 'hit' | 'hurt' | 'push' | 'throw' }[]
  ): void {
    if (!this.isDebugVisible) return;

    // Clear old debug meshes
    while (this.debugMeshes.length > 0) {
      const mesh = this.debugMeshes.pop();
      if (mesh) {
        this.debugGroup.remove(mesh);
        mesh.geometry.dispose();
      }
    }

    const colors: Record<string, number> = {
      hit: 0xef4444,    // Red
      hurt: 0x22c55e,   // Green
      push: 0x3b82f6,   // Blue
      throw: 0xeab308   // Yellow
    };

    boxes.forEach(item => {
      const b = item.box;
      const w = b.maxX - b.minX;
      const h = b.maxY - b.minY;
      const cx = (b.minX + b.maxX) * 0.5;
      const cy = (b.minY + b.maxY) * 0.5;

      const edgesGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, 0.4));
      const lineMat = new THREE.LineBasicMaterial({
        color: colors[item.type] || 0xffffff,
        linewidth: 2
      });
      const line = new THREE.LineSegments(edgesGeo, lineMat);
      line.position.set(cx, cy, 0);

      this.debugGroup.add(line);
      this.debugMeshes.push(line);
    });
  }
}

