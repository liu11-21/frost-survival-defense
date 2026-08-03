# 變更脈絡

## 2026-08-03｜Hero R4 final silhouette correction

- 延續 `codex/hero-commercial-h1-h6`，只修改 Hero Blender 幾何與既有權重綁定；未修改其他資產、Babylon runtime 程式或完整 H1–H6 流程。
- LOD1／LOD2 移除造成三分之四視角長鼻狀突出物的重複頭部與浮動 goggles 體積，改以頭部連續網格上的 visor 材質帶保留身份。
- 縮小 LOD0／production LOD 胸甲與肩甲，將前方披掛改為由腰線連接並逐段收窄的外套下擺；背包向後調整、既有 LOD weapon mesh 保留刀身與槍體輪廓。
- 追加 `reports/art-previews/hero-commercial-r4/R4-final-correction/` 的三個 LOD front／side／back／three-quarter clay 證據與比較資料；不把 Blender clay 圖當作 Babylon runtime 證據或商業品質簽核。
- 最新靜態 GLB：LOD0 10,492 vertices／20,864 triangles／15 meshes；LOD1 3,684／7,280／7；LOD2 1,060／2,060／5；4 materials、1 embedded atlas、18 bones、7 animations。
- `npm run art:validate:hero` 與完整 `npm run art:validate` 均通過；Babylon runtime 仍需在本輪第二階段以有限方式嘗試，若再次受 `spawn EPERM` 阻擋則只保留 blocker，不宣稱 runtime 通過。

## 2026-08-03｜Hero continuous authored mesh reconstruction

- 本輪只重建 Hero；未修改其他角色、設施或遊戲玩法，也沒有重新執行 H1-H6 建模階段。
- `scripts/blender/build_hero.py` 以連續 loft/profile 網格取代原先大量 rigid primitive 組裝：LOD0 由約 184 個 runtime authored meshes 降至 32 個 material-split render meshes（10 個 authored objects，含朝向校正用 `head.nose` marker）。
- 保留 `HeroRoot`、`HeroSkeleton`、weapon/ranged sockets、七段既有動畫與 Babylon +Z 朝向契約；LOD1/LOD2 各自保留 body、hood/visor、cape、weapon 四類識別網格。
- 只使用 `npm run art:hero` 重新產出 `assets-source/blender/characters/hero.blend` 與 `public/assets/models/characters/hero.glb`，未執行其他資產匯出。
- `npm run art:hero:review` 已更新 `reports/art-previews/hero-commercial/review/` 的 12 張 Babylon runtime 截圖與 21 個動畫影格；`npm run art:validate:hero` 通過。此驗證只證明可見性、LOD、動畫與無 procedural 疊加，不宣稱材質或動畫達商業品質。

## 2026-08-02｜visual-effects implementation checkpoint

- 按使用者要求在安全位置停止視覺資產擴充；未啟動設施全名單預覽，也未新增新的特效類型、材質框架、資產家族或重構。
- 已完成當時正在寫入的全角色預覽：`reports/art-previews/unit-roster-full.png`。
- 保留並重建本次停止前已完成的 Blender 來源與 GLB；匯出根節點及動畫控制 pivot 改用不渲染的 `PLAIN_AXES`，避免控制用 Cube 出現在畫面。
- 直接使用 Blender 5.2.0 LTS 完成匯出；受管控 Windows 的 Node wrapper 仍因 `spawnSync ... EPERM` 無法啟動子程序。
- `npm run typecheck` 通過；`npm run build` 在一次提高權限重跑後通過，仍有既有的大型 chunk 警告。

## 2026-08-02｜全名單 QA 與飛行敵人精修批次

- 修正 `scripts/blender/render_full_roster_previews.py` 未呼叫 `clear_scene()` 的問題；兩張全名單預覽不再混入 Blender 預設 Cube。
- 完成 14 個設施的全名單預覽，以及重新輸出 26 個角色的全名單預覽，作為後續美術分級依據。
- 飛行近戰、飛行精銳射手、飛行轟炸者、飛行空中巨像加入角色專屬翼刃／羽片／背架／炸彈掛架細節；既有骨架、動畫、AI 與 GLB 路徑不變。
- 直接 Blender 重建角色 GLB 後，`npm run art:validate` 回報 42/42 `ok`；四種飛行敵人仍各具 UnitSkeleton 與 Idle／Walk／Attack／Cast／Hit／Death 動畫。

## 2026-08-02｜主角有機體積精修

- `scripts/blender/build_hero.py` 將主角軀幹、雙臂與雙腿由 bevel box 改為具明確尺寸的低多邊形 ellipsoid，保留原有 HeroSkeleton、socket、碰撞與 7 段動畫。
- 直接 Blender 5.2.0 LTS 重建 `public/assets/models/characters/hero.glb`；`npm run art:validate` 仍為 42/42 `ok`，主角三角面數為 14,252。

## 2026-08-02｜主角前向軸執行期校準

- 查明主角的輸入與位移沒有倒置：按住 W 時 `z` 由 `-4.5` 增至 `-2.72`，符合遊戲的 `+Z` 前進約定；預設鏡頭位於主角南側，因此移動時看到背包背面，造成「倒著走」的視覺誤判。
- `HeroController` 載入 authored `hero.glb` 後，改以 `head.nose`／眼睛標記相對於 GLB 根節點的位置，自動決定是否需要 180° 校正；不再把單一匯出版本的角度寫死。
- 目前 `hero.glb` 的臉部標記位於根節點 `+Z`，執行期校正結果為 `0°`；移動、碰撞與攻擊邏輯維持不變。

## 2026-08-02｜全資產表面法線與 Babylon 回歸

