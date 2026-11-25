/* CIDI – Application de fin de chantier (processus R5 Pose)
   Fonctionne hors connexion. Données stockées sur le téléphone (IndexedDB). */
'use strict';

/* ================= POINTS DE CONTRÔLE ================= */
const CTRL = {
  depose: { titre: 'Dépose', items: [
    ['d1', 'Éléments déposés conformes à la demande (références, quantités)'],
    ['d2', 'Support débarrassé des résidus de colle, adhésifs et fixations'],
    ['d3', 'Aucun dégât causé au support lors de la dépose'],
    ['d4', 'Trous de fixation rebouchés / support remis en état (si prévu)'],
    ['d5', 'Produits déposés conditionnés pour retour au stock client']
  ]},
  pose: { titre: 'Pose', items: [
    ['p1', 'Produits conformes au dossier de pose (visuel / BAT, références, quantités)'],
    ['p2', 'Support propre, sec et en bon état avant la pose'],
    ['p3', 'Dimensions et emplacement conformes au plan de pose'],
    ['p4', 'Alignement, niveau et raccords conformes'],
    ['p5', 'Fixation / adhérence solide (ni décollement, ni bulle, ni pli)'],
    ['p6', "Aucun défaut d'impression ou de finition visible (rayure, tache, déchirure)"],
    ['p7', 'Éclairage ou branchement fonctionnel (signalétique lumineuse)'],
    ['p8', 'Films de protection retirés, surface nettoyée']
  ]},
  fin: { titre: 'Fin de chantier', items: [
    ['f1', 'Site rangé et nettoyé, accès libérés'],
    ['f2', 'Aucun dégât constaté sur le site client (sols, murs, mobilier)'],
    ['f3', 'Outillage, matériel et balisage récupérés'],
    ['f4', 'Résultat présenté au client, fin des travaux annoncée']
  ]}
};
function sectionsPour(type) {
  if (type === 'pose') return [CTRL.pose, CTRL.fin];
  if (type === 'depose') return [CTRL.depose, CTRL.fin];
  if (type === 'pose_depose') return [CTRL.depose, CTRL.pose, CTRL.fin];
  return [];
}
const LIB_CTRL = {};
Object.values(CTRL).forEach(s => s.items.forEach(([id, t]) => LIB_CTRL[id] = t));
const LIB_TYPE = { pose: 'Pose', depose: 'Dépose', pose_depose: 'Pose + dépose' };
const LIB_DECHETS = { oui: 'Oui, rapportés', non: 'Non rapportés', aucun: 'Pas de déchets' };
const LIB_VAL = { ok: 'OUI', nok: 'NON', na: 'N/A' };

/* ================= OUTILS ================= */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? 0 : n; };
const fmtH = h => (Math.round(h * 100) / 100).toLocaleString('fr-FR') + ' h';
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const fmtD = iso => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—';
const fmtDT = iso => { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function numeroFiche() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `FC-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
}
const totalHeures = f => num(f.nbPoseurs) * num(f.heuresSite);
const idsType = f => sectionsPour(f.type).flatMap(s => s.items.map(i => i[0]));
const signeClient = f => !!f.sigClient && !f.clientAbsent;

let toastT;
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms);
}
function modal(html) { $('#modalBoite').innerHTML = html; $('#modal').classList.add('on'); }
function fermerModal() { $('#modal').classList.remove('on'); }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') fermerModal(); });
function confirmer(titre, texte, libOk = 'Confirmer') {
  return new Promise(res => {
    modal(`<h3>${esc(titre)}</h3><p>${esc(texte)}</p>
      <div class="ligne-btn"><button class="btn sec" id="mNon">Annuler</button><button class="btn" id="mOui">${esc(libOk)}</button></div>`);
    $('#mNon').onclick = () => { fermerModal(); res(false); };
    $('#mOui').onclick = () => { fermerModal(); res(true); };
  });
}

/* ================= STOCKAGE ================= */
const DB = (() => {
  let dbp;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('cidi-fin-chantier', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('fiches', { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction('fiches', mode), st = t.objectStore('fiches');
      const req = fn(st); t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error);
    });
  };
  return {
    put: f => tx('readwrite', s => s.put(f)),
    get: id => tx('readonly', s => s.get(id)),
    del: id => tx('readwrite', s => s.delete(id)),
    all: () => tx('readonly', s => s.getAll())
  };
})();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

const REG_DEF = { dest: '', nom: '', statut: 'interne', societe: '', objectif: 95 };
let REG = Object.assign({}, REG_DEF, JSON.parse(localStorage.getItem('fc_reglages') || '{}'));
const saveReg = () => localStorage.setItem('fc_reglages', JSON.stringify(REG));

/* ================= FICHE EN COURS ================= */
let cur = null;
function nouvelleFiche() {
  return {
    id: uid(), numero: numeroFiche(), statut: 'brouillon', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    type: '', affaire: '', client: '', adresse: '', contact: '', dateDebut: today(), dateFin: today(),
    poseurNom: REG.nom, poseurStatut: REG.statut, poseurSociete: REG.societe, autresPoseurs: '',
    nbPoseurs: '', heuresSite: '', opPose: false, opDepose: false,
    controles: {}, dechets: '', dechetsComment: '', reception: '', reserves: '', observations: '',
    photos: [], sigPoseur: '', sigClient: '', clientSignNom: '', clientSignFonction: '', clientAbsent: false, clientAbsentMotif: '',
    envoye: false, envoyeAt: '', validatedAt: ''
  };
}
let saveT;
function sauver() {
  clearTimeout(saveT);
  saveT = setTimeout(async () => {
    cur.updatedAt = new Date().toISOString();
    await DB.put(cur);
    localStorage.setItem('fc_cur', cur.id);
    $('#etatFiche').textContent = `Brouillon ${cur.numero} · enregistré ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  }, 400);
}

