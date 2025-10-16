// Battleship core logic and UI wiring
(function(){
  const SIZE = 10;
  // Realistic ship set
  const SHIP_TYPES = [
    { name: 'Carrier', size: 5 },
    { name: 'Battleship', size: 4 },
    { name: 'Cruiser', size: 3 },
    { name: 'Submarine', size: 3 },
    { name: 'Destroyer', size: 2 },
  ];
  const SHIPS = SHIP_TYPES.map(s=>s.size);

  // --- Utilities ---
  function el(id){ return document.getElementById(id); }
  function createBoard(containerId){
    const wrap = el(containerId);
    wrap.innerHTML = '';
    const cells = [];
    for(let r=0;r<SIZE;r++){
      for(let c=0;c<SIZE;c++){
        const div = document.createElement('div');
        div.className = 'cell';
        div.dataset.r = r;
        div.dataset.c = c;
        wrap.appendChild(div);
        cells.push(div);
      }
    }
    return cells;
  }
  function coordKey(r,c){ return r+','+c; }
  function randomInt(n){ return Math.floor(Math.random()*n); }

  // --- Game State ---
  function makeEmptyState(){
    return {
      ships: [], // each ship: {cells: Set<string>, hits: Set<string>}
      occupied: new Set(),
      shots: new Set(), // places we've shot
      misses: new Set(),
      hits: new Set(),
    };
  }
  function placeShipsRandom(state){
    state.ships = [];
    state.occupied = new Set();
    for(const type of SHIP_TYPES){
      const len = type.size;
      let placed = false;
      for(let tries=0; tries<1000 && !placed; tries++){
        const horiz = Math.random() < 0.5;
        const r = randomInt(SIZE);
        const c = randomInt(SIZE);
        const cells = [];
        for(let i=0;i<len;i++){
          const rr = r + (horiz?0:i);
          const cc = c + (horiz?i:0);
          if(rr<0||rr>=SIZE||cc<0||cc>=SIZE){ cells.length = 0; break; }
          const k = coordKey(rr,cc);
          // Prevent touching (no-adjacent rule) by checking neighbors
          if(state.occupied.has(k) || hasAdjacent(state, rr, cc)){ cells.length = 0; break; }
          cells.push(k);
        }
        if(cells.length === len){
          const ship = { name: type.name, size: len, cells: new Set(cells), hits: new Set() };
          state.ships.push(ship);
          for(const k of cells) state.occupied.add(k);
          placed = true;
        }
      }
      if(!placed) throw new Error('Failed to place ships');
    }
  }
  function hasAdjacent(state, r, c){
    for(let dr=-1; dr<=1; dr++){
      for(let dc=-1; dc<=1; dc++){
        const rr=r+dr, cc=c+dc;
        if(rr<0||rr>=SIZE||cc<0||cc>=SIZE) continue;
        const k = coordKey(rr,cc);
        if(state.occupied.has(k)) return true;
      }
    }
    return false;
  }
  function receiveShot(state, r, c){
    const k = coordKey(r,c);
    if(state.shots.has(k)) return {valid:false};
    state.shots.add(k);
    if(state.occupied.has(k)){
      state.hits.add(k);
      for(const ship of state.ships){
        if(ship.cells.has(k)){
          ship.hits.add(k);
          const sunk = ship.hits.size === ship.cells.size;
          return {valid:true, hit:true, sunk};
        }
      }
      return {valid:true, hit:true, sunk:false};
    } else {
      state.misses.add(k);
      return {valid:true, hit:false, sunk:false};
    }
  }
  function allSunk(state){
    return state.ships.every(s => s.hits.size === s.cells.size);
  }

  // --- Rendering ---
  function renderOwnBoard(cells, state){
    for(const cell of cells){
      const r = +cell.dataset.r, c = +cell.dataset.c;
      const k = coordKey(r,c);
      cell.className = 'cell';
      if(state.occupied.has(k)) cell.classList.add('ship');
      if(state.hits.has(k)) cell.classList.add('hit');
      if(state.misses.has(k)) cell.classList.add('miss');
    }
  }
  function renderOppBoard(cells, myShots, myHits, myMisses, reveal=false, oppState=null){
    for(const cell of cells){
      const r = +cell.dataset.r, c = +cell.dataset.c;
      const k = coordKey(r,c);
      cell.className = 'cell';
      if(reveal && oppState && oppState.occupied.has(k)) cell.classList.add('ship');
      if(myHits.has(k)) cell.classList.add('hit');
      else if(myMisses.has(k)) cell.classList.add('miss');
    }
  }
  function updateFleetList(listEl, state){
    listEl.innerHTML = '';
    for(const ship of state.ships){
      const li = document.createElement('li');
      const sunk = ship.hits.size === ship.cells.size;
      li.textContent = `${ship.name} (${ship.size}) - ${sunk? 'Sunk' : ship.hits.size + ' hits'}`;
      listEl.appendChild(li);
    }
  }

  // Core shot resolution helper for PvP
  function applyShotOn(defState, r, c){
    const k = coordKey(r,c);
    if(defState.shots.has(k)) return { duplicate:true };
    defState.shots.add(k);
    let hit=false, sunk=null;
    for(const ship of defState.ships){
      if(ship.cells.has(k)){
        hit = true;
        ship.hits.add(k);
        if(ship.hits.size === ship.cells.size) sunk = ship.name;
        break;
      }
    }
    if(hit){ defState.hits.add(k); } else { defState.misses.add(k); }
    return { hit, sunk };
  }

  // --- AI ---
  function makeAi(){
    const memory = new Set();
    const targetQueue = [];
    function enqueueNeighbors(r,c){
      const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
      for(const [dr,dc] of dirs){
        const rr=r+dr, cc=c+dc;
        if(rr>=0&&rr<SIZE&&cc>=0&&cc<SIZE){
          const k = coordKey(rr,cc);
          if(!memory.has(k)) targetQueue.push([rr,cc]);
        }
      }
    }
    return {
      pick(){
        // If targets exist, use them first
        while(targetQueue.length){
          const [r,c] = targetQueue.shift();
          const k = coordKey(r,c);
          if(!memory.has(k)) return [r,c];
        }
        // Hunt mode: parity for efficiency
        for(let tries=0; tries<2000; tries++){
          const r=randomInt(SIZE), c=randomInt(SIZE);
          if((r+c)%2!==0) continue;
          const k = coordKey(r,c);
          if(!memory.has(k)) return [r,c];
        }
        // fallback
        for(let r=0;r<SIZE;r++){
          for(let c=0;c<SIZE;c++){
            const k = coordKey(r,c);
            if(!memory.has(k)) return [r,c];
          }
        }
        return [0,0];
      },
      mark(r,c,hit){
        memory.add(coordKey(r,c));
        if(hit) enqueueNeighbors(r,c);
      }
    };
  }

  // --- Tabs & Username ---
  const tabs = Array.from(document.querySelectorAll('.tab-btn'));
  const panels = {
    ai: document.getElementById('tab-ai'),
    host: document.getElementById('tab-host'),
    join: document.getElementById('tab-join'),
    spectate: document.getElementById('tab-spectate'),
  };
  tabs.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      tabs.forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      Object.values(panels).forEach(p=>p.classList.remove('active'));
      panels[btn.dataset.tab].classList.add('active');
    });
  });

  const usernameInput = el('usernameInput');
  const usernameStatus = el('usernameStatus');
  el('setUsernameBtn').addEventListener('click', ()=>{
    const name = usernameInput.value.trim() || `Guest-${Math.floor(Math.random()*10000)}`;
    localStorage.setItem('sinkships_username', name);
    usernameStatus.textContent = `Hi, ${name}!`;
  });
  (function initName(){
    const name = localStorage.getItem('sinkships_username');
    if(name){ usernameInput.value = name; usernameStatus.textContent = `Hi, ${name}!`; }
  })();

  // Provide default hooks for PvP wiring
  let localRole = null;
  window.SinkShipsHooks = window.SinkShipsHooks || {
    onNetworkMessage(source, obj){ console.log('Network message', source, obj); },
    onConnectedRole(role){
      localRole = role;
      // Enable basic UI status on connection
      if(role==='host'){ el('hostStatus').textContent = 'Connected!'; }
      if(role==='join'){ el('joinStatus').textContent = 'Connected!'; }
      if(role==='spectate'){ el('spectateStatus').textContent = 'Connected!'; }
    }
  };

  // --- AI Mode ---
  const aiMy = makeEmptyState();
  const aiOpp = makeEmptyState();
  const aiMyCells = createBoard('aiMyBoard');
  const aiOppCells = createBoard('aiOppBoard');
  const ai = makeAi();
  const aiRevealToggle = document.getElementById('aiRevealToggle');
  aiRevealToggle.checked = false; // hide AI ships by default
  const aiMyShipsList = document.getElementById('aiMyShipsList');
  const aiOppShipsList = document.getElementById('aiOppShipsList');
  let placementLocked = false; // keep player's placements on reset if locked and full fleet placed
  let aiTurn = 'player'; // turn state: 'player' or 'ai'
  let gameStarted = false; // prohibit further placement after starting

  function resetAIGame(){
    aiMy.shots = new Set(); aiMy.hits = new Set(); aiMy.misses = new Set();
    const fullFleetPlaced = aiMy.ships.length === SHIP_TYPES.length;
    if(!(placementLocked && fullFleetPlaced)){
      placeShipsRandom(aiMy);
    }
    aiOpp.shots = new Set(); aiOpp.hits = new Set(); aiOpp.misses = new Set();
    placeShipsRandom(aiOpp);
    aiTurn = 'player';
    renderOwnBoard(aiMyCells, aiMy);
    renderOppBoard(aiOppCells, aiOpp.shots, aiOpp.hits, aiOpp.misses, aiRevealToggle.checked, aiOpp);
    updateFleetList(aiMyShipsList, aiMy);
    updateFleetList(aiOppShipsList, aiOpp);
    // Show instruction message before starting the game
    el('aiStatus').textContent = 'Only click Start when finished placing the fleet.';
    el('aiOppBoard').classList.toggle('disabled', aiTurn !== 'player');
  }

  aiRevealToggle.addEventListener('change', ()=>{
    renderOppBoard(aiOppCells, aiOpp.shots, aiOpp.hits, aiOpp.misses, aiRevealToggle.checked, aiOpp);
  });

  resetAIGame();

  // Rotate label init moved below after variables are defined

  el('aiAutoPlaceBtn').addEventListener('click', ()=>{
    aiMy.shots = new Set(); aiMy.hits = new Set(); aiMy.misses = new Set();
    placeShipsRandom(aiMy);
    placementLocked = true; // auto placement locks by default
    renderOwnBoard(aiMyCells, aiMy);
    updateFleetList(aiMyShipsList, aiMy);
    el('aiStatus').textContent = 'Your ships auto-placed and locked. Your turn!';
    aiTurn = 'player';
    el('aiOppBoard').classList.toggle('disabled', aiTurn !== 'player');
  });
  el('aiStartBtn').addEventListener('click', ()=>{
    // After Start, prohibit any further placement edits
    resetAIGame();
    gameStarted = true;
    placing = false;
    placementLocked = true;
    // Disable all placement controls
    el('aiPlaceToggleBtn').disabled = true;
    el('aiRotateBtn').disabled = true;
    el('aiClearPlacementBtn').disabled = true;
    el('aiLockPlacementBtn').disabled = true;
    el('aiAutoPlaceBtn').disabled = true;
    // Inform player
    el('aiStatus').textContent = 'Game started. Fleet placement is now disabled.';
  });

  aiOppCells.forEach(cell=>{
    cell.addEventListener('click', ()=>{
      if(aiTurn !== 'player') { el('aiStatus').textContent = "Wait… AI's turn"; return; }
      const r=+cell.dataset.r, c=+cell.dataset.c;
      const res = receiveShot(aiOpp, r, c);
      if(!res.valid) return;
      renderOppBoard(aiOppCells, aiOpp.shots, aiOpp.hits, aiOpp.misses, aiRevealToggle.checked, aiOpp);
      updateFleetList(aiOppShipsList, aiOpp);
      if(allSunk(aiOpp)){ el('aiStatus').textContent = 'You win!'; el('aiOppBoard').classList.toggle('disabled', true); return; }
      // Switch to AI turn with a small delay
      aiTurn = 'ai';
      el('aiOppBoard').classList.toggle('disabled', true);
      el('aiStatus').textContent = "AI's turn…";
      setTimeout(()=>{
        const [ar,ac] = ai.pick();
        const aiRes = receiveShot(aiMy, ar, ac);
        ai.mark(ar,ac, !!aiRes.hit);
        renderOwnBoard(aiMyCells, aiMy);
        updateFleetList(aiMyShipsList, aiMy);
        if(allSunk(aiMy)){ el('aiStatus').textContent = 'AI wins!'; return; }
        // Back to player turn
        aiTurn = 'player';
        el('aiOppBoard').classList.toggle('disabled', false);
        el('aiStatus').textContent = 'Your turn!';
      }, 2000);
    });
  });

