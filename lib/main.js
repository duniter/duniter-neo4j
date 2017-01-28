"use strict";

const co = require('co');
const webserver = require('./webserver.js');
const duniter = require('./duniter.js');
const neo4jservice = require('../services/neo4jservice.js');

/****************************
 * Main algorithm
 */
module.exports = (duniterServer, host, port) => co(function *() {

  // Get msValidity and sigValidity parameters
  const parameters = yield duniterServer.dal.peerDAL.query('SELECT `parameters` from block where `number`=0');

  const neo4jService = neo4jservice(duniterServer, "localhost", 7687);
  yield neo4jService.init();
  
  // Specialize node UI
  let httpServer = webserver(host, port, neo4jService);
  yield httpServer.openConnection();


})
  .catch((err) => console.error(err.stack || err));
  