/* ---------- liaison des champs ---------- */
$$('#v-fiche [data-k]').forEach(el => el.addEventListener('input', () => {
  cur[el.dataset.k] = el.value;
  if (['nbPoseurs', 'heuresSite'].includes(el.dataset.k)) majTotal();
  if (el.dataset.k === 'poseurNom') $('#sigPoseurNom').textContent = el.value || '—';
  el.classList.remove('manque'); sauver();
}));
function seg(idSeg, cle, apres) {
  $(idSeg).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    cur[cle] = b.dataset.v; majSeg(idSeg, cur[cle]); if (apres) apres(); sauver();
  });
}
const majSeg = (idSeg, v) => $$(idSeg + ' button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
seg('#segStatut', 'poseurStatut', majVisibilite);
seg('#segDechets', 'dechets', majVisibilite);
seg('#segRecep', 'reception', majVisibilite);
$('#f-absent').addEventListener('change', e => { cur.clientAbsent = e.target.checked; majVisibilite(); sauver(); });

function majVisibilite() {
  $('#blocSociete').classList.toggle('cache', cur.poseurStatut !== 'independant');
  $('#blocDechets').classList.toggle('cache', cur.dechets !== 'non');
  $('#blocReserves').classList.toggle('cache', cur.reception !== 'avec');
  $('#blocAbsent').classList.toggle('cache', !cur.clientAbsent);
  $('#blocSigClient').classList.toggle('cache', cur.clientAbsent);
  if (!cur.clientAbsent) setTimeout(() => pads.sigClient.resize(), 0);
}
function majTotal() { $('#totalH').textContent = fmtH(totalHeures(cur)); }

/* ---------- points de contrôle ---------- */
const typeDe = f => f.opPose && f.opDepose ? 'pose_depose' : f.opPose ? 'pose' : f.opDepose ? 'depose' : '';
const LIB_OK = { ok: 'Oui', nok: 'Non' };
function htmlItems(items) {
  return items.map(([id, t]) => {
    const c = cur.controles[id] || {};
    return `<div class="ctrl" data-id="${id}"><div class="q">${esc(t)}</div>
      <div class="r">${['ok', 'nok'].map(v => `<button type="button" class="${v}${c.v === v ? ' on' : ''}" data-v="${v}">${LIB_OK[v]}</button>`).join('')}</div>
      <input type="text" class="${c.v === 'nok' ? '' : 'cache'}" placeholder="Non : précisez pourquoi…" value="${esc(c.c || '')}"></div>`;
  }).join('');
}
function etatOp(items) {
  const n = items.filter(([id]) => (cur.controles[id] || {}).v).length, nc = items.filter(([id]) => (cur.controles[id] || {}).v === 'nok').length;
  return `${n}/${items.length} renseigné(s)` + (nc ? ` · <b style="color:var(--nok)">${nc} Non</b>` : '');
}
function rendreCtrl() {
  cur.type = typeDe(cur);
  const op = (cle, sec) => {
    const on = !!cur[cle];
    return `<div class="acc${on ? ' ouvert' : ''}" data-op="${cle}">
      <button type="button" class="acc-tete" data-toggle="${cle}">
        <span class="acc-case">${on ? '✓' : ''}</span>
        <span class="acc-titre">${esc(sec.titre)}<small>${on ? etatOp(sec.items) : 'Non réalisée – touchez pour ouvrir'}</small></span>
        <svg class="acc-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      ${on ? `<div class="acc-corps">${htmlItems(sec.items)}</div>` : ''}
    </div>`;
  };
  $('#zoneCtrl').innerHTML =
    `<div class="bandeau info">Ouvrez uniquement les opérations réalisées sur ce chantier.<br>Répondez Oui ou Non à chaque point. Un « Non » doit être précisé.</div>` +
    op('opDepose', CTRL.depose) + op('opPose', CTRL.pose) +
    (cur.type ? `<h3>${esc(CTRL.fin.titre)}</h3>${htmlItems(CTRL.fin.items)}` : '');
}
$('#zoneCtrl').addEventListener('click', async e => {
  const tg = e.target.closest('[data-toggle]');
  if (tg) {
    const cle = tg.dataset.toggle, sec = cle === 'opPose' ? CTRL.pose : CTRL.depose;
    if (cur[cle] && sec.items.some(([id]) => (cur.controles[id] || {}).v)) {
      if (!await confirmer(`Retirer l'opération « ${sec.titre} » ?`, 'Les points de contrôle déjà renseignés pour cette opération seront effacés.', 'Retirer')) return;
      sec.items.forEach(([id]) => delete cur.controles[id]);
    }
    cur[cle] = !cur[cle]; rendreCtrl(); sauver(); return;
  }
  const b = e.target.closest('.r button'); if (!b) return;
  const row = b.closest('.ctrl'), id = row.dataset.id;
  cur.controles[id] = Object.assign(cur.controles[id] || {}, { v: b.dataset.v });
  row.querySelectorAll('.r button').forEach(x => x.classList.toggle('on', x === b));
  const inp = row.querySelector('input'); inp.classList.toggle('cache', b.dataset.v !== 'nok');
  if (b.dataset.v === 'nok') inp.focus();
  row.classList.remove('manque');
  const acc = row.closest('.acc');
  if (acc) { const sec = acc.dataset.op === 'opPose' ? CTRL.pose : CTRL.depose; acc.querySelector('.acc-titre small').innerHTML = etatOp(sec.items); }
  sauver();
});
$('#zoneCtrl').addEventListener('input', e => {
  const row = e.target.closest('.ctrl'); if (!row) return;
  const id = row.dataset.id; cur.controles[id] = Object.assign(cur.controles[id] || {}, { c: e.target.value }); sauver();
});

/* ---------- photos ---------- */
function compresser(file, max = 1600, q = 0.72) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight; const r = Math.min(1, max / Math.max(w, h));
      w = Math.round(w * r); h = Math.round(h * r);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url);
      res({ data: c.toDataURL('image/jpeg', q), w, h, at: new Date().toISOString() });
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('image illisible')); };
    img.src = url;
  });
}
async function ajouterPhotos(files) {
  for (const f of files) {
    try { cur.photos.push(await compresser(f)); } catch (e) { toast('Photo illisible, ignorée'); }
  }
  rendrePhotos(); sauver();
}
['#inPhotoCam', '#inPhotoGal'].forEach(s => $(s).addEventListener('change', e => { ajouterPhotos(Array.from(e.target.files)); e.target.value = ''; }));
function rendrePhotos() {
  $('#photos').innerHTML = cur.photos.map((p, i) => `<div class="ph"><img src="${p.data}" alt="Photo ${i + 1}"><button type="button" data-del="${i}" aria-label="Supprimer">×</button></div>`).join('');
}
$('#photos').addEventListener('click', async e => {
  const b = e.target.closest('[data-del]'); if (!b) return;
  if (await confirmer('Supprimer la photo ?', 'Cette photo sera retirée de la fiche.', 'Supprimer')) {
    cur.photos.splice(+b.dataset.del, 1); rendrePhotos(); sauver();
  }
});

