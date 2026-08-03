# Hero R4 final silhouette correction

本節點只修正 Hero 現有 LOD 幾何，不修改其他角色、設施、遊戲程式或 H1–H6 資產階段。

## 修正內容

- LOD1／LOD2 visor 改為頭部連續網格上的材質帶；移除會在三分之四視角形成長鼻狀突出物的重複頭部／浮動 goggles 體積。
- LOD0 與 production LOD 胸甲縮小並退回腰線，保留肩部與上臂的連接空間。
- 前方披掛由腰線開始，採逐段收窄的外套下擺，降低硬板感與腿部穿插風險。
- 肩甲縮小並靠近上臂；背包略向後移以維持背面角色辨識。
- LOD1／LOD2 的既有 weapon mesh 保留近戰刀身與遠程槍體主輪廓，沒有新增 render object。

## Clay 證據

每個 production tier 均輸出四個視角：

- `lod0-front.png`、`lod0-side.png`、`lod0-back.png`、`lod0-three-quarter.png`
- `lod1-front.png`、`lod1-side.png`、`lod1-back.png`、`lod1-three-quarter.png`
- `lod2-front.png`、`lod2-side.png`、`lod2-back.png`、`lod2-three-quarter.png`

這些是 Blender clay review 證據，只用於檢查輪廓與 LOD 一致性，不宣稱材質、動畫或商業美術品質已通過人工簽核。

## 靜態結果

`npm run art:validate:hero` 通過：GLB、骨架、七段動畫、材質／貼圖、碰撞與 LOD contract 均有效。Babylon runtime 驗證另行記錄於 `runtime-blocked.md`（若啟動仍受受管控 Windows `spawn EPERM` 阻擋）。