- 共用 Blender 材質流程在倒角後為所有 authored Mesh 加入加權表面法線，讓金屬板、支架與多面體結構在 GLB／Babylon 中保留較穩定的高光過渡。
- 重新匯出完整 42 個 GLB；`reports/art-validation.json` 維持 42/42 `ok`、無 blocked／invalid／warning。直接檔案總量為 13,879,248 bytes。
- Babylon 回歸：`node tools/playtest.mjs --suite v9` 75/75、`--suite v10` 12/12、`npm run typecheck` 與 `npm run build` 通過；production build 仍有既有約 5.8 MB chunk 警告。
- 主角方向已以執行期臉部標記校正，不再硬寫單一版本的 180°；實測 W 使 `z` 由 `-4.5` 增至 `-2.72`，移動方向正確。預設鏡頭在南側，因此向北移動時看到背面，不代表倒退。

## 2026-08-02｜全資產第三輪 Blender 精修與批次重建

- 共享角色資產加入領口／下顎／腰封／胸線、袖口、靴底鉚釘、陣營徽記、武器握把纏帶與重裝肩部硬體；飛行敵人改用分層翼膜與翼根關節，維持既有 UnitSkeleton 與六段動畫契約。
- 全部 12 種通用設施加入基座施工層、維修面板、固定件，以及礦井絞盤、伐木鋸座、倉庫窗格、自動收集臂、修復吊索、塔台硬體與火爐熱管等功能結構。
- 基準砲塔補上炮管環、砲口冠、支架螺栓；城牆／門補上砌石層、門甲帶與鉸鏈片，保留 `yawPivot`、`pitchPivot`、`muzzle`、`recoilPart`、門樞與碰撞節點。
- 樹木與礦石資源補上枝節、針葉環、樹樁環、岩石切面與礦脈框，並透過正式 `npm run art:export` 完整重建 42 個 GLB 與對應 `.blend` 原始資產。
- `reports/art-quality-audit.md` 更新為第三輪審查結果；仍明確標記手工雕刻、拓撲、貼圖與材質破碎度尚未完成商業美術簽核，沒有把通過驗證誤稱為商業級完成。

## 2026-08-02｜角色與核心設施第二輪精修

- 主角加入臉部焦點、翻領與手部綁定的武器握柄／劍身／護手／寶石；戰士加入分層胸甲、肩甲、胸章、劍鞘與錐形劍刃；飛行巨像加入多片翼膜、翼骨、披肩、角、眼睛與膝甲。
- 火爐加入交錯砌石、內嵌火室、火室邊框與三段火焰舌；弩箭塔加入弧形弩臂、弦、握座、絞盤與斜向支撐。新節點均納入既有 GLB 根節點與動畫／碰撞流程。
- 修正新增設施零件未掛到 `BuildingRoot` 的 parent 關係，避免匯入 Babylon 後成為額外世界根節點。
- 修正角色／設施檢視圖的兩排座標軸，改用 GLB 的 Z 軸作展示深度；驗收圖仍只作美術 QA，不代表人工雕刻、拓撲與貼圖已完成。
- Blender `save_source` 現在只保留正式 `.blend`，批次匯出不再產生旋轉的 `.blend1` 暫存備份；本輪已清理 42 個位於 `assets-source/blender` 下的自動備份。

## 2026-08-02｜再次修正主角 authored 模型倒退

- 重新檢查匯出的 `hero.glb` 節點座標後確認其正面已是局部 `+Z`；移除先前誤加的 `180°` 子根旋轉，避免主角移動時視覺上背對行進方向。
- 主角初始位置位於火爐南側，初始 yaw 改為 `0` 面向火爐（+Z）；重新開始流程也套用同一朝向。
- 移動向量、碰撞、鎖敵與程序化 fallback 邏輯不變。

## 2026-08-02｜角色與設施商業化輪廓迭代

- 角色批次加入胸甲／胸前護片、頭盔眉甲、鞋尖、肩甲帽、職業徽章與施法焦點；遠程、近戰、支援、飛行與敵方陣營仍沿用既有骨架、socket、攻擊／死亡動畫與碰撞契約。
- 設施批次加入礦坑拱架、伐木場山牆、倉庫／招募所山牆、採集器護罩、重建站修復冠、弩塔裙甲與冰霜塔基座等結構細節，並保留既有可動節點與功能動畫。
- 更新 Blender 美術檢視圖為 1200×900 分格檢視，新增主角／盾兵／飛行巨像等代表資產；檢視圖仍是 QA 證據，不取代專業美術師的手工雕刻、拓撲與材質微調。

## 2026-08-02｜主角 GLB 移動朝向修正

- 修正主角使用 authored `hero.glb` 時模型正面與移動方向相反的問題。GLB 子根節點現在套用局部 `180°` yaw，讓模型正面與遊戲的 `+Z` 移動／面向約定一致。
- 不改動主角速度、碰撞、鎖敵或程序化 fallback；缺少 authored 資產時仍維持原本的程序化角色。

## 2026-08-02｜角色與核心設施幾何精修第二輪

- 新增 Blender `prism` 輪廓工具，讓布料、披肩、裝甲、城牆支撐與設施護板使用自訂多邊形外形，不再完全依賴軸對齊方盒。
- 主角加入分層外套尾片、肩部披肩、圍巾、背包蓋與護腕；所有兵種依護甲、遠程裝備、披風、翅膀與敵方陣營加入對應的外形片與破布下擺，維持既有骨架與動畫接口。
- 基礎砲塔加入前方砲盾、積雪護緣、驅動齒輪與齒圈；城門加入牆體支撐與雪肩輪廓；交叉弩塔、狙擊塔與火爐加入功能性護板／擋風板／核心防護層。
- 本輪改動尚未宣稱取代專業美術師的手工雕刻與拓撲；仍會以渲染檢視圖與 GLB 回歸驗證外形、材質與遊戲可用性。

## 2026-08-02｜自然資源節點納入 GLB 流程

- 新增 `scripts/blender/build_resources.py`，產出 `resource_tree.glb` 與 `resource_rock.glb`，包含樹冠／積雪／樹幹、岩塊／礦脈／雪面與枯竭殘留節點。
- `ResourceNodeView` 在 AssetRegistry preload 完成後切換到 authored resource GLB；採集階段隱藏冠層／礦脈，枯竭與重生、碰撞、抖動仍由既有遊戲邏輯控制，缺檔時保留原程序化 fallback。
- 資源 GLB 加入 manifest、批次匯出、GLB 驗證與環境資產路徑，讓常駐採集物件不再只依賴 Babylon MeshBuilder。