/* ---------- signatures ---------- */
class Pad {
  constructor(id) {
    this.id = id; this.c = document.getElementById(id); this.ctx = this.c.getContext('2d'); this.box = this.c.parentElement;
    this.draw = false; this.last = null;
    this.c.addEventListener('pointerdown', e => { e.preventDefault(); this.c.setPointerCapture(e.pointerId); this.draw = true; this.last = this.pt(e); this.dot(this.last); });
    this.c.addEventListener('pointermove', e => { if (!this.draw) return; e.preventDefault(); const p = this.pt(e); this.line(this.last, p); this.last = p; });
    const fin = () => { if (!this.draw) return; this.draw = false; cur[this.id] = this.c.toDataURL('image/png'); this.box.classList.add('signe'); this.ph(); sauver(); };
    this.c.addEventListener('pointerup', fin); this.c.addEventListener('pointercancel', fin); this.c.addEventListener('pointerleave', fin);
  }
  pt(e) { const r = this.c.getBoundingClientRect(); return { x: (e.clientX - r.left) * this.k, y: (e.clientY - r.top) * this.k }; }
  style() { const x = this.ctx; x.lineWidth = 2.4 * this.k; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#1F1E41'; x.fillStyle = '#1F1E41'; }
  dot(p) { this.style(); this.ctx.beginPath(); this.ctx.arc(p.x, p.y, 1.2 * this.k, 0, 7); this.ctx.fill(); }
  line(a, b) { this.style(); this.ctx.beginPath(); this.ctx.moveTo(a.x, a.y); this.ctx.lineTo(b.x, b.y); this.ctx.stroke(); }
  ph() { this.box.querySelector('.ph-txt').style.display = cur[this.id] ? 'none' : ''; }
  resize() {
    const w = this.c.clientWidth, h = this.c.clientHeight; if (!w) return;
    this.k = Math.min(window.devicePixelRatio || 1, 2);
    this.c.width = Math.round(w * this.k); this.c.height = Math.round(h * this.k);
    this.ctx.clearRect(0, 0, this.c.width, this.c.height);
    if (cur[this.id]) { const im = new Image(); im.onload = () => this.ctx.drawImage(im, 0, 0, this.c.width, this.c.height); im.src = cur[this.id]; }
    this.ph();
  }
  clear() { cur[this.id] = ''; this.ctx.clearRect(0, 0, this.c.width, this.c.height); this.ph(); sauver(); }
}
const pads = { sigPoseur: new Pad('sigPoseur'), sigClient: new Pad('sigClient') };
$$('[data-clear]').forEach(b => b.addEventListener('click', () => pads[b.dataset.clear].clear()));
let rzT; window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => Object.values(pads).forEach(p => p.resize()), 200); });

/* ---------- chargement d'une fiche dans le formulaire ---------- */
function chargerFormulaire(f) {
  cur = f;
  $$('#v-fiche [data-k]').forEach(el => el.value = f[el.dataset.k] ?? '');
  if (f.opPose === undefined) { f.opPose = /pose/.test(f.type) && f.type !== 'depose'; f.opDepose = /depose/.test(f.type); }
  majSeg('#segStatut', f.poseurStatut); majSeg('#segDechets', f.dechets); majSeg('#segRecep', f.reception);
  $('#f-absent').checked = !!f.clientAbsent;
  $('#sigPoseurNom').textContent = f.poseurNom || '—';
  $$('.manque').forEach(x => x.classList.remove('manque'));
  rendreCtrl(); rendrePhotos(); majTotal(); majVisibilite();
  $('#etatFiche').textContent = `Brouillon ${f.numero}`;
  setTimeout(() => Object.values(pads).forEach(p => p.resize()), 30);
}

