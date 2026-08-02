# 變更脈絡

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