## 2026-08-02｜實際 LOD 代理網格與 Babylon 距離切換

- 將所有英雄、兵種、城門、設施與火爐的 `LOD1`／`LOD2` 從空標記補成可匯出的低面數代理幾何；角色使用身體＋頭部輪廓，建築使用基座＋頂蓋輪廓，城門使用獨立牆體代理。
- `ModelLoader` 現在在每個實例上依活動相機距離切換整組 LOD：18 世界單位切到 LOD1、34 世界單位切到 LOD2；近距離恢復完整 LOD0，且釋放實例時移除觀察器。
- `art:validate` 新增代理網格存在性與數量檢查，`reports/art-validation.json` 已重新產生為 40/40 `ok`，每個資產均有 LOD1/LOD2 代理。
- 同步更新 README 與美術測試說明，保留程序化 fallback；本次重新匯出使用官方 Blender 5.2.0 LTS，並清理自動產生的 `.blend1` 備份。
- 修正兩張 Blender 美術檢視表的取景與代理遮蔽：改用較寬視角完整呈現四個資產，並在 LOD0 品質檢視時隱藏 LOD1/LOD2 代理，避免 QA 圖把遠距離代理誤當成正式模型。

## 2026-08-02｜Blender 製作 3D 資產 → GLB → Babylon.js 整合

- 追查主角移動時倒向問題：Blender 是 Z-up，而基線腳本以 Y-up 建模；新增 `orient_for_babylon` 根節點校正，並對英雄 authored visual 加入半圈視覺偏移，讓其前向與遊戲 +Z 移動語意一致。
- 同一軸向校正同步套用至 `TurretRoot` 與 `WallGateRoot`，避免三個 Blender authored asset 在 Babylon 中出現側躺或軸向不一致。
- 軸向修正後重新執行 `art:export`／`art:validate`、`npx tsc --noEmit`、production build、v10（12/12）與 v9（75/75）；production preview 三個 GLB 仍為 HTTP 200 且無 authored fallback。
- 角色批次重製流程新增 Blender `torus` 幾何 helper，供護具、徽章、冰晶與機械環件使用。
- 新增 `art:units` 批次腳本，已產出 25 個非主角角色 GLB；每個角色具備專屬材質調色、職業武器／護具／背包或翅膀輪廓、`UnitSkeleton`、socket 節點與 Idle／Walk／Attack／Cast／Hit／Death 動畫。
- 新增 `art:buildings` 批次腳本，已產出礦場、金礦、伐木場、倉庫、招募所、自動收取、自動重建、弩箭塔、冰霜塔、狙擊塔、火焰迫擊砲與中央火爐 GLB；攻擊設施保留 yaw／pitch／barrel／muzzle／recoil 節點，生產設施保留 productionCore／workPart。
- 建立 `assets-source/` Blender 工作區、風格規範、概念圖流程、授權紀錄與可重複執行的英雄／基礎砲塔／城牆閘門建模腳本。
- 新增 `art:template`、`art:hero`、`art:turret`、`art:wall`、`art:export`、`art:validate` 指令；模型驗證器會輸出 `reports/art-validation.json`，缺少 GLB 時明確標記為 `blocked`。
- 新增 Babylon `AssetRegistry`／`ModelLoader` 快取、節點與動畫契約驗證、碰撞網格隱藏，以及載入失敗時的程序化模型回退；建築與主角均有 authored visual hook。
- 初始盤點時 Blender 未安裝；後續已完成 Blender 5.2.0 LTS 官方 ZIP 安裝與 SHA-256 驗證，三個 GLB 已實際產出並通過驗證。
- 驗證結果：`npm run typecheck`、production build、`node tools/playtest.mjs --suite v9`（75/75）與 `--suite v10`（12/12）通過；`git diff --check` 通過。完整預設 suite 超過本次命令執行時間上限，未將其誤報為通過。
- 測試說明同步放在 `docs/art/TESTING.md`，涵蓋 Blender 缺失時的 blocked 報告與 GLB 生成後的嚴格驗證。
- 安裝流程補強 `run-blender.mjs`：依序使用 `BLENDER_PATH`、PATH，再動態搜尋使用者與 Program Files 的 Blender 版本資料夾，避免把單一版本絕對路徑提交進專案。
- Blender 5.2 相容性修正：動畫改用 `keyframe_insert` 產生 layered Action；砲塔腳本補上 `sphere` helper 匯入，避免依賴 Blender 4 的 `Action.fcurves` 舊 API。
- GLB 匯出改用 Blender 5.2 的 `use_visible` 與 `NLA_TRACKS`，排除碰撞 Mesh 並保留命名動畫；英雄腳本新增 `HeroSkeleton` 與規格骨骼名稱。
- 英雄腳本執行時發現並修正遺漏的 `move_to` helper 匯入；未將失敗產物視為成功。
- 城牆閘門的 `gateCollider` 改為非渲染 anchor，保留 GLB 節點契約並避免碰撞 Mesh 被匯出。
- 匯出流程不再把重複的 `.blend`／`.blend1` 備份寫入 runtime `public/assets/models/`；來源檔只保留在 `assets-source/blender/`，runtime 目錄只提供 GLB。
- GLB 驗證器補上骨架數、絕對路徑、占位模型與面數檢查；修正檢查順序後再重新產出報告。
- 驗證報告再加入根節點平移／縮放與幾何 bounds，讓原點、比例與軸向檢查有可追蹤資料。
- Babylon runtime contract 改以 `HeroSkeleton` GLB 節點與 JSON `skins` 驗證英雄骨架；避免 Blender 匯出的未綁定骨架被 Babylon importer 丟棄時錯誤回退整個英雄視覺。
- 重新執行 `art:export` 後，三個 source `.blend` 結構驗證均為 `ok`；production preview 的三個 GLB 回應皆為 HTTP 200，Babylon.js 無未處理錯誤、404 或 authored-contract fallback。