// --- Manual placement ---
let placing = false;
let horizontal = true; // rotation state
const placeToggleBtn = document.getElementById('aiPlaceToggleBtn');
const rotateBtn = document.getElementById('aiRotateBtn');
const clearBtn = document.getElementById('aiClearPlacementBtn');
const lockBtn = document.getElementById('aiLockPlacementBtn');
let nextShipIdx = 0; // index into SHIP_TYPES
// placementLocked declared earlier near AI setup

// Initialize rotate button text after element and state are defined
if (rotateBtn) {
  rotateBtn.textContent = `Rotate (${horizontal ? 'Horizontal' : 'Vertical'})`;
}
function canPlace(state, r, c, len, horiz){
  const cells = [];
  for(let i=0;i<len;i++){
    const rr = r + (horiz?0:i);
    const cc = c + (horiz?i:0);
    if(rr<0||rr>=SIZE||cc<0||cc>=SIZE) return null;
    const k = coordKey(rr,cc);
    // Allow ships to touch during manual placement; only prevent overlap
    if(state.occupied.has(k)) return null;
    cells.push(k);
  }
  return cells;
}

function placeManual(state, r, c){
  if(nextShipIdx >= SHIP_TYPES.length) return false;
  const len = SHIP_TYPES[nextShipIdx].size;
  const cells = canPlace(state, r, c, len, horizontal);
  if(!cells) return false;
  const ship = { name: SHIP_TYPES[nextShipIdx].name, size: len, cells: new Set(cells), hits: new Set() };
  state.ships.push(ship);
  for(const k of cells) state.occupied.add(k);
  nextShipIdx++;
  return true;
}

