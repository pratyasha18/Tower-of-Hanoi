/* ═══════════════════════════════════════════
   STATE
═══════════════════════════════════════════ */
let towers, selected, moves, diskCount, hintsLeft;
let history = [];       // for undo: array of JSON snapshots
let solutionSteps = []; // full optimal solution for hint guidance
let solutionIdx = 0;    // current position in the solution (synced with actual state)

const NAMES = ['A','B','C'];

/* ═══════════════════════════════════════════
   INIT
═══════════════════════════════════════════ */
function init() {
  diskCount = parseInt(document.getElementById('diskSelect').value);
  towers    = [[], [], []];
  for (let i = diskCount; i > 0; i--) towers[0].push(i);

  moves     = 0;
  hintsLeft = 3;
  selected  = null;
  history   = [];

  // Pre-compute full solution
  solutionSteps = [];
  solve(diskCount, 0, 2, 1, solutionSteps);
  solutionIdx = 0;

  updateStats();
  document.getElementById('log').innerHTML = '';
  hideMsg();
  document.getElementById('winOverlay').classList.remove('show');

  render();
}

/* ═══════════════════════════════════════════
   RENDER
═══════════════════════════════════════════ */
function render() {
  for (let i = 0; i < 3; i++) {
    const body = document.getElementById('tb' + i);
    body.innerHTML = '';
    towers[i].forEach((d, idx) => {
      const disk = document.createElement('div');
      disk.className = `disk disk-${d}`;

      const maxW = body.clientWidth - 12 || 200;
      const minW = 36;
      const maxDisk = diskCount;
      const w = minW + ((d - 1) / (maxDisk - 1 || 1)) * (maxW * 0.82 - minW);
      disk.style.width = Math.round(w) + 'px';

      if (selected === i && idx === towers[i].length - 1) {
        disk.classList.add('lifted');
      }
      body.appendChild(disk);
    });

    // tower wrapper highlight
    const tw = document.getElementById('tw' + i);
    tw.classList.toggle('selected-src', selected === i);
  }

  updateStats();
}

function updateStats() {
  const optimal = Math.pow(2, diskCount) - 1;
  document.getElementById('statMoves').textContent  = moves;
  document.getElementById('statMin').textContent    = optimal;
  document.getElementById('statHints').textContent  = hintsLeft;

  // Progress: fraction of disks on peg C
  const progress = Math.round((towers[2].length / diskCount) * 100);
  document.getElementById('statProgress').textContent = progress + '%';

  document.getElementById('hintBtn').disabled = hintsLeft <= 0;
}

/* ═══════════════════════════════════════════
   INTERACTION
═══════════════════════════════════════════ */
function clickTower(i) {
  if (selected === null) {
    if (towers[i].length) {
      selected = i;
    } else {
      showMsg('Empty peg!', 'error');
    }
  } else {
    if (i === selected) {
      selected = null;
    } else {
      doMove(selected, i);
    }
  }
  render();
}

function doMove(a, b, silent = false) {
  const d    = towers[a].at(-1);
  const top  = towers[b].at(-1);

  if (!top || d < top) {
    // Save state for undo
    history.push(JSON.stringify(towers));

    towers[b].push(towers[a].pop());
    moves++;
    selected = null;

    if (!silent) {
      logEntry(a, b, false, false);
      // Advance solutionIdx to track where we are
      advanceSolution(a, b);
      checkWin();
      render();
    }
  } else {
    if (!silent) {
      showMsg('Invalid move — smaller disk must go on top!', 'error');
      selected = null;
      render();
    }
  }
}

/* After a player move, sync the solutionIdx.
   If the move matches the expected solution step → advance.
   If not, recompute the solution from current state. */
function advanceSolution(a, b) {
  if (solutionIdx < solutionSteps.length) {
    const expected = solutionSteps[solutionIdx];
    if (expected[0] === a && expected[1] === b) {
      solutionIdx++;
    } else {
      // Player deviated — recompute remaining solution from current state
      recomputeSolution();
    }
  }
}

/* Recompute solution from the CURRENT tower state using BFS parity trick.
   We use the standard recursive solver but parameterized by current state. */
function recomputeSolution() {
  solutionSteps = [];
  // Reconstruct which disks are on which peg
  // Then call the standard frame solver
  solveCurrent(solutionSteps);
  solutionIdx = 0;
}