## 2026-08-02｜Blender 安裝與首批 GLB 產出

- winget 已確認官方套件 `BlenderFoundation.Blender`（5.2.0）；因 Delivery Optimization 下載在 5 分鐘內卡住，改用同一 Blender Foundation 官方 Windows ZIP，並以官方 SHA-256 `2d184b...18adc4` 驗證後解壓至使用者層級目錄。
- `BLENDER_PATH` 已設定為使用者環境變數；`run-blender.mjs` 同時支援 PATH 與常見安裝根目錄搜尋。新終端機會自動讀取使用者變數；目前既有 Codex 子程序則可直接透過 common-root fallback 找到 Blender。
- `npm run art:template`、`art:hero`、`art:turret`、`art:wall`、`art:export` 均成功；三個 GLB 已產出並通過 `reports/art-validation.json`：hero 45,840 bytes／1 skeleton／7 animations、turret 29,124 bytes／5 animations、wall_gate 33,108 bytes／4 animations。
- Blender 5.2 API 修正已記錄：使用 layered Action 的 `keyframe_insert`、glTF `use_visible`／`NLA_TRACKS`，並將閘門碰撞改為非渲染 anchor。
- Babylon.js 實際載入回歸通過：v9 75/75、v10 12/12；`npx tsc --noEmit`、`npm run build` 也通過。專案未定義 `npm test` script。

## 2026-08-01｜火爐擴張、天空設施與空軍系統

### 本節點完成

- 地面建造點位改為由核心向外解鎖：火爐 Lv1～10 分別開放 4／7／10／13／16／19／22／25／28／31 個點位；四面城牆位置維持不變。
- 新增 Lv15／20／25／30／35 天空平台。天空平台只接受攻擊型設施、建造成本為原成本 1.25 倍向上取整，設施傷害 ×1.5，且不會成為既有敵人的地面碰撞、鎖定或範圍傷害目標。
- 完成弩箭塔、砲塔、冰霜塔、狙擊塔與火焰迫擊砲的天空專屬效果：多重鎖定、連擊增傷、冰凍易傷、破甲／爆擊，以及群體加速燃燒。
- 掌旗者改為跟隨非工程、非掌旗、非特殊護駕作戰部隊的全軍中心，無部隊時回到火爐。
- 新增飛行近戰小兵、飛行精銳射手、飛行轟炸者、飛行空中巨像；飛行單位使用空中高度與專屬視覺，僅可被遠程單位、主角和攻擊型設施攻擊。
- 已招募名單改為近戰／遠程／支援三分類三欄網格，工程兵維持獨立面板；小隊數字改為高對比徽章，生命值改為血條加目前／最大數字。
- 資源 HUD 新增木材、石頭、金幣即時生產效率；圖鑑與 README 補上天空平台、飛行敵人與測試說明。
- 修正天空範圍預覽只套用於狙擊塔／砲塔、同一座迫擊砲重疊火焰不重複傷害，以及死亡／失效目標造成的天空攻擊鎖定殘留；攻擊設施統一標記為遠程來源，讓狙擊破甲正確放大後續塔傷害。

### 驗證

- `npm run typecheck`：通過。
- `npm run build`：通過。
- `git diff --check`：通過。
- `node tools/playtest.mjs --suite v9`：75／75 通過。
- `node tools/playtest.mjs --suite v10`：12／12 通過，涵蓋點位解鎖、天空建造與成本、飛行單位鎖定規則、HUD 分類與生產效率。
- 完整 `node tools/playtest.mjs`：426／426 通過，無 console error。
- 完成角色與設施 GLB 的執行層接回：戰鬥單位模板、一般建築與中央火爐會在驗證通過時使用 Blender 資產，並保留程序化 fallback；新增共用 authored 動畫啟動與火爐安裝鉤子。
- 擴充 `art:validate` 覆蓋 25 個非主角角色、12 個新設施與火爐；本次驗證全部通過，包含節點、動畫、骨架、外部 URI、碰撞節點與基本面數檢查。
- 修正 authored 角色移動方向：Blender 匯出後 `HeroRoot`／`UnitRoot` 的本地 +Z 已與 Babylon 遊戲 yaw 對齊，移除額外半圈旋轉，主角與戰鬥單位不再倒著走。
- 將 `art:export` 批次流程擴充為主角、既有設施、25 個角色、12 個新設施與火爐的完整匯出；README／藝術驗證說明同步列出分批指令與 v6／v9／v10 回歸範圍。
- 修正戰鬥角色 GLB 與程序化模型的 pooled rig 邊界：使用 authored 角色時，重用小隊與護甲破壞流程不會重新啟用隱藏的程序化零件造成雙重模型。
- 本次批次後回歸：v6 49/49、v9 75/75、v10 12/12；完整預設 playtest 在 v8 的長時間策略耐久段超過 420 秒未回傳，因此不宣稱完整套件通過，需另行縮短或拆分該耐久測試。

## 2026-08-02 — authored asset quality pass

