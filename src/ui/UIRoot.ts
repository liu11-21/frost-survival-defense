/**
 * Builds the entire DOM overlay once and hands back typed references. Nothing
 * else in the game touches `document` except LoadingScreen.
 */
import { RESOURCE_TOOLTIP, resourceIcon } from "./ResourceIcons";

export interface UIRefs {
  root: HTMLElement;
  hud: HTMLElement;
  wood: HTMLElement;
  stone: HTMLElement;
  gold: HTMLElement;
  capacityNote: HTMLElement;
  waveLabel: HTMLElement;
  waveTimer: HTMLElement;
  enemyCount: HTMLElement;
  heroBar: HTMLElement;
  heroText: HTMLElement;
  heroStats: HTMLElement;
  furnaceBar: HTMLElement;
  furnaceText: HTMLElement;
  furnaceLevel: HTMLElement;
  squadCount: HTMLElement;
  upgradeButton: HTMLButtonElement;
  callWaveButton: HTMLButtonElement;
  rebuildBox: HTMLElement;
  rebuildToggle: HTMLButtonElement;
  rebuildInfo: HTMLElement;
  buildPanel: HTMLElement;
  buildList: HTMLElement;
  buildTitle: HTMLElement;
  buildTabs: HTMLElement;
  recruitPanel: HTMLElement;
  recruitList: HTMLElement;
  recruitHeader: HTMLElement;
  recruitToggle: HTMLButtonElement;
  banner: HTMLElement;
  bannerTitle: HTMLElement;
  bannerBody: HTMLElement;
  bannerIcon: HTMLElement;
  toast: HTMLElement;
  squadHud: HTMLElement;
  squadHudHeader: HTMLElement;
  squadHudList: HTMLElement;
  laneHud: HTMLElement;
  laneHudList: HTMLElement;
  edgeLayer: HTMLElement;
  confirm: HTMLElement;
  confirmBody: HTMLElement;
  screen: HTMLElement;
  screenBody: HTMLElement;
  hint: HTMLElement;
  prompt: HTMLElement;
  bossBar: HTMLElement;
  bossName: HTMLElement;
  bossPhase: HTMLElement;
  bossFill: HTMLElement;
  bossText: HTMLElement;
  bossWarn: HTMLElement;
  tutorial: HTMLElement;
  fpsBox: HTMLElement;
  fpsText: HTMLElement;
  minimap: HTMLElement;
  minimapCanvas: HTMLCanvasElement;
  mapOverlay: HTMLElement;
  mapCanvas: HTMLCanvasElement;
  mapTimeLabel: HTMLElement;
  heroSkillBar: HTMLElement;
}