placeToggleBtn.addEventListener('click', ()=>{
  if (gameStarted) { el('aiStatus').textContent = 'Placement is disabled after starting the game.'; return; }
  placing = !placing;
  placeToggleBtn.textContent = placing ? 'Placing...' : 'Manual placement';
  el('aiStatus').textContent = placing ? `Place ${SHIP_TYPES[nextShipIdx]?.name || 'all ships placed'}` : 'Placement off';
  if (placing) placementLocked = false; // entering placement unlocks
});
rotateBtn.addEventListener('click', ()=>{
  if (gameStarted) { el('aiStatus').textContent = 'Placement is disabled after starting the game.'; return; }
  horizontal = !horizontal;
  rotateBtn.textContent = `Rotate (${horizontal ? 'Horizontal' : 'Vertical'})`;
});
clearBtn.addEventListener('click', ()=>{
  if (gameStarted) { el('aiStatus').textContent = 'Placement is disabled after starting the game.'; return; }
  // reset player board placement
  aiMy.ships = [];
  aiMy.occupied = new Set();
  aiMy.shots = new Set(); aiMy.hits = new Set(); aiMy.misses = new Set();
  nextShipIdx = 0;
  placementLocked = false;
  renderOwnBoard(aiMyCells, aiMy);
  updateFleetList(aiMyShipsList, aiMy);
});
lockBtn.addEventListener('click', ()=>{
  if (gameStarted) { el('aiStatus').textContent = 'Placement is disabled after starting the game.'; return; }
  placing = false;
  placementLocked = true;
  placeToggleBtn.textContent = 'Manual placement';
  el('aiStatus').textContent = 'Placement locked. Start firing!';
});

