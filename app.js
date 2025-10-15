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

})();