const HTML = `
<div class="boss-bar" id="ui-boss-bar">
  <div class="boss-top"><span id="ui-boss-name">Boss</span><span id="ui-boss-phase">第一階段</span></div>
  <div class="boss-track"><i id="ui-boss-fill"></i></div>
  <div class="boss-bottom"><span id="ui-boss-text">0 / 0</span><span id="ui-boss-warn"></span></div>
</div>

<div class="ctx-prompt" id="ui-prompt"></div>

<div class="tutorial-card" id="ui-tutorial"></div>

<div class="hud">
  <div class="panel-box res-box">
    <div class="res" title="${RESOURCE_TOOLTIP.wood}">${resourceIcon("wood", 22)}<span class="res-name">木材</span><b id="ui-wood">0</b></div>
    <div class="res" title="${RESOURCE_TOOLTIP.stone}">${resourceIcon("stone", 22)}<span class="res-name">石頭</span><b id="ui-stone">0</b></div>
    <div class="res" title="${RESOURCE_TOOLTIP.gold}">${resourceIcon("gold", 22)}<span class="res-name">金幣</span><b id="ui-gold">0</b></div>
    <div class="cap-note" id="ui-cap">上限 100</div>
  </div>

  <div class="panel-box fps-box" id="ui-fps-box">
    <span id="ui-fps">FPS --</span>
  </div>

  <div class="panel-box wave-box">
    <div class="wave-line"><span id="ui-wave">準備階段</span></div>
    <div class="wave-sub"><span id="ui-wave-timer">--</span> · 敵人 <b id="ui-enemies">0</b></div>
    <button class="mini-btn" id="ui-call-wave">立刻開始下一波 (N)</button>
  </div>

  <div class="panel-box hero-box">
    <div class="bar-label">主角 <span id="ui-hero-text">1000 / 1000</span></div>
    <div class="bar"><i id="ui-hero-bar"></i></div>
    <div class="stat-line" id="ui-hero-stats">遠程 50 · 近戰 80 · 攻速 0.70s</div>
    <div class="skill-row" id="ui-hero-skills">
      <div class="skill-slot ready" data-skill="frostNova">
        <div class="skill-top"><span class="skill-key">1</span><span class="skill-name">冰霜震擊</span></div>
        <div class="skill-description">範圍傷害並緩速</div>
        <div class="bar skill-bar"><i></i></div>
        <div class="skill-cd-text"></div>
      </div>
      <div class="skill-slot ready" data-skill="barrage">
        <div class="skill-top"><span class="skill-key">2</span><span class="skill-name">火力齊射</span></div>
        <div class="skill-description">快速連射鎖定目標</div>
        <div class="bar skill-bar"><i></i></div>
        <div class="skill-cd-text"></div>
      </div>
      <div class="skill-slot ready" data-skill="rally">
        <div class="skill-top"><span class="skill-key">3</span><span class="skill-name">緊急集結</span></div>
        <div class="skill-description">治療並保護附近我方</div>
        <div class="bar skill-bar"><i></i></div>
        <div class="skill-cd-text"></div>
      </div>
    </div>
  </div>

  <div class="panel-box furnace-box">
    <div class="bar-label">火爐 <span id="ui-furnace-level">Lv.1</span> <span id="ui-furnace-text">30000 / 30000</span></div>
    <div class="bar bar-warm"><i id="ui-furnace-bar"></i></div>
    <button class="mini-btn" id="ui-upgrade">升級火爐 (U)</button>
    <div class="squad-line">小隊 <b id="ui-squads">0 / 8</b></div>
  </div>

  <div class="panel-box rebuild-box" id="ui-rebuild-box">
    <div class="bar-label">自動重建站</div>
    <button class="mini-btn" id="ui-rebuild-toggle">啟用中 (T)</button>
    <div class="stat-line" id="ui-rebuild-info">佇列 0</div>
  </div>

  <div class="panel-box minimap" id="ui-minimap">
    <canvas id="ui-minimap-canvas"></canvas>
    <div class="minimap-hint">M 全地圖</div>
  </div>
</div>

<div class="map-overlay" id="ui-map-overlay">
  <div class="map-overlay-head">
    <span>戰術地圖</span>
    <span class="map-time-label" id="ui-map-time"></span>
  </div>
  <canvas id="ui-map-canvas"></canvas>
  <div class="map-overlay-hint">M 或 Esc 關閉　·　點擊地圖放置標記</div>
</div>

<div class="side-panel build-panel" id="ui-build-panel">
  <div class="side-title" id="ui-build-title">建築槽位</div>
  <div id="ui-build-tabs"></div>
  <div class="side-list" id="ui-build-list"></div>
</div>

<div class="side-panel recruit-panel" id="ui-recruit-panel">
  <div class="side-title">
    <span id="ui-recruit-header">招募所</span>
    <button class="mini-btn tight" id="ui-recruit-toggle">關閉 (G)</button>
  </div>
  <div class="side-list" id="ui-recruit-list"></div>
</div>

<div class="lane-hud" id="ui-lane-hud">
  <div class="lane-title">來襲路線</div>
  <div class="lane-list" id="ui-lane-list"></div>
</div>

<div class="squad-hud" id="ui-squad-hud">
  <div class="squad-title" id="ui-squad-header">我方小隊　0 / 8</div>
  <div class="squad-list" id="ui-squad-list"></div>
  <div class="squad-foot">點擊兵種可高亮，Esc 取消</div>
</div>

<div class="edge-layer" id="ui-edge-layer"></div>

<div class="banner" id="ui-banner">
  <div class="banner-icon hidden" id="ui-banner-icon"></div>
  <div class="banner-text">
    <div class="banner-title" id="ui-banner-title"></div>
    <div class="banner-body" id="ui-banner-body"></div>
  </div>
</div>

<div class="toast" id="ui-toast"></div>

<div class="confirm" id="ui-confirm"><div class="confirm-inner" id="ui-confirm-body"></div></div>

<div class="hint" id="ui-hint">WASD 移動 · Shift 加速 · E 互動 · B 建造 · G 招募 · U 升級火爐 · N 催波 · M 地圖 · 1/2/3 技能 · Esc 暫停</div>

<div class="screen" id="ui-screen"><div class="screen-inner" id="ui-screen-body"></div></div>
`;