aiMyCells.forEach(cell=>{
  cell.addEventListener('click', ()=>{
    if (gameStarted) { return; }
    if(!placing) return;
    const r=+cell.dataset.r, c=+cell.dataset.c;
    if(placeManual(aiMy, r, c)){
      renderOwnBoard(aiMyCells, aiMy);
      updateFleetList(aiMyShipsList, aiMy);
      el('aiStatus').textContent = nextShipIdx < SHIP_TYPES.length ? `Place ${SHIP_TYPES[nextShipIdx].name}` : 'All ships placed. Lock placement to start!';
    }
  });
});

  // --- Host Mode (basic setup to make UI usable) ---
  const hostMy = makeEmptyState();
  const hostOpp = makeEmptyState();
  const hostMyCells = createBoard('hostMyBoard');
  const hostOppCells = createBoard('hostOppBoard');
  // Ensure opponent board renders initially
  renderOppBoard(hostOppCells, hostOpp.shots, hostOpp.hits, hostOpp.misses, false);
  // Allow host to fire on opponent when it's host's turn
  hostOppCells.forEach(cell=>{
    cell.addEventListener('click', ()=>{
      if(!hostGameStarted || pvpTurn !== 'host') return;
      const r=+cell.dataset.r, c=+cell.dataset.c;
      const k = coordKey(r,c);
      if(hostOpp.shots.has(k)) return; // don't allow duplicate shots
      hostOpp.shots.add(k);
      renderOppBoard(hostOppCells, hostOpp.shots, hostOpp.hits, hostOpp.misses, false);
      window.SinkShipsNet?.sendToOpponent({ type:'shot', from:'host', r, c });
    });
  });
  const hostStatus = document.getElementById('hostStatus');
  let hostPlacing = false; let hostHorizontal = true; let hostNextShipIdx = 0; let hostPlacementLocked = false; let hostGameStarted = false; let pvpTurn = null; // 'host' or 'join'