- Rebuilt the shared unit authoring pass for all 25 non-hero allies/enemies: layered cloth/leather/metal materials, role-specific silhouette details, faction accents, joints, gloves, armour plates and equipment details are now exported from Blender rather than relying on the pooled runtime boxes.
- Replaced unit root-only clips with a real `UnitSkeleton` pose rig. Each unit exports six named clips (`Idle`, `Walk`, `Attack`, `Cast`, `Hit`, `Death`) with 54 bone animation channels and Babylon continues to select them through `CombatAnimator`.
- Added `LOD1`/`LOD2` authored contract markers with screen-coverage metadata to every hero, unit and facility GLB, plus stricter validator checks for marker nodes and non-empty animation channels.
- Added layered facility detailing across economy buildings, attack towers and the furnace: snow/metal plinth trims, bolts, lamps, pulley/cable, saw guard, doors/signage, pipes, attack rings, chimney and flame crown. Functional parts now receive `Operate`/`Fire`/`Recoil` motion channels while preserving yaw/pitch/muzzle/recoil nodes.
- Updated the Blender runner to retry official Windows Blender through `cmd.exe` when a managed Node process returns `EPERM`; the existing `BLENDER_PATH` / PATH / common-root lookup order remains unchanged.
- Added deterministic unit/facility art-review render scripts and documented the visual review boundary. Generated source `.blend` and public GLB files with the complete `npm run art:export` batch using Blender 5.2.0 LTS.
- Re-ran `npm run art:validate`: 40/40 assets `ok`, no blocked/invalid results, no external URIs, no collision meshes, root scales unit, and triangle budgets remain below 60k. Character clips now expose 54 channels each; facility functional clips expose two channels where applicable.
- Removed Blender `.blend1` backup files from the workspace and ignored future backups; they are not authored deliverables.

- Raised the three baseline assets to the same authored standard: the hero now uses the segmented skeleton with seven 54-channel clips and layered coat/armour/sigil details; the basic turret gained bevelled support braces, barrel cowl, muzzle lens, ammo latch and recoil channels; the gate gained snow caps, armour bands, keystone/crest details and independent left/right door pivots for `GateOpen`/`GateClose`.
- Re-exported and revalidated the complete library after the baseline pass: all 40 assets remain `ok`; `hero.glb` is 48 nodes / 22 meshes / 2,756 triangles, and `wall_gate.glb` exports two-channel independent gate clips.
- Regression after the re-export: v6 49/49, v9 75/75, v10 12/12; `npm run typecheck` and escalated production `npm run build` pass. The default endurance playtest remains a separately tracked long-running v8 check and is not claimed as a fresh full-suite pass.

## 2026-08-02 | authored asset integration correction

- Fixed the auto-collector detail pass so both collector arms are parented under the facility root before GLB export; this removes stray root transforms and keeps Babylon hierarchy inspection deterministic.

## 2026-08-02 | authored asset silhouette refinement

- Added a new Blender geometry pass for the hero, warrior and flying colossus: tapered torso shells, coat tails, face/hood planes, armour guards, a profiled weapon, wing ribs, chest shell, brow, tail and claws.
- Added mechanical readability to the crossbow tower (shaped stock, bolt rail/head and draw wheels) and construction detail to the furnace (door assembly, flue, collar, cap and chimney blocks).
- Applied the shared torso-front/back shell treatment and light-metal material separation to the remaining authored unit library without changing Babylon skeleton, animation or functional-node contracts.
- Re-exported all 42 source `.blend` files and runtime `.glb` files with Blender 5.2.0 LTS. `npm run art:validate` remains 42/42 `ok` with no blocked or invalid assets.
- Refreshed the character and facility review sheets. Visual review remains an honest production checkpoint: these are authored stylized low-poly assets, not a final hand-sculpted/texture-painted commercial pack.

## 2026-08-02 | authored roster detail pass

- Added bespoke role kits to every one of the 26 character GLBs instead of relying only on the shared body: shield bosses and chevrons, archery bracers and arrows, medic satchels and vials, banner harnesses, mage robe/rune pieces, assault rigging, engineer goggles/tools, musketeer lapels/bayonet, frost mantle/icicles, enemy armour breaks, ammunition and flying-unit harnesses/talons.
- Added the missing character glass and gold material definitions required by engineer and musketeer details; the first batch stopped safely on those missing keys and was rerun from the beginning after correction.
- Re-exported the complete 42-asset library with `npm run art:export`; `npm run art:validate` remains 42/42 `ok` with skeleton, animation, LOD, root and collision checks intact.
- Babylon integration regression after the roster pass: v9 75/75 and v10 12/12. The full endurance suite remains a separate unfinished check and is not silently promoted to passed.

## 2026-08-02 | authored facility detail pass

- Added facility-specific construction kits instead of relying on the shared building shell: mine and gold-mine rails, cart wheels and ingots; lumberyard saw teeth, log cradle and crane hook; warehouse and recruit-hall window crosses and roof trusses; collector nozzles/filter/core lens; rebuilder repair arms/clamps; sniper sight housing/lens; and mortar breech/fuse details.
- Re-exported the complete 42-asset library after the facility pass with Blender 5.2.0 LTS. The final `npm run art:validate` report remains 42/42 `ok`, with no invalid or blocked assets.
- Re-rendered both review sheets so the visual evidence matches the latest authored GLBs.

## 2026-08-02 | authored construction detail pass

- Added a fourth-pass bodycraft layer to every character: inset torso panels,
  face sockets and irises, nose/mouth planes, cuffs, fasteners, shin plates,
  boot buckles, waist hardware and utility pouches. The additions remain bound
  to the existing UnitSkeleton/HeroSkeleton clips.
- Added hero harness/coat/gauntlet details, warrior collar and armour hardware,
  and flying-colossus muzzle, core, wing-tip and tail details.
- Added a shared facility service-panel language plus new crossbow-tower
  cheek plates, bolt magazine, string guide and deck rivets. The furnace gained
  an ember bed, grate, buttresses, service crown and ember core.
- Re-exported all 42 GLBs with Blender 5.2.0 LTS. Final validation for this
  pass is 42/42 `ok`; v9 is 75/75, v10 is 12/12, typecheck passes, and the
  production build passes with the existing large-chunk warning.

## 2026-08-02 | authored PBR response pass

- Updated the shared Blender Principled material helper with guarded Blender
  4/5 coat, sheen and specular inputs. Metal/enamel parts now receive tighter
  highlights while cloth/leather parts keep a softer stylized sheen.
- Re-exported the complete asset library after the material change and
  regenerated both review sheets. `art:validate` remains 42/42 `ok`; v9/v10,
  typecheck and production build were rerun successfully.

## 2026-08-02 | authored material value breakup pass

