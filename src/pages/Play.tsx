import { useEffect, useRef, useState } from "react";

/* eslint-disable react-hooks/exhaustive-deps */

// Canonical 13 Creator Type palette
const TYPES: Record<string, string> = {
  Lava: "#E85500", Fire: "#F07000", Whirlwind: "#2D7A00",
  Snow: "#00B887", Lightning: "#7CC800", Sun: "#F5A300",
  Lake: "#00A8CC", Ocean: "#1B3FB5",
  Tree: "#b00000", Mountain: "#F02000", Soil: "#8B1717",
  River: "#00AAEE", Sky: "#5BB8D4",
};

const SIZE = 46;
const NEIGH: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

type Cell = { q: number; r: number; kind: "creator" | "animal" | "special"; type: string; label: string; element: string };

function axialToPixel(q: number, r: number) {
  return [SIZE * Math.sqrt(3) * (q + r / 2), SIZE * 3 / 2 * r];
}
function hexPoints(cx: number, cy: number, size: number) {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const ang = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${(cx + size * Math.cos(ang)).toFixed(2)},${(cy + size * Math.sin(ang)).toFixed(2)}`);
  }
  return pts.join(" ");
}
function neighborsOf(cells: Cell[]) {
  const occ = new Set(cells.map((c) => `${c.q},${c.r}`));
  const adj = new Set<string>();
  cells.forEach((c) => NEIGH.forEach(([dq, dr]) => {
    const k = `${c.q + dq},${c.r + dr}`;
    if (!occ.has(k)) adj.add(k);
  }));
  return [...adj].map((k) => { const [q, r] = k.split(",").map(Number); return { q, r }; });
}

function renderBoard(svgEl: SVGSVGElement, cells: Cell[], opts: { showEmpty?: boolean } = {}) {
  const showEmpty = opts.showEmpty !== false;
  svgEl.innerHTML = "";
  const NS = "http://www.w3.org/2000/svg";
  const defs = document.createElementNS(NS, "defs");
  defs.innerHTML = `<linearGradient id="goldGrad" x1="0" x2="1" y1="0" y2="1">
    <stop offset="0%" stop-color="#FFD700"/><stop offset="100%" stop-color="#F5A300"/>
  </linearGradient>`;
  svgEl.appendChild(defs);
  const g = document.createElementNS(NS, "g");

  if (showEmpty) {
    neighborsOf(cells).forEach(({ q, r }) => {
      const [x, y] = axialToPixel(q, r);
      const poly = document.createElementNS(NS, "polygon");
      poly.setAttribute("points", hexPoints(x, y, SIZE - 2));
      poly.setAttribute("fill", "rgba(255,255,255,.02)");
      poly.setAttribute("stroke", "rgba(245,163,0,.45)");
      poly.setAttribute("stroke-dasharray", "4 4");
      poly.setAttribute("stroke-width", "1.5");
      poly.style.cursor = "pointer";
      poly.addEventListener("mouseenter", () => poly.setAttribute("fill", "rgba(245,163,0,.18)"));
      poly.addEventListener("mouseleave", () => poly.setAttribute("fill", "rgba(255,255,255,.02)"));
      g.appendChild(poly);
    });
  }

  cells.forEach((c) => {
    const [x, y] = axialToPixel(c.q, c.r);
    const color = TYPES[c.type] || "#666";
    const isCreator = c.kind === "creator";
    const isSpecial = c.kind === "special";
    const poly = document.createElementNS(NS, "polygon");
    poly.setAttribute("points", hexPoints(x, y, SIZE - 2));
    if (isSpecial) poly.setAttribute("fill", "url(#goldGrad)");
    else if (isCreator) poly.setAttribute("fill", color);
    else { poly.setAttribute("fill", color); poly.setAttribute("fill-opacity", ".55"); }
    poly.setAttribute("stroke", isCreator ? "#fff" : "rgba(255,255,255,.35)");
    poly.setAttribute("stroke-width", isCreator ? "3" : "1.5");
    g.appendChild(poly);

    const t1 = document.createElementNS(NS, "text");
    t1.setAttribute("x", String(x)); t1.setAttribute("y", String(y - 4));
    t1.setAttribute("text-anchor", "middle"); t1.setAttribute("dominant-baseline", "middle");
    t1.setAttribute("font-size", String(isCreator ? 26 : 22));
    t1.textContent = c.element || "◆";
    g.appendChild(t1);

    const t2 = document.createElementNS(NS, "text");
    t2.setAttribute("x", String(x)); t2.setAttribute("y", String(y + 18));
    t2.setAttribute("text-anchor", "middle");
    t2.setAttribute("font-family", "'Lilita One', cursive");
    t2.setAttribute("font-size", String(isCreator ? 12 : 10));
    t2.setAttribute("fill", "#fff");
    t2.textContent = c.label;
    g.appendChild(t2);
  });

  svgEl.appendChild(g);
}

const ECO: Cell[] = [
  { q: 0, r: 0, kind: "creator", type: "Fire", label: "Fire", element: "🔥" },
  { q: 1, r: 0, kind: "creator", type: "River", label: "River", element: "💧" },
  { q: 0, r: 1, kind: "creator", type: "Tree", label: "Tree", element: "🌳" },
  { q: -1, r: 1, kind: "creator", type: "Whirlwind", label: "Whirl", element: "🌪" },
  { q: 1, r: -1, kind: "animal", type: "Fire", label: "Lion", element: "🦁" },
  { q: 0, r: -1, kind: "animal", type: "Fire", label: "Snake", element: "🐍" },
  { q: -1, r: 0, kind: "animal", type: "Fire", label: "Lizard", element: "🦎" },
  { q: 2, r: 0, kind: "animal", type: "River", label: "Dolphin", element: "🐬" },
  { q: 2, r: -1, kind: "animal", type: "River", label: "Otter", element: "🦦" },
  { q: 1, r: 1, kind: "animal", type: "Tree", label: "Deer", element: "🦌" },
  { q: -2, r: 1, kind: "animal", type: "Whirlwind", label: "Eagle", element: "🦅" },
  { q: -1, r: 2, kind: "special", type: "Sun", label: "Golden", element: "✨" },
];

const OPP: Cell[] = [
  { q: 0, r: 0, kind: "creator", type: "Ocean", element: "🌊", label: "Ocean" },
  { q: 1, r: 0, kind: "creator", type: "Mountain", element: "⛰", label: "Mtn" },
  { q: 0, r: 1, kind: "creator", type: "Sun", element: "☀", label: "Sun" },
  { q: -1, r: 1, kind: "creator", type: "Sky", element: "☁", label: "Sky" },
  { q: 1, r: -1, kind: "animal", type: "Ocean", element: "🐋", label: "Whale" },
  { q: 2, r: -1, kind: "animal", type: "Ocean", element: "🐙", label: "Octo" },
  { q: 2, r: 0, kind: "animal", type: "Mountain", element: "🐐", label: "Goat" },
  { q: 1, r: 1, kind: "animal", type: "Sun", element: "🦒", label: "Giraffe" },
  { q: 0, r: 2, kind: "animal", type: "Sun", element: "🐝", label: "Bee" },
  { q: -1, r: 2, kind: "animal", type: "Sky", element: "🦋", label: "Btrfly" },
  { q: -2, r: 2, kind: "animal", type: "Sky", element: "🕊", label: "Dove" },
  { q: -2, r: 1, kind: "animal", type: "Sky", element: "🦉", label: "Owl" },
  { q: -1, r: 0, kind: "animal", type: "Mountain", element: "🦏", label: "Rhino" },
  { q: 0, r: -1, kind: "animal", type: "Ocean", element: "🐬", label: "Dolph" },
];

const HAND = [
  { type: "Lava", el: "🌋" },
  { type: "Sky", el: "☁" },
  { type: "Snow", el: "❄" },
  { type: "Lake", el: "🦢" },
  { type: "Sun", el: "🐝" },
];

const PLAYERS = [
  { name: "Sarah Lin", bio: "Curious about: weaving + ritual", types: ["Tree", "Fire", "River", "Sun"] },
  { name: "Marcus K.", bio: "Creates: ambient music, code", types: ["Ocean", "Sky", "Snow", "Whirlwind"] },
  { name: "Priya R.", bio: "Hoping to find: collaborators", types: ["Sun", "Lightning", "Mountain", "Lake"] },
  { name: "Tomás", bio: "Curious about: nervous systems", types: ["Snow", "Lake", "River", "Tree"] },
  { name: "Jules N.", bio: "Creates: ceramics + food", types: ["Soil", "Tree", "Lava", "Mountain"] },
];

const SEEN = ["Lava", "Fire", "Whirlwind", "Sun", "Lake", "Ocean", "Tree", "River", "Sky"];

type View = "landing" | "game" | "lobby" | "dashboard";

export default function Play() {
  const [view, setView] = useState<View>("game");
  const boardRef = useRef<SVGSVGElement | null>(null);
  const oppRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (view === "game") {
      if (boardRef.current) renderBoard(boardRef.current, ECO);
      if (oppRef.current) renderBoard(oppRef.current, OPP, { showEmpty: false });
    }
  }, [view]);

  return (
    <div className="thirteen-creators-mockup">
      <style>{CSS}</style>
      <nav>
        <div className="logo">13<span>CREATORS</span></div>
        <div className="tabs">
          {(["landing", "game", "lobby", "dashboard"] as View[]).map((v) => (
            <button key={v} className={`tab ${view === v ? "active" : ""}`} onClick={() => setView(v)}>
              {v === "landing" ? "Landing" : v === "game" ? "Honeycomb Game" : v === "lobby" ? "Lobby" : "Dashboard"}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
          <span className="discord-tag">◆ Discord linked</span>
        </div>
      </nav>

      {view === "landing" && (
        <section className="view active">
          <div className="container">
            <div className="hero">
              <h1>Build your <em>hue-man</em> ecosystem.</h1>
              <p>Play the B Creators card game. Meet real humans. Learn the 13 Creator Types as you play — no textbooks, no quizzes.</p>
              <div className="cta">
                <button className="btn primary" onClick={() => setView("game")}>▶  Play free →</button>
                <button className="btn ghost" onClick={() => setView("lobby")}>Find a player</button>
                <button className="btn ghost" onClick={() => setView("dashboard")}>See your dashboard</button>
              </div>
            </div>
            <div className="tiers">
              {[
                { cls: "wren", name: "Wren", price: "Player · Free", li: ["1v1 + 2–4 player games", "Light profile", "DMs + game chat", "Discord linked", "Earn points → discounts"] },
                { cls: "robin", name: "Robin", price: "Explorer · $28/mo", li: ["Discover your 4 types", "Body mapping", "Monthly Zoom", "Full projects access"] },
                { cls: "falcon", name: "Falcon", price: "Master · $88/mo", li: ["Constitution analysis", "Weekly Zoom", "Host projects", "Mentor others"] },
                { cls: "owl", name: "Owl", price: "Practitioner · $44/mo", li: ["Certification", "Train others", "Revenue share", "#owl-supervision channel"] },
              ].map((t) => (
                <div key={t.cls} className={`tier ${t.cls}`}>
                  <h3>{t.name}</h3>
                  <div className="price">{t.price}</div>
                  <ul>{t.li.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {view === "game" && (
        <section className="view active">
          <div className="container">
            <div className="turn-banner">
              <div><span className="who">Your turn</span> · vs <strong>Sarah</strong> · live match 🟢 · turn 14</div>
              <div>⭐ <strong>75</strong> points · ◆ posted to <span style={{ color: "#9ab" }}>#card-game-lobby</span></div>
            </div>
            <div className="game-wrap">
              <div>
                <div className="panel opponent-mini">
                  <h3>Sarah · 14/16</h3>
                  <svg ref={oppRef} viewBox="-220 -200 440 400" style={{ width: "100%" }} />
                </div>
                <div className="panel" style={{ marginTop: ".75rem" }}>
                  <h3>Piles</h3>
                  <div className="pile">
                    <div className="pile-card">Draw<br /><strong style={{ color: "#fff", fontSize: "1rem" }}>28</strong></div>
                    <div className="pile-card used">Used<br /><strong style={{ color: "#fff", fontSize: "1rem" }}>Fire ✦</strong></div>
                  </div>
                  <div style={{ color: "var(--muted)", fontSize: ".75rem", textAlign: "center" }}>Top of used pile = playable</div>
                </div>
              </div>
              <div className="board-stage">
                <div className="board-meta">
                  <div>
                    <div style={{ fontFamily: "'Lilita One',cursive", fontSize: "1.2rem" }}>Your ecosystem</div>
                    <div style={{ color: "var(--muted)", fontSize: ".85rem" }}>12 / 16 placed · need 1 Creator + 3 Animals</div>
                  </div>
                  <div className="progress"><div /></div>
                  <div style={{ color: "var(--sun)", fontFamily: "'Lilita One',cursive" }}>75%</div>
                </div>
                <svg ref={boardRef} className="board-svg" viewBox="-320 -300 640 600" preserveAspectRatio="xMidYMid meet" />
                <div className="actions">
                  <button className="btn primary">Place 2 cards</button>
                  <button className="btn ghost">Rearrange ecosystem</button>
                </div>
              </div>
              <div>
                <div className="panel">
                  <h3>Your hand · 5</h3>
                  <div className="hand">
                    {HAND.map((c, i) => (
                      <div key={i} className="mini-card">
                        <div className="hex" style={{ background: TYPES[c.type] }} title={c.type}>{c.el}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: ".75rem", padding: ".5rem", background: "rgba(245,163,0,.08)", borderRadius: 8, fontSize: ".78rem", color: "var(--muted)" }}>
                    <strong style={{ color: "var(--sun)" }}>Hover a card</strong> to flip it and read the fun fact about that Creator Type.
                  </div>
                </div>
                <div className="panel" style={{ marginTop: ".75rem" }}>
                  <h3>Card powers</h3>
                  <div style={{ fontSize: ".82rem", lineHeight: 1.6, color: "var(--muted)" }}>
                    <div>🔥 <strong>Disaster</strong> — play a Creator to used pile, wipe opponent's matching animals.</div>
                    <div>🛡️ <strong>Golden Hive</strong> — blocks one disaster.</div>
                    <div>🦋 <strong>Sky Creature</strong> — steal one animal from any player.</div>
                    <div>✨ <strong>Golden Body</strong> — substitutes for any animal.</div>
                    <div>☁️ <strong>Sky Creator</strong> — substitutes for any element.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {view === "lobby" && (
        <section className="view active">
          <div className="container">
            <div className="lobby">
              <div className="panel">
                <h3>Quick match</h3>
                <button className="btn primary" style={{ width: "100%" }}>Find a 1v1 opponent</button>
                <button className="btn ghost" style={{ width: "100%", marginTop: ".5rem" }}>Find 2–4 players</button>
                <button className="btn ghost" style={{ width: "100%", marginTop: ".5rem" }}>Play against bot (tutorial)</button>
                <div style={{ marginTop: "1rem", padding: ".75rem", background: "rgba(88,101,242,.1)", border: "1px solid rgba(88,101,242,.3)", borderRadius: 8, fontSize: ".85rem" }}>
                  ◆ When you create a match, the invite is posted to <strong>#card-game-lobby</strong> on Discord automatically.
                </div>
              </div>
              <div className="panel">
                <h3>Players open to play (8)</h3>
                {PLAYERS.map((p) => (
                  <div key={p.name} className="player-row">
                    <div className="avatar">{p.name[0]}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>{p.name}</div>
                      <div style={{ color: "var(--muted)", fontSize: ".8rem" }}>{p.bio}</div>
                      <div className="types-row">
                        {p.types.map((t) => <span key={t} className="type-dot" style={{ background: TYPES[t] }} />)}
                      </div>
                    </div>
                    <button className="btn sm primary">Challenge</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {view === "dashboard" && (
        <section className="view active">
          <div className="container">
            <div className="dash">
              <div className="panel">
                <h3>Points</h3>
                <div className="stat">75</div>
                <div style={{ color: "var(--muted)", fontSize: ".85rem" }}>+15 this week</div>
                <div className="unlock">
                  {[
                    ["Unlock DMs", "25 / 25 ✓", 100],
                    ["Unlock 2v2 trial", "50 / 50 ✓", 100],
                    ["Type discovery teaser", "75 / 250", 30],
                    ["25% off Robin upgrade", "75 / 50 ✓", 100],
                  ].map(([l, r, w]) => (
                    <div key={l as string}>
                      <div className="unlock-row"><span>{l}</span><span>{r}</span></div>
                      <div className="unlock-bar"><div style={{ width: `${w}%` }} /></div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="panel">
                <h3>Your types seen</h3>
                <div className="stat">9 / 13</div>
                <div style={{ color: "var(--muted)", fontSize: ".85rem", marginBottom: ".5rem" }}>You've encountered these in play:</div>
                <div>
                  {Object.keys(TYPES).map((t) => {
                    const has = SEEN.includes(t);
                    return (
                      <span key={t} className="badge" style={{
                        borderColor: has ? TYPES[t] : "rgba(255,255,255,.15)",
                        color: has ? TYPES[t] : "var(--muted)",
                        background: has ? `${TYPES[t]}22` : "rgba(255,255,255,.03)",
                      }}>{t}</span>
                    );
                  })}
                </div>
              </div>
              <div className="panel">
                <h3>Match stats</h3>
                {[["Games", "23"], ["Wins", "14"], ["Win streak", "3"], ["Perfect ecosystems", "2"], ["ELO", "1140"]].map(([k, v], i, a) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: ".4rem 0", borderBottom: i < a.length - 1 ? "1px solid var(--line)" : undefined }}>
                    <span style={{ color: "var(--muted)" }}>{k}</span><strong>{v}</strong>
                  </div>
                ))}
                <div className="unlock">
                  {["First Win", "Win Streak 3", "Perfect Ecosystem", "Met 5 Humans"].map((b) => (
                    <span key={b} className="badge">{b}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="panel" style={{ marginTop: "1rem" }}>
              <h3>Discord</h3>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <div className="avatar" style={{ background: "#5865F2" }}>D</div>
                <div style={{ flex: 1 }}>
                  <div><strong>aidan_leonard</strong> · Linked May 18, 2026</div>
                  <div style={{ color: "var(--muted)", fontSize: ".85rem" }}>Tier role: <strong style={{ color: "var(--sky)" }}>Wren</strong> · auto-syncs on subscription change</div>
                </div>
                <button className="btn ghost sm">Manage</button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

const CSS = `
.thirteen-creators-mockup{
  --bg:#0e0f1a; --bg2:#161826; --panel:#1c1f31; --panel2:#242842;
  --text:#f4f1ea; --muted:#9aa0b8; --line:rgba(255,255,255,.08);
  --accent:#f5a300; --accent2:#e85500;
  --lava:#E85500; --fire:#F07000; --whirlwind:#2D7A00;
  --snow:#00B887; --lightning:#7CC800; --sun:#F5A300;
  --lake:#00A8CC; --ocean:#1B3FB5;
  --tree:#b00000; --mountain:#F02000; --soil:#8B1717;
  --river:#00AAEE; --sky:#5BB8D4;
  font-family:'Questrial',system-ui,sans-serif;
  background:radial-gradient(1200px 800px at 20% -10%,#1f2240 0%,var(--bg) 60%);
  color:var(--text); min-height:100vh;
}
.thirteen-creators-mockup *{box-sizing:border-box}
.thirteen-creators-mockup h1,.thirteen-creators-mockup h2,.thirteen-creators-mockup h3{font-family:'Lilita One',cursive;letter-spacing:.5px;font-weight:400;margin:0}
.thirteen-creators-mockup .container{max-width:1400px;margin:0 auto;padding:1.25rem 1.5rem}
.thirteen-creators-mockup nav{display:flex;justify-content:space-between;align-items:center;padding:1rem 1.5rem;border-bottom:1px solid var(--line);background:rgba(0,0,0,.25);backdrop-filter:blur(10px);position:sticky;top:0;z-index:10}
.thirteen-creators-mockup .logo{font-family:'Lilita One',cursive;font-size:1.4rem;color:var(--accent)}
.thirteen-creators-mockup .logo span{color:var(--text)}
.thirteen-creators-mockup .tabs{display:flex;gap:.25rem;background:var(--panel);padding:.35rem;border-radius:14px;border:1px solid var(--line)}
.thirteen-creators-mockup .tab{padding:.6rem 1.1rem;border-radius:10px;cursor:pointer;color:var(--muted);font-weight:600;border:none;background:transparent;font-family:inherit;font-size:.95rem}
.thirteen-creators-mockup .tab.active{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff}

.thirteen-creators-mockup .hero{padding:4rem 1rem 2rem;text-align:center}
.thirteen-creators-mockup .hero h1{font-size:clamp(2.4rem,5vw,4rem);line-height:1.05;margin-bottom:1rem}
.thirteen-creators-mockup .hero h1 em{font-style:normal;background:linear-gradient(135deg,var(--sun),var(--lava));-webkit-background-clip:text;color:transparent}
.thirteen-creators-mockup .hero p{color:var(--muted);font-size:1.15rem;max-width:640px;margin:0 auto 1.5rem}
.thirteen-creators-mockup .cta{display:flex;gap:.75rem;justify-content:center;flex-wrap:wrap}
.thirteen-creators-mockup .btn{padding:.95rem 1.6rem;border-radius:12px;border:0;font-family:inherit;font-weight:700;cursor:pointer;font-size:1rem;transition:transform .2s,box-shadow .2s;color:var(--text)}
.thirteen-creators-mockup .btn.primary{background:linear-gradient(135deg,var(--sun),var(--lava));color:#fff}
.thirteen-creators-mockup .btn.primary:hover{transform:translateY(-2px);box-shadow:0 10px 25px rgba(232,85,0,.35)}
.thirteen-creators-mockup .btn.ghost{background:rgba(255,255,255,.06);color:var(--text);border:1px solid var(--line)}
.thirteen-creators-mockup .btn.sm{padding:.55rem .9rem;font-size:.85rem}

.thirteen-creators-mockup .tiers{display:grid;grid-template-columns:repeat(4,1fr);gap:.85rem;margin:3rem 0}
.thirteen-creators-mockup .tier{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:1.25rem;position:relative}
.thirteen-creators-mockup .tier h3{font-size:1.25rem;margin-bottom:.25rem}
.thirteen-creators-mockup .tier .price{color:var(--muted);font-size:.9rem;margin-bottom:.75rem}
.thirteen-creators-mockup .tier ul{list-style:none;font-size:.88rem;color:var(--muted);padding:0;margin:0}
.thirteen-creators-mockup .tier li{padding:.2rem 0}
.thirteen-creators-mockup .tier li::before{content:"◆ ";color:var(--accent)}
.thirteen-creators-mockup .tier.wren{border-color:rgba(91,184,212,.4)}
.thirteen-creators-mockup .tier.wren h3{color:var(--sky)}
.thirteen-creators-mockup .tier.robin h3{color:var(--fire)}
.thirteen-creators-mockup .tier.falcon h3{color:var(--lightning)}
.thirteen-creators-mockup .tier.owl h3{color:var(--ocean)}

.thirteen-creators-mockup .game-wrap{display:grid;grid-template-columns:240px 1fr 280px;gap:1rem;margin-top:1rem}
.thirteen-creators-mockup .panel{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:1rem}
.thirteen-creators-mockup .panel h3{font-size:.75rem;margin-bottom:.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;font-family:'Questrial',sans-serif;font-weight:700}
.thirteen-creators-mockup .opponent-mini svg{width:100%;height:auto;display:block}
.thirteen-creators-mockup .turn-banner{display:flex;justify-content:space-between;align-items:center;background:linear-gradient(135deg,rgba(245,163,0,.15),rgba(232,85,0,.15));border:1px solid rgba(245,163,0,.35);border-radius:12px;padding:.75rem 1rem;margin-bottom:.75rem}
.thirteen-creators-mockup .turn-banner .who{font-family:'Lilita One',cursive;color:var(--sun)}

.thirteen-creators-mockup .board-stage{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:1rem;min-height:560px;display:flex;flex-direction:column}
.thirteen-creators-mockup .board-svg{flex:1;width:100%;height:560px}
.thirteen-creators-mockup .board-meta{display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem}
.thirteen-creators-mockup .progress{flex:1;margin:0 1rem;height:8px;background:rgba(255,255,255,.08);border-radius:99px;overflow:hidden}
.thirteen-creators-mockup .progress > div{height:100%;background:linear-gradient(90deg,var(--snow),var(--sun));width:75%}

.thirteen-creators-mockup .hand{display:flex;gap:.5rem;flex-wrap:wrap;justify-content:center;margin-top:.5rem}
.thirteen-creators-mockup .mini-card{width:60px;height:69px;position:relative;cursor:pointer;transition:transform .2s}
.thirteen-creators-mockup .mini-card .hex{width:100%;height:100%;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);display:flex;align-items:center;justify-content:center;font-size:1.4rem;border:2px solid rgba(255,255,255,.2)}
.thirteen-creators-mockup .mini-card:hover{transform:translateY(-3px) scale(1.05)}
.thirteen-creators-mockup .pile{display:flex;gap:.75rem;justify-content:center;margin:.75rem 0}
.thirteen-creators-mockup .pile-card{width:80px;height:92px;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);background:linear-gradient(135deg,#2a2f4a,#1a1d33);border:2px dashed rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;font-size:.7rem;color:var(--muted);text-align:center;padding:.25rem}
.thirteen-creators-mockup .pile-card.used{background:linear-gradient(135deg,var(--soil),var(--tree))}
.thirteen-creators-mockup .actions{display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-top:1rem}

.thirteen-creators-mockup .lobby{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:1rem}
.thirteen-creators-mockup .player-row{display:flex;align-items:center;gap:.75rem;padding:.75rem;border-radius:10px;background:rgba(255,255,255,.03);margin-bottom:.5rem}
.thirteen-creators-mockup .avatar{width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,var(--ocean),var(--lake));display:flex;align-items:center;justify-content:center;font-family:'Lilita One',cursive;font-size:1.2rem;color:#fff}
.thirteen-creators-mockup .types-row{display:flex;gap:.25rem;margin-top:.25rem}
.thirteen-creators-mockup .type-dot{width:14px;height:14px;border-radius:50%;border:2px solid rgba(255,255,255,.2);display:inline-block}
.thirteen-creators-mockup .discord-tag{display:inline-flex;align-items:center;gap:.35rem;background:#5865F2;color:#fff;padding:.25rem .6rem;border-radius:6px;font-size:.75rem;font-weight:700}

.thirteen-creators-mockup .dash{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-top:1rem}
.thirteen-creators-mockup .stat{font-family:'Lilita One',cursive;font-size:2.4rem;color:var(--sun)}
.thirteen-creators-mockup .unlock{margin-top:.75rem}
.thirteen-creators-mockup .unlock-bar{height:6px;background:rgba(255,255,255,.08);border-radius:99px;overflow:hidden;margin:.35rem 0}
.thirteen-creators-mockup .unlock-bar > div{height:100%;background:linear-gradient(90deg,var(--lightning),var(--snow))}
.thirteen-creators-mockup .unlock-row{display:flex;justify-content:space-between;font-size:.85rem;color:var(--muted)}
.thirteen-creators-mockup .badge{display:inline-block;padding:.25rem .65rem;border-radius:99px;font-size:.7rem;font-weight:700;background:rgba(245,163,0,.15);color:var(--sun);border:1px solid rgba(245,163,0,.35);margin:.2rem .2rem 0 0}

@media (max-width:1100px){
  .thirteen-creators-mockup .tiers{grid-template-columns:repeat(2,1fr)}
  .thirteen-creators-mockup .game-wrap{grid-template-columns:1fr}
  .thirteen-creators-mockup .lobby,.thirteen-creators-mockup .dash{grid-template-columns:1fr}
}
`;
