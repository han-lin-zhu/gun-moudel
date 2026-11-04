import { createRangeSession } from './range-session.js';
import './style.css';
import './range.css';

const $ = selector => document.querySelector(selector);
const session = createRangeSession();
const board = $('#range-board');
const cells = Array.from({ length: 25 }, (_, i) => {
  const cell = document.createElement('div');
  cell.className = 'range-cell';
  const coordinate = document.createElement('span');
  coordinate.className = 'cell-coordinate';
  coordinate.textContent = `${String.fromCharCode(65 + Math.floor(i / 5))}${i % 5 + 1}`;
  cell.append(coordinate); board.append(cell);
  return cell;
});
let previousStatus, previousTargets = '', lastSecond = -1;
const formatTime = milliseconds => {
  const seconds = Math.ceil(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

function render() {
  const state = session.snapshot;
  const { status, targets } = state;
  const running = status === 'running', paused = status === 'paused';
  const locked = running || paused;
  const remaining = status === 'idle' ? Number($('#range-duration').value) * 60000 : state.remaining;
  const second = Math.ceil(remaining / 1000);
  if (second !== lastSecond) { $('#range-time').textContent = formatTime(remaining); lastSecond = second; }
  $('#range-time').classList.toggle('time-low', running && remaining <= 10000);
  $('#range-progress').style.width = `${status === 'idle' ? 100 : remaining / state.duration * 100}%`;
  $('#range-hits').textContent = state.hits;
  $('#range-shots').textContent = state.shots;
  $('#range-accuracy').textContent = state.shots ? `${state.accuracy}%` : '—';
  $('#active-targets').textContent = locked ? `${targets.length} / ${state.maxTargets}` : '—';
  $('#wave-label').textContent = status === 'idle' ? '等待小球出现' : `已出现 ${state.spawned} 个 · 超时 ${state.expired} 个`;
  $('#range-options').disabled = locked;
  $('#range-end').disabled = !locked;
  $('#range-toggle').innerHTML = running ? '暂停练习 <span>Ⅱ</span>' : paused ? '继续练习 <span>↗</span>' : status === 'finished' ? '再练一次 <span>↗</span>' : '开始练习 <span>↗</span>';
  $('#range-overlay').hidden = running;
  board.inert = !running;
  const signature = `${running}:${targets.map(target => target.id).join(',')}`;
  if (signature !== previousTargets) {
    // Keep surviving buttons in place so focus and target animations stay stable.
    for (const button of board.querySelectorAll('.range-target')) {
      if (!targets.some(target => target.id === Number(button.dataset.target))) button.remove();
    }
    for (const target of targets) {
      let button = board.querySelector(`[data-target="${target.id}"]`);
      if (!button) {
        button = document.createElement('button'); button.type = 'button';
        button.className = 'range-target'; button.dataset.target = target.id;
        button.setAttribute('aria-label', `小球 ${String.fromCharCode(65 + Math.floor(target.cell / 5))}${target.cell % 5 + 1}`);
        button.innerHTML = '<span aria-hidden="true"></span>';
        cells[target.cell].append(button);
      }
      button.disabled = !running;
    }
    previousTargets = signature;
  }
  for (const target of targets) {
    const button = board.querySelector(`[data-target="${target.id}"]`);
    button.style.setProperty('--life', `${target.remaining / target.lifetime * 360}deg`);
    button.classList.toggle('target-expiring', target.remaining <= 300);
  }
  if (status !== previousStatus) {
    $('#range-state').textContent = { idle: '等待开始', running: '练习进行中', paused: '练习已暂停', finished: '练习已结束' }[status];
    $('.range-arena').dataset.state = status;
    $('#range-result').hidden = status !== 'finished';
    if (paused) {
      $('#overlay-title').textContent = '稍作停顿，保持专注。';
      $('#overlay-description').textContent = '倒计时已暂停，小球位置保留。准备好后继续。';
      $('#arena-start').innerHTML = '继续练习 <span>↗</span>';
      $('#range-announcement').textContent = '练习已暂停，点击继续练习恢复。';
    } else if (status === 'finished') {
      $('#overlay-title').textContent = remaining === 0 ? '时间到，本次练习完成。' : '本次练习已结束。';
      $('#overlay-description').textContent = `已练习 ${formatTime(state.duration - remaining)} · 出现 ${state.spawned} 个 · 超时 ${state.expired} 个`;
      $('#range-result').replaceChildren();
      for (const [label, value] of [['命中小球', `${state.hits} 个`], ['命中率', state.shots ? `${state.accuracy}%` : '—'], ['平均命中用时', state.hits ? `${(state.averageReaction / 1000).toFixed(2)} 秒` : '—']]) {
        const item = document.createElement('div'); const title = document.createElement('span'); const number = document.createElement('strong');
        title.textContent = label; number.textContent = value; item.append(title, number); $('#range-result').append(item);
      }
      $('#arena-start').innerHTML = '再练一次 <span>↗</span>';
      $('#range-announcement').textContent = `练习结束：命中 ${state.hits} 个，超时 ${state.expired} 个，射击 ${state.shots} 次${state.shots ? `，命中率 ${state.accuracy}%` : ''}。可调整设置后再练一次。`;
    } else if (running) {
      $('#range-announcement').textContent = `小球依次闪出，同时最多 ${state.maxTargets} 个；每个停留 1～2 秒，外圈表示剩余时间。`;
    }
    previousStatus = status;
  }
}

function toggle() {
  const { status } = session.snapshot;
  if (status === 'running') session.pause();
  else if (status === 'paused') session.resume();
  else session.start({ minutes: Number($('#range-duration').value), limit: Number($('#target-limit').value) });
  render();
}
$('#range-toggle').addEventListener('click', toggle);
$('#arena-start').addEventListener('click', toggle);
$('#range-end').addEventListener('click', () => { session.finish(); render(); });
$('#target-limit').addEventListener('input', event => {
  $('#target-limit-value').textContent = `${event.target.value} 个`;
  $('#target-rule').textContent = `小球按随机间隔依次闪出，同时最多 ${event.target.value} 个，格位不重复。`;
});
$('#range-duration').addEventListener('change', event => {
  $('#duration-value').textContent = `${event.target.value} 分钟`;
  render();
});
board.addEventListener('click', event => {
  const target = event.target.closest('.range-target');
  const hit = session.shoot(target ? Number(target.dataset.target) : null);
  if (hit === null) { render(); return; }
  if (!hit) {
    board.classList.remove('miss'); void board.offsetWidth; board.classList.add('miss');
  }
  render();
});
function autoPause() { session.pause(); render(); }
window.addEventListener('blur', autoPause);
window.addEventListener('pagehide', autoPause);
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
setInterval(() => { if (session.snapshot.status !== 'idle') render(); }, 50);
render();