/* Solve from the current arbitrary state.
   The Frame-Stewart / recursive approach: find largest misplaced disk,
   move everything above it off, move it, recursively solve rest. */
function solveCurrent(steps) {
  // Use iterative deepening: simulate from current towers to goal
  // Simple approach: clone current state and run greedy frame solver
  const t = [towers[0].slice(), towers[1].slice(), towers[2].slice()];
  solveState(diskCount, t, steps);
}

function solveState(n, t, steps) {
  // Standard recursive: move n disks from their current peg to peg 2
  // First locate where disk n currently sits
  if (n === 0) return;
  const from = t.findIndex(p => p.includes(n));
  const to   = 2; // target always peg 2
  const aux  = [0, 1, 2].find(x => x !== from && x !== to);

  // Recursively move n-1 disks from their location to aux
  // (disks 1..n-1 should end up on aux so disk n can move to 'to')
  moveGroupTo(n - 1, t, aux, steps);
  // Move disk n from 'from' to 'to'
  if (from !== to) {
    steps.push([from, to]);
    t[to].push(t[from].pop());
  }
  // Move n-1 from aux to 'to'
  moveGroupTo(n - 1, t, to, steps);
}

/* Move the top (n) disks — those are 1..n — to destination peg, recording steps */
function moveGroupTo(n, t, dest, steps) {
  if (n === 0) return;
  const from = t.findIndex(p => p.includes(n));
  if (from === dest) {
    // Disk n already at dest; just handle 1..n-1
    moveGroupTo(n - 1, t, dest, steps);
    return;
  }
  const aux = [0, 1, 2].find(x => x !== from && x !== dest);
  moveGroupTo(n - 1, t, aux, steps);
  steps.push([from, dest]);
  t[dest].push(t[from].pop());
  moveGroupTo(n - 1, t, dest, steps);
}

/* ═══════════════════════════════════════════
   UNDO
═══════════════════════════════════════════ */
function undoMove() {
  if (!history.length) {
    showMsg('Nothing to undo!', 'error');
    return;
  }
  towers = JSON.parse(history.pop());
  moves  = Math.max(0, moves - 1);
  selected = null;
  recomputeSolution();
  trimLog();
  render();
  showMsg('Move undone.', 'info');
}

function trimLog() {
  const log = document.getElementById('log');
  const entries = log.querySelectorAll('.log-entry');
  if (entries.length) entries[entries.length - 1].remove();
}

/* ═══════════════════════════════════════════
   HINT  ←  FIXED LOGIC
   Now uses the pre-computed optimal solution
   from the current state, so it always gives
   the correct next move toward the goal.
═══════════════════════════════════════════ */
function getHint() {
  if (hintsLeft <= 0) {
    showMsg('No hints left!', 'error');
    return;
  }

  // Recompute from current state if needed
  if (solutionSteps.length === 0 || solutionIdx >= solutionSteps.length) {
    recomputeSolution();
  }

  if (!solutionSteps.length) {
    showMsg('Puzzle already solved!', 'info');
    return;
  }

  const [from, to] = solutionSteps[solutionIdx];
  hintsLeft--;
  updateStats();

  // Visual: pulse source disk + highlight towers
  const tw0 = document.getElementById('tw' + from);
  const tw1 = document.getElementById('tw' + to);
  tw0.classList.add('hint-from');
  tw1.classList.add('hint-to');
  setTimeout(() => { tw0.classList.remove('hint-from'); tw1.classList.remove('hint-to'); }, 1200);

  // Pulse top disk on source tower
  const body = document.getElementById('tb' + from);
  const topDisk = body.lastElementChild;
  if (topDisk) {
    topDisk.classList.add('hint-pulse');
    setTimeout(() => topDisk.classList.remove('hint-pulse'), 1200);
  }

  showMsg(`Hint: Move Peg ${NAMES[from]} → Peg ${NAMES[to]}`, 'info');
  logEntry(from, to, true, false);
}

/* ═══════════════════════════════════════════
   SOLUTION — auto-play from current state
═══════════════════════════════════════════ */
let autoPlaying = false;
let autoPlayTimer = null;

