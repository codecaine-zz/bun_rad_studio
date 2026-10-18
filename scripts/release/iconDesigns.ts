// The design of every Mac app icon: which symbol or drawing says what the app is, and its colors.
// Symbols are Apple SF Symbol names (checked to exist on macOS 26); `custom` names a shape the renderer draws itself
// (games with no matching symbol); `text` draws characters (the regex studio shows `.*`).
export interface Design {
  symbol?: string;
  custom?: string;
  text?: string;
}

export const DESIGNS: Record<string, Design> = {
  // Developer tools
  "api-studio": { symbol: "arrow.left.arrow.right" },
  "app-bundler-studio": { symbol: "shippingbox.fill" },
  "code-studio": { symbol: "chevron.left.forwardslash.chevron.right" },
  "dataconvert-studio": { symbol: "arrow.triangle.2.circlepath" },
  "devtools-studio": { symbol: "wrench.and.screwdriver.fill" },
  "env-studio": { symbol: "key.fill" },
  "git-studio": { symbol: "arrow.triangle.branch" },
  "jq-studio": { symbol: "curlybraces" },
  "omnitool-studio": { symbol: "gearshape.2.fill" },
  "rad-studio": { symbol: "hammer.fill" },
  "regex-studio": { text: ".*" },
  "sd-studio": { symbol: "text.magnifyingglass" },
  "subprocess-pipe-studio": { symbol: "point.3.connected.trianglepath.dotted" },
  "tokei-studio": { symbol: "chart.bar.xaxis" },
  "watchexec-studio": { symbol: "eye.fill" },
  // File and directory tools
  "fd-studio": { symbol: "sparkle.magnifyingglass" },
  "file-manager-studio": { symbol: "folder.fill" },
  "gdu-studio": { symbol: "chart.pie.fill" },
  "rip-studio": { symbol: "trash.fill" },
  // Databases
  "mysql-studio": { symbol: "server.rack" },
  "postgres-studio": { symbol: "cylinder.split.1x2.fill" },
  "redis-studio": { symbol: "bolt.horizontal.fill" },
  "sqlite-studio": { symbol: "internaldrive.fill" },
  // Network and security
  "doggo-studio": { symbol: "pawprint.fill" },
  "ipinfo-studio": { symbol: "mappin.and.ellipse" },
  "network-studio": { symbol: "network" },
  "crypto-studio": { symbol: "lock.shield.fill" },
  "subfinder-studio": { symbol: "scope" },
  // System and hardware
  "brew-studio": { symbol: "mug.fill" },
  "process-studio": { symbol: "gauge.with.dots.needle.67percent" },
  "procs-studio": { symbol: "list.bullet.rectangle.portrait.fill" },
  "system-studio": { symbol: "cpu.fill" },
  "task-manager": { symbol: "speedometer" },
  // Productivity
  "calculator-studio": { symbol: "plus.forwardslash.minus" },
  "interval-timer-studio": { symbol: "stopwatch.fill" },
  "markdown-studio": { symbol: "doc.richtext.fill" },
  "world-time-zones-studio": { symbol: "globe.europe.africa.fill" },
  // Design
  "color-studio": { symbol: "swatchpalette.fill" },
  "paint-studio": { symbol: "paintbrush.pointed.fill" },
  // RAD
  "launcher-studio": { symbol: "square.grid.2x2.fill" },
  "rad-designer": { symbol: "rectangle.3.group.fill" },
  // Games
  "balatro-studio": { symbol: "suit.spade.fill" },
  "blackjack-studio": { symbol: "suit.club.fill" },
  "breakout-studio": { custom: "breakout" },
  "codecaine-bros-studio": { symbol: "gamecontroller.fill" },
  "connect4-studio": { custom: "connect4" },
  "dr-codecaine-studio": { symbol: "cross.case.fill" },
  "flappy-bird-studio": { symbol: "bird.fill" },
  "frogger-studio": { custom: "frog" },
  "lolo-studio": { symbol: "heart.fill" },
  "math-munchers-studio": { symbol: "plusminus.circle.fill" },
  "maze-generator-studio": { custom: "maze" },
  "minesweeper-studio": { custom: "minesweeper" },
  "pacman-studio": { custom: "pacman" },
  "poker-studio": { symbol: "suit.diamond.fill" },
  "pong-studio": { custom: "pong" },
  "rat-screw-studio": { symbol: "hand.raised.fill" },
  "rodents-revenge-studio": { symbol: "pawprint.fill" },
  "skifree-studio": { symbol: "figure.skiing.downhill" },
  "snake-studio": { custom: "snake" },
  "tetris-studio": { custom: "tetris" },
  "tictactoe-studio": { custom: "tictactoe" },
  "typing-studio": { symbol: "keyboard.fill" },
  "word-search-studio": { symbol: "textformat.abc" },
  "yahtzee-studio": { symbol: "die.face.5.fill" },
};

/** Every SF Symbol name used, so a test can check they all exist on this Mac. */
export const SYMBOL_NAMES = [...new Set(Object.values(DESIGNS).flatMap((d) => (d.symbol ? [d.symbol] : [])))].sort();