/* ---------- validation ---------- */
function controler(f) {
  const m = [];
  const req = (cond, msg, sel) => { if (!cond) m.push({ msg, sel }); };
  req(f.opPose || f.opDepose, 'Opération réalisée : ouvrez « Pose » et / ou « Dépose »', '#zoneCtrl');
  req(f.affaire.trim(), "N° d'affaire", '#f-affaire');
  req(f.client.trim(), 'Client', '#f-client');
  req(f.adresse.trim(), 'Adresse du chantier', '#f-adresse');
  req(f.dateDebut, 'Date de début', '#f-d1');
  req(f.dateFin, 'Date de fin', '#f-d2');
  if (f.dateDebut && f.dateFin && f.dateFin < f.dateDebut) m.push({ msg: 'La date de fin est avant la date de début', sel: '#f-d2' });
  req(f.poseurNom.trim(), 'Nom du poseur', '#f-poseur');
  req(f.poseurStatut, 'Statut du poseur', '#segStatut');
  if (f.poseurStatut === 'independant') req(f.poseurSociete.trim(), 'Société du poseur indépendant', '#f-societe');
  req(num(f.nbPoseurs) >= 1, 'Nombre de poseurs', '#f-nb');
  req(String(f.heuresSite).trim() !== '' && num(f.heuresSite) >= 0, 'Heures sur site', '#f-hs');
  const manq = [];
  sectionsPour(f.type).forEach(s => s.items.forEach(([id]) => { if (!(f.controles[id] && f.controles[id].v)) manq.push(id); }));
  const sansMotif = sectionsPour(f.type).flatMap(s => s.items).filter(([id]) => (f.controles[id] || {}).v === 'nok' && !(f.controles[id].c || '').trim()).map(([id]) => id);
  if (sansMotif.length) m.push({ msg: `${sansMotif.length} réponse(s) « Non » à préciser`, sel: `.ctrl[data-id="${sansMotif[0]}"]`, ids: sansMotif });
  if (manq.length) m.push({ msg: `${manq.length} point(s) de contrôle non renseigné(s)`, sel: `.ctrl[data-id="${manq[0]}"]`, ids: manq });
  req(f.dechets, 'Déchets rapportés : oui / non', '#segDechets');
  if (f.dechets === 'non') req(f.dechetsComment.trim(), 'Explication sur les déchets non rapportés', '#f-dechets');
  req(f.reception, 'Réception : sans réserve / avec réserves', '#segRecep');
  if (f.reception === 'avec') req(f.reserves.trim(), 'Description des réserves', '#f-reserves');
  req(f.sigPoseur, 'Signature du poseur', '#sigPoseurBox');
  if (f.clientAbsent) req(f.clientAbsentMotif.trim(), 'Motif de non-signature du client', '#f-absmotif');
  else { req(f.clientSignNom.trim(), 'Nom du signataire client', '#f-cnom'); req(f.sigClient, 'Signature du client', '#sigClientBox'); }
  return m;
}
$('#btnValider').addEventListener('click', async () => {
  const m = controler(cur);
  $$('.manque').forEach(x => x.classList.remove('manque'));
  if (m.length) {
    m.forEach(x => { if (x.ids) x.ids.forEach(id => $(`.ctrl[data-id="${id}"]`)?.classList.add('manque')); else $(x.sel)?.classList.add('manque'); });
    modal(`<h3>Fiche incomplète</h3><p>Merci de compléter :</p><ul>${m.map(x => `<li>${esc(x.msg)}</li>`).join('')}</ul>
      <button class="btn plein" id="mOk">Compléter</button>`);
    $('#mOk').onclick = () => { fermerModal(); const el = $(m[0].sel); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    return;
  }
  const nc = Object.values(cur.controles).filter(c => c.v === 'nok').length;
  let txt = 'Une fois validée, la fiche ne pourra plus être modifiée.';
  if (nc && cur.reception === 'sans') txt = `Attention : ${nc} réponse(s) « Non » mais réception « sans réserve ». ` + txt;
  if (!cur.photos.length) txt = 'Aucune photo n’a été prise. ' + txt;
  if (!await confirmer('Valider la fiche ?', txt, 'Valider')) return;
  clearTimeout(saveT);
  cur.statut = 'validee'; cur.validatedAt = new Date().toISOString(); cur.updatedAt = cur.validatedAt;
  await DB.put(cur);
  const fiche = cur;
  chargerFormulaire(nouvelleFiche()); localStorage.removeItem('fc_cur');
  ouvrirEnvoi(fiche, true);
});
$('#btnAbandon').addEventListener('click', async () => {
  if (!await confirmer('Supprimer ce brouillon ?', 'Toutes les informations saisies sur cette fiche seront perdues.', 'Supprimer')) return;
  clearTimeout(saveT); await DB.del(cur.id); localStorage.removeItem('fc_cur');
  chargerFormulaire(nouvelleFiche()); window.scrollTo(0, 0); toast('Brouillon supprimé');
});

/* ================= RAPPORT PDF ================= */
const pdfTxt = s => String(s ?? '').replace(/[‘’ʼ]/g, "'").replace(/[“”«»]/g, '"')
  .replace(/[–—]/g, '-').replace(/…/g, '...').replace(/œ/g, 'oe').replace(/Œ/g, 'OE')
  .replace(/€/g, 'EUR').replace(/ | /g, ' ').replace(/[^\x00-\xFF]/g, '');
function nomPdf(f) {
  const s = x => pdfTxt(x).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
  return `FinChantier_${s(f.affaire)}_${s(f.client)}_${(f.dateFin || '').replace(/-/g, '')}.pdf`;
}
function construirePdf(f) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297, M = 14, CW = W - 2 * M;
  const NUIT = [31, 30, 65], MARINE = [47, 59, 127], CYAN = [91, 181, 204], BRUME = [229, 243, 251], SUB = [86, 96, 122];
  const VERT = [30, 142, 90], ROUGE = [192, 57, 43], GRIS = [122, 133, 151];
  let y = 0;
  const T = (t, x, yy, o) => doc.text(pdfTxt(t), x, yy, o);
  const font = (st = 'normal', sz = 10, col = NUIT) => { doc.setFont('helvetica', st); doc.setFontSize(sz); doc.setTextColor(...col); };
  const place = h => { if (y + h > H - 16) { doc.addPage(); y = 16; } };
  const titre = t => {
    place(16); y += 3;
    doc.setFillColor(...BRUME); doc.rect(M, y, CW, 8, 'F'); doc.setFillColor(...MARINE); doc.rect(M, y, 1.6, 8, 'F');
    font('bold', 11, MARINE); T(t.toUpperCase(), M + 4, y + 5.6); y += 11;
  };
  const kv = (rows, cols = 2) => {
    const cw = CW / cols;
    for (let i = 0; i < rows.length; i += cols) {
      const ligne = rows.slice(i, i + cols);
      const hs = ligne.map(([, v]) => doc.setFontSize(10) && doc.splitTextToSize(pdfTxt(v || '—'), cw - 4).length);
      const h = 5 + Math.max(...hs) * 4.4; place(h);
      ligne.forEach(([k, v], j) => {
        const x = M + j * cw;
        font('normal', 8, SUB); T(k, x, y + 3);
        font('normal', 10); T(doc.splitTextToSize(pdfTxt(v || '—'), cw - 4), x, y + 7.4);
      });
      y += h + 1.5;
    }
  };
  const para = (t, sz = 10) => {
    font('normal', sz); const l = doc.splitTextToSize(pdfTxt(t), CW);
    l.forEach(s => { place(5); T(s, M, y + 3.5); y += 4.6; }); y += 1;
  };

  /* En-tête */
  doc.setFillColor(...NUIT); doc.rect(0, 0, W, 30, 'F'); doc.setFillColor(...CYAN); doc.rect(0, 30, W, 1.4, 'F');
  font('bold', 22, [255, 255, 255]); T('CI', M, 14); const wCI = doc.getTextWidth('CI'); doc.setTextColor(...CYAN); T('DI', M + wCI, 14);
  font('normal', 13, [255, 255, 255]); T('Rapport de fin de chantier', M, 22);
  font('bold', 11, [255, 255, 255]); T(LIB_TYPE[f.type] || '', W - M, 12, { align: 'right' });
  font('normal', 9, [213, 237, 247]); T('N° ' + f.numero, W - M, 18, { align: 'right' }); T('Validé le ' + fmtDT(f.validatedAt), W - M, 23, { align: 'right' });
  y = 38;

  /* Synthèse */
  const nbNc = idsType(f).filter(id => (f.controles[id] || {}).v === 'nok').length;
  const pastilles = [
    [f.reception === 'sans' ? 'SANS RÉSERVE' : 'AVEC RÉSERVES', f.reception === 'sans' ? VERT : ROUGE],
    [signeClient(f) ? 'SIGNÉ PAR LE CLIENT' : 'NON SIGNÉ PAR LE CLIENT', signeClient(f) ? VERT : ROUGE],
    [nbNc ? `${nbNc} RÉPONSE(S) NON` : 'TOUS LES POINTS À OUI', nbNc ? ROUGE : VERT]
  ];
  const pw = (CW - 6) / 3;
  pastilles.forEach(([t, col], i) => {
    const x = M + i * (pw + 3); doc.setFillColor(...col); doc.roundedRect(x, y, pw, 9, 1.5, 1.5, 'F');
    font('bold', 8.5, [255, 255, 255]); T(t, x + pw / 2, y + 5.9, { align: 'center' });
  });
  y += 13;

  titre('Intervention');
  kv([['N° d\'affaire', f.affaire], ['Client', f.client], ['Adresse du chantier', f.adresse], ['Contact sur site', f.contact],
      ['Date de début', fmtD(f.dateDebut)], ['Date de fin', fmtD(f.dateFin)]]);

  titre('Équipe et temps passé');
  kv([['Poseur responsable', f.poseurNom], ['Statut', f.poseurStatut === 'independant' ? `Indépendant - ${f.poseurSociete}` : 'Interne CIDI'],
      ['Autres poseurs', f.autresPoseurs], ['Nombre de poseurs', String(num(f.nbPoseurs))],
      ['Heures sur site / pers.', fmtH(num(f.heuresSite))], ['TEMPS TOTAL PASSÉ', fmtH(totalHeures(f))]]);

  titre('Points de contrôle');
  sectionsPour(f.type).forEach(s => {
    place(9); font('bold', 9.5, [21, 84, 127]); T(s.titre, M, y + 3.5); y += 5.5;
    s.items.forEach(([id, t]) => {
      const c = f.controles[id] || {}; font('normal', 9.5);
      const l = doc.splitTextToSize(pdfTxt(t), CW - 22);
      const lc = c.v === 'nok' && c.c ? doc.splitTextToSize(pdfTxt('-> ' + c.c), CW - 26) : [];
      const h = l.length * 4.2 + lc.length * 4 + 2.6; place(h);
      T(l, M + 2, y + 3.4);
      if (lc.length) { font('italic', 9, ROUGE); T(lc, M + 6, y + 3.4 + l.length * 4.2); }
      const col = c.v === 'ok' ? VERT : c.v === 'nok' ? ROUGE : GRIS;
      doc.setFillColor(...col); doc.roundedRect(W - M - 16, y + 0.2, 16, 5, 1, 1, 'F');
      font('bold', 8, [255, 255, 255]); T(LIB_VAL[c.v] || '-', W - M - 8, y + 3.6, { align: 'center' });
      y += h; doc.setDrawColor(229, 243, 251); doc.line(M, y - 0.8, W - M, y - 0.8);
    });
    y += 1.5;
  });

  titre('Déchets de chantier');
  kv([['Déchets rapportés', LIB_DECHETS[f.dechets]], ['Précision', f.dechets === 'non' ? f.dechetsComment : '—']]);

  titre('Réception et réserves');
  place(12); const col = f.reception === 'sans' ? VERT : ROUGE;
  doc.setDrawColor(...col); doc.setLineWidth(0.6); doc.roundedRect(M, y, CW, 8, 1.5, 1.5, 'S'); doc.setLineWidth(0.2);
  font('bold', 10.5, col); T(f.reception === 'sans' ? 'Réception prononcée SANS RÉSERVE' : 'Réception prononcée AVEC RÉSERVES', M + 4, y + 5.4); y += 11;
  if (f.reception === 'avec') { font('bold', 8, SUB); place(5); T('Réserves', M, y + 2.5); y += 4; para(f.reserves); }
  if (f.observations && f.observations.trim()) { font('bold', 8, SUB); place(5); T('Observations', M, y + 2.5); y += 4; para(f.observations); }

  if (f.photos.length) {
    titre(`Photos (${f.photos.length})`);
    const bw = (CW - 6) / 2, bh = 66;
    for (let i = 0; i < f.photos.length; i += 2) {
      place(bh + 7);
      f.photos.slice(i, i + 2).forEach((p, j) => {
        const r = Math.min(bw / p.w, bh / p.h), w = p.w * r, h = p.h * r;
        const x = M + j * (bw + 6) + (bw - w) / 2;
        doc.setFillColor(...BRUME); doc.rect(M + j * (bw + 6), y, bw, bh, 'F');
        try { doc.addImage(p.data, 'JPEG', x, y + (bh - h) / 2, w, h, undefined, 'FAST'); } catch (e) {}
        font('normal', 7.5, SUB); T(`Photo ${i + j + 1} - ${fmtDT(p.at)}`, M + j * (bw + 6), y + bh + 3.5);
      });
      y += bh + 7;
    }
  }

  titre('Signatures');
  place(52);
  const sw = (CW - 6) / 2;
  const bloc = (x, lib, nom, fct, img, autre) => {
    doc.setDrawColor(153, 189, 210); doc.roundedRect(x, y, sw, 46, 1.5, 1.5, 'S');
    font('bold', 9, MARINE); T(lib, x + 3, y + 5);
    font('normal', 9); T(doc.splitTextToSize(pdfTxt([nom, fct].filter(Boolean).join(' - ') || '—'), sw - 6)[0], x + 3, y + 10);
    if (img) { try { const pr = doc.getImageProperties(img), r = Math.min((sw - 6) / pr.width, 32 / pr.height); doc.addImage(img, 'PNG', x + 3, y + 12, pr.width * r, pr.height * r); } catch (e) {} }
    else if (autre) { font('italic', 9, ROUGE); T(doc.splitTextToSize(pdfTxt(autre), sw - 6), x + 3, y + 20); }
  };
  bloc(M, 'Le poseur', f.poseurNom, f.poseurStatut === 'independant' ? f.poseurSociete : 'CIDI', f.sigPoseur);
  bloc(M + sw + 6, 'Le client', f.clientSignNom, f.clientSignFonction, f.clientAbsent ? '' : f.sigClient,
       f.clientAbsent ? 'Le client n\'a pas signé. Motif : ' + f.clientAbsentMotif : '');
  y += 50;
  font('italic', 8, SUB); place(6);
  T('En signant, le client reconnaît l\'achèvement des travaux décrits dans ce rapport, sous réserve des points mentionnés.', M, y + 2);

  /* Pied de page */
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setDrawColor(153, 189, 210); doc.line(M, H - 11, W - M, H - 11);
    font('normal', 7.5, SUB);
    T(`CIDI - Processus R5 Pose - Fiche de fin de chantier - ${f.numero} - Affaire ${f.affaire}`, M, H - 7);
    T(`Page ${i}/${n}`, W - M, H - 7, { align: 'right' });
  }
  return doc.output('blob');
}

