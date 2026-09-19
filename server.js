const express = require('express');
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static('public'));

const DATA_FILE = '/app/data/data.json';

// VAPID ключи для push-уведомлений (сгенерируй свои на https://vapidkeys.com/)
const VAPID_PUBLIC = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
const VAPID_PRIVATE = 'UUxI4O8-FbRouAevSmBQ6o3JsRH6n3YnQxWBMHR9HnY';
try { webpush.setVapidDetails('mailto:admin@wenchat.local', VAPID_PUBLIC, VAPID_PRIVATE); } catch(e){ console.log('VAPID setup err', e.message); }

// ---------- ХРАНИЛИЩЕ ----------
let DB = {
  users: {},
  chats: {},
  groups: {},
  tokens: {},
  pushSubs: {},
  nextId: 1
};

function loadDB(){
  try {
    if(fs.existsSync(DATA_FILE)){
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      DB = parsed;
      DB.users = DB.users || {};
      DB.chats = DB.chats || {};
      DB.groups = DB.groups || {};
      DB.tokens = DB.tokens || {};
      DB.pushSubs = DB.pushSubs || {};
      DB.nextId = DB.nextId || 1;
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
    console.log('DB saved to', DATA_FILE);
  } catch(e){ console.log('saveDB err', e.message); }
}
loadDB();

// ---------- НАСТРОЙКИ ----------
const DEV_CODE = "Wendrt-Super-Secret-Dev-Code-2025-Xyz!";
const ADMIN_NICK = "Wendrt";

function genId(){
  const id = String(DB.nextId).padStart(6, '0');
  DB.nextId++;
  return id;
}
function findUserById(id){
  for(const k in DB.users) if(DB.users[k].id === id) return DB.users[k];
  return null;
}
function chatKey(a,b){ return 'p:' + [a,b].sort().join('|'); }
function groupKey(gid){ return 'g:' + gid; }

// ---------- СЕССИИ (в файле) ----------
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

// ---------- ПУБЛИЧНЫЙ ЮЗЕР ----------
function publicUser(u) {
  return {
    nick: u.nick, id: u.id, coins: u.coins,
    isAdmin: !!u.isAdmin, color: u.color || null,
    badge: u.badge || null, avatar: u.avatar || null,
    theme: u.theme || null,
    banned: !!u.banned, banReason: u.banReason || null,
    purchases: u.purchases || [],
    removedItems: u.removedItems || [],
    contacts: u.contacts || [],
    isBot: !!u.isBot
  };
}

// ---------- РЕГИСТРАЦИЯ ----------
app.post('/api/register', (req, res) => {
  const { nick, pass } = req.body || {};
  if(!nick || !pass) return res.json({ error: 'Заполни всё' });
  if(nick.length < 3) return res.json({ error: 'Ник минимум 3 символа' });
  if(pass.length < 3) return res.json({ error: 'Пароль минимум 3 символа' });
  if(DB.users[nick]) return res.json({ error: 'Ник занят' });

  const newId = genId();
  const isOwner = (nick === ADMIN_NICK) || (newId === '000003');
  DB.users[nick] = {
    nick, pass, id: newId, coins: 0,
    isAdmin: isOwner,
    color: isOwner ? '#ff2b2b' : null,
    badge: null, avatar: null, theme: null,
    banned: false, banReason: null,
    purchases: [], contacts: []
  };
  saveDB();
  const token = makeToken(nick);
  res.json({ ok: true, token, user: publicUser(DB.users[nick]) });
});

// ---------- ВХОД ----------
app.post('/api/login', (req, res) => {
  const { nick, pass } = req.body || {};
  const u = DB.users[nick];
  if(!u || u.pass !== pass) return res.json({ error: 'Неверный ник или пароль' });
  if(u.banned) return res.json({ error: '🚫 Ты забанен' + (u.banReason ? ': ' + u.banReason : '') });
  if(u.nick === ADMIN_NICK || u.id === '000003'){
    u.isAdmin = true;
    if(!u.color) u.color = '#ff2b2b';
  }
  const token = makeToken(nick);
  res.json({ ok: true, token, user: publicUser(u) });
});

// ---------- ПРОФИЛЬ ----------
app.get('/api/me', auth, (req, res) => {
  const u = DB.users[req.nick];
  if(!u) return res.json({ error: 'Нет юзера' });
  res.json({ ok: true, user: publicUser(u) });
});

// ---------- ВСЕ ЮЗЕРЫ ----------
app.get('/api/users', auth, (req, res) => {
  const list = Object.values(DB.users).map(publicUser);
  res.json(list);
});

// ---------- ПОИСК ПО ID ----------
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

// ---------- СООБЩЕНИЯ ----------
app.get('/api/messages', auth, (req, res) => {
  const { withNick, gid } = req.query;
  if(gid){
    const key = groupKey(gid);
    return res.json({ ok: true, msgs: DB.chats[key] || [] });
  }
  if(!withNick) return res.json({ error: 'Нет собеседника' });
  const key = chatKey(req.nick, withNick);
  res.json({ ok: true, msgs: DB.chats[key] || [] });
});

app.post('/api/send', auth, (req, res) => {
  const me = DB.users[req.nick];
  if(me.banned) return res.json({ error: 'Ты забанен' });
  const { to, gid, text } = req.body || {};
  if(!text || !text.trim()) return res.json({ error: 'Пусто' });

  let key, recipients = [];
  if(gid){
    const g = DB.groups[gid];
    if(!g || g.members.indexOf(req.nick) === -1) return res.json({ error: 'Не в группе' });
    key = groupKey(gid);
    recipients = g.members.filter(n => n !== req.nick);
  } else if(to){
    key = chatKey(req.nick, to);
    recipients = [to];
  } else return res.json({ error: 'Некуда' });

  if (!DB.chats[key]) DB.chats[key] = [];
  const msg = { from: req.nick, text: text.trim(), t: Date.now() };
  DB.chats[key].push(msg);
  saveDB();

  // Бот отвечает
  const botUser = DB.users[BOT_NICK];
  if (botUser && !gid && to === BOT_NICK) {
    setTimeout(function () {
      const reply = botReply(text);
      const botKey = chatKey(BOT_NICK, req.nick);
      if (!DB.chats[botKey]) DB.chats[botKey] = [];
      DB.chats[botKey].push({ from: BOT_NICK, text: reply, t: Date.now() });
      saveDB();
    }, 500);
  }

  // Push-уведомления получателям
  recipients.forEach(function(nick){
    const subs = DB.pushSubs[nick] || [];
    subs.forEach(function(sub){
      webpush.sendNotification(sub, JSON.stringify({
        title: req.nick,
        body: text.trim().slice(0, 100),
        from: req.nick
      })).catch(function(err){ console.log('push err', err.message); });
    });
  });

  res.json({ ok: true });
});

// ---------- УДАЛЕНИЕ СООБЩЕНИЯ (админ) ----------
app.post('/api/msg/delete', auth, (req, res) => {
  const me = DB.users[req.nick];
  if(!me.isAdmin) return res.json({ error: 'Только админ' });
  const { withNick, gid, idx } = req.body || {};
  let key;
  if(gid) key = groupKey(gid);
  else if(withNick) key = chatKey(req.nick, withNick);
  else return res.json({ error: 'Нет чата' });

  const arr = DB.chats[key];
  if(!arr || idx < 0 || idx >= arr.length) return res.json({ error: 'Нет сообщения' });
  arr.splice(idx, 1);
  saveDB();
  res.json({ ok: true });
});

// ---------- ГРУППЫ ----------
app.get('/api/groups', auth, (req, res) => {
  const mine = {};
  for(const gid in DB.groups){
    if(DB.groups[gid].members.indexOf(req.nick) !== -1) mine[gid] = DB.groups[gid];
  }
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

// ---------- МАГАЗИН ----------
const SHOP = [
  {id:'nick_blue', title:'Синий ник', desc:'Цвет ника', price:50, color:'#4a7dff'},
  {id:'nick_green', title:'Зелёный ник', desc:'Цвет ника', price:50, color:'#22c55e'},
  {id:'nick_purple', title:'Фиолетовый ник', desc:'Цвет ника', price:80, color:'#a855f7'},
  {id:'nick_gold', title:'Золотой ник', desc:'Цвет ника', price:150, color:'#ffb800'},
  {id:'nick_pink', title:'Розовый ник', desc:'Цвет ника', price:80, color:'#ff4d9e'},
  {id:'nick_cyan', title:'Голубой ник', desc:'Цвет ника', price:70, color:'#06b6d4'},
  {id:'nick_orange', title:'Оранжевый ник', desc:'Цвет ника', price:70, color:'#ff7a00'},
  {id:'badge_star', title:'Значок ⭐', desc:'Звёздочка', price:100, badge:'⭐'},
  {id:'badge_fire', title:'Значок 🔥', desc:'Огонёк', price:120, badge:'🔥'},
  {id:'badge_crown', title:'Значок 👑', desc:'Корона', price:250, badge:'👑'},
  {id:'badge_heart', title:'Значок 💖', desc:'Сердечко', price:100, badge:'💖'},
  {id:'badge_rocket', title:'Значок 🚀', desc:'Ракета', price:180, badge:'🚀'},
  {id:'badge_diamond', title:'Значок 💎', desc:'Алмаз', price:300, badge:'💎'},
  {id:'badge_skull', title:'Значок 💀', desc:'Череп', price:220, badge:'💀'},
  {id:'badge_ghost', title:'Значок 👻', desc:'Призрак', price:150, badge:'👻'},
  {id:'av_cat', title:'Аватар 🐱', desc:'Котик', price:90, avatar:'🐱'},
  {id:'av_dog', title:'Аватар 🐶', desc:'Собачка', price:90, avatar:'🐶'},
  {id:'av_fox', title:'Аватар 🦊', desc:'Лисичка', price:110, avatar:'🦊'},
  {id:'av_lion', title:'Аватар 🦁', desc:'Лев', price:140, avatar:'🦁'},
  {id:'av_dragon', title:'Аватар 🐲', desc:'Дракон', price:200, avatar:'🐲'},
  {id:'av_alien', title:'Аватар 👽', desc:'Инопланетянин', price:170, avatar:'👽'},
  {id:'av_robot', title:'Аватар 🤖', desc:'Робот', price:170, avatar:'🤖'},
  {id:'av_ninja', title:'Аватар 🥷', desc:'Ниндзя', price:230, avatar:'🥷'},
  {id:'theme_gold', title:'Золотая тема', desc:'Золотые акценты', price:400, theme:'gold'},
  {id:'theme_neon', title:'Неоновая тема', desc:'Неон', price:400, theme:'neon'}
];

app.get('/api/shop', auth, (req, res) => {
  res.json(SHOP);
});

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

app.post('/api/shop/remove', auth, (req, res) => {
  const me = DB.users[req.nick];
  const { id } = req.body || {};
  const item = SHOP.find(i => i.id === id);
  if(!item) return res.json({ error: 'Нет товара' });
  const idx = (me.purchases||[]).indexOf(id);
  if(idx === -1) return res.json({ error: 'Не куплено' });
  me.purchases.splice(idx, 1);
  if(item.color && me.color === item.color) me.color = me.isAdmin ? '#ff2b2b' : null;
  if(item.badge && me.badge === item.badge) me.badge = null;
  if(item.avatar && me.avatar === item.avatar) me.avatar = null;
  if(item.theme && me.theme === item.theme) me.theme = null;
  saveDB();
  res.json({ ok: true, user: publicUser(me) });
});

// ---------- PUSH-ПОДПИСКА ----------
app.get('/api/push/key', (req, res) => {
  res.json({ key: VAPID_PUBLIC });
});

app.post('/api/push/subscribe', auth, (req, res) => {
  const { sub } = req.body || {};
  if(!sub) return res.json({ error: 'Нет sub' });
  DB.pushSubs = DB.pushSubs || {};
  if(!DB.pushSubs[req.nick]) DB.pushSubs[req.nick] = [];
  const exists = DB.pushSubs[req.nick].some(s => s.endpoint === sub.endpoint);
  if(!exists){
    DB.pushSubs[req.nick].push(sub);
    saveDB();
  }
  res.json({ ok: true });
});

// ---------- АДМИН ----------
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
  saveDB();
  res.json({ ok: true, user: publicUser(u) });
});

app.post('/api/admin/set-admin', auth, (req, res) => {
  const me = DB.users[req.nick];
  if(!me.isAdmin) return res.json({ error: 'Только админ' });
  const { nick, isAdmin, colorRed } = req.body || {};
  const u = DB.users[nick];
  if(!u) return res.json({ error: 'Нет юзера' });
  if(typeof isAdmin === 'boolean') u.isAdmin = isAdmin;
  if(typeof colorRed === 'boolean'){
    u.color = colorRed ? '#ff2b2b' : (u.isAdmin ? '#ff2b2b' : null);
  }
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

app.post('/api/admin/wipe', auth, (req, res) => {
  const me = DB.users[req.nick];
  if(!me.isAdmin) return res.json({ error: 'Только админ' });
  DB = { users:{}, chats:{}, groups:{}, tokens:{}, pushSubs:{}, nextId:1 };
  saveDB();
  res.json({ ok: true });
});

// ---------- ЧАТ-БОТ 999999 ----------
const BOT_ID = '999999';
const BOT_NICK = 'Wenbot';

app.post('/api/bot/init', auth, (req, res) => {
  // Создаём бота, если его нет
  if (!DB.users[BOT_NICK]) {
    DB.users[BOT_NICK] = {
      nick: BOT_NICK, pass: 'bot_' + Math.random().toString(36).slice(2),
      id: BOT_ID, coins: 0, isAdmin: false,
      color: '#a855f7', badge: '🤖', avatar: '🤖', theme: null,
      banned: false, banReason: null,
      purchases: [], contacts: [], isBot: true
    };
    saveDB();
  }
  const me = DB.users[req.nick];
  if (!me.contacts) me.contacts = [];
  if (me.contacts.indexOf(BOT_NICK) === -1) {
    me.contacts.push(BOT_NICK);
    saveDB();
  }
  res.json({ ok: true, user: publicUser(DB.users[BOT_NICK]) });
});

function botReply(text) {
  const t = (text || '').trim();
  const low = t.toLowerCase();

  if (low === '/help' || low === 'помощь' || low === 'help') {
    return '🤖 **Мои команды:**\n\n' +
      '📌 Базовое:\n/help — все команды\n/ping — проверить связь\n/id — твой ID\n/time — время\n/date — дата\n\n' +
      '🧮 Полезное:\n/calc 2+2 — калькулятор\n/random 1 100 — случайное число\n/coin — монетка\n/dice — кубик\n/password 16 — пароль\n\n' +
      '🌍 Инфо:\n/weather Москва — погода\n/wiki Россия — справка\n\n' +
      '🎉 Приколы:\n/joke — шутка\n/fact — факт\n/quote — цитата\n/8ball Вопрос? — магический шар\n/love Ты и Я — совместимость\n\n' +
      'Просто напиши мне что-нибудь — отвечу 😊';
  }

  if (low === '/ping') return '🏓 Понг! Я на связи.';
  if (low === '/id') return '🆔 Твой ID виден в ⚙️ Настройки → Мой ID';
  if (low === '/time') {
    const d = new Date();
    return '🕐 ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  if (low === '/date') {
    const d = new Date();
    return '📅 ' + d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  if (low.startsWith('/calc')) {
    const expr = t.slice(5).trim();
    if (!expr) return '🧮 Пример: /calc 2+2';
    if (!/^[\d\s+\-*/().,%]+$/.test(expr)) return '⚠️ Только цифры и + - * / ( )';
    try {
      const result = Function('"use strict";return (' + expr.replace(/,/g, '.') + ')')();
      return '🧮 ' + expr + ' = ' + result;
    } catch (e) { return '⚠️ Не смог посчитать'; }
  }
  if (low.startsWith('/random')) {
    const m = t.match(/(\d+)\s+(\d+)/);
    if (!m) return '🎲 Пример: /random 1 100';
    const a = parseInt(m[1]), b = parseInt(m[2]);
    if (a >= b) return '⚠️ Первое число должно быть меньше';
    return '🎲 Случайное: ' + (Math.floor(Math.random() * (b - a + 1)) + a);
  }
  if (low === '/coin') return Math.random() < 0.5 ? '🪙 Орёл!' : '🪙 Решка!';
  if (low === '/dice') return '🎲 Выпало: ' + (Math.floor(Math.random() * 6) + 1);
  if (low.startsWith('/password')) {
    const m = t.match(/\d+/);
    const len = m ? Math.min(parseInt(m[0]), 64) : 16;
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let p = '';
    for (let i = 0; i < len; i++) p += chars[Math.floor(Math.random() * chars.length)];
    return '🔐 Пароль (' + len + '):\n' + p;
  }
  if (low.startsWith('/weather')) {
    const city = t.slice(8).trim();
    if (!city) return '🌤 Пример: /weather Москва';
    return '🌤 Погода в ' + city + ':\n(скоро подключу API)';
  }
  if (low.startsWith('/wiki')) {
    const q = t.slice(5).trim();
    if (!q) return '📚 Пример: /wiki Россия';
    return '📚 ' + q + ':\n(скоро подключу API)';
  }
  if (low === '/joke') {
    const jokes = [
      '— Почему программисты путают Хэллоуин и Рождество?\n— Потому что Oct 31 == Dec 25 🎃',
      '— Сколько программистов нужно, чтобы вкрутить лампочку?\n— Ни одного, это аппаратная проблема 💡',
      '— Какой любимый напиток программиста?\n— Java ☕',
      '— Что говорит программист, когда тонет?\n— F1! F1! 🆘',
      '— Почему Java-разработчики носят очки?\n— Потому что не видят C# 👓'
    ];
    return jokes[Math.floor(Math.random() * jokes.length)];
  }
  if (low === '/fact') {
    const facts = [
      '🐙 У осьминога три сердца.',
      '🍯 Мёд никогда не портится.',
      '🌍 Земля вращается вокруг Солнца со скоростью 107 000 км/ч.',
      '🐌 У улитки около 25 000 зубов.',
      '🦈 Акулы существуют дольше, чем деревья.',
      '⚡ Молния горячее поверхности Солнца в 5 раз.',
      '🎈 Первый компьютер Apple стоил $666,66.',
      '🐘 Слоны — единственные животные, которые не умеют прыгать.'
    ];
    return facts[Math.floor(Math.random() * facts.length)];
  }
  if (low === '/quote') {
    const quotes = [
      '«Не откладывай на завтра то, что можно сделать послезавтра.» 😴',
      '«Единственный способ делать великие дела — любить то, что делаешь.» — Стив Джобс',
      '«Успех — это способность идти от неудачи к неудаче, не теряя энтузиазма.» — Черчилль',
      '«Код, который работает — не трогай.» — Народная мудрость 👨‍💻',
      '«Простота — высшая форма изящества.» — Леонардо да Винчи'
    ];
    return quotes[Math.floor(Math.random() * quotes.length)];
  }
  if (low.startsWith('/8ball')) {
    const q = t.slice(6).trim();
    if (!q) return '🔮 Задай вопрос: /8ball Я сдам экзамен?';
    const answers = [
      '✅ Да, однозначно!',
      '✅ Скорее да.',
      '🤔 Возможно.',
      '🤔 Не уверен.',
      '❌ Скорее нет.',
      '❌ Нет.',
      '🔮 Спроси позже.',
      '✨ Всё в твоих руках!'
    ];
    return '🔮 ' + answers[Math.floor(Math.random() * answers.length)];
  }
  if (low.startsWith('/love')) {
    const parts = t.slice(5).trim();
    if (!parts) return '💖 Пример: /love Ты и Я';
    const h = parts.split('').reduce(function (a, c) { return a + c.charCodeAt(0); }, 0);
    const pct = (h * 7) % 101;
    return '💖 Совместимость: ' + pct + '%\n' + (pct > 70 ? '💘 Отличная пара!' : pct > 40 ? '😊 Есть шансы!' : '😅 Может, просто друзья?');
  }

  // Дефолтный ответ
  const defaults = [
    'Привет! Я Wenbot 🤖 Напиши /help, чтобы узнать команды.',
    'Хм, интересно! Попробуй /help — там много полезного 😊',
    'Я пока учусь. Напиши /help, если нужна помощь!',
    'Что-то я не понял. Может, /help? 😅',
    'Хорошего дня! ☀️ Если нужны команды — /help'
  ];
  return defaults[Math.floor(Math.random() * defaults.length)];
}

// ---------- СНЯТЫЕ ПРЕДМЕТЫ ----------
// Хранятся в поле removedItems у каждого юзера
app.post('/api/shop/unequip', auth, (req, res) => {
  const me = DB.users[req.nick];
  const { id } = req.body || {};
  const item = SHOP.find(i => i.id === id);
  if (!item) return res.json({ error: 'Нет товара' });
  if ((me.purchases || []).indexOf(id) === -1) return res.json({ error: 'Не куплено' });

  // Убираем из purchases
  me.purchases.splice(me.purchases.indexOf(id), 1);
  // Добавляем в removedItems
  me.removedItems = me.removedItems || [];
  if (me.removedItems.indexOf(id) === -1) me.removedItems.push(id);
  // Сбрасываем эффект
  if (item.color && me.color === item.color) me.color = me.isAdmin ? '#ff2b2b' : null;
  if (item.badge && me.badge === item.badge) me.badge = null;
  if (item.avatar && me.avatar === item.avatar) me.avatar = null;
  if (item.theme && me.theme === item.theme) me.theme = null;
  saveDB();
  res.json({ ok: true, user: publicUser(me) });
});

app.post('/api/shop/re-equip', auth, (req, res) => {
  const me = DB.users[req.nick];
  const { id } = req.body || {};
  const item = SHOP.find(i => i.id === id);
  if (!item) return res.json({ error: 'Нет товара' });
  me.removedItems = me.removedItems || [];
  if (me.removedItems.indexOf(id) === -1) return res.json({ error: 'Не снято' });
  me.removedItems.splice(me.removedItems.indexOf(id), 1);
  me.purchases = me.purchases || [];
  if (me.purchases.indexOf(id) === -1) me.purchases.push(id);
  if (item.color) me.color = item.color;
  if (item.badge) me.badge = item.badge;
  if (item.avatar) me.avatar = item.avatar;
  if (item.theme) me.theme = item.theme;
  saveDB();
  res.json({ ok: true, user: publicUser(me) });
});

app.post('/api/shop/forget', auth, (req, res) => {
  const me = DB.users[req.nick];
  const { id } = req.body || {};
  me.removedItems = me.removedItems || [];
  const idx = me.removedItems.indexOf(id);
  if (idx === -1) return res.json({ error: 'Не снято' });
  me.removedItems.splice(idx, 1);
  saveDB();
  res.json({ ok: true, user: publicUser(me) });
});

// ---------- ГЛАВНАЯ ----------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('Wenchat server on ' + PORT);
});
