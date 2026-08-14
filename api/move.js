'use strict';
/* 老叔之家象棋 云端算棋 API (Vercel Serverless)
   GET /api/move?fen=<FEN>&level=1..5
   无状态: 每次请求独立启动一次 Pikafish, 单次搜索硬上限 SEARCH_MS_CAP(1.5s)。
   冷启动防线(三层):
   1) vercel.json maxDuration=60s: 突破 Hobby 默认 10s 硬杀;
   2) NNUE(52MB) 下载与引擎握手并行 + 多源竞争(主源/gh-proxy/ghfast), 6s 预算;
   3) 下载超时/失败 -> Use NNUE=false 经典评估降级, 绝不让"等权重"拖死整局。
   响应携带 nnue 字段: {mode: nnue|classic|cached|none, ms, bytes, src} 供前端调试展示。 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ENGINE = process.env.PIKAFISH_BIN || path.join(__dirname, '..', 'engine', 'pikafish-sse41-popcnt');
const ENGINE_DIR = path.dirname(ENGINE);
// AL2023 精简镜像缺 libatomic.so.1, 引擎链接了 __atomic_* 符号, 需随包自带并注入加载路径
const LIB_DIR = path.join(ENGINE_DIR, 'libatomic');
const NNUE = process.env.PIKAFISH_NNUE ? path.join(process.env.PIKAFISH_NNUE) : '/tmp/pikafish.nnue';
const NNUE_URL = (process.env.NNUE_URL || '').trim();
const LEVEL_MS = { 1: 250, 2: 450, 3: 700, 4: 1000, 5: 1500 };
const SEARCH_MS_CAP = 1500;
const NET_BUDGET = 6000;      // NNUE 下载总预算: 并行执行, 超时即降级经典评估
const ENGINE_BUDGET = 7000;   // 引擎从 spawn 到返回的硬上限
const NNUE_MIN_BYTES = 10000000;

// /tmp 权重文件进程级缓存标志: 一旦就绪, 本实例内永不重复下载/重复 stat
let netReady = false;

// 下载源池: 主源 + GitHub 形态自动附加国内加速镜像, race 取最快
function nnueSources() {
  if (!NNUE_URL) return [];
  const list = [NNUE_URL];
  if (/github\.com\//.test(NNUE_URL) && !/gh-proxy\.com|ghfast\.top/.test(NNUE_URL)) {
    list.push('https://gh-proxy.com/' + NNUE_URL, 'https://ghfast.top/' + NNUE_URL);
  }
  return list;
}

async function fetchOne(url, signal) {
  const res = await fetch(url, { redirect: 'follow', signal });
  if (!res.ok) return { ok: false, url, status: res.status, bytes: 0 };
  const buf = Buffer.from(await res.arrayBuffer());
  return { ok: buf.length >= NNUE_MIN_BYTES, url, status: res.status, buf, bytes: buf.length };
}

// 取第一个成功的下载结果; 全部失败(含超时中断)则 settle {ok:false}
function raceFirstOk(promises) {
  return new Promise((resolveAll) => {
    let done = false;
    let count = 0;
    promises.forEach(p => {
      const onEnd = r => {
        if (!done && r && r.ok) { done = true; resolveAll(r); return; }
        count += 1;
        if (count === promises.length && !done) { done = true; resolveAll({ ok: false, status: 0 }); }
      };
      p.then(onEnd).catch(e => { onEnd({ ok: false, status: 0, err: String(e && e.message || e) }); });
    });
  });
}

function engineEnv() {
  const e = Object.assign({}, process.env);
  e.LD_LIBRARY_PATH = (e.LD_LIBRARY_PATH ? e.LD_LIBRARY_PATH + ':' : '') + LIB_DIR;
  return e;
}

function resp(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  });
  res.end(JSON.stringify(obj));
}

function uciToSq(moveStr) {
  const m = String(moveStr || '').trim();
  if (m.length < 4 || m === '0000' || m === '(none)') return null;
  const f = m.charCodeAt(0) - 97;
  const fr = 9 - (m.charCodeAt(1) - 48);
  const t = m.charCodeAt(2) - 97;
  const tr = 9 - (m.charCodeAt(3) - 48);
  if (f < 0 || f > 8 || t < 0 || t > 8 || fr < 0 || fr > 9 || tr < 0 || tr > 9) return null;
  return { f: fr * 9 + f, t: tr * 9 + t };
}

async function downloadNet() {
  if (!NNUE_URL) return { mode: 'none' };
  if (netReady) return { mode: 'cached' };
  if (fs.existsSync(NNUE) && fs.statSync(NNUE).size > NNUE_MIN_BYTES) {
    netReady = true;
    console.log('[NNUE] 缓存命中, 直接复用:', NNUE);
    return { mode: 'cached' };
  }
  const srcs = nnueSources();
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, NET_BUDGET);
  try {
    const r = await raceFirstOk(srcs.map(u => fetchOne(u, ctrl.signal)));
    if (r.ok && r.buf) {
      fs.writeFileSync(NNUE, r.buf, { mode: 0o644 });
      netReady = true;
      console.log('[NNUE] 下载完成:', r.url, r.bytes, 'bytes, 耗时', Date.now() - t0, 'ms');
      return { mode: 'nnue', src: r.url, ms: Date.now() - t0, bytes: r.bytes };
    }
    console.error('[NNUE] 下载失败/超时(预算', NET_BUDGET, 'ms):', srcs.join(' | '),
      r.status ? '最后状态 ' + r.status : '', r.err || '', '-> 降级经典评估');
    return { mode: 'classic', ms: Date.now() - t0 };
  } catch (e) {
    console.error('[NNUE] 下载异常:', e && e.message, '-> 降级经典评估');
    return { mode: 'classic', ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

function runEngine(fen, ms, hardTimeout, netP) {
  return new Promise((resolve) => {
    let child;
    try {
      if (!fs.existsSync(ENGINE)) {
        console.error('引擎二进制不存在:', ENGINE);
        resolve(null);
        return;
      }
      child = spawn(ENGINE, [], { stdio: ['pipe', 'pipe', 'pipe'], env: engineEnv() });
    } catch (e) {
      console.error('引擎启动崩溃:', e);
      resolve(null);
      return;
    }
    let done = false;
    let buf = '';
    let errBuf = '';
    let best = null;
    let lastDepth = 0, lastScore = 0, nodes = 0;
    let goSentAt = 0;
    const t0 = Date.now();
    let waiter = null;
    let exitInfo = null;
    let exitLogged = false;

    const killTimer = setTimeout(finalize, Math.max(1000, hardTimeout));

    function finalize() {
      if (done) return;
      done = true;
      clearTimeout(killTimer);
      if (waiter) { clearTimeout(waiter.timer); waiter = null; }
      try { child.stdin && child.stdin.end(); } catch (e) {}
      try { child.kill('SIGKILL'); } catch (e) {}
      if (!best && !exitLogged) {
        exitLogged = true;
        console.error('引擎异常退出真相:', { code: exitInfo ? exitInfo.code : 'unknown', stderr: errBuf });
      }
      resolve({ best, depth: lastDepth, score: lastScore, nodes, ms: goSentAt ? Date.now() - goSentAt : Date.now() - t0 });
    }

    function waitFor(sub, timeoutMs) {
      return new Promise(res => {
        if (done) { res(); return; }
        waiter = {
          sub, res,
          timer: setTimeout(() => { if (waiter && waiter.res === res) waiter = null; res(); }, timeoutMs)
        };
      });
    }

    child.stdout && child.stdout.setEncoding('utf8');
    child.stdout && child.stdout.on('data', d => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line.startsWith('bestmove')) {
          best = line.split(/\s+/)[1] || null;
          finalize();
          return;
        }
        if (line.startsWith('info depth ')) {
          const dm = line.match(/depth (\d+)/);
          if (dm) lastDepth = +dm[1];
          const sm = line.match(/score (cp|mate) (-?\d+)/);
          if (sm) lastScore = sm[1] === 'mate' ? +sm[2] * 100000 : +sm[2];
          const nm = line.match(/nodes (\d+)/);
          if (nm) nodes = +nm[1];
        }
        if (waiter && line.indexOf(waiter.sub) >= 0) {
          const w = waiter;
          waiter = null;
          clearTimeout(w.timer);
          w.res();
        }
      }
    });
    child.stdout && child.stdout.on('end', finalize);
    child.stdout && child.stdout.on('error', e => { if (!done) console.error('引擎 stdout 错误:', e && e.code, e && e.message); });
    child.stderr && child.stderr.setEncoding('utf8');
    child.stderr && child.stderr.on('data', d => { errBuf = (errBuf + d).slice(-8000); });
    child.stderr && child.stderr.on('error', e => { if (!done) console.error('引擎 stderr 错误:', e && e.code, e && e.message); });
    child.stdin && child.stdin.on('error', e => { if (!done) console.error('引擎 stdin 异步错误:', e && e.code, e && e.message); });
    child.on('exit', (code, signal) => {
      exitInfo = { code: code === null ? 'SIGKILL(' + signal + ')' : code, signal: signal };
      if (((code !== null && code !== 0) || (signal && signal !== 'SIGKILL') || !best) && !exitLogged) {
        exitLogged = true;
        console.error('引擎异常退出真相:', { code: code, signal: signal, stderr: errBuf });
      }
      finalize();
    });
    child.on('error', e => { console.error('引擎进程错误:', e); exitInfo = { code: 'ERROR', signal: e && e.code }; finalize(); });

    const send = s => {
      try {
        if (child.stdin && !child.stdin.destroyed && child.stdin.writable) child.stdin.write(s + '\n');
        else if (!done) console.error('引擎 stdin 不可写, 指令被丢弃: ' + s);
      } catch (e) {
        if (!done) console.error('引擎 stdin 写入同步异常:', e);
      }
    };

    (async () => {
      try {
        send('uci');
        await waitFor('uciok', 3000);
        if (done) return;
        // 下载与 UCI 握手并行进行: 此时下载已并行跑了约 1s, 剩余预算内决出
        const netInfo = netP ? await netP : { mode: 'none' };
        if (done) return;
        if (netInfo.mode === 'nnue') {
          send('setoption name EvalFile value ' + NNUE);
        } else if (netInfo.mode === 'classic') {
          send('setoption name Use NNUE value false');
        }
        send('isready');
        await waitFor('readyok', 3000);
        if (done) return;
        send('ucinewgame');
        send('position fen ' + fen);
        send('isready');
        await waitFor('readyok', 3000);
        if (done) return;
        const elapsed = Date.now() - t0;
        const budgetLeft = hardTimeout - elapsed - 1500;
        const useGoMs = Math.max(100, Math.min(Math.min(ms, SEARCH_MS_CAP), budgetLeft));
        goSentAt = Date.now();
        send('go movetime ' + useGoMs);
      } catch (e) {
        finalize();
      }
    })();
  });
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') {
    resp(res, 204, {});
    return;
  }
  if (url.pathname !== '/api/move') {
    resp(res, 404, { error: 'not found' });
    return;
  }
  if (req.method !== 'GET') {
    resp(res, 405, { error: 'method not allowed' });
    return;
  }
  const fen = (url.searchParams.get('fen') || '').trim();
  const level = parseInt(url.searchParams.get('level') || '3', 10);
  if (!/^[kKrRnNbBaAcCpP0-9/]+ [wb] - - \d+ \d+$/.test(fen)) {
    resp(res, 400, { error: 'bad fen' });
    return;
  }
  const lv = LEVEL_MS[level] ? level : 3;
  const ms = LEVEL_MS[lv];

  const t0 = Date.now();
  // 下载立即并行启动, 不阻塞引擎流程
  const netP = downloadNet();

  let move = null, depth = 0, score = 0, nodes = 0, usedMs = 0, netInfo = null;
  const r = await runEngine(fen, ms, ENGINE_BUDGET, netP);
  netInfo = await netP;
  if (r && r.best) {
    move = uciToSq(r.best);
    depth = r.depth; score = r.score; nodes = r.nodes; usedMs = r.ms;
  }
  const totalMs = Date.now() - t0;
  if (!move) console.error('[MOVE] 引擎未返回着法, totalMs', totalMs, 'netInfo', JSON.stringify(netInfo));
  resp(res, 200, {
    fen,
    move,
    level: lv,
    depth,
    score,
    nodes,
    ms: usedMs || totalMs,
    totalMs,
    ok: !!move,
    engine: 'pikafish-2026-01-02',
    netReady: !!netInfo && netInfo.mode !== 'classic' && netInfo.mode !== 'none',
    nnue: {
      mode: netInfo ? netInfo.mode : 'unknown',
      src: netInfo && netInfo.src ? netInfo.src : null,
      bytes: netInfo && netInfo.bytes ? netInfo.bytes : null,
      ms: netInfo && netInfo.ms ? netInfo.ms : null
    }
  });
};
