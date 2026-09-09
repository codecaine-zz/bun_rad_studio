/**
 * Multi-stage task execution pipeline with animated step spinners, timers, and summary reporting
 */

import { Ansi } from './ansi.ts';
import type { PipelineStep } from './types.ts';

export class Pipeline {
  public title: string;
  public steps: PipelineStep[] = [];
  private noColor: boolean = false;

  constructor(title: string, noColor: boolean = false) {
    this.title = title;
    this.noColor = noColor;
  }

  public addStep(name: string, stepFn: () => boolean | Promise<boolean>): this {
    this.steps.push({ name, stepFn });
    return this;
  }

  public async run(): Promise<boolean> {
    const divider = '─'.repeat(Math.min(60, process.stdout.columns || 60));
    console.log(`\n${Ansi.bold(Ansi.cyan('▶'))} ${Ansi.bold(this.title)}`);
    console.log(Ansi.dim(divider));

    const totalStart = performance.now();
    let passedCount = 0;
    let failedCount = 0;

    const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];
      if (!step) continue;
      const stepNum = i + 1;
      const stepPrefix = `[${stepNum}/${this.steps.length}] ${step.name}`;

      let frameIdx = 0;
      let spinnerTimer: any = null;

      if (process.stdout.isTTY && !this.noColor) {
        process.stdout.write(`  ${Ansi.cyan(spinnerFrames[0] || '⠋')} ${stepPrefix}...`);
        spinnerTimer = setInterval(() => {
          frameIdx = (frameIdx + 1) % spinnerFrames.length;
          process.stdout.write(`\r  ${Ansi.cyan(spinnerFrames[frameIdx] || '⠋')} ${stepPrefix}...`);
        }, 80);
      } else {
        console.log(`  ○ ${stepPrefix}...`);
      }

      const stepStart = performance.now();
      let success = false;
      try {
        success = await step.stepFn();
      } catch (err) {
        success = false;
      }
      const stepDuration = Math.round(performance.now() - stepStart);

      if (spinnerTimer) {
        clearInterval(spinnerTimer);
      }

      if (process.stdout.isTTY && !this.noColor) {
        process.stdout.write('\r' + Ansi.clearLine());
      }

      if (success) {
        passedCount++;
        const check = this.noColor ? '[OK]' : Ansi.green('✓');
        const dur = Ansi.dim(`(${stepDuration} ms)`);
        console.log(`  ${check} ${stepPrefix} ${dur}`);
      } else {
        failedCount++;
        const cross = this.noColor ? '[FAILED]' : Ansi.red('✖');
        const dur = Ansi.dim(`(${stepDuration} ms)`);
        console.log(`  ${cross} ${stepPrefix} ${dur} ${Ansi.red('[FAILED]')}`);
        break; // Pipeline aborts on failure
      }
    }

    const totalDuration = ((performance.now() - totalStart) / 1000).toFixed(2);
    console.log(Ansi.dim(divider));

    if (failedCount === 0) {
      const tag = this.noColor ? 'SUCCESS' : Ansi.green(Ansi.bold('PIPELINE PASSED'));
      console.log(`✨ ${tag}: Completed ${passedCount}/${this.steps.length} steps in ${totalDuration}s\n`);
      return true;
    } else {
      const tag = this.noColor ? 'FAILED' : Ansi.red(Ansi.bold('PIPELINE FAILED'));
      console.log(`💥 ${tag}: Stopped at step ${passedCount + 1}/${this.steps.length} after ${totalDuration}s\n`);
      return false;
    }
  }
}
