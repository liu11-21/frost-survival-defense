import type { CombatWorld } from "../combat/CombatWorld";
import { LANES } from "../data/BuildSlotDefinitions";
import type { LaneGateManager } from "../enemies/LaneGates";
import type { WaveManager } from "../enemies/WaveManager";
import { laneName, laneShortName, t } from "../localization";

const REFRESH_INTERVAL = 0.3;

interface LaneRow {
  index: number;
  name: string;
  shortName: string;
  remaining: number;
  boss: boolean;
  gate: "open" | "partial" | "sealed";
  breached: boolean;
  wallPct: number | null;
}

export class LaneHud {
  private timer = 0;

  constructor(
    private readonly host: HTMLElement,
    private readonly list: HTMLElement,
    private readonly world: CombatWorld,
    private readonly waves: WaveManager,
    private readonly gates: LaneGateManager,
  ) {}

  setVisible(visible: boolean): void {
    this.host.classList.toggle("show", visible);
  }

  update(dt: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = REFRESH_INTERVAL;
    this.render(this.collect());
  }

  private collect(): LaneRow[] {
    const laneCount = Math.max(1, this.waves.activeLaneCount);
    const rows: LaneRow[] = [];
    for (let i = 0; i < laneCount && i < LANES.length; i++) {
      const lane = LANES[i];
      const gate = this.gates.gate(i);
      const wall = gate.breachTarget;
      rows.push({
        index: i,
        name: laneName(i, lane.name),
        shortName: laneShortName(i, lane.shortName),
        remaining: 0,
        boss: false,
        gate: gate.state,
        breached: false,
        wallPct: wall ? wall.health / wall.maxHealth : null,
      });
    }

    for (const enemy of this.world.enemies) {
      if (!enemy.alive) continue;
      const row = rows[enemy.laneIndex];
      if (!row) continue;
      row.remaining++;
      if (enemy.level >= 6) row.boss = true;
      if (Math.hypot(enemy.position.x, enemy.position.z) < 15) row.breached = true;
    }
    return rows;
  }

  private render(rows: LaneRow[]): void {
    if (rows.length === 0) {
      this.host.classList.add("quiet");
      this.host.dataset.state = "quiet";
      this.list.innerHTML = "";
      return;
    }
    const quiet = rows.every((row) => {
      const wallLow = row.wallPct !== null && row.wallPct < 0.5 && row.gate !== "open";
      return row.remaining === 0 && !row.boss && !row.breached && !wallLow;
    });
    this.host.classList.toggle("quiet", quiet);
    this.host.dataset.state = quiet ? "quiet" : "active";
    this.list.innerHTML = rows.map((row) => {
      const tags: string[] = [t(`lane.${row.gate}`)];
      if (row.gate !== "open" && row.wallPct !== null) tags.push(t("lane.wall", { percent: Math.round(row.wallPct * 100) }));
      if (row.breached) tags.push(t("lane.breached"));
      const wallLow = row.wallPct !== null && row.wallPct < 0.5 && row.gate !== "open";
      const cls = [row.boss ? "boss" : row.remaining > 0 ? "hot" : "", wallLow ? "wall-low" : ""]
        .filter(Boolean)
        .join(" ");
      const count = row.boss ? "Boss" : String(row.remaining);
      return `<div class="lane-row ${cls}">
          <b class="lane-name">${row.name}</b>
          <span class="lane-count">${count}</span>
          <span class="lane-gate ${row.gate}">${tags.join(" · ")}</span>
        </div>`;
    }).join("");
  }
}