function showSolution() {
  if (autoPlaying) {
    // Stop auto-play
    clearTimeout(autoPlayTimer);
    autoPlaying = false;
    document.querySelector('.btn-solution').textContent = '⊞  Solution';
    showMsg('Auto-play stopped.', 'info');
    return;
  }

  // Compute remaining steps from current state
  const steps = [];
  solveCurrent(steps);

  if (!steps.length) {
    showMsg('Already solved!', 'info');
    return;
  }

  autoPlaying = true;
  document.querySelector('.btn-solution').textContent = '⏹  Stop';

  const log = document.getElementById('log');
  log.innerHTML += `<div class="log-entry" style="color:var(--accent2);margin-top:6px;letter-spacing:0.1em;font-size:0.72rem;">── AUTO-SOLVING (${steps.length} moves remaining) ──</div>`;
  log.scrollTop = log.scrollHeight;

  // Disable interaction during auto-play
  selected = null;
  render();

  let i = 0;
  const delay = Math.max(300, 700 - diskCount * 40); // faster for more disks

  function playNext() {
    if (!autoPlaying || i >= steps.length) {
      autoPlaying = false;
      document.querySelector('.btn-solution').textContent = '⊞  Solution';
      return;
    }

    const [from, to] = steps[i];

    // Lift animation: select source, render, then place
    selected = from;
    render();

    autoPlayTimer = setTimeout(() => {
      towers[to].push(towers[from].pop());
      moves++;
      selected = null;
      logEntry(from, to, false, true);
      render();
      i++;

      if (i >= steps.length) {
        autoPlaying = false;
        document.querySelector('.btn-solution').textContent = '⊞  Solution';
        checkWin();
      } else {
        autoPlayTimer = setTimeout(playNext, delay);
      }
    }, delay);
  }

  playNext();
}

/* Standard recursive solver (from clean state) */
function solve(n, from, to, aux, steps) {
  if (n === 0) return;
  solve(n - 1, from, aux, to, steps);
  steps.push([from, to]);
  solve(n - 1, aux, to, from, steps);
}

/* ═══════════════════════════════════════════
   WIN CHECK
═══════════════════════════════════════════ */
function checkWin() {
  if (towers[2].length !== diskCount) return;

  const optimal = Math.pow(2, diskCount) - 1;
  const ratio   = moves / optimal;

  let cls  = 'ok', sub = 'Puzzle Complete';
  if (ratio <= 1.0) { cls = 'perfect'; sub = '✨ Perfect Score — Optimal Solution!'; }
  else if (ratio <= 1.3) { cls = 'good'; sub = 'Excellent — Very Close to Optimal!'; }

  document.getElementById('winMoves').textContent = moves;
  document.getElementById('winMoves').className   = 'stat-value ' + cls;
  document.getElementById('winSub').textContent   = sub;
  document.querySelector('.win-card .win-stats .stat:nth-child(2) .stat-value').textContent = optimal;

  setTimeout(() => document.getElementById('winOverlay').classList.add('show'), 400);
}

/* ═══════════════════════════════════════════
   LOG
═══════════════════════════════════════════ */
function logEntry(from, to, isHint, isSolution) {
  const log = document.getElementById('log');
  const tag = isHint ? '<span class="move-hint">◈ hint</span>' : (isSolution ? '<span class="move-sol">◈ auto</span>' : '');
  log.innerHTML += `<div class="log-entry"><span class="move-num">${String(moves).padStart(3,'0')}</span>Peg ${NAMES[from]} → Peg ${NAMES[to]} ${tag}</div>`;
  log.scrollTop = log.scrollHeight;
}

function clearLog() {
  document.getElementById('log').innerHTML = '';
}

/* ═══════════════════════════════════════════
   MESSAGES
═══════════════════════════════════════════ */
let msgTimer;
function showMsg(text, type = 'info') {
  const el = document.getElementById('msg');
  el.textContent = text;
  el.className   = 'msg ' + type + ' show';
  clearTimeout(msgTimer);
  msgTimer = setTimeout(hideMsg, 3200);
}

function hideMsg() {
  const el = document.getElementById('msg');
  el.classList.remove('show');
}

/* ═══════════════════════════════════════════
   EVENTS
═══════════════════════════════════════════ */
function resetGame() {
  if (autoPlaying) {
    clearTimeout(autoPlayTimer);
    autoPlaying = false;
    document.querySelector('.btn-solution').textContent = '⊞  Solution';
  }
  document.getElementById('winOverlay').classList.remove('show');
  init();
}

