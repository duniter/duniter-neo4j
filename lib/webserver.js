"use strict";

const Q = require('q');
const _ = require('underscore');
const co = require('co');
const http = require('http');
const morgan = require('morgan');
const express = require('express');
const bodyParser = require('body-parser');

module.exports = (host, port, neo4jService) => {

  var app = express();

  app.use(morgan('\x1b[90m:remote-addr - :method :url HTTP/:http-version :status :res[content-length] - :response-time ms\x1b[0m', {
    stream: {
      write: function(message){
        message && console.log(message.replace(/\n$/,''));
      }
    }
  }));
  app.use(bodyParser.urlencoded({ extended: true }));
  
  app.get('/neo4j/f2f/:uid', (req, res) => co(function *() {
    
    try {
      const f2f = yield neo4jService.getShorteningPath(req.params.uid);
	  // Send html page
	  res.status(200).send(JSON.stringify(f2f));
    } catch (e) {
	  // En cas d'exception, afficher le message
	  res.status(500).send('<pre>' + (e.stack || e.message) + '</pre>');
    }
  }));

//getSignersRecommendations
app.get('/neo4j/recommendations/signers/:uid/:steps/:uid2', (req, res) => co(function *() {
    
    try {
      const paths = yield neo4jService.getSignersRecommendations(req.params.uid, req.params.steps, req.params.uid2);
    // Send html page
    res.status(200).send(JSON.stringify(paths));
    } catch (e) {
    // En cas d'exception, afficher le message
    res.status(500).send('<pre>' + (e.stack || e.message) + '</pre>');
    }
  }));


//getSentriesPathsLengths
app.get('/neo4j/sentries/pathslengths/:uid', (req, res) => co(function *() {
    
    try {
      const paths = yield neo4jService.getSentriesPathsLengths(req.params.uid);
    // Send html page
    res.status(200).send(JSON.stringify(paths));
    } catch (e) {
    // En cas d'exception, afficher le message
    res.status(500).send('<pre>' + (e.stack || e.message) + '</pre>');
    }
  }));
  
  //getSentriesPathsLengthsMean
app.get('/neo4j/sentries/pathslengthsmean/:uid', (req, res) => co(function *() {
    
    try {
      const paths = yield neo4jService.getSentriesPathsLengthsMean(req.params.uid);
    // Send html page
    res.status(200).send(JSON.stringify(paths));
    } catch (e) {
    // En cas d'exception, afficher le message
    res.status(500).send('<pre>' + (e.stack || e.message) + '</pre>');
    }
  }));

// getAverageWotSize
app.get('/neo4j/sentries/averagesize', (req, res) => co(function *() {
    
    try {
      const size = yield neo4jService.getAverageWotSize();
    // Send html page
    res.status(200).send(JSON.stringify(size));
    } catch (e) {
    // En cas d'exception, afficher le message
    res.status(500).send('<pre>' + (e.stack || e.message) + '</pre>');
    }
  }));


  app.get('/neo4j/sentries/paths/:uid', (req, res) => co(function *() {
    
    try {
      const paths = yield neo4jService.getSentriesPaths(req.params.uid);
	  // Send html page
	  res.status(200).send(JSON.stringify(paths));
    } catch (e) {
	  // En cas d'exception, afficher le message
	  res.status(500).send('<pre>' + (e.stack || e.message) + '</pre>');
    }
  }));

  let httpServer = http.createServer(app);
  //httpServer.on('connection', function(socket) {
  //});
  httpServer.on('error', function(err) {
    httpServer.errorPropagates(err);
  });
  
  return {
    openConnection: () => co(function *() {
      try {
        yield Q.Promise((resolve, reject) => {
          // Weird the need of such a hack to catch an exception...
          httpServer.errorPropagates = function(err) {
            reject(err);
          };

          httpServer.listen(port, host, (err) => {
            if (err) return reject(err);
            resolve(httpServer);
          });
        });
        console.log('Server listening on http://' + host + ':' + port);
      } catch (e) {
        console.warn('Could NOT listen to http://' + host + ':' + port);
        console.warn(e);
      }
    }),
  };
};
