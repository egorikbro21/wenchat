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
  users: {}, chats: {}, groups: {}, channels: {},
  botGames: {},
  tokens: {}, pushSubs: {},
  nextId: 1, nextChannelId: 1, nextFileId: 1
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
      DB.botGames = DB.botGames || {};
      DB.tokens = DB.tokens || {};
      DB.pushSubs = DB.pushSubs || {};
      DB.nextId = DB.nextId || 1;
      DB.nextChannelId = DB.nextChannelId || 1;
      DB.nextFileId = DB.nextFileId || 1;
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

const DEV_CODE = "Wendrt-Dev-Code-2026-Quantum-X9F7-K3M2-P8V5-L1Q4!";
const ADMIN_NICK = "Wendrt";
const BOT_ID = '999999';
const BOT_NICK = 'Wenbot';

function genId(){ const id = String(DB.nextId).padStart(6,'0'); DB.nextId++; return id; }
function genChannelId(){ const id = String(DB.nextChannelId).padStart(6,'0'); DB.nextChannelId++; return id; }
function genFileId(){ const id = String(DB.nextFileId).padStart(8,'0'); DB.nextFileId++; return id; }
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
    title: u.title || null,
    frame: u.frame || null,
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
      title: null, frame: null,
      banned: false, banReason: null,
      purchases: [], contacts: [], removedItems: [], channels: [],
      isBot: true, status: 'online', bio: 'Я Wenbot, помогу чем смогу! Играй: /game'
    };
    saveDB();
  }
}
ensureBot();

/* ============ ФАЙЛЫ ============ */
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

/* ============ ИГРЫ В БОТЕ ============ */
var GAME_LIST = '🎮 Выбери игру:\n1️⃣ ✊✋✌️ Камень-ножницы-бумага\n2️⃣ 🔢 Угадай число\n3️⃣ ❌⭕ Крестики-нолики\n4️⃣ 🎲 Кости\n5️⃣ 🎯 Мишень\n\nНапиши номер (1-5)';

function startBotGame(nick, choice){
  var game = null;
  if(choice === '1') game = 'rps';
  else if(choice === '2') game = 'guess';
  else if(choice === '3') game = 'ttt';
  else if(choice === '4') game = 'dice';
  else if(choice === '5') game = 'target';
  if(!game) return null;
  var state = {};
  if(game === 'ttt') state.board = ['','','','','','','','',''];
  if(game === 'guess'){ state.secret = Math.floor(Math.random()*100)+1; state.tries = 0; }
  DB.botGames[nick] = { game: game, state: state, started: Date.now() };
  saveDB();
  if(game === 'rps') return '✊✋✌️ КНБ!\nВыбери: 1=✊, 2=✌️, 3=✋';
  if(game === 'guess') return '🔢 Я загадал число от 1 до 100.\nНапиши своё предположение.';
  if(game === 'ttt') return '❌⭕ Крестики-нолики!\nТы — ❌, я — ⭕\n\n' + renderTTT(state.board) + '\n\nНапиши номер клетки (1-9)';
  if(game === 'dice') return '🎲 Кости!\nНапиши «бросок» чтобы бросить 2 кубика.';
  if(game === 'target') return '🎯 Мишень!\nВыбери куда стрелять (1-10). Чем ближе к 10 — тем лучше.';
  return null;
}

