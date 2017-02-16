# duniter-neo4j

An API to request the WoT throught Neo4j graph database.

Requires Node.js v6
Requires Neo4j Database
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


## API


### Paths lengths to sentries

URI : /neo4j/sentries/pathslengths/[uid]

Description : Check how many sentries are reachable at step one, then at step two, etc... (limit at stepmax)
Calculate Percentage of reachable sentries / total sentries


Exemple of Result :

    {
        nb_steps: 3,
        nb_reachable_sentries: 6,
        percent: 31.57894736842105
    },
    {
        nb_steps: 1,
        nb_reachable_sentries: 2,
        percent: 10.526315789473685
    },
    {
        nb_steps: 2,
        nb_reachable_sentries: 11,
        percent: 57.89473684210526
    }


### Average Paths Lengths to xpercent of sentries

URI : /neo4j/sentries/pathslengthsmean/[uid]

Description : Calculate the mean length path to reach xpercent of sentries. 
Exemple Result :

    {
        uid: "Alfybe",
        mean: 2.210526315789474
    }

### Paths

URI : /neo4j/sentries/paths/[uid]

Description : For each sentry, check all shortest paths, returns number of possible , length of paths then paths.

Exemple of Results :

    {
        sentry: "gerard94",
        count: 5,
        length: 2,
        paths: [
            [ "Mententon" ], ["Galuel"], ["JeanFerreira"], ["gnu-tux"],["kimamila"]
        ]
    },
    {
        sentry: "DebOrah",
        count: 5,
        length: 2,
        paths: [
            ["Mententon"],["Galuel"],["JeanFerreira"],["elois"],["stanlog"]
        ]
    }
    ...


### Recommendations of signers for a newcomer

URI: /neo4j/recommendations/signers/:uid/:steps/:uid2

Description : For a newcomer who knows only one member :uid, this API give potential signers at :steps of the known member wich will allow him to reach a maximum of sentries. If he knows a second member, he can also put it in parameters as :uid2

Exemple :

I know inso, and I want to know wich member at one step of inso who could sign me.

/neo4j/recommendations/signers/inso/1/none

	{
		referring_member: "inso",
		optionnal_second_member: null,
		recommended_member: "JeanFerreira",
		percent_sentries: 100
	},
	{
		referring_member: "inso",
		optionnal_second_member: null,
		recommended_member: "urodelus",
		percent_sentries: 100
	},

If I know two members, let's say vit and urodelus, I call :

/neo4j/recommendations/signers/vit/1/urodelus

	{
		referring_member: "vit",
		optionnal_second_member: "urodelus",
		recommended_member: "Galuel",
		percent_sentries: 100
	},
	{
		referring_member: "vit",
		optionnal_second_member: "urodelus",
		recommended_member: "moul",
		percent_sentries: 100
	}