- Added deterministic top/underside material-slot variation to the authored
  unit, facility and hero parts. The pass reuses the existing light/dark
  palette variants for cloth, leather, metal, wood, stone and accents, making
  planar forms read more clearly without external textures or uncontrolled
  material growth.
- Re-exported all 42 Blender-authored assets with Blender 5.2.0 LTS and
  regenerated `reports/art-previews/unit-sheet.png` and
  `reports/art-previews/facility-sheet.png`. The runtime inventory is now
  42 GLBs / 14,748,308 bytes; `reports/art-validation.json` remains 42/42
  `ok` with no warnings or blocked assets.
- Regression after the pass: `node tools/playtest.mjs --suite v9` 75/75,
  `--suite v10` 12/12, `npm run typecheck`, and `npm run build` all pass. The
  known Vite large-chunk advisory remains informational.
- This remains an authored stylized low-poly pass. Manual UV/layout,
  hand-painted texture breakup, sculpted facial/cloth refinement and final
  commercial art-direction sign-off are still explicitly pending.

## 2026-08-02 | glTF surface contract and hero orientation audit

- Added deterministic planar UVs and `ArtTint` vertex colours to every
  authored render mesh. The exporter-compatible graph emits `TEXCOORD_0` and
  `COLOR_0` in all 42 GLBs. A nested packed-texture experiment was removed
  after it caused Blender's stock exporter to omit the vertex colour channel.
- Rebuilt the complete library with Blender 5.2.0 LTS: 42 GLBs,
  27,446,080 bytes total, zero external image URIs; `art:validate` reports
  42/42 `ok` with no blocked assets. Both review sheets were regenerated.
- Recorded representative asset contracts: hero 784,876 bytes / 111 nodes /
  85 meshes / 10 materials / one skeleton / 12,168 triangles / seven clips;
  turret 281,564 bytes / 33 nodes / 27 meshes / eight materials / 5,272
  triangles / five clips; wall gate 331,804 bytes / 54 nodes / 44 meshes /
  seven materials / 5,344 triangles / four clips.
- Documented the hero movement report: authored face markers and gameplay
  movement both use local +Z, while the follow camera is on the south
  (negative-Z) side. Moving toward the furnace therefore shows the hero's
  back; it is not reversed input or a backwards animation. Runtime
  face-marker calibration remains fail-safe in `HeroController`.
- Regression evidence: v9 75/75, v10 12/12, typecheck and production build
  all pass. The authored stylized low-poly assets still need manual UV,
  hand-painted texture, sculpted form and final human art-direction review.

## 2026-08-02 | focal silhouette and packed brush refinement

- Added a fifth-pass focal detail kit: layered cape and scarf tails, rib and
  harness accents, hood gem and weapon guard details for the hero; cloak,
  gorget, chest inset, sword guard and shoulder rivets for the warrior;
  crown/core rings, tail fin, wing edges and tusks for the flying colossus;
  tie rods, vents, window inset and crown bolts for the furnace; and a
  mount plate, collar, limb tips, draw cams, bolt collar and fletching for
  the crossbow tower. Existing skeletons and facility animation pivots remain
  intact.
- Added a deterministic packed colour-aware brush image layer only to the
  five focal assets (hero, warrior, flying colossus, furnace and crossbow
  tower). Images are embedded in the GLBs; the exporter still emits both
  `TEXCOORD_0` and `COLOR_0`, and no external image URI is introduced.
- Re-exported the full 42-asset library with Blender 5.2.0 LTS and regenerated
  both review sheets. The direct inventory is 42 GLBs / 28,003,628 bytes;
  `reports/art-validation.json` is 42/42 `ok`, zero blocked, zero invalid,
  zero external image URIs, and 54 embedded images.
- Representative focal contracts: `hero.glb` 910,348 bytes / 123 nodes /
  97 meshes / 10 materials / one skeleton / 14,000 triangles / seven clips;
  `warrior.glb` 963,908 bytes / 140 nodes / 114 meshes / 13 materials /
  one skeleton / 14,340 triangles / six clips; `flyingColossus.glb`
  1,202,088 bytes / 170 nodes / 144 meshes / 14 materials / one skeleton /
  18,744 triangles / six clips; `furnace.glb` 772,760 bytes / 93 nodes /
  87 meshes / 10 materials / 12,728 triangles / seven clips; and
  `crossbow_tower.glb` 563,172 bytes / 72 nodes / 65 meshes / 15 materials /
  9,960 triangles / seven clips.
- Runtime evidence after the pass: v9 75/75, v10 12/12,
  `npm run typecheck`, and `npm run build` all pass. The existing Vite
  large-chunk advisory remains informational.
- This remains an authored stylized low-poly refinement with a deterministic
  packed brush breakup, not a claim of hand-painted UV texturing,
  hand-sculpted forms or final human commercial art-direction sign-off.

## 2026-08-02 | full-roster role construction and embedded brush pass

- Extended the authored construction language from the focal five to the full
  42-asset library: every ally, enemy and flying unit now receives a
  role-specific tertiary layer (helmets, straps, pouches, weapon hardware,
  wing spars or other readable equipment), while every facility receives a
  functional third layer (service rails, braces, latches, lamps, guides or
  structural fasteners). The existing skeleton, animation and gameplay socket
  contracts remain unchanged.
- Enabled the deterministic packed brush image layer for every authored unit,
  facility and resource prop. Images remain embedded in the GLBs; the
  exporter still emits `TEXCOORD_0` and `COLOR_0`, with zero external URIs.
- Rebuilt the full library with Blender 5.2.0 LTS and regenerated both review
  sheets. The current inventory is 42 GLBs / 30,989,344 bytes / 487 embedded
  images. `reports/art-validation.json` is 42/42 `ok`, zero blocked, zero
  invalid and zero external image or buffer URIs.
- Confirmed the apparent hero reverse-facing report in the runtime: the
  authored face markers and `yawFromDirection` both use local +Z, W moves the
  hero toward +Z, and the follow camera is on the south (-Z) side. The camera
  therefore sees the hero's back while he walks toward the furnace; input,
  velocity and walk animation are not reversed. This remains documented in
  `src/hero/HeroController.ts` and the art audit.
