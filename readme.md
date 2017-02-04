# duniter-neo4j

An API to request the WoT throught Neo4j graph database.

Requires Node.js v6
Requires Yarn
https://yarnpkg.com/docs/install/

## Installation


    git clone https://github.com/duniter/duniter-neo4j.git
    cd duniter-neo4j
    yarn
    node index.js config --autoconf

    update the config file (ex : ~/.config/duniter/duniter_neo4j/conf.json)
     add your login/password in order to access to your database

        "neo4j": {
	 "user": "neo4j",
	  "password": "password"
	}


    node index.js sync gtest.duniter.org 10900
    node index.js neo4j

Then, visit http://localhost:10500/neo4j/f2f/[uid].
