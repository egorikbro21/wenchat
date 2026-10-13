const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.static('public'));

const DATA_FILE = '/app/data/data.json';
const UPLOADS_DIR = '/app/data/uploads';
const AUDIO_DIR = '/app/data/audio';

try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch(e){}
try { fs.mkdirSync(AUDIO_DIR, { recursive: true }); } catch(e){}

app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/audio', express.static(AUDIO_DIR));

let DB = {
  users: {}, chats: {}, groups: {}, channels: {}, games: {},
  tokens: {}, pushSubs: {},
  nextId: 1, nextChannelId: 1, nextFileId: 1, nextGameId: 1
};

function loadDB(){
  try {
    if(fs.existsSync(DATA_FILE)){
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      DB = parsed;
      DB.users = DB.users || {};
      DB.chats = DB.chats || {};
      DB.groups = DB.groups || {};
      DB.channels = DB.channels || {};
      DB.games = DB.games || {};
      DB.tokens = DB.tokens || {};
      DB.pushSubs = DB.pushSubs || {};
      DB.nextId = DB.nextId || 1;
      DB.nextChannelId = DB.nextChannelId || 1;
      DB.nextFileId = DB.nextFileId || 1;
      DB.nextGameId = DB.nextGameId || 1;
      console.log('DB loaded from', DATA_FILE);
    } else {
      console.log('No DB file yet, starting fresh');
    }
  } catch(e){ console.log('loadDB err', e.message); }
}
function saveDB(){
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(DB));
  } catch(e){ console.log('saveDB err', e.message); }
}
loadDB();

const DEV_CODE = "Wendrt-Super-Secret-Dev-Code-2025-Xyz!";
const ADMIN_NICK = "Wendrt";
const BOT_ID = '999999';
const BOT_NICK = 'Wenbot';

function genId(){ const id = String(DB.nextId).padStart(6,'0'); DB.nextId++; return id; }
function genChannelId(){ const id = String(DB.nextChannelId).padStart(6,'0'); DB.nextChannelId++; return id; }
function genFileId(){ const id = String(DB.nextFileId).padStart(8,'0'); DB.nextFileId++; return id; }
function genGameId(){ const id = 'gm' + Date.now() + Math.floor(Math.random()*1000); return id; }
function findUserById(id){ for(const k in DB.users) if(DB.users[k].id === id) return DB.users[k]; return null; }
function findChannelById(id){ for(const k in DB.channels) if(DB.channels[k].channelId === id) return DB.channels[k]; return null; }
function chatKey(a,b){ return 'p:' + [a,b].sort().join('|'); }
function groupKey(gid){ return 'g:' + gid; }
function channelKey(cid){ return 'c:' + cid; }

function makeToken(nick){
  const t = Math.random().toString(36).slice(2) + Date.now().toString(36);
  DB.tokens = DB.tokens || {};
  DB.tokens[t] = nick;
  saveDB();
  return t;
}
function auth(req, res, next){
  const t = req.headers['x-token'];
  DB.tokens = DB.tokens || {};
  if(!t || !DB.tokens[t]) return res.json({ error: 'Не авторизован' });
  req.nick = DB.tokens[t];
  next();
}

function publicUser(u){
  return {
    nick: u.nick, id: u.id, coins: u.coins,
    isAdmin: !!u.isAdmin, color: u.color || null,
    badge: u.badge || null, avatar: u.avatar || null,
    theme: u.theme || null,
    banned: !!u.banned, banReason: u.banReason || null,
    purchases: u.purchases || [],
    removedItems: u.removedItems || [],
    contacts: u.contacts || [],
    channels: u.channels || [],
    isBot: !!u.isBot, status: u.status || 'online', bio: u.bio || ''
  };
}

function ensureBot(){
  if(!DB.users[BOT_NICK]){
    DB.users[BOT_NICK] = {
      nick: BOT_NICK, pass: 'bot_' + Math.random().toString(36).slice(2),
      id: BOT_ID, coins: 0, isAdmin: false,
      color: '#a855f7', badge: '🤖', avatar: '🤖', theme: null,
      banned: false, banReason: null,
      purchases: [], contacts: [], removedItems: [], channels: [],
      isBot: true, status: 'online', bio: 'Я Wenbot, помогу чем смогу!'
    };
    saveDB();
  }
}
ensureBot();

function saveBase64File(base64Data, type){
  try {
    var match = base64Data.match(/^data:([^;]+);base64,(.+)$/);
    if(!match) return null;
    var mime = match[1], data = match[2];
    var buffer = Buffer.from(data, 'base64');
    var ext = 'bin';
    if(mime.indexOf('image/jpeg') !== -1) ext = 'jpg';
    else if(mime.indexOf('image/png') !== -1) ext = 'png';
    else if(mime.indexOf('image/gif') !== -1) ext = 'gif';
    else if(mime.indexOf('image/webp') !== -1) ext = 'webp';
    else if(mime.indexOf('audio/webm') !== -1) ext = 'webm';
    else if(mime.indexOf('audio/mp4') !== -1) ext = 'm4a';
    else if(mime.indexOf('audio/ogg') !== -1) ext = 'ogg';
    else if(mime.indexOf('audio/mpeg') !== -1) ext = 'mp3';
    var fileName = genFileId() + '.' + ext;
    var dir = (type === 'audio') ? AUDIO_DIR : UPLOADS_DIR;
    var urlPrefix = (type === 'audio') ? '/audio/' : '/uploads/';
    fs.writeFileSync(path.join(dir, fileName), buffer);
    saveDB();
    return urlPrefix + fileName;
  } catch(e){ console.log('saveBase64File err', e.message); return null; }
}

