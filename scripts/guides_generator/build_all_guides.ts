import { generateCoreWorkstations } from "./core_workstations";
import { generateDeveloperUtilities } from "./developer_utilities";
import { generateEngineeringSystems } from "./engineering_systems";
import { generateCliReplacements } from "./cli_replacements";
import { generateComputingFitness } from "./computing_fitness";
import { generateRetroArcadeGames } from "./retro_arcade_games";
import { generateRedisGuide } from "./redis_guide";
import { generateMasterHub } from "./master_hub";
import { join } from "path";

const outDir = join(process.cwd(), "docs", "userguides");

console.log("🚀 Generating AAA Production User Guides for all 40 applications in:", outDir);

generateCoreWorkstations(outDir);
generateDeveloperUtilities(outDir);
generateEngineeringSystems(outDir);
generateCliReplacements(outDir);
generateComputingFitness(outDir);
generateRetroArcadeGames(outDir);
generateRedisGuide(outDir);
generateMasterHub(outDir);

console.log("✨ All 40 User Guides and Master README successfully generated!");
