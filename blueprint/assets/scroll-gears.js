// The moving machinery layer, fixed to the viewport and driven by scroll —
// one connected drivetrain:
//   gear A (lower-left, 20 teeth) meshes gear B (10 teeth, opposite way,
//   twice the speed);
//   -> belt off gear A's shaft along the bottom -> big pulley (right edge)
//   -> cable up to a smaller pulley, with a little pinion gear resting on
//   it, and a guide roller breaking up the long belt run.
// Drawn as drafting linework in warm cream ink.
//
// The svg viewBox matches the viewport aspect (height fixed at 1000 units)
// so the gears (left) and the pulley column (right edge) are both always in
// view. On screens too narrow for the rig it hides and the gear cluster
// scales down into the corner instead.
(function () {
  var SVGNS = 'http://www.w3.org/2000/svg';
  var INK = '#E9E2CF';   // warm drafting cream, same family as the text ink

  // Gears A and B mesh externally: same module m = 2*pitch/teeth = 15,
  // which is what lets their teeth engage.
  var A = { cx: 250, cy: 812, teeth: 20, pitch: 150 };
  var B = { cx: 435, cy: 684, teeth: 10, pitch: 75 };

  var SHEAVE = 64;    // belt pulley on gear A's shaft
  var R_TOP = 36;     // upper cable wheel
  var R_BOT = 48;     // lower (drive) cable wheel
  var R_GUIDE = 9;    // belt-guide roller mid-run
  var GUIDE_X = 960;  // where the guide hangs (fixed: a clear column)
  var DASH = 24;      // dash period of belt + cable ("10 14")

  function el(name, attrs) {
    var e = document.createElementNS(SVGNS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  // Closed gear silhouette: for each tooth, root arc -> leading flank ->
  // tip arc -> trailing flank. Angles measured clockwise from straight up
  // so tooth 0 points up (all the phase math relies on that).
  function gearPath(cx, cy, teeth, rTip, rRoot, m) {
    var step = (2 * Math.PI) / teeth;
    // Half tooth thickness as arc length at the pitch circle (p/4), tapered:
    // a little wider at the root, about half as wide at the tip.
    var half = (Math.PI * m) / 4;
    var aRoot = (half * 0.95) / rRoot;
    var aTip = (half * 0.5) / rTip;

    function pt(r, a) {
      return (cx + r * Math.sin(a)).toFixed(2) + ' ' + (cy - r * Math.cos(a)).toFixed(2);
    }
    function arc(r, a) { return 'A' + r + ' ' + r + ' 0 0 1 ' + pt(r, a); }

    var d = [];
    for (var i = 0; i < teeth; i++) {
      var a0 = i * step;
      d.push(i === 0 ? 'M' + pt(rRoot, a0 - aRoot) : arc(rRoot, a0 - aRoot));
      d.push('L' + pt(rTip, a0 - aTip));
      d.push(arc(rTip, a0 + aTip));
      d.push('L' + pt(rRoot, a0 + aRoot));
    }
    d.push(arc(rRoot, 2 * Math.PI - aRoot));
    d.push('Z');
    return d.join(' ');
  }

  function externalGearPath(cx, cy, teeth, pitch, m) {
    return gearPath(cx, cy, teeth, pitch + m, pitch - 1.25 * m, m);
  }

  // A plain external gear: hub, bore, and (on big gears) lightening holes.
  function buildGear(g) {
    var m = 2 * g.pitch / g.teeth;
    var rRoot = g.pitch - 1.25 * m;
    var rHub = g.pitch * 0.32;
    var rBore = g.pitch * 0.13;

    var grp = el('g', { fill: 'none', stroke: INK });

    // Static drawing marks (don't rotate): dash-dot pitch circle, centre cross.
    var marks = el('g', { 'stroke-width': 1, 'stroke-opacity': 0.13 });
    marks.appendChild(el('circle', {
      cx: g.cx, cy: g.cy, r: g.pitch, 'stroke-dasharray': '14 5 2.5 5'
    }));
    var cross = rBore + 14;
    marks.appendChild(el('line', { x1: g.cx - cross, y1: g.cy, x2: g.cx + cross, y2: g.cy }));
    marks.appendChild(el('line', { x1: g.cx, y1: g.cy - cross, x2: g.cx, y2: g.cy + cross }));
    grp.appendChild(marks);

    // Rotating body: tooth outline, hub, bore, lightening holes.
    var rot = el('g', { 'stroke-width': 1.3, 'stroke-opacity': 0.2, 'stroke-linejoin': 'round' });
    rot.appendChild(el('path', { d: externalGearPath(g.cx, g.cy, g.teeth, g.pitch, m) }));
    rot.appendChild(el('circle', { cx: g.cx, cy: g.cy, r: rHub }));
    rot.appendChild(el('circle', { cx: g.cx, cy: g.cy, r: rBore }));

    if (g.teeth >= 16) {
      var rRing = (rHub + rRoot) / 2;       // hole centres, midway across the web
      var rHole = (rRoot - rHub) * 0.26;
      for (var s = 0; s < 6; s++) {
        var a = (s * Math.PI) / 3;
        rot.appendChild(el('circle', {
          cx: (g.cx + rRing * Math.sin(a)).toFixed(2),
          cy: (g.cy - rRing * Math.cos(a)).toFixed(2),
          r: rHole.toFixed(2),
          'stroke-opacity': 0.16
        }));
      }
    }
    grp.appendChild(rot);
    return { node: grp, rot: rot };
  }

  // Open (non-crossed) belt around two circles as one closed path, so a
  // dash pattern can run along it.
  function beltPath(c1x, c1y, r1, c2x, c2y, r2) {
    var dx = c2x - c1x, dy = c2y - c1y;
    var d = Math.sqrt(dx * dx + dy * dy);
    var base = Math.atan2(dy, dx);
    var t = Math.acos((r1 - r2) / d);
    function pt(cx, cy, r, a) {
      return (cx + r * Math.cos(a)).toFixed(2) + ' ' + (cy + r * Math.sin(a)).toFixed(2);
    }
    var a1 = base + t, a2 = base - t;
    return [
      'M' + pt(c1x, c1y, r1, a1),
      'L' + pt(c2x, c2y, r2, a1),
      'A' + r2 + ' ' + r2 + ' 0 1 0 ' + pt(c2x, c2y, r2, a2),
      'L' + pt(c1x, c1y, r1, a2),
      'A' + r1 + ' ' + r1 + ' 0 0 0 ' + pt(c1x, c1y, r1, a1),
      'Z'
    ].join(' ');
  }

  function buildWheel(x, y, r) {
    var wheel = el('g', { 'stroke-width': 1.3, 'stroke-opacity': 0.18 });
    wheel.appendChild(el('circle', { cx: x, cy: y, r: r }));
    wheel.appendChild(el('circle', { cx: x, cy: y, r: r - 7 }));
    wheel.appendChild(el('circle', { cx: x, cy: y, r: 9 }));
    wheel.appendChild(el('circle', { cx: x, cy: y, r: 4.5 }));
    var spokes = el('g', { 'stroke-width': 1.2, 'stroke-opacity': 0.15 });
    for (var s = 0; s < 4; s++) {
      spokes.appendChild(el('line', {
        x1: x, y1: y - 9, x2: x, y2: y - r + 9,
        transform: 'rotate(' + (s * 45) + ' ' + x + ' ' + y + ')'
      }));
      spokes.appendChild(el('line', {
        x1: x, y1: y + 9, x2: x, y2: y + r - 9,
        transform: 'rotate(' + (s * 45) + ' ' + x + ' ' + y + ')'
      }));
    }
    return { wheel: wheel, spokes: spokes, x: x, y: y, r: r };
  }

  // Right-edge rig: big drive pulley (belted to gear A's sheave) low,
  // smaller wheel high with a little pinion gear resting against it, cable
  // between the two wheels, and a guide roller breaking up the long belt
  // run. Skipped when it would crowd the gears.
  function buildRig(W) {
    // below this the guide column and pinion crowd each other and the gears
    if (W < 1210) return null;
    var x = W - 132;
    var top = { x: x, y: 120 };
    var bot = { x: x, y: 830 };

    var grp = el('g', { fill: 'none', stroke: INK });

    // axle mounts: top wheel hangs from the sheet top; the bottom wheel
    // brackets sideways off the right edge (straight down would cross the
    // amber doodles that live below the belt)
    grp.appendChild(el('line', {
      x1: x, y1: 0, x2: x, y2: top.y, 'stroke-width': 1.2, 'stroke-opacity': 0.16
    }));
    grp.appendChild(el('line', {
      x1: W, y1: bot.y, x2: bot.x + R_BOT, y2: bot.y, 'stroke-width': 1.2, 'stroke-opacity': 0.16
    }));

    // belt: sheave on gear A's shaft -> big pulley, low across the sheet
    var belt = el('path', {
      d: beltPath(A.cx, A.cy, SHEAVE, bot.x, bot.y, R_BOT),
      'stroke-width': 1.4, 'stroke-opacity': 0.13,
      'stroke-dasharray': '10 14', 'stroke-linecap': 'round'
    });
    grp.appendChild(belt);
    // the sheave itself, sitting on gear A's hub
    grp.appendChild(el('circle', {
      cx: A.cx, cy: A.cy, r: SHEAVE, 'stroke-width': 1.2, 'stroke-opacity': 0.16
    }));

    // cable between the two wheels
    var loop = el('path', {
      d: beltPath(top.x, top.y, R_TOP, bot.x, bot.y, R_BOT),
      'stroke-width': 1.4, 'stroke-opacity': 0.15,
      'stroke-dasharray': '10 14', 'stroke-linecap': 'round'
    });
    grp.appendChild(loop);

    var wTop = buildWheel(top.x, top.y, R_TOP);
    var wBot = buildWheel(bot.x, bot.y, R_BOT);
    grp.appendChild(wTop.wheel); grp.appendChild(wTop.spokes);
    grp.appendChild(wBot.wheel); grp.appendChild(wBot.spokes);

    // the pinion: a small 8-tooth gear offset diagonally up-left of the top
    // wheel, its tooth tips just touching the wheel's rim (tip radius =
    // pitch + module = 37.5), so they connect without overlapping
    var pinTip = 30 + 2 * 30 / 8;
    var pinDist = R_TOP + pinTip - 0.5;
    var pin = {
      cx: Math.round(top.x - pinDist * Math.SQRT1_2),
      cy: Math.round(top.y - pinDist * Math.SQRT1_2),
      teeth: 8, pitch: 30
    };
    grp.appendChild(el('line', {
      x1: pin.cx, y1: 0, x2: pin.cx, y2: pin.cy, 'stroke-width': 1.2, 'stroke-opacity': 0.16
    }));
    var pinion = buildGear(pin);
    grp.appendChild(pinion.node);

    // belt-guide roller: hangs from the sheet top on a fixed column and
    // rests exactly on the belt's upper run, breaking up the long line
    var bdx = bot.x - A.cx, bdy = bot.y - A.cy;
    var bd = Math.sqrt(bdx * bdx + bdy * bdy);
    var ua = Math.atan2(bdy, bdx) - Math.acos((SHEAVE - R_BOT) / bd); // upper tangent
    var ux1 = A.cx + SHEAVE * Math.cos(ua), uy1 = A.cy + SHEAVE * Math.sin(ua);
    var ux2 = bot.x + R_BOT * Math.cos(ua), uy2 = bot.y + R_BOT * Math.sin(ua);
    var gt = (GUIDE_X - ux1) / (ux2 - ux1);
    var guide = {
      x: GUIDE_X + Math.cos(ua) * R_GUIDE,
      y: uy1 + gt * (uy2 - uy1) + Math.sin(ua) * R_GUIDE
    };
    grp.appendChild(el('line', {
      x1: guide.x.toFixed(2), y1: 0, x2: guide.x.toFixed(2), y2: guide.y.toFixed(2),
      'stroke-width': 1.2, 'stroke-opacity': 0.16
    }));
    grp.appendChild(el('circle', {
      cx: guide.x.toFixed(2), cy: guide.y.toFixed(2), r: R_GUIDE,
      'stroke-width': 1.2, 'stroke-opacity': 0.18
    }));
    guide.spokes = el('g', { 'stroke-width': 1, 'stroke-opacity': 0.16 });
    guide.spokes.appendChild(el('line', {
      x1: guide.x.toFixed(2), y1: (guide.y - R_GUIDE + 2.5).toFixed(2),
      x2: guide.x.toFixed(2), y2: (guide.y + R_GUIDE - 2.5).toFixed(2)
    }));
    guide.spokes.appendChild(el('line', {
      x1: (guide.x - R_GUIDE + 2.5).toFixed(2), y1: guide.y.toFixed(2),
      x2: (guide.x + R_GUIDE - 2.5).toFixed(2), y2: guide.y.toFixed(2)
    }));
    grp.appendChild(guide.spokes);

    return {
      node: grp, belt: belt, loop: loop,
      wheels: [wTop, wBot], pinion: pinion, pin: pin, guide: guide
    };
  }

  var svg = el('svg', { preserveAspectRatio: 'xMinYMax slice' });
  var gA = buildGear(A);
  var gB = buildGear(B);
  // The cluster sits in a wrapper pinned to the bottom-left corner; on
  // narrow (phone) screens it scales down so gear B never runs off the
  // right edge. The rig only exists at s = 1, so the belt always lines up.
  var gearWrap = el('g');
  gearWrap.appendChild(gA.node);
  gearWrap.appendChild(gB.node);
  var rig = null;

  function layout() {
    var W = Math.max(320, Math.round(1000 * window.innerWidth / Math.max(window.innerHeight, 1)));
    svg.setAttribute('viewBox', '0 0 ' + W + ' 1000');
    var s = Math.min(1, W / 545);
    gearWrap.setAttribute('transform',
      'translate(0 ' + (1000 * (1 - s)).toFixed(1) + ') scale(' + s.toFixed(4) + ')');
    if (rig) { svg.removeChild(rig.node); rig = null; }
    rig = buildRig(W);
    if (rig) svg.insertBefore(rig.node, gearWrap);
  }

  svg.appendChild(gearWrap);
  layout();

  var layer = document.createElement('div');
  layer.className = 'gear-bg';
  layer.setAttribute('aria-hidden', 'true');
  layer.appendChild(svg);
  document.body.insertBefore(layer, document.body.firstChild);

  // Base phases: point a tooth of A at B, and face a gap of B's ring
  // toward A, so they read as engaged. "Clockwise-from-up" angle of the
  // centre-to-centre vector (screen coords, y down): atan2(dx, -dy).
  var dx = B.cx - A.cx, dy = B.cy - A.cy;
  var lineAng = Math.atan2(dx, -dy) * 180 / Math.PI;
  var baseA = lineAng;
  var baseB = lineAng + 180 + (360 / B.teeth) / 2;

  var ratioB = A.teeth / B.teeth; // 2 — B turns twice as fast
  var K = 0.12;                   // degrees of gear A per pixel scrolled
  var DEG = Math.PI / 180;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setRot(node, cx, cy, deg) {
    node.setAttribute('transform', 'rotate(' + deg + ' ' + cx + ' ' + cy + ')');
  }

  var ticking = false;
  function render() {
    ticking = false;
    var y = reduce ? 0 : (window.pageYOffset || document.documentElement.scrollTop || 0);
    var a = y * K;
    setRot(gA.rot, A.cx, A.cy, baseA + a);
    setRot(gB.rot, B.cx, B.cy, baseB - a * ratioB);

    if (rig) {
      // The belt rides gear A's sheave and everything downstream runs at
      // its surface speed; each wheel's spin follows its own radius, so
      // the small ones whirl. Positive dash offset runs both loops
      // clockwise, the same sense as gear A and the wheels' spin.
      var v = a * DEG * SHEAVE;
      rig.belt.setAttribute('stroke-dashoffset', (v % DASH).toFixed(2));
      rig.loop.setAttribute('stroke-dashoffset', (v % DASH).toFixed(2));
      for (var i = 0; i < rig.wheels.length; i++) {
        var w = rig.wheels[i];
        setRot(w.spokes, w.x, w.y, v / w.r / DEG);
      }
      // pinion surface speed matches the top wheel's rim, opposite way;
      // the little guide roller whirls with the belt sliding under it
      setRot(rig.pinion.rot, rig.pin.cx, rig.pin.cy, -v / rig.pin.pitch / DEG);
      setRot(rig.guide.spokes, rig.guide.x, rig.guide.y, -v / R_GUIDE / DEG);
    }
  }
  function onScroll() {
    if (!ticking) { ticking = true; requestAnimationFrame(render); }
  }

  var resizeTimer = null;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { layout(); render(); }, 150);
  }

  render();
  if (!reduce) window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);
})();
