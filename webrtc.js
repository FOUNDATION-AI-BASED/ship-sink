// Minimal WebRTC data channel helper for copy/paste signaling
(function(){
  const RTC_CONF = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ]
  };

  function encode(obj){ return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))); }
  function decode(str){ try { return JSON.parse(decodeURIComponent(escape(atob(str)))); } catch(e){ return null; } }

  // --- Host: player channel ---
  let hostPC = null; let hostDC = null;
  let hostSpectatePCs = []; // list of RTCPeerConnections for spectators

  function waitForIceGatheringComplete(pc){
    if(pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise(resolve => {
      const check = ()=>{ if(pc.iceGatheringState === 'complete'){ pc.removeEventListener('icegatheringstatechange', check); resolve(); } };
      pc.addEventListener('icegatheringstatechange', check);
      setTimeout(()=>{ pc.removeEventListener('icegatheringstatechange', check); resolve(); }, 2000);
    });
  }

  async function hostCreateOffer(){
    hostPC = new RTCPeerConnection(RTC_CONF);
    hostDC = hostPC.createDataChannel('game');
    hostDC.onopen = ()=> { console.log('Host DC open'); window.SinkShipsHooks?.onConnectedRole?.('host'); };
    hostDC.onmessage = onHostMessage;
    hostPC.onicecandidate = e => {
      if(!e.candidate){ // gathering done
        const offer = hostPC.localDescription;
        document.getElementById('hostOfferOut').value = encode({sdp: offer.sdp, type: offer.type});
      }
    };
    const offer = await hostPC.createOffer();
    await hostPC.setLocalDescription(offer);
    await waitForIceGatheringComplete(hostPC);
    const finalOffer = hostPC.localDescription;
    document.getElementById('hostOfferOut').value = encode({sdp: finalOffer.sdp, type: finalOffer.type});
  }

  async function hostAcceptAnswer(){
    const input = document.getElementById('hostAnswerIn').value.trim();
    const obj = decode(input);
    if(!obj){ alert('Invalid Answer Code'); return; }
    const desc = new RTCSessionDescription(obj);
    await hostPC.setRemoteDescription(desc);
    document.getElementById('hostStatus').textContent = 'Connected to opponent!';
  }

  // --- Host: spectate channels ---
  async function hostCreateSpectateOffer(){
    const pc = new RTCPeerConnection(RTC_CONF);
    const dc = pc.createDataChannel('spectate');
    dc.onopen = ()=> console.log('Spectator DC open');
    dc.onmessage = e => console.log('Spectator msg:', e.data);
    pc.onicecandidate = e => {
      if(!e.candidate){
        const offer = pc.localDescription;
        document.getElementById('hostSpectateOfferOut').value = encode({sdp: offer.sdp, type: offer.type});
      }
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGatheringComplete(pc);
    const finalOffer = pc.localDescription;
    document.getElementById('hostSpectateOfferOut').value = encode({sdp: finalOffer.sdp, type: finalOffer.type});
    hostSpectatePCs.push({pc, dc});
  }

  async function hostAcceptSpectator(){
    const input = document.getElementById('hostSpectateAnswerIn').value.trim();
    const obj = decode(input);
    if(!obj){ alert('Invalid Answer Code'); return; }
    const last = hostSpectatePCs[hostSpectatePCs.length-1];
    if(!last){ alert('Create spectate offer first'); return; }
    await last.pc.setRemoteDescription(new RTCSessionDescription(obj));
    const li = document.createElement('li');
    li.textContent = 'Spectator connected';
    document.getElementById('spectatorsList').appendChild(li);
  }

  // --- Host: unified offer (one code for player and spectators) ---
  async function hostCreateUnifiedOffer(){
    // Player PC/DC
    hostPC = new RTCPeerConnection(RTC_CONF);
    hostDC = hostPC.createDataChannel('game');
    hostDC.onopen = ()=> { console.log('Host DC open'); window.SinkShipsHooks?.onConnectedRole?.('host'); };
    hostDC.onmessage = onHostMessage;
    const offerP = await hostPC.createOffer();
    await hostPC.setLocalDescription(offerP);
  
    // Spectator PC/DC
    const spc = new RTCPeerConnection(RTC_CONF);
    const sdc = spc.createDataChannel('spectate');
    sdc.onopen = ()=> console.log('Spectator DC open');
    sdc.onmessage = onSpectateMessage;
    const offerS = await spc.createOffer();
    await spc.setLocalDescription(offerS);
  
    await Promise.all([waitForIceGatheringComplete(hostPC), waitForIceGatheringComplete(spc)]);
    const playerDescLocal = hostPC.localDescription;
    const spectateDescLocal = spc.localDescription;
    document.getElementById('hostOfferOut').value = encode({ player: { sdp: playerDescLocal.sdp, type: playerDescLocal.type }, spectate: { sdp: spectateDescLocal.sdp, type: spectateDescLocal.type } });
    document.getElementById('hostStatus').textContent = 'One code created. Share with players or spectators.';
    hostSpectatePCs.push({pc: spc, dc: sdc});
  }

  // --- Wire UI buttons ---
  document.getElementById('hostCreateOfferBtn').addEventListener('click', hostCreateOffer);
  document.getElementById('hostAcceptAnswerBtn').addEventListener('click', hostAcceptAnswer);
  document.getElementById('hostCreateSpectateOfferBtn').addEventListener('click', hostCreateSpectateOffer);
  document.getElementById('hostSpectateAcceptBtn').addEventListener('click', hostAcceptSpectator);
  document.getElementById('joinCreateAnswerBtn').addEventListener('click', joinCreateAnswer);
  document.getElementById('spectateCreateAnswerBtn').addEventListener('click', spectateCreateAnswer);

  // --- Join: player ---
  let joinPC = null; let joinDC = null;
  async function joinCreateAnswer(){
    joinPC = new RTCPeerConnection(RTC_CONF);
    joinPC.ondatachannel = e => {
      joinDC = e.channel;
      joinDC.onopen = ()=> { console.log('Join DC open'); window.SinkShipsHooks?.onConnectedRole?.('join'); };
      joinDC.onmessage = onJoinMessage;
    };
    const input = document.getElementById('joinOfferIn').value.trim();
    const obj = decode(input);
    if(!obj){ alert('Invalid Offer Code'); return; }
    const descObj = obj.player ? obj.player : obj; // support unified code
    await joinPC.setRemoteDescription(new RTCSessionDescription(descObj));
    const answer = await joinPC.createAnswer();
    await joinPC.setLocalDescription(answer);
    await waitForIceGatheringComplete(joinPC);
    const finalAnswer = joinPC.localDescription;
    document.getElementById('joinAnswerOut').value = encode({sdp: finalAnswer.sdp, type: finalAnswer.type});
    document.getElementById('joinStatus').textContent = 'Answer created. Send to host.';
  }

  // --- Spectate: viewer ---
  let spectatePC = null; let spectateDC = null;
  async function spectateCreateAnswer(){
    spectatePC = new RTCPeerConnection(RTC_CONF);
    spectatePC.ondatachannel = e => {
      spectateDC = e.channel;
      spectateDC.onopen = ()=> { console.log('Spectate DC open'); window.SinkShipsHooks?.onConnectedRole?.('spectate'); };
      spectateDC.onmessage = onSpectateMessage;
    };
    const input = document.getElementById('spectateOfferIn').value.trim();
    const obj = decode(input);
    if(!obj){ alert('Invalid Spectate Offer Code'); return; }
    const descObj = obj.spectate ? obj.spectate : obj; // support unified code
    await spectatePC.setRemoteDescription(new RTCSessionDescription(descObj));
    const answer = await spectatePC.createAnswer();
    await spectatePC.setLocalDescription(answer);
    await waitForIceGatheringComplete(spectatePC);
    const finalAnswer = spectatePC.localDescription;
    document.getElementById('spectateAnswerOut').value = encode({sdp: finalAnswer.sdp, type: finalAnswer.type});
    document.getElementById('spectateStatus').textContent = 'Spectate answer created. Send to host.';
  }

  // --- Messaging protocol ---
  function safeSend(dc, obj){
    if(!dc || dc.readyState !== 'open') return;
    dc.send(JSON.stringify(obj));
  }
  function onHostMessage(ev){ handleMessage('join', ev.data); }
  function onJoinMessage(ev){ handleMessage('host', ev.data); }
  function onSpectateMessage(ev){ handleMessage('spectate', ev.data); }

  function broadcastSpectators(msg){
    for(const {dc} of hostSpectatePCs){ safeSend(dc, msg); }
  }

  // You should integrate with game state from app.js via window.SinkShipsNet
  const Net = {
    sendToOpponent(msg){
      // Send to peer
      safeSend(hostDC||joinDC, msg);
      // Also broadcast to any connected spectators (effective on host side)
      broadcastSpectators(msg);
    },
    broadcastToSpectators(msg){ broadcastSpectators(msg); },
    // Alias for compatibility with app.js
    sendToSpectators(msg){ broadcastSpectators(msg); },
    setStatus(where, text){ document.getElementById(where).textContent = text; }
  };
  window.SinkShipsNet = Net;

  function appendChat(logId, who, text){
    const ul = document.getElementById(logId);
    if(!ul) return;
    const li = document.createElement('li');
    li.textContent = `${who}: ${text}`;
    ul.appendChild(li);
  }
  function getUsername(){
    const v = document.getElementById('usernameInput')?.value?.trim();
    return v || 'Anonymous';
  }

  // --- Wire UI buttons ---
  document.getElementById('hostCreateOfferBtn').addEventListener('click', hostCreateOffer);
  document.getElementById('hostAcceptAnswerBtn').addEventListener('click', hostAcceptAnswer);
  document.getElementById('hostCreateSpectateOfferBtn').addEventListener('click', hostCreateSpectateOffer);
  document.getElementById('hostSpectateAcceptBtn').addEventListener('click', hostAcceptSpectator);
  document.getElementById('joinCreateAnswerBtn').addEventListener('click', joinCreateAnswer);
  document.getElementById('spectateCreateAnswerBtn').addEventListener('click', spectateCreateAnswer);

  // --- Chat wiring ---
  document.getElementById('hostChatSendBtn').addEventListener('click', ()=>{
    const input = document.getElementById('hostChatInput');
    const text = input.value.trim(); if(!text) return;
    const name = getUsername();
    appendChat('hostChatLog', name, text);
    safeSend(hostDC||joinDC, { type:'chat', from:'host', name, text });
    broadcastSpectators({ type:'chat', from:'host', name, text });
    input.value = '';
  });
  document.getElementById('joinChatSendBtn').addEventListener('click', ()=>{
    const input = document.getElementById('joinChatInput');
    const text = input.value.trim(); if(!text) return;
    const name = getUsername();
    appendChat('joinChatLog', name, text);
    safeSend(hostDC||joinDC, { type:'chat', from:'join', name, text });
    input.value = '';
  });
  document.getElementById('spectateChatSendBtn').addEventListener('click', ()=>{
    const input = document.getElementById('spectateChatInput');
    const text = input.value.trim(); if(!text) return;
    const name = getUsername();
    appendChat('spectateChatLog', name, text);
    safeSend(spectateDC, { type:'chat', from:'spectate', name, text });
    input.value = '';
  });

  // Handle game messages to update spectators and peers
  function handleMessage(source, data){
    let obj = null; try{ obj = JSON.parse(data); }catch(e){ return; }
    // Relay to spectators for any peer msg where appropriate
    if(source !== 'spectate') broadcastSpectators(obj);
    // Relay spectator chat to players
    if(source === 'spectate' && obj?.type === 'chat'){
      safeSend(hostDC||joinDC, obj);
      broadcastSpectators(obj);
    }
    // Chat display routing
    if(obj?.type === 'chat'){
      const who = obj.name || 'Peer';
      appendChat('hostChatLog', who, obj.text);
      appendChat('joinChatLog', who, obj.text);
      appendChat('spectateChatLog', who, obj.text);
      return;
    }
    // Pass gameplay messages to app hooks
    if(window.SinkShipsHooks && typeof window.SinkShipsHooks.onNetworkMessage === 'function'){
      window.SinkShipsHooks.onNetworkMessage(source, obj);
    }
  }
})();