export type UpgradeId =
  | "heroHealth"
  | "heroAttack"
  | "heroSpeed"
  | "allyHealth"
  | "allyAttack"
  | "towerAttack"
  | "wallHealth"
  | "productionRate"
  | "furnaceHeal"
  | "recruitCost"
  | "goldDrop";

export interface UpgradeDefinition {
  id: UpgradeId;
  name: string;
  description: string;
  /** Fractional change per stack. Negative values reduce a cost. */
  amount: number;
  maxStacks: number;
}

/**
 * Endless-mode run upgrades, offered three at a time every ten waves. All of
 * them stack additively against the base value and every one is capped.
 */
export const UPGRADES: UpgradeDefinition[] = [
  { id: "heroHealth", name: "主角體魄", description: "主角最大生命值 +15%", amount: 0.15, maxStacks: 8 },
  { id: "heroAttack", name: "主角武技", description: "主角攻擊力 +12%", amount: 0.12, maxStacks: 8 },
  { id: "heroSpeed", name: "主角迅捷", description: "主角攻速 +8%", amount: 0.08, maxStacks: 6 },
  { id: "allyHealth", name: "友軍陣線", description: "全部友軍最大生命值 +10%", amount: 0.1, maxStacks: 8 },
  { id: "allyAttack", name: "友軍鋒芒", description: "全部友軍攻擊力 +10%", amount: 0.1, maxStacks: 8 },
  { id: "towerAttack", name: "砲塔強化", description: "砲塔攻擊力 +15%", amount: 0.15, maxStacks: 6 },
  { id: "wallHealth", name: "堅壁", description: "城牆最大生命值 +20%", amount: 0.2, maxStacks: 6 },
  { id: "productionRate", name: "產線加速", description: "自動生產速度 +15%", amount: 0.15, maxStacks: 6 },
  { id: "furnaceHeal", name: "爐火溫暖", description: "火爐治療速度 +20%", amount: 0.2, maxStacks: 5 },
  { id: "recruitCost", name: "徵召效率", description: "招募成本 -10%", amount: -0.1, maxStacks: 5 },
  { id: "goldDrop", name: "戰利品", description: "金幣掉落 +15%", amount: 0.15, maxStacks: 6 },
];

export const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));

/** Accumulated stacks for one run. Every lookup goes through `multiplier`. */
export class UpgradeState {
  private readonly stacks = new Map<UpgradeId, number>();

  get(id: UpgradeId): number {
    return this.stacks.get(id) ?? 0;
  }

  canTake(id: UpgradeId): boolean {
    const def = UPGRADE_BY_ID.get(id);
    return def ? this.get(id) < def.maxStacks : false;
  }

  take(id: UpgradeId): void {
    if (!this.canTake(id)) return;
    this.stacks.set(id, this.get(id) + 1);
  }

  /** 1-based multiplier for the given upgrade, e.g. 1.30 after two +15% stacks. */
  multiplier(id: UpgradeId): number {
    const def = UPGRADE_BY_ID.get(id);
    if (!def) return 1;
    return 1 + def.amount * this.get(id);
  }

  reset(): void {
    this.stacks.clear();
  }

  /** Three distinct upgrades that still have room, for the choice screen. */
  roll(count = 3): UpgradeDefinition[] {
    const available = UPGRADES.filter((u) => this.canTake(u.id));
    const picked: UpgradeDefinition[] = [];
    while (picked.length < count && available.length > 0) {
      const index = Math.floor(Math.random() * available.length);
      picked.push(available.splice(index, 1)[0]);
    }
    return picked;
  }
}
