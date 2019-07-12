const fs = require('fs');
const skypeHttp = require('skype-http');
const debug = require('debug')('matrix-puppet:skype:client');
const Promise = require('bluebird');

// look at
// https://github.com/ocilo/skype-http/blob/master/src/example/main.ts
const EventEmitter = require('events').EventEmitter;

const { download, entities } = require('./utils');

class Client extends EventEmitter {
  constructor(auth) {
    super();
    this.api = null;
    this.auth = auth;
    this.lastMsgId = null;
    this.selfSentFiles = [];
  }
  removeSelfSentFile(s) {
    let match = false;
    while (true) {
      let i = this.selfSentFiles.indexOf(s);
      if (i == -1) {
        return match;
      }
      match = true;
      this.selfSentFiles.splice(i, 1);
    }
  }
  async connect() {
    const opts = {
      credentials: this.auth,
      verbose: true
    }

    try {
      this.api = await skypeHttp.connect(opts);

      this.api.on("event", (ev) => {
        //debug(ev);

        if (ev && ev.resource) {
          switch (ev.resource.type) {
            case "Text":
            case "RichText":
              if (ev.resource.from.username === this.api.context.username) {
                // the lib currently hides this kind from us. but i want it.
                if (ev.resource.content.slice(-1) !== '\ufeff') {
                  this.emit('sent', ev.resource);
                }
              } else {
                this.emit('message', ev.resource);
              }
              break;
            case "RichText/UriObject":
              if (!this.removeSelfSentFile(ev.resource.original_file_name)) {
                if (ev.resource.from.username === this.api.context.username) {
                  ev.resource.from.raw = undefined;
                }
                this.emit('image', ev.resource)
              }
              break;
          }
        }
      });

      // Log every error
      this.api.on("error", (err) => {
        debug(`An error was detected: ${err}`);
        this.emit('error', err);
      });

      this.contacts = await this.api.getContacts();
      debug(`got ${contacts.length} contacts`);

      debug('listening for events');
      await this.api.listen();

      debug('setting status online');
      const res = await this.api.setStatus('Online');

      return res;
    } catch (err) {
      debug(err);
      process.exit(0);
    }
  }

  sendMessage(threadId, msg) {
    return this.api.sendMessage(msg, threadId);
  }

  sendPictureMessage(threadId, data) {
    this.selfSentFiles.push(data.name);
    return this.api.sendImage({
      file: data.file,
      name: data.name
    }, threadId).catch((err) => {
      this.removeSelfSentFile(data.name);
      this.api.sendMessage({ textContent: '[Image] <a href="'+entities.encode(data.url)+'">'+entities.encode(data.name)+'</a>' }, threadId);
    });
  }
  getContact(id) {
    let contact = this.contacts.find((c) => {
      return c.id.id === id || c.id.raw === id;
    });
    if (contact) {
      return contact;
    }
  }
  getConversation(id) {
    return this.api.getConversation(id);
  }
  downloadImage(url) {
    return download.getBufferAndType(url, {
      cookies: this.api.context.cookies,
      headers: {
        Authorization: 'skype_token ' + this.api.context.skypeToken.value
      }
    });
  }
}

module.exports = Client;

if (!module.parent) {
  const yaml = require('js-yaml');
  const client = new Client(yaml.safeLoad('./config.yaml').skype);
  (async () => {
    await client.connect();
    client.on('message', (ev) => {
      debug('>>> message', ev);
    });

    client.on('sent', (ev) => {
      debug('>>> sent', ev);
    });

    client.sendMessage('8:green.streak', { textContent: 'test from nodejs' });
  })();
}
