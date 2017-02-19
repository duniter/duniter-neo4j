"use strict";

const Q = require('q');
const co = require('co');
const es = require('event-stream');
const duniter = require('duniter');
const neo4j = require('neo4j-driver').v1;
const ws = require('ws');

module.exports = (duniterServer, neo4jHost, neo4jPort) => {
    return new Neo4jService(duniterServer, neo4jHost, neo4jPort);
};

function Neo4jService(duniterServer, neo4jHost, neo4jPort) {

    const that = this;
    let db;
    var lastBlockNumber;
    var lastBlockHash;


    // Import Data from blocks table
    this.refreshWot = () => co(function*() {

        const session = that.db.session();
        try {

                // Delete all nodes (it's for testing)
                //yield session.run("MATCH (n) DETACH\nDELETE n");

                // Initialize object variables
                const lastBlock = yield session.run("MATCH (n:Root) <-[:NEXT*1]- (b:Block) RETURN b.number as number, b.hash as hash");
                
                if (!lastBlock.records[0]) {
                    // If it's the first run, there's no block

                    console.log("First run detected")
                    // Neo4j database has never been initialized
                    // Create root nodes
                    yield session.run("MERGE (n:Root)");
                    yield session.run("MERGE (n:Timeline)");
                    
                    lastBlockNumber = -1;
                    lastBlockHash = "";

                } else {

                        lastBlockNumber = lastBlock.records[0]._fields[0];
                        lastBlockHash = lastBlock.records[0]._fields[1];
                        

                        var nextBlockNumber = lastBlockNumber + 1;
                        var nextBlock = (yield duniterServer.dal.bindexDAL.query("SELECT number, previousHash\n\
                                                                             FROM block\n\
                                                                             WHERE fork = 0 AND number = " + nextBlockNumber )); 
                        // console.log("Last Block Number : " + lastBlockNumber + ", lastBlockHash : " + lastBlockHash + "nextBlockPreviousHash : " + nextBlock[0]['number'])

                    if (nextBlock[0]['previousHash'] != lastBlockHash) {
                        // There is a fork
                        // Find fork point

                        console.log("Fork detected")

                        var i = 2;
                        do {

                            const lastBlock = yield session.run("MATCH (n:Root) <-[:NEXT*" + i + "]- (b:Block) RETURN b.number, b.hash");
                            lastBlockNumber = lastBlock.records[0]._fields[0];
                            lastBlockHash = lastBlock.records[0]._fields[1];

                            nextBlockNumber = lastBlockNumber + 1;
                            nextBlock = (yield duniterServer.dal.bindexDAL.query("SELECT number, previousHash\n\
                                                                                 FROM block\n\
                                                                                 WHERE fork = 0 AND number = " + nextBlockNumber ));  
                            i ++;

                            console.log("lastBlockNumber : " + lastBlockNumber + ", lastBlockHash : " + lastBlockHash + ", nextBlockPreviousHash : " + nextBlock[0]['previousHash'])

                        } while (nextBlock[0]['previousHash'] != lastBlockHash)

                        // Destroy all data after fork
                        yield session.run({
                        text: "MATCH p=( (root:Root) <-[:NEXT*1..]- (b:Block {number:{nextBlockNumber}}) )\n\
                        WITH nodes(p)[1..] as blocks\n\
                        UNWIND blocks as block\n\
                            OPTIONAL MATCH (block) <-[i]- (:Idty)\n\
                            DELETE i\n\
                            WITH block\n\
                            OPTIONAL MATCH (block) <-- (cert:Certificate)\n\
                            DETACH DELETE cert\n\
                            WITH block\n\
                            DETACH DELETE block",
                            parameters: {
                                nextBlockNumber: nextBlockNumber
                            }
                        });

                    } 

                }
            // Check how many blocks have to be imported
            const max = (yield duniterServer.dal.bindexDAL.query('SELECT MAX(number) FROM block WHERE fork = 0'))[0]['MAX(number)'];

            // Read blocks to import
            const blocks = (yield duniterServer.dal.bindexDAL.query("SELECT number, hash, previousHash, time, joiners, excluded, certifications\n\
                                                                                FROM block\n\
                                                                                WHERE fork = 0 AND number > " + lastBlockNumber + " AND number <= " + max + "\n\
                                                                                ORDER BY number"));

            // Check there is at least one block to import
            if (blocks[0]) {
            
                // for each block, update Neo4j
                // Note : Using transactions to speed up node creations (10 times faster)

                var tx = session.beginTransaction();
                for(var i = 0; i < blocks.length; i ++) {

                        console.log("Import Block : " + blocks[i]['number']);

                        yield tx.run({
                        text: "CREATE (block:Block {number:{number}, hash:{hash}, previousHash:{previousHash}, time:{time}})\n\
                        WITH block\n\
                        MATCH (previousblock {number:{previousBlockNumber}})\n\
                        CREATE (previousblock) -[:NEXT]-> (block)",
                            parameters: {
                                number: blocks[i]['number'],
                                time: blocks[i]['time'],
                                hash: blocks[i]['hash'],
                                previousHash: blocks[i]['previousHash'],
                                previousBlockNumber: blocks[i]['number'] - 1
                            }
                        });

                        // Create join identities
                        const joiners = JSON.parse(blocks[i]['joiners'])

                        for(const joiner of joiners) {

                            yield tx.run({
                            text: "MERGE (identity:Idty {pubkey:{pubkey}, uid:{uid}})\n\
                            WITH identity\n\
                            MATCH (block {number:{number}})\n\
                            CREATE (identity) -[:JOIN]-> (block)",
                                parameters: {
                                    number: blocks[i]['number'],
                                    uid: joiner.split(":")[4],
                                    pubkey: joiner.split(":")[0]
                                }
                            });  
                        }

                        // Create excluded identities
                        const excluded = JSON.parse(blocks[i]['excluded'])

                        for(const member of excluded) {

                            yield tx.run({
                            text: "MATCH (identity:Idty {pubkey:{pubkey}), (block {number:{number}})\n\
                            CREATE (identity) -[:EXCLUDED]-> (block)",
                                parameters: {
                                    number: blocks[i]['number'],
                                    pubkey: member
                                }
                            });  
                        }

                        // Create certifications
                        const certifications = JSON.parse(blocks[i]['certifications'])

                        for(const certificate of certifications) {

                            yield tx.run({
                            text: "MATCH (idty_from:Idty {pubkey:{pubkey_from}}), (idty_to:Idty {pubkey:{pubkey_to}}), (block {number:{number}})\n\
                            CREATE (c:Certificate) -[:WRITTEN]-> (block)\n\
                            CREATE (idty_from) <-[:FROM]- (c) -[:TO]-> (idty_to)",
                                parameters: {
                                    number: blocks[i]['number'],
                                    pubkey_from: certificate.split(":")[0],
                                    pubkey_to: certificate.split(":")[1]
                                }
                            }); 

                        }


                        // Update the timeline
                        var blockTime = new Date(blocks[i]['time'] * 1000);
                        var blockYear = String(blockTime.getUTCFullYear());
                        var blockMonth = String(blockTime.getUTCMonth()) + 1;
                        var blockDay = String(blockTime.getUTCDate());
                        var blockHour = String(blockTime.getUTCHours());
                        
                        yield tx.run({
                        text: "MATCH (timeline:Timeline),(block:Block {number:{number}})\n\
                        MERGE (year:Year {year:{blockYear}})\n\
                        MERGE (month:Month {month:{blockMonth}})\n\
                        MERGE (day:Day {day:{blockDay}})\n\
                        MERGE (hour:Hour {hour:{blockHour}})\n\
                        MERGE (timeline) -[:CONTAINS]-> (year)\n\
                        MERGE (year)-[:CONTAINS]-> (month)\n\
                        MERGE (month)-[:CONTAINS]-> (day) \n\
                        MERGE (day)-[:CONTAINS]-> (hour) \n\
                        MERGE (block) -[:HAPPENED_ON]-> (hour)\n\
                        WITH timeline,year,month,day,hour\n\
                        MATCH (day) --> (previousHour) WHERE NOT (previousHour) --> () AND previousHour <> hour\n\
                        CREATE (previousHour) -[:NEXT]-> (hour)\n\
                        WITH timeline,year,month,day\n\
                        MATCH (month) --> (previousDay) WHERE NOT (previousDay) --> () AND previousDay <> day\n\
                        CREATE (previousDay) -[:NEXT]-> (day)\n\
                        WITH timeline,year,month\n\
                        MATCH (year) --> (previousMonth) WHERE NOT (previousMonth) --> () AND previousMonth <> month\n\
                        CREATE (previousMonth) -[:NEXT]-> (month)\n\
                        WITH timeline,year\n\
                        MATCH (timeline) --> (previousYear) WHERE NOT (previousYear) --> () AND previousYear <> year\n\
                        CREATE (previousYear) -[:NEXT]-> (year)",
                            parameters: {
                                number: blocks[i]['number'],
                                blockYear: blockYear,
                                blockMonth: blockMonth,
                                blockDay: blockDay,
                                blockHour: blockHour
                            }
                        });

                    }


                // Update the root node link to the last block
                yield tx.run({text:"MATCH (root:Root)\n\
                                    OPTIONAL MATCH (root) <-[next:NEXT]- ()\n\
                                    DELETE next\n\
                                    WITH root\n\
                                    MATCH (block {number:{lastBlockNumber}})\n\
                                    CREATE (root) <-[:NEXT]- (block)",
                                    parameters: {
                                        // need to change the last block element 
                                        lastBlockNumber: blocks[blocks.length - 1]['number']

                                    }
                                });
            
                tx.commit();
            }

        } catch (e) {
            console.log(e);
        } finally {
            // Completed!
            session.close();
        }
        return []
    });


    this.betainit = () => co(function*() {

        try {
                that.db = neo4j.driver("bolt://" + neo4jHost,
                neo4j.auth.basic(duniterServer.conf.neo4j.user, duniterServer.conf.neo4j.password));

                yield that.refreshWot();

                that.db.onError = (error) => {
                    console.log(error);
                };

        } catch (e) {
            console.log(e);
        }
    });     

}