- Regression evidence after the pass: v9 75/75, v10 12/12,
  `npm run typecheck`, and `npm run build` pass. The known Vite large-chunk
  advisory remains informational; `npm test` is not defined in `package.json`.

This is a broader authored stylized low-poly construction and embedded-surface
pass, not a claim of human hand-painted UV layouts, hand-sculpted forms or
final commercial art-direction sign-off. Manual review of the remaining
commercial-art boundary is still open.

## 2026-08-02 | tenth-pass projected UV and material-aware brush surface

- Reworked `scripts/blender/common.py` surface authoring so all authored
  render meshes receive a dominant-face-plane UV projection. Vertical walls,
  torso panels and horizontal caps now receive height-aware coordinates rather
  than the previous global X/Z projection.
- Replaced the tiny generic brush layer with a deterministic 64x64 packed
  surface layer whose variation is selected by material family: directional
  metal grain, wood/leather grain, stone flecks, cloth weave and ice/crystal
  breakup. The exporter-safe `ArtTint` vertex colour path remains in place.
- Rebuilt and exported the complete 42-asset library with Blender 5.2.0 LTS,
  then regenerated both review sheets. The direct inventory is 42 GLBs /
  36,223,108 bytes / 487 embedded images / zero external image URIs.
  `reports/art-validation.json` reports 42/42 `ok`, with no blocked or
  invalid assets.
- Representative current contracts: `hero.glb` 1,035,216 bytes / 123 nodes /
  97 meshes / 10 materials / one skeleton / 14,000 triangles / seven clips;
  `turret_basic.glb` 423,364 bytes / 39 nodes / 33 meshes / eight materials /
  6,104 triangles / five clips; `wall_gate.glb` 453,816 bytes / 62 nodes /
  52 meshes / seven materials / 6,180 triangles / four clips.
- Regression evidence after the pass: v9 75/75, v10 12/12,
  `npm run typecheck`, and `npm run build` all pass. The known Vite large
  chunk advisory remains informational.

This pass improves measurable UV coverage and surface readability, but the
assets are still stylized procedural low-poly work. Manual UV layout,
hand-painted texture authoring, sculpted facial/cloth forms and final human
commercial art-direction sign-off remain open.

## 2026-08-02 | eleventh-pass organic body volumes and adaptive architectural edges

- Added a shared low-poly `ellipsoid` primitive and replaced the common unit
  torso, arms and legs with explicit rounded volumes. The existing role kits,
  sockets, collision roots, skeleton bindings and animation names are kept;
  this is a silhouette change intended to reduce the mannequin/block-stack
  read across all 26 character assets.
- Added a restrained adaptive bevel rule for broad cube-based architectural
  panels. Large building masses now receive a wider, bounded edge treatment
  while small fasteners keep their authored bevels. This improves highlight
  continuity without indiscriminately increasing every mesh's polygon count.
- Rebuilt all 42 source blends and re-exported the complete GLB library with
  Blender 5.2.0 LTS. The current inventory is 42 GLBs / 38,180,784 bytes /
  487 embedded images / zero external image or buffer URIs. The latest
  `reports/art-validation.json` is 42/42 `ok`.
- Babylon evidence after the geometry pass: v9 75/75 and v10 12/12. The
  existing runtime still attaches authored assets with the procedural visual
  path as a fail-safe; this pass does not remove that fallback boundary.

### Current commercial-art difficulty inventory

- The construction is still procedural low-poly: the shared unit builder uses
  125 `box` calls and 68 `prism` calls, and the building builder uses 115
  `box` calls and 30 `prism` calls. The new volumes soften silhouettes but do
  not equal hand-sculpted topology.
- The 487 images are deterministic 64x64 packed brush layers, not hand-painted
  UV atlases with authored normal, roughness or detail maps. Per-face UV
  projection is functional but still a technical fallback for art review.
- The review sheets currently show only 6/26 characters and 4/14 facilities,
  and their labels are not reliably legible. Full-roster game-camera review is
  still missing, so the weakest silhouettes cannot yet be signed off.
- Animation and moving-node contracts are structurally present, but shared
  generic clips do not prove role-specific acting, attack timing or natural
  cloth/weapon motion. A per-asset Babylon visual review remains required.
- 38 MB of GLBs and roughly 488k triangles are technically within the current
  validator budget, but simultaneous roster/wave load performance has not yet
  been profiled as a commercial target.

The commercial-art goal therefore remains open. The next priority is a full
roster review sheet plus manual-quality focal passes for hero, warrior,
flyingColossus, furnace and crossbow/turret before claiming display readiness.

## 2026-08-02 | visual-effects implementation checkpoint

- Stopped the visual-effects/material expansion at the safe write boundary.
- Fixed the full-roster Blender review tool so imported assets are centered by
  their visible mesh bounds; this removes misleading off-center placement for
  assets with authored root offsets without changing shipped GLBs or runtime
  transforms.
- Re-rendered `reports/art-previews/unit-roster-full.png` and
  `reports/art-previews/facility-roster-full.png`; the Blender startup Cube is
  cleared before import and both sheets now show the complete authored roster.
- No new effect type, material framework, asset family, or refactor was added
  after this checkpoint. Remaining commercial-art gaps stay documented in the
  art-quality audit.

## 2026-08-03 | Hero-R3 A review lighting and real frame metrics

- Added a dedicated Babylon review presentation state with neutral lighting and
  no inherited bloom/fog/vignette overexposure.
- Review captures now record per-frame and rolling draw calls, measured FPS, p50/p95 frame times, and visible Hero geometry counts.
- Formal R3-A runtime evidence is under `reports/art-previews/hero-commercial-r3/R3-A/`; Hero geometry is unchanged.
## 2026-08-03 | Hero-R3 B commercial body proportions

- Rebuilt only the Hero continuous body loft: distinct pelvis, pinched waist,
  chest/shoulder break, longer legs, separated feet, and clearer side depth.
