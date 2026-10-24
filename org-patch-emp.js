// ORG-HIERARCHY PATCH for the Employee portal
// - Employee login is blocked if the owner Admin is disabled (Organizer action)
// - Employee login is blocked if the Employee ID itself is disabled (Admin action)
// - Punch is blocked in both cases
// - Records stamp adminId (per-admin isolation, audit safe)
(function(){
const K_ADMINS='get_attend_admins';
function normAdm(x){x=x||{};return {id:String(x.id||''),pass:String(x.pass||''),mob:String(x.mob||''),movie:String(x.movie||''),birth:String(x.birth||''),school:String(x.school||''),photo:String(x.photo||''),status:(x.status==='Disabled'?'Disabled':'Enabled'),name:String(x.name||''),created:String(x.created||'') };}
function getAdminsList(){try{const raw=localStorage.getItem(K_ADMINS);if(raw){const a=JSON.parse(raw);if(Array.isArray(a))return a.map(normAdm);}}catch(e){}return [];}
function isAdminDisabledById(id){
 try{
  if(!id)return false;
  const raw=localStorage.getItem(K_ADMINS);
  if(raw==null)return false; // never synced on this device — don't lock out
  const arr=JSON.parse(raw)||[];
  const f=arr.find(function(x){return String(x.id).toLowerCase()===String(id||'').toLowerCase();});
  // Missing owner = Admin was deleted by the Organizer; keep employees blocked.
  return !f||f.status==='Disabled';
 }catch(e){return false;}
}
function isEmpDisabledById(id){try{const all=getEmp();const f=all.find(function(x){return String(x.id).toLowerCase()===String(id||'').toLowerCase();});return f&&f.status==='Disabled';}catch(e){return false;}}
window.isAdminDisabledById=isAdminDisabledById;window.getAdminsList=getAdminsList;window.isEmpDisabledById=isEmpDisabledById;
var _pull=window.cloudPull;
window.cloudPull=async function(silent){
 try{
 if(!isCloudMode())return false;
 const d=await apiFetch('/api/pull');
 if(d&&d.ok){
  if(Array.isArray(d.emp))safeSet(K_EMP,d.emp);
  if(Array.isArray(d.rec))safeSet(K_REC,d.rec);
   if(Array.isArray(d.admins)){try{localStorage.setItem(K_ADMINS,JSON.stringify(d.admins.map(normAdm)));}catch(e){}}
  if(d.admin&&d.admin.id){try{localStorage.setItem(K_ADMIN,JSON.stringify(d.admin));}catch(e){}}
  try{
   if(typeof curEmp!=='undefined'&&curEmp&&curEmp.id){
    var fr=getEmp().find(function(x){return String(x.id).toLowerCase()===String(curEmp.id).toLowerCase();});
    if(fr)curEmp=fr;
    if(typeof renderEmpAvatar==='function')renderEmpAvatar();
   }
  }catch(e){}
  try{renderAdminInfo();}catch(e){}
  try{updateSyncBadge();}catch(e){}
  return true;
 }
 if(d&&d.error==='session-expired'){clearSession();if(!silent)alert('Session expired. Please log in again.');}
 }catch(e){if(!silent){alert('Failed to fetch data from the cloud: '+e.message);}}
 return false;
};
try{cloudPull=window.cloudPull;}catch(e){}
var _empLogin=window.employeeLogin;
// The cloud backend now enforces disabled Employee/Admin status during login,
// so the employee login is delegated directly (no pre-login pull without a token).
window.employeeLogin=function(){return _empLogin.apply(this,arguments);};
try{employeeLogin=window.employeeLogin;}catch(e){}
var _restore=window.tryRestoreSession;
window.tryRestoreSession=function(){
 try{
 const s=getSession();
 if(!s||!s.loginAt)return _restore.apply(this,arguments);
 if(isCloudMode()&&!getToken()){clearSession();return;}
 if(s&&s.role==='emp'&&s.empId){
  const f=getEmp().find(function(x){return x.id.toLowerCase()===String(s.empId).toLowerCase();});
  if(f&&f.status==='Disabled'){clearSession();alert('Your Employee ID has been disabled by the Admin. You have been logged out automatically.');return;}
  if(f&&f.adminId&&isAdminDisabledById(f.adminId)){clearSession();alert('Your Admin has been disabled by the Organizer. You have been logged out automatically.');return;}
 }
 }catch(e){}
 return _restore.apply(this,arguments);
};
try{tryRestoreSession=window.tryRestoreSession;}catch(e){}
var _punch=window.punch;
window.punch=async function(type){
 try{
 var fresh=null;
 try{fresh=getEmp().find(function(x){return x.id.toLowerCase()===String(curEmp.id).toLowerCase();});if(fresh)curEmp=fresh;}catch(e){}
  if(curEmp&&curEmp.status==='Disabled')return alert('Your Employee ID has been disabled by the Admin. Attendance is blocked. Please contact your Admin.');
  if(curEmp&&curEmp.adminId&&isAdminDisabledById(curEmp.adminId))return alert('Your Admin account has been disabled by the Organizer. Attendance is blocked. Please contact your Admin or the Organizer.');
 }catch(e){}
 // stamp adminId on new record after punch (audit + isolation)
 var out=await _punch.apply(this,arguments);
 try{
 var recs=getRec();var ch=false;
 recs.forEach(function(x){if(!x.adminId&&curEmp&&x.empId===curEmp.id){x.adminId=curEmp.adminId||'';ch=true;}});
 if(ch)setRec(recs);
 }catch(e2){}
 return out;
};
try{punch=window.punch;}catch(e){}
})();
