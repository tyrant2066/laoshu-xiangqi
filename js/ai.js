/* 老叔之家象棋 规则库 + 云端引擎客户端 js/ai.js
   着法生成 / 将军检测 / FEN 编解码 / 云端 Pikafish 算棋（纯云端，无本地搜索） */
(function (global) {
  'use strict';

  var RED = 1, BLACK = -1;
  var T_KING = 0, T_GUARD = 1, T_ELE = 2, T_HORSE = 3, T_ROOK = 4, T_CANNON = 5, T_PAWN = 6;
  var RED_NAME = ['帅', '仕', '相', '马', '车', '炮', '兵'];
  var BLK_NAME = ['将', '士', '象', '马', '车', '炮', '卒'];

  var LEVELS = [
    { name: '新手' },
    { name: '入门' },
    { name: '中级' },
    { name: '高级' },
    { name: '大师' }
  ];

  var ZR = new Uint32Array(14 * 90 + 1);
  var TURNZ = 14 * 90;
  (function () {
    var seed = 0x9E3779B9;
    function rnd() {
      seed += 0x6D2B79F5;
      var t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return (t ^ (t >>> 14)) >>> 0;
    }
    for (var i = 0; i < ZR.length; i++) ZR[i] = rnd();
  })();

  function nowMs() {
    if (typeof performance !== 'undefined' && performance.now) return performance.now();
    return Date.now();
  }

  function idxOf(piece) { return piece > 0 ? piece - 1 : 6 - piece; }

  function ownAt(board, sq, side) {
    var p = board[sq];
    return p !== 0 && (p > 0 ? 1 : -1) === side;
  }

  function hashOfBoard(board, turn) {
    var h = 0;
    for (var i = 0; i < 90; i++) {
      var p = board[i];
      if (p) h = (h ^ ZR[idxOf(p) * 90 + i]) >>> 0;
    }
    if (turn === RED) h = (h ^ ZR[TURNZ]) >>> 0;
    return h;
  }

  function updateHash(hash, piece, from, to, captured) {
    var h = hash;
    h = (h ^ ZR[idxOf(piece) * 90 + from]) >>> 0;
    h = (h ^ ZR[idxOf(piece) * 90 + to]) >>> 0;
    if (captured) h = (h ^ ZR[idxOf(captured) * 90 + to]) >>> 0;
    h = (h ^ ZR[TURNZ]) >>> 0;
    return h;
  }

  function initialBoard() {
    var b = new Int8Array(90);
    b[0] = -5; b[1] = -4; b[2] = -3; b[3] = -2; b[4] = -1; b[5] = -2; b[6] = -3; b[7] = -4; b[8] = -5;
    b[19] = -6; b[25] = -6;
    b[27] = -7; b[29] = -7; b[31] = -7; b[33] = -7; b[35] = -7;
    b[54] = 7; b[56] = 7; b[58] = 7; b[60] = 7; b[62] = 7;
    b[64] = 6; b[70] = 6;
    b[81] = 5; b[82] = 4; b[83] = 3; b[84] = 2; b[85] = 1; b[86] = 2; b[87] = 3; b[88] = 4; b[89] = 5;
    return b;
  }

  var PC = {
    1: 'K', 2: 'A', 3: 'B', 4: 'N', 5: 'R', 6: 'C', 7: 'P',
    '-1': 'k', '-2': 'a', '-3': 'b', '-4': 'n', '-5': 'r', '-6': 'c', '-7': 'p'
  };
  var FILES = 'abcdefghi';

  function genPseudo(board, side, ms, cs) {
    var dirPawn = side === RED ? -9 : 9;
    var dirs4 = [-9, 9, -1, 1];
    for (var sq = 0; sq < 90; sq++) {
      var p = board[sq];
      if (p === 0 || (p > 0 ? 1 : -1) !== side) continue;
      var t = Math.abs(p) - 1;
      var r = (sq / 9) | 0, c = sq % 9;
      if (t === T_PAWN) {
        var to = sq + dirPawn;
        if (to >= 0 && to < 90 && !ownAt(board, to, side)) { ms.push(sq, to); cs.push(board[to]); }
        if ((side === RED && r <= 4) || (side === BLACK && r >= 5)) {
          if (c > 0 && !ownAt(board, sq - 1, side)) { ms.push(sq, sq - 1); cs.push(board[sq - 1]); }
          if (c < 8 && !ownAt(board, sq + 1, side)) { ms.push(sq, sq + 1); cs.push(board[sq + 1]); }
        }
      } else if (t === T_KING) {
        var rr0 = side === RED ? 7 : 0;
        for (var d = 0; d < 4; d++) {
          var to2 = sq + dirs4[d];
          if (to2 < 0 || to2 >= 90) continue;
          var r2 = (to2 / 9) | 0, c2 = to2 % 9;
          if (c2 < 3 || c2 > 5 || r2 < rr0 || r2 > rr0 + 2) continue;
          if (ownAt(board, to2, side)) continue;
          ms.push(sq, to2); cs.push(board[to2]);
        }
      } else if (t === T_GUARD) {
        var rr1 = side === RED ? 7 : 0;
        var gd = [-10, -8, 8, 10];
        for (var d2 = 0; d2 < 4; d2++) {
          var to3 = sq + gd[d2];
          if (to3 < 0 || to3 >= 90) continue;
          var r3 = (to3 / 9) | 0, c3 = to3 % 9;
          if (c3 < 3 || c3 > 5 || r3 < rr1 || r3 > rr1 + 2) continue;
          if (ownAt(board, to3, side)) continue;
          ms.push(sq, to3); cs.push(board[to3]);
        }
      } else if (t === T_ELE) {
        var rLow = side === RED ? 5 : 0, rHigh = side === RED ? 9 : 4;
        var ed = [-20, -16, 16, 20];
        for (var d3 = 0; d3 < 4; d3++) {
          var to4 = sq + ed[d3];
          if (to4 < 0 || to4 >= 90) continue;
          var r4 = (to4 / 9) | 0, c4 = to4 % 9;
          if (Math.abs(r4 - r) !== 2 || Math.abs(c4 - c) !== 2) continue;
          if (r4 < rLow || r4 > rHigh) continue;
          if (board[sq + ed[d3] / 2] !== 0) continue;
          if (ownAt(board, to4, side)) continue;
          ms.push(sq, to4); cs.push(board[to4]);
        }
      } else if (t === T_HORSE) {
        var hd = [-19, -17, -11, -7, 7, 11, 17, 19];
        for (var d4 = 0; d4 < 8; d4++) {
          var to5 = sq + hd[d4];
          if (to5 < 0 || to5 >= 90) continue;
          var r5 = (to5 / 9) | 0, c5 = to5 % 9;
          var dr = r5 - r, dc = c5 - c;
          if (Math.abs(dr) + Math.abs(dc) !== 3) continue;
          var leg = Math.abs(dr) === 2 ? (sq + (dr > 0 ? 9 : -9)) : (sq + (dc > 0 ? 1 : -1));
          if (board[leg] !== 0) continue;
          if (ownAt(board, to5, side)) continue;
          ms.push(sq, to5); cs.push(board[to5]);
        }
      } else {
        for (var d5 = 0; d5 < 4; d5++) {
          var drd = dirs4[d5] === 9 ? 1 : dirs4[d5] === -9 ? -1 : 0;
          var dcd = dirs4[d5] === 1 ? 1 : dirs4[d5] === -1 ? -1 : 0;
          var r6 = r + drd, c6 = c + dcd;
          var seen = 0;
          while (r6 >= 0 && r6 < 10 && c6 >= 0 && c6 < 9) {
            var idx6 = r6 * 9 + c6;
            var pp = board[idx6];
            if (t === T_ROOK) {
              if (pp !== 0) {
                if ((pp > 0 ? 1 : -1) !== side) { ms.push(sq, idx6); cs.push(pp); }
                break;
              }
              ms.push(sq, idx6); cs.push(0);
            } else {
              if (seen === 0 && pp === 0) { ms.push(sq, idx6); cs.push(0); }
              else if (pp !== 0) {
                seen++;
                if (seen === 2) {
                  if ((pp > 0 ? 1 : -1) !== side) { ms.push(sq, idx6); cs.push(pp); }
                  break;
                }
              }
            }
            r6 += drd; c6 += dcd;
          }
        }
      }
    }
  }

  function attackedBy(board, sq, by) {
    var r = (sq / 9) | 0, c = sq % 9;
    if (by === RED) {
      if (r < 9 && board[sq + 9] === 7) return true;
      if (r <= 4 && c > 0 && board[sq - 1] === 7) return true;
      if (r <= 4 && c < 8 && board[sq + 1] === 7) return true;
    } else {
      if (r > 0 && board[sq - 9] === -7) return true;
      if (r >= 5 && c > 0 && board[sq - 1] === -7) return true;
      if (r >= 5 && c < 8 && board[sq + 1] === -7) return true;
    }
    if (r > 0 && board[sq - 9] === by) return true;
    if (r < 9 && board[sq + 9] === by) return true;
    if (c > 0 && board[sq - 1] === by) return true;
    if (c < 8 && board[sq + 1] === by) return true;
    var gp = by * 2;
    var rr0 = by === RED ? 7 : 0;
    var gd = [-10, -8, 8, 10];
    for (var i = 0; i < 4; i++) {
      var d = sq + gd[i];
      if (d < 0 || d >= 90) continue;
      var dr = (d / 9) | 0, dc = d % 9;
      if (dc < 3 || dc > 5 || dr < rr0 || dr > rr0 + 2) continue;
      if (board[d] === gp) return true;
    }
    var ep = by * 3;
    var eLow = by === RED ? 5 : 0, eHigh = by === RED ? 9 : 4;
    var ed = [-20, -16, 16, 20];
    for (var i2 = 0; i2 < 4; i2++) {
      var d2 = sq + ed[i2];
      if (d2 < 0 || d2 >= 90) continue;
      var dr2 = (d2 / 9) | 0, dc2 = d2 % 9;
      if (Math.abs(dr2 - r) !== 2 || Math.abs(dc2 - c) !== 2) continue;
      if (dr2 < eLow || dr2 > eHigh) continue;
      if (board[sq + ed[i2] / 2] === 0 && board[d2] === ep) return true;
    }
    var hp = by * 4;
    var hd = [-19, -17, -11, -7, 7, 11, 17, 19];
    for (var i3 = 0; i3 < 8; i3++) {
      var d3 = sq + hd[i3];
      if (d3 < 0 || d3 >= 90) continue;
      var dr3 = (d3 / 9) | 0, dc3 = d3 % 9;
      if (Math.abs(dr3 - r) + Math.abs(dc3 - c) !== 3) continue;
      var leg;
      if (Math.abs(dr3 - r) === 2) leg = sq + (dr3 > r ? 9 : -9) + (dc3 - c);
      else leg = sq + (dc3 > c ? 1 : -1) + (dr3 - r) * 9;
      if (board[leg] === 0 && board[d3] === hp) return true;
    }
    var dd = [-9, 9, -1, 1];
    for (var i4 = 0; i4 < 4; i4++) {
      var drd = dd[i4] === 9 ? 1 : dd[i4] === -9 ? -1 : 0;
      var dcd = dd[i4] === 1 ? 1 : dd[i4] === -1 ? -1 : 0;
      var r7 = r + drd, c7 = c + dcd;
      var seen = 0;
      while (r7 >= 0 && r7 < 10 && c7 >= 0 && c7 < 9) {
        var pp = board[r7 * 9 + c7];
        if (pp !== 0) {
          seen++;
          if (seen === 1) {
            if (pp === by * 5 || pp === by) return true;
          } else {
            if (pp === by * 6) return true;
            break;
          }
        }
        r7 += drd; c7 += dcd;
      }
    }
    return false;
  }

  function findKing(board, side) {
    for (var i = 0; i < 90; i++) if (board[i] === side) return i;
    return -1;
  }

  function qDo(board, kingA, f, t) {
    var p = board[f];
    board[t] = p; board[f] = 0;
    if (Math.abs(p) === 1) kingA[0] = t;
  }
  function qUndo(board, kingA, f, t, c) {
    var p = board[t];
    board[f] = p; board[t] = c;
    if (Math.abs(p) === 1) kingA[0] = f;
  }

  function legalMoves(board, side) {
    var b = new Int8Array(board);
    var ms = [], cs = [], out = [];
    genPseudo(b, side, ms, cs);
    var kingA = [findKing(b, side)];
    for (var i = 0; i < ms.length; i += 2) {
      var f = ms[i], t = ms[i + 1], c = cs[i / 2];
      qDo(b, kingA, f, t);
      if (!attackedBy(b, kingA[0], -side)) out.push({ f: f, t: t, c: c });
      qUndo(b, kingA, f, t, c);
    }
    return out;
  }

  function isInCheck(board, side) {
    var k = findKing(board, side);
    if (k < 0) return false;
    return attackedBy(board, k, -side);
  }

  function moveToCN(board, f, t) {
    var p = board[f];
    if (!p) return '?';
    var side = p > 0 ? RED : BLACK;
    var name = p > 0 ? RED_NAME[Math.abs(p) - 1] : BLK_NAME[Math.abs(p) - 1];
    var fr = (f / 9) | 0, fc = f % 9, tr = (t / 9) | 0, tc = t % 9;
    var fF = side === RED ? 9 - fc : fc + 1;
    var tF = side === RED ? 9 - tc : tc + 1;
    if (tr === fr) return name + fF + '平' + tF;
    var up = side === RED ? tr < fr : tr > fr;
    var dir = up ? '进' : '退';
    var ty = Math.abs(p) - 1;
    if (ty === T_ROOK || ty === T_CANNON || ty === T_PAWN) return name + fF + dir + Math.abs(tr - fr);
    return name + fF + dir + tF;
  }

  function boardToFEN(board, turn) {
    var rows = [];
    for (var r = 0; r < 10; r++) {
      var row = '';
      var empty = 0;
      for (var c = 0; c < 9; c++) {
        var p = board[r * 9 + c];
        if (p === 0) {
          empty++;
        } else {
          if (empty) { row += empty; empty = 0; }
          row += PC[p];
        }
      }
      if (empty) row += empty;
      rows.push(row);
    }
    return rows.join('/') + ' ' + (turn === RED ? 'w' : 'b') + ' - - 0 1';
  }

  function uciToSq(move) {
    var m = String(move || '').trim();
    if (m.length < 4 || m === '0000' || m === '(none)') return null;
    var f = m.charCodeAt(0) - 97;
    var fr = 9 - (m.charCodeAt(1) - 48);
    var t = m.charCodeAt(2) - 97;
    var tr = 9 - (m.charCodeAt(3) - 48);
    if (f < 0 || f > 8 || t < 0 || t > 8 || fr < 0 || fr > 9 || tr < 0 || tr > 9) return null;
    return { f: fr * 9 + f, t: tr * 9 + t };
  }

  function endpoint() {
    if (typeof LAOSHUJI_API === 'string' && LAOSHUJI_API) return LAOSHUJI_API;
    if (typeof global !== 'undefined' && global.LAOSHUJI_API) return global.LAOSHUJI_API;
    return '/api/move';
  }

  function getBestMove(opts, done) {
    var o = {
      board: new Int8Array(opts.board),
      turn: opts.turn || RED,
      level: opts.level || 3,
      token: opts.token || null
    };
    var ctrl = { cancelled: false };
    function cancelled() {
      return ctrl.cancelled || (o.token && o.token.cancelled);
    }
    var url = endpoint() + '?fen=' + encodeURIComponent(boardToFEN(o.board, o.turn)) + '&level=' + o.level;
    url += '&_t=' + Date.now();
    var t0 = nowMs();
    var abort = null;
    var settled = false;
    function finishNull() {
      if (settled) return;
      settled = true;
      done(null);
    }
    // 现代浏览器: fetch + AbortController 超时控制
    // 老旧内核(Via/旧WebView 无 AbortController): 自动降级 XHR, 其原生 timeout 100% 兼容
    if (typeof fetch === 'function' && typeof AbortController !== 'undefined') {
      abort = new AbortController();
      var timer = setTimeout(function () {
        if (!cancelled()) { try { abort.abort(); } catch (e) {} }
      }, 20000);
      fetch(url, { signal: abort.signal, cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (data) {
          clearTimeout(timer);
          if (cancelled() || settled) return;
          settled = true;
          if (!data || !data.move || typeof data.move.f !== 'number' || typeof data.move.t !== 'number') {
            done(null, new Error('响应缺少 move 字段')); return;
          }
          done({
            move: { f: data.move.f, t: data.move.t },
            depth: data.depth || 0,
            nodes: data.nodes || 0,
            ms: data.ms || (nowMs() - t0),
            score: typeof data.score === 'number' ? data.score : 0
          });
        })
        .catch(function (err) {
          clearTimeout(timer);
          if (cancelled() || settled) return;
          settled = true;
          if (err && err.name === 'AbortError') { done(null, new Error('请求超时(20秒)')); return; }
          done(null, err instanceof Error ? err : new Error('请求失败: ' + String(err)));
        });
    } else {
      var xhr = null;
      var timer2 = null;
      try {
        xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.timeout = 20000;
        xhr.setRequestHeader('Cache-Control', 'no-cache, no-store');
        xhr.onreadystatechange = function () {
          if (xhr.readyState !== 4 || cancelled() || settled) return;
          clearTimeout(timer2);
          settled = true;
          if (xhr.status < 200 || xhr.status >= 300) {
            done(null, new Error('HTTP ' + xhr.status));
            return;
          }
          var data = null;
          try { data = JSON.parse(xhr.responseText); } catch (e) {}
          if (data && data.move && typeof data.move.f === 'number') {
            done({ move: { f: data.move.f, t: data.move.t }, depth: data.depth || 0, nodes: data.nodes || 0, ms: data.ms || (nowMs() - t0), score: typeof data.score === 'number' ? data.score : 0 });
          } else {
            done(null, new Error('响应解析失败或缺少 move 字段'));
          }
        };
        xhr.onabort = function () {
          clearTimeout(timer2);
          if (!cancelled() && !settled) { settled = true; done(null, new Error('请求被中止(超时?)')); }
        };
        xhr.onerror = function () {
          clearTimeout(timer2);
          if (!cancelled() && !settled) { settled = true; done(null, new Error('网络错误(XHR)')); }
        };
        xhr.ontimeout = function () {
          if (!cancelled() && !settled) { settled = true; done(null, new Error('请求超时(20秒)')); }
        };
        xhr.send();
        timer2 = setTimeout(function () { try { xhr.abort(); } catch (e) {} }, 20000);
      } catch (e) {
        done(null, e instanceof Error ? e : new Error('发起请求异常: ' + String(e)));
      }
    }
    return { cancel: function () {
      ctrl.cancelled = true;
      if (abort) { try { abort.abort(); } catch (e) {} }
      if (xhr) { try { xhr.abort(); } catch (e) {} }
    } };
  }

  global.XQEngine = {
    VERSION: '2.0.0',
    RED: RED, BLACK: BLACK,
    LEVELS: LEVELS,
    initialBoard: initialBoard,
    hashOfBoard: hashOfBoard,
    updateHash: updateHash,
    legalMoves: legalMoves,
    inCheck: isInCheck,
    boardToFEN: boardToFEN,
    pieceName: function (p) {
      var t = Math.abs(p) - 1;
      return p > 0 ? RED_NAME[t] : BLK_NAME[t];
    },
    moveToCN: moveToCN,
    workerInfo: function () { return '云端'; },
    engineInfo: function () { return '云端 Pikafish'; },
    getBestMove: getBestMove
  };
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : global));
