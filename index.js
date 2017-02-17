"use strict";

const co = require('co');
const main = require('./lib/main.js');
const duniter = require('duniter');

/****************************************
 * TECHNICAL CONFIGURATION
 ***************************************/

// Default Duniter node's database
const HOME_DUNITER_DATA_FOLDER = 'duniter_neo4j';

// host on which UI is available
const SERVER_HOST = 'localhost';

// port on which UI is available
const SERVER_PORT = 10500;

/****************************************
 * SPECIALIZATION
 ***************************************/

const stack = duniter.statics.autoStack([{
  name: 'neo4j',
  required: {

    duniter: {

      cli: [{
        name: 'neo4j [host] [port]',
        desc: 'Starts watching wot',

        // Disables Duniter node's logs
        logs: false,

        onDatabaseExecute: (server, conf, program, params, startServices) => co(function*() {

	// Duniter-Neo4j UI parameters
          const SERVER_HOST = params[0] || DEFAULT_HOST;
          const SERVER_PORT = parseInt(params[1]) || DEFAULT_PORT;

          // IMPORTANT: release Duniter services from "sleep" mode
          yield startServices();

          // Main Loop
          yield main(server, SERVER_HOST, SERVER_PORT);

          // Wait forever, Duniter-Neo4j is a permanent program
          yield new Promise(() => null);
        })
      }]
    }
  }
}]);

co(function*() {
  if (!process.argv.includes('--mdb')) {
    // We use the default database
    process.argv.push('--mdb');
    process.argv.push(HOME_DUNITER_DATA_FOLDER);
  }
  
  // Execute our program
  yield stack.executeStack(process.argv);
  // End
  process.exit();
});
