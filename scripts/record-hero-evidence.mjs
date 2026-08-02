import fs from "node:fs/promises";
import path from "node:path";

const [stage = "baseline", iteration = "0", note = ""] = process.argv.slice(2);
const repo = process.cwd();
const reportPath = path.join(repo, "reports", "art-validation.json");
const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
const hero = report.assets.find((asset) => asset.key === "hero");
if (!hero) throw new Error("Hero asset is missing from art-validation.json");

const stageDir = path.join(repo, "reports", "art-previews", "hero-commercial", stage);
await fs.mkdir(stageDir, { recursive: true });
const evidence = {
  stage,
  iteration: Number(iteration),
  note,
  recordedAt: report.generatedAt,
  contract: {
    source: "GLB",
    scene: "Babylon formal uiVerification scene",
    requiredNodes: ["HeroRoot", "HeroSkeleton", "weapon_socket.R", "ranged_socket", "LOD1", "LOD2"],
    requiredAnimations: ["Idle", "Walk", "Run", "MeleeAttack", "RangedAttack", "Hit", "Death"],
  },
  metrics: hero,
};
const outputPath = path.join(stageDir, `metrics-iteration-${Number(iteration)}.json`);
await fs.writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(outputPath);