/* ================= ENVOI ================= */
function telecharger(blob, nom) {
  const u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 60000);
}
function objetMail(f) { return `Fin de chantier - Affaire ${f.affaire} - ${f.client} - ${LIB_TYPE[f.type]} du ${fmtD(f.dateFin)}`; }
function corpsMail(f) {
  return `Bonjour,\n\nVeuillez trouver ci-joint le rapport de fin de chantier.\n\n` +
    `Affaire : ${f.affaire}\nClient : ${f.client}\nAdresse : ${f.adresse}\nIntervention : ${LIB_TYPE[f.type]} du ${fmtD(f.dateDebut)} au ${fmtD(f.dateFin)}\n` +
    `Réception : ${f.reception === 'sans' ? 'sans réserve' : 'AVEC RÉSERVES'}\nSigné par le client : ${signeClient(f) ? 'oui' : 'NON'}\n` +
    `Déchets : ${LIB_DECHETS[f.dechets]}\nTemps total : ${fmtH(totalHeures(f))}\n\n${f.poseurNom}`;
}
async function marquerEnvoye(f, via) {
  f.envoye = true; f.envoyeAt = new Date().toISOString(); f.envoyeVia = via; await DB.put(f);
}
function ouvrirEnvoi(f, apresValidation) {
  let blob;
  try { blob = construirePdf(f); } catch (e) { console.error(e); modal(`<h3>Erreur</h3><p>Le rapport n'a pas pu être généré : ${esc(e.message)}</p><button class="btn plein" onclick="fermerModal()">Fermer</button>`); return; }
  const nom = nomPdf(f), file = new File([blob], nom, { type: 'application/pdf' });
  const peutPartager = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  const ko = Math.round(blob.size / 1024);
  modal(`<h3>${apresValidation ? '✓ Fiche validée' : 'Rapport de fin de chantier'}</h3>
    <p>${esc(f.affaire)} · ${esc(f.client)}<br>Rapport PDF prêt (${ko.toLocaleString('fr-FR')} Ko).</p>
    ${REG.dest ? `<div class="bandeau info">À envoyer à : <b>${esc(REG.dest)}</b><br>L'adresse est copiée : collez-la dans le champ « À ».</div>` :
      `<div class="bandeau warn">Aucune adresse de destination n'est réglée (onglet Réglages).</div>`}
    ${navigator.onLine ? '' : `<div class="bandeau warn">Pas de réseau : le message partira de votre messagerie dès le retour de la connexion.</div>`}
    <div style="display:grid;gap:8px">
      <button class="btn plein" id="mShare">${peutPartager ? 'Envoyer le rapport' : 'Envoyer par e-mail'}</button>
      <button class="btn sec plein" id="mDl">Télécharger le PDF</button>
      <button class="btn sec plein" id="mClose">${apresValidation ? 'Plus tard' : 'Fermer'}</button>
    </div>`);
  const copier = () => { if (REG.dest && navigator.clipboard) navigator.clipboard.writeText(REG.dest).catch(() => {}); };
  $('#mShare').onclick = async () => {
    copier();
    if (peutPartager) {
      try {
        await navigator.share({ files: [file], title: objetMail(f), text: corpsMail(f) });
        await marquerEnvoye(f, 'partage'); fermerModal(); toast('Rapport envoyé ✓'); rafraichir();
      } catch (e) { if (e.name !== 'AbortError') { toast('Partage impossible, le PDF est téléchargé'); telecharger(blob, nom); } }
    } else {
      telecharger(blob, nom);
      setTimeout(() => { location.href = `mailto:${encodeURIComponent(REG.dest).replace(/%2C/g, ',').replace(/%40/g, '@')}?subject=${encodeURIComponent(objetMail(f))}&body=${encodeURIComponent(corpsMail(f) + '\n\n(Joindre le PDF téléchargé : ' + nom + ')')}`; }, 600);
      await marquerEnvoye(f, 'e-mail'); fermerModal(); toast('Joignez le PDF téléchargé au message'); rafraichir();
    }
  };
  $('#mDl').onclick = () => telecharger(blob, nom);
  $('#mClose').onclick = () => { fermerModal(); rafraichir(); };
}

/* ================= HISTORIQUE ================= */
let filtreH = 'tout';
$('#filtresHisto').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; filtreH = b.dataset.f;
  $$('#filtresHisto button').forEach(x => x.classList.toggle('on', x === b)); rendreHisto();
});
$('#recherche').addEventListener('input', () => rendreHisto());
async function rendreHisto() {
  const q = $('#recherche').value.trim().toLowerCase();
  let l = (await DB.all()).filter(f => f.id !== cur.id || f.statut === 'validee');
  l.sort((a, b) => (b.validatedAt || b.updatedAt).localeCompare(a.validatedAt || a.updatedAt));
  const nbBr = l.filter(f => f.statut === 'brouillon').length;
  l = l.filter(f => {
    if (filtreH === 'brouillon' && f.statut !== 'brouillon') return false;
    if (filtreH === 'nonsigne' && (f.statut !== 'validee' || signeClient(f))) return false;
    if (filtreH === 'reserves' && (f.statut !== 'validee' || f.reception !== 'avec')) return false;
    if (filtreH === 'nonenvoye' && (f.statut !== 'validee' || f.envoye)) return false;
    if (q && ![f.affaire, f.client, f.adresse, f.poseurNom, f.numero].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });
  $('#listeHisto').innerHTML =
    `<button class="btn plein" id="btnNouvelle" style="margin-bottom:12px">+ Nouvelle fiche</button>` +
    (nbBr && filtreH === 'tout' ? `<div class="bandeau warn">${nbBr} brouillon(s) en attente.</div>` : '') +
    (l.length ? l.map(f => {
      const v = f.statut === 'validee';
      const b = v ? [
        signeClient(f) ? '<span class="bdg ok">Signée client</span>' : '<span class="bdg nok">Non signée client</span>',
        f.reception === 'avec' ? '<span class="bdg warn">Réserves</span>' : '<span class="bdg ok">Sans réserve</span>',
        f.envoye ? '<span class="bdg">Envoyé</span>' : '<span class="bdg nok">Non envoyé</span>'
      ] : ['<span class="bdg gris">Brouillon</span>'];
      return `<div class="item" data-id="${f.id}"><div class="corps">
        <div class="t">${esc(f.affaire || 'Sans n° d\'affaire')} · ${esc(f.client || '—')}</div>
        <div class="s">${esc(LIB_TYPE[f.type] || 'Type ?')} · ${fmtD(f.dateFin)} · ${esc(f.poseurNom || '—')}</div>
        <div class="badges">${b.join('')}</div></div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#99BDD2" stroke-width="2.4"><path d="m9 6 6 6-6 6"/></svg></div>`;
    }).join('') : `<div class="vide">Aucune fiche${q || filtreH !== 'tout' ? ' pour ce filtre' : ' pour le moment'}.</div>`);
}
$('#listeHisto').addEventListener('click', async e => {
  if (e.target.id === 'btnNouvelle') { await nouvelle(); return; }
  const it = e.target.closest('.item'); if (!it) return;
  const f = await DB.get(it.dataset.id); if (!f) return;
  if (f.statut === 'brouillon') { await reprendre(f); return; }
  afficherDetail(f);
});
async function nouvelle() {
  clearTimeout(saveT);
  const vide = !cur.affaire && !cur.client && !cur.opPose && !cur.opDepose && !cur.photos.length;
  if (!vide) { cur.updatedAt = new Date().toISOString(); await DB.put(cur); }
  else await DB.del(cur.id);
  chargerFormulaire(nouvelleFiche()); afficher('v-fiche'); window.scrollTo(0, 0);
  if (!vide) toast('Le brouillon précédent reste dans l’historique');
}
async function reprendre(f) {
  clearTimeout(saveT);
  if (f.id !== cur.id) {
    const vide = !cur.affaire && !cur.client && !cur.opPose && !cur.opDepose && !cur.photos.length;
    if (vide) await DB.del(cur.id); else { cur.updatedAt = new Date().toISOString(); await DB.put(cur); }
  }
  chargerFormulaire(f); localStorage.setItem('fc_cur', f.id); afficher('v-fiche'); window.scrollTo(0, 0);
}

