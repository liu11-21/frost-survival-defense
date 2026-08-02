# 變更脈絡

## 2026-08-02｜Blender 製作 3D 資產 → GLB → Babylon.js 整合

- 建立 `assets-source/` Blender 工作區、風格規範、概念圖流程、授權紀錄與可重複執行的英雄／基礎砲塔／城牆閘門建模腳本。
- 新增 `art:template`、`art:hero`、`art:turret`、`art:wall`、`art:export`、`art:validate` 指令；模型驗證器會輸出 `reports/art-validation.json`，缺少 GLB 時明確標記為 `blocked`。
- 新增 Babylon `AssetRegistry`／`ModelLoader` 快取、節點與動畫契約驗證、碰撞網格隱藏，以及載入失敗時的程序化模型回退；建築與主角均有 authored visual hook。
- 已檢查本機 Blender：目前未安裝，因此本次不宣稱已產出任何 GLB 或 `.blend` 二進位檔；安裝 Blender LTS 後執行 `npm run art:export` 即可生成。
- 驗證結果：`npm run typecheck`、production build、`node tools/playtest.mjs --suite v9`（75/75）與 `--suite v10`（12/12）通過；`git diff --check` 通過。完整預設 suite 超過本次命令執行時間上限，未將其誤報為通過。
- 測試說明同步放在 `docs/art/TESTING.md`，涵蓋 Blender 缺失時的 blocked 報告與 GLB 生成後的嚴格驗證。

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
