(() => {
  "use strict";

  const TEAM_NAMES = ["Cyan Circuit", "Magenta Pulse", "Amber Forge"];
  const $ = (id) => document.getElementById(id);
  const dom = {
    connection: $("connectionBadge"), health: $("serverHealthBadge"), serverUrl: $("serverUrlInput"),
    createRoom: $("createRoomButton"), restoreRoom: $("restoreRoomButton"), setupStatus: $("setupStatus"),
    setupPanel: $("setupPanel"), controlPanel: $("controlPanel"), roomCode: $("roomCodeLarge"),
    copyCode: $("copyCodeButton"), copyLink: $("copyLinkButton"), studentLink: $("studentLink"),
    approvedCount: $("approvedCount"), approvedDetail: $("approvedDetail"), pendingCount: $("pendingCount"),
    lockState: $("lockState"), toggleLock: $("toggleLockButton"), pendingList: $("pendingList"),
    teamCapacity: $("teamCapacity"), roster: $("rosterList"), startReadiness: $("startReadiness"),
    phase: $("phaseLabel"), clock: $("clockLabel"), startMatch: $("startMatchButton"),
    endMatch: $("endMatchButton"), resetRoom: $("resetRoomButton"), livePanel: $("livePanel"),
    liveTeams: $("liveTeams"), livePlayers: $("livePlayers"), reportPanel: $("reportPanel"),
    winnerSummary: $("winnerSummary"), finalRanking: $("finalRanking"), reportBody: $("reportTableBody"),
    downloadCsv: $("downloadCsvButton"), downloadJson: $("downloadJsonButton")
  };

  const state = {
    ws: null, serverUrl: "", roomCode: "", masterToken: "", phase: "offline",
    lobby: null, report: null, remainingMs: 300000, arena: { width:1600,height:1000,gridWidth:40,gridHeight:25 },
    players: [], territoryCounts: [0,0,0], serverNowOffset: 0, reconnectTimer: null,
    reconnectAttempt: 0, manuallyClosed: false
  };

  function normalizeServerUrl(raw) {
    let value = String(raw || "").trim().replace(/\/$/, "");
    if (!value) throw new Error("The multiplayer server URL is missing.");
    if (value.startsWith("https://")) value = `wss://${value.slice(8)}`;
    if (value.startsWith("http://")) value = `ws://${value.slice(7)}`;
    if (!/^wss?:\/\//i.test(value)) throw new Error("The server URL must begin with wss:// or https://.");
    return value;
  }
  function initialServerUrl() { return localStorage.getItem("triadServerUrl") || window.TRIAD_CONFIG?.serverUrl || ""; }
  function setConnection(mode,text){dom.connection.className=`connection-badge ${mode}`;dom.connection.textContent=text;}
  function setStatus(text,kind="neutral"){dom.setupStatus.textContent=text;dom.setupStatus.style.borderLeftColor=kind==="error"?"#b42318":kind==="success"?"#067647":"#344054";}
  function storedControl(){try{return JSON.parse(localStorage.getItem("triadMasterSession")||"null");}catch{return null;}}
  function saveControl(){localStorage.setItem("triadMasterSession",JSON.stringify({serverUrl:state.serverUrl,roomCode:state.roomCode,masterToken:state.masterToken}));}
  function clearControl(){localStorage.removeItem("triadMasterSession");state.roomCode="";state.masterToken="";}
  function send(payload){if(state.ws?.readyState===WebSocket.OPEN)state.ws.send(JSON.stringify(payload));}

  dom.serverUrl.value = initialServerUrl();

  function connect() {
    const url = normalizeServerUrl(dom.serverUrl.value);
    state.serverUrl = url;
    localStorage.setItem("triadServerUrl", url);
    if (state.ws?.readyState === WebSocket.OPEN && state.ws.url === url) return Promise.resolve(state.ws);
    if (state.ws) { state.manuallyClosed = true; state.ws.close(); state.manuallyClosed = false; }
    setConnection("connecting","CONNECTING");
    return new Promise((resolve,reject)=>{
      const ws = new WebSocket(url); state.ws = ws;
      const timer=setTimeout(()=>{if(ws.readyState!==WebSocket.OPEN)ws.close();reject(new Error("Render did not respond. Wake the server by opening its HTTPS URL and retry."));},18000);
      ws.addEventListener("open",()=>{clearTimeout(timer);state.reconnectAttempt=0;setConnection("online","ONLINE");dom.health.className="health-pill online";dom.health.textContent="SERVER ONLINE";resolve(ws);},{once:true});
      ws.addEventListener("error",()=>{clearTimeout(timer);reject(new Error("Unable to connect to the multiplayer server."));},{once:true});
      ws.addEventListener("message",onMessage);ws.addEventListener("close",onClose);
    });
  }

  async function probeServer(){
    try{
      dom.health.className="health-pill";dom.health.textContent="CHECKING SERVER";
      const url=normalizeServerUrl(dom.serverUrl.value);
      await new Promise((resolve,reject)=>{const ws=new WebSocket(url);const timer=setTimeout(()=>{try{ws.close();}catch{}reject(new Error("timeout"));},16000);ws.addEventListener("message",event=>{try{const msg=JSON.parse(event.data);if(msg.type==="hello"){clearTimeout(timer);ws.close();resolve();}}catch{}});ws.addEventListener("error",()=>{clearTimeout(timer);reject(new Error("error"));});});
      dom.health.className="health-pill online";dom.health.textContent="SERVER ONLINE";setStatus("Server is live. Create or restore the teacher-controlled room.","success");
    }catch{dom.health.className="health-pill offline";dom.health.textContent="SERVER SLEEPING";setStatus("Open the Render HTTPS server URL, wait for status ok, then retry.","error");}
  }

  async function createRoom(){
    try{
      clearControl(); await connect(); send({type:"create_control_room"});
      dom.createRoom.disabled=true;setStatus("Creating authoritative classroom room…");
    }catch(error){setStatus(error.message,"error");setConnection("offline","OFFLINE");dom.createRoom.disabled=false;}
  }
  async function restoreRoom(){
    const saved=storedControl();
    if(!saved?.roomCode||!saved?.masterToken){setStatus("No previous teacher-control session is stored in this browser.","error");return;}
    try{dom.serverUrl.value=saved.serverUrl||dom.serverUrl.value;await connect();send({type:"restore_control",roomCode:saved.roomCode,masterToken:saved.masterToken});setStatus("Restoring teacher control…");}
    catch(error){setStatus(error.message,"error");}
  }

  function onMessage(event){
    let message;try{message=JSON.parse(event.data);}catch{return;}
    switch(message.type){
      case "hello":state.serverNowOffset=message.serverTime-Date.now();break;
      case "controller_joined":
        state.roomCode=message.roomCode;state.masterToken=message.masterToken;state.arena=message.arena||state.arena;saveControl();
        dom.setupPanel.classList.add("hidden");dom.controlPanel.classList.remove("hidden");dom.roomCode.textContent=state.roomCode;
        updateStudentLink();setStatus(message.reconnected?"Teacher control restored.":"Master room created. Share the student link.","success");break;
      case "lobby":state.phase=message.phase;state.lobby=message;renderLobby(message);break;
      case "countdown":state.phase="countdown";dom.phase.textContent="COUNTDOWN";break;
      case "state":renderState(message);break;
      case "match_ended":state.phase="ended";state.report=message.report;renderReport(message.winners,message.report);break;
      case "event":setStatus(message.text||"Server event.","success");break;
      case "error":setStatus(message.message||"Server request failed.","error");dom.createRoom.disabled=false;break;
      case "pong":state.serverNowOffset=message.serverTime-Date.now();break;
      default:break;
    }
  }
  function onClose(){setConnection("offline","OFFLINE");state.ws=null;if(state.manuallyClosed)return;const saved=storedControl();if(!saved?.masterToken)return;scheduleReconnect(saved);}
  function scheduleReconnect(saved){clearTimeout(state.reconnectTimer);const delay=Math.min(1000*2**state.reconnectAttempt,8000);state.reconnectAttempt+=1;setStatus(`Teacher connection lost. Restoring in ${Math.ceil(delay/1000)} seconds…`);state.reconnectTimer=setTimeout(async()=>{try{dom.serverUrl.value=saved.serverUrl;await connect();send({type:"restore_control",roomCode:saved.roomCode,masterToken:saved.masterToken});}catch{scheduleReconnect(saved);}},delay);}

  function updateStudentLink(){
    const base=window.TRIAD_CONFIG?.gameUrl||new URL("index.html",location.href).href;
    const url=new URL(base,location.href);url.searchParams.set("room",state.roomCode);dom.studentLink.textContent=url.href;dom.studentLink.dataset.url=url.href;
  }
  function renderLobby(message){
    if(message.phase==="lobby"){dom.reportPanel.classList.add("hidden");state.report=null;}
    dom.roomCode.textContent=message.roomCode;updateStudentLink();
    const connected=message.players.filter(p=>p.connected).length,ready=message.players.filter(p=>p.connected&&p.ready).length;
    dom.approvedCount.textContent=`${message.players.length} / 9`;dom.approvedDetail.textContent=`${connected} connected · ${ready} ready`;dom.pendingCount.textContent=message.pending.length;
    dom.lockState.textContent=message.registrationLocked?"LOCKED":"OPEN";dom.toggleLock.textContent=message.registrationLocked?"OPEN REGISTRATION":"LOCK REGISTRATION";
    dom.teamCapacity.innerHTML=message.teamCounts.map((count,team)=>`<div class="capacity-card team-${team}"><span>${TEAM_NAMES[team]}</span><b>${count}/3</b></div>`).join("");
    renderPending(message.pending);renderRoster(message.players);
    const balanced=message.teamCounts.every(count=>count===3),canStart=message.controllerConnected&&message.players.length===9&&connected===9&&ready===9&&balanced&&message.phase==="lobby";
    dom.startMatch.disabled=!canStart;dom.endMatch.disabled=!( ["playing","countdown"].includes(message.phase) );dom.resetRoom.disabled=message.phase!=="ended";
    if(canStart)dom.startReadiness.textContent="READY: 9 CONNECTED · 9 READY · TEAMS 3–3–3";
    else if(message.players.length<9)dom.startReadiness.textContent=`WAITING FOR ${9-message.players.length} APPROVAL(S)`;
    else if(connected<9)dom.startReadiness.textContent=`WAITING FOR ${9-connected} CONNECTION(S)`;
    else if(ready<9)dom.startReadiness.textContent=`WAITING FOR ${9-ready} READY CONFIRMATION(S)`;
    else if(!balanced)dom.startReadiness.textContent="TEAMS MUST BE BALANCED 3–3–3";
    dom.phase.textContent=String(message.phase).toUpperCase();
    dom.livePanel.classList.toggle("hidden",!["countdown","playing","ended"].includes(message.phase));
  }

  function renderPending(pending){
    if(!pending.length){dom.pendingList.innerHTML='<div class="empty-state">No pending registrations.</div>';return;}
    dom.pendingList.innerHTML=pending.map(item=>`<article class="pending-card" data-registration="${item.id}"><div class="pending-card-head"><div><strong>${escapeHtml(item.name)}</strong><small>${item.connected?"ONLINE":"OFFLINE"} · prefers ${TEAM_NAMES[item.preferredTeam]}</small></div><span class="tag ${item.connected?"ready":"offline"}">${item.connected?"CONNECTED":"OFFLINE"}</span></div><div class="pending-actions"><select aria-label="Assign team"><option value="0" ${item.preferredTeam===0?"selected":""}>Cyan Circuit</option><option value="1" ${item.preferredTeam===1?"selected":""}>Magenta Pulse</option><option value="2" ${item.preferredTeam===2?"selected":""}>Amber Forge</option></select><button class="primary-button approve-button" type="button">APPROVE</button><button class="danger-button reject-button" type="button">REJECT</button></div></article>`).join("");
    dom.pendingList.querySelectorAll(".pending-card").forEach(card=>{
      const id=card.dataset.registration;
      card.querySelector(".approve-button").addEventListener("click",()=>send({type:"approve_registration",registrationId:id,team:Number(card.querySelector("select").value)}));
      card.querySelector(".reject-button").addEventListener("click",()=>send({type:"reject_registration",registrationId:id}));
    });
  }
  function renderRoster(players){
    if(!players.length){dom.roster.innerHTML='<div class="empty-state">No approved players yet.</div>';return;}
    dom.roster.innerHTML=[...players].sort((a,b)=>a.team-b.team||a.name.localeCompare(b.name)).map(player=>`<article class="player-admin-card team-${player.team}" data-player="${player.id}"><div><strong>${escapeHtml(player.name)}</strong><small>${TEAM_NAMES[player.team]}</small><div class="player-tags"><span class="tag ${player.connected?"ready":"offline"}">${player.connected?"ONLINE":"OFFLINE"}</span><span class="tag ${player.ready?"ready":"waiting"}">${player.ready?"READY":"NOT READY"}</span></div></div><div class="admin-actions"><select aria-label="Move team"><option value="0" ${player.team===0?"selected":""}>Cyan Circuit</option><option value="1" ${player.team===1?"selected":""}>Magenta Pulse</option><option value="2" ${player.team===2?"selected":""}>Amber Forge</option></select><button class="secondary-button move-button" type="button">MOVE</button><button class="danger-button remove-button" type="button">REMOVE</button></div></article>`).join("");
    dom.roster.querySelectorAll(".player-admin-card").forEach(card=>{
      const id=card.dataset.player;
      card.querySelector(".move-button").addEventListener("click",()=>send({type:"move_player",playerId:id,team:Number(card.querySelector("select").value)}));
      card.querySelector(".remove-button").addEventListener("click",()=>{if(confirm("Remove this player from the room?"))send({type:"remove_player",playerId:id});});
    });
  }

  function renderState(message){
    state.phase=message.phase;state.remainingMs=message.remainingMs;state.players=message.players||[];state.territoryCounts=message.territoryCounts||[0,0,0];state.arena=message.arena||state.arena;state.serverNowOffset=message.serverNow-Date.now();
    dom.phase.textContent=String(message.phase).toUpperCase();dom.livePanel.classList.remove("hidden");
    const total=state.arena.gridWidth*state.arena.gridHeight;
    dom.liveTeams.innerHTML=TEAM_NAMES.map((name,team)=>{const kills=state.players.filter(p=>p.team===team).reduce((sum,p)=>sum+p.kills,0);const percent=total?state.territoryCounts[team]/total*100:0;return`<article class="live-team team-${team}"><span>${name}</span><strong>${percent.toFixed(1)}%</strong><small>${state.territoryCounts[team]} cells · ${kills} eliminations</small></article>`;}).join("");
    dom.livePlayers.innerHTML=[...state.players].sort((a,b)=>a.team-b.team||a.name.localeCompare(b.name)).map(p=>`<div class="live-player team-${p.team}"><span>${escapeHtml(p.name)}</span><b>${p.connected?(p.alive?"ALIVE":"TRIG QUESTION"):"OFFLINE"}</b></div>`).join("");
  }
  function updateClock(){const seconds=Math.max(0,Math.ceil(state.remainingMs/1000));dom.clock.textContent=`${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;requestAnimationFrame(updateClock);}

  function renderReport(winners,report){
    dom.reportPanel.classList.remove("hidden");dom.livePanel.classList.remove("hidden");dom.resetRoom.disabled=false;dom.startMatch.disabled=true;dom.endMatch.disabled=true;
    const names=winners.map(team=>TEAM_NAMES[team]);dom.winnerSummary.textContent=winners.length===1?`${names[0]} wins by largest territory.`:`Territory tie: ${names.join(" and ")}.`;
    const total=state.arena.gridWidth*state.arena.gridHeight;
    dom.finalRanking.innerHTML=[...report.teams].sort((a,b)=>b.territory-a.territory).map((team,index)=>`<article class="rank-card team-${team.team}"><span>#${index+1} ${team.name}</span><strong>${((team.territory/total)*100).toFixed(1)}%</strong><small>${team.territory} cells</small></article>`).join("");
    dom.reportBody.innerHTML=[...report.players].sort((a,b)=>a.team-b.team||a.name.localeCompare(b.name)).map(p=>`<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.teamName)}</td><td>${p.territory}</td><td>${p.kills}</td><td>${p.deaths}</td><td>${p.attempts}</td><td>${p.correct}</td><td>${p.wrong}</td><td>${p.timeouts}</td><td>${p.accuracy==null?"—":`${Math.round(p.accuracy*100)}%`}</td></tr>`).join("");
  }
  function reportToCsv(report){const rows=[["room_code","player","team","territory","kills","deaths","attempts","correct","wrong","timeouts","accuracy","average_response_ms"]];report.players.forEach(p=>rows.push([report.roomCode,p.name,p.teamName,p.territory,p.kills,p.deaths,p.attempts,p.correct,p.wrong,p.timeouts,p.accuracy??"",p.averageResponseMs??""]));rows.push([],["player","question_type","prompt","selected_option","correct_option","outcome","response_ms"]);report.players.forEach(p=>p.answers.forEach(a=>rows.push([p.name,a.type,a.prompt,a.selectedIndex==null?"":a.options[a.selectedIndex],a.options[a.correctIndex],a.outcome,a.responseMs])));return rows.map(row=>row.map(csvCell).join(",")).join("\n");}
  function csvCell(value){const text=String(value??"");return/[",\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;}
  function download(content,filename,mime){const blob=new Blob([content],{type:mime});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function escapeHtml(value){return String(value).replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));}
  async function copy(text){await navigator.clipboard.writeText(text);setStatus("Copied to clipboard.","success");}

  dom.createRoom.addEventListener("click",createRoom);dom.restoreRoom.addEventListener("click",restoreRoom);
  dom.copyCode.addEventListener("click",()=>copy(state.roomCode));dom.copyLink.addEventListener("click",()=>copy(dom.studentLink.dataset.url||dom.studentLink.textContent));
  dom.toggleLock.addEventListener("click",()=>send({type:"set_registration_lock",locked:!state.lobby?.registrationLocked}));
  dom.startMatch.addEventListener("click",()=>send({type:"start_match"}));dom.endMatch.addEventListener("click",()=>{if(confirm("End the active match now and calculate the winner?"))send({type:"end_match"});});dom.resetRoom.addEventListener("click",()=>{if(confirm("Reset the same nine-player room for a new round?"))send({type:"reset_room"});});
  dom.downloadCsv.addEventListener("click",()=>state.report&&download(reportToCsv(state.report),`triad-${state.report.roomCode}-report.csv`,"text/csv;charset=utf-8"));dom.downloadJson.addEventListener("click",()=>state.report&&download(JSON.stringify(state.report,null,2),`triad-${state.report.roomCode}-report.json`,"application/json"));
  setInterval(()=>send({type:"ping",clientTime:Date.now()}),15000);

  setConnection("offline","OFFLINE");probeServer();requestAnimationFrame(updateClock);
  const saved=storedControl();if(saved?.roomCode&&saved?.masterToken){dom.restoreRoom.disabled=false;setStatus(`Previous room ${saved.roomCode} can be restored.`,"success");}
})();
