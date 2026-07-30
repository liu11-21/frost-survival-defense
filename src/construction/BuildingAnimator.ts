import { Mesh, Vector3 } from "@babylonjs/core";
import { BUILD } from "../character/AnimationConfig";
import type { GameEvents } from "../game/GameEvents";
import { clamp01, easeOutBack, easeOutCubic } from "../util/MathUtil";

export interface BuildStageDef {
  name: string;
  meshes: Mesh[];
  /** Where dust and sound should originate for this stage. */
  anchor: Vector3;
  /** Parts that swing in from above rather than popping up from the ground. */
  dropIn?: boolean;
}

interface TrackedMesh {
  mesh: Mesh;
  restScale: Vector3;
  restPosition: Vector3;
}

/**
 * Assembles a building one visible part group at a time. Stages are queued as
 * the wood arrives and always play out at a readable pace, so a fast delivery
 * never turns the construction into a single pop.
 */
export class BuildingAnimator {
  private readonly tracked: TrackedMesh[][] = [];
  private completedStages = 0;
  private queuedUpTo = 0;
  private playingIndex = -1;
  private playTime = 0;
  private finished = false;

  constructor(
    private readonly events: GameEvents,
    private readonly zoneId: string,
    private readonly stages: BuildStageDef[],
  ) {
    for (const stage of stages) {
      const group: TrackedMesh[] = [];
      for (const mesh of stage.meshes) {
        group.push({
          mesh,
          restScale: mesh.scaling.clone(),
          restPosition: mesh.position.clone(),
        });
        mesh.setEnabled(false);
      }
      this.tracked.push(group);
    }
  }

  get isFinished(): boolean {
    return this.finished;
  }

  get stageCount(): number {
    return this.stages.length;
  }

  /** Reveals every stage up to (but not including) `count`. */
  unlockStages(count: number): void {
    this.queuedUpTo = Math.max(this.queuedUpTo, Math.min(count, this.stages.length));
  }

  update(dt: number): void {
    if (this.finished) return;

    if (this.playingIndex < 0) {
      const next = this.completedStages;
      if (next >= this.queuedUpTo) return;
      this.playingIndex = next;
      this.playTime = 0;
      for (const t of this.tracked[next]) {
        t.mesh.setEnabled(true);
        t.mesh.scaling.set(0.001, 0.001, 0.001);
      }
    }

    this.playTime += dt;
    const t = clamp01(this.playTime / BUILD.stageDuration);
    const stage = this.stages[this.playingIndex];
    const group = this.tracked[this.playingIndex];
    const scaleE = easeOutBack(t);
    const moveE = easeOutCubic(t);

    for (const item of group) {
      item.mesh.scaling.set(
        item.restScale.x * scaleE,
        item.restScale.y * scaleE,
        item.restScale.z * scaleE,
      );
      if (stage.dropIn) {
        item.mesh.position.set(
          item.restPosition.x,
          item.restPosition.y + (1 - moveE) * 2.6,
          item.restPosition.z,
        );
      }
    }

    if (t >= 1) {
      for (const item of group) {
        item.mesh.scaling.copyFrom(item.restScale);
        item.mesh.position.copyFrom(item.restPosition);
      }
      this.events.emit("buildStage", {
        zoneId: this.zoneId,
        stage: this.playingIndex + 1,
        total: this.stages.length,
        position: stage.anchor,
      });
      this.completedStages = this.playingIndex + 1;
      this.playingIndex = -1;
      if (this.completedStages >= this.stages.length) {
        this.finished = true;
      }
    }
  }
}
