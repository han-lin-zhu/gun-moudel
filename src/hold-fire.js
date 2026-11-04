// Keep cadence independent of rendering. A delayed tab never catches up with a burst.
export function createHoldFire({ fire, rate = 600, now = () => performance.now(), schedule = setTimeout, cancel = clearTimeout }) {
  let held = false, timer = null, lastShot = 0;
  const interval = () => 60000 / rate;
  function stop() {
    held = false;
    if (timer !== null) cancel(timer);
    timer = null;
  }
  function queue() {
    timer = schedule(() => {
      timer = null;
      if (!held) return;
      lastShot = now(); fire();
      if (held) queue();
    }, Math.max(0, lastShot + interval() - now()));
  }
  return {
    get held() { return held; },
    start() {
      if (held) return;
      held = true; lastShot = now(); fire();
      if (held) queue();
    },
    stop,
    setRate(value) {
      rate = Math.min(1200, Math.max(120, Number(value) || 600));
      if (held) {
        if (timer !== null) cancel(timer);
        queue();
      }
    },
  };
}