- Kept the 10 authored LOD0 object budget, HeroRoot/HeroSkeleton/sockets, seven
  animation clips, and existing Babylon runtime contract intact.
- Added R3-B Babylon runtime evidence under
  `reports/art-previews/hero-commercial-r3/R3-B/`; clothing, UV/materials, and
  weighted deformation remain subsequent stages.
## 2026-08-03 | Hero-R3 C clothing and survival identity

- Added two purposeful Hero meshes: a consolidated chest-bound survival pack/
  harness/yoke/pouch mesh and a head-bound goggle band/lens mesh.
- Corrected the first pass's overly broad flat gear panel, verified front/back
  placement in Babylon, and consolidated new material slots to keep LOD0 at
  31 render primitives (below the 32 ceiling).
- Added R3-C runtime review evidence under
  `reports/art-previews/hero-commercial-r3/R3-C/`; UV atlas/material rebuild and
  weighted deformation remain later stages.

## 2026-08-03 | Hero-R3 D UV atlas and material authoring

- Replaced Hero's nine embedded 64×64 brush images with one embedded
  `HERO_ATLAS_1024` 1024×1024 atlas and eight shared material slots.
- Preserved the R3-C mesh/skeleton/socket/animation contract; no other asset
  family was regenerated.
- Added Babylon runtime evidence and before/after metrics under
  `reports/art-previews/hero-commercial-r3/R3-D/`; commercial visual quality
  remains a human review decision.

## 2026-08-03 | Hero-R3 E weighted deformation and combat animation

- Bound all 31 Hero LOD0 render primitives to `HeroSkeleton` with weighted
  Armature modifiers; the shared unit builder and every non-Hero asset remain
  unchanged.
- Added Hero-specific combat follow-through/recovery keys and deterministic
  paused-loop review stepping so the 21-frame sequence shows real clip motion.
- Added runtime evidence under
  `reports/art-previews/hero-commercial-r3/R3-E/`; validator output now checks
  for JOINTS_0/WEIGHTS_0 and still does not claim commercial animation quality.

## 2026-08-03 | Hero-R3 F identity-preserving LOD rebuild (runtime evidence pending)

- Replaced the old LOD1/LOD2 head-and-body proxies with six authored identity
  parts per tier: body, head/visor, survival gear, goggles, coat/cape, and
  weapon. LOD0 geometry and all Hero runtime contracts remain unchanged.
- The rebuilt GLB validates with 24 meshes, 7 materials, one embedded 1024px
  atlas, one skeleton, seven clips, 31 skinned LOD0 primitives, and distinct
  LOD1/LOD2 geometry (652/360 triangles). These LOD triangle counts remain
  below the R3 target budgets and are reported as remaining art work.
- Runtime capture is currently blocked by the managed environment refusing the
  Chromium child process (`spawn EPERM`); no old screenshot is being reused as
  R3-F evidence.

## 2026-08-03 | Hero-R4 A true mid-poly body foundation

- Rebuilt the Hero LOD0 body, head, arms and legs from authored anatomical
  edge-loop profiles rather than the previous ultra-low-poly volume. Pelvis,
  waist, ribcage, shoulder, elbow, knee and boot transitions now have dedicated
  control loops; no subdivision modifier was added.
- LOD0 now measures 8,126 vertices / 16,124 triangles across 12 render meshes
  and 31 glTF primitives. The existing 18-bone smooth Armature binding, seven
  animation clips, sockets, atlas and runtime contract are preserved.
- Added Blender clay/topology review evidence under
  `reports/art-previews/hero-commercial-r4/R4-A/`. R4-A remains a geometry
  foundation checkpoint; clothing, deformation validation and production LODs
  are deferred to R4-B through R4-D.

## 2026-08-03 | Hero-R4 B commercial clothing and equipment forms

- Replaced the flat R3 survival-gear profile with four authored looped forms:
  jacket shell, joined shoulder/chest armor, shaped rear backpack/flap, and
  helmet shell. The second pass corrected rear placement, pack depth and the
  chest-plate footprint after clay review.
- LOD0 now measures 10,486 vertices / 20,852 triangles across 15 render meshes
  and 15 glTF primitives. Material slots were deliberately consolidated to
  four exported primary materials while retaining the single 1024 atlas.
- Added Blender review evidence under
  `reports/art-previews/hero-commercial-r4/R4-B/`; deformation and production
  LOD validation remain R4-C/R4-D work.

## 2026-08-03 | Hero-R4 C weighted mid-poly deformation

- Added a Blender-only deformation contract for the R4-B LOD0 mesh: all 15
  render meshes use the existing 18-bone HeroSkeleton, weights are normalized,
  and 4,660 vertices have multiple bone influences.
- Added nine explicit clay pose frames and their manifest under
  `reports/art-previews/hero-commercial-r4/R4-C/`; the renderer disables NLA
  evaluation and keeps the rig's authored root bind orientation for review.
- Structural skinning checks pass; pose/clipping and commercial animation
  quality remain human review decisions. Production LOD work is deferred to
  R4-D.

## 2026-08-03 | Hero-R4 D production LOD rebuild (runtime blocked)

- Rebuilt LOD1 and LOD2 from the R4-B mid-poly loop volumes instead of the
  previous low-density proxy stack. LOD1 is 7,980 triangles / 8 meshes and
  LOD2 is 2,304 triangles / 5 meshes; both retain the Hero head/visor,
  shoulders, limbs, survival gear and weapon identity.
- Added `LOD*_PROD` runtime classification to Babylon's ModelLoader,
  CharacterFactory and asset validators, and skinned the production tiers to
  the existing 18-bone HeroSkeleton without changing LOD0 or other assets.
- Added Blender LOD evidence under
  `reports/art-previews/hero-commercial-r4/R4-D/`.
- Babylon/Vite runtime capture and production build remain blocked by the
  managed Windows `spawn EPERM` esbuild child-process restriction; no runtime
  pass or commercial-quality claim is made. See `runtime-blocked.md`.