/* ---------- détail d'une fiche validée ---------- */
function afficherDetail(f) {
  const secs = sectionsPour(f.type);
  const nc = secs.flatMap(s => s.items).filter(([id]) => (f.controles[id] || {}).v === 'nok');
  $('#v-detail').innerHTML = `
    <button class="lien" id="dRetour" style="margin-bottom:8px">‹ Retour à l'historique</button>
    <div class="carte">
      <h2>${esc(f.affaire)} · ${esc(f.client)}</h2>
      <div class="badges" style="margin-bottom:6px">
        <span class="bdg">${esc(LIB_TYPE[f.type])}</span>
        ${signeClient(f) ? '<span class="bdg ok">Signée client</span>' : '<span class="bdg nok">Non signée client</span>'}
        ${f.reception === 'avec' ? '<span class="bdg warn">Avec réserves</span>' : '<span class="bdg ok">Sans réserve</span>'}
        ${f.envoye ? `<span class="bdg">Envoyé le ${fmtDT(f.envoyeAt)}</span>` : '<span class="bdg nok">Rapport non envoyé</span>'}
      </div>
      <dl class="recap">
        <dt>N° de fiche</dt><dd>${esc(f.numero)} · validée le ${fmtDT(f.validatedAt)}</dd>
        <dt>Adresse</dt><dd>${esc(f.adresse)}</dd>
        <dt>Dates</dt><dd>du ${fmtD(f.dateDebut)} au ${fmtD(f.dateFin)}</dd>
        <dt>Poseur</dt><dd>${esc(f.poseurNom)} (${f.poseurStatut === 'independant' ? 'indépendant – ' + esc(f.poseurSociete) : 'interne'})${f.autresPoseurs ? '\nAvec : ' + esc(f.autresPoseurs) : ''}</dd>
        <dt>Temps passé</dt><dd>${fmtH(totalHeures(f))} (${num(f.nbPoseurs)} pers. × ${fmtH(num(f.heuresSite))})</dd>
        <dt>Points répondus « Non »</dt><dd>${nc.length ? nc.map(([id, t]) => '• ' + esc(t) + (f.controles[id].c ? ' → ' + esc(f.controles[id].c) : '')).join('\n') : 'Aucun'}</dd>
        <dt>Déchets</dt><dd>${esc(LIB_DECHETS[f.dechets])}${f.dechets === 'non' ? ' – ' + esc(f.dechetsComment) : ''}</dd>
        ${f.reception === 'avec' ? `<dt>Réserves</dt><dd>${esc(f.reserves)}</dd>` : ''}
        ${f.observations ? `<dt>Observations</dt><dd>${esc(f.observations)}</dd>` : ''}
        <dt>Signature client</dt><dd>${f.clientAbsent ? 'Non signée – ' + esc(f.clientAbsentMotif) : esc(f.clientSignNom) + (f.clientSignFonction ? ', ' + esc(f.clientSignFonction) : '') + `<br><img class="sigimg" src="${f.sigClient}" alt="">`}</dd>
      </dl>
      ${f.photos.length ? `<div class="photos">${f.photos.map(p => `<div class="ph"><img src="${p.data}" alt=""></div>`).join('')}</div>` : ''}
    </div>
    <div style="display:grid;gap:8px">
      <button class="btn plein" id="dEnvoyer">${f.envoye ? 'Renvoyer le rapport' : 'Envoyer le rapport'}</button>
      <button class="btn rouge plein" id="dSuppr">Supprimer la fiche</button>
    </div>`;
  afficher('v-detail', false); window.scrollTo(0, 0);
  $('#dRetour').onclick = () => afficher('v-histo');
  $('#dEnvoyer').onclick = () => ouvrirEnvoi(f, false);
  $('#dSuppr').onclick = async () => {
    if (!await confirmer('Supprimer cette fiche validée ?', 'Elle disparaîtra de l’historique et des indicateurs de ce téléphone. Vérifiez que le rapport a bien été envoyé.', 'Supprimer')) return;
    await DB.del(f.id); toast('Fiche supprimée'); afficher('v-histo');
  };
}

