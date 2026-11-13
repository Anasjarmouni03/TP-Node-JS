const fs = require('fs');
const path = require('path');

const POSTS_FILE = path.join(__dirname, 'posts.json');
const TEMP_FILE = `${POSTS_FILE}.${process.pid}.tmp`;

function getAllPosts(callback) {
  fs.readFile(POSTS_FILE, 'utf8', (error, data) => {
    if (error) return callback(error);

    let posts;
    try {
      posts = JSON.parse(data);
      if (!Array.isArray(posts)) throw new Error('posts.json doit contenir un tableau.');
    } catch (parseError) {
      return callback(parseError);
    }

    callback(null, posts);
  });
}

function getPost(id, callback) {
  getAllPosts((error, posts) => {
    if (error) return callback(error);
    callback(null, posts.find((post) => post.id === id) || null);
  });
}

function insertPost(newPost, callback) {
  changePosts((posts) => {
    const maxId = posts.reduce((max, post) => Math.max(max, post.id), 0);
    const post = { ...newPost, id: maxId + 1 };
    posts.push(post);
    return post;
  }, callback);
}

function updatePost(id, updatedPost, callback) {
  changePosts((posts) => {
    const index = posts.findIndex((post) => post.id === id);
    if (index === -1) return null;

    posts[index] = { ...updatedPost, id };
    return posts[index];
  }, callback);
}

function deletePost(id, callback) {
  changePosts((posts) => {
    const index = posts.findIndex((post) => post.id === id);
    if (index === -1) return null;

    return posts.splice(index, 1)[0];
  }, callback);
}

function savePosts(posts, callback) {
  // Un lecteur voit le fichier complet, avant ou après le remplacement.
  fs.writeFile(TEMP_FILE, `${JSON.stringify(posts, null, 2)}\n`, 'utf8', (error) => {
    if (error) return fs.unlink(TEMP_FILE, () => callback(error));
    fs.rename(TEMP_FILE, POSTS_FILE, (renameError) => {
      if (renameError) return fs.unlink(TEMP_FILE, () => callback(renameError));
      callback(null);
    });
  });
}

const pendingChanges = [];

function changePosts(change, callback) {
  // Traiter une modification à la fois évite que deux requêtes écrasent leurs changements.
  pendingChanges.push({ change, callback });
  if (pendingChanges.length === 1) runNextChange();
}

function runNextChange() {
  const current = pendingChanges[0];
  if (!current) return;

  function finish(error, result) {
    try {
      current.callback(error, result);
    } finally {
      pendingChanges.shift();
      runNextChange();
    }
  }

  getAllPosts((error, posts) => {
    if (error) return finish(error);

    let result;
    try {
      result = current.change(posts);
    } catch (changeError) {
      return finish(changeError);
    }

    if (result === null) return finish(null, null);
    savePosts(posts, (writeError) => finish(writeError, result));
  });
}

module.exports = { getAllPosts, getPost, insertPost, updatePost, deletePost };
