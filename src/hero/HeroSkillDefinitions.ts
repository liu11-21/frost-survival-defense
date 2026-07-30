export type HeroSkillId =
  | "airSupport"
  | "infiniteFirepower"
  | "groundSupport"
  | "seismicWave";

export interface HeroSkillDefinition {
  readonly id: HeroSkillId;
  readonly key: "Digit1" | "Digit2" | "Digit3" | "Digit4";
  readonly keyLabel: "1" | "2" | "3" | "4";
  readonly name: string;
  readonly description: string;
  readonly shortDescription: string;
  readonly cooldown: number;
  readonly initialCooldown: number;
}

export const HERO_SKILLS: readonly HeroSkillDefinition[] = [
  {
    id: "airSupport",
    key: "Digit1",
    keyLabel: "1",
    name: "空中火力支援",
    description: "中央火爐周圍承受 3 次 1000 傷害轟炸，隨後每秒受到 500 火焰傷害，持續 10 秒。",
    shortDescription: "3 次轟炸＋10 秒火海",
    cooldown: 80,
    initialCooldown: 40,
  },
  {
    id: "infiniteFirepower",
    key: "Digit2",
    keyLabel: "2",
    name: "無限火力",
    description: "所有我方攻擊設施攻速提高為 2 倍，持續 5 秒；施放時立即進入冷卻。",
    shortDescription: "攻擊設施攻速 ×2，5 秒",
    cooldown: 20,
    initialCooldown: 10,
  },
  {
    id: "groundSupport",
    key: "Digit3",
    keyLabel: "3",
    name: "地面支援",
    description: "召喚 3 人特殊護駕 10 秒，共用 5000 生命、攻擊 300；敵人開始攻擊主角時才會參戰並嘲諷全場。",
    shortDescription: "召喚護駕 10 秒",
    cooldown: 30,
    initialCooldown: 15,
  },
  {
    id: "seismicWave",
    key: "Digit4",
    keyLabel: "4",
    name: "震地波",
    description: "向前方扇形區域造成 300 傷害並震退敵人，使其接下來 3 秒承受傷害增加 10%。",
    shortDescription: "前方 300 傷害＋易傷",
    cooldown: 10,
    initialCooldown: 0,
  },
];

export const HERO_SKILL_BY_ID = new Map(HERO_SKILLS.map((skill) => [skill.id, skill]));

export const AIR_SUPPORT = {
  radius: 12,
  strikes: 3,
  strikeInterval: 0.75,
  strikeDamage: 1000,
  flameDps: 500,
  flameDuration: 10,
  flameTickInterval: 1,
  flameParticles: 100,
} as const;

export const INFINITE_FIREPOWER = {
  duration: 5,
  attackSpeedMultiplier: 2,
} as const;

export const GROUND_SUPPORT = {
  duration: 10,
  sharedHealth: 5000,
  attack: 300,
} as const;

export const SEISMIC_WAVE = {
  radius: 8,
  halfAngleRadians: Math.PI / 3,
  damage: 300,
  knockbackDistance: 1.8,
  vulnerability: 0.1,
  vulnerabilityDuration: 3,
} as const;
