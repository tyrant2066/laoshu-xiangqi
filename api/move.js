'use strict';
/* 老叔之家象棋 云端算棋 API (Vercel Serverless)
   GET /api/move?fen=<FEN>&level=1..5
   无状态: 每次请求独立启动一次 Pikafish, 单次搜索硬上限 SEARCH_MS_CAP(5s),
   整体受 TOTAL_BUDGET(8.5s) 兜底并被 vercel.json maxDuration 保护, 杜绝 504。
   NNUE(53MB) 不打包: 首次冷启动从 NNUE_URL 下载到 /tmp 复用。 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ENGINE = process.env.PIKAFISH_BIN || path.join(__dirname, '..', 'engine', 'pikafish-sse41-popcnt');
const NNUE = process.env.PIKAFISH_NNUE ? path.join(process.env.PIKAFISH_NNUE) : '/tmp/pikafish.nnue';
const NNUE_URL = process.env.NNUE_URL || '';
const LEVEL_MS = { 1: 400, 2: 800, 3: 1500, 4: 2500, 5: 4800 };
const SEARCH_MS_CAP = 4800;
const TOTAL_BUDGET = 8500;
const NET_TIMEOUT = 8000;

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
  if (!NNUE_URL) return true;
  if (fs.existsSync(NNUE) && fs.statSync(NNUE).size > 10000000) return true;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), NET_TIMEOUT);
  try {
    const res = await fetch(NNUE_URL, { redirect: 'follow', signal: ctrl.signal });
    if (!res.ok) {
      console.error('NNUE 下载状态异常:', res.status);
      return false;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 10000000) return false;
    fs.writeFileSync(NNUE, buf, { mode: 0o644 });
    return true;
  } catch (e) {
    console.error('NNUE 下载网络/超时报错:', e);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function runEngine(fen, ms, hardTimeout) {
  return new Promise((resolve) => {
    let child;
    try {
      if (!fs.existsSync(ENGINE)) {
        console.error('引擎二进制不存在:', ENGINE);
        resolve(null);
        return;
      }
      child = spawn(ENGINE, [], { stdio: ['pipe', 'pipe', 'pipe'] });
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
        send('setoption name EvalFile value ' + NNUE);
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
  const netOk = await downloadNet();

  let move = null, depth = 0, score = 0, nodes = 0, usedMs = 0;
  if (netOk) {
    const remaining = TOTAL_BUDGET - (Date.now() - t0);
    const r = await runEngine(fen, ms, Math.min(remaining, 7000));
    if (r && r.best) {
      move = uciToSq(r.best);
      depth = r.depth; score = r.score; nodes = r.nodes; usedMs = r.ms;
    }
  }
  resp(res, 200, {
    fen,
    move,
    level: lv,
    depth,
    score,
    nodes,
    ms: usedMs || (Date.now() - t0),
    totalMs: Date.now() - t0,
    ok: !!move,
    engine: 'pikafish-2026-01-02',
    netReady: netOk
  });
};