let hostReady = false; let joinReady = false;
  const hostPlaceToggleBtn = document.getElementById('hostPlaceToggleBtn');
  const hostRotateBtn = document.getElementById('hostRotateBtn');
  const hostClearBtn = document.getElementById('hostClearPlacementBtn');
  const hostLockBtn = document.getElementById('hostLockPlacementBtn');
  // Host: update fleet lists during placement and when rendering
  const hostMyShipsList = document.getElementById('hostMyShipsList');
  const hostOppShipsList = document.getElementById('hostOppShipsList');
  function renderHost(){ renderOwnBoard(hostMyCells, hostMy); if(hostMyShipsList) updateFleetList(hostMyShipsList, hostMy); }
  // After opponent result updates: ensure opponent list reflects hits
  function renderHost(){ renderOwnBoard(hostMyCells, hostMy); if(hostMyShipsList) updateFleetList(hostMyShipsList, hostMy); }
  // Initialize host rotate button text
  if(hostRotateBtn) hostRotateBtn.textContent = `Rotate (${hostHorizontal ? 'Horizontal' : 'Vertical'})`;
  function hostPlaceManual(r,c){
    if(hostNextShipIdx >= SHIP_TYPES.length) return false;
    const len = SHIP_TYPES[hostNextShipIdx].size;
    const cells = canPlace(hostMy, r, c, len, hostHorizontal);
    if(!cells) return false;
    const ship = { name: SHIP_TYPES[hostNextShipIdx].name, size: len, cells: new Set(cells), hits: new Set() };
    hostMy.ships.push(ship);
    for(const k of cells) hostMy.occupied.add(k);
    hostNextShipIdx++;
    return true;
  }
  hostPlaceToggleBtn?.addEventListener('click', ()=>{
    if(hostGameStarted){ hostStatus.textContent = 'Placement disabled after start'; return; }
    hostPlacing = !hostPlacing;
    hostPlaceToggleBtn.textContent = hostPlacing ? 'Placing...' : 'Manual placement';
    hostStatus.textContent = hostPlacing ? `Place ${SHIP_TYPES[hostNextShipIdx]?.name || 'all ships placed'}` : 'Placement off';
    if(hostPlacing) hostPlacementLocked = false;
  });
  hostRotateBtn?.addEventListener('click', ()=>{
    if(hostGameStarted){ hostStatus.textContent = 'Placement disabled after start'; return; }
    hostHorizontal = !hostHorizontal;
    hostRotateBtn.textContent = `Rotate (${hostHorizontal ? 'Horizontal' : 'Vertical'})`;
  });
  hostClearBtn?.addEventListener('click', ()=>{
    if(hostGameStarted){ hostStatus.textContent = 'Placement disabled after start'; return; }
    hostMy.ships = []; hostMy.occupied = new Set(); hostMy.shots = new Set(); hostMy.hits = new Set(); hostMy.misses = new Set();
    hostNextShipIdx = 0; hostPlacementLocked = false; renderHost();
  });
  hostLockBtn?.addEventListener('click', ()=>{
    if(hostGameStarted){ hostStatus.textContent = 'Placement disabled after start'; return; }
    hostPlacing = false; hostPlacementLocked = true; hostPlaceToggleBtn.textContent = 'Manual placement'; hostStatus.textContent = 'Placement locked.';
  });
  hostMyCells.forEach(cell=> cell.addEventListener('click', ()=>{
    if(hostGameStarted) return; if(!hostPlacing) return;
    const r=+cell.dataset.r, c=+cell.dataset.c;
    if(hostPlaceManual(r,c)){ renderHost(); hostStatus.textContent = hostNextShipIdx < SHIP_TYPES.length ? `Place ${SHIP_TYPES[hostNextShipIdx].name}` : 'All ships placed. Lock placement!'; }
  }));
  document.getElementById('hostAutoPlaceBtn').addEventListener('click', ()=>{
    if(hostGameStarted){ hostStatus.textContent = 'Placement disabled after start'; return; }
    placeShipsRandom(hostMy); hostPlacementLocked = true; renderHost(); hostStatus.textContent = 'Ships auto-placed and locked. Share your Offer Code.';
  });
  document.getElementById('hostStartBtn').addEventListener('click', ()=>{
    const full = hostMy.ships.length === SHIP_TYPES.length;
    if(!full){ hostStatus.textContent = 'Place full fleet first (or Auto place).'; return; }
    hostPlacing = false; hostPlacementLocked = true; hostGameStarted = true;
    hostPlaceToggleBtn.disabled = true; hostRotateBtn.disabled = true; hostClearBtn.disabled = true; hostLockBtn.disabled = true; document.getElementById('hostAutoPlaceBtn').disabled = true;
    hostReady = true;
    hostStatus.textContent = 'Ready. Waiting for joiner…';
    window.SinkShipsNet?.sendToOpponent({ type:'ready', who:'host' });
    if(hostReady && joinReady){
      hostGameStarted = true; joinGameStarted = true; pvpTurn = 'host';
      hostStatus.textContent = 'Game started. Your turn!';
      document.getElementById('joinStatus').textContent = 'Game started. Host goes first.';
      hideOverlay();
    }
  });

  // --- Join Mode (basic setup) ---
  const joinMy = makeEmptyState();
  const joinOpp = makeEmptyState();
  const joinMyCells = createBoard('joinMyBoard');
  const joinOppCells = createBoard('joinOppBoard');
  // Ensure opponent board renders initially
  renderOppBoard(joinOppCells, joinOpp.shots, joinOpp.hits, joinOpp.misses, false);
  // Allow joiner to fire on opponent when it's join's turn
  joinOppCells.forEach(cell=>{
    cell.addEventListener('click', ()=>{
      if(!joinGameStarted || pvpTurn !== 'join') return;
      const r=+cell.dataset.r, c=+cell.dataset.c;
      const k = coordKey(r,c);
      if(joinOpp.shots.has(k)) return; // don't allow duplicate shots
      joinOpp.shots.add(k);
      renderOppBoard(joinOppCells, joinOpp.shots, joinOpp.hits, joinOpp.misses, false);
      window.SinkShipsNet?.sendToOpponent({ type:'shot', from:'join', r, c });
    });
  });
  const joinStatus = document.getElementById('joinStatus');
  let joinPlacing = false; let joinHorizontal = true; let joinNextShipIdx = 0; let joinPlacementLocked = false; let joinGameStarted = false;
  const joinPlaceToggleBtn = document.getElementById('joinPlaceToggleBtn');
  const joinRotateBtn = document.getElementById('joinRotateBtn');
  const joinClearBtn = document.getElementById('joinClearPlacementBtn');
  const joinLockBtn = document.getElementById('joinLockPlacementBtn');
  function renderJoin(){ renderOwnBoard(joinMyCells, joinMy); if(joinMyShipsList) updateFleetList(joinMyShipsList, joinMy); }
  // Initialize join rotate button text
  if(joinRotateBtn) joinRotateBtn.textContent = `Rotate (${joinHorizontal ? 'Horizontal' : 'Vertical'})`;
  function joinPlaceManual(r,c){
    if(joinNextShipIdx >= SHIP_TYPES.length) return false;
    const len = SHIP_TYPES[joinNextShipIdx].size;
    const cells = canPlace(joinMy, r, c, len, joinHorizontal);
    if(!cells) return false;
    const ship = { name: SHIP_TYPES[joinNextShipIdx].name, size: len, cells: new Set(cells), hits: new Set() };
    joinMy.ships.push(ship);
    for(const k of cells) joinMy.occupied.add(k);
    joinNextShipIdx++;
    return true;
  }
  joinPlaceToggleBtn?.addEventListener('click', ()=>{
    if(joinGameStarted){ joinStatus.textContent = 'Placement disabled after start'; return; }
    joinPlacing = !joinPlacing;
    joinPlaceToggleBtn.textContent = joinPlacing ? 'Placing...' : 'Manual placement';
    joinStatus.textContent = joinPlacing ? `Place ${SHIP_TYPES[joinNextShipIdx]?.name || 'all ships placed'}` : 'Placement off';
    if(joinPlacing) joinPlacementLocked = false;
  });
  joinRotateBtn?.addEventListener('click', ()=>{
    if(joinGameStarted){ joinStatus.textContent = 'Placement disabled after start'; return; }
    joinHorizontal = !joinHorizontal;
    joinRotateBtn.textContent = `Rotate (${joinHorizontal ? 'Horizontal' : 'Vertical'})`;
  });
  joinClearBtn?.addEventListener('click', ()=>{
    if(joinGameStarted){ joinStatus.textContent = 'Placement disabled after start'; return; }
    joinMy.ships = []; joinMy.occupied = new Set(); joinMy.shots = new Set(); joinMy.hits = new Set(); joinMy.misses = new Set();
    joinNextShipIdx = 0; joinPlacementLocked = false; renderJoin();
  });
  joinLockBtn?.addEventListener('click', ()=>{
    if(joinGameStarted){ joinStatus.textContent = 'Placement disabled after start'; return; }
    joinPlacing = false; joinPlacementLocked = true; joinPlaceToggleBtn.textContent = 'Manual placement'; joinStatus.textContent = 'Placement locked.';
  });
  joinMyCells.forEach(cell=> cell.addEventListener('click', ()=>{
    if(joinGameStarted) return; if(!joinPlacing) return;
    const r=+cell.dataset.r, c=+cell.dataset.c;
    if(joinPlaceManual(r,c)){ renderJoin(); joinStatus.textContent = joinNextShipIdx < SHIP_TYPES.length ? `Place ${SHIP_TYPES[joinNextShipIdx].name}` : 'All ships placed. Lock placement!'; }
  }));
  document.getElementById('joinAutoPlaceBtn').addEventListener('click', ()=>{
    if(joinGameStarted){ joinStatus.textContent = 'Placement disabled after start'; return; }
    placeShipsRandom(joinMy); joinPlacementLocked = true; renderJoin(); joinStatus.textContent = 'Ships auto-placed and locked. Create Answer to connect.';
  });
  document.getElementById('joinStartBtn').addEventListener('click', ()=>{
    const full = joinMy.ships.length === SHIP_TYPES.length;
    if(!full){ joinStatus.textContent = 'Place full fleet first (or Auto place).'; return; }
    joinPlacing = false; joinPlacementLocked = true; joinGameStarted = true;
    joinPlaceToggleBtn.disabled = true; joinRotateBtn.disabled = true; joinClearBtn.disabled = true; joinLockBtn.disabled = true; document.getElementById('joinAutoPlaceBtn').disabled = true;
    joinReady = true;
    joinStatus.textContent = 'Ready. Waiting for host…';
    window.SinkShipsNet?.sendToOpponent({ type:'ready', who:'join' });
    if(hostReady && joinReady){
      hostGameStarted = true; joinGameStarted = true; pvpTurn = 'host';
      document.getElementById('hostStatus').textContent = 'Game started. Your turn!';
      joinStatus.textContent = 'Game started. Host goes first.';
      showOverlay("Host's turn");
    }
  });

  // --- Spectate Boards (visual only) ---
  const spectateHostCells = createBoard('spectateHostBoard');
  const spectateOppCells = createBoard('spectateOppBoard');

  // Local spectate states to mark hits/misses live
  const spectateHost = makeEmptyState();
  const spectateOpp = makeEmptyState();
  renderOwnBoard(spectateHostCells, spectateHost);
  renderOwnBoard(spectateOppCells, spectateOpp);

  // PvP simple turn & overlay messaging hooks
  const overlay = document.createElement('div');
  overlay.id = 'overlay';
  overlay.style.position = 'fixed'; overlay.style.inset = '0'; overlay.style.display = 'none'; overlay.style.background = 'rgba(0,0,0,0.6)'; overlay.style.color = '#fff'; overlay.style.fontSize = '28px'; overlay.style.fontWeight = '700'; overlay.style.justifyContent = 'center'; overlay.style.alignItems = 'center'; overlay.style.zIndex = '999'; overlay.style.backdropFilter = 'blur(2px)';
  overlay.style.textShadow = '0 1px 2px rgba(0,0,0,0.6)'; overlay.style.letterSpacing = '0.5px'; overlay.textContent = '';
  document.body.appendChild(overlay);

  function showOverlay(msg){ overlay.textContent = msg; overlay.style.display = 'flex'; }
  function hideOverlay(){ overlay.style.display = 'none'; }

  window.SinkShipsHooks.onNetworkMessage = function(source, obj){
    if(obj?.type === 'ready'){
      if(obj.who === 'host'){ hostReady = true; if(localRole==='join'){ joinStatus.textContent = 'Host is ready. Finish placement and click Start.'; } }
      if(obj.who === 'join'){ joinReady = true; if(localRole==='host'){ hostStatus.textContent = 'Joiner is ready. Finish placement and click Start.'; } }
      if(hostReady && joinReady){
        hostGameStarted = true; joinGameStarted = true; pvpTurn = 'host';
        if(localRole==='host'){ 
          hostStatus.textContent = 'Game started. Your turn!'; 
          hideOverlay();
          // Share ship positions with spectators
          window.SinkShipsNet?.sendToSpectators({ type:'ships', who:'host', ships: Array.from(hostMy.ships).map(s => ({name: s.name, size: s.size, cells: Array.from(s.cells)})) });
        }
        if(localRole==='join'){ 
          joinStatus.textContent = 'Game started. Host goes first.'; 
          showOverlay("Host's turn");
          // Share ship positions with spectators
          window.SinkShipsNet?.sendToSpectators({ type:'ships', who:'join', ships: Array.from(joinMy.ships).map(s => ({name: s.name, size: s.size, cells: Array.from(s.cells)})) });
        }
      }
      return;
    }
    // Handle shot requests sent by opponent
    if(obj?.type === 'shot'){
      if(localRole === 'join' && obj.from === 'host'){
        const res = applyShotOn(joinMy, obj.r, obj.c);
        renderJoin();
        // Send result back to host
        window.SinkShipsNet?.sendToOpponent({ type:'result', from:'join', r:obj.r, c:obj.c, hit:res.hit, sunk:res.sunk || null });
        // Toggle turn to host
        pvpTurn = 'host'; broadcastTurn('host');
      } else if(localRole === 'host' && obj.from === 'join'){
        const res = applyShotOn(hostMy, obj.r, obj.c);
        renderHost();
        window.SinkShipsNet?.sendToOpponent({ type:'result', from:'host', r:obj.r, c:obj.c, hit:res.hit, sunk:res.sunk || null });
        pvpTurn = 'join'; broadcastTurn('join');
      }
      return;
    }
    // Handle shot results to update attacker view and spectators
    if(obj?.type === 'result'){
      const k = coordKey(obj.r, obj.c);
      if(localRole === 'host' && obj.from === 'join'){
        if(obj.hit){ hostOpp.hits.add(k); } else { hostOpp.misses.add(k); }
        renderOppBoard(hostOppCells, hostOpp.shots, hostOpp.hits, hostOpp.misses, false);
        // Check victory
        if(allSunk(hostOpp)){
          window.SinkShipsNet?.sendToOpponent({ type:'win', who:'join' });
          window.SinkShipsNet?.sendToSpectators({ type:'win', who:'join' });
          showOverlay('Joiner wins!');
        }
      } else if(localRole === 'join' && obj.from === 'host'){
        if(obj.hit){ joinOpp.hits.add(k); } else { joinOpp.misses.add(k); }
        renderOppBoard(joinOppCells, joinOpp.shots, joinOpp.hits, joinOpp.misses, false);
        // Check victory
        if(allSunk(joinOpp)){
          window.SinkShipsNet?.sendToOpponent({ type:'win', who:'host' });
          window.SinkShipsNet?.sendToSpectators({ type:'win', who:'host' });
          showOverlay('Host wins!');
        }
      } else if(localRole === 'spectate'){
        // Update both spectate boards
        if(obj.from === 'host'){
          if(obj.hit){ spectateOpp.hits.add(k); } else { spectateOpp.misses.add(k); }
          spectateOpp.shots.add(k);
          renderOwnBoard(spectateOppCells, spectateOpp);
        } else if(obj.from === 'join'){
          if(obj.hit){ spectateHost.hits.add(k); } else { spectateHost.misses.add(k); }
          spectateHost.shots.add(k);
          renderOwnBoard(spectateHostCells, spectateHost);
        }
      }
      return;
    }
    // Handle ship positions for spectators
    if(obj?.type === 'ships' && localRole === 'spectate'){
      if(obj.who === 'host'){
        // Reconstruct host ships for spectator view
        spectateHost.ships = obj.ships.map(s => ({
          name: s.name,
          size: s.size,
          cells: new Set(s.cells),
          hits: new Set()
        }));
        spectateHost.occupied = new Set();
        for(const ship of spectateHost.ships){
          for(const cell of ship.cells){
            spectateHost.occupied.add(cell);
          }
        }
        renderOwnBoard(spectateHostCells, spectateHost);
      } else if(obj.who === 'join'){
        // Reconstruct join ships for spectator view
        spectateOpp.ships = obj.ships.map(s => ({
          name: s.name,
          size: s.size,
          cells: new Set(s.cells),
          hits: new Set()
        }));
        spectateOpp.occupied = new Set();
        for(const ship of spectateOpp.ships){
          for(const cell of ship.cells){
            spectateOpp.occupied.add(cell);
          }
        }
        renderOwnBoard(spectateOppCells, spectateOpp);
      }
      return;
    }
    if(obj?.type === 'turn'){
      pvpTurn = obj.who;
      // Show overlay when it's not your turn; hide when it is
      if(localRole === pvpTurn){ hideOverlay(); } else { showOverlay(pvpTurn === 'host' ? "Host's turn" : "Joiner's turn"); }
      return;
    }
    if(obj?.type === 'win'){
      showOverlay(obj.who === 'host' ? 'Host wins!' : 'Joiner wins!');
      // Provide a refresh button to end session
      const btn = document.createElement('button');
      btn.textContent = 'Refresh to end session';
      btn.style.marginTop = '16px';
      btn.style.padding = '8px 12px';
      btn.style.borderRadius = '8px';
      btn.style.background = 'white';
      btn.style.color = '#111827';
      btn.style.fontWeight = '700';
      btn.addEventListener('click', ()=> location.reload());
      overlay.appendChild(btn);
      return;
    }
  };

  // Local helper to broadcast turn change (placeholder wiring)
  function broadcastTurn(who){ window.SinkShipsNet?.sendToOpponent({ type:'turn', who }); }

})();