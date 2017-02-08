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


    // Get Recommendations to enter the Wot when I know a single member
    this.getSignersRecommendations = (uid,steps,uid2) => co(function*() {
        const session = that.db.session();
        try {

	   // Get stepmax for sentries
           const stepsMax = duniterServer.conf.stepMax;
	   const sigStock = duniterServer.conf.sigStock;

           const result = yield session.run({text:
		"MATCH (a { uid:{uid}} ) -[*.."+ steps + "]- (b), (sentry {sentry:1})\n\
		WHERE NOT a.nb_issued_sig = {sigStock} AND NOT b.nb_issued_sig = {sigStock} AND sentry <> a AND sentry <> b AND NOT b.uid = {uid2} AND NOT sentry.uid = {uid2}\n\
		\n\
		WITH  a, b, collect(DISTINCT sentry) as collect_sentry, count( DISTINCT sentry) as count_sentry\n\
		UNWIND collect_sentry AS sentry\n\
		OPTIONAL MATCH p1=ShortestPath((a) <-[*.." + stepsMax + " ]- (sentry {sentry:1})), \n\
		p2=ShortestPath((b) <-[*.." + stepsMax + "]- (sentry {sentry:1}))\n\
		OPTIONAL MATCH p3=ShortestPath((c {uid:{uid2}}) <-[*.." + stepsMax + "]- (sentry {sentry:1}))\n\
		\n\
		WITH a, b, c, p1, p2, p3, sentry, count_sentry, 3 as stepmax\n\
		WHERE length(p1) < {stepsMax} OR length(p2) < {stepsMax} OR length(p3) < {stepsMax}\n\
		\n\
		WITH a.uid as a_uid, b.uid as b_uid, c.uid as c_uid, count(sentry) as reachable_sentries, count_sentry as total_sentries, 100.0 * count(sentry) / count_sentry as percent\n\
		ORDER BY percent DESC\n\
		LIMIT 10\n\
		RETURN a_uid, c_uid, b_uid, percent",
                parameters: {
                    uid: uid,
		    uid2: uid2,
		    steps: steps,
		    sigStock: sigStock,
                    stepsMax: stepsMax}});

            const SignersRecommendations = [];
            for(const r of result.records) {
                SignersRecommendations.add({
                    'referring_member': r._fields[0],
                    'optionnal_second_member': r._fields[1],
		    'recommended_member': r._fields[2],
		    'percent_sentries' : r._fields[3]
                });
            }
            return SignersRecommendations;
        } catch (e) {
            console.log(e);
        } finally {
            // Completed!
            session.close();
        }
        return []
    });


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

    this.getSentriesPaths = (uid) => co(function*() {
        const session = that.db.session();
        try {

	   const result = yield session.run({text:
			"MATCH p=allShortestPaths((n {uid : {uid}}) <-[*]- (sentry {sentry : 1}))\n\
			RETURN sentry.uid,count(p),length(p),collect([ x in nodes(p)[1..-1] | x.uid])\n\
			ORDER BY count(p) DESC",
               parameters: {uid: uid}});

	    const sentriesPaths = [];
            for(const r of result.records) {

                const paths = [];
                for (const path of r._fields[3]) {
                    paths.add(path[0]);
                }
		
                sentriesPaths.add({
                    'sentry': r._fields[0],
		    'count': r._fields[1].getLowBits(),
                    'length': r._fields[2].getLowBits(),
		    'paths': r._fields[3]
                })
            }
            return sentriesPaths;
        } catch (e) {
            console.log(e);
        } finally {
            // Completed!
            session.close();
        }
        return []
    });


    // API to know mean path length to sentries
    this.getSentriesPathsLengthsMean = (uid) => co(function*() {
    const session = that.db.session();
    try {
            // Calculte number of reachable sentries for each step
            const result = yield session.run({text:
                "WITH  {uid} as uid\n\
                MATCH (n {sentry : 1} )\n\
                WHERE NOT n.uid = uid\n\
                WITH count(n) as count_n, uid\n\
                MATCH p=ShortestPath((member {uid:uid}) <-[*]-(r_sentry {sentry : 1}))\n\
                RETURN uid, 1.0 * SUM(length(p)) / count(p)",
            parameters: {
                uid: uid
            }});

            const sentriesPathsLengthsMean = [];

            for(const r of result.records) {
        
                //console.log(r._fields);
                sentriesPathsLengthsMean.add({
                'uid': r._fields[0],
                'mean': r._fields[1]
                 })
            }
            return sentriesPathsLengthsMean;

        } catch (e) {
            console.log(e);
        } finally {
            // Completed!
            session.close();
        }
        return []
    });

    // API for percent of reachable sentries

    this.getSentriesPathsLengths = (uid) => co(function*() {
        const session = that.db.session();
        try {

            // Get stepmax
            const stepMax = duniterServer.conf.stepMax;

            // Calculte number of reachable sentries for each step
            const result = yield session.run({text:
                "WITH  {uid} as uid\n\
                MATCH (n {sentry : 1} )\n\
                WHERE NOT n.uid = uid\n\
                WITH count(n) as count_n, uid\n\
                UNWIND range(1,{stepMax}) as steps\n\
                    MATCH p=ShortestPath((member {uid:uid}) <-[*]-(r_sentry {sentry : 1}))\n\
                    WITH member, count_n, r_sentry, p, steps\n\
                    WHERE length(p) = steps\n\
                    RETURN member.uid,count_n as nb_sentries, steps, count(r_sentry) as reachable_sentries, 100.0 * count(r_sentry) / count_n AS percent",
                parameters: {
                    uid: uid,
                    stepMax: stepMax}});


            const sentriesPathsLengths = [];
                for(const r of result.records) {
        
                    //console.log(r._fields);

                    sentriesPathsLengths.add({
                        'nb_steps': r._fields[2].getLowBits(),
                        'nb_reachable_sentries': r._fields[3].getLowBits(),
                        'percent': r._fields[4]
                    })
                }
                return sentriesPathsLengths;
        } catch (e) {
            console.log(e);
        } finally {
            // Completed!
            session.close();
        }
        return []
    });


    this.refreshWoT = () => co(function*() {
        const session = that.db.session();
        try {
            yield session.run("MATCH (n) DETACH\nDELETE n");
            console.log("Select identities");
            const identities = yield duniterServer.dal.idtyDAL.query('SELECT `pub`, `uid`,`member`,`created_on`,`written_on` FROM i_index;');
            console.log(identities);

	    // Get members count
	    const head = yield duniterServer.dal.getCurrentBlockOrNull();
	    const membersCount = head ? head.membersCount : 0;

	    // Calculate cert number required to become sentry
	    let dSen;
	    dSen = Math.ceil(Math.pow(membersCount, 1 / duniterServer.conf.stepMax));

            for(const idty in identities) {
                yield session.run({
                    text: "CREATE (n:Idty { pubkey: {pubkey}, uid: {uid}, member: {member}, created_on: {created_on}, written_on: {written_on}, sentry: {sentry} })",
                    parameters: {
                        pubkey: identities[idty].pub,
                        uid: identities[idty].uid,
                        member: identities[idty].member,
			created_on: identities[idty].created_on.split("-",1),
			written_on: identities[idty].written_on.split("-",1),
			sentry: "0"
                    }
                });
           }
            const certs = yield duniterServer.dal.certDAL.query('SELECT `issuer`,`receiver`,`created_on`,`written_on` FROM c_index;');
            console.log(certs);
            for(const c in certs) {
                yield session.run({text:"MATCH (u:Idty { pubkey:{issuer} }), (r:Idty { pubkey:{receiver} })\n\
    				CREATE (u)-[c:CERTIFY { created_on: {created_on}, written_on: {written_on} } ]->(r)",
                        parameters:{
                            issuer: certs[c].issuer,
                            receiver: certs[c].receiver,
			    created_on: certs[c].created_on.split("-",1),
			    written_on: certs[c].written_on.split("-",1)
                        }
                });
            }
            console.log("Done");

		// Pre-Compute Sentries

            yield session.run({
                text: "MATCH (i) --> (sentry)\n\
			WITH sentry, count(i) as count_i\n\
			WHERE count_i >= {dSen}\n\
			MATCH (sentry) --> (r)\n\
			WITH sentry, count(r) as count_r, count_i\n\
			WHERE count_r >= {dSen}\n\
			SET sentry.sentry = 1",
                    parameters: {
                        dSen: dSen
                 }
             });

	   // Pre-Compute number of issued sigs for each member

            yield session.run({
                text: "MATCH (member)\n\
			WITH member\n\
			OPTIONAL MATCH (member) --> (i)\n\
			WITH member, (CASE WHEN count(i) is Null THEN 0 ELSE count(i) END ) as count_i\n\
			SET member.nb_issued_sig = count_i"
             });


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
                neo4j.auth.basic(duniterServer.conf.neo4j.user, duniterServer.conf.neo4j.password));

            yield that.refreshWoT();
            that.db.onError = (error) => {
                console.log(error);
            };
            duniterServer
                .pipe(es.mapSync((data) => co(function*(){
                    try {
                        // Broadcast block
                        if (data.joiners) {
                            yield that.refreshWoT();
                        }
                    } catch (e) {
                        console.log(e);
                    }
                }))
                );

        } catch (e) {
            console.log(e);
        }

    });
}