/* ================= INDICATEURS ================= */
let periode = 'mois';
$('#filtresKpi').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; periode = b.dataset.p;
  $$('#filtresKpi button').forEach(x => x.classList.toggle('on', x === b)); rendreKpi();
});
function debutPeriode(p) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (p === 'mois') return new Date(d.getFullYear(), d.getMonth(), 1);
  if (p === '3m') return new Date(d.getFullYear(), d.getMonth() - 2, 1);
  if (p === 'annee') return new Date(d.getFullYear(), 0, 1);
  if (p === '12m') return new Date(d.getFullYear(), d.getMonth() - 11, 1);
  return new Date(2000, 0, 1);
}
const pct = (a, b) => b ? Math.round(a * 100 / b) : null;
async function rendreKpi() {
  const toutes = (await DB.all()).filter(f => f.statut === 'validee');
  const deb = debutPeriode(periode), isoDeb = `${deb.getFullYear()}-${String(deb.getMonth() + 1).padStart(2, '0')}-01`;
  const l = toutes.filter(f => (f.dateFin || '') >= isoDeb);
  const n = l.length, sg = l.filter(signeClient).length, sr = l.filter(f => f.reception === 'sans').length;
  const dech = l.filter(f => f.dechets !== 'aucun'), dechOk = dech.filter(f => f.dechets === 'oui').length;
  const env = l.filter(f => f.envoye).length, h = l.reduce((s, f) => s + totalHeures(f), 0);
  const pS = pct(sg, n), obj = num(REG.objectif) || 0;
  const cpt = { pose: 0, depose: 0, pose_depose: 0 }; l.forEach(f => cpt[f.type] = (cpt[f.type] || 0) + 1);
  const ncs = {}; l.forEach(f => idsType(f).forEach(id => { if ((f.controles[id] || {}).v === 'nok') ncs[id] = (ncs[id] || 0) + 1; }));
  const topNc = Object.entries(ncs).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const now = new Date(), mois = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1), k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const lm = toutes.filter(f => (f.dateFin || '').startsWith(k));
    mois.push({ lib: d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''), n: lm.length, s: lm.filter(signeClient).length });
  }
  const max = Math.max(1, ...mois.map(m => m.n));
  const coulObj = pS === null ? '' : pS >= obj ? 'color:#8EE0B5' : 'color:#F5B7B1';
  $('#zoneKpi').innerHTML = !n && !toutes.length ? `<div class="vide">Aucune fiche validée pour le moment.<br>Les indicateurs apparaîtront après la première fin de chantier.</div>` : `
    <div class="kpis">
      <div class="kpi grand"><div class="v">${pS === null ? '—' : pS + ' %'}</div>
        <div class="lb">Chantiers signés par le client (${sg} / ${n})</div>
        <div class="jauge"><i style="width:${pS || 0}%"></i></div>
        <div class="obj" style="${coulObj}">Objectif : ${obj} %${pS === null ? '' : pS >= obj ? ' · atteint' : ' · non atteint'}</div></div>
      <div class="kpi"><div class="v">${n}</div><div class="lb">Fins de chantier validées</div></div>
      <div class="kpi"><div class="v">${pct(sr, n) ?? '—'}${n ? ' %' : ''}</div><div class="lb">Réceptions sans réserve</div></div>
      <div class="kpi"><div class="v">${pct(dechOk, dech.length) ?? '—'}${dech.length ? ' %' : ''}</div><div class="lb">Déchets rapportés</div></div>
      <div class="kpi"><div class="v">${pct(env, n) ?? '—'}${n ? ' %' : ''}</div><div class="lb">Rapports envoyés</div></div>
      <div class="kpi"><div class="v" style="font-size:24px">${fmtH(h)}</div><div class="lb">Temps total passé</div></div>
      <div class="kpi"><div class="v" style="font-size:16px;line-height:1.5">Pose ${cpt.pose}<br>Dépose ${cpt.depose}<br>Pose + dépose ${cpt.pose_depose}</div></div>
    </div>
    <div class="carte"><h2>Fins de chantier sur 12 mois</h2>
      <div class="histo">${mois.map(m => `<div class="col"><div class="nb">${m.n || ''}</div>
        <div class="barre" style="height:${m.n / max * 120}px"><div class="sg" style="flex:${m.s}"></div><div class="ns" style="flex:${m.n - m.s}"></div></div>
        <div class="m">${m.lib}</div></div>`).join('')}</div>
      <div class="legende"><span><i style="background:#2F3B80"></i>Signées client</span><span><i style="background:#99BDD2"></i>Non signées</span></div>
    </div>
    <div class="carte"><h2>Points le plus souvent répondus « Non »</h2>
      ${topNc.length ? `<table class="t"><tr><th>Point de contrôle</th><th>Nb</th></tr>${topNc.map(([id, k]) => `<tr><td>${esc(LIB_CTRL[id])}</td><td><b>${k}</b></td></tr>`).join('')}</table>` : '<p class="etat" style="margin:0">Aucune réponse « Non » sur la période.</p>'}
    </div>
    <p class="etat">Indicateurs calculés sur les fiches de ce téléphone, selon la date de fin de chantier.</p>`;
}