function extractFileUrl(text){
  if(!text) return null;
  var m1 = text.match(/^\[img\](\/uploads\/[^\[]+)\[\/img\]$/); if(m1) return m1[1];
  var m2 = text.match(/^\[audio\](\/audio\/[^\[]+)\[\/audio\]$/); if(m2) return m2[1];
  return null;
}
function isFileUsed(fileUrl){
  var re = new RegExp(fileUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  for(var k in DB.chats){
    var msgs = DB.chats[k];
    for(var i=0;i<msgs.length;i++) if(msgs[i].text && re.test(msgs[i].text)) return true;
  }
  return false;
}
function deleteFileIfUnused(fileUrl){
  if(!fileUrl) return false;
  var fileName = fileUrl.split('/').pop();
  if(!fileName) return false;
  if(isFileUsed(fileUrl)) return false;
  var filePath = null;
  if(fileUrl.indexOf('/uploads/') === 0) filePath = path.join(UPLOADS_DIR, fileName);
  else if(fileUrl.indexOf('/audio/') === 0) filePath = path.join(AUDIO_DIR, fileName);
  if(!filePath) return false;
  try { if(fs.existsSync(filePath)){ fs.unlinkSync(filePath); return true; } } catch(e){}
  return false;
}

/* ============ БОТ ============ */
function botReply(text){
  const t = (text || '').trim(), low = t.toLowerCase();
  if(low === '/help' || low === 'помощь' || low === 'help') return '🤖 Команды:\n/help, /ping, /id, /time, /date\n/calc 2+2, /random 1 100, /coin, /dice, /password 16\n/weather Москва, /wiki Россия\n/joke, /fact, /quote, /8ball, /love';
  if(low === '/ping') return '🏓 Понг!';
  if(low === '/id') return '🆔 ID в ⚙️ Настройки';
  if(low === '/time') return '🕐 ' + new Date().toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'});
  if(low === '/date') return '📅 ' + new Date().toLocaleDateString('ru-RU', {day:'numeric', month:'long', year:'numeric'});
  if(low.startsWith('/calc')){
    const expr = t.slice(5).trim();
    if(!expr) return '🧮 /calc 2+2';
    if(!/^[\d\s+\-*/().,%]+$/.test(expr)) return '⚠️ Только цифры и + - * / ( )';
    try { return '🧮 ' + expr + ' = ' + Function('"use strict";return (' + expr.replace(/,/g,'.') + ')')(); } catch(e){ return '⚠️ Не смог'; }
  }
  if(low.startsWith('/random')){
    const m = t.match(/(\d+)\s+(\d+)/);
    if(!m) return '🎲 /random 1 100';
    const a = parseInt(m[1]), b = parseInt(m[2]);
    if(a >= b) return '⚠️ Первое меньше второго';
    return '🎲 ' + (Math.floor(Math.random() * (b - a + 1)) + a);
  }
  if(low === '/coin') return Math.random() < 0.5 ? '🪙 Орёл!' : '🪙 Решка!';
  if(low === '/dice') return '🎲 ' + (Math.floor(Math.random()*6) + 1);
  if(low.startsWith('/password')){
    const m = t.match(/\d+/);
    const len = m ? Math.min(parseInt(m[0]), 64) : 16;
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let p = '';
    for(let i=0;i<len;i++) p += chars[Math.floor(Math.random()*chars.length)];
    return '🔐 Пароль (' + len + '):\n' + p;
  }
  if(low.startsWith('/weather')){
    const c = t.slice(8).trim();
    return c ? '🌤 Погода в ' + c + ':\n(скоро API)' : '🌤 /weather Москва';
  }
  if(low.startsWith('/wiki')){
    const q = t.slice(5).trim();
    return q ? '📚 ' + q + ':\n(скоро API)' : '📚 /wiki Россия';
  }
  if(low === '/joke'){
    const j = ['Oct 31 == Dec 25 🎃','Java ☕','F1! F1! 🆘','Ни одного, это hardware 💡'];
    return j[Math.floor(Math.random()*j.length)];
  }
  if(low === '/fact'){
    const f = ['🐙 У осьминога 3 сердца','🍯 Мёд не портится','🌍 Земля 107 000 км/ч','🐌 У улитки 25 000 зубов','🦈 Акулы старше деревьев'];
    return f[Math.floor(Math.random()*f.length)];
  }
  if(low === '/quote'){
    const q = ['«Не откладывай на завтра…» 😴','«Простота — высшая форма изящества»','«Код, который работает — не трогай»'];
    return q[Math.floor(Math.random()*q.length)];
  }
  if(low.startsWith('/8ball')){
    const q = t.slice(6).trim();
    if(!q) return '🔮 /8ball Вопрос?';
    const a = ['✅ Да','✅ Скорее да','🤔 Возможно','❌ Нет','🔮 Позже','✨ В твоих руках'];
    return '🔮 ' + a[Math.floor(Math.random()*a.length)];
  }
  if(low.startsWith('/love')){
    const p = t.slice(5).trim();
    if(!p) return '💖 /love Ты и Я';
    const h = p.split('').reduce(function(a,c){return a + c.charCodeAt(0);}, 0);
    const pct = (h * 7) % 101;
    return '💖 Совместимость: ' + pct + '%';
  }
  const d = ['Привет! /help 🤖','Попробуй /help 😊','/help для команд','Что-то не понял. /help?'];
  return d[Math.floor(Math.random()*d.length)];
}
function sendBotReply(userNick, text){
  const reply = botReply(text);
  const key = chatKey(BOT_NICK, userNick);
  if(!DB.chats[key]) DB.chats[key] = [];
  DB.chats[key].push({ from: BOT_NICK, text: reply, t: Date.now() });
  saveDB();
}

/* ============ РЕГИСТРАЦИЯ / ВХОД ============ */
app.post('/api/register', (req, res) => {
  const { nick, pass } = req.body || {};
  if(!nick || !pass) return res.json({ error: 'Заполни всё' });
  if(nick.length < 3) return res.json({ error: 'Ник минимум 3' });
  if(pass.length < 3) return res.json({ error: 'Пароль минимум 3' });
  if(DB.users[nick]) return res.json({ error: 'Ник занят' });
  const newId = genId();
  const isOwner = (nick === ADMIN_NICK) || (newId === '000003');
  DB.users[nick] = {
    nick, pass, id: newId, coins: 0, isAdmin: isOwner,
    color: isOwner ? '#ff2b2b' : null, badge: null, avatar: null, theme: null,
    banned: false, banReason: null,
    purchases: [], removedItems: [], contacts: [], channels: [],
    status: 'online', bio: ''
  };
  saveDB();
  const token = makeToken(nick);
  res.json({ ok: true, token, user: publicUser(DB.users[nick]) });
});

app.post('/api/login', (req, res) => {
  const { nick, pass } = req.body || {};
  const u = DB.users[nick];
  if(!u || u.pass !== pass) return res.json({ error: 'Неверный ник или пароль' });
  if(u.banned) return res.json({ error: '🚫 Ты забанен' + (u.banReason ? ': ' + u.banReason : '') });
  if(u.nick === ADMIN_NICK || u.id === '000003'){ u.isAdmin = true; if(!u.color) u.color = '#ff2b2b'; }
  const token = makeToken(nick);
  res.json({ ok: true, token, user: publicUser(u) });
});

/* ============ ПРОФИЛЬ ============ */
app.get('/api/me', auth, (req, res) => {
  const u = DB.users[req.nick];
  if(!u) return res.json({ error: 'Нет юзера' });
  res.json({ ok: true, user: publicUser(u) });
});
app.post('/api/me/update', auth, (req, res) => {
  const u = DB.users[req.nick];
  if(!u) return res.json({ error: 'Нет юзера' });
  const { bio, status } = req.body || {};
  if(typeof bio === 'string') u.bio = bio.slice(0, 200);
  if(typeof status === 'string' && ['online','away','dnd'].indexOf(status) !== -1) u.status = status;
  saveDB();
  res.json({ ok: true, user: publicUser(u) });
});
app.get('/api/users', auth, (req, res) => res.json(Object.values(DB.users).map(publicUser)));

/* ============ ПОИСК ============ */
app.post('/api/find', auth, (req, res) => {
  const { id } = req.body || {};
  if(!/^\d{6}$/.test(id)) return res.json({ error: 'ID из 6 цифр' });
  const me = DB.users[req.nick];
  if(me.id === id) return res.json({ error: 'Это твой ID' });
  const u = findUserById(id);
  if(!u) return res.json({ error: 'Не найден' });
  if(!me.contacts) me.contacts = [];
  if(me.contacts.indexOf(u.nick) === -1) me.contacts.push(u.nick);
  saveDB();
  res.json({ ok: true, user: publicUser(u), me: publicUser(me) });
});
app.post('/api/channels/find', auth, (req, res) => {
  const { id } = req.body || {};
  if(!/^\d{6}$/.test(id)) return res.json({ error: 'ID канала из 6 цифр' });
  const me = DB.users[req.nick];
  const ch = findChannelById(id);
  if(!ch) return res.json({ error: 'Канал не найден' });
  if(!me.channels) me.channels = [];
  if(me.channels.indexOf(ch.cid) === -1) me.channels.push(ch.cid);
  if(!ch.members) ch.members = [];
  if(ch.members.indexOf(req.nick) === -1) ch.members.push(req.nick);
  saveDB();
  res.json({ ok: true, channel: ch, me: publicUser(me) });
});
app.post('/api/friends/remove', auth, (req, res) => {
  const me = DB.users[req.nick];
  const { nick } = req.body || {};
  if(!nick) return res.json({ error: 'Не указан ник' });
  if(!me.contacts) me.contacts = [];
  const idx = me.contacts.indexOf(nick);
  if(idx === -1) return res.json({ error: 'Не в друзьях' });
  me.contacts.splice(idx, 1);
  saveDB();
  res.json({ ok: true, me: publicUser(me) });
});

/* ============ СООБЩЕНИЯ ============ */
app.get('/api/messages', auth, (req, res) => {
  const { withNick, gid, cid } = req.query;
  if(cid) return res.json({ ok: true, msgs: DB.chats[channelKey(cid)] || [] });
  if(gid) return res.json({ ok: true, msgs: DB.chats[groupKey(gid)] || [] });
  if(!withNick) return res.json({ error: 'Нет собеседника' });
  res.json({ ok: true, msgs: DB.chats[chatKey(req.nick, withNick)] || [] });
});

app.post('/api/send', auth, (req, res) => {
  const me = DB.users[req.nick];
  if(me.banned) return res.json({ error: 'Ты забанен' });
  const { to, gid, cid, text, replyTo } = req.body || {};
  if(!text || !text.trim()) return res.json({ error: 'Пусто' });
  let key;
  if(cid){
    const ch = DB.channels[cid];
    if(!ch) return res.json({ error: 'Нет канала' });
    if(!ch.members || ch.members.indexOf(req.nick) === -1) return res.json({ error: 'Не подписан' });
    if(ch.owner !== req.nick && !me.isAdmin) return res.json({ error: 'Только владелец' });
    key = channelKey(cid);
  } else if(gid){
    const g = DB.groups[gid];
    if(!g || g.members.indexOf(req.nick) === -1) return res.json({ error: 'Не в группе' });
    key = groupKey(gid);
  } else if(to){ key = chatKey(req.nick, to); }
  else return res.json({ error: 'Некуда' });

  var finalText = text.trim();
  var imgMatch = finalText.match(/^\[img\](data:[^)]+)\[\/img\]$/);
  if(imgMatch){ var url = saveBase64File(imgMatch[1], 'image'); if(url) finalText = '[img]' + url + '[/img]'; else return res.json({ error: 'Не сохранил фото' }); }
  var audioMatch = finalText.match(/^\[audio\](data:[^)]+)\[\/audio\]$/);
  if(audioMatch){ var aurl = saveBase64File(audioMatch[1], 'audio'); if(aurl) finalText = '[audio]' + aurl + '[/audio]'; else return res.json({ error: 'Не сохранил аудио' }); }

  if(!DB.chats[key]) DB.chats[key] = [];
  const msgObj = { from: req.nick, text: finalText, t: Date.now() };
  if(replyTo && replyTo.from) msgObj.replyTo = { from: replyTo.from, text: String(replyTo.text||'').slice(0,200) };
  DB.chats[key].push(msgObj);
  saveDB();
  if(!gid && !cid && to === BOT_NICK) setTimeout(function(){ sendBotReply(req.nick, text); }, 400);
  res.json({ ok: true });
});

app.post('/api/msg/react', auth, (req, res) => {
  const { withNick, gid, cid, idx, emoji } = req.body || {};
  let key;
  if(cid) key = channelKey(cid);
  else if(gid) key = groupKey(gid);
  else if(withNick) key = chatKey(req.nick, withNick);
  else return res.json({ error: 'Нет чата' });
  const arr = DB.chats[key];
  if(!arr || !arr[idx]) return res.json({ error: 'Нет сообщения' });
  const m = arr[idx];
  m.reactions = m.reactions || {};
  m.reactions[emoji] = m.reactions[emoji] || [];
  const i = m.reactions[emoji].indexOf(req.nick);
  if(i === -1) m.reactions[emoji].push(req.nick); else m.reactions[emoji].splice(i, 1);
  if(m.reactions[emoji].length === 0) delete m.reactions[emoji];
  saveDB();
  res.json({ ok: true });
});

app.post('/api/msg/edit', auth, (req, res) => {
  const { withNick, gid, cid, idx, text } = req.body || {};
  let key;
  if(cid) key = channelKey(cid); else if(gid) key = groupKey(gid); else if(withNick) key = chatKey(req.nick, withNick);
  else return res.json({ error: 'Нет чата' });
  const arr = DB.chats[key];
  if(!arr || !arr[idx]) return res.json({ error: 'Нет сообщения' });
  const m = arr[idx];
  if(m.from !== req.nick) return res.json({ error: 'Только свои' });
  m.text = text.trim();
  m.edited = true;
  saveDB();
  res.json({ ok: true });
});

app.post('/api/msg/delete', auth, (req, res) => {
  const me = DB.users[req.nick];
  const { withNick, gid, cid, idx } = req.body || {};
  let key;
  if(cid) key = channelKey(cid); else if(gid) key = groupKey(gid); else if(withNick) key = chatKey(req.nick, withNick);
  else return res.json({ error: 'Нет чата' });
  const arr = DB.chats[key];
  if(!arr || !arr[idx]) return res.json({ error: 'Нет сообщения' });
  const m = arr[idx];
  if(m.from !== req.nick && !me.isAdmin) return res.json({ error: 'Только свои или админ' });
  var fileUrl = extractFileUrl(m.text);
  arr.splice(idx, 1);
  saveDB();
  if(fileUrl) setTimeout(function(){ deleteFileIfUnused(fileUrl); }, 100);
  res.json({ ok: true });
});

/* ============ АДМИН: УДАЛЕНИЕ МЕДИА ============ */
app.post('/api/admin/delete-all-photo', auth, (req, res) => {
  const me = DB.users[req.nick];
  if(!me.isAdmin) return res.json({ error: 'Только админ' });
  var deletedMsgs = 0, deletedFiles = 0;
  for(var k in DB.chats){
    var msgs = DB.chats[k];
    for(var i = msgs.length - 1; i >= 0; i--){
      var text = msgs[i].text || '';
      if(text.indexOf('[img]') === 0){
        var fileUrl = extractFileUrl(text);
        msgs.splice(i, 1);
        deletedMsgs++;
        if(fileUrl){
          var fpath = path.join(UPLOADS_DIR, fileUrl.split('/').pop());
          try { if(fs.existsSync(fpath)){ fs.unlinkSync(fpath); deletedFiles++; } } catch(e){}
        }
      }
    }
  }
  try {
    var files = fs.readdirSync(UPLOADS_DIR);
    files.forEach(function(f){ try { fs.unlinkSync(path.join(UPLOADS_DIR, f)); deletedFiles++; } catch(e){} });
  } catch(e){}
  saveDB();
  res.json({ ok: true, msgs: deletedMsgs, files: deletedFiles });
});

app.post('/api/admin/delete-all-audio', auth, (req, res) => {
  const me = DB.users[req.nick];
  if(!me.isAdmin) return res.json({ error: 'Только админ' });
  var deletedMsgs = 0, deletedFiles = 0;
  for(var k in DB.chats){
    var msgs = DB.chats[k];
    for(var i = msgs.length - 1; i >= 0; i--){
      var text = msgs[i].text || '';
      if(text.indexOf('[audio]') === 0){
        var fileUrl = extractFileUrl(text);
        msgs.splice(i, 1);
        deletedMsgs++;
        if(fileUrl){
          var fpath = path.join(AUDIO_DIR, fileUrl.split('/').pop());
          try { if(fs.existsSync(fpath)){ fs.unlinkSync(fpath); deletedFiles++; } } catch(e){}
        }
      }
    }
  }
  try {
    var files = fs.readdirSync(AUDIO_DIR);
    files.forEach(function(f){ try { fs.unlinkSync(path.join(AUDIO_DIR, f)); deletedFiles++; } catch(e){} });
  } catch(e){}
  saveDB();
  res.json({ ok: true, msgs: deletedMsgs, files: deletedFiles });
});

/* ============ ГРУППЫ ============ */
app.get('/api/groups', auth, (req, res) => {
  const mine = {};
  for(const gid in DB.groups) if(DB.groups[gid].members.indexOf(req.nick) !== -1) mine[gid] = DB.groups[gid];
  res.json(mine);
});
app.post('/api/groups/create', auth, (req, res) => {
  const { name, members } = req.body || {};
  if(!name || name.length < 2) return res.json({ error: 'Название коротко' });
  if(!Array.isArray(members) || members.length === 0) return res.json({ error: 'Выбери участников' });
  const gid = 'g' + Date.now();
  const allMembers = members.slice();
  if(allMembers.indexOf(req.nick) === -1) allMembers.push(req.nick);
  DB.groups[gid] = { id: gid, name, members: allMembers, creator: req.nick, created: Date.now() };
  saveDB();
  res.json({ ok: true, gid });
});

/* ============ КАНАЛЫ ============ */
app.get('/api/channels', auth, (req, res) => {
  const mine = {};
  for(const cid in DB.channels){
    const ch = DB.channels[cid];
    if(ch.members && ch.members.indexOf(req.nick) !== -1) mine[cid] = ch;
  }
  res.json(mine);
});
app.post('/api/channels/create', auth, (req, res) => {
  const me = DB.users[req.nick];
  if(!me.isAdmin) return res.json({ error: 'Каналы создаёт только админ' });
  const { name, description } = req.body || {};
  if(!name || name.length < 2) return res.json({ error: 'Название коротко' });
  const cid = 'c' + Date.now();
  const channelId = genChannelId();
  DB.channels[cid] = { cid, channelId, name, description: description || '', owner: req.nick, members: [req.nick], created: Date.now() };
  if(!me.channels) me.channels = [];
  me.channels.push(cid);
  saveDB();
  res.json({ ok: true, cid, channelId, channel: DB.channels[cid] });
});

/* ============ ИГРЫ ============ */
function getGamePlayers(gd){ return [gd.from, gd.to]; }
function getOpponent(gd, me){ return gd.from === me ? gd.to : gd.from; }

function initGameState(game){
  if(game === 'ttt') return { board: ['','','','','','','','',''] };
  if(game === 'rps') return { picks: {} };
  if(game === 'dice') return { rolls: {} };
  if(game === 'target') return { shots: {} };
  if(game === 'guess') return { secret: Math.floor(Math.random()*100)+1, guesses: [], hints: [] };
  return {};
}

function serializeGame(gd, forNick){
  var opp = getOpponent(gd, forNick);
  var st = gd.state || {};
  var serialized = {
    gameId: gd.gameId, game: gd.game, from: gd.from, to: gd.to,
    turn: gd.turn, finished: gd.finished, winner: gd.winner || null,
    opponent: opp
  };
  if(gd.game === 'ttt') serialized.state = { board: st.board || [] };
  else if(gd.game === 'rps') serialized.state = { picks: st.picks || {} };
  else if(gd.game === 'dice') serialized.state = { myDice: (st.rolls||{})[forNick] || null, oppDice: (st.rolls||{})[opp] || null };
  else if(gd.game === 'target') serialized.state = { myShot: (st.shots||{})[forNick] || null, oppShot: (st.shots||{})[opp] || null };
  else if(gd.game === 'guess') serialized.state = { hints: (st.hints||[]).slice(-10), guesses: st.guesses || [] };
  return serialized;
}

function updateGameMessage(gd){
  var key = chatKey(gd.from, gd.to);
  if(!DB.chats[key]) DB.chats[key] = [];
  var msgs = DB.chats[key];
  var msgIdx = -1;
  for(var i=0;i<msgs.length;i++){
    if(msgs[i].text && msgs[i].text.indexOf('[game-active]') === 0){
      try {
        var d = JSON.parse(msgs[i].text.substring(13, msgs[i].text.indexOf('[/game-active]')));
        if(d.gameId === gd.gameId){ msgIdx = i; break; }
      } catch(e){}
    }
  }
  if(msgIdx === -1) return;
  var serialized = {
    gameId: gd.gameId, game: gd.game, from: gd.from, to: gd.to,
    turn: gd.turn, finished: gd.finished, winner: gd.winner || null
  };
  if(gd.game === 'ttt') serialized.state = { board: gd.state.board };
  else if(gd.game === 'rps') serialized.state = { picks: gd.state.picks || {} };
  else if(gd.game === 'dice') serialized.state = { myDice: null, oppDice: null, rolls: gd.state.rolls || {} };
  else if(gd.game === 'target') serialized.state = { myShot: null, oppShot: null, shots: gd.state.shots || {} };
  else if(gd.game === 'guess') serialized.state = { hints: (gd.state.hints||[]).slice(-10), guesses: gd.state.guesses || [] };
  msgs[msgIdx].text = '[game-active]' + JSON.stringify(serialized) + '[/game-active]';
  saveDB();
}

function finishGame(gd, winner){
  gd.finished = true;
  gd.winner = winner;
  updateGameMessage(gd);
  var key = chatKey(gd.from, gd.to);
  var names = { rps:'КНБ', guess:'Угадай число', ttt:'Крестики-нолики', dice:'Кости', target:'Мишень' };
  var text = winner ? ('🏆 ' + winner + ' выиграл в «' + (names[gd.game]||gd.game) + '»!') : ('🤝 Ничья в «' + (names[gd.game]||gd.game) + '»!');
  var resultMsg = { from: 'system', text: '[game-result]' + JSON.stringify({ text: text, gameId: gd.gameId }) + '[/game-result]', t: Date.now() };
  DB.chats[key].push(resultMsg);
  saveDB();
  // Удалить результат через 3 секунды
  var gameId = gd.gameId;
  setTimeout(function(){
    if(!DB.chats[key]) return;
    var arr = DB.chats[key];
    for(var i = arr.length - 1; i >= 0; i--){
      if(arr[i].text && arr[i].text.indexOf('[game-result]') === 0){
        try {
          var d = JSON.parse(arr[i].text.substring(14, arr[i].text.indexOf('[/game-result]')));
          if(d.gameId === gameId){ arr.splice(i, 1); }
        } catch(e){}
      }
    }
    // Удалить и активное поле
    for(var j = arr.length - 1; j >= 0; j--){
      if(arr[j].text && arr[j].text.indexOf('[game-active]') === 0){
        try {
          var d2 = JSON.parse(arr[j].text.substring(13, arr[j].text.indexOf('[/game-active]')));
          if(d2.gameId === gameId){ arr.splice(j, 1); }
        } catch(e){}
      }
    }
    delete DB.games[gameId];
    saveDB();
  }, 3000);
}

app.post('/api/game/invite', auth, (req, res) => {
  const me = DB.users[req.nick];
  const { to, game } = req.body || {};
  if(!to || !game) return res.json({ error: 'Нет данных' });
  if(!DB.users[to]) return res.json({ error: 'Юзер не найден' });
  var gameId = genGameId();
  DB.games[gameId] = {
    gameId: gameId, game: game, from: req.nick, to: to,
    status: 'pending', turn: req.nick, finished: false, winner: null,
    state: initGameState(game), created: Date.now()
  };
  saveDB();
  var key = chatKey(req.nick, to);
  if(!DB.chats[key]) DB.chats[key] = [];
  var invMsg = { from: req.nick, text: '[game-invite]' + JSON.stringify({ gameId: gameId, from: req.nick, to: to, game: game, status: 'pending' }) + '[/game-invite]', t: Date.now() };
  DB.chats[key].push(invMsg);
  saveDB();
  res.json({ ok: true, gameId: gameId });
});

app.post('/api/game/accept', auth, (req, res) => {
  const { gameId } = req.body || {};
  var gd = DB.games[gameId];
  if(!gd) return res.json({ error: 'Игра не найдена' });
  if(gd.to !== req.nick) return res.json({ error: 'Только приглашённый' });
  if(gd.status !== 'pending') return res.json({ error: 'Уже принято' });
  gd.status = 'accepted';
  saveDB();
  var key = chatKey(gd.from, gd.to);
  var msgs = DB.chats[key] || [];
  // Удалить приглашение
  for(var i = msgs.length - 1; i >= 0; i--){
    if(msgs[i].text && msgs[i].text.indexOf('[game-invite]') === 0){
      try {
        var d = JSON.parse(msgs[i].text.substring(13, msgs[i].text.indexOf('[/game-invite]')));
        if(d.gameId === gameId){ msgs.splice(i, 1); }
      } catch(e){}
    }
  }
  // Добавить игровое поле
  var serialized = {
    gameId: gd.gameId, game: gd.game, from: gd.from, to: gd.to,
    turn: gd.turn, finished: false, winner: null
  };
  if(gd.game === 'ttt') serialized.state = { board: gd.state.board };
  else if(gd.game === 'rps') serialized.state = { picks: {} };
  else if(gd.game === 'dice') serialized.state = { rolls: {} };
  else if(gd.game === 'target') serialized.state = { shots: {} };
  else if(gd.game === 'guess') serialized.state = { hints: [], guesses: [] };
  DB.chats[key].push({ from: 'system', text: '[game-active]' + JSON.stringify(serialized) + '[/game-active]', t: Date.now() });
  saveDB();
  res.json({ ok: true });
});

app.post('/api/game/decline', auth, (req, res) => {
  const { gameId } = req.body || {};
  var gd = DB.games[gameId];
  if(!gd) return res.json({ error: 'Игра не найдена' });
  if(gd.to !== req.nick) return res.json({ error: 'Только приглашённый' });
  var key = chatKey(gd.from, gd.to);
  var msgs = DB.chats[key] || [];
  for(var i = msgs.length - 1; i >= 0; i--){
    if(msgs[i].text && msgs[i].text.indexOf('[game-invite]') === 0){
      try {
        var d = JSON.parse(msgs[i].text.substring(13, msgs[i].text.indexOf('[/game-invite]')));
        if(d.gameId === gameId){ msgs.splice(i, 1); }
      } catch(e){}
    }
  }
  delete DB.games[gameId];
  saveDB();
  res.json({ ok: true });
});

app.post('/api/game/move', auth, (req, res) => {
  const { gameId, move } = req.body || {};
  var gd = DB.games[gameId];
  if(!gd) return res.json({ error: 'Игра не найдена' });
  if(gd.finished) return res.json({ error: 'Игра окончена' });
  var me = req.nick;
  if(gd.from !== me && gd.to !== me) return res.json({ error: 'Не участник' });

  if(gd.game === 'ttt'){
    if(gd.turn !== me) return res.json({ error: 'Не твой ход' });
    var cell = move.cell;
    if(cell === undefined || gd.state.board[cell]) return res.json({ error: 'Нельзя' });
    gd.state.board[cell] = (me === gd.from) ? '❌' : '⭕';
    gd.turn = getOpponent(gd, me);
    var w = checkTTT(gd.state.board);
    if(w) return finishGame(gd, w === '❌' ? gd.from : gd.to);
    if(gd.state.board.indexOf('') === -1) return finishGame(gd, null);
    updateGameMessage(gd);
    return res.json({ ok: true });
  }
  if(gd.game === 'rps'){
    if(gd.state.picks[me]) return res.json({ error: 'Уже ходил' });
    gd.state.picks[me] = move.pick;
    if(gd.state.picks[gd.from] && gd.state.picks[gd.to]){
      var p1 = gd.state.picks[gd.from], p2 = gd.state.picks[gd.to];
      var winner = null;
      if(p1 !== p2){
        if((p1==='rock'&&p2==='scissors')||(p1==='scissors'&&p2==='paper')||(p1==='paper'&&p2==='rock')) winner = gd.from;
        else winner = gd.to;
      }
      return finishGame(gd, winner);
    }
    updateGameMessage(gd);
    return res.json({ ok: true });
  }
  if(gd.game === 'dice'){
    if(gd.state.rolls[me]) return res.json({ error: 'Уже бросал' });
    gd.state.rolls[me] = Math.floor(Math.random()*6)+1 + Math.floor(Math.random()*6)+1;
    if(gd.state.rolls[gd.from] && gd.state.rolls[gd.to]){
      var r1 = gd.state.rolls[gd.from], r2 = gd.state.rolls[gd.to];
      var w2 = r1 > r2 ? gd.from : (r2 > r1 ? gd.to : null);
      return finishGame(gd, w2);
    }
    updateGameMessage(gd);
    return res.json({ ok: true });
  }
  if(gd.game === 'target'){
    if(gd.state.shots[me]) return res.json({ error: 'Уже стрелял' });
    gd.state.shots[me] = move.shot;
    if(gd.state.shots[gd.from] && gd.state.shots[gd.to]){
      var s1 = Math.abs(10 - gd.state.shots[gd.from]);
      var s2 = Math.abs(10 - gd.state.shots[gd.to]);
      var w3 = s1 < s2 ? gd.from : (s2 < s1 ? gd.to : null);
      return finishGame(gd, w3);
    }
    updateGameMessage(gd);
    return res.json({ ok: true });
  }
  if(gd.game === 'guess'){
    if(gd.turn !== me) return res.json({ error: 'Не твой ход' });
    var g = move.guess;
    if(!g || g < 1 || g > 100) return res.json({ error: 'От 1 до 100' });
    gd.state.guesses.push(g);
    if(g === gd.state.secret){
      return finishGame(gd, me);
    } else if(g < gd.state.secret){
      gd.state.hints.push('⬆️');
    } else {
      gd.state.hints.push('⬇️');
    }
    gd.turn = getOpponent(gd, me);
    updateGameMessage(gd);
    return res.json({ ok: true });
  }
  res.json({ error: 'Неизвестная игра' });
});

function checkTTT(b){
  var lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for(var i=0;i<lines.length;i++){
    var a=lines[i][0],c=lines[i][1],d=lines[i][2];
    if(b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  }
  return null;
}

app.get('/api/game/state/:gameId', auth, (req, res) => {
  var gd = DB.games[req.params.gameId];
  if(!gd) return res.json({ error: 'Игра не найдена' });
  if(gd.from !== req.nick && gd.to !== req.nick) return res.json({ error: 'Не участник' });
  res.json({ ok: true, game: serializeGame(gd, req.nick) });
});

/* ============ МАГАЗИН ============ */
const SHOP = [
  {id:'nick_blue', title:'Синий ник', desc:'Цвет', price:50, color:'#4a7dff'},
  {id:'nick_green', title:'Зелёный ник', desc:'Цвет', price:50, color:'#22c55e'},
  {id:'nick_purple', title:'Фиолетовый ник', desc:'Цвет', price:80, color:'#a855f7'},
  {id:'nick_gold', title:'Золотой ник', desc:'Цвет', price:150, color:'#ffb800'},
  {id:'nick_pink', title:'Розовый ник', desc:'Цвет', price:80, color:'#ff4d9e'},
  {id:'nick_cyan', title:'Голубой ник', desc:'Цвет', price:70, color:'#06b6d4'},
  {id:'nick_orange', title:'Оранжевый ник', desc:'Цвет', price:70, color:'#ff7a00'},
  {id:'badge_star', title:'Значок ⭐', desc:'', price:100, badge:'⭐'},
  {id:'badge_fire', title:'Значок 🔥', desc:'', price:120, badge:'🔥'},
  {id:'badge_crown', title:'Значок 👑', desc:'', price:250, badge:'👑'},
  {id:'badge_heart', title:'Значок 💖', desc:'', price:100, badge:'💖'},
  {id:'badge_rocket', title:'Значок 🚀', desc:'', price:180, badge:'🚀'},
  {id:'badge_diamond', title:'Значок 💎', desc:'', price:300, badge:'💎'},
  {id:'badge_skull', title:'Значок 💀', desc:'', price:220, badge:'💀'},
  {id:'badge_ghost', title:'Значок 👻', desc:'', price:150, badge:'👻'},
  {id:'av_cat', title:'Аватар 🐱', desc:'', price:30, avatar:'🐱'},
  {id:'av_dog', title:'Аватар 🐶', desc:'', price:30, avatar:'🐶'},
  {id:'av_fox', title:'Аватар 🦊', desc:'', price:50, avatar:'🦊'},
  {id:'av_lion', title:'Аватар 🦁', desc:'', price:80, avatar:'🦁'},
  {id:'av_tiger', title:'Аватар 🐯', desc:'', price:80, avatar:'🐯'},
  {id:'av_panda', title:'Аватар 🐼', desc:'', price:80, avatar:'🐼'},
  {id:'av_koala', title:'Аватар 🐨', desc:'', price:60, avatar:'🐨'},
  {id:'av_frog', title:'Аватар 🐸', desc:'', price:40, avatar:'🐸'},
  {id:'av_monkey', title:'Аватар 🐵', desc:'', price:50, avatar:'🐵'},
  {id:'av_penguin', title:'Аватар 🐧', desc:'', price:70, avatar:'🐧'},
  {id:'av_unicorn', title:'Аватар 🦄', desc:'', price:200, avatar:'🦄'},
  {id:'av_bee', title:'Аватар 🐝', desc:'', price:40, avatar:'🐝'},
  {id:'av_butterfly', title:'Аватар 🦋', desc:'', price:60, avatar:'🦋'},
  {id:'av_turtle', title:'Аватар 🐢', desc:'', price:60, avatar:'🐢'},
  {id:'av_snake', title:'Аватар 🐍', desc:'', price:70, avatar:'🐍'},
  {id:'av_octopus', title:'Аватар 🐙', desc:'', price:90, avatar:'🐙'},
  {id:'av_crab', title:'Аватар 🦀', desc:'', price:80, avatar:'🦀'},
  {id:'av_dolphin', title:'Аватар 🐬', desc:'', price:120, avatar:'🐬'},
  {id:'av_whale', title:'Аватар 🐳', desc:'', price:150, avatar:'🐳'},
  {id:'av_dino', title:'Аватар 🦖', desc:'', price:180, avatar:'🦖'},
  {id:'av_dragon', title:'Аватар 🐲', desc:'', price:200, avatar:'🐲'},
  {id:'av_robot', title:'Аватар 🤖', desc:'', price:150, avatar:'🤖'},
  {id:'av_alien', title:'Аватар 👽', desc:'', price:170, avatar:'👽'},
  {id:'av_ghost', title:'Аватар 👻', desc:'', price:140, avatar:'👻'},
  {id:'av_skull', title:'Аватар 💀', desc:'', price:160, avatar:'💀'},
  {id:'av_ninja', title:'Аватар 🥷', desc:'', price:230, avatar:'🥷'},
  {id:'av_wizard', title:'Аватар 🧙', desc:'', price:200, avatar:'🧙'},
  {id:'av_fairy', title:'Аватар 🧚', desc:'', price:180, avatar:'🧚'},
  {id:'av_clown', title:'Аватар 🤡', desc:'', price:100, avatar:'🤡'},
  {id:'av_devil', title:'Аватар 😈', desc:'', price:220, avatar:'😈'},
  {id:'av_angel', title:'Аватар 😇', desc:'', price:220, avatar:'😇'},
  {id:'av_cowboy', title:'Аватар 🤠', desc:'', price:110, avatar:'🤠'},
  {id:'av_party', title:'Аватар 🥳', desc:'', price:130, avatar:'🥳'},
  {id:'av_cool', title:'Аватар 😎', desc:'', price:120, avatar:'😎'},
  {id:'av_heart', title:'Аватар ❤️', desc:'', price:60, avatar:'❤️'},
  {id:'av_fire', title:'Аватар 🔥', desc:'', price:90, avatar:'🔥'},
  {id:'av_lightning', title:'Аватар ⚡', desc:'', price:90, avatar:'⚡'},
  {id:'av_star', title:'Аватар ⭐', desc:'', price:70, avatar:'⭐'},
  {id:'av_moon', title:'Аватар 🌙', desc:'', price:80, avatar:'🌙'},
  {id:'av_sun', title:'Аватар ☀️', desc:'', price:80, avatar:'☀️'},
  {id:'av_rainbow', title:'Аватар 🌈', desc:'', price:150, avatar:'🌈'},
  {id:'av_diamond', title:'Аватар 💎', desc:'', price:200, avatar:'💎'},
  {id:'av_crown', title:'Аватар 👑', desc:'', price:250, avatar:'👑'},
  {id:'av_pizza', title:'Аватар 🍕', desc:'', price:50, avatar:'🍕'},
  {id:'av_burger', title:'Аватар 🍔', desc:'', price:50, avatar:'🍔'},
  {id:'av_coffee', title:'Аватар ☕', desc:'', price:60, avatar:'☕'},
  {id:'av_rocket', title:'Аватар 🚀', desc:'', price:180, avatar:'🚀'},
  {id:'av_planet', title:'Аватар 🪐', desc:'', price:190, avatar:'🪐'},
  {id:'av_galaxy', title:'Аватар 🌌', desc:'', price:300, avatar:'🌌'},
  {id:'av_game', title:'Аватар 🎮', desc:'', price:100, avatar:'🎮'},
  {id:'av_guitar', title:'Аватар 🎸', desc:'', price:100, avatar:'🎸'},
  {id:'av_soccer', title:'Аватар ⚽', desc:'', price:80, avatar:'⚽'},
  {id:'av_basket', title:'Аватар 🏀', desc:'', price:80, avatar:'🏀'},
  {id:'theme_gold', title:'Золотая тема', desc:'', price:400, theme:'gold'},
  {id:'theme_neon', title:'Неоновая тема', desc:'', price:400, theme:'neon'}
];

app.get('/api/shop', auth, (req, res) => res.json(SHOP));

app.post('/api/shop/buy', auth, (req, res) => {
  const me = DB.users[req.nick];
  const { id } = req.body || {};
  const item = SHOP.find(i => i.id === id);
  if(!item) return res.json({ error: 'Нет товара' });
  if((me.purchases||[]).indexOf(id) !== -1) return res.json({ error: 'Уже куплено' });
  if(me.coins < item.price) return res.json({ error: 'Недостаточно W' });
  me.coins -= item.price;
  me.purchases = me.purchases || [];
  me.purchases.push(id);
  if(item.color) me.color = item.color;
  if(item.badge) me.badge = item.badge;
  if(item.avatar) me.avatar = item.avatar;
  if(item.theme) me.theme = item.theme;
  saveDB();
  res.json({ ok: true, user: publicUser(me) });
});

app.post('/api/shop/unequip', auth, (req, res) => {
  const me = DB.users[req.nick];
  const { id } = req.body || {};
  const item = SHOP.find(i => i.id === id);
  if(!item) return res.json({ error: 'Нет товара' });
  if((me.purchases||[]).indexOf(id) === -1) return res.json({ error: 'Не куплено' });
  me.purchases.splice(me.purchases.indexOf(id), 1);
  me.removedItems = me.removedItems || [];
  if(me.removedItems.indexOf(id) === -1) me.removedItems.push(id);
  if(item.color && me.color === item.color) me.color = me.isAdmin ? '#ff2b2b' : null;
  if(item.badge && me.badge === item.badge) me.badge = null;
  if(item.avatar && me.avatar === item.avatar) me.avatar = null;
  if(item.theme && me.theme === item.theme) me.theme = null;
  saveDB();
  res.json({ ok: true, user: publicUser(me) });
});

app.post('/api/shop/re-equip', auth, (req, res) => {
  const me = DB.users[req.nick];
  const { id } = req.body || {};
  const item = SHOP.find(i => i.id === id);
  if(!item) return res.json({ error: 'Нет товара' });
  me.removedItems = me.removedItems || [];
  if(me.removedItems.indexOf(id) === -1) return res.json({ error: 'Не снято' });
  me.removedItems.splice(me.removedItems.indexOf(id), 1);
  me.purchases = me.purchases || [];
  if(me.purchases.indexOf(id) === -1) me.purchases.push(id);
  if(item.color) me.color = item.color;
  if(item.badge) me.badge = item.badge;
  if(item.avatar) me.avatar = item.avatar;
  if(item.theme) me.theme = item.theme;
  saveDB();
  res.json({ ok: true, user: publicUser(me) });
});

app.post('/api/shop/forget', auth, (req, res) => {
  const me = DB.users[req.nick];
  const { id } = req.body || {};
  me.removedItems = me.removedItems || [];
  const idx = me.removedItems.indexOf(id);
  if(idx === -1) return res.json({ error: 'Не снято' });
  me.removedItems.splice(idx, 1);
  saveDB();
  res.json({ ok: true, user: publicUser(me) });
});

/* ============ АДМИН ============ */
app.post('/api/dev/check', auth, (req, res) => {
  const { code } = req.body || {};
  if(code !== DEV_CODE) return res.json({ error: 'Неверный код' });
  res.json({ ok: true });
});
app.post('/api/admin/coins', auth, (req, res) => {
  const me = DB.users[req.nick];
  if(!me.isAdmin) return res.json({ error: 'Только админ' });
  const { nick, amount } = req.body || {};
  const u = DB.users[nick];
  if(!u) return res.json({ error: 'Нет юзера' });
  u.coins += (parseInt(amount) || 0);
  if(u.coins < 0) u.coins = 0;
  saveDB();
  res.json({ ok: true, user: publicUser(u) });
});
app.post('/api/admin/coins-all', auth, (req, res) => {
  const me = DB.users[req.nick];
  if(!me.isAdmin) return res.json({ error: 'Только админ' });
  const { amount } = req.body || {};
  const amt = parseInt(amount) || 0;
  for(const k in DB.users){
    if(DB.users[k].isBot) continue;
    DB.users[k].coins += amt;
    if(DB.users[k].coins < 0) DB.users[k].coins = 0;
  }
  saveDB();
  res.json({ ok: true });
});
app.post('/api/admin/set-admin', auth, (req, res) => {
  const me = DB.users[req.nick];
  if(!me.isAdmin) return res.json({ error: 'Только админ' });
  const { nick, isAdmin, colorRed } = req.body || {};
  const u = DB.users[nick];
  if(!u) return res.json({ error: 'Нет юзера' });
  if(typeof isAdmin === 'boolean') u.isAdmin = isAdmin;
  if(typeof colorRed === 'boolean') u.color = colorRed ? '#ff2b2b' : (u.isAdmin ? '#ff2b2b' : null);
  saveDB();
  res.json({ ok: true, user: publicUser(u) });
});
app.post('/api/admin/ban', auth, (req, res) => {
  const me = DB.users[req.nick];
  if(!me.isAdmin) return res.json({ error: 'Только админ' });
  const { nick, banned, reason } = req.body || {};
  const u = DB.users[nick];
  if(!u) return res.json({ error: 'Нет юзера' });
  u.banned = !!banned;
  u.banReason = banned ? (reason || null) : null;
  saveDB();
  res.json({ ok: true, user: publicUser(u) });
});
app.post('/api/admin/broadcast', auth, (req, res) => {
  const me = DB.users[req.nick];
  if(!me.isAdmin) return res.json({ error: 'Только админ' });
  const { text } = req.body || {};
  if(!text || !text.trim()) return res.json({ error: 'Пусто' });
  let count = 0;
  for(const k in DB.users){
    if(DB.users[k].isBot) continue;
    if(k === req.nick) continue;
    const u = DB.users[k];
    if(!u.contacts) u.contacts = [];
    if(u.contacts.indexOf(BOT_NICK) === -1) u.contacts.push(BOT_NICK);
    const key = chatKey(BOT_NICK, k);
    if(!DB.chats[key]) DB.chats[key] = [];
    DB.chats[key].push({ from: BOT_NICK, text: '📢 ' + text.trim(), t: Date.now() });
    count++;
  }
  saveDB();
  res.json({ ok: true, count });
});
app.post('/api/admin/wipe', auth, (req, res) => {
  const me = DB.users[req.nick];
  if(!me.isAdmin) return res.json({ error: 'Только админ' });
  DB = { users:{}, chats:{}, groups:{}, channels:{}, games:{}, tokens:{}, pushSubs:{}, nextId:1, nextChannelId:1, nextFileId:1, nextGameId:1 };
  saveDB();
  res.json({ ok: true });
});

/* ============ ГЛАВНАЯ ============ */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('Wenchat server on ' + PORT);
});