function need<T extends HTMLElement>(root: HTMLElement, id: string): T {
  const el = root.querySelector<T>(`#${id}`);
  if (!el) throw new Error(`UI element #${id} missing`);
  return el;
}

export function buildUI(): UIRefs {
  const root = document.getElementById("uiRoot");
  if (!root) throw new Error("uiRoot element missing from index.html");
  root.innerHTML = HTML;

  return {
    root,
    hud: root.querySelector<HTMLElement>(".hud") as HTMLElement,
    wood: need(root, "ui-wood"),
    stone: need(root, "ui-stone"),
    gold: need(root, "ui-gold"),
    capacityNote: need(root, "ui-cap"),
    waveLabel: need(root, "ui-wave"),
    waveTimer: need(root, "ui-wave-timer"),
    enemyCount: need(root, "ui-enemies"),
    heroBar: need(root, "ui-hero-bar"),
    heroText: need(root, "ui-hero-text"),
    heroStats: need(root, "ui-hero-stats"),
    furnaceBar: need(root, "ui-furnace-bar"),
    furnaceText: need(root, "ui-furnace-text"),
    furnaceLevel: need(root, "ui-furnace-level"),
    squadCount: need(root, "ui-squads"),
    upgradeButton: need<HTMLButtonElement>(root, "ui-upgrade"),
    callWaveButton: need<HTMLButtonElement>(root, "ui-call-wave"),
    rebuildBox: need(root, "ui-rebuild-box"),
    rebuildToggle: need<HTMLButtonElement>(root, "ui-rebuild-toggle"),
    rebuildInfo: need(root, "ui-rebuild-info"),
    buildPanel: need(root, "ui-build-panel"),
    buildList: need(root, "ui-build-list"),
    buildTitle: need(root, "ui-build-title"),
    buildTabs: need(root, "ui-build-tabs"),
    recruitPanel: need(root, "ui-recruit-panel"),
    recruitList: need(root, "ui-recruit-list"),
    recruitHeader: need(root, "ui-recruit-header"),
    recruitToggle: need<HTMLButtonElement>(root, "ui-recruit-toggle"),
    banner: need(root, "ui-banner"),
    bannerTitle: need(root, "ui-banner-title"),
    bannerBody: need(root, "ui-banner-body"),
    bannerIcon: need(root, "ui-banner-icon"),
    toast: need(root, "ui-toast"),
    squadHud: need(root, "ui-squad-hud"),
    squadHudHeader: need(root, "ui-squad-header"),
    squadHudList: need(root, "ui-squad-list"),
    laneHud: need(root, "ui-lane-hud"),
    laneHudList: need(root, "ui-lane-list"),
    edgeLayer: need(root, "ui-edge-layer"),
    confirm: need(root, "ui-confirm"),
    confirmBody: need(root, "ui-confirm-body"),
    screen: need(root, "ui-screen"),
    screenBody: need(root, "ui-screen-body"),
    hint: need(root, "ui-hint"),
    prompt: need(root, "ui-prompt"),
    bossBar: need(root, "ui-boss-bar"),
    bossName: need(root, "ui-boss-name"),
    bossPhase: need(root, "ui-boss-phase"),
    bossFill: need(root, "ui-boss-fill"),
    bossText: need(root, "ui-boss-text"),
    bossWarn: need(root, "ui-boss-warn"),
    tutorial: need(root, "ui-tutorial"),
    fpsBox: need(root, "ui-fps-box"),
    fpsText: need(root, "ui-fps"),
    minimap: need(root, "ui-minimap"),
    minimapCanvas: need<HTMLCanvasElement>(root, "ui-minimap-canvas"),
    mapOverlay: need(root, "ui-map-overlay"),
    mapCanvas: need<HTMLCanvasElement>(root, "ui-map-canvas"),
    mapTimeLabel: need(root, "ui-map-time"),
    heroSkillBar: need(root, "ui-hero-skills"),
  };
}
