// ============================================================
// ORG-HIERARCHY PATCH (Organizer -> Admins -> Employees)
// - Admin IDs are separate and unique, with per-admin isolation (no merging)
// - Organizer Disable blocks the Admin and all of its Employees automatically
// - The Organizer never sees employee details (enforced in organizer.html)
// - Legacy single K_ADMIN and employees without adminId are auto-migrated
// - Employees have Enabled/Disabled status (Admin controlled) + live password display
// ============================================================
(function(){
const K_ADMINS='get_attend_admins';
function normAdm(x){x=x||{};return {id:String(x.id||''),pass:String(x.pass||''),mob:String(x.mob||''),movie:String(x.movie||''),birth:String(x.birth||''),school:String(x.school||''),photo:String(x.photo||''),status:(x.status==='Disabled'?'Disabled':'Enabled'),name:String(x.name||''),created:String(x.created||'') };}
function empStatus(e){return (e&&e.status==='Disabled')?'Disabled':'Enabled';}
function isEmpDisabled(e){return empStatus(e)==='Disabled';}
function normEmp(e){e=e||{};if(!e.status)e.status='Enabled';return e;}
function getAdminsList(){
 try{
 const raw=localStorage.getItem(K_ADMINS);
 if(raw){const a=JSON.parse(raw);if(Array.isArray(a)&&a.length)return a.map(normAdm);}
  const one=JSON.parse(localStorage.getItem('get_attend_admin')||'null');
  if(one&&one.id){
  const arr=[normAdm(Object.assign({},one,{status:'Enabled',created:(typeof todayStr==='function'?todayStr():new Date().toISOString().slice(0,10))}))];
  try{localStorage.setItem(K_ADMINS,JSON.stringify(arr));}catch(e){}
  return arr;
 }
 const seed=[normAdm({id:'admin',pass:((typeof isCloudMode==='function'&&isCloudMode())?'':'Admin@124'),created:(typeof todayStr==='function'?todayStr():new Date().toISOString().slice(0,10))})];
 try{localStorage.setItem(K_ADMINS,JSON.stringify(seed));}catch(e){}
 return seed;
 }catch(e){return [normAdm({id:'admin',pass:((typeof isCloudMode==='function'&&isCloudMode())?'':'Admin@124')})];}
}
function getCurrentAdminId(){
 try{
 const s=JSON.parse(localStorage.getItem('get_attend_session')||'null');
 if(s&&s.role==='adm'&&s.adminId)return s.adminId;
 }catch(e){}
 try{if(typeof admIdOk!=='undefined'&&admIdOk)return admIdOk;}catch(e){}
 const arr=getAdminsList();
 return arr.length?arr[0].id:'admin';
}
function myAdminRec(){const id=getCurrentAdminId();const arr=getAdminsList();return arr.find(function(x){return String(x.id).toLowerCase()===String(id).toLowerCase();})||null;}
function isAdminDisabledById(id){
 try{
  if(!id)return false;
  const raw=localStorage.getItem(K_ADMINS);
  if(raw==null)return false;
  const arr=JSON.parse(raw)||[];
  const f=arr.find(function(x){return String(x.id).toLowerCase()===String(id||'').toLowerCase();});
  return !f||f.status==='Disabled';
 }catch(e){return false;}
}
function myEmpList(){try{const id=getCurrentAdminId();return getEmp().filter(function(e){return String(e.adminId||'').toLowerCase()===String(id).toLowerCase();});}catch(e){return [];}}
function ensureLegacyEmpAssigned(){
 try{
 const arr=getAdminsList();if(!arr.length)return;
 const owner=arr[0].id;
 var emps=getEmp();var ch=false;
 emps.forEach(function(e){if(!e.adminId){e.adminId=owner;ch=true;} if(!e.status){e.status='Enabled';ch=true;}});
 if(ch){try{safeSet('get_attend_employees',emps);}catch(e2){try{localStorage.setItem('get_attend_employees',JSON.stringify(emps));}catch(e3){}}}
 }catch(e){}
}
window.getAdminsList=getAdminsList;window.getCurrentAdminId=getCurrentAdminId;window.isAdminDisabledById=isAdminDisabledById;
window.empStatus=empStatus;window.isEmpDisabled=isEmpDisabled;
window.cloudPull=async function(silent){
 if(!isCloudMode())return false;
 try{
 const d=await apiFetch('/api/pull');
 if(d&&d.ok){
  if(Array.isArray(d.emp))safeSet(K_EMP,d.emp.map(normEmp));
  if(Array.isArray(d.rec))safeSet(K_REC,d.rec);
  if(Array.isArray(d.admins)&&d.admins.length){try{localStorage.setItem(K_ADMINS,JSON.stringify(d.admins.map(normAdm)));}catch(e){}}
  else if(d.admin&&d.admin.id){
  const cur=getAdminsList();
  const i=cur.findIndex(function(x){return x.id.toLowerCase()===String(d.admin.id).toLowerCase();});
  if(i>=0)cur[i]=normAdm(Object.assign({},cur[i],d.admin));else cur.push(normAdm(d.admin));
  try{localStorage.setItem(K_ADMINS,JSON.stringify(cur));}catch(e){}
  try{localStorage.setItem('get_attend_admin',JSON.stringify(d.admin));}catch(e2){}
  }
  try{renderAdminInfo();}catch(e){}
  try{updateSyncBadge();}catch(e){}
  try{renderAdminAvatar();}catch(eRA){}
  try{ensureLegacyEmpAssigned();}catch(e2){}
  try{renderEmpTable();}catch(e3){}
  return true;
 }
 }catch(e){if(!silent){alert('Failed to fetch data from the cloud: '+e.message);}}
 return false;
};
try{cloudPull=window.cloudPull;}catch(e){}
window.cloudPush=async function(silent){
 if(!isCloudMode())return false;
 try{
 const myAd=myAdminRec();
 var adm=null;try{adm=myAd||getAdmin();}catch(e2){adm=myAd;}
 const d=await apiFetch('/api/push',{method:'POST',body:JSON.stringify({emp:getEmp(),rec:getRec(),admin:adm,admins:getAdminsList()})});
 try{updateSyncBadge();}catch(e){}
 return !!(d&&d.ok);
 }catch(e){if(!silent){alert('Cloud save failed: '+e.message);}}
 return false;
};
try{cloudPush=window.cloudPush;}catch(e){}
window.getAdmin=function(){
 const r=myAdminRec();
 if(r)return Object.assign({},r);
  try{const a=JSON.parse(localStorage.getItem('get_attend_admin')||'null');if(a&&a.id)return a;}catch(e){}
  return {id:'admin',pass:'Admin@124',mob:'',movie:'',birth:'',school:''};
};
try{getAdmin=window.getAdmin;}catch(e){}
window.setAdmin=function(a){
 const arr=getAdminsList();
 const curId=getCurrentAdminId();
 var idx=-1;
 for(var k=0;k<arr.length;k++){if(String(arr[k].id).toLowerCase()===String(curId).toLowerCase()){idx=k;break;}}
 if(idx<0){for(var k2=0;k2<arr.length;k2++){if(String(arr[k2].id).toLowerCase()===String((a&&a.id)||'').toLowerCase()){idx=k2;break;}}}
 const rec=normAdm(Object.assign({},a,{status:(a&&a.status)||(idx>=0?arr[idx].status:'Enabled'),created:(idx>=0?arr[idx].created:((typeof todayStr==='function')?todayStr():''))}));
 if(idx>=0)arr[idx]=rec;else arr.push(rec);
 try{localStorage.setItem(K_ADMINS,JSON.stringify(arr));}catch(e){}
 try{localStorage.setItem('get_attend_admin',JSON.stringify(rec));}catch(e2){}
 try{renderAdminInfo();}catch(e3){}
 try{queueCloudPush();}catch(e4){}
};
try{setAdmin=window.setAdmin;}catch(e){}
window.hasCustomAdmin=function(){return getAdminsList().length>0;};
try{hasCustomAdmin=window.hasCustomAdmin;}catch(e){}
window.admMatchId=function(id){
 const nid=normId(id).toLowerCase();if(!nid)return '';
 const f=getAdminsList().find(function(a){return normId(a.id).toLowerCase()===nid;});
 if(f)return f.id;
 // Cloud mode: IDs from another device may not be cached yet. The server
 // verifies both ID and password at the password step.
 if(typeof isCloudMode==='function'&&isCloudMode())return normId(id);
 return '';
};
try{admMatchId=window.admMatchId;}catch(e){}
window.admMatchPass=function(id,pass){
 const p=String(pass||'').trim();const nid=normId(id).toLowerCase();
 const f=getAdminsList().find(function(a){return normId(a.id).toLowerCase()===nid&&String(a.pass)===p;});
 return f?Object.assign({},f):null;
};
try{admMatchPass=window.admMatchPass;}catch(e){}
window.adminLogin=async function(){
 try{if(typeof admStepLoad==='function')admStepLoad();}catch(e){}
 if(typeof admIdOk!=='undefined'&&!admIdOk){
 try{const typed=normId((document.getElementById('admId')||{}).value||'');const ok=typed?window.admMatchId(typed):'';if(ok){admIdOk=ok;}}catch(e){}
 }
 if(typeof admIdOk!=='undefined'&&!admIdOk)return alert('Please verify Admin ID in Step 1 first.');
 if(typeof admHumanOk!=='undefined'&&!admHumanOk)return alert('Please complete Step 2 verification first.');
 const p=String((document.getElementById('admPass')||{}).value||'').trim();
 if(!p)return alert('Please enter the Admin password.');
 if(typeof isCloudMode==='function'&&isCloudMode()){
  let d=null;
  try{d=await apiFetch('/api/admin/login',{method:'POST',body:JSON.stringify({id:admIdOk,pass:p})});}
  catch(e){return alert('Cloud login failed: '+e.message);}
  if(!(d&&d.ok)){
   if((d&&d.error)==='disabled')return alert('This Admin ID has been disabled by the Organizer. Please contact the Organizer to enable it.');
   if((d&&d.error)==='too-many-attempts')return alert('Too many login attempts. Please wait a few minutes and try again.');
   return alert('Wrong Admin ID or password. Please try again.');
  }
  setToken(d.token);
  try{if(typeof admStepClear==='function')admStepClear();}catch(e){}
  saveSession({role:'adm',adminId:d.admin.id,loginAt:Date.now()});
  try{await cloudPull(true);}catch(e){}
  try{ensureLegacyEmpAssigned();}catch(e){}
  showDash('adm');startSesTimers();
  return;
 }
 const ad=window.admMatchPass(admIdOk,p);
 if(!ad)return alert('Wrong Admin password. Please try again.');
 if(ad.status==='Disabled')return alert('This Admin ID has been disabled by the Organizer. Please contact the Organizer to enable it.');
 try{if(typeof admStepClear==='function')admStepClear();}catch(e){}
 try{ensureLegacyEmpAssigned();}catch(e){}
 saveSession({role:'adm',adminId:ad.id,loginAt:Date.now()});
 showDash('adm');startSesTimers();
};
try{adminLogin=window.adminLogin;}catch(e){}
var _tryRestore=window.tryRestoreSession;
window.tryRestoreSession=function(){
 try{
 const s=getSession();
 if(!s||!s.loginAt)return;
 if(typeof isCloudMode==='function'&&isCloudMode()&&!getToken()){clearSession();return;}
 if(Date.now()-s.loginAt>=sesTimeoutFor(s)){clearSession();return;}
 if(s.role==='emp')return;
 if(s.role&&s.role!=='adm')return;
 if(s.role==='adm'){
  var aid=s.adminId||'';
  if(!aid){const arr=getAdminsList();aid=arr.length?arr[0].id:'';s.adminId=aid;saveSession(s);}
  if(aid&&isAdminDisabledById(aid)){clearSession();alert('This Admin ID has been disabled by the Organizer. Login is blocked.');return;}
  try{ensureLegacyEmpAssigned();}catch(e){}
  showDash('adm');startSesTimers();return;
 }
 }catch(e){}
 return _tryRestore.apply(this,arguments);
};
try{tryRestoreSession=window.tryRestoreSession;}catch(e){}
window.renderEmpTable=function(){
 const tb=document.querySelector('#empTable tbody');if(!tb)return;tb.innerHTML='';
 myEmpList().forEach(function(e){
 const sName=e.store||'-';const sArea=e.storeArea||'-';
 const sLink=e.storeLink?('<a class="maplink" target="_blank" href="'+e.storeLink+'">Open Link</a>'):'-';
 var latLon='-';try{const c=getStoreCoords(e);if(c)latLon=c.lat+',<br>'+c.lon;}catch(e2){}
 const prof=e.photo?('<img src="'+e.photo+'" onclick="zoomSrc(this)" title="Employee photo">'):'<span style="color:#94a3b8">—</span>';
 const upBtn=('<br><label class="btn btn-blue btn-small" style="margin-top:6px;cursor:pointer">Upload<input type="file" accept="image/*" class="hidden" onchange="handleSheetPhoto(this,\''+e.id+'\')"> </label>');
 const st=empStatus(e)==='Disabled'?'<span class="badge disabled">Disabled</span>':'<span class="badge enabled">Enabled</span>';
 const tBtn=empStatus(e)==='Disabled'
  ?('<button class="btn btn-green btn-small" onclick="toggleEmpStatus(\''+e.id+'\')">Enable</button>')
  :('<button class="btn btn-orange btn-small" onclick="toggleEmpStatus(\''+e.id+'\')">Disable</button>');
 tb.innerHTML+=('<tr><td>'+prof+upBtn+'</td><td><b>'+e.id+'</b></td><td>'+e.name+'</td><td><span title="Hidden for security">••••••••</span></td><td>'+(e.desg||'-')+'</td><td>'+(e.mob||'-')+'</td><td><b>'+sName+'</b></td><td>'+sArea+'</td><td style="font-size:12px">'+latLon+'</td><td>'+sLink+'</td><td>'+st+'</td><td>'+tBtn+'</td><td><button class="btn btn-blue btn-small" onclick="openEditEmp(\''+e.id+'\')">Edit</button><button class="btn btn-red btn-small" onclick="delEmp(\''+e.id+'\')">Delete</button></td></tr>');
 });
 const f=document.getElementById('fEmp');if(f){const cur=f.value;f.innerHTML='<option value="">All Employees</option>'+myEmpList().map(function(e){return '<option value="'+e.id+'">'+e.id+' - '+e.name+'</option>';}).join('');f.value=cur;}
};
try{renderEmpTable=window.renderEmpTable;}catch(e){}
window.toggleEmpStatus=function(id){
 const arr=getEmp();
 const idx=arr.findIndex(function(x){return String(x.id).toLowerCase()===String(id||'').toLowerCase();});
 if(idx<0)return alert('Employee not found.');
 const owner=getCurrentAdminId();
 if(arr[idx].adminId&&String(arr[idx].adminId).toLowerCase()!==String(owner).toLowerCase())return alert('This Employee does not belong to your Admin account.');
 const cur=empStatus(arr[idx]);
 const nxt=cur==='Disabled'?'Enabled':'Disabled';
 var msg;
 if(nxt==='Disabled'){msg='Disable Employee '+arr[idx].id+' ('+(arr[idx].name||'-')+')? The employee will not be able to log in or mark attendance. You can enable access again later.';}
 else{msg='Enable Employee '+arr[idx].id+' ('+(arr[idx].name||'-')+')? The employee will be able to log in and mark attendance again.';}
 if(!confirm(msg))return;
 arr[idx].status=nxt;
 setEmp(arr);renderEmpTable();renderStoreAreas();renderAdminTable();updateStats();
 if(typeof isCloudMode==='function'&&isCloudMode()){try{apiFetch('/api/employees/'+encodeURIComponent(arr[idx].id)+(nxt==='Disabled'?'/disable':'/enable'),{method:'POST',body:'{}'}).catch(function(e){console.log(e.message);});}catch(e){}}
 alert('Employee '+arr[idx].id+' is now '+nxt+'.');
};
try{toggleEmpStatus=window.toggleEmpStatus;}catch(e){}
window.renderStoreAreas=function(){
 const tb=document.querySelector('#storeTable tbody');if(!tb)return;tb.innerHTML='';
 const map={};
 myEmpList().forEach(function(e){
 const key=(e.store||'Unknown').trim()||'Unknown';
 var c=null;try{c=getStoreCoords(e);}catch(e2){}
 if(!map[key])map[key]={name:key,areas:[],lat:c?c.lat:'-',lon:c?c.lon:'-',link:e.storeLink||'',count:0,ids:[]};
 map[key].count++;map[key].ids.push(e.id);
 const ar=(e.storeArea||'').trim();
 if(ar&&map[key].areas.indexOf(ar)<0)map[key].areas.push(ar);
 if(map[key].lat==='-'&&c){map[key].lat=c.lat;map[key].lon=c.lon;}
 if(!map[key].link&&e.storeLink)map[key].link=e.storeLink;
 });
 const keys=Object.keys(map).sort();
 if(!keys.length){tb.innerHTML='<tr><td colspan="6" style="color:#64748b">No stores yet — add a Store via Create Employee.</td></tr>';return;}
 keys.forEach(function(k){const s=map[k];const linkHtml=s.link?('<a class="maplink" target="_blank" href="'+s.link+'">🗺 Open</a>'):'-';
 tb.innerHTML+=('<tr><td><b>'+s.name+'</b></td><td>'+(s.areas.length?s.areas.join(', '):'-')+'</td><td>'+s.lat+'</td><td>'+s.lon+'</td><td>'+linkHtml+'</td><td><b>'+s.count+'</b> ('+s.ids.join(', ')+')</td></tr>');});
};
try{renderStoreAreas=window.renderStoreAreas;}catch(e){}
window.renderAdminTable=function(){
 const fmEl=document.getElementById('fMonth'),fdEl=document.getElementById('fDate'),feEl=document.getElementById('fEmp'),fsEl=document.getElementById('fSearch');
 const fm=fmEl?fmEl.value:'',fd=fdEl?fdEl.value:'',fe=feEl?feEl.value:'',fs=fsEl?fsEl.value.toLowerCase():'';
 const tb=document.querySelector('#admTable tbody');if(!tb)return;tb.innerHTML='';
 const mine=new Set(myEmpList().map(function(e){return e.id;}));
 const empMap={};myEmpList().forEach(function(e){empMap[e.id]=e;});
 const curAdmin=getCurrentAdminId();
 getRec().filter(function(r){
 if(!mine.has(r.empId)){
  try{if(r.adminId&&String(r.adminId).toLowerCase()===String(curAdmin).toLowerCase())return true;}catch(e){}
  return false;
 }
 return (!fm||monthStr(r.date)===fm)&&(!fd||r.date===fd)&&(!fe||r.empId===fe)&&(!fs||r.name.toLowerCase().includes(fs)||r.empId.toLowerCase().includes(fs)||(r.store||'').toLowerCase().includes(fs)||(r.storeArea||'').toLowerCase().includes(fs));
 })
 .sort(function(a,b){return (b.date+b.inTime).localeCompare(a.date+a.inTime);}).forEach(function(r){
 var inL='',outL='';try{inL=r.inLocLink||locLinkOf(r.inLat,r.inLon);}catch(e){}try{outL=r.outLocLink||locLinkOf(r.outLat,r.outLon);}catch(e){}
 const storeName=r.store||(empMap[r.empId]&&empMap[r.empId].store)||'-';
 const storeArea=r.storeArea||(empMap[r.empId]&&empMap[r.empId].storeArea)||'-';
 const storeLink=r.storeLink||(empMap[r.empId]&&empMap[r.empId].storeLink)||'';
 const storeLinkHtml=storeLink?('<a class="maplink" target="_blank" href="'+storeLink+'">🗺 Open</a>'):'—';
 const isOff=recType(r)!=='Duty';
 const profPhoto=(empMap[r.empId]&&empMap[r.empId].photo)?('<img src="'+empMap[r.empId].photo+'" onclick="zoomSrc(this)">'):'—';
 tb.innerHTML+=('<tr><td>'+profPhoto+'</td><td><b>'+r.empId+'</b></td><td>'+r.name+'</td><td><b>'+storeName+'</b></td><td>'+storeArea+'</td><td>'+storeLinkHtml+'</td><td>'+fmtDate(r.date)+'</td><td>'+(r.inTime||'—')+'</td><td>'+(r.inPhoto?('<img src="'+r.inPhoto+'" onclick="zoomSrc(this)">'):'—')+'</td><td>'+(r.inLat?('<a class="maplink" target="_blank" href="'+inL+'">'+r.inLat+'<br>'+r.inLon+'<br>🗺 Via Link</a>'):'—')+'</td><td>'+(r.outTime||'—')+'</td><td>'+(r.outPhoto?('<img src="'+r.outPhoto+'" onclick="zoomSrc(this)">'):'—')+'</td><td>'+(r.outLat?('<a class="maplink" target="_blank" href="'+outL+'">'+r.outLat+'<br>'+r.outLon+'<br>🗺 Via Link</a>'):'—')+'</td><td>'+(isOff?'—':workHrs(r))+'</td><td>'+statusBadge(r)+'</td></tr>');
 });
};
try{renderAdminTable=window.renderAdminTable;}catch(e){}
window.updateStats=function(){
 const emps=myEmpList(),recs=getRec(),t=todayStr();
 const enabledEmps=emps.filter(function(e){return empStatus(e)!=='Disabled';});
 const empIds=new Set(emps.map(function(e){return e.id;}));
 const enabledIds=new Set(enabledEmps.map(function(e){return e.id;}));
 const curAdmin=getCurrentAdminId();
 const todayRecs=recs.filter(function(r){return r.date===t&&recType(r)==='Duty'&&enabledIds.has(r.empId);});
 const todayMarked=recs.filter(function(r){if(r.date!==t)return false;if(enabledIds.has(r.empId))return true;try{return r.adminId&&String(r.adminId).toLowerCase()===String(curAdmin).toLowerCase()&&enabledIds.has(r.empId);}catch(e){return false;}}).length;
 var full=0,half=0;
 todayRecs.forEach(function(r){const s=getStatus(r);if(s.label==='Present')full++;else if(s.label==='Half Day')half++;});
 document.getElementById('stEmp').textContent=emps.length;
 document.getElementById('stRec').textContent=recs.filter(function(r){return empIds.has(r.empId);}).length;
 document.getElementById('stToday').textContent=full;
 const sh=document.getElementById('stHalf');if(sh)sh.textContent=half;
 document.getElementById('stAbs').textContent=Math.max(0,enabledEmps.length-todayMarked);
};
try{updateStats=window.updateStats;}catch(e){}
window.showStatList=function(type){
 const emps=myEmpList(), recs=getRec(), t=todayStr();
 const enabledEmps=emps.filter(function(e){return empStatus(e)!=='Disabled';});
 const empIds=new Set(emps.map(function(e){return e.id;}));
 const enabledIds=new Set(enabledEmps.map(function(e){return e.id;}));
 const todayDuty=recs.filter(function(r){return r.date===t&&recType(r)==='Duty'&&enabledIds.has(r.empId);});
 var list=[], title='', sub='';
 if(type==='emp'){list=emps.map(function(e){return {name:e.name,id:e.id};});title='Total Employees (My Admin)';sub=list.length+' employees';}
 else if(type==='present'){const ids=new Set();todayDuty.forEach(function(r){if(getStatus(r).label==='Present')ids.add(r.empId);});list=enabledEmps.filter(function(e){return ids.has(e.id);}).map(function(e){return {name:e.name,id:e.id};});title='Present Today (Full Day)';sub=list.length+' employees';}
 else if(type==='half'){const ids=new Set();todayDuty.forEach(function(r){if(getStatus(r).label==='Half Day')ids.add(r.empId);});list=enabledEmps.filter(function(e){return ids.has(e.id);}).map(function(e){return {name:e.name,id:e.id};});title='Half Day Today';sub=list.length+' employees';}
 else if(type==='records'){const ids=new Set(recs.filter(function(r){return empIds.has(r.empId);}).map(function(r){return r.empId;}));list=emps.filter(function(e){return ids.has(e.id);}).map(function(e){return {name:e.name,id:e.id};});title='Total Records - My Employees';sub=list.length+' employees';}
 else if(type==='absent'){const marked=new Set(recs.filter(function(r){return r.date===t&&enabledIds.has(r.empId);}).map(function(r){return r.empId;}));list=enabledEmps.filter(function(e){return !marked.has(e.id);}).map(function(e){return {name:e.name,id:e.id};});title='Absent Today (My Admin)';sub=list.length+' employees';}
 document.getElementById('statListTitle').textContent=title;
 document.getElementById('statListSub').textContent=sub;
 const tb=document.querySelector('#statListTable tbody');tb.innerHTML='';
 if(!list.length){tb.innerHTML='<tr><td colspan="3" style="color:#64748b">No employees in this category.</td></tr>';}
 else{list.forEach(function(e,i){tb.innerHTML+=('<tr><td>'+(i+1)+'</td><td>'+e.name+'</td><td><b>'+e.id+'</b></td></tr>');});}
 document.getElementById('statListModal').classList.remove('hidden');
};
try{showStatList=window.showStatList;}catch(e){}
window.createEmployee=async function(){
 const n=document.getElementById('nName').value.trim(), id=document.getElementById('nId').value.trim(),
 p=document.getElementById('nPass').value.trim(), d=document.getElementById('nDesg').value.trim(), m=document.getElementById('nMob').value.trim(),
 st=document.getElementById('nStore').value.trim(), stArea=document.getElementById('nStoreArea').value.trim();
 var sLat=document.getElementById('nStoreLat').value.trim(), sLon=document.getElementById('nStoreLon').value.trim();
 var stLink=document.getElementById('nStoreLink').value.trim();
 if(!n||!id||!p) return alert('Name, ID and Password are required (the Admin sets the ID manually).');
 if(id.length<3) return alert('Employee ID must be at least 3 characters.');
 if(p.length<8) return alert('Password must be at least 8 characters.');
 if(!st) return alert('Please enter the Store Name.');
 if((!sLat||!sLon)&&stLink){const pp=parseLatLonFromLink(stLink);if(pp){sLat=String(pp.lat);sLon=String(pp.lon);document.getElementById('nStoreLat').value=sLat;document.getElementById('nStoreLon').value=sLon;}}
 if(!sLat||!sLon) return alert('Please enter the Store Latitude and Longitude.');
 const la=parseFloat(sLat), lo=parseFloat(sLon);
 if(isNaN(la)||la<-90||la>90) return alert('Store Latitude must be between -90 and 90.');
 if(isNaN(lo)||lo<-180||lo>180) return alert('Store Longitude must be between -180 and 180.');
 if(!stLink){stLink=buildStoreLink(la,lo);document.getElementById('nStoreLink').value=stLink;}
 const arr=getEmp();
 if(arr.some(function(x){return x.id.toLowerCase()===id.toLowerCase();})){return alert('This ID "'+id+'" already exists. Please use a different unique ID.');}
 const owner=getCurrentAdminId();
 if(typeof isCloudMode==='function'&&isCloudMode()){
  let r=null;
  try{r=await apiFetch('/api/employees',{method:'POST',body:JSON.stringify({name:n,id,pass:p,desg:d,mob:m,store:st,storeArea:stArea,storeLat:la,storeLon:lo,storeLink:stLink,created:todayStr(),adminId:owner,status:'Enabled'})});}
  catch(e){return alert('Cloud create failed: '+e.message);}
  if(!(r&&r.ok)){
   if((r&&r.error)==='duplicate')return alert('This ID "'+id+'" already exists. Please use a different unique ID.');
   if((r&&r.error)==='password-too-short')return alert('Password must be at least 8 characters.');
   return alert('Could not create the employee on the server ('+((r&&r.error)||'unknown')+').');
  }
 }
 arr.push({name:n,id:id,pass:(typeof isCloudMode==='function'&&isCloudMode())?'':p,desg:d,mob:m,photo:'',store:st,storeArea:stArea,storeLat:la,storeLon:lo,storeLink:stLink,created:todayStr(),mustChangePass:true,adminId:owner,status:'Enabled'});
 setEmp(arr);
 alert('Employee ID created successfully. ID: '+id+'. Admin: '+owner+'. Store: '+st+'.');
 ['nName','nId','nDesg','nMob','nStore','nStoreArea','nStoreLat','nStoreLon','nStoreLink'].forEach(function(i){document.getElementById(i).value='';});
 document.getElementById('nPass').value=(typeof DEFAULT_EMP_PASS!=='undefined'?DEFAULT_EMP_PASS:'MAIPL@001');
 renderEmpTable();renderStoreAreas();updateStats();
};
try{createEmployee=window.createEmployee;}catch(e){}
window.delEmp=function(id){
 const owner=getCurrentAdminId();
 const f=getEmp().find(function(x){return String(x.id).toLowerCase()===String(id).toLowerCase();});
 if(!f)return alert('Employee not found.');
 if(f.adminId&&String(f.adminId).toLowerCase()!==String(owner).toLowerCase())return alert('This Employee does not belong to your Admin account.');
 if(!confirm('Delete Employee '+id+' permanently?'))return;
 const empId=String(id);
 setEmp(getEmp().filter(function(x){return x.id!==id;}));
 if(typeof isCloudMode==='function'&&isCloudMode()){try{apiFetch('/api/employees/'+encodeURIComponent(empId),{method:'DELETE'}).catch(function(e){console.log('cloud employee delete failed:',e.message);});}catch(e){}}
 const fe=document.getElementById('fEmp');if(fe&&fe.value===id)fe.value='';
 renderEmpTable();renderStoreAreas();renderAdminTable();updateStats();
};
try{delEmp=window.delEmp;}catch(e){}
var _openEditEmp=window.openEditEmp;
window.openEditEmp=function(id){
 const owner=getCurrentAdminId();
 const e=getEmp().find(function(x){return String(x.id).toLowerCase()===String(id||'').toLowerCase();});
 if(!e)return alert('Employee not found.');
 if(e.adminId&&String(e.adminId).toLowerCase()!==String(owner).toLowerCase())return alert('This Employee does not belong to your Admin account.');
 var out=_openEditEmp.call(this,id);
 try{const p=document.getElementById('eePass');if(p)p.value='';}catch(e2){}
 return out;
};
try{openEditEmp=window.openEditEmp;}catch(e){}
window.openEditEmpIdx=function(i){
 try{
 const mine=myEmpList();const e=mine[Number(i)];
 if(e)return window.openEditEmp(e.id);
 const a=getEmp();const g=a[Number(i)];if(!g)return alert('Employee not found.');
 return window.openEditEmp(g.id);
 }catch(e){alert('Employee not found.');}
};
try{openEditEmpIdx=window.openEditEmpIdx;}catch(e){}
var _saveEditEmp=window.saveEditEmp;
window.saveEditEmp=async function(){
 const gv=function(id){return ((document.getElementById(id)||{}).value||'').trim();};
 const oldId=gv('eeOldId');
 const f=getEmp().find(function(x){return String(x.id).toLowerCase()===String(oldId).toLowerCase();});
 if(f&&f.adminId&&String(f.adminId).toLowerCase()!==String(getCurrentAdminId()).toLowerCase())return alert('This Employee does not belong to your Admin account.');
 await _saveEditEmp.apply(this,arguments);
 try{
 const nid=gv('eeId');const arr=getEmp();
 const ix=arr.findIndex(function(x){return String(x.id).toLowerCase()===String(nid).toLowerCase();});
 if(ix>=0){let ch=false;if(!arr[ix].adminId){arr[ix].adminId=getCurrentAdminId();ch=true;}if(!arr[ix].status){arr[ix].status='Enabled';ch=true;}if(ch)setEmp(arr);}
 }catch(e){}
};
try{saveEditEmp=window.saveEditEmp;}catch(e){}
var _punch=window.punch;
window.punch=async function(type){
 try{
 var fresh=null;
 try{fresh=getEmp().find(function(x){return x.id.toLowerCase()===String(curEmp.id).toLowerCase();});if(fresh)curEmp=fresh;}catch(e){}
 if(curEmp&&isEmpDisabled(curEmp))return alert('Your Employee ID has been disabled by the Admin. Attendance is blocked. Please contact your Admin.');
 if(curEmp&&curEmp.adminId&&isAdminDisabledById(curEmp.adminId))return alert('Your Admin account has been disabled by the Organizer. Attendance is blocked. Please contact your Admin or the Organizer.');
 }catch(e){}
 var r=await _punch.apply(this,arguments);
 try{
 var recs=getRec();var ch=false;
 recs.forEach(function(x){if(!x.adminId&&curEmp&&x.empId===curEmp.id){x.adminId=curEmp.adminId||getCurrentAdminId();ch=true;}});
 if(ch)setRec(recs);
 }catch(e2){}
 return r;
};
try{punch=window.punch;}catch(e){}
var _renderAdminInfo=window.renderAdminInfo;
window.renderAdminInfo=function(){
 try{
 const ad=myAdminRec()||window.getAdmin();
 const info=document.getElementById('admInfo');
 if(info)info.innerHTML='Admin ID: <b>'+ad.id+'</b>'+(ad.mob?' &nbsp;|&nbsp; '+ad.mob:'')+(ad.status==='Disabled'?' &nbsp;|&nbsp; Disabled':'');
 const cur=document.getElementById('curAdmIdShow');if(cur)cur.textContent=ad.id;
 const curM=document.getElementById('curAdmMobShow');if(curM)curM.textContent=ad.mob||'- (not set)';
 const curS=document.getElementById('curAdmSecShow');if(curS)curS.textContent=(ad.movie&&ad.birth&&ad.school)?' Set (3/3)':' Not set';
 const nm=document.getElementById('admAvaName');if(nm)nm.textContent=ad.id||'Admin';
 const hu=document.getElementById('hdrUser');if(hu&&document.body.classList.contains('logged-in'))hu.textContent=' '+ad.id;
 }catch(e){}
 try{return _renderAdminInfo.apply(this,arguments);}catch(e){}
};
try{renderAdminInfo=window.renderAdminInfo;}catch(e){}
try{ensureLegacyEmpAssigned();}catch(e){}
try{renderEmpTable();}catch(e){}
try{renderStoreAreas();}catch(e){}
try{renderAdminTable();}catch(e){}
try{updateStats();}catch(e){}
try{renderAdminInfo();}catch(e){}
})();
