/* 老叔之家象棋 界面与对局流程 js/ui.js — 依赖 js/ai.js */
(function () {
  'use strict';

  var DEBUG = true;
  var E = XQEngine;
  var RED = E.RED, BLACK = E.BLACK;

  var canvas, ctx;
  var cell = 0, pad = 0, dpr = 1;
  var RATIO = 11.0;
  var game = null;
  var sel = -1;
  var aiThinking = false;
  var aiToken = null;
  var aiError = null;
  var lockUntil = 0;
  var lastTapAt = 0;
  var logLines = [];
  var toastTimer = 0;   // 临时通知自动恢复定时器
  var aiFailSafe = 0;   // AI 卡死兜底定时器

  var STATUS, capRed, capBlack, btnUndo, btnNew, btnGhost, btnSettings;
  var modal, modalBackdrop, mModeAI, mModeDuel, mSideRed, mSideBlack, mClose;
  var mGroupLevel, mGroupSide;
  var levelBtns = [];

  function $(id) { return document.getElementById(id); }

  function log() {
    var s = Array.prototype.map.call(arguments, String).join(' ');
    var line = new Date().toTimeString().slice(0, 8) + '  ' + s;
    if (DEBUG) console.log('[老叔] ' + s);
    logLines.push(line);
    if (logLines.length > 60) logLines.shift();
  }
  function errorLog() {
    log.apply(null, ['[错误]'].concat(Array.prototype.slice.call(arguments)));
    if (DEBUG) console.error.apply(console, ['[老叔错误]'].concat(Array.prototype.slice.call(arguments)));
  }

  function sideName(side) { return side === RED ? '红方' : '黑方'; }
  // 状态栏用户友好文案: 底层技术参数(exit code/JSON/错误栈)只进 console, 不暴露给玩家
  function friendlyError(reason) {
    var r = String(reason || '');
    if (/超时|中止|Abort|timed ?out/i.test(r)) return 'AI 思考超时(网络波动或云端繁忙)，请重试';
    if (/^HTTP 5/i.test(r) || /5xx|500|502|503|504/.test(r)) return 'AI 服务繁忙，请稍后再试';
    if (/fetch failed|network|网络|XHR|status 0/i.test(r)) return '网络连接失败，请检查网络后重试';
    if (/move|bestmove|引擎|着法|云端|响应解析/i.test(r)) return 'AI 暂时无法走棋(云端繁忙)，请重试';
    return 'AI 无响应，请重新走棋';
  }
  function statusText(t) {
    STATUS.textContent = t;
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = 0; }
  }
  // 临时通知: 显示 ms 毫秒后自动恢复为真实对局状态, 绝不残留遮挡
  function toast(t, ms) {
    statusText(t);
    var self = this;
    toastTimer = setTimeout(function () { toastTimer = 0; updateStatus(); }, ms || 2500);
  }

  function freshGame() {
    var b = E.initialBoard();
    return {
      mode: 'ai', level: 1, playerSide: RED,
      board: b, turn: RED,
      history: [], hashStack: [E.hashOfBoard(b)],
      captured: [[], []],
      lastMove: null, over: false, result: null
    };
  }

  function applyMove(g, f, t) {
    var piece = g.board[f], cap = g.board[t];
    g.board[t] = piece; g.board[f] = 0;
    if (cap) g.captured[cap > 0 ? 1 : 0].push(cap);
    g.history.push({ f: f, t: t, c: cap });
    g.hashStack.push(E.updateHash(g.hashStack[g.hashStack.length - 1], piece, f, t, cap));
    g.turn = -g.turn;
    g.lastMove = { f: f, t: t };
    g.over = false; g.result = null;
  }

  function unmake(g) {
    var m = g.history.pop();
    var piece = g.board[m.t];
    g.board[m.f] = piece; g.board[m.t] = m.c;
    if (m.c) g.captured[m.c > 0 ? 1 : 0].pop();
    g.turn = -g.turn;
    g.hashStack.pop();
    g.lastMove = g.history.length ? { f: g.history[g.history.length - 1].f, t: g.history[g.history.length - 1].t } : null;
  }

  function inCheckSide(g, side) {
    return E.inCheck(g.board, side);
  }

  function resultText(r) {
    if (r.type === 'draw') return '和棋(三次重复)';
    if (r.type === 'resign') return sideName(r.winner) + '胜(对方认输)';
    return sideName(r.winner) + '胜';
  }

  function checkEnd(g) {
    var side = g.turn;
    var moves = E.legalMoves(g.board, side);
    var chk = inCheckSide(g, side);
    if (moves.length === 0) {
      g.over = true;
      g.result = chk ? { type: 'mate', winner: -side, loser: side } : { type: 'stalemate', winner: -side, loser: side };
      return;
    }
    var h = g.hashStack[g.hashStack.length - 1];
    var cnt = 0;
    for (var i = 0; i < g.hashStack.length; i++) if (g.hashStack[i] === h) cnt++;
    if (cnt >= 3) g.over = true, g.result = { type: 'draw', winner: 0, loser: 0 };
  }

  function updateStatus() {
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = 0; }
    if (!game) return;
    if (game.over) {
      var r = game.result;
      if (r.type === 'draw') statusText('和棋 —— 局面重复三次');
      else if (r.type === 'resign') statusText(sideName(r.winner) + '获胜 —— 对方认输');
      else if (r.type === 'mate') statusText(sideName(r.winner) + '获胜 —— 将死！');
      else statusText(sideName(r.loser) + '无子可走（困毙），' + sideName(r.winner) + '获胜');
      return;
    }
    var chk = inCheckSide(game, game.turn);
    var who;
  if (game.mode === 'ai' && game.turn !== game.playerSide) {
    who = aiThinking ? 'AI 思考中…（' + E.LEVELS[game.level - 1].name + '）' : (aiError || 'AI 思考中…');
  } else if (game.mode === 'ai') {
      who = '轮到你走棋（' + (game.playerSide === RED ? '红方' : '黑方') + '）';
    } else {
      who = '轮到' + sideName(game.turn) + '走棋';
    }
    statusText((chk ? '将军！' : '') + who);
  }

  function layout() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var appTop = $('app').getBoundingClientRect().top;
    var above = STATUS.getBoundingClientRect().bottom - appTop;
    var below = capRed.offsetHeight + $('actionBar').offsetHeight + 18;
    var availW = Math.max(240, vw - 16);
    var availH = Math.max(240, vh - above - below - 12);
    // 画布固有纵横比固定为 11 : 9 = (10行 + 双侧0.5格) : (8列 + 双侧0.5格)
    // 格子间距 cell 满足画布宽 = 9 * cell（8 个网格间距 + 左右各半格）
    var cssW = Math.floor(Math.min(availW, availH * 9 / RATIO));
    cell = cssW / 9;
    pad = cell * 0.5;
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    var cssH = Math.floor(cell * 11);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }

  // 交叉点坐标: 棋子落在 9 条竖线(0..8)与 10 条横线(0..9)的交点上
  function sqX(sq) { return pad + (sq % 9) * cell; }
  function sqY(sq) { return pad + ((sq / 9) | 0) * cell; }

  function drawGrid() {
    var gx = function (c) { return pad + c * cell; };
    var gy = function (r) { return pad + r * cell; };
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = Math.max(1.5, cell * 0.04);
    ctx.beginPath();
    for (var c = 0; c < 9; c++) {
      if (c === 0 || c === 8) {
        // 左右外边线: 从行0 一直连通绘制到行9, 封死左右边界
        ctx.moveTo(gx(c), gy(0)); ctx.lineTo(gx(c), gy(9));
      } else {
        // 中间 7 条竖线: 上段行0~行4, 下段行5~行9, 河界区域留空
        ctx.moveTo(gx(c), gy(0)); ctx.lineTo(gx(c), gy(4));
        ctx.moveTo(gx(c), gy(5)); ctx.lineTo(gx(c), gy(9));
      }
    }
    for (var r = 0; r <= 9; r++) {
      ctx.moveTo(gx(0), gy(r)); ctx.lineTo(gx(8), gy(r));
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(gx(3), gy(7)); ctx.lineTo(gx(5), gy(9));
    ctx.moveTo(gx(5), gy(7)); ctx.lineTo(gx(3), gy(9));
    ctx.moveTo(gx(3), gy(0)); ctx.lineTo(gx(5), gy(2));
    ctx.moveTo(gx(5), gy(0)); ctx.lineTo(gx(3), gy(2));
    ctx.stroke();
    var marks = [[2, 1], [2, 7], [7, 1], [7, 7]];
    var s = cell * 0.08;
    ctx.fillStyle = '#000000';
    for (var i = 0; i < marks.length; i++) {
      ctx.fillRect(gx(marks[i][1]) - s / 2, gy(marks[i][0]) - s / 2, s, s);
    }
    ctx.font = 'bold ' + Math.round(cell * 0.34) + 'px "KaiTi","STKaiti","楷体","SimSun",serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('楚河', gx(2.25), gy(4.5));
    ctx.fillText('汉界', gx(6.75), gy(4.5));
  }

  function drawLastMove() {
    if (!game.lastMove) return;
    var s = cell * 0.09;
    var sqs = [game.lastMove.f, game.lastMove.t];
    ctx.fillStyle = '#000000';
    for (var k = 0; k < sqs.length; k++) {
      var sq = sqs[k], c = sq % 9, r = (sq / 9) | 0;
      var x0 = pad + c * cell, y0 = pad + r * cell;
      ctx.fillRect(x0, y0, s, s);
      ctx.fillRect(x0 + cell - s, y0, s, s);
      ctx.fillRect(x0, y0 + cell - s, s, s);
      ctx.fillRect(x0 + cell - s, y0 + cell - s, s, s);
    }
  }

  function drawPiece(sq, p) {
    var side = p > 0 ? RED : BLACK;
    var t = Math.abs(p) - 1;
    var cx = sqX(sq), cy = sqY(sq);
    var r = cell * 0.42;
    var rot = game.mode === 'duel' && side === BLACK;
    ctx.save();
    if (rot) { ctx.translate(cx, cy); ctx.rotate(Math.PI); cx = 0; cy = 0; }
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 6.2832);
    ctx.fillStyle = side === RED ? '#ffffff' : '#000000';
    ctx.fill();
    ctx.strokeStyle = side === RED ? '#000000' : '#ffffff';
    ctx.lineWidth = Math.max(2, cell * 0.05);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.8, 0, 6.2832);
    ctx.lineWidth = Math.max(1, cell * 0.025);
    ctx.stroke();
    ctx.fillStyle = side === RED ? '#000000' : '#ffffff';
    ctx.font = 'bold ' + Math.round(cell * 0.52) + 'px "KaiTi","STKaiti","楷体","SimSun",serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(E.pieceName(p), cx, cy + cell * 0.02);
    ctx.restore();
  }

  function drawPieces() {
    for (var sq = 0; sq < 90; sq++) {
      var p = game.board[sq];
      if (p) drawPiece(sq, p);
    }
  }

  function drawHints() {
    if (sel < 0 || game.over) return;
    var moves = E.legalMoves(game.board, game.turn);
    ctx.fillStyle = '#000000';
    ctx.strokeStyle = '#000000';
    for (var i = 0; i < moves.length; i++) {
      if (moves[i].f !== sel) continue;
      var t2 = moves[i].t;
      if (game.board[t2] === 0) {
        ctx.beginPath();
        ctx.arc(sqX(t2), sqY(t2), cell * 0.1, 0, 6.2832);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(sqX(t2), sqY(t2), cell * 0.46, 0, 6.2832);
        ctx.lineWidth = Math.max(2, cell * 0.04);
        ctx.stroke();
      }
    }
  }

  function drawSelection() {
    if (sel < 0) return;
    ctx.beginPath();
    ctx.arc(sqX(sel), sqY(sel), cell * 0.52, 0, 6.2832);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = Math.max(3, cell * 0.07);
    ctx.stroke();
  }

  function drawCheckMark() {
    if (game.over || !inCheckSide(game, game.turn)) return;
    var k = -1;
    for (var i = 0; i < 90; i++) if (game.board[i] === game.turn) { k = i; break; }
    if (k < 0) return;
    ctx.beginPath();
    ctx.arc(sqX(k), sqY(k), cell * 0.53, 0, 6.2832);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function updateCaptured() {
    capRed.textContent = '红方吃子：' + (game.captured[0].map(E.pieceName).join(' ') || '（无）');
    capBlack.textContent = '黑方吃子：' + (game.captured[1].map(E.pieceName).join(' ') || '（无）');
  }

  function redrawAll() {
    if (!canvas || !game) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    drawGrid();
    drawLastMove();
    drawPieces();
    drawHints();
    drawSelection();
    drawCheckMark();
    updateCaptured();
    updateStatus();
  }

  function save() {
    if (!game) return;
    try {
      localStorage.setItem('laoshuji_xiangqi_v1', JSON.stringify({
        v: 1, mode: game.mode, level: game.level, playerSide: game.playerSide,
        turn: game.turn, board: Array.prototype.slice.call(game.board),
        history: game.history, hashStack: game.hashStack,
        captured: game.captured, lastMove: game.lastMove,
        over: game.over, result: game.result
      }));
    } catch (e) {
      errorLog('保存失败', e);
    }
  }

  function loadGame() {
    try {
      var s = localStorage.getItem('laoshuji_xiangqi_v1');
      if (!s) return null;
      var d = JSON.parse(s);
      if (!d || !d.board || d.board.length !== 90) return null;
      var b = E.initialBoard();
      var hash = E.hashOfBoard(b);
      var stack = [hash];
      var ok = true;
      for (var i = 0; i < d.history.length; i++) {
        var m = d.history[i];
        if (!m || m.f < 0 || m.f > 89 || m.t < 0 || m.t > 89 || !b[m.f]) { ok = false; break; }
        if (b[m.t] !== m.c) { ok = false; break; }
        var piece = b[m.f];
        b[m.t] = piece; b[m.f] = 0;
        hash = E.updateHash(hash, piece, m.f, m.t, m.c);
        stack.push(hash);
      }
      if (ok) {
        for (var j = 0; j < 90; j++) if (b[j] !== d.board[j]) { ok = false; break; }
      }
      if (!ok) {
        log('[警告] 存档校验失败, 已丢弃, 重新开局');
        return null;
      }
      return {
        mode: d.mode === 'duel' ? 'duel' : 'ai',
        level: Math.max(1, Math.min(5, d.level || 1)),
        playerSide: d.playerSide === BLACK ? BLACK : RED,
        board: new Int8Array(d.board),
        turn: d.turn === BLACK ? BLACK : RED,
        history: d.history || [],
        hashStack: stack,
        captured: d.captured || [[], []],
        lastMove: d.lastMove || null,
        over: !!d.over, result: d.result || null
      };
    } catch (e) {
      errorLog('读取存档失败', e);
      return null;
    }
  }

  function setControls() {
    btnUndo.disabled = game.history.length === 0 || game.over;
    btnNew.disabled = false;
    btnGhost.disabled = false;
    btnSettings.disabled = false;
  }

  function setOn(btn, on) {
    btn.className = 'btn mSel' + (on ? ' on' : '');
  }

  function syncSettingsUI() {
    setOn(mModeAI, game.mode === 'ai');
    setOn(mModeDuel, game.mode === 'duel');
    setOn(mSideRed, game.playerSide === RED);
    setOn(mSideBlack, game.playerSide === BLACK);
    var aiMode = game.mode === 'ai';
    if (aiMode) { mGroupLevel.classList.remove('disabled'); mGroupSide.classList.remove('disabled'); }
    else { mGroupLevel.classList.add('disabled'); mGroupSide.classList.add('disabled'); }
    for (var i = 0; i < levelBtns.length; i++) {
      var lv = parseInt(levelBtns[i].getAttribute('data-level'), 10);
      setOn(levelBtns[i], game.level === lv);
    }
  }

  function openSettings() {
    syncSettingsUI();
    modal.hidden = false;
  }
  function closeSettings() {
    modal.hidden = true;
  }

  function afterMove() {
    checkEnd(game);
    redrawAll();
    save();
    if (game.over) {
      log('对局结束: ' + resultText(game.result));
      setControls();
      return;
    }
    setControls();
    if (game.mode === 'ai' && game.turn !== game.playerSide) startAI();
  }

  function startAI() {
    aiThinking = true;
    aiError = null;
    var token = { cancelled: false };
    aiToken = token;
    if (aiFailSafe) { clearTimeout(aiFailSafe); aiFailSafe = 0; }
    // 兜底保险: 40 秒内无论如何完成回调, 绝不让状态停留在"AI 思考中…"
    // (前端已内置自动重试: 最多 3 次×间隔1s, 最坏 20+1+8+1+8=38s, 兜底必须更大)
    aiFailSafe = setTimeout(function () {
      aiFailSafe = 0;
      if (token.cancelled || !aiThinking) return;
      token.cancelled = true;
      aiThinking = false;
      aiToken = null;
      aiError = 'AI 思考超时(网络波动或云端繁忙)，请重试';
      log('[错误] AI 兜底超时, 已强制恢复');
      redrawAll();
      setControls();
    }, 40000);
    setControls();
    updateStatus();
    log('AI 开始思考: level=' + game.level + ' (' + E.LEVELS[game.level - 1].name + ') 执' + (game.turn === RED ? '红' : '黑'));
    var hist = game.hashStack.slice(Math.max(0, game.hashStack.length - 48));
    E.getBestMove({
      board: game.board,
      turn: game.turn,
      level: game.level,
      history: hist,
      token: token
    }, function (res, err) {
      if (token.cancelled) return;
      if (aiFailSafe) { clearTimeout(aiFailSafe); aiFailSafe = 0; }
      aiThinking = false;
      aiToken = null;
      if (!res || !res.move) {
        var reason = err && err.message ? err.message : '引擎未返回着法';
        // 底层技术原因(HTTP码/exit code/failureReason)只记录到控制台, 状态栏仅显示友好提示
        errorLog('AI 请求失败: ' + reason + ' (API=' + (typeof LAOSHUJI_API === 'string' && LAOSHUJI_API ? LAOSHUJI_API : '/api/move') + ')');
        aiError = friendlyError(reason);
        redrawAll();
        setControls();
        return;
      }
      if (DEBUG && res.nnue) log('AI 权重模式: ' + JSON.stringify(res.nnue));
      var mv = res.move;
      var legal = E.legalMoves(game.board, game.turn);
      var ok = false;
      for (var i = 0; i < legal.length; i++) {
        if (legal[i].f === mv.f && legal[i].t === mv.t) { ok = true; break; }
      }
      if (!ok) {
        errorLog('AI 返回非法着法, 改走第一个合法着法: ', mv, 'depth=' + res.depth);
        mv = legal[0];
      }
      log('AI 落子: ' + E.moveToCN(game.board, mv.f, mv.t) + ' (' + mv.f + '→' + mv.t + ') depth=' + res.depth + ' nodes=' + res.nodes + ' 用时=' + res.ms + 'ms score=' + res.score);
      applyMove(game, mv.f, mv.t);
      lockUntil = Date.now() + 300;
      afterMove();
    });
  }

  function doHumanMove(f, t) {
    log('玩家走棋: ' + E.moveToCN(game.board, f, t) + ' (' + f + '→' + t + ')');
    applyMove(game, f, t);
    sel = -1;
    lockUntil = Date.now() + 300;
    afterMove();
  }

  function tapSquare(sq) {
    if (aiThinking) return;
    if (Date.now() < lockUntil) {
      log('防误触: 忽略本次点击');
      return;
    }
    if (game.over) { sel = -1; redrawAll(); return; }
    if (game.mode === 'ai' && game.turn !== game.playerSide) return;
    var p = game.board[sq];
    var mine = p !== 0 && (p > 0 ? RED : BLACK) === game.turn;
    if (sel < 0) {
      if (mine) {
        sel = sq;
        redrawAll();
        statusText('已选中' + E.pieceName(p) + '，请点击落点');
      }
      return;
    }
    if (sq === sel) { sel = -1; redrawAll(); updateStatus(); return; }
    if (mine) { sel = sq; redrawAll(); statusText('已选中' + E.pieceName(p) + '，请点击落点'); return; }
    var moves = E.legalMoves(game.board, game.turn);
    for (var i = 0; i < moves.length; i++) {
      if (moves[i].f === sel && moves[i].t === sq) {
        doHumanMove(sel, sq);
        return;
      }
    }
    log('点击非落点, 取消选择');
    sel = -1;
    redrawAll();
    updateStatus();
  }

  function tapPos(e) {
    // 触摸: TouchEvent 无 clientX, 且 touchend 时 touches 为空 -> 优先取 changedTouches
    var t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
    if (t && typeof t.clientX === 'number') return { x: t.clientX, y: t.clientY };
    if (typeof e.clientX === 'number') return { x: e.clientX, y: e.clientY };
    // 极老内核兜底: offsetX 是相对 target 的偏移, 需加上画布原点换算为 clientX
    if (typeof e.offsetX === 'number') {
      var r0 = canvas.getBoundingClientRect();
      return { x: r0.left + e.offsetX, y: r0.top + e.offsetY };
    }
    return null;
  }

  function onTap(e) {
    var now = Date.now();
    if (now - lastTapAt < 80) return;
    lastTapAt = now;
    var pos = tapPos(e);
    if (!pos) return;
    var rect = canvas.getBoundingClientRect();
    var x = (pos.x - rect.left) * ((canvas.width / dpr) / rect.width);
    var y = (pos.y - rect.top) * ((canvas.height / dpr) / rect.height);
    var c = Math.round((x - pad) / cell);
    var r = Math.round((y - pad) / cell);
    if (c < 0 || c > 8 || r < 0 || r > 9) return;
    tapSquare(r * 9 + c);
  }

  function doUndo() {
    var n = game.mode === 'ai' ? 2 : 1;
    if (game.history.length === 0) { toast('无棋可悔', 2500); return; }
    if (aiThinking) {
      if (aiToken) aiToken.cancelled = true;
      aiThinking = false;
      aiToken = null;
    }
    n = Math.min(n, game.history.length);
    for (var i = 0; i < n; i++) unmake(game);
    game.over = false;
    game.result = null;
    sel = -1;
    log('悔棋 ' + n + ' 步, 当前第 ' + game.history.length + ' 步');
    redrawAll();
    save();
    setControls();
  }

  function doNewGame() {
    var prev = game;
    cancelAI();
    game = freshGame();
    game.mode = prev.mode;
    game.level = prev.level;
    game.playerSide = prev.playerSide;
    sel = -1;
    log('新局开始: mode=' + (game.mode === 'ai' ? '人机' : '双人') + ' level=' + game.level);
    closeSettings();
    redrawAll();
    save();
    setControls();
    syncSettingsUI();
    if (game.mode === 'ai' && game.turn !== game.playerSide) startAI();
  }

  function doSideApply(side) {
    if (game.mode !== 'ai') return;
    var prev = game;
    cancelAI();
    game = freshGame();
    game.mode = 'ai';
    game.level = prev.level;
    game.playerSide = side;
    sel = -1;
    log('执棋方已切换: 你执' + (game.playerSide === RED ? '红方' : '黑方') + '，开启新局');
    redrawAll();
    save();
    setControls();
    syncSettingsUI();
    if (game.turn !== game.playerSide) startAI();
  }

  function doGhost() {
    // 强制销毁未完成请求与临时通知, 状态栏彻底重置后显示临时提示(自动恢复)
    cancelAI();
    aiError = null;
    log('去残影: 全屏重绘');
    redrawAll();
    toast('屏幕已刷新，残影已清除', 2500);
  }

  function cancelAI() {
    if (aiToken) { aiToken.cancelled = true; aiToken = null; }
    if (aiFailSafe) { clearTimeout(aiFailSafe); aiFailSafe = 0; }
    aiThinking = false;
  }

  function setMode(m) {
    if (game.mode === m) return;
    cancelAI();
    game.mode = m;
    sel = -1;
    log('模式切换: ' + (m === 'ai' ? '人机对战' : '双人同屏'));
    redrawAll();
    save();
    setControls();
    syncSettingsUI();
    if (m === 'ai' && !game.over && game.turn !== game.playerSide) startAI();
  }

  function setLevel(l) {
    game.level = l;
    log('难度设为: ' + E.LEVELS[l - 1].name);
    save();
    syncSettingsUI();
    updateStatus();
  }

  function bindEvents() {
    // 手势入口统一(解决触摸三连触发): 一次触摸会依次派发 touchstart -> touchend -> click(合成)
    // 只允许手势起点(touchstart)执行, 800ms 内的 touchend/pointerup/click 一律按"同一次手势"丢弃
    // 桌面鼠标只有 click, 不受影响; 手写笔(pen)走 pointerup 兜底
    var lastTstart = 0;
    canvas.addEventListener('touchstart', function (e) {
      e.preventDefault();
      lastTstart = Date.now();
      onTap(e);
    }, { passive: false });
    canvas.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
    canvas.addEventListener('touchend', function (e) {
      if (Date.now() - lastTstart < 800) return;
      onTap(e);
    }, { passive: true });
    canvas.addEventListener('pointerup', function (e) {
      if (!e.pointerType || e.pointerType === 'mouse') return;
      if (Date.now() - lastTstart < 800) return;
      onTap(e);
    }, { passive: true });
    canvas.addEventListener('click', function (e) {
      if (Date.now() - lastTstart < 800) return;
      onTap(e);
    });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    btnUndo.addEventListener('click', doUndo);
    btnNew.addEventListener('click', doNewGame);
    btnGhost.addEventListener('click', doGhost);
    btnSettings.addEventListener('click', openSettings);

    mClose.addEventListener('click', closeSettings);
    modalBackdrop.addEventListener('click', closeSettings);

    mModeAI.addEventListener('click', function () { setMode('ai'); });
    mModeDuel.addEventListener('click', function () { setMode('duel'); });
    mSideRed.addEventListener('click', function () { doSideApply(RED); });
    mSideBlack.addEventListener('click', function () { doSideApply(BLACK); });

    for (var i = 0; i < levelBtns.length; i++) {
      levelBtns[i].addEventListener('click', function () {
        setLevel(parseInt(this.getAttribute('data-level'), 10));
      });
    }

    window.addEventListener('resize', function () { layout(); redrawAll(); });
    window.addEventListener('orientationchange', function () { setTimeout(function () { layout(); redrawAll(); }, 300); });
  }

  function boot() {
    canvas = $('board');
    ctx = canvas.getContext('2d');
    STATUS = $('status');
    capRed = $('capRed');
    capBlack = $('capBlack');
    btnUndo = $('btnUndo');
    btnNew = $('btnNew');
    btnGhost = $('btnGhost');
    btnSettings = $('btnSettings');
    modal = $('settingsModal');
    modalBackdrop = $('modalBackdrop');
    mModeAI = $('mModeAI');
    mModeDuel = $('mModeDuel');
    mSideRed = $('mSideRed');
    mSideBlack = $('mSideBlack');
    mClose = $('mClose');
    mGroupLevel = $('mGroupLevel');
    mGroupSide = $('mGroupSide');
    levelBtns = Array.prototype.slice.call(document.querySelectorAll('#settingsModal .mSel[data-level]'));

    log('老叔之家象棋 v' + E.VERSION + ' 启动, 引擎=' + (E.engineInfo ? E.engineInfo() : E.workerInfo()));

    var saved = loadGame();
    if (saved) {
      game = saved;
      log('已恢复上次对局: 第 ' + game.history.length + ' 步, 模式=' + (game.mode === 'ai' ? '人机' : '双人') + ', 难度=' + E.LEVELS[game.level - 1].name);
    } else {
      game = freshGame();
      log('新对局开始');
    }

    syncSettingsUI();
    setControls();
    layout();
    redrawAll();
    save();
    requestAnimationFrame(function () { layout(); redrawAll(); });

    if (game.over) log('上次对局已结束: ' + resultText(game.result));

    if (game.mode === 'ai' && !game.over && game.turn !== game.playerSide) {
      setTimeout(function () {
        if (!game.over && game.mode === 'ai' && game.turn !== game.playerSide && !aiThinking) startAI();
      }, 400);
    }
    log('就绪: 棋盘 ' + cell.toFixed(1) + 'px/格');
  }

  window.onerror = function (msg, src, line) {
    errorLog('页面错误: ' + msg + ' @' + (src || '?') + ':' + line);
    return false;
  };

  boot();
  bindEvents();
})();
