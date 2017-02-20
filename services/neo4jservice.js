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

                console.log("Running refreshWot");

                // Delete all nodes (it's for testing)
                //yield session.run("MATCH (n) DETACH\nDELETE n");

                // Initialize object variables
                const lastBlock = yield session.run("MATCH (n:Root) <-[:NEXT*1]- (b:Block) RETURN b.number as number, b.hash as hash");

                // Check the last block number in the database
                const max = (yield duniterServer.dal.bindexDAL.query('SELECT MAX(number) FROM block WHERE fork = 0'))[0]['MAX(number)'];
                //const max = 1000;

                if (!lastBlock.records[0]) {
                    // If it's the first run, there's no block

                    console.log("First run detected")
                    // Neo4j database has never been initialized
                    // Create root nodes
                    yield session.run("MERGE (n:Root)");
                    yield session.run("MERGE (n:Timeline)");
                    
                    lastBlockNumber = -1;
                    lastBlockHash = "";
 
                } else if ( lastBlock.records[0]._fields[0] < max ) {

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
                else {
                    return []
                }


            // Read blocks to import
            const blocks = (yield duniterServer.dal.bindexDAL.query("SELECT number, hash, previousHash, time, joiners, excluded, certifications\n\
                                                                                FROM block\n\
                                                                                WHERE fork = 0 AND number > " + lastBlockNumber + " AND number <= " + max + "\n\
                                                                                ORDER BY number"));
            
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
                        text: "MATCH (t:Timeline),(block:Block {number:{number}})\n\
                        MERGE (t) -[y:CONTAINS {year:{blockYear}}]-> (yf:Year) \n\
                        MERGE (yf) -[m:CONTAINS {month:{blockMonth}}]-> (mf:Month)\n\
                        MERGE (mf) -[d:CONTAINS {day:{blockDay}}]-> (df:Day)\n\
                        MERGE (df) -[h:CONTAINS {hour:{blockHour}}]-> (hf:Hour)\n\
                        MERGE (block) -[:HAPPENED_ON]-> (hf)\n\
                        WITH yf,mf,df,hf\n\
                        OPTIONAL MATCH (previousHour:Hour)\n\
                        WHERE NOT (previousHour) -[:NEXT]-> () AND previousHour <> hf\n\
                        OPTIONAL MATCH (previousDay:Day)\n\
                        WHERE NOT (previousDay) -[:NEXT]-> () AND previousDay <> df\n\
                        OPTIONAL MATCH (previousMonth:Month)\n\
                        WHERE NOT (previousMonth) -[:NEXT]-> () AND previousMonth <> mf\n\
                        OPTIONAL MATCH (previousYear:Year)\n\
                        WHERE NOT (previousYear) -[:NEXT]-> () AND previousYear <> yf\n\
                        FOREACH (n in case when previousHour is Null then [] else [previousHour] end | MERGE (previousHour) -[:NEXT]-> (hf) )\n\
                        FOREACH (n in case when previousDay is Null then [] else [previousDay] end | MERGE (previousDay) -[:NEXT]-> (df) )\n\
                        FOREACH (n in case when previousMonth is Null then [] else [previousMonth] end | MERGE (previousMonth) -[:NEXT]-> (mf) )\n\
                        FOREACH (n in case when previousYear is Null then [] else [previousYear] end | MERGE (n) -[:NEXT]-> (yf) )",
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

                //yield that.refreshWot();

                that.refreshWot();
                setInterval(that.refreshWot, 3 * 60 * 1000);
                

                that.db.onError = (error) => {
                    console.log(error);
                };

        } catch (e) {
            console.log(e);
        }
    });     

}
