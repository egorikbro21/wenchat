const express = require('express');
const app = express();
app.use(express.json());
app.use(express.static('public'));

const users = {};
const messages = {};

app.post('/api/register', (req, res) => {
  const { nick, pass } = req.body;
  if (!nick || !pass) return res.json({ error: 'Заполни всё' });
  if (users[nick]) return res.json({ error: 'Ник занят' });
  users[nick] = { nick, pass, id: String(Object.keys(users).length + 1).padStart(6, '0') };
  res.json({ ok: true, user: users[nick] });
});

app.post('/api/login', (req, res) => {
  const { nick, pass } = req.body;
  if (!users[nick] || users[nick].pass !== pass) return res.json({ error: 'Неверно' });
  res.json({ ok: true, user: users[nick] });
});

app.get('/api/users', (req, res) => res.json(Object.values(users)));

app.post('/api/send', (req, res) => {
  const { from, to, text } = req.body;
  const key = [from, to].sort().join('|');
  if (!messages[key]) messages[key] = [];
  messages[key].push({ from, text, t: Date.now() });
  res.json({ ok: true });
});

app.get('/api/messages/:a/:b', (req, res) => {
  const key = [req.params.a, req.params.b].sort().join('|');
  res.json(messages[key] || []);
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('Wenchat server on ' + PORT);
});
