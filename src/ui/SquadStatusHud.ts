import type { SquadManager } from "../combat/SquadManager";
import type { RunController } from "../modes/RunController";
import { ALLY_BY_ID } from "../data/UnitDefinitions";
import { unitThumb } from "./UnitThumbs";

const WIPE_NOTICE = 3;
const REFRESH_INTERVAL = 0.35;

type Status = "normal" | "hurt" | "danger" | "wiped";

interface Row {
  defId: string;
  name: string;
  squads: number;
  alive: number;
  total: number;
  health: number;
  maxHealth: number;
  attackPower: number;
  samples: number;
  status: Status;
  upgradeLevel: number;
}

const STATUS_TEXT: Record<Status, string> = {
  normal: "正常",
  hurt: "受傷",
  danger: "危險",
  wiped: "全滅",
};

/** Renders ordinary squads in the bottom-centre roster and Engineers in their
 * own compact right-side HUD. Both show live average HP and current power. */
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
    private readonly engineerHost: HTMLElement,
    private readonly engineerHeader: HTMLElement,
    private readonly engineerList: HTMLElement,
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

  markDirty(): void {
    this.dirty = true;
  }

  reportWipe(defId: string): void {
    if (defId === "groundSupport") return;
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
    this.engineerHost.classList.toggle("show", visible);
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

  private collect(engineers: boolean): Row[] {
    const byType = new Map<string, Row>();
    for (const squad of this.squads.allySquads) {
      if (!squad.alive || squad.isGroundSupportSquad || squad.isEngineerSquad !== engineers) continue;
      let row = byType.get(squad.def.id);
      if (!row) {
        row = {
          defId: squad.def.id,
          name: squad.def.name,
          squads: 0,
          alive: 0,
          total: 0,
          health: 0,
          maxHealth: 0,
          attackPower: 0,
          samples: 0,
          status: "normal",
          upgradeLevel: squad.upgradeLevel,
        };
        byType.set(squad.def.id, row);
      }
      row.squads++;
      row.alive += squad.aliveCount;
      row.total += squad.def.squadSize;
      for (const member of squad.members) {
        if (!member.alive) continue;
        row.health += member.health;
        row.maxHealth += member.maxHealth;
        row.attackPower += member.attackPower;
        row.samples++;
      }
    }

    const rows = [...byType.values()];
    for (const row of rows) {
      const ratio = row.maxHealth > 0 ? row.health / row.maxHealth : 1;
      row.status = ratio >= 0.6 ? "normal" : ratio >= 0.3 ? "hurt" : "danger";
    }
    for (const [defId] of this.wiped) {
      if (byType.has(defId)) continue;
      const def = ALLY_BY_ID.get(defId);
      if (!def || Boolean(def.canRepair) !== engineers) continue;
      rows.push({
        defId,
        name: def.name,
        squads: 0,
        alive: 0,
        total: 0,
        health: 0,
        maxHealth: 0,
        attackPower: 0,
        samples: 0,
        status: "wiped",
        upgradeLevel: this.run.allyUpgradeLevel(defId),
      });
    }
    return rows;
  }

  private render(): void {
    const combatRows = this.collect(false);
    const engineerRows = this.collect(true);
    this.header.textContent = `我方小隊 ${this.squads.allySquadSlotsUsed}/${this.run.squadLimit}`;
    this.engineerHeader.textContent =
      `工程兵 ${this.squads.engineerSquadsUsed}/${this.run.engineerLimit}`;
    this.list.innerHTML = combatRows.length > 0
      ? this.rowsHtml(combatRows, true)
      : '<div class="squad-empty">尚未招募任何小隊</div>';
    this.engineerList.innerHTML = engineerRows.length > 0
      ? this.rowsHtml(engineerRows, false)
      : '<div class="squad-empty">尚無工程兵</div>';
  }

  private rowsHtml(rows: Row[], allowHighlight: boolean): string {
    return rows.map((row) => {
      const on = allowHighlight && row.defId === this.highlighted ? " on" : "";
      const avgHealth = row.samples > 0 ? row.health / row.samples : 0;
      const avgMax = row.samples > 0 ? row.maxHealth / row.samples : 0;
      const currentPower = row.samples > 0 ? row.attackPower / row.samples : 0;
      const healthText = row.status === "wiped"
        ? "全滅"
        : `平均 HP ${Math.round(avgHealth)}/${Math.round(avgMax)} · 攻擊 ${Math.round(currentPower)}`;
      return `<button class="squad-row ${row.status}${on}" data-def="${row.defId}"
          ${allowHighlight ? "" : "disabled"} title="${row.name}　${healthText}">
          <span class="squad-thumb">${unitThumb(row.defId, 22)}</span>
          <span class="squad-name">${row.name}${row.upgradeLevel > 0 ? ` +${row.upgradeLevel}` : ""}</span>
          <span class="squad-count">${row.status === "wiped" ? "—" : `×${row.squads}`}</span>
          <span class="squad-state">${STATUS_TEXT[row.status]}</span>
          <small class="squad-live-stats">${healthText}</small>
        </button>`;
    }).join("");
  }
}
