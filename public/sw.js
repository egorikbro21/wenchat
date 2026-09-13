self.addEventListener('push', function(event){
  var data = { title: 'Wenchat', body: 'Новое сообщение' };
  try { data = event.data.json(); } catch(e){}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon.png',
      badge: '/icon.png',
      tag: 'wenchat-' + data.from
    })
  );
});

self.addEventListener('notificationclick', function(event){
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
