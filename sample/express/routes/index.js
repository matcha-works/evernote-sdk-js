var OAuth = require('oauth').OAuth,
    Evernote = require('evernote').Evernote,
    crypto = require('crypto'),
    fs = require('fs');


var config = require('../config.json');
var base_url = config.SANDBOX ? 'https://sandbox.evernote.com' : 'https://www.evernote.com';
var request_token_path = "/oauth";
var access_token_path = "/oauth";
var authorize_path = "/OAuth.action";

// home page
exports.index = function(req, res) {
  if(req.session.oauth_access_token) {
    var token = req.session.oauth_access_token;
    var transport = new Evernote.Thrift.NodeBinaryHttpTransport(req.session.edam_noteStoreUrl);
    var protocol = new Evernote.Thrift.BinaryProtocol(transport);
    var note_store = new Evernote.NoteStoreClient(protocol);
    note_store.listNotebooks(token, function(notebooks){
      req.session.notebooks = notebooks;
      res.render('index');

    });
  } else {
    res.render('index');
  }
};

// OAuth
exports.oauth = function(req, res) {

  var oauth = new OAuth(base_url + request_token_path,
      base_url + access_token_path,
      config.API_CONSUMER_KEY,
      config.API_CONSUMER_SECRET,
      "1.0",
      "http://localhost:3000/oauth_callback",
      "HMAC-SHA1");

  oauth.getOAuthRequestToken(function(error, oauth_token, oauth_token_secret, results){
    if(error) {
      console.log('error');
      console.log(error);
    }
    else {
      // store the tokens in the session
      req.session.oauth = oauth;
      req.session.oauth_token = oauth_token;
      req.session.oauth_token_secret = oauth_token_secret;

      // redirect the user to authorize the token
      res.redirect(base_url + authorize_path + "?oauth_token=" + oauth_token);
    }
  });

};

// OAuth callback
exports.oauth_callback = function(req, res) {
  var oauth = new OAuth(req.session.oauth._requestUrl,
      req.session.oauth._accessUrl,
      req.session.oauth._consumerKey,
      req.session.oauth._consumerSecret,
      req.session.oauth._version,
      req.session.oauth._authorize_callback,
      req.session.oauth._signatureMethod);

  oauth.getOAuthAccessToken(
      req.session.oauth_token,
      req.session.oauth_token_secret,
      req.param('oauth_verifier'),
      function(error, oauth_access_token, oauth_access_token_secret, results) {
        if(error) {
          console.log('error');
          console.log(error);
          res.redirect('/');
        } else {
          // store the access token in the session
          req.session.oauth_access_token = oauth_access_token;
          req.session.oauth_access_token_secret = oauth_access_token_secret;
          req.session.edam_shard = results.edam_shard;
          req.session.edam_userId = results.edam_userId;
          req.session.edam_expires = results.edam_expires;
          req.session.edam_noteStoreUrl = results.edam_noteStoreUrl;
          req.session.edam_webApiUrlPrefix = results.edam_webApiUrlPrefix;
          res.redirect('/');
        }
      });
};

// Clear session
exports.clear = function(req, res) {
  req.session.destroy();
  res.redirect('/');
};

// Crate a new note
exports.create = function(req, res) {
  if(req.session.oauth_access_token) {
    var token = req.session.oauth_access_token;
    var transport = new Evernote.Thrift.NodeBinaryHttpTransport(req.session.edam_noteStoreUrl);
    var protocol = new Evernote.Thrift.BinaryProtocol(transport);
    var note_store = new Evernote.NoteStoreClient(protocol);

    note_store.listNotebooks(token, function(notebooks){
      req.session.notebooks = notebooks;
      res.render('create');
    });
  } else {
    req.session.messages = ["Error: You are not logged in!"];
    res.redirect('/');
  }
};

// Confirm an updated note
exports.created = function(req, res) {
  if(req.session.oauth_access_token) {
    var token = req.session.oauth_access_token;
    var transport = new Evernote.Thrift.NodeBinaryHttpTransport(req.session.edam_noteStoreUrl);
    var protocol = new Evernote.Thrift.BinaryProtocol(transport);
    var note_store = new Evernote.NoteStoreClient(protocol);
    res.render('created');
  } else {
    req.session.messages = ["Error: You are not logged in!"];
    res.redirect('/');
  }
};

// Save a note
exports.save = function(req, res) {
  if(req.session.oauth_access_token) {
    var token = req.session.oauth_access_token;
    var transport = new Evernote.Thrift.NodeBinaryHttpTransport(req.session.edam_noteStoreUrl);
    var protocol = new Evernote.Thrift.BinaryProtocol(transport);
    var note_store = new Evernote.NoteStoreClient(protocol);

    var mtitle = req.body.title;
    var upfile = req.files.upfile;
    var mimetype = upfile.type;
    var filename = upfile.name;
    var size = upfile.size;

    var mdata = new Evernote.Data();

    fs.readFile(upfile.path, function read(err, data){
      if(err){
        throw err;
      }

      // To attach images, first convert Buffer type to Arraybuffer.
      var marraybuf = toArrayBuffer(data);
      mdata.body = marraybuf;
      mdata.size = marraybuf.byteLength;

      // Create md5 raw data of uploaded image and convert it to ArrayBuffer.
      var hash = crypto.createHash('md5').update(data).digest();
      var buf = new Buffer(hash, "utf8");
      mdata.bodyHash = toArrayBuffer(buf);

      var resource = new Evernote.Resource();
      resource.data = mdata;
      resource.mime = mimetype;

      var resources = new Array();
      resources[0] = resource;

      var mcontent = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>";
      mcontent += "<!DOCTYPE en-note SYSTEM \"http://xml.evernote.com/pub/enml2.dtd\">";
      mcontent = mcontent + "<en-note>" + req.body.content;
      mcontent += "<br />";
      mcontent = mcontent + "<en-media type=\"" + mimetype + "\" hash=\"" + crypto.createHash('md5').update(data).digest('Hex') + "\"/>";
      mcontent = mcontent + "</en-note>";

      var note = new Evernote.Note();
      note.title = mtitle;
      note.content = mcontent;
      note.resources = resources;

      if(req.body.notebookGuid){
        note.notebookGuid = req.body.notebookGuid;
      }
      note_store.createNote(token, note, function(note){
        res.redirect('created');
      });
    });

  } else {
    req.session.messages = ["Error: You are not logged in!"];
    res.redirect('/');
  }
};

function toArrayBuffer(buffer){
  var ab = new ArrayBuffer(buffer.length);
  view = new Uint8Array(ab);
  for (var i = 0; i < buffer.length; ++i) {
  view[i] = buffer[i];
  }
  return ab;
}
