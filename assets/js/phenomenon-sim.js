/**
 * Multi-family phenomenon visualizer.
 *
 * Design principle: the render "family" follows the physical mechanism,
 * not the phenomenon list. Discharges that share a mechanism (a stepped
 * leader growing toward a target) share the leaderTree engine and differ
 * only by parameters (direction, spread, stroke count, color). Discharges
 * with a genuinely different mechanism (an expanding ionospheric ring, a
 * drifting plasmoid, a continuous corona, an invisible radiation burst,
 * a standing EM wave) get their own dedicated renderer.
 *
 * createPhenomenonSim(canvas, id, opts) returns either:
 *   { isContinuous: false, trigger(), setSpeedMs() }  — discrete event, "Strike"
 *   { isContinuous: true,  toggle(), setSpeedMs() }    — sustained field, "On/Off"
 */

function createPhenomenonSim(canvas, id, opts = {}) {
  const ctx = canvas.getContext('2d');
  let speedMs = opts.initialSpeedMs ?? 45;
  let dpr = Math.max(1, window.devicePixelRatio || 1);

  const cssVar = (name, fallback) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  const BOLT = cssVar('--bolt', '#eaf4ff');
  const GLOW = cssVar('--bolt-glow', '#6fa8ff');
  const BG = cssVar('--bg-inset', '#0a0b0e');
  const FAINT = cssVar('--ink-faint', '#565a63');
  const AMBER = cssVar('--amber', '#ffb454');
  const RED = '#ff6f6f';
  const RED_GLOW = '#ff9a9a';

  let W = 0, H = 0;
  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = Math.max(200, rect.width);
    H = Math.max(140, rect.height);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', () => { resize(); });

  function clear() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
  }

  function sleep(ms) { return new Promise((res) => setTimeout(res, ms)); }

  function parseRangeRandom(str, fallbackMin, fallbackMax) {
    const nums = str ? (str.match(/[\d.]+/g) || []).map(Number) : [];
    if (nums.length >= 2) return nums[0] + Math.random() * (nums[1] - nums[0]);
    if (nums.length === 1) return nums[0];
    return fallbackMin + Math.random() * (fallbackMax - fallbackMin);
  }

  // ---- shared silhouettes -------------------------------------------------
  function drawCloud(cx, cy, scale = 1) {
    ctx.fillStyle = 'rgba(232,233,236,0.10)';
    ctx.beginPath();
    ctx.ellipse(cx - W * 0.16 * scale, cy, W * 0.13 * scale, H * 0.05, 0, 0, Math.PI * 2);
    ctx.ellipse(cx, cy - 4, W * 0.17 * scale, H * 0.06, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + W * 0.15 * scale, cy, W * 0.13 * scale, H * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGround(y) {
    ctx.strokeStyle = FAINT;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawDashedBand(y) {
    ctx.strokeStyle = FAINT;
    ctx.globalAlpha = 0.6;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  function drawAshPlume() {
    const ventX = W * 0.5, ventY = H * 0.62, baseY = H * 0.86;

    // volcano cone
    ctx.fillStyle = 'rgba(58,50,44,0.55)';
    ctx.beginPath();
    ctx.moveTo(W * 0.38, baseY);
    ctx.lineTo(ventX, ventY);
    ctx.lineTo(W * 0.62, baseY);
    ctx.closePath();
    ctx.fill();

    // vent glow — molten rock at the mouth
    const glow = ctx.createRadialGradient(ventX, ventY, 0, ventX, ventY, W * 0.045);
    glow.addColorStop(0, 'rgba(255,150,80,0.45)');
    glow.addColorStop(1, 'rgba(255,150,80,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(ventX, ventY, W * 0.045, 0, Math.PI * 2);
    ctx.fill();

    // ash plume — symmetric closed silhouette, widening upward, no self-crossing
    const topY = H * 0.14;
    const segs = 9;
    const left = [], right = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const y = ventY - t * (ventY - topY);
      const width = (W * 0.045 + t * W * 0.15) * (1 + 0.15 * Math.sin(t * 9));
      left.push({ x: ventX - width, y });
      right.push({ x: ventX + width, y });
    }
    ctx.fillStyle = 'rgba(160,140,124,0.26)';
    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    for (const p of left) ctx.lineTo(p.x, p.y);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
    ctx.closePath();
    ctx.fill();

    drawGround(baseY);
  }

  function drawSnowGround(y) {
    drawGround(y);
    ctx.fillStyle = 'rgba(232,233,236,0.35)';
    for (let i = 0; i < 24; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * W, y - Math.random() * H * 0.1, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawMast() {
    const baseY = H * 0.86;
    ctx.strokeStyle = 'rgba(232,233,236,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W * 0.5, baseY);
    ctx.lineTo(W * 0.5, H * 0.28);
    ctx.stroke();
    drawGround(baseY);
    return { x: W * 0.5, y: H * 0.28 };
  }

  function drawTwoClouds() {
    drawCloud(W * 0.22, H * 0.18, 0.7);
    drawCloud(W * 0.78, H * 0.18, 0.7);
  }

  // ---- generic branching-leader engine ------------------------------------
  function growTree(cfg) {
    const { start, baseAngle, maxDeviation, stepLen, maxDepth, branchProbBase,
      branchDeviation, stopFn, fizzleFn, maxIter } = cfg;
    let order = 0, branchCount = 0;
    let tips = [{ x: start.x, y: start.y, angle: baseAngle, depth: 0, isTrunk: true, alive: true }];
    let trunkDone = false, iter = 0;
    const segments = [];
    while (tips.some((t) => t.alive) && !trunkDone && iter < maxIter) {
      iter++;
      const next = [];
      for (const tip of tips) {
        if (!tip.alive) { next.push(tip); continue; }
        tip.angle += (Math.random() - 0.5) * 0.6;
        const diff = Math.max(-maxDeviation, Math.min(maxDeviation, tip.angle - baseAngle));
        tip.angle = baseAngle + diff;
        const nx = tip.x + Math.cos(tip.angle) * stepLen;
        const ny = tip.y + Math.sin(tip.angle) * stepLen;
        segments.push({ x1: tip.x, y1: tip.y, x2: nx, y2: ny, depth: tip.depth, order, isTrunk: tip.isTrunk });
        tip.x = nx; tip.y = ny;
        if (tip.isTrunk && stopFn(nx, ny)) { trunkDone = true; tip.alive = false; next.push(tip); continue; }
        if (!tip.isTrunk && fizzleFn(nx, ny)) { tip.alive = false; next.push(tip); continue; }
        if (tip.depth < maxDepth && Math.random() < branchProbBase - tip.depth * 0.016) {
          const bang = tip.angle + (Math.random() > 0.5 ? 1 : -1) * branchDeviation * (0.6 + Math.random() * 0.7);
          branchCount++;
          next.push({ x: tip.x, y: tip.y, angle: bang, depth: tip.depth + 1, isTrunk: false, alive: true });
        }
        next.push(tip);
      }
      tips = next; order++;
    }
    return { segments, branchCount, reachedTarget: trunkDone };
  }

  function drawSegments(segments, colorMain, colorGlow) {
    for (const seg of segments) {
      const depthAlpha = Math.max(0.3, 1 - seg.depth * 0.16);
      const lw = Math.max(0.6, (seg.isTrunk ? 2.3 : 1.5) - seg.depth * 0.26);
      ctx.strokeStyle = colorMain;
      ctx.globalAlpha = (seg.flashBoost ? 1 : depthAlpha) * (seg.fadeAlpha ?? 1);
      ctx.lineWidth = seg.flashBoost ? lw + 1.3 : lw;
      ctx.shadowColor = colorGlow;
      ctx.shadowBlur = seg.flashBoost ? 16 : 6;
      ctx.beginPath();
      ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  async function revealTree(segments, sceneDraw, colorMain, colorGlow) {
    const byOrder = new Map();
    for (const seg of segments) {
      if (!byOrder.has(seg.order)) byOrder.set(seg.order, []);
      byOrder.get(seg.order).push(seg);
    }
    const orders = [...byOrder.keys()].sort((a, b) => a - b);
    const revealed = [];
    for (const o of orders) {
      for (const seg of byOrder.get(o)) revealed.push(seg);
      clear(); sceneDraw(); drawSegments(revealed, colorMain, colorGlow);
      await sleep(speedMs);
    }
    return revealed;
  }

  async function flashAndFade(revealed, sceneDraw, colorMain, colorGlow) {
    const trunk = revealed.filter((s) => s.isTrunk).map((s) => ({ ...s, flashBoost: true }));
    const others = revealed.filter((s) => !s.isTrunk);
    clear(); sceneDraw(); drawSegments([...others, ...trunk], colorMain, colorGlow);
    ctx.fillStyle = 'rgba(234,244,255,0.35)';
    ctx.fillRect(0, 0, W, H);
    await sleep(90);
    const steps = 12;
    for (let i = 0; i < steps; i++) {
      const fade = 1 - (i / steps) * 0.85;
      clear(); sceneDraw();
      drawSegments(revealed.map((s) => ({ ...s, fadeAlpha: fade })), colorMain, colorGlow);
      await sleep(45);
    }
  }

  // ==========================================================================
  // FAMILY: leaderTree — any stepped-leader discharge (ground, in-cloud,
  // upward jet, sprite). Direction + spread + target define the physics.
  // ==========================================================================
  function leaderTreeSim(cfg) {
    let token = 0;
    async function trigger() {
      const my = ++token;
      resize();
      const sceneDraw = cfg.sceneDraw;
      const strokes = cfg.strokeCount || 1;
      let lastReadout = '';
      for (let s = 0; s < strokes; s++) {
        if (my !== token) return;
        const start = cfg.startFn();
        const { segments, branchCount } = growTree({
          start,
          baseAngle: cfg.baseAngle,
          maxDeviation: cfg.maxDeviation,
          stepLen: H * cfg.stepLenFactor,
          maxDepth: cfg.maxDepth,
          branchProbBase: cfg.branchProbBase,
          branchDeviation: cfg.branchDeviation,
          stopFn: cfg.stopFn,
          fizzleFn: cfg.fizzleFn,
          maxIter: cfg.maxIter,
        });
        const revealed = await revealTree(segments, sceneDraw, cfg.color, cfg.glow);
        if (my !== token) return;
        await flashAndFade(revealed, sceneDraw, cfg.color, cfg.glow);
        const val = parseRangeRandom(cfg.currentRange(), 15, 40);
        lastReadout = `branches: ${branchCount} · peak current: ${val.toFixed(1)} kA`;
        if (strokes > 1 && s < strokes - 1) await sleep(120);
      }
      if (my !== token) return;
      clear(); sceneDraw();
      opts.onComplete && opts.onComplete(lastReadout);
    }
    resize(); cfg.sceneDraw();
    return { isContinuous: false, trigger, setSpeedMs: (ms) => { speedMs = ms; } };
  }

  // ==========================================================================
  // FAMILY: slowPoint — a single glowing tip crawling across the sky, no
  // branching (Rocket Lightning).
  // ==========================================================================
  function slowPointSim() {
    let token = 0;
    function sceneDraw() { drawCloud(W * 0.5, H * 0.2); }
    async function trigger() {
      const my = ++token;
      resize();
      const trail = [];
      let x = W * 0.15 + Math.random() * W * 0.1;
      let y = H * 0.32;
      const steps = 40;
      for (let i = 0; i < steps; i++) {
        if (my !== token) return;
        x += (W * 0.7 / steps) + (Math.random() - 0.5) * 6;
        y += (Math.random() - 0.5) * 8;
        trail.push({ x, y });
        clear(); sceneDraw();
        ctx.strokeStyle = BOLT;
        ctx.lineWidth = 2;
        ctx.shadowColor = GLOW; ctx.shadowBlur = 10;
        ctx.beginPath();
        trail.forEach((p, idx) => {
          ctx.globalAlpha = Math.max(0.08, 1 - (trail.length - idx) * 0.05);
          if (idx === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = BOLT; ctx.fill();
        await sleep(speedMs * 1.6);
      }
      await sleep(300);
      clear(); sceneDraw();
      opts.onComplete && opts.onComplete('the luminous leader tip crossed the sky at ~10⁴ m/s — slow, trackable motion');
    }
    resize(); sceneDraw();
    return { isContinuous: false, trigger, setSpeedMs: (ms) => { speedMs = ms; } };
  }

  // ==========================================================================
  // FAMILY: distantGlow — no visible channel at all. Heat Lightning is pure
  // optical scattering of a lightning flash too far away to resolve.
  // ==========================================================================
  function distantGlowSim() {
    let token = 0;
    function sceneDraw() {
      drawGround(H * 0.86);
      ctx.fillStyle = 'rgba(232,233,236,0.06)';
      ctx.fillRect(0, H * 0.1, W, H * 0.5);
    }
    async function trigger() {
      const my = ++token;
      resize();
      for (let i = 0; i < 2; i++) {
        if (my !== token) return;
        clear(); sceneDraw();
        const grad = ctx.createRadialGradient(W * 0.5, H * 0.35, 10, W * 0.5, H * 0.35, W * 0.5);
        grad.addColorStop(0, 'rgba(234,244,255,0.22)');
        grad.addColorStop(1, 'rgba(234,244,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
        await sleep(90);
        clear(); sceneDraw();
        await sleep(140);
      }
      opts.onComplete && opts.onComplete('no channel visible — light scattered from a flash 20+ km away; thunder is inaudible');
    }
    resize(); sceneDraw();
    return { isContinuous: false, trigger, setSpeedMs: (ms) => { speedMs = ms; } };
  }

  // ==========================================================================
  // FAMILY: expandingRing — Sprite Halo / ELVES: a disk or ring expands
  // outward from a point and fades. No branching structure.
  // ==========================================================================
  function expandingRingSim(cfg) {
    let token = 0;
    function sceneDraw() {
      drawCloud(W * 0.5, H * 0.92, 0.5);
      drawDashedBand(H * cfg.bandYFactor);
    }
    async function trigger() {
      const my = ++token;
      resize();
      const cx = W * 0.5, cy = H * cfg.bandYFactor;
      const steps = cfg.veryFast ? 10 : 16;
      const maxR = cfg.maxRadiusFactor * Math.min(W, H);
      for (let i = 0; i <= steps; i++) {
        if (my !== token) return;
        const t = i / steps;
        const r = maxR * (cfg.disk ? Math.sqrt(t) : t);
        clear(); sceneDraw();
        ctx.strokeStyle = cfg.color;
        ctx.shadowColor = cfg.glow;
        ctx.shadowBlur = 14;
        ctx.globalAlpha = Math.max(0, 1 - t * 0.9);
        ctx.lineWidth = cfg.disk ? Math.max(1, 10 * (1 - t)) : 2.4;
        ctx.beginPath();
        ctx.ellipse(cx, cy, r, r * 0.22, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
        await sleep(cfg.veryFast ? Math.max(4, speedMs * 0.15) : speedMs * 0.6);
      }
      if (my !== token) return;
      clear(); sceneDraw();
      opts.onComplete && opts.onComplete(cfg.readout);
    }
    resize(); sceneDraw();
    return { isContinuous: false, trigger, setSpeedMs: (ms) => { speedMs = ms; } };
  }

  // ==========================================================================
  // FAMILY: flicker — brief, localized point flashes (Troll, Pixie/Gnome,
  // Triboelectric charging).
  // ==========================================================================
  function flickerSim(cfg) {
    let token = 0;
    function sceneDraw() {
      drawCloud(W * 0.5, H * 0.78, 0.8);
      if (cfg.ghostSpriteAbove) {
        ctx.strokeStyle = RED; ctx.globalAlpha = 0.15;
        ctx.beginPath();
        ctx.moveTo(W * 0.5, H * 0.3); ctx.lineTo(W * 0.5, H * 0.55);
        ctx.stroke(); ctx.globalAlpha = 1;
      }
    }
    async function trigger() {
      const my = ++token;
      resize();
      const baseY = cfg.ghostSpriteAbove ? H * 0.55 : H * 0.7;
      for (let i = 0; i < cfg.blips; i++) {
        if (my !== token) return;
        const x = W * 0.35 + Math.random() * W * 0.3;
        const y = baseY + (Math.random() - 0.5) * H * 0.1 + (cfg.ghostSpriteAbove ? Math.random() * H * 0.15 : 0);
        clear(); sceneDraw();
        ctx.strokeStyle = cfg.color; ctx.shadowColor = cfg.glow; ctx.shadowBlur = 12;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (Math.random() - 0.5) * 10, y + cfg.tailDir * H * 0.06);
        ctx.stroke();
        ctx.shadowBlur = 0;
        await sleep(Math.max(30, speedMs));
        clear(); sceneDraw();
        await sleep(Math.max(20, speedMs * 0.5));
      }
      opts.onComplete && opts.onComplete(cfg.readout);
    }
    resize(); sceneDraw();
    return { isContinuous: false, trigger, setSpeedMs: (ms) => { speedMs = ms; } };
  }

  // ==========================================================================
  // FAMILY: ball — a drifting, pulsing plasmoid (Ball Lightning).
  // ==========================================================================
  function ballSim() {
    let token = 0;
    function sceneDraw() { drawGround(H * 0.82); }
    async function trigger() {
      const my = ++token;
      resize();
      let x = W * 0.15, y = H * 0.7;
      const vx = W * 0.7 / 60;
      for (let i = 0; i < 60; i++) {
        if (my !== token) return;
        x += vx;
        y += Math.sin(i * 0.2) * 1.4;
        const pulse = 0.75 + 0.25 * Math.sin(i * 0.35);
        clear(); sceneDraw();
        const r = 10 * pulse;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
        grad.addColorStop(0, 'rgba(255,214,140,0.95)');
        grad.addColorStop(0.5, 'rgba(255,180,84,0.45)');
        grad.addColorStop(1, 'rgba(255,180,84,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, Math.PI * 2); ctx.fill();
        await sleep(Math.max(12, speedMs * 0.5));
      }
      clear(); sceneDraw();
      opts.onComplete && opts.onComplete('mechanism disputed — observed: walking-speed drift, 1–20 s persistence');
    }
    resize(); sceneDraw();
    return { isContinuous: false, trigger, setSpeedMs: (ms) => { speedMs = ms; } };
  }

  // ==========================================================================
  // FAMILY: steadyCorona — sustained point discharge, not a discrete event
  // (St. Elmo's Fire, Corona Discharge). Toggled on/off, flickers while on.
  // ==========================================================================
  function steadyCoronaSim() {
    let on = false;
    let timer = null;
    const tip = { x: 0, y: 0 };
    function sceneDraw() {
      const t = drawMast();
      tip.x = t.x; tip.y = t.y;
    }
    function loop() {
      if (!on) return;
      clear(); sceneDraw();
      for (let i = 0; i < 6; i++) {
        const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
        const len = 6 + Math.random() * 14;
        ctx.strokeStyle = BOLT;
        ctx.globalAlpha = 0.4 + Math.random() * 0.5;
        ctx.shadowColor = GLOW; ctx.shadowBlur = 8;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(tip.x + Math.cos(ang) * len, tip.y + Math.sin(ang) * len);
        ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      timer = setTimeout(loop, Math.max(30, speedMs * 0.8));
    }
    function toggle() {
      on = !on;
      if (on) { loop(); } else { clearTimeout(timer); resize(); sceneDraw(); }
      opts.onComplete && opts.onComplete(on
        ? 'active — local field exceeds the breakdown threshold; sustained corona discharge'
        : 'inactive');
      return on;
    }
    resize(); sceneDraw();
    return { isContinuous: true, toggle, setSpeedMs: (ms) => { speedMs = ms; } };
  }

  // ==========================================================================
  // FAMILY: beamSchematic — invisible high-energy events (TGF, TEB) shown
  // as a schematic beam / particle path rather than a plasma channel.
  // ==========================================================================
  function bezierPoint(x0, y0, x1, y1, x2, y2, x3, y3, t) {
    const u = 1 - t;
    return {
      x: u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
      y: u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
    };
  }

  function beamSchematicSim(cfg) {
    let token = 0;
    function sceneDraw() { drawCloud(W * 0.5, H * 0.7, 0.7); }
    async function trigger() {
      const my = ++token;
      resize();
      for (let i = 0; i < 3; i++) {
        if (my !== token) return;
        clear(); sceneDraw();
        ctx.strokeStyle = BOLT; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(W * 0.45 + Math.random() * W * 0.1, H * 0.62);
        ctx.lineTo(W * 0.5 + Math.random() * W * 0.1, H * 0.7);
        ctx.stroke(); ctx.globalAlpha = 1;
        await sleep(40);
      }
      if (my !== token) return;
      if (cfg.mode === 'tgf') {
        clear(); sceneDraw();
        ctx.strokeStyle = cfg.color; ctx.globalAlpha = 0.85; ctx.shadowColor = cfg.color; ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.moveTo(W * 0.42, H * 0.6); ctx.lineTo(W * 0.5, H * 0.02);
        ctx.moveTo(W * 0.58, H * 0.6); ctx.lineTo(W * 0.5, H * 0.02);
        ctx.lineWidth = 1.4; ctx.stroke();
        for (let i = 0; i < 6; i++) {
          const yy = H * 0.5 - i * H * 0.08;
          const xx = W * 0.5 + (Math.random() - 0.5) * W * 0.12;
          ctx.beginPath();
          ctx.moveTo(xx - 6, yy); ctx.lineTo(xx + 6, yy);
          ctx.stroke();
        }
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
        await sleep(120);
      } else {
        const steps = 26;
        for (let i = 0; i <= steps; i++) {
          if (my !== token) return;
          const t = i / steps;
          clear(); sceneDraw();
          ctx.strokeStyle = 'rgba(232,233,236,0.18)';
          ctx.beginPath();
          ctx.moveTo(W * 0.5, H * 0.55);
          ctx.bezierCurveTo(W * 0.5, H * 0.2, W * 0.75, H * 0.1, W * 0.85, -H * 0.05);
          ctx.stroke();
          const bp = bezierPoint(W * 0.5, H * 0.55, W * 0.5, H * 0.2, W * 0.75, H * 0.1, W * 0.85, -H * 0.05, t);
          ctx.fillStyle = cfg.color; ctx.shadowColor = cfg.color; ctx.shadowBlur = 10;
          ctx.beginPath(); ctx.arc(bp.x, bp.y, 3, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
          await sleep(Math.max(10, speedMs * 0.4));
        }
      }
      await sleep(200);
      if (my !== token) return;
      clear(); sceneDraw();
      opts.onComplete && opts.onComplete(cfg.readout);
    }
    resize(); sceneDraw();
    return { isContinuous: false, trigger, setSpeedMs: (ms) => { speedMs = ms; } };
  }

  // ==========================================================================
  // Schematics — GEC / Fair-weather field / Schumann resonances.
  // Continuous planetary-scale phenomena, shown as diagrams, not channels.
  // ==========================================================================
  function circuitSim() {
    let on = false, raf = null, phase = 0;
    function sceneDraw() {
      const topY = H * 0.14, botY = H * 0.86;
      ctx.strokeStyle = FAINT; ctx.lineWidth = 1; ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.moveTo(0, topY); ctx.lineTo(W, topY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, botY); ctx.lineTo(W, botY); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = BOLT; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(W * 0.22, botY); ctx.lineTo(W * 0.22, topY); ctx.stroke();
      ctx.beginPath();
      const rx = W * 0.75, steps = 8, seg = (botY - topY) / steps;
      ctx.moveTo(rx, botY);
      for (let i = 1; i <= steps; i++) ctx.lineTo(rx + (i % 2 === 0 ? 8 : -8), botY - i * seg);
      ctx.stroke();
      return { topY, botY };
    }
    function loop() {
      if (!on) return;
      const { topY, botY } = sceneDraw();
      phase += 0.06;
      const t1 = (Math.sin(phase) + 1) / 2;
      const y1 = botY - t1 * (botY - topY);
      ctx.fillStyle = BOLT; ctx.shadowColor = GLOW; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(W * 0.22, y1, 3, 0, Math.PI * 2); ctx.fill();
      const t2 = (Math.sin(phase + Math.PI) + 1) / 2;
      const y2 = topY + t2 * (botY - topY);
      ctx.beginPath(); ctx.arc(W * 0.75, y2, 3, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(loop);
    }
    function toggle() {
      on = !on;
      if (on) loop(); else { cancelAnimationFrame(raf); clear(); sceneDraw(); }
      opts.onComplete && opts.onComplete(on
        ? 'active — global circuit: storms are the generator, fair-weather regions the return resistance'
        : 'inactive');
      return on;
    }
    resize(); sceneDraw();
    return { isContinuous: true, toggle, setSpeedMs: () => {} };
  }

  function fieldLinesSim() {
    let on = false, raf = null, phase = 0;
    function sceneDraw() {
      drawDashedBand(H * 0.1);
      drawGround(H * 0.88);
      ctx.strokeStyle = 'rgba(232,233,236,0.16)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 8; i++) {
        const x = (W / 8) * i;
        ctx.beginPath(); ctx.moveTo(x, H * 0.1); ctx.lineTo(x, H * 0.88); ctx.stroke();
      }
    }
    function loop() {
      if (!on) return;
      clear(); sceneDraw();
      phase += 0.02;
      ctx.fillStyle = BOLT; ctx.shadowColor = GLOW; ctx.shadowBlur = 6;
      for (let i = 1; i < 8; i++) {
        const x = (W / 8) * i;
        const t = (phase + i * 0.13) % 1;
        const y = H * 0.1 + t * (H * 0.78);
        ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(loop);
    }
    function toggle() {
      on = !on;
      if (on) loop(); else { cancelAnimationFrame(raf); clear(); sceneDraw(); }
      opts.onComplete && opts.onComplete(on
        ? 'active — downward ~100–150 V/m surface field, fair-weather current carried by ions'
        : 'inactive');
      return on;
    }
    resize(); sceneDraw();
    return { isContinuous: true, toggle, setSpeedMs: () => {} };
  }

  function waveformSim() {
    let on = false, raf = null, phase = 0;
    function sceneDraw() {
      ctx.strokeStyle = FAINT; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(W * 0.5, H * 1.05, H * 0.5, Math.PI, 2 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(W * 0.5, H * 1.35, H * 0.5, Math.PI, 2 * Math.PI); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    function loop() {
      if (!on) return;
      clear(); sceneDraw();
      phase += 0.12;
      ctx.strokeStyle = BOLT; ctx.shadowColor = GLOW; ctx.shadowBlur = 8; ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 4) {
        const y = H * 0.5 + Math.sin(x * 0.045 + phase) * H * 0.12;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke(); ctx.shadowBlur = 0;
      raf = requestAnimationFrame(loop);
    }
    function toggle() {
      on = !on;
      if (on) loop(); else { cancelAnimationFrame(raf); clear(); sceneDraw(); }
      opts.onComplete && opts.onComplete(on
        ? 'active — a standing wave in the Earth–ionosphere cavity, fundamental mode ~7.83 Hz'
        : 'inactive');
      return on;
    }
    resize(); sceneDraw();
    return { isContinuous: true, toggle, setSpeedMs: (ms) => { speedMs = ms; } };
  }

  // ==========================================================================
  // Dispatch table — one entry per phenomenon id.
  // ==========================================================================
  function stdGroundCfg(overrides = {}) {
    return Object.assign({
      sceneDraw: () => { drawCloud(W * 0.5, H * 0.18); drawGround(H * 0.86); },
      startFn: () => ({ x: W * 0.5 + (Math.random() - 0.5) * W * 0.1, y: H * 0.24 }),
      baseAngle: Math.PI / 2, maxDeviation: 0.55, branchDeviation: 0.55,
      stepLenFactor: 0.026, maxDepth: 4, branchProbBase: 0.1, maxIter: 260,
      stopFn: (x, y) => y >= H * 0.86,
      fizzleFn: (x, y) => y >= H * 0.86 - H * (0.04 + Math.random() * 0.18),
      color: BOLT, glow: GLOW, strokeCount: 1,
      currentRange: () => opts.currentRange(),
    }, overrides);
  }

  function upwardCfg(overrides = {}) {
    return Object.assign({
      sceneDraw: () => { drawCloud(W * 0.5, H * 0.84, 0.85); },
      startFn: () => ({ x: W * 0.5 + (Math.random() - 0.5) * W * 0.08, y: H * 0.76 }),
      baseAngle: -Math.PI / 2, maxDeviation: 0.35, branchDeviation: 0.4,
      stepLenFactor: 0.022, maxDepth: 3, branchProbBase: 0.07, maxIter: 220,
      stopFn: (x, y) => y <= H * 0.05,
      fizzleFn: (x, y) => y <= H * 0.15 + Math.random() * H * 0.2,
      color: '#9fc4ff', glow: '#3d6fd6', strokeCount: 1,
      currentRange: () => opts.currentRange(),
    }, overrides);
  }

  const table = {
    'cg-negative': () => leaderTreeSim(stdGroundCfg({ strokeCount: 2 + Math.floor(Math.random() * 2) })),
    'cg-positive': () => leaderTreeSim(stdGroundCfg({ maxDeviation: 0.3, branchProbBase: 0.06, strokeCount: 1, color: '#fff2d8', glow: '#ffcf7a' })),
    'staccato': () => leaderTreeSim(stdGroundCfg({ strokeCount: 1, branchProbBase: 0.13 })),
    'ribbon': () => leaderTreeSim(stdGroundCfg({ strokeCount: 3 })),
    'bead': () => leaderTreeSim(stdGroundCfg({ strokeCount: 1, branchProbBase: 0.05 })),
    'bolt-from-blue': () => leaderTreeSim(stdGroundCfg({
      sceneDraw: () => { drawCloud(W * 0.18, H * 0.14, 0.6); drawGround(H * 0.86); },
      startFn: () => ({ x: W * 0.22, y: H * 0.2 }),
      baseAngle: 0.35, maxDeviation: 0.25, stepLenFactor: 0.03, maxIter: 200,
      stopFn: (x, y) => x > W * 0.6 && y >= H * 0.5,
      fizzleFn: (x, y) => y >= H * 0.86,
    })),
    'superbolt': () => leaderTreeSim(stdGroundCfg({ maxDeviation: 0.3, color: '#ffffff', glow: '#bcdcff', strokeCount: 1 })),
    'forked': () => leaderTreeSim(stdGroundCfg({ branchProbBase: 0.14 })),
    'dry': () => leaderTreeSim(stdGroundCfg({ color: '#ffe8c2', glow: AMBER })),
    'thundersnow': () => leaderTreeSim(stdGroundCfg({
      sceneDraw: () => { drawCloud(W * 0.5, H * 0.18); drawSnowGround(H * 0.86); },
    })),
    'volcanic': () => leaderTreeSim(stdGroundCfg({
      sceneDraw: () => { drawAshPlume(); },
      startFn: () => ({ x: W * 0.5 + (Math.random() - 0.5) * W * 0.06, y: H * 0.62 }),
      stopFn: (x, y) => y >= H * 0.86,
      color: '#ffd8a8', glow: '#c98a4a', branchProbBase: 0.13,
    })),

    'intracloud': () => leaderTreeSim(stdGroundCfg({
      sceneDraw: () => drawCloud(W * 0.5, H * 0.5, 1.3),
      startFn: () => ({ x: W * 0.4, y: H * 0.5 }),
      baseAngle: 0, maxDeviation: Math.PI, stepLenFactor: 0.018, maxIter: 90,
      stopFn: () => false,
      fizzleFn: (x, y) => x < W * 0.1 || x > W * 0.9 || y < H * 0.2 || y > H * 0.8,
      branchProbBase: 0.14, glow: '#8fb4e8', strokeCount: 1,
    })),
    'intercloud': () => leaderTreeSim(stdGroundCfg({
      sceneDraw: () => drawTwoClouds(),
      startFn: () => ({ x: W * 0.32, y: H * 0.2 }),
      baseAngle: 0, maxDeviation: 0.25, stepLenFactor: 0.026, maxIter: 150,
      stopFn: (x) => x >= W * 0.68,
      fizzleFn: () => false,
    })),
    'cloud-to-air': () => leaderTreeSim(stdGroundCfg({
      sceneDraw: () => drawCloud(W * 0.35, H * 0.2, 0.8),
      startFn: () => ({ x: W * 0.45, y: H * 0.22 }),
      baseAngle: 0.9, maxDeviation: 0.9, stepLenFactor: 0.02, maxIter: 70,
      stopFn: () => false,
      fizzleFn: (x, y) => y > H * 0.55,
    })),
    'spider': () => leaderTreeSim(stdGroundCfg({
      sceneDraw: () => drawCloud(W * 0.5, H * 0.16, 1.4),
      startFn: () => ({ x: W * 0.1, y: H * 0.22 }),
      baseAngle: 0, maxDeviation: 0.5, branchDeviation: 0.7,
      stepLenFactor: 0.02, maxIter: 260, maxDepth: 5, branchProbBase: 0.16,
      stopFn: (x) => x >= W * 0.9,
      fizzleFn: (x) => x > W * 0.95 || x < W * 0.02,
    })),
    'anvil-crawler': () => leaderTreeSim(stdGroundCfg({
      sceneDraw: () => drawCloud(W * 0.5, H * 0.16, 1.4),
      startFn: () => ({ x: W * 0.12, y: H * 0.18 }),
      baseAngle: 0, maxDeviation: 0.35, stepLenFactor: 0.022, maxIter: 220,
      maxDepth: 4, branchProbBase: 0.1,
      stopFn: (x) => x >= W * 0.88,
      fizzleFn: (x) => x > W * 0.95 || x < W * 0.02,
    })),

    'blue-jet': () => leaderTreeSim(upwardCfg()),
    'blue-starter': () => leaderTreeSim(upwardCfg({ stopFn: () => false, fizzleFn: (x, y) => y <= H * 0.55, maxIter: 60 })),
    'gigantic-jet': () => leaderTreeSim(upwardCfg({
      stepLenFactor: 0.026, maxDeviation: 0.45, maxDepth: 4, branchProbBase: 0.09,
      color: '#ff9a9a', glow: '#d64d4d',
    })),

    'red-sprite': () => leaderTreeSim({
      sceneDraw: () => { drawCloud(W * 0.5, H * 0.94, 0.4); drawDashedBand(H * 0.28); },
      startFn: () => ({ x: W * 0.5, y: H * 0.28 }),
      baseAngle: Math.PI / 2, maxDeviation: 1.1, branchDeviation: 0.7,
      stepLenFactor: 0.02, maxDepth: 4, branchProbBase: 0.14, maxIter: 150,
      stopFn: () => false,
      fizzleFn: (x, y) => y >= H * 0.85 || y <= H * 0.05,
      color: RED, glow: RED_GLOW, strokeCount: 1,
      currentRange: () => opts.currentRange(),
    }),

    'rocket': () => slowPointSim(),
    'heat': () => distantGlowSim(),

    'ball-lightning': () => ballSim(),
    'st-elmos-fire': () => steadyCoronaSim(),
    'corona': () => steadyCoronaSim(),

    'sprite-halo': () => expandingRingSim({
      bandYFactor: 0.32, maxRadiusFactor: 0.55, disk: true, veryFast: false,
      color: RED, glow: RED_GLOW, readout: '~14 MJ per event, a flat red disk lasting 1–10 ms',
    }),
    'elves': () => expandingRingSim({
      bandYFactor: 0.15, maxRadiusFactor: 0.9, disk: false, veryFast: true,
      color: '#bfe6ff', glow: '#6fa8ff',
      readout: '~19 MJ per event, <1 ms — apparent expansion speed exceeds light speed (wavefront geometry)',
    }),

    'troll': () => flickerSim({ blips: 4, tailDir: 1, ghostSpriteAbove: true, color: RED, glow: RED_GLOW, readout: 'secondary reignition along a decaying sprite tendril' }),
    'pixie-gnome': () => flickerSim({ blips: 5, tailDir: -0.6, ghostSpriteAbove: false, color: BOLT, glow: GLOW, readout: 'localized micro-breakdown at the cloud top, no associated lightning' }),
    'triboelectric': () => flickerSim({ blips: 6, tailDir: 0.3, ghostSpriteAbove: false, color: AMBER, glow: AMBER, readout: 'charge transfer of 10⁻¹⁴–10⁻¹² C between colliding ice particles' }),

    'tgf': () => beamSchematicSim({ mode: 'tgf', color: '#bfe6ff', readout: '0.1–1 ms, 20–40 MeV photons — the visible light comes from the associated discharge, not the burst itself' }),
    'teb': () => beamSchematicSim({ mode: 'teb', color: '#bfe6ff', readout: 'e⁻/e⁺ beam escaping along a geomagnetic field line into the magnetosphere' }),

    'gec': () => circuitSim(),
    'fair-weather-field': () => fieldLinesSim(),
    'schumann': () => waveformSim(),
  };

  const factory = table[id];
  if (!factory) {
    resize();
    return leaderTreeSim(stdGroundCfg());
  }
  return factory();
}
