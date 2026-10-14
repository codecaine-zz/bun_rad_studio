/** Help dictionaries by app id. One file per app; see `../helpTips.ts` for the key formats. */
import type { HelpTips, SkipRule } from "../helpMatch";
import { apiStudioTips, apiStudioSkip } from "./api_studio";
import { appBundlerStudioTips, appBundlerStudioSkip } from "./app_bundler_studio";
import { brewStudioTips, brewStudioSkip } from "./brew_studio";
import { calculatorStudioTips, calculatorStudioSkip } from "./calculator_studio";
import { codeStudioTips, codeStudioSkip } from "./code_studio";
import { colorStudioTips, colorStudioSkip } from "./color_studio";
import { cryptoStudioTips, cryptoStudioSkip } from "./crypto_studio";
import { databaseStudioTips, databaseStudioSkip } from "./database_studio";
import { dataconvertStudioTips, dataconvertStudioSkip } from "./dataconvert_studio";
import { doggoStudioTips, doggoStudioSkip } from "./doggo_studio";
import { designerSkip, designerTips } from "./designer";
import { envStudioSkip, envStudioTips } from "./env_studio";
import { fdStudioTips, fdStudioSkip } from "./fd_studio";
import { gduStudioTips, gduStudioSkip } from "./gdu_studio";
import { gitStudioTips, gitStudioSkip } from "./git_studio";
import { intervalTimerStudioTips, intervalTimerStudioSkip } from "./interval_timer_studio";
import { ipinfoStudioTips, ipinfoStudioSkip } from "./ipinfo_studio";
import { jqStudioTips, jqStudioSkip } from "./jq_studio";
import { launcherStudioTips, launcherStudioSkip } from "./launcher_studio";
import { markdownStudioTips, markdownStudioSkip } from "./markdown_studio";
import { mysqlStudioTips, mysqlStudioSkip } from "./mysql_studio";
import { networkStudioTips, networkStudioSkip } from "./network_studio";
import { omnitoolStudioTips, omnitoolStudioSkip } from "./omnitool_studio";
import { paintStudioTips, paintStudioSkip } from "./paint_studio";
import { postgresStudioTips, postgresStudioSkip } from "./postgres_studio";
import { procsStudioTips, procsStudioSkip } from "./procs_studio";
import { radStudioTips, radStudioSkip } from "./rad_studio";
import { redisStudioTips, redisStudioSkip } from "./redis_studio";
import { regexStudioTips, regexStudioSkip } from "./regex_studio";
import { ripStudioTips, ripStudioSkip } from "./rip_studio";
import { sdStudioTips, sdStudioSkip } from "./sd_studio";
import { sqliteStudioTips, sqliteStudioSkip } from "./sqlite_studio";
import { subfinderStudioTips, subfinderStudioSkip } from "./subfinder_studio";
import { subprocessPipeStudioTips, subprocessPipeStudioSkip } from "./subprocess_pipe_studio";
import { taskManagerTips, taskManagerSkip } from "./task_manager";
import { tokeiStudioTips, tokeiStudioSkip } from "./tokei_studio";
import { watchexecStudioTips, watchexecStudioSkip } from "./watchexec_studio";
import { worldTimeZonesStudioTips, worldTimeZonesStudioSkip } from "./world_time_zones_studio";

export const HELP_TIPS: Record<string, HelpTips> = {
  designer: designerTips,
  env_studio: envStudioTips,
  api_studio: apiStudioTips,
  app_bundler_studio: appBundlerStudioTips,
  brew_studio: brewStudioTips,
  calculator_studio: calculatorStudioTips,
  code_studio: codeStudioTips,
  color_studio: colorStudioTips,
  crypto_studio: cryptoStudioTips,
  database_studio: databaseStudioTips,
  dataconvert_studio: dataconvertStudioTips,
  omnitool_studio: omnitoolStudioTips,
  doggo_studio: doggoStudioTips,
  fd_studio: fdStudioTips,
  gdu_studio: gduStudioTips,
  git_studio: gitStudioTips,
  interval_timer_studio: intervalTimerStudioTips,
  ipinfo_studio: ipinfoStudioTips,
  jq_studio: jqStudioTips,
  launcher_studio: launcherStudioTips,
  markdown_studio: markdownStudioTips,
  mysql_studio: mysqlStudioTips,
  network_studio: networkStudioTips,
  paint_studio: paintStudioTips,
  postgres_studio: postgresStudioTips,
  task_manager: taskManagerTips,
  procs_studio: procsStudioTips,
  rad_studio: radStudioTips,
  redis_studio: redisStudioTips,
  regex_studio: regexStudioTips,
  rip_studio: ripStudioTips,
  sd_studio: sdStudioTips,
  sqlite_studio: sqliteStudioTips,
  subfinder_studio: subfinderStudioTips,
  subprocess_pipe_studio: subprocessPipeStudioTips,
  tokei_studio: tokeiStudioTips,
  watchexec_studio: watchexecStudioTips,
  world_time_zones_studio: worldTimeZonesStudioTips,
};

/** Controls that need no tip, by app id. */
export const HELP_SKIP: Record<string, SkipRule[]> = {
  designer: designerSkip,
  env_studio: envStudioSkip,
  api_studio: apiStudioSkip,
  app_bundler_studio: appBundlerStudioSkip,
  brew_studio: brewStudioSkip,
  calculator_studio: calculatorStudioSkip,
  code_studio: codeStudioSkip,
  color_studio: colorStudioSkip,
  crypto_studio: cryptoStudioSkip,
  database_studio: databaseStudioSkip,
  dataconvert_studio: dataconvertStudioSkip,
  omnitool_studio: omnitoolStudioSkip,
  doggo_studio: doggoStudioSkip,
  fd_studio: fdStudioSkip,
  gdu_studio: gduStudioSkip,
  git_studio: gitStudioSkip,
  interval_timer_studio: intervalTimerStudioSkip,
  ipinfo_studio: ipinfoStudioSkip,
  jq_studio: jqStudioSkip,
  launcher_studio: launcherStudioSkip,
  markdown_studio: markdownStudioSkip,
  mysql_studio: mysqlStudioSkip,
  network_studio: networkStudioSkip,
  paint_studio: paintStudioSkip,
  postgres_studio: postgresStudioSkip,
  task_manager: taskManagerSkip,
  procs_studio: procsStudioSkip,
  rad_studio: radStudioSkip,
  redis_studio: redisStudioSkip,
  regex_studio: regexStudioSkip,
  rip_studio: ripStudioSkip,
  sd_studio: sdStudioSkip,
  sqlite_studio: sqliteStudioSkip,
  subfinder_studio: subfinderStudioSkip,
  subprocess_pipe_studio: subprocessPipeStudioSkip,
  tokei_studio: tokeiStudioSkip,
  watchexec_studio: watchexecStudioSkip,
  world_time_zones_studio: worldTimeZonesStudioSkip,
};
