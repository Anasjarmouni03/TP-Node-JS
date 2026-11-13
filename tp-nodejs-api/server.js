const fs = require('fs');
const http = require('http');
const path = require('path');
const postManager = require('./postManager');

const PORT = Number(process.env.PORT || 3000);
const CLIENT_FILE = path.join(__dirname, 'client', 'index.html');
const MAX_BODY_BYTES = 64 * 1024;

function sendJson(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

function parseJsonBody(request, callback) {
  const chunks = [];
  let bytes = 0;
  let tooLarge = false;

  request.on('data', (chunk) => {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) {
      tooLarge = true;
      chunks.length = 0;
    } else {
      chunks.push(chunk);
    }
  });

  request.on('end', () => {
    if (tooLarge) return callback(413, 'Le corps de la requête dépasse 64 Kio.');

    let data;
    try {
      data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (error) {
      return callback(400, 'Le corps de la requête doit être un JSON valide.');
    }
    callback(null, null, data);
  });

  request.on('error', () => callback(400, 'Impossible de lire la requête.'));
}

function handleResult(response, successStatus) {
  return (error, result) => {
    if (error) {
      console.error(error.message);
      return sendJson(response, 500, { error: 'Erreur serveur.' });
    }
    if (result === null) return sendJson(response, 404, { error: 'Post introuvable.' });
    if (successStatus === 204) {
      response.writeHead(204);
      return response.end();
    }
    if (successStatus === 201) response.setHeader('Location', `/api/posts/${result.id}`);
    sendJson(response, successStatus, result);
  };
}

function savePost(request, response, id) {
  parseJsonBody(request, (status, message, data) => {
    if (response.destroyed || response.writableEnded) return;
    if (status) return sendJson(response, status, { error: message });

    if (!data || Array.isArray(data) || !Number.isSafeInteger(data.userId) || data.userId < 1 ||
        typeof data.title !== 'string' || !data.title.trim() ||
        typeof data.body !== 'string' || !data.body.trim()) {
      return sendJson(response, 400, {
        error: 'Indiquez un userId entier positif, un titre et un contenu non vides.'
      });
    }

    // Le serveur attribue l'identifiant à la création et conserve celui de l'URL à la mise à jour.
    const post = { userId: data.userId, title: data.title.trim(), body: data.body.trim() };
    if (id === null) return postManager.insertPost(post, handleResult(response, 201));
    postManager.updatePost(id, post, handleResult(response, 200));
  });
}

const server = http.createServer((request, response) => {
  const { method } = request;
  const pathname = request.url.split('?')[0];

  if (method === 'GET' && (pathname === '/' || pathname === '/client/index.html')) {
    fs.readFile(CLIENT_FILE, (error, html) => {
      if (error) return sendJson(response, 500, { error: 'Impossible de charger le client.' });
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(html);
    });
    return;
  }

  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const isCollection = pathname === '/api/posts';
  const match = /^\/api\/posts\/([1-9]\d*)$/.exec(pathname);
  const id = match ? Number(match[1]) : null;

  if (!isCollection && !Number.isSafeInteger(id)) {
    return sendJson(response, 404, { error: 'Route non trouvée.' });
  }

  if (method === 'OPTIONS') {
    response.writeHead(204);
    return response.end();
  }

  if (isCollection) {
    if (method === 'GET') return postManager.getAllPosts(handleResult(response, 200));
    if (method === 'POST') return savePost(request, response, null);
  } else {
    if (method === 'GET') return postManager.getPost(id, handleResult(response, 200));
    if (method === 'PUT') return savePost(request, response, id);
    if (method === 'DELETE') return postManager.deletePost(id, handleResult(response, 204));
  }

  response.setHeader('Allow', isCollection ? 'GET, POST, OPTIONS' : 'GET, PUT, DELETE, OPTIONS');
  sendJson(response, 405, { error: 'Méthode non autorisée pour cette route.' });
});

server.listen(PORT, 'localhost', () => {
  console.log(`Serveur démarré : http://localhost:${server.address().port}`);
});