function playBotGame(nick, text){
  var bg = DB.botGames[nick];
  if(!bg) return null;
  var t = text.trim().toLowerCase();

  if(bg.game === 'rps'){
    var pick = null;
    if(t === '1' || t === 'камень' || t === 'к') pick = 'rock';
    else if(t === '2' || t === 'ножницы' || t === 'н') pick = 'scissors';
    else if(t === '3' || t === 'бумага' || t === 'б') pick = 'paper';
    if(!pick) return '⚠️ Выбери: 1=✊, 2=✌️, 3=✋';
    var opts = ['rock','scissors','paper'];
    var bot = opts[Math.floor(Math.random()*3)];
    var emoji = { rock:'✊', scissors:'✌️', paper:'✋' };
    var res;
    if(pick === bot) res = '🤝 Ничья!';
    else if((pick==='rock'&&bot==='scissors')||(pick==='scissors'&&bot==='paper')||(pick==='paper'&&bot==='rock')) res = '🎉 Ты выиграл!';
    else res = '😢 Я выиграл!';
    delete DB.botGames[nick];
    saveDB();
    return 'Ты '+emoji[pick]+' vs Я '+emoji[bot]+'\n' + res + '\n\nЕщё? /game';
  }

  if(bg.game === 'guess'){
    var g = parseInt(t);
    if(!g || g < 1 || g > 100) return '⚠️ Число от 1 до 100';
    bg.state.tries++;
    if(g === bg.state.secret){
      var tries = bg.state.tries;
      delete DB.botGames[nick];
      saveDB();
      return '🎉 Угадал! Это ' + g + '\nПопыток: ' + tries + '\n\nЕщё? /game';
    }
    saveDB();
    if(g < bg.state.secret) return '⬆️ Больше! (попытка ' + bg.state.tries + ')';
    return '⬇️ Меньше! (попытка ' + bg.state.tries + ')';
  }

  if(bg.game === 'ttt'){
    var cell = parseInt(t);
    if(!cell || cell < 1 || cell > 9) return '⚠️ Номер клетки 1-9';
    var idx = cell - 1;
    if(bg.state.board[idx]) return '⚠️ Клетка занята';
    bg.state.board[idx] = '❌';
    var w = checkTTT(bg.state.board);
    if(w === '❌'){
      delete DB.botGames[nick];
      saveDB();
      return renderTTT(bg.state.board) + '\n\n🎉 Ты выиграл!\n\nЕщё? /game';
    }
    if(bg.state.board.indexOf('') === -1){
      delete DB.botGames[nick];
      saveDB();
      return renderTTT(bg.state.board) + '\n\n🤝 Ничья!\n\nЕщё? /game';
    }
    var empty = [];
    bg.state.board.forEach(function(v, i){ if(!v) empty.push(i); });
    var botMove = empty[Math.floor(Math.random()*empty.length)];
    bg.state.board[botMove] = '⭕';
    var w2 = checkTTT(bg.state.board);
    if(w2 === '⭕'){
      delete DB.botGames[nick];
      saveDB();
      return renderTTT(bg.state.board) + '\n\n😢 Я выиграл!\n\nЕщё? /game';
    }
    if(bg.state.board.indexOf('') === -1){
      delete DB.botGames[nick];
      saveDB();
      return renderTTT(bg.state.board) + '\n\n🤝 Ничья!\n\nЕщё? /game';
    }
    saveDB();
    return renderTTT(bg.state.board) + '\n\nТвой ход (1-9)';
  }

  if(bg.game === 'dice'){
    if(t !== 'бросок' && t !== 'брос' && t !== 'кинуть' && t !== 'roll' && t !== 'r') return '🎲 Напиши «бросок» чтобы бросить';
    var my1 = Math.floor(Math.random()*6)+1;
    var my2 = Math.floor(Math.random()*6)+1;
    var bot1 = Math.floor(Math.random()*6)+1;
    var bot2 = Math.floor(Math.random()*6)+1;
    var mySum = my1 + my2;
    var botSum = bot1 + bot2;
    var result;
    if(mySum > botSum) result = '🎉 Ты выиграл!';
    else if(mySum < botSum) result = '😢 Я выиграл!';
    else result = '🤝 Ничья!';
    delete DB.botGames[nick];
    saveDB();
    return 'Ты 🎲 ' + my1 + '+' + my2 + '=' + mySum + '\nЯ 🎲 ' + bot1 + '+' + bot2 + '=' + botSum + '\n\n' + result + '\n\nЕщё? /game';
  }

  if(bg.game === 'target'){
    var shot = parseInt(t);
    if(!shot || shot < 1 || shot > 10) return '🎯 Число от 1 до 10';
    var botShot = Math.floor(Math.random()*10)+1;
    var myDist = Math.abs(10 - shot);
    var botDist = Math.abs(10 - botShot);
    var res2;
    if(myDist < botDist) res2 = '🎉 Ты ближе к 10! Победа!';
    else if(myDist > botDist) res2 = '😢 Я ближе. Проигрыш.';
    else res2 = '🤝 Одинаково! Ничья!';
    delete DB.botGames[nick];
    saveDB();
    return 'Ты попал в ' + shot + '\nЯ попал в ' + botShot + '\n\n' + res2 + '\n\nЕщё? /game';
  }

  return null;
}