/* ================= RÉGLAGES ================= */
function chargerReglages() {
  $('#r-dest').value = REG.dest; $('#r-nom').value = REG.nom; $('#r-soc').value = REG.societe; $('#r-obj').value = REG.objectif;
  majSeg('#segRStatut', REG.statut);
}
[['#r-dest', 'dest'], ['#r-nom', 'nom'], ['#r-soc', 'societe'], ['#r-obj', 'objectif']].forEach(([s, k]) =>
  $(s).addEventListener('input', e => { REG[k] = e.target.value.trim(); saveReg(); }));
$('#segRStatut').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; REG.statut = b.dataset.v; saveReg(); majSeg('#segRStatut', REG.statut); });

$('#btnCsv').addEventListener('click', async () => {
  const l = (await DB.all()).sort((a, b) => (a.dateFin || '').localeCompare(b.dateFin || ''));
  if (!l.length) { toast('Aucune fiche à exporter'); return; }
  const cols = ['N° fiche', 'Statut fiche', 'Type', "N° d'affaire", 'Client', 'Adresse', 'Contact', 'Date début', 'Date fin', 'Poseur', 'Statut poseur', 'Société',
    'Autres poseurs', 'Nb poseurs', 'H site / pers', 'Temps total (h)', 'Réponses Oui', 'Réponses Non', 'Points répondus Non',
    'Réception', 'Réserves', 'Déchets', 'Précision déchets', 'Nb photos', 'Signée client', 'Signataire client', 'Motif non signature', 'Rapport envoyé', 'Date validation', 'Observations'];
  const d = n => String(n).replace('.', ',');
  const rows = l.map(f => {
    const vs = sectionsPour(f.type).flatMap(s => s.items).map(([id]) => (f.controles[id] || {}).v);
    const nc = sectionsPour(f.type).flatMap(s => s.items).filter(([id]) => (f.controles[id] || {}).v === 'nok')
      .map(([id, t]) => t + (f.controles[id].c ? ' (' + f.controles[id].c + ')' : '')).join(' | ');
    return [f.numero, f.statut === 'validee' ? 'Validée' : 'Brouillon', LIB_TYPE[f.type] || '', f.affaire, f.client, f.adresse, f.contact, fmtD(f.dateDebut), fmtD(f.dateFin),
      f.poseurNom, f.poseurStatut === 'independant' ? 'Indépendant' : 'Interne', f.poseurSociete, f.autresPoseurs, d(num(f.nbPoseurs)), d(num(f.heuresSite)),
      d(totalHeures(f)), vs.filter(v => v === 'ok').length, vs.filter(v => v === 'nok').length, nc,
      f.reception === 'sans' ? 'Sans réserve' : f.reception === 'avec' ? 'Avec réserves' : '', f.reserves, LIB_DECHETS[f.dechets] || '', f.dechetsComment,
      f.photos.length, signeClient(f) ? 'Oui' : 'Non', f.clientSignNom, f.clientAbsent ? f.clientAbsentMotif : '', f.envoye ? 'Oui' : 'Non', fmtDT(f.validatedAt), f.observations];
  });
  const csv = '﻿' + [cols, ...rows].map(r => r.map(v => '"' + String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"').join(';')).join('\r\n');
  const nom = `FinsDeChantier_${(REG.nom || 'export').replace(/[^A-Za-z0-9]+/g, '-')}_${today()}.csv`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }), file = new File([blob], nom, { type: 'text/csv' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Export fins de chantier' }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  telecharger(blob, nom);
});
async function infoStockage() {
  const l = await DB.all();
  let t = `${l.filter(f => f.statut === 'validee').length} fiche(s) validée(s), ${l.filter(f => f.statut === 'brouillon').length} brouillon(s)`;
  if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); t += ` · ${Math.round(e.usage / 1048576)} Mo utilisés`; }
  $('#infoStockage').textContent = t;
}

/* ================= NAVIGATION ================= */
const TITRES = { 'v-fiche': 'Fin de chantier', 'v-histo': 'Historique', 'v-kpi': 'Indicateurs', 'v-reglages': 'Réglages', 'v-detail': 'Détail de la fiche' };
function afficher(v, top = true) {
  $$('.view').forEach(s => s.classList.toggle('on', s.id === v));
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v || (v === 'v-detail' && b.dataset.v === 'v-histo')));
  $('#hTitre').textContent = TITRES[v];
  if (top) window.scrollTo(0, 0);
  rafraichir(v);
}
function rafraichir(v) {
  v = v || ($('.view.on') || {}).id;
  if (v === 'v-histo') rendreHisto();
  if (v === 'v-kpi') rendreKpi();
  if (v === 'v-reglages') { chargerReglages(); infoStockage(); }
  if (v === 'v-fiche') setTimeout(() => Object.values(pads).forEach(p => p.resize()), 30);
}
$('#nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) afficher(b.dataset.v); });

function majReseau() { const on = navigator.onLine; $('#net').textContent = on ? 'En ligne' : 'Hors ligne'; $('#net').classList.toggle('off', !on); }
window.addEventListener('online', majReseau); window.addEventListener('offline', majReseau);

/* ================= DÉMARRAGE ================= */
(async function init() {
  majReseau();
  const id = localStorage.getItem('fc_cur');
  let f = id ? await DB.get(id) : null;
  if (!f || f.statut !== 'brouillon') f = nouvelleFiche();
  chargerFormulaire(f);
  if (!REG.nom) setTimeout(() => toast('Astuce : renseignez votre nom dans Réglages', 3500), 800);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
