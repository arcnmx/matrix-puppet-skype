#!/usr/bin/env node

global.Olm = require('olm');
const {
  MatrixAppServiceBridge: {
    Cli, AppServiceRegistration
  },
  Puppet,
  MatrixPuppetBridgeBase
} = require("matrix-puppet-bridge");
const SkypeClient = require('./client');
const path = require('path');
const debug = require('debug')('matrix-puppet:skype');
const { skypeify, deskypeify } = require('./skypeify');
const tmp = require('tmp-promise');
const Promise = require('bluebird');
const fs = require('fs');
const { download, entities } = require('./utils');

const a2b = a => new Buffer(a).toString('base64');
const b2a = b => new Buffer(b, 'base64').toString('ascii');

class App extends MatrixPuppetBridgeBase {
  getServicePrefix() {
    return this.config.homeserver.prefix;
  }

  getServiceName() {
    return "Skype";
  }

  async lateInit() {
    await this.joinThirdPartyUsersToStatusRoom(this.client.contacts.map(c => ({
      name: c.displayName,
      userId: a2b(c.personId || c.mri),
      avatarUrl: c.profile.avatarUrl
    })));
  }

  async initThirdPartyClient(config) {
    this.client = new SkypeClient(config.skype);

    this.client.on('error', async (err) => {
      try {
        await this.sendStatusMsg({}, err);
      } catch (err) {
        debug(err);
      }
    });

    this.client.on('message', async (data) => {
      debug('message', data);
      const {
        type,
        from: { raw },
        conversation, content
      } = data;

      try {
        await this.handleSkypeMessage({
          type: type,
          roomId: a2b(conversation),
          sender: raw,
          content: content
        });
      } catch(err) {
        debug(err);
      }
    });

    this.client.on('sent', async (data) => {
      debug('sent', data);
      const { type, conversation, content } = data;

      try {
        await this.handleSkypeMessage({
          type: type,
          roomId: a2b(conversation),
          sender: undefined,
          content: content
        });
      } catch (err) {
        debug(err);
      }
    });

    this.client.on('image', async (data) => {
      const {
        type,
        from: { raw },
        conversation, uri, original_file_name
      } = data;
      try {
        await this.handleSkypeImage({
          type: type,
          roomId: a2b(conversation),
          sender: raw,
          url: uri+'/views/imgpsh_fullsize',
          name: original_file_name
        });
      } catch (err) {
        debug(err);
      }
    });

    return await this.client.connect();
  }

  getThirdPartyUserDataById_noPromise(id) {
    let contact = this.client.getContact(id);
    let payload = {}
    if (contact) {
      payload.senderName = contact.displayName;
      payload.avatarUrl = contact.profile.avatarUrl;
    } else if (data.sender.indexOf(":") =! -1) {
      payload.senderName = data.sender.substr(data.sender.indexOf(":")+1);
      payload.avatarUrl = 'https://avatars.skype.com/v1/avatars/' + entities.encode(payload.senderName) + '/public?returnDefaultImage=false&cacheHeaders=true';
    } else {
      payload.senderName = id;
    }
    return payload;
  }

  getPayload(data) {
    let payload = {
      roomId: data.roomId.replace(':', '^'),
    };
    if (data.sender === undefined) {
      payload.senderId = undefined;
    } else {
      payload.senderId = a2b(data.sender);
      Object.assign(payload, this.getThirdPartyUserDataById_noPromise(data.sender));
    }
    debug(payload);
    return payload;
  }

  async handleSkypeMessage(data) {
    let payload = this.getPayload(data);
    payload.text = deskypeify(data.content);
    return await this.handleThirdPartyRoomMessage(payload);
  }

  async handleSkypeImage(data) {
    let payload = this.getPayload(data);
    payload.text = data.name;
    payload.path = ''; // needed to not create internal errors
    try {
      const { buffer, type } = await this.client.downloadImage(data.url);

      payload.buffer = buffer;
      payload.mimetype = type;
      return await this.handleThirdPartyRoomImageMessage(payload);
    } catch (err) {
      debug(err);
      payload.text = '[Image] ('+data.name+') '+data.url;
      return await this.handleThirdPartyRoomMessage(payload);
    }
  }

  async getThirdPartyUserDataById(id) {
    let raw = b2a(id);
    return this.getThirdPartyUserDataById_noPromise(raw);
  }

  async getThirdPartyRoomDataById(id) {
    let raw = b2a(id);
    let payload = {};
    let contact = this.client.getContact(raw);
    if (contact) {
      return {
        name: deskypeify(contact.displayName),
        topic: "Skype Direct Message"
      };
    }
    const res = await this.client.getConversation(raw);
    return {
      name: deskypeify(res.threadProperties.topic),
      topic: res.type.toLowerCase() == "conversation" ? "Skype Direct Message" : "Skype Group Chat"
    };
  }

  sendReadReceiptAsPuppetToThirdPartyRoomWithId() {
    // no-op for now
  }

  sendMessageAsPuppetToThirdPartyRoomWithId(id, text) {
    return this.client.sendMessage(b2a(id), {
      textContent: skypeify(text)
    });
  }

  async sendImageMessageAsPuppetToThirdPartyRoomWithId(id, data) {
    const { fd, path, cleanup } = await tmp.file();
    const tmpFile = fs.createWriteStream(null, { fd: fd });
    const { buffer, type } = await download.getBufferAndType(data.url);
    await Promise.promisify(tmpFile.write)(buffer)
    await Promise.promisify(tmpFile.close)();
    const res = await this.client.sendPictureMessage(b2a(id), {
      file: path,
      name: data.text,
      url: data.url
    });
    cleanup();
    return res;
  }
}

new Cli({
  enableLocalpart: true,
  bridgeConfig: {
    affectsRegistration: true,
    defaults: {
      homeserver: {
        localpart: "skypebot",
        prefix: "@skype_"
      },
    },

    schema: {
      type: "object",
      properties: Object.assign(Puppet.configSchemaProperties(), {
        homeserver: {
          type: "object",
          properties: {
            localpart: "string",
            prefix: "string",
          }
        },
        skype: {
          type: "object",
          username: {
            type: "string"
          },
          password: {
            type: "string"
          }
        },
      })
    }
  },
  generateRegistration: function(reg, callback) {
    const config = this.getConfig();

    return (async () => {
      try {
        reg.setId(AppServiceRegistration.generateToken());
        reg.setHomeserverToken(AppServiceRegistration.generateToken());
        reg.setAppServiceToken(AppServiceRegistration.generateToken());
        reg.setSenderLocalpart(config.homeserver.localpart);
        reg.addRegexPattern("users", `@${config.homeserver.prefix}_.*`, true);
        reg.addRegexPattern("rooms", `#${config.homeserver.prefix}_.*`, true);
        reg.addRegexPattern("aliases", `#${config.homeserver.prefix}_.*`, true);

        const puppet = new Puppet({
          config: config
        });

        await puppet.associate({
          detectConfigPath: true,
          registration: reg
        });

        return callback(reg);
      } catch (err) {
        debug('generateRegistration', err.message);
        process.exit(-1);
      }
    })();
  },
  run: async function(port, config, reg) {
    try {
      const puppet = new Puppet({
        config: config
      });
      const app = new App(config, puppet, null, reg);
      debug('starting matrix client');
      await puppet.startClient();
      debug('starting skype client');
      await app.initThirdPartyClient(config);
      await app.bridge.run(port, config);
      debug('Matrix-side listening on port %s', port);
      await app.lateInit();
    } catch (err) {
      debug(err.message);
      process.exit(-1);
    };
  }
}).run();
