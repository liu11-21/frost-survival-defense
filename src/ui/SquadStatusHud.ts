import type { SquadManager } from "../combat/SquadManager";
import type { RunController } from "../modes/RunController";
import { ALLY_BY_ID } from "../data/UnitDefinitions";
import { unitThumb } from "./UnitThumbs";

/** Seconds a wiped type stays listed so the player sees that it went. */
const WIPE_NOTICE = 3;
/** The list is a summary, not a per-frame readout. */
const REFRESH_INTERVAL = 0.35;

type Status = "normal" | "hurt" | "danger" | "wiped";

interface Row {
  defId: string;
  name: string;
  squads: number;
  alive: number;
  total: number;
  health: number;
  status: Status;
  upgradeLevel: number;
}

const STATUS_TEXT: Record<Status, string> = {
  normal: "正常",
  hurt: "受傷",
  danger: "危險",
  wiped: "全滅",
};

/**
 * The friendly roster at a glance: which types are on the field, how many
 * squads of each, and how badly they are hurt.
 *
 * Rebuilt on a timer and on squad events rather than every frame, because the
 * numbers only change when someone is recruited, healed or killed.
 */
export class SquadStatusHud {
  private timer = 0;
  private dirty = true;
  private readonly wiped = new Map<string, number>();
  private highlighted: string | null = null;
  onHighlight: ((defId: string | null) => void) | null = null;

  constructor(
    private readonly host: HTMLElement,
    private readonly header: HTMLElement,
    private readonly list: HTMLElement,
    private readonly squads: SquadManager,
    private readonly run: RunController,
  ) {
    this.list.addEventListener("click", (event) => {
      const row = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-def]");
      if (!row) return;
      const defId = row.dataset.def ?? null;
      this.setHighlight(this.highlighted === defId ? null : defId);
    });
  }

  get highlight(): string | null {
    return this.highlighted;
  }

  setHighlight(defId: string | null): void {
    this.highlighted = defId;
    this.onHighlight?.(defId);
    this.dirty = true;
  }

  clearHighlight(): void {
    if (this.highlighted !== null) this.setHighlight(null);
  }

  /** Called from squad events so a kill shows up without waiting on the timer. */
  markDirty(): void {
    this.dirty = true;
  }

  /** Records a wipe so the row can linger briefly with a 全滅 tag. */
  reportWipe(defId: string): void {
    this.wiped.set(defId, WIPE_NOTICE);
    this.dirty = true;
  }

  reset(): void {
    this.wiped.clear();
    this.highlighted = null;
    this.onHighlight?.(null);
    this.dirty = true;
  }

  setVisible(visible: boolean): void {
    this.host.classList.toggle("show", visible);
  }

  update(dt: number): void {
    for (const [id, left] of this.wiped) {
      const next = left - dt;
      if (next <= 0) {
        this.wiped.delete(id);
        this.dirty = true;
      } else {
        this.wiped.set(id, next);
      }
    }
    this.timer -= dt;
    if (this.timer > 0 && !this.dirty) return;
    this.timer = REFRESH_INTERVAL;
    this.dirty = false;
    this.render();
  }

  private collect(): Row[] {
    const byType = new Map<string, Row>();
    for (const squad of this.squads.allySquads) {
      if (!squad.alive) continue;
      let row = byType.get(squad.def.id);
      if (!row) {
        row = {
          defId: squad.def.id,
          name: squad.def.name,
          squads: 0,
          alive: 0,
          total: 0,
          health: 0,
          status: "normal",
          upgradeLevel: squad.upgradeLevel,
        };
        byType.set(squad.def.id, row);
      }
      // A three-person squad with one survivor is still one living squad.
      row.squads++;
      row.alive += squad.aliveCount;
      row.total += squad.def.squadSize;
      row.health += squad.averageHealthPercent;
    }

    const rows: Row[] = [];
    for (const row of byType.values()) {
      const avg = row.squads > 0 ? row.health / row.squads : 1;
      row.health = avg;
      row.status = avg >= 0.6 ? "normal" : avg >= 0.3 ? "hurt" : "danger";
      rows.push(row);
    }
    for (const [defId] of this.wiped) {
      if (byType.has(defId)) continue;
      const def = ALLY_BY_ID.get(defId);
      if (!def) continue;
      rows.push({
        defId,
        name: def.name,
        squads: 0,
        alive: 0,
        total: 0,
        health: 0,
        status: "wiped",
        upgradeLevel: this.run.allyUpgradeLevel(defId),
      });
    }
    return rows;
  }

  private render(): void {
    const rows = this.collect();
    this.header.textContent =
      `我方小隊 ${this.squads.allySquadSlotsUsed}/${this.run.squadLimit}` +
      `　工程 ${this.squads.engineerSquadsUsed}/${this.run.engineerLimit}`;
    if (rows.length === 0) {
      this.list.innerHTML = '<div class="squad-empty">尚未招募任何小隊</div>';
      return;
    }
    this.list.innerHTML = rows
      .map((row) => {
        const on = row.defId === this.highlighted ? " on" : "";
        const detail =
          row.status === "wiped"
            ? "全滅"
            : `${row.squads} 隊 / ${row.alive} 人存活 · ${Math.round(row.health * 100)}%`;
        return `<button class="squad-row ${row.status}${on}" data-def="${row.defId}"
            title="${row.name}　${detail}">
            <span class="squad-thumb">${unitThumb(row.defId, 22)}</span>
            <span class="squad-name">${row.name}${row.upgradeLevel > 0 ? ` +${row.upgradeLevel}` : ""}</span>
            <span class="squad-count">${row.status === "wiped" ? "—" : `×${row.squads}`}</span>
            <span class="squad-state">${STATUS_TEXT[row.status]}</span>
          </button>`;
      })
      .join("");
  }
}
