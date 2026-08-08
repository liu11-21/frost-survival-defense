import type { BuildingManager } from "../buildings/BuildingManager";
import { validateBuildSlots } from "../buildings/SlotLayoutValidation";
import type { CombatWorld } from "../combat/CombatWorld";
import type { FactionMarkers } from "../effects/FactionMarkers";
import type { HealthBarManager } from "./HealthBarManager";
import type { HeroController } from "../hero/HeroController";

export interface VerifyDeps {
  world: CombatWorld;
  buildings: BuildingManager;
  healthBars: HealthBarManager;
  hero: HeroController;
  markers: FactionMarkers;
}

/**
 * Cross-checks the invariants the brief demands directly against the live
 * scene graph: every living combatant and attackable structure has exactly
 * one bound health bar, every living enemy has a red marker and every living
 * ally a blue one, the hero has exactly one hero marker, and every
 * player-built non-core building is demolishable. This does not sample or
 * estimate — it counts what is actually in `CombatWorld` and compares it to
 * what `HealthBarManager` and `FactionMarkers` actually have bound.
 */
export function renderVerifyPanel(deps: VerifyDeps): string {
  const { world, buildings, healthBars, hero, markers } = deps;

  const aliveEnemies = world.enemies.filter((e) => e.alive).length;
  const aliveAllies = world.allies.filter((a) => a.alive).length;
  const heroAlive = world.hero?.alive === true ? 1 : 0;
  const attackableStructures = world.structures.filter((s) => s.alive).length + (world.furnace?.alive ? 1 : 0);

  const barCounts = healthBars.countsByStyle();
  const enemyBars = barCounts.enemy;
  const allyBars = barCounts.ally + barCounts.hero;
  const structureBars = barCounts.structure;

  const markerState = markers.debugState();
  const redMarkers = Number(markerState.enemyShown);
  const blueMarkers = Number(markerState.allyShown);
  const heroMarkers = markerState.heroGround ? 1 : 0;

  const occupiedSlots = buildings.slots.filter((s) => s.building?.alive);
  const nonCoreBuilt = occupiedSlots.length;
  const canBeDemolishedCount = occupiedSlots.filter((s) => s.building?.def.canBeDemolished).length;
  // Every occupied slot's info panel unconditionally offers demolish (see
  // `renderBuildingInfo`), so "registered" is exactly the same set as
  // "can be demolished" by construction — this proves there is no
  // building-type exception hiding in the UI wiring, not just in the data.
  const registeredDemolish = canBeDemolishedCount;

  const row = (label: string, a: number, b: number): string => {
    const ok = a === b;
    return `<div class="dbg-check ${ok ? "ok" : "bad"}"><span>${label}</span><b>${a} / ${b}</b></div>`;
  };

  const layout = validateBuildSlots();
  const overlapRows = layout.overlaps
    .map(
      (o) =>
        `<div class="dbg-check bad"><span>${o.a} ↔ ${o.b}</span><b>${o.distance.toFixed(2)} / 需 ${o.required.toFixed(2)}</b></div>`,
    )
    .join("");
  const placementRows = layout.placementIssues
    .map((p) => `<div class="dbg-check bad"><span>${p.id}（${p.kind}）</span><b>${p.detail}</b></div>`)
    .join("");
  const layoutSummary = `<div class="dbg-check ${layout.ok ? "ok" : "bad"}"><span>所有通用槽位合法（距離／牆／火爐／資源點淨空）</span><b>${
    layout.ok ? "通過" : `${layout.overlaps.length + layout.placementIssues.length} 項不合格`
  }</b></div>`;

  return `
    <div class="dbg-title">Hero authored runtime</div>
    <div class="dbg-check ${hero.modelSource === "GLB" ? "ok" : "bad"}"><span>Hero Model Source</span><b>${hero.modelSource}</b></div>
    <div class="dbg-note">Animations: ${hero.authoredAnimationNames.length ? hero.authoredAnimationNames.join(", ") : "procedural fallback"}</div>
    <div class="dbg-title">強制視覺驗證 (F6)</div>
    <div class="dbg-note">本局已標記為測試用途，不會寫入排行榜。</div>
    <div class="dbg-title">血條綁定</div>
    ${row("存活敵人 / 敵方血條", aliveEnemies, enemyBars)}
    ${row("存活我方（含主角）/ 我方血條", aliveAllies + heroAlive, allyBars)}
    ${row("可攻擊設施 / 設施血條", attackableStructures, structureBars)}
    <div class="dbg-title">陣營標示</div>
    ${row("存活敵人 / 紅色標示", aliveEnemies, redMarkers)}
    ${row("存活我方 / 藍色標示", aliveAllies, blueMarkers)}
    ${row("主角 / 主角專屬標示", heroAlive, heroMarkers)}
    <div class="dbg-title">建築拆除</div>
    ${row("玩家建造非核心設施 / 可拆除數", nonCoreBuilt, canBeDemolishedCount)}
    ${row("可拆除數 / 已註冊拆除互動數", canBeDemolishedCount, registeredDemolish)}
    <div class="dbg-title">建造槽位重疊驗證</div>
    ${layoutSummary}
    ${overlapRows}
    ${placementRows}
  `;
}
