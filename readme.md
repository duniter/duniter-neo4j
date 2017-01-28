# duniter-neo4j

An API to request the WoT throught Neo4j graph database.

Requires Node.js v6

## Installation

    git clone https://github.com/Insoleet/duniter-neo4j.git
    cd duniter-wotcher
    npm install
    node index.js config --autoconf
    node index.js sync gtest.duniter.org 10900
    node index.js neo4j

Then, visit http://localhost:10500/neo4j/f2f/[uid].
