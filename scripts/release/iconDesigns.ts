// The design of every Mac app icon: which symbol or drawing says what the app is, its secondary badge, and its colors.
// Symbols are Apple SF Symbol names (checked to exist on macOS 26); `custom` names a shape the renderer draws itself
// (games with no matching symbol); `text` draws characters (the regex studio shows `.*`).
export interface Design {
  symbol?: string;
  custom?: string;
  text?: string;
  badge?: string;
}

export const DESIGNS: Record<string, Design> = {
  // Developer tools
  "api-studio": { symbol: "arrow.left.arrow.right", badge: "bolt.fill" },
  "app-bundler-studio": { symbol: "shippingbox.fill", badge: "hammer.fill" },
  "code-studio": { symbol: "chevron.left.forwardslash.chevron.right", badge: "terminal.fill" },
  "dataconvert-studio": { symbol: "arrow.triangle.2.circlepath", badge: "doc.text.fill" },
  "devtools-studio": { symbol: "wrench.and.screwdriver.fill", badge: "terminal.fill" },
  "env-studio": { symbol: "key.fill", badge: "lock.fill" },
  "git-studio": { symbol: "arrow.triangle.branch", badge: "checkmark.seal.fill" },
  "jq-studio": { symbol: "curlybraces", badge: "magnifyingglass" },
  "omnitool-studio": { symbol: "gearshape.2.fill", badge: "bolt.fill" },
  "rad-studio": { symbol: "hammer.fill", badge: "wand.and.stars" },
  "regex-studio": { text: ".*", badge: "magnifyingglass" },
  "sd-studio": { symbol: "text.magnifyingglass", badge: "arrow.triangle.2.circlepath" },
  "subprocess-pipe-studio": { symbol: "point.3.connected.trianglepath.dotted", badge: "terminal.fill" },
  "tokei-studio": { symbol: "chart.bar.xaxis", badge: "chevron.left.forwardslash.chevron.right" },
  "watchexec-studio": { symbol: "eye.fill", badge: "bolt.fill" },
  // File and directory tools
  "fd-studio": { symbol: "sparkle.magnifyingglass", badge: "folder.fill" },
  "file-manager-studio": { symbol: "folder.fill", badge: "sparkles" },
  "gdu-studio": { symbol: "chart.pie.fill", badge: "internaldrive.fill" },
  "rip-studio": { symbol: "trash.fill", badge: "shield.lefthalf.filled" },
  // Databases
  "mysql-studio": { symbol: "server.rack", badge: "bolt.fill" },
  "postgres-studio": { symbol: "cylinder.split.1x2.fill", badge: "network" },
  "redis-studio": { symbol: "bolt.horizontal.fill", badge: "memorychip.fill" },
  "sqlite-studio": { symbol: "internaldrive.fill", badge: "cylinder.split.1x2.fill" },
  // Network and security
  "doggo-studio": { symbol: "pawprint.fill", badge: "globe" },
  "ipinfo-studio": { symbol: "mappin.and.ellipse", badge: "globe" },
  "network-studio": { symbol: "network", badge: "waveform.path.ecg" },
  "crypto-studio": { symbol: "lock.shield.fill", badge: "key.fill" },
  "subfinder-studio": { symbol: "scope", badge: "antenna.radiowaves.left.and.right" },
  // System and hardware
  "brew-studio": { symbol: "mug.fill", badge: "shippingbox.fill" },
  "process-studio": { symbol: "gauge.with.dots.needle.67percent", badge: "waveform.path.ecg" },
  "procs-studio": { symbol: "list.bullet.rectangle.portrait.fill", badge: "cpu.fill" },
  "system-studio": { symbol: "cpu.fill", badge: "memorychip.fill" },
  "task-manager": { symbol: "speedometer", badge: "chart.line.uptrend.xyaxis" },
  // Productivity
  "calculator-studio": { symbol: "plus.forwardslash.minus", badge: "function" },
  "interval-timer-studio": { symbol: "stopwatch.fill", badge: "flame.fill" },
  "markdown-studio": { symbol: "doc.richtext.fill", badge: "sparkles" },
  "media-player-studio": { symbol: "slider.vertical.3", badge: "waveform" },
  "world-time-zones-studio": { symbol: "globe.europe.africa.fill", badge: "clock.fill" },
  // Design
  "color-studio": { symbol: "swatchpalette.fill", badge: "sparkles" },
  "paint-studio": { symbol: "paintbrush.pointed.fill", badge: "swatchpalette.fill" },
  // RAD
  "launcher-studio": { symbol: "square.grid.2x2.fill", badge: "bolt.fill" },
  "rad-designer": { symbol: "rectangle.3.group.fill", badge: "wand.and.stars" },
  // Games
  "balatro-studio": { symbol: "suit.spade.fill", badge: "crown.fill" },
  "blackjack-studio": { symbol: "suit.club.fill", badge: "star.fill" },
  "breakout-studio": { custom: "breakout", badge: "bolt.fill" },
  "codecaine-bros-studio": { symbol: "gamecontroller.fill", badge: "star.fill" },
  "connect4-studio": { custom: "connect4", badge: "crown.fill" },
  "dr-codecaine-studio": { symbol: "cross.case.fill", badge: "sparkles" },
  "flappy-bird-studio": { symbol: "bird.fill", badge: "star.fill" },
  "frogger-studio": { custom: "frog", badge: "bolt.fill" },
  "lolo-studio": { symbol: "heart.fill", badge: "crown.fill" },
  "math-munchers-studio": { symbol: "plusminus.circle.fill", badge: "star.fill" },
  "maze-generator-studio": { custom: "maze", badge: "sparkles" },
  "minesweeper-studio": { custom: "minesweeper", badge: "flame.fill" },
  "pacman-studio": { custom: "pacman", badge: "star.fill" },
  "poker-studio": { symbol: "suit.diamond.fill", badge: "suit.heart.fill" },
  "pong-studio": { custom: "pong", badge: "bolt.fill" },
  "rat-screw-studio": { symbol: "hand.raised.fill", badge: "bolt.fill" },
  "rodents-revenge-studio": { symbol: "pawprint.fill", badge: "star.fill" },
  "skifree-studio": { symbol: "figure.skiing.downhill", badge: "flame.fill" },
  "snake-studio": { custom: "snake", badge: "bolt.fill" },
  "tetris-studio": { custom: "tetris", badge: "star.fill" },
  "tictactoe-studio": { custom: "tictactoe", badge: "sparkles" },
  "typing-studio": { symbol: "keyboard.fill", badge: "bolt.fill" },
  "word-search-studio": { symbol: "textformat.abc", badge: "magnifyingglass" },
  "yahtzee-studio": { symbol: "die.face.5.fill", badge: "crown.fill" },
  "artillery-studio": { symbol: "scope", badge: "flame.fill" },
  "asteroids-studio": { symbol: "sparkles", badge: "bolt.fill" },
  "balloon-fight-studio": { symbol: "wind", badge: "bolt.fill" },
  "bejeweled-studio": { symbol: "diamond.fill", badge: "sparkles" },
  "bomberman-studio": { symbol: "flame.fill", badge: "bolt.fill" },
  "bowling-studio": { symbol: "circle.grid.cross.fill", badge: "crown.fill" },
  "centipede-studio": { symbol: "ant.fill", badge: "bolt.fill" },
  "chips-challenge-studio": { symbol: "cpu.fill", badge: "key.fill" },
  "chuchu-rocket-studio": { symbol: "paperplane.fill", badge: "star.fill" },
  "cyber2048-studio": { text: "2K", badge: "bolt.fill" },
  "cyber-maker-studio": { symbol: "hammer.fill", badge: "gamecontroller.fill" },
  "darts-studio": { symbol: "target", badge: "crown.fill" },
  "game-show-studio": { symbol: "trophy.fill", badge: "sparkles" },
  "jezzball-studio": { symbol: "square.split.2x2.fill", badge: "bolt.fill" },
  "lemmings-studio": { symbol: "figure.walk", badge: "flag.fill" },
  "lode-runner-studio": { symbol: "figure.run", badge: "star.fill" },
  "lunar-lander-studio": { symbol: "moon.stars.fill", badge: "flame.fill" },
  "magical-drop-studio": { symbol: "drop.fill", badge: "sparkles" },
  "mappy-studio": { symbol: "bell.fill", badge: "star.fill" },
  "marble-madness-studio": { symbol: "globe", badge: "bolt.fill" },
  "memory-match-studio": { symbol: "brain.head.profile", badge: "sparkles" },
  "missile-command-studio": { symbol: "shield.fill", badge: "flame.fill" },
  "peggle-studio": { symbol: "circle.hexagongrid.fill", badge: "star.fill" },
  "pinball-studio": { symbol: "bolt.circle.fill", badge: "star.fill" },
  "pipe-dream-studio": { symbol: "wrench.and.screwdriver.fill", badge: "drop.fill" },
  "pool-studio": { text: "8", badge: "crown.fill" },
  "qbert-studio": { symbol: "cube.fill", badge: "star.fill" },
  "qix-studio": { symbol: "scribble.variable", badge: "bolt.fill" },
  "rampart-studio": { symbol: "building.columns.fill", badge: "shield.fill" },
  "reversi-checkers-studio": { symbol: "circle.lefthalf.filled", badge: "crown.fill" },
  "slots-studio": { text: "777", badge: "crown.fill" },
  "sokoban-studio": { symbol: "shippingbox.fill", badge: "star.fill" },
  "solitaire-studio": { symbol: "suit.heart.fill", badge: "crown.fill" },
  "space-invaders-studio": { symbol: "antenna.radiowaves.left.and.right", badge: "bolt.fill" },
  "uno-studio": { text: "UNO", badge: "flame.fill" },
  "vampire-survivors-studio": { symbol: "moon.fill", badge: "flame.fill" },
};

/** Every SF Symbol name used, so a test can check they all exist on this Mac. */
export const SYMBOL_NAMES = [
  ...new Set(Object.values(DESIGNS).flatMap((d) => [d.symbol, d.badge].filter((s): s is string => Boolean(s)))),
].sort();