function renderTTT(b){
  var e = function(i){ return b[i] || (i+1); };
  return 'Поле:\n' + e(0)+'|'+e(1)+'|'+e(2)+'\n' + e(3)+'|'+e(4)+'|'+e(5)+'\n' + e(6)+'|'+e(7)+'|'+e(8);
}
function checkTTT(b){
  var lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for(var i=0;i<lines.length;i++){
    var a=lines[i][0],c=lines[i][1],d=lines[i][2];
    if(b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  }
  return null;
}

/* ============ БОТ ============ */
function botReply(text, userNick){
  const t = (text || '').trim(), low = t.toLowerCase();

  if(low === '/game' || low === '/игра' || low === 'игра' || low === 'игры' || low === 'game' || low === '🎮'){
    if(DB.botGames[userNick]){ delete DB.botGames[userNick]; saveDB(); }
    return GAME_LIST;
  }
  if(low === '/help' || low === 'помощь' || low === 'help'){
    if(DB.botGames[userNick]){ delete DB.botGames[userNick]; saveDB(); }
    return '🤖 Мои команды:\n\n📌 Базовое:\n/help, /ping, /id, /time, /date\n\n🧮 Полезное:\n/calc 2+2, /random 1 100, /coin, /dice, /password 16\n\n🎮 Игры:\n/game — список игр\n\n🌍 Инфо:\n/weather Москва, /wiki Россия\n\n🎉 Приколы:\n/joke, /fact, /quote, /8ball, /love';
  }

  if(DB.botGames[userNick]){
    var gameResult = playBotGame(userNick, text);
    if(gameResult) return gameResult;
  }

  if(!DB.botGames[userNick] && ['1','2','3','4','5'].indexOf(low) !== -1){
    var started = startBotGame(userNick, low);
    if(started) return started;
  }
  if(!DB.botGames[userNick] && (low === 'кнб' || low === 'угадай' || low === 'крестики' || low === 'кости' || low === 'мишень')){
    var map = { 'кнб':'1', 'угадай':'2', 'крестики':'3', 'кости':'4', 'мишень':'5' };
    var started2 = startBotGame(userNick, map[low]);
    if(started2) return started2;
  }

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

  const d = ['Привет! /help 🤖','Попробуй /help 😊','/game для игр 🎮','Что-то не понял. /help?'];
  return d[Math.floor(Math.random()*d.length)];
}

function sendBotReply(userNick, text){
  const reply = botReply(text, userNick);
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
    title: null, frame: null,
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
  if(m.text && m.text.indexOf('[gift]') === 0){
    var gd = null;
    try { gd = JSON.parse(m.text.substring(6, m.text.indexOf('[/gift]'))); } catch(e){}
    if(gd && gd.from !== req.nick && !me.isAdmin) return res.json({ error: 'Только отправитель подарка' });
  } else {
    if(m.from !== req.nick && !me.isAdmin) return res.json({ error: 'Только свои или админ' });
  }
  var fileUrl = extractFileUrl(m.text);
  arr.splice(idx, 1);
  saveDB();
  if(fileUrl) setTimeout(function(){ deleteFileIfUnused(fileUrl); }, 100);
  res.json({ ok: true });
});