document.getElementById('diskSelect').addEventListener('change', init);

/* Keyboard: 1/2/3 to click towers */
document.addEventListener('keydown', e => {
  if (e.key === '1') clickTower(0);
  if (e.key === '2') clickTower(1);
  if (e.key === '3') clickTower(2);
  if (e.key === 'r' || e.key === 'R') resetGame();
  if (e.key === 'h' || e.key === 'H') getHint();
  if (e.key === 'z' && (e.ctrlKey || e.metaKey)) undoMove();
});

init();

/* ═══════════════════════════════════════════
   SOFT PIANO BACKGROUND MUSIC
   Web Audio API — no external files needed
═══════════════════════════════════════════ */
let audioCtx = null;
let musicPlaying = false;
let musicNodes = [];
let musicScheduler = null;

// Classical-style chord progression (C major / A minor feel)
// Each entry: [note frequencies for chord], duration in seconds
const progression = [
  [[261.63, 329.63, 392.00], 2.0],  // C major
  [[293.66, 369.99, 440.00], 2.0],  // D minor
  [[261.63, 329.63, 392.00], 1.5],  // C major
  [[246.94, 311.13, 392.00], 2.0],  // G major (inv)
  [[220.00, 277.18, 329.63], 2.0],  // A minor
  [[196.00, 246.94, 311.13], 1.5],  // G major
  [[174.61, 220.00, 261.63], 2.0],  // F major
  [[196.00, 246.94, 311.13], 2.0],  // G major
];

// Melody notes layered on top (right hand)
const melody = [
  523.25, 587.33, 659.25, 698.46,
  659.25, 587.33, 523.25, 493.88,
  523.25, 659.25, 783.99, 698.46,
  659.25, 523.25, 493.88, 523.25
];

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playPianoNote(freq, startTime, duration, gain = 0.08, type = 'sine') {
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();

  filter.type = 'lowpass';
  filter.frequency.value = 1800;

  osc.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);

  // Piano-like envelope: sharp attack, quick decay, soft sustain, fade out
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(gain, startTime + 0.02);       // attack
  gainNode.gain.exponentialRampToValueAtTime(gain * 0.4, startTime + 0.15); // decay
  gainNode.gain.setValueAtTime(gain * 0.4, startTime + duration - 0.3);
  gainNode.gain.linearRampToValueAtTime(0.0001, startTime + duration); // release

  osc.start(startTime);
  osc.stop(startTime + duration + 0.1);

  musicNodes.push(osc);
}

function scheduleMusic() {
  if (!musicPlaying) return;

  let t = audioCtx.currentTime + 0.1;
  let progIdx = 0;
  let melIdx  = 0;

  const totalDuration = progression.reduce((s, p) => s + p[1], 0);

  // Schedule one full loop
  progression.forEach(([chord, dur]) => {
    // Left hand: bass note (root, one octave down)
    playPianoNote(chord[0] / 2, t, dur, 0.06, 'sine');

    // Left hand: chord (spread across time slightly for arpeggio feel)
    chord.forEach((freq, i) => {
      playPianoNote(freq, t + i * 0.05, dur * 0.9, 0.045, 'sine');
    });

    // Right hand: melody note every half-beat
    const steps = Math.round(dur / 0.5);
    for (let s = 0; s < steps; s++) {
      const mFreq = melody[melIdx % melody.length];
      playPianoNote(mFreq, t + s * 0.5, 0.45, 0.055, 'triangle');
      melIdx++;
    }

    t += dur;
    progIdx++;
  });

  // Loop: reschedule just before this loop ends
  musicScheduler = setTimeout(scheduleMusic, (totalDuration - 1) * 1000);
}

function stopMusic() {
  clearTimeout(musicScheduler);
  musicNodes.forEach(n => { try { n.stop(); } catch(e){} });
  musicNodes = [];
  musicPlaying = false;
}

function toggleMusic() {
  const btn = document.getElementById('musicBtn');
  if (musicPlaying) {
    // music currently playing -> stop it
    stopMusic();
    musicPlaying = false;

    btn.textContent = '🎵\u00a0 Music On';
    btn.style.opacity = '1';
  } else {
    // music currently off -> start it
    initAudio();
    musicPlaying = true;
    scheduleMusic();

    btn.textContent = '🔇\u00a0 Music Off';
    btn.style.opacity = '0.6';
  }
}
