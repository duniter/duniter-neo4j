"use strict";

const Q = require('q');
const co = require('co');
const duniter = require('duniter');
const neo4j = require('neo4j-driver').v1;
const ws = require('ws');

module.exports = (duniterServer, neo4jHost, neo4jPort) => {
    return new Neo4jService(duniterServer, neo4jHost, neo4jPort);
};

function Neo4jService(duniterServer, neo4jHost, neo4jPort) {

    const that = this;
    let db;

    this.getShorteningPath = (uid) => co(function*() {
        const session = that.db.session();
        try {
           const result = yield session.run({text:`MATCH p=( (n { uid:{uid}} ) <-[*2]- (f2f) )
WHERE NOT (n) --> (f2f) AND n <> f2f
RETURN f2f.uid, count(p), collect([ x in nodes(p)[1..-1] | x.uid])
ORDER BY count(p) DESC`,
               parameters: {uid: uid}});
            const shorteningPaths = [];
            for(const r of result.records) {
                const certifiers = [];
                for (const cert of r._fields[2]) {
                    certifiers.add(cert[0]);
                }
                shorteningPaths.add({
                    'f2f': r._fields[0],
                    'certifiers': certifiers,
                });
            }
            return shorteningPaths;
        } catch (e) {
            console.log(e);
        } finally {
            // Completed!
            session.close();
        }
        return []
    });

    this.refreshWoT = () => co(function*() {
        try {
            const session = that.db.session();
            console.log("Select identities");
            yield session.run("MATCH (n) DETACH\nDELETE n");
            console.log("Select identities");
            const identities = yield duniterServer.dal.idtyDAL.query('SELECT `pub`, `uid`,`member` FROM i_index;');
            console.log(identities);
            for(const idty in identities) {
                yield session.run({
                    text: "CREATE (n:Idty { pubkey: {pubkey}, uid: {uid}, member: {member} })",
                    parameters: {
                        pubkey: identities[idty].pub,
                        uid: identities[idty].uid,
                        member: identities[idty].member
                    }
                });
            }
            const certs = yield duniterServer.dal.certDAL.query('SELECT `issuer`,`receiver` FROM c_index;');
            console.log(certs);
            for(const c in certs) {
                yield session.run({text:"MATCH (u:Idty { pubkey:{issuer} }), (r:Idty { pubkey:{receiver} })\n\
    CREATE (u)-[:RELTYPE]->(r)",
                        parameters:{
                            issuer: certs[c].issuer,
                            receiver: certs[c].receiver
                        }
                });
            }
            console.log("Done");
        } catch (e) {
            console.log(e);
        } finally {
            // Completed!
            session.close();
        }

    });

    this.init = () => co(function*() {
        try {
            that.db = neo4j.driver("bolt://" + neo4jHost,
                neo4j.auth.basic('neo4j', 'duniter'));

            ws.connect("http://" + duniterServer.conf.ipv4 + ":" + duniterServer.conf.port + "/ws/block",
                () => co(function* () {
                        yield that.refreshWoT();
                    })
            );
            that.db.onError = (error) => {
                console.log(error);
            };

        } catch (e) {
            console.log(e);
        }

    });
}
