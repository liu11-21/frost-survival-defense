import { Matrix, Vector3 } from "@babylonjs/core";
import { healStats } from "../combat/Squad";
import { createV6DebugApi } from "./DebugApiV6";
import { createV7DebugApi } from "./DebugApiV7";
import { createV8DebugApi } from "./DebugApiV8";
import { createV9DebugApi } from "./DebugApiV9";
import { MAP, WALL_SLOT_IDS } from "../data/BuildSlotDefinitions";
import { gatherMinimapSnapshot } from "../ui/MinimapData";
import type { GameSystems } from "./GameSystems";

export interface DebugControls {
  startRun(mode: "stage" | "endless", levelId?: string): void;
  startTutorial(): void;
}

/**
 * Development-only inspection and control surface used by the headless test
 * harness. Tree-shaken out of production builds along with its only caller.
 */
export function createDebugApi(s: GameSystems, controls: DebugControls): Record<string, unknown> {
  return {
      startStage: (id: string) => controls.startRun("stage", id),
      startEndless: () => controls.startRun("endless"),
      teleport: (x: number, z: number) => s.hero.setPosition(x, z),
      setAutoRebuild: (enabled: boolean) => {
        s.buildings.autoRebuildEnabled = enabled;
      },
      setResources: (wood: number, stone: number, gold: number) => {
        s.store.reset(wood, stone, gold);
        s.store.setWarehouseCount(s.buildings.countOf("warehouse"));
      },
      grant: (wood: number, stone: number, gold: number) => {
        s.store.add("wood", wood);
        s.store.add("stone", stone);
        s.store.add("gold", gold);
      },
      build: (slotId: string, type: string) =>
        s.buildings.build(slotId, type as never, s.run.wallHealthMultiplier),
      recruit: (id: string) => s.run.tryRecruit(id),
      upgradeFurnace: () => s.run.tryUpgradeFurnace(),
      callWave: () => s.waves.callNextWaveNow(),
      forceNextWave: () => s.waves.forceNextWave(),
      slots: () =>
        s.buildings.slots.map((slot) => ({
          id: slot.id,
          category: slot.category,
          occupied: slot.occupied,
          type: slot.occupiedType,
          everBuilt: slot.everBuilt,
          role: slot.role,
          lanes: slot.lanes,
          name: slot.name,
        })),
      rebuildQueue: () =>
        s.buildings.rebuildQueue.all.map((i) => ({
          slot: i.slotId,
          type: i.buildingType,
          at: Number(i.destroyedAt.toFixed(2)),
        })),
      damageSlot: (slotId: string, amount: number) => {
        const b = s.buildings.slot(slotId)?.building;
        if (b) b.applyDamage(amount, 0, 0);
      },
      damageFurnace: (amount: number) => s.furnace.applyDamage(amount, 0, 0),
      restoreFurnace: () => s.furnace.restoreToFull(),
      killAllEnemies: () => {
        for (const e of s.world.enemies) if (e.alive) e.applyDamage(1e9, 0, 0);
      },
      spawnEnemy: (id: string, x: number, z: number) => s.squads.spawnEnemy(id, x, z, 0),
      hurtHero: (amount: number) => s.hero.applyDamage(amount, 0, 0),
      healStats: () => ({ ...healStats }),
      pickupCount: () => s.pickups.activeCount,
      enemyReport: () =>
        s.world.enemies
          .filter((e) => e.alive)
          .map((e) => {
            const target = e.currentTarget as (typeof e.currentTarget & { def?: { id?: string } }) | null;
            return {
              id: e.def.id,
              x: Number(e.position.x.toFixed(1)),
              z: Number(e.position.z.toFixed(1)),
              r: Number(Math.hypot(e.position.x, e.position.z).toFixed(1)),
              hp: Math.ceil(e.health),
              target: target ? target.kind : "none",
              targetId: target?.def?.id ?? target?.kind ?? "none",
              nav: e.navPoint ? "gate" : e.breachTarget ? "wall" : "none",
            };
          }),
      resetHealStats: () => {
        healStats.events = 0;
        healStats.healedUnits = 0;
      },
      hurtAllySquads: (amount: number) => {
        let n = 0;
        for (const unit of s.world.allies) {
          if (!unit.alive) continue;
          unit.applyDamage(Math.min(amount, unit.health - 1), 0, 0);
          n++;
        }
        return n;
      },
      allyHealth: () => {
        let total = 0;
        for (const unit of s.world.allies) if (unit.alive) total += unit.health;
        return total;
      },
      targetKinds: () => {
        let taunted = 0;
        let other = 0;
        for (const enemy of s.world.enemies) {
          if (!enemy.alive) continue;
          const target = enemy.currentTarget;
          if (target && target.kind === "unit") {
            const unit = s.world.allies.find((a) => a.damageId === target.damageId);
            if (unit && unit.def.id === "shield") taunted++;
            else other++;
          } else {
            other++;
          }
        }
        return { taunted, other };
      },
      unitCounts: () => ({
        allies: s.world.allies.length,
        enemies: s.world.enemies.length,
        structures: s.world.structures.length,
      }),
      mapInfo: () => ({ wallRadius: MAP.wallRadius, spawnRadius: MAP.spawnRadius }),

      // --- v3 inspection ---------------------------------------------------
      perf: () => ({ ...s.monitor.snapshot }),
      gpu: () => ({ ...s.monitor.gpu }),
      quality: () => s.quality.current,
      setQuality: (level: string) => s.quality.setSetting(level as never),
      cameraRadius: () => s.camera.framedRadius,
      cameraVisibleRadius: () => Number(s.camera.visibleRadius.toFixed(2)),
      cameraDistance: () => {
        const c = s.camera.camera.position;
        return Number(Math.hypot(c.x, c.y, c.z).toFixed(1));
      },
      nearbySlotId: () => s.panels.nearbySlot?.id ?? null,
      // CSS-pixel screen position of a slot, for input-diagnostic scripts to
      // click at the right place without guessing at camera framing.
      projectSlot: (slotId: string) => {
        const slot = s.buildings.slot(slotId);
        if (!slot) return null;
        const canvas = s.engine.getRenderingCanvas();
        const rw = s.engine.getRenderWidth();
        const rh = s.engine.getRenderHeight();
        const viewport = s.camera.camera.viewport.toGlobal(rw, rh);
        const coords = Vector3.Project(
          new Vector3(slot.x, 1.2, slot.z),
          Matrix.Identity(),
          s.scene.getTransformMatrix(),
          viewport,
        );
        const scaleX = canvas ? canvas.clientWidth / rw : 1;
        const scaleY = canvas ? canvas.clientHeight / rh : 1;
        return { x: Number((coords.x * scaleX).toFixed(1)), y: Number((coords.y * scaleY).toFixed(1)) };
      },
      rangeDisplayState: () => s.attackRangeVisual.debugState,
      mapOpen: () => s.mapView.isOpen,
      mapTimeScale: () => s.mapView.timeScale,
      toggleMap: () => s.mapView.toggle(),
      minimapSnapshot: () => gatherMinimapSnapshot(s),
      nodeTotals: () => s.nodes.totalRemaining,
      nodeStates: () =>
        s.nodes.nodes.map((n) => ({
          kind: n.kind,
          size: n.size,
          remaining: n.remaining,
          capacity: n.capacity,
          state: n.state,
        })),
      aiStates: () => {
        const out: Array<{ id: string; state: string; idle: number; stuck: number }> = [];
        s.squads.eachAlly((u) => {
          const brain = u.aiBrain;
          if (!brain) return;
          out.push({
            id: u.def.id,
            state: brain.state,
            idle: Number(brain.sinceLastAction.toFixed(2)),
            stuck: brain.stuckInfo.attempts,
          });
        });
        return out;
      },
      watchdog: () => ({
        recoveries: s.watchdog.recoveries,
        stalls: s.watchdog.stallsSeen,
        report: s.watchdog.report,
        unregistered: s.watchdog.unregistered,
      }),
      resetWatchdog: () => s.watchdog.reset(),
      recheckRegistration: () => {
        s.watchdog.checkRegistrationNow();
        return [...s.watchdog.unregistered];
      },
      residue: () => ({
        forceCleaned: s.residueGuard.forceCleaned,
        report: s.residueGuard.report,
      }),
      sweepResidueNow: () => {
        s.residueGuard.sweepNow();
        return s.residueGuard.forceCleaned;
      },
      aiHeartbeat: (unitId: number) => {
        let out: unknown = null;
        s.squads.eachAlly((u) => {
          if (u.damageId === unitId) out = u.aiBrain?.aiHeartbeat ?? null;
        });
        return out;
      },
      bossInfo: () => ({
        active: s.boss.active,
        phase: s.boss.currentPhase,
        health: s.boss.boss ? Math.ceil(s.boss.boss.health) : 0,
        maxHealth: s.boss.boss ? s.boss.boss.maxHealth : 0,
        slam: s.boss.slamProgress,
      }),
      startStress: (count: number) => s.stress.start(count, false),
      stopStress: () => s.stress.stop(),
      isStressTagged: () => s.monitor.isStressTagged,
      wallRebuilds: (slotId: string) => s.buildings.wallRebuildCount(slotId),
      slotHealth: (slotId: string) => {
        const b = s.buildings.slot(slotId)?.building;
        return b ? { health: Math.ceil(b.health), max: b.maxHealth } : null;
      },
      startTutorial: () => controls.startTutorial(),
      damageBoss: (amount: number) => {
        const b = s.boss.boss;
        if (b) b.applyDamage(amount, 0, 0);
      },
      bossSlamSeen: () => ({ ...s.bossTelemetry, maxFractionDealt: s.boss.lastSlamFraction }),
      tutorialStep: () => s.tutorial.currentStep?.id ?? null,

      // --- v4 inspection ---------------------------------------------------
      wallSlotIds: () => WALL_SLOT_IDS.slice(),
      wallSlotCount: () => MAP.wallSlots,
      laneGates: () =>
        s.gates.all.map((g) => ({
          lane: g.laneIndex,
          name: g.name,
          slots: g.wallSlotIds.slice(),
          state: g.state,
          breach: g.breachTarget ? "wall" : "none",
        })),
      lanePreview: () => s.waves.pendingPreview.map((l) => ({ ...l })),
      currentLanes: () => s.waves.currentLanes.map((l) => ({ ...l })),
      markerStrength: () => s.markers.currentStrength,
      setMarkerStrength: (level: string) => s.setMarkerStrength(level as never),
      markerHighlight: () => s.markers.highlight,
      markerDebug: () => s.markers.debugState(),
      healthBarCount: () => s.healthBars.activeCount,
      revealAllBars: () => s.healthBars.syncAll(s.world),
      barCounts: () => s.healthBars.countsByStyle(),
      toggleVerify: () => s.debug.toggleVerify(),
      isVerifyOpen: () => s.debug.isVerifyOpen,
      verifyText: () => document.getElementById("debug-verify")?.textContent ?? "",
      demolishableCount: () =>
        s.buildings.slots.filter((slot) => slot.building?.alive && slot.building.def.canBeDemolished).length,
      builtCount: () => s.buildings.slots.filter((slot) => slot.building?.alive).length,

      // visual integrity
      visualReport: () => s.buildings.visualReport(),
      validateVisuals: () => s.buildings.validateVisuals(),
      visualRepairs: () => s.buildings.visualRepairs,

      // demolition
      demolishCheck: (slotId: string) => {
        const c = s.buildings.demolishCheck(slotId);
        return { ok: c.ok, reason: c.reason ?? null, refund: { ...c.refund } };
      },
      demolish: (slotId: string) => s.buildings.demolish(slotId),
      slotHistory: (slotId: string) => {
        const slot = s.buildings.slot(slotId);
        return slot
          ? { history: slot.history.slice(), last: slot.lastCompletedType, everBuilt: slot.everBuilt }
          : null;
      },

      // death lifecycle
      allyBodies: () => {
        let living = 0;
        let corpses = 0;
        for (const squad of s.squads.allySquads) {
          for (const m of squad.members) {
            if (m.alive) living++;
            else corpses++;
          }
        }
        return { living, corpses, squads: s.squads.allySquads.length, pooled: s.templates.pooledRigCount };
      },
      killAllAllies: () => {
        let n = 0;
        for (const squad of s.squads.allySquads) {
          for (const m of squad.members) {
            if (!m.alive) continue;
            m.applyDamage(1e9, 0, 0);
            n++;
          }
        }
        return n;
      },
      squadSummary: () =>
        s.squads.allySquads.map((sq) => ({
          def: sq.def.id,
          alive: sq.alive,
          aliveCount: sq.aliveCount,
          size: sq.def.squadSize,
        })),

      // notification inspection: the SVG-leak regression guard
      notify: (title: string, message: string) => s.hud.notifications.show({ title, message }),
      uiText: () => ({
        bannerTitle: s.refs.bannerTitle.textContent ?? "",
        bannerBody: s.refs.bannerBody.textContent ?? "",
        toast: s.refs.toast.textContent ?? "",
        prompt: s.refs.prompt.textContent ?? "",
        buildList: s.refs.buildList.textContent ?? "",
        squadHud: s.refs.squadHudList.textContent ?? "",
        laneHud: s.refs.laneHudList.textContent ?? "",
        confirm: s.refs.confirmBody.textContent ?? "",
        fpsBox: s.refs.fpsText.textContent ?? "",
      }),
      promptNow: () => ({ ...s.prompt.interaction, slot: s.prompt.interaction.slot?.id ?? null, node: null }),
      panelState: () => ({ open: s.panels.anyOpen, isBuild: s.panels.isBuildOpen, isRecruit: s.panels.isRecruitOpen }),
      slotWorldPos: (slotId: string) => {
        const slot = s.buildings.slot(slotId);
        return slot ? { x: slot.x, z: slot.z } : null;
      },

      // --- v5/v6 unit inspection ----------------------------------------------
      ...createV6DebugApi(s),
      // --- v7 perimeter rework -------------------------------------------------
      ...createV7DebugApi(s),
      // --- v8: universal slots, layout validation, early-wave reward, boss pacing ---
      ...createV8DebugApi(s),
      // --- v9: hero active skills (1/2/3) -----------------------------------
      ...createV9DebugApi(s),
  };
}

/** Compact run state for the automated harness; nothing in-game reads this. */
export function buildSnapshot(s: GameSystems, inMenu: boolean): Record<string, number | string | boolean> {
  return {
      mode: s.run.mode,
      inMenu,
      wave: s.waves.currentWave,
      phase: s.waves.currentPhase,
      enemies: s.squads.livingEnemyUnits,
      allySquads: s.squads.allySquadSlotsUsed,
      squadLimit: s.run.squadLimit,
      wood: Math.floor(s.store.wood),
      stone: Math.floor(s.store.stone),
      gold: Math.floor(s.store.gold),
      heroHp: Math.ceil(s.hero.health),
      heroDown: s.hero.isDown,
      furnaceHp: Math.ceil(s.furnace.health),
      furnaceLevel: s.furnace.currentLevel,
      kills: s.run.kills,
      over: s.run.isOver,
      victory: s.run.victory,
      rebuildQueue: s.buildings.rebuildQueue.length,
      fps: Number(s.engine.getFps().toFixed(1)),
      heroX: Number(s.hero.position.x.toFixed(2)),
      heroZ: Number(s.hero.position.z.toFixed(2)),
  };
}
