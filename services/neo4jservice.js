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
    this.updateDB = () => co(function*() {

        const session = that.db.session();
        try {

            var nextBlockNumber = lastBlockNumber + 1;
            const nextBlock = (yield duniterServer.dal.bindexDAL.query("SELECT number, previousHash\n\
                                                                         FROM block\n\
                                                                         WHERE fork = 0 AND number = " + nextBlockNumber ));

            console.log("Checking Fork. nextBlockpreviousHash : " + nextBlock['previousHash'] + " lastBlockHash : " + lastBlockHash);

            // In case of fork
            if (nextBlock['previousHash'] != lastBlockHash) {

                // Find fork point
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

                } while (nextBlock['previousHash'] != lastBlockHash)


                // Destroy all data after fork
                /* MATCH p=( (root:Root) <-[:NEXT*1..]- (b:Block {number:0}) )
                    WITH nodes(p) as blocks
                    UNWIND blocks as block
                        OPTIONAL MATCH (block) <-[i]- (:Idty)
                        DELETE i
                        WITH block
                        OPTIONAL MATCH (block) <-- (cert:Certificate)
                        DETACH DELETE cert
                */

                yield tx.run({
                    text: "MATCH p=( (n:Root) <-[:NEXT*1..]- (b:Block {number:{number}}) )\n\
                           WITH collect(nodes(p)[1..-1]) as collect_blocks\n\
                           UNWIND collec_blocks as block\n\
                           OPTIONAL MATCH (block) -[c]-> (node)",
                        parameters: {
                            number: lastBlockNumber
                        }
                });

            }

            // Check how many blocks have to be imported
            //const max = (yield duniterServer.dal.bindexDAL.query('SELECT MAX(number) FROM block'))[0];
            const max = 10;

            // Read blocks to import
            const blocks = (yield duniterServer.dal.bindexDAL.query("SELECT number, hash, previousHash, time, joiners, excluded, certifications\n\
                                                                                FROM block\n\
                                                                                WHERE fork = 0 AND number > " + lastBlockNumber + " AND number <= " + max + "\n\
                                                                                ORDER BY number"));


            // for each block, update Neo4j
            // Note : Using transactions to speed up node creations (10 times faster)

            var tx = session.beginTransaction();
            //for(var block_number = 1; block_number <= max['MAX(number)']; block_number ++) {
            for(var i = 0; i < blocks.length; i ++) {
                    
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
                                    lastBlockNumber: blocks[blocks.length - 1]['number']
                                }
                            });

            tx.commit();
        

           

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

            const session = that.db.session();
            try {
                
                // Delete all nodes (it's for testing)
                yield session.run("MATCH (n) DETACH\nDELETE n");

                // Create root nodes and first block if does not exist
                yield session.run("MERGE (n:Root)");
                yield session.run("MERGE (n:Timeline)");

                // Initialize object variables
                const lastBlock = yield session.run("MATCH (n:Root) <-[:NEXT*1]- (b:Block) RETURN b.number, b.hash");

                // If it's the first run, there's no block
                if (!lastBlock.records[0]) {
                    lastBlockNumber = -1;
                    lastBlockHash = "";
                } else {
                    lastBlockNumber = lastBlock.records[0]._fields[0];
                    lastBlockHash = lastBlock.records[0]._fields[1];
                }


            } catch (e) {
                console.log(e);
            } finally {
                // Completed!
                session.close();
            }

            yield that.updateDB();
            that.db.onError = (error) => {
                console.log(error);
            };
        } catch (e) {
            console.log(e);
        }
    });     

}
