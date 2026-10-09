/**
 * Family Health Registry: family storage.
 *
 * Keeps the family's sync files in a folder in this Google account's Drive,
 * so every family phone can send and receive records through one link.
 * The app encrypts everything with the family code before sending it, so
 * this script (and Google) only ever store scrambled text.
 *
 * Set up: Deploy > New deployment > Web app. Execute as: Me.
 * Who has access: Anyone. Then paste the Web app URL into the app.
 */
var FOLDER_NAME = 'Family Health Registry (encrypted)';
var NAME = /^[A-Za-z0-9_.-]{1,100}$/;
var SMALL = 9 * 1024 * 1024;

function doGet() {
  return reply({ ok: true, app: 'fhr-store', version: 1 });
}

function doPost(e) {
  try {
    return reply(handle(JSON.parse(e.postData.contents)));
  } catch (err) {
    return reply({ ok: false, error: 'bad-request', detail: String((err && err.message) || err) });
  }
}

function reply(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function handle(req) {
  if (!req || typeof req.token !== 'string' || req.token.length < 32) return { ok: false, error: 'unauthorized' };
  var props = PropertiesService.getScriptProperties();
  var hash = digest(req.token);
  var saved = props.getProperty('tokenHash');
  if (!saved) {
    // The first phone to connect (the main family member's) claims this storage for its family.
    if (req.op !== 'hello') return { ok: false, error: 'not-set-up' };
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      saved = props.getProperty('tokenHash');
      if (!saved) {
        props.setProperty('tokenHash', hash);
        saved = hash;
      }
    } finally {
      lock.releaseLock();
    }
  }
  if (saved !== hash) return { ok: false, error: 'unauthorized' };

  var folder = getFolder(props);
  if (req.op === 'hello') return { ok: true, app: 'fhr-store', version: 1 };
  if (req.op === 'list') {
    var files = [];
    var it = folder.getFiles();
    while (it.hasNext()) {
      var f = it.next();
      files.push({ name: f.getName(), modified: f.getLastUpdated().toISOString(), size: f.getSize() });
    }
    return { ok: true, files: files };
  }
  if (typeof req.name !== 'string' || !NAME.test(req.name)) return { ok: false, error: 'bad-name' };
  if (req.op === 'get') {
    var found = folder.getFilesByName(req.name);
    return found.hasNext() ? { ok: true, content: found.next().getBlob().getDataAsString() } : { ok: false, error: 'not-found' };
  }
  if (req.op === 'put') {
    if (typeof req.content !== 'string') return { ok: false, error: 'bad-request' };
    var writeLock = LockService.getScriptLock();
    writeLock.waitLock(30000);
    try {
      var existing = folder.getFilesByName(req.name);
      var file = existing.hasNext() ? existing.next() : null;
      if (file && req.content.length < SMALL) {
        file.setContent(req.content);
      } else {
        // Large files are replaced rather than overwritten (Drive's limit for overwriting text).
        if (file) file.setTrashed(true);
        folder.createFile(Utilities.newBlob(req.content, 'text/plain', req.name));
      }
    } finally {
      writeLock.releaseLock();
    }
    return { ok: true };
  }
  return { ok: false, error: 'bad-op' };
}

function getFolder(props) {
  var id = props.getProperty('folderId');
  if (id) {
    try {
      var folder = DriveApp.getFolderById(id);
      if (!folder.isTrashed()) return folder;
    } catch (err) {
      // Deleted: make a new one below.
    }
  }
  var created = DriveApp.createFolder(FOLDER_NAME);
  props.setProperty('folderId', created.getId());
  return created;
}

function digest(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes
    .map(function (b) {
      return ('0' + (b & 255).toString(16)).slice(-2);
    })
    .join('');
}
