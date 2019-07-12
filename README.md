# skype-bridge [![#matrix-puppet-bridge:matrix.org](https://img.shields.io/matrix/matrix-puppet-bridge:matrix.org.svg?label=%23matrix-puppet-bridge%3Amatrix.org&logo=matrix&server_fqdn=matrix.org)](https://matrix.to/#/#matrix-puppet-bridge:matrix.org)

This is a Matrix bridge for Skype. It uses [skype-http](https://github.com/ocilo/skype-http) under the hood.

## features

- [x] Skype to Matrix direct text message
- [x] Matrix to Skype direct text message
- [x] Skype to Matrix direct image attachment message
- [x] Matrix to Skype direct image attachment message
- [x] group messaging
- [ ] read receipts
- [ ] contact list syncing

## installation

clone this repo

cd into the directory

run `yarn install`

## configure

Copy `config.sample.yaml` to `config.yaml` and update it to match your setup

## register the app service

Generate a `registration.yaml` file with `yarn run reg http://your-bridge-server.example.com:8090`

Copy this `registration.yaml` file to your home server, and update your `homeserver.yaml` file's `app_service_config_files` with the path to the `registration.yaml` file.

Launch the bridge with `yarn run start`.

Restart your HS.

## Discussion, Help and Support

Join us in the [![Matrix Puppet Bridge](https://user-images.githubusercontent.com/13843293/52007839-4b2f6580-24c7-11e9-9a6c-14d8fc0d0737.png)](https://matrix.to/#/#matrix-puppet-bridge:matrix.org) room

# TODO
* Be able to originate conversations from the Matrix side.
