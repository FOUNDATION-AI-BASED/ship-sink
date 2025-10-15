// Minimal WebRTC data channel helper for copy/paste signaling
(function(){
  const RTC_CONF = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478?transport=udp' }
    ]
  };

  function encode(obj){ return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))); }
  function decode(str){ try { return JSON.parse(decodeURIComponent(escape(atob(str)))); } catch(e){ return null; } }

  // --- Host: player channel ---
  let hostPC = null; let hostDC = null;
  let hostSpectatePCs = []; // list of RTCPeerConnections for spectators

  async function hostCreateOffer(){
    hostPC = new RTCPeerConnection(RTC_CONF);
    hostDC = hostPC.createDataChannel('game');
    hostDC.onopen = ()=> console.log('Host DC open');
    hostDC.onmessage = onHostMessage;
    hostPC.onicecandidate = e => {
      if(!e.candidate){ // gathering done
        const offer = hostPC.localDescription;
        document.getElementById('hostOfferOut').value = encode({sdp: offer.sdp, type: offer.type});
      }
    };
    const offer = await hostPC.createOffer();
    await hostPC.setLocalDescription(offer);
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

  // --- Join: player ---
  let joinPC = null; let joinDC = null;
  async function joinCreateAnswer(){
    joinPC = new RTCPeerConnection(RTC_CONF);
    joinPC.ondatachannel = e => {
      joinDC = e.channel;
      joinDC.onopen = ()=> console.log('Join DC open');
      joinDC.onmessage = onJoinMessage;
    };
    const input = document.getElementById('joinOfferIn').value.trim();
    const obj = decode(input);
    if(!obj){ alert('Invalid Offer Code'); return; }
    await joinPC.setRemoteDescription(new RTCSessionDescription(obj));
    const answer = await joinPC.createAnswer();
    await joinPC.setLocalDescription(answer);
    joinPC.onicecandidate = e => {
      if(!e.candidate){
        const desc = joinPC.localDescription;
        document.getElementById('joinAnswerOut').value = encode({sdp: desc.sdp, type: desc.type});
        document.getElementById('joinStatus').textContent = 'Answer created. Send to host.';
      }
    };
  }

  // --- Spectate: viewer ---
  let spectatePC = null; let spectateDC = null;
  async function spectateCreateAnswer(){
    spectatePC = new RTCPeerConnection(RTC_CONF);
    spectatePC.ondatachannel = e => {
      spectateDC = e.channel;
      spectateDC.onopen = ()=> console.log('Spectate DC open');
      spectateDC.onmessage = onSpectateMessage;
    };
    const input = document.getElementById('spectateOfferIn').value.trim();
    const obj = decode(input);
    if(!obj){ alert('Invalid Spectate Offer Code'); return; }
    await spectatePC.setRemoteDescription(new RTCSessionDescription(obj));
    const answer = await spectatePC.createAnswer();
    await spectatePC.setLocalDescription(answer);
    spectatePC.onicecandidate = e => {
      if(!e.candidate){
        const desc = spectatePC.localDescription;
        document.getElementById('spectateAnswerOut').value = encode({sdp: desc.sdp, type: desc.type});
        document.getElementById('spectateStatus').textContent = 'Spectate answer created. Send to host.';
      }
    };
  }

  // --- Messaging protocol ---
  function safeSend(dc, obj){
    if(!dc || dc.readyState !== 'open') return;
    dc.send(JSON.stringify(obj));
  }
  function onHostMessage(ev){ handleMessage('host', ev.data); }
  function onJoinMessage(ev){ handleMessage('join', ev.data); }
  function onSpectateMessage(ev){ handleMessage('spectate', ev.data); }

  function broadcastSpectators(msg){
    for(const {dc} of hostSpectatePCs){ safeSend(dc, msg); }
  }

  // You should integrate with game state from app.js via window.SinkShipsNet
  const Net = {
    sendToOpponent(msg){ safeSend(hostDC||joinDC, msg); },
    broadcastToSpectators(msg){ broadcastSpectators(msg); },
    setStatus(where, text){ document.getElementById(where).textContent = text; }
  };
  window.SinkShipsNet = Net;

  // --- Wire UI buttons ---
  document.getElementById('hostCreateOfferBtn').addEventListener('click', hostCreateOffer);
  document.getElementById('hostAcceptAnswerBtn').addEventListener('click', hostAcceptAnswer);
  document.getElementById('hostCreateSpectateOfferBtn').addEventListener('click', hostCreateSpectateOffer);
  document.getElementById('hostSpectateAcceptBtn').addEventListener('click', hostAcceptSpectator);
  document.getElementById('joinCreateAnswerBtn').addEventListener('click', joinCreateAnswer);
  document.getElementById('spectateCreateAnswerBtn').addEventListener('click', spectateCreateAnswer);

  // Handle game messages to update spectators and peers
  function handleMessage(source, data){
    let obj = null; try{ obj = JSON.parse(data); }catch(e){ return; }
    // Relay to spectators for any peer msg where appropriate
    if(source !== 'spectate') broadcastSpectators(obj);
    // TODO: Integrate with gameplay (shots, placements, turn changes) via window hooks defined in app.js
    // Example: window.SinkShipsHooks?.onNetworkMessage?.(obj);
  }
})();