/* ============ ПОДАРКИ ============ */
app.post('/api/gift/send', auth, (req, res) => {
  const me = DB.users[req.nick];
  const { to, amount } = req.body || {};
  if(me.banned) return res.json({ error: 'Ты забанен' });
  if(!to) return res.json({ error: 'Не указан получатель' });
  if(to === req.nick) return res.json({ error: 'Себе нельзя' });
  var u = DB.users[to];
  if(!u) return res.json({ error: 'Получатель не найден' });
  if(u.isBot) return res.json({ error: 'Боту нельзя' });
  var amt = parseInt(amount);
  if(!amt || amt <= 0) return res.json({ error: 'Введи сумму больше 0' });
  if(amt > 5000) return res.json({ error: 'Максимум 5000 W' });
  if(amt > me.coins) return res.json({ error: 'Недостаточно W (у тебя ' + me.coins + ')' });

  me.coins -= amt;
  u.coins += amt;

  var key = chatKey(req.nick, to);
  if(!DB.chats[key]) DB.chats[key] = [];
  var giftText = '[gift]' + JSON.stringify({ from: req.nick, to: to, amount: amt }) + '[/gift]';
  DB.chats[key].push({ from: req.nick, text: giftText, t: Date.now() });

  saveDB();
  console.log('Gift:', req.nick, '→', to, amt, 'W');
  res.json({ ok: true, me: publicUser(me), to: publicUser(u) });
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

/* ============ МАГАЗИН ============ */
const SHOP = [
  // Цвета ников (старые)
  {id:'nick_blue', title:'Синий ник', desc:'Цвет', price:50, color:'#4a7dff'},
  {id:'nick_green', title:'Зелёный ник', desc:'Цвет', price:50, color:'#22c55e'},
  {id:'nick_purple', title:'Фиолетовый ник', desc:'Цвет', price:80, color:'#a855f7'},
  {id:'nick_gold', title:'Золотой ник', desc:'Цвет', price:150, color:'#ffb800'},
  {id:'nick_pink', title:'Розовый ник', desc:'Цвет', price:80, color:'#ff4d9e'},
  {id:'nick_cyan', title:'Голубой ник', desc:'Цвет', price:70, color:'#06b6d4'},
  {id:'nick_orange', title:'Оранжевый ник', desc:'Цвет', price:70, color:'#ff7a00'},
  // 🎁 5 НОВЫХ НЕДОРОГИХ
  {id:'nick_brown', title:'Коричневый ник', desc:'Цвет', price:40, color:'#8B4513'},
  {id:'nick_gray', title:'Серый ник', desc:'Цвет', price:40, color:'#808080'},
  {id:'nick_lime', title:'Лаймовый ник', desc:'Цвет', price:60, color:'#84cc16'},
  {id:'badge_moon', title:'Значок 🌙', desc:'', price:90, badge:'🌙'},
  {id:'badge_flower', title:'Значок 🌸', desc:'', price:90, badge:'🌸'},
  // Значки (старые)
  {id:'badge_star', title:'Значок ⭐', desc:'', price:100, badge:'⭐'},
  {id:'badge_fire', title:'Значок 🔥', desc:'', price:120, badge:'🔥'},
  {id:'badge_crown', title:'Значок 👑', desc:'', price:250, badge:'👑'},
  {id:'badge_heart', title:'Значок 💖', desc:'', price:100, badge:'💖'},
  {id:'badge_rocket', title:'Значок 🚀', desc:'', price:180, badge:'🚀'},
  {id:'badge_diamond', title:'Значок 💎', desc:'', price:300, badge:'💎'},
  {id:'badge_skull', title:'Значок 💀', desc:'', price:220, badge:'💀'},
  {id:'badge_ghost', title:'Значок 👻', desc:'', price:150, badge:'👻'},
  // Аватары (старые)
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
  // 🌟 ЛЕГЕНДАРНЫЕ АВАТАРЫ
  {id:'av_eagle', title:'🦅 Орёл', desc:'Легендарный', price:5000, avatar:'🦅'},
  {id:'av_wolf', title:'🐺 Волк', desc:'Легендарный', price:6000, avatar:'🐺'},
  {id:'av_dragon_legend', title:'🐉 Дракон-легенда', desc:'Легендарный', price:8000, avatar:'🐉'},
  {id:'av_phoenix', title:'🦅🔥 Феникс', desc:'Легендарный', price:10000, avatar:'🦅'},
  {id:'av_king', title:'👑 Король', desc:'Легендарный', price:12000, avatar:'👑'},
  // 🎨 ТЕМЫ (старые)
  {id:'theme_gold', title:'Золотая тема', desc:'', price:400, theme:'gold'},
  {id:'theme_neon', title:'Неоновая тема', desc:'', price:400, theme:'neon'},
  // 🎨 ТЕМЫ (новые)
  {id:'theme_space', title:'🌌 Космическая тема', desc:'Фиолетовые акценты', price:25000, theme:'space'},
  {id:'theme_blood', title:'🩸 Кровавая тема', desc:'Красные акценты', price:30000, theme:'blood'},
  {id:'theme_hacker', title:'💚 Хакер', desc:'Зелёный на чёрном', price:35000, theme:'hacker'},
  {id:'theme_royal', title:'👑 Королевская тема', desc:'Фиолет+золото', price:40000, theme:'royal'},
  // 🏆 ТИТУЛЫ
  {id:'title_fast', title:'⚡ Быстрый', desc:'Титул', price:50000, title:'⚡ Быстрый'},
  {id:'title_star', title:'🌟 Звезда', desc:'Титул', price:50000, title:'🌟 Звезда'},
  {id:'title_unstoppable', title:'🔥 Неудержимый', desc:'Титул', price:50000, title:'🔥 Неудержимый'},
  {id:'title_legend', title:'💎 Легенда', desc:'Титул', price:70000, title:'💎 Легенда'},
  {id:'title_king', title:'👑 Король Wenchat', desc:'Титул', price:150000, title:'👑 Король Wenchat'},
  // 📋 ЗАЯВКА НА АДМИНА
  {id:'admin_apply', title:'📋 Заявка на админа', desc:'Доказательство готовности. Свяжись с создателем', price:90000}
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
  if(item.title) me.title = item.title;
  if(item.frame) me.frame = item.frame;
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
  if(item.title && me.title === item.title) me.title = null;
  if(item.frame && me.frame === item.frame) me.frame = null;
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
  if(item.title) me.title = item.title;
  if(item.frame) me.frame = item.frame;
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
  DB = { users:{}, chats:{}, groups:{}, channels:{}, botGames:{}, tokens:{}, pushSubs:{}, nextId:1, nextChannelId:1, nextFileId:1 };
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
