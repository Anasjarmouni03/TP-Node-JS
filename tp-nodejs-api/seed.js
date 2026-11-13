const https = require('https');
const fs = require('fs');
const path = require('path');

const API_URL = 'https://jsonplaceholder.typicode.com/posts';
const POSTS_FILE = path.join(__dirname, 'posts.json');
const REQUEST_TIMEOUT = 8000;

function fetchPosts() {
  return new Promise((resolve, reject) => {
    const request = https.get(API_URL, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`JSONPlaceholder a répondu avec le statut ${response.statusCode}.`));
        return;
      }

      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('error', reject);
      response.on('end', () => {
        try {
          const posts = JSON.parse(body);
          if (!Array.isArray(posts) || posts.length === 0) {
            throw new Error('La réponse ne contient pas de liste de posts.');
          }
          resolve(posts);
        } catch (error) {
          reject(error);
        }
      });
    });

    const timer = setTimeout(() => {
      request.destroy(new Error('Délai de réponse de JSONPlaceholder dépassé.'));
    }, REQUEST_TIMEOUT);
    request.on('close', () => clearTimeout(timer));
    request.on('error', reject);
  });
}

async function downloadPosts() {
  // Une nouvelle tentative permet de récupérer une coupure réseau passagère.
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fetchPosts();
    } catch (error) {
      if (attempt === 3) throw error;
    }
  }
}

async function savePosts(posts) {
  const temporaryFile = `${POSTS_FILE}.${process.pid}.tmp`;
  try {
    await fs.promises.writeFile(temporaryFile, `${JSON.stringify(posts, null, 2)}\n`, 'utf8');
    await fs.promises.rename(temporaryFile, POSTS_FILE);
  } catch (error) {
    await fs.promises.unlink(temporaryFile).catch(() => {});
    throw error;
  }
}

async function main() {
  const posts = await downloadPosts();
  await savePosts(posts);
  console.log(`${posts.length} posts enregistrés dans posts.json.`);
}

main().catch((error) => {
  console.error(`Échec de l’importation : ${error.message}`);
  process.exitCode = 1;
});
