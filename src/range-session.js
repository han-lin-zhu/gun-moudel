// Time and randomness are injected so session rules can be checked without a browser.
export function createRangeSession({ now = () => performance.now(), random = Math.random } = {}) {
  let status = 'idle', duration = 60000, maxTargets = 3;
  let deadline = 0, remaining = duration, shots = 0, hits = 0, spawned = 0, expired = 0;
  let serial = 0, nextSpawnAt = 0, lastCell = -1, pausedAt = 0, reactionTotal = 0;
  let targets = [];

  function spawn(time) {
    const occupied = new Set(targets.map(target => target.cell));
    const cells = Array.from({ length: 25 }, (_, i) => i).filter(i => i !== lastCell && !occupied.has(i));
    const cell = cells[Math.floor(random() * cells.length)];
    const lifetime = 1000 + random() * 1000;
    targets.push({ id: ++serial, cell, appearedAt: time, expiresAt: time + lifetime, lifetime });
    lastCell = cell; spawned++;
  }

  function tick() {
    if (status === 'running') {
      const time = now();
      remaining = Math.max(0, deadline - time);
      if (remaining === 0) { status = 'finished'; targets = []; return; }
      targets = targets.filter(target => {
        if (target.expiresAt > time) return true;
        expired++; return false;
      });
      if (time >= nextSpawnAt) {
        if (targets.length < maxTargets) spawn(time);
        // Never replay a backlog or fill all vacant slots in a single frame.
        nextSpawnAt = time + 350 + random() * 300;
      }
    }
  }

  return {
    start({ minutes = 1, limit = 3 } = {}) {
      if (!Number.isFinite(minutes) || minutes < 0.5 || minutes > 3 || !Number.isInteger(minutes * 2)) {
        throw new RangeError('练习时长须为 0.5～3 分钟，步长为 0.5 分钟');
      }
      if (!Number.isInteger(limit) || limit < 1 || limit > 5) throw new RangeError('同时出现上限须为 1～5 个');
      duration = minutes * 60000; maxTargets = limit;
      remaining = duration; deadline = now() + duration;
      shots = 0; hits = 0; spawned = 0; expired = 0; reactionTotal = 0;
      targets = []; lastCell = -1;
      status = 'running'; nextSpawnAt = now(); tick();
    },
    shoot(id = null) {
      tick();
      if (status !== 'running') return null;
      const index = targets.findIndex(target => target.id === id);
      // Ignore stale target events, including a repeated click after a hit.
      if (id !== null && index === -1) return null;
      shots++;
      if (index === -1) return false;
      hits++; reactionTotal += now() - targets[index].appearedAt;
      targets.splice(index, 1);
      return true;
    },
    pause() {
      tick();
      if (status !== 'running') return;
      pausedAt = now();
      status = 'paused';
    },
    resume() {
      if (status !== 'paused') return;
      const time = now(), pauseLength = time - pausedAt;
      for (const target of targets) { target.appearedAt += pauseLength; target.expiresAt += pauseLength; }
      nextSpawnAt += pauseLength;
      deadline = time + remaining; status = 'running';
    },
    finish() {
      tick();
      if (status === 'running' || status === 'paused') { status = 'finished'; targets = []; }
    },
    get snapshot() {
      tick();
      return { status, duration, remaining, maxTargets, shots, hits, spawned, expired,
        accuracy: shots ? Math.round(hits / shots * 100) : 0,
        averageReaction: hits ? reactionTotal / hits : 0,
        targets: targets.map(target => ({ ...target,
          remaining: Math.max(0, target.expiresAt - (status === 'paused' ? pausedAt : now())),
        })),
      };
    },
  };
}
