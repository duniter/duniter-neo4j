
# Install Java8 Runtime with PPA

Cf http://tecadmin.net/install-java-8-on-debian/


echo "deb http://httpredir.debian.org/debian jessie-backports main" | sudo tee -a /etc/apt/sources.list.d/jessie-backports.list
sudo apt-get update
apt-get install java8-runtime


http://tecadmin.net/install-java-8-on-debian/

1. Add Java 8 PPA

First, you need to add webupd8team Java PPA repository in your system. Edit a new PPA file /etc/apt/sources.list.d/java-8-debian.list in text editor

$ sudo vim /etc/apt/sources.list.d/java-8-debian.list
and add following content in it.

deb http://ppa.launchpad.net/webupd8team/java/ubuntu trusty main
deb-src http://ppa.launchpad.net/webupd8team/java/ubuntu trusty main
Now import GPG key on your system for validating packages before installing them.

$ sudo apt-key adv --keyserver keyserver.ubuntu.com --recv-keys EEA14886

2. Install Java 8

Now use the following commands to update apt cache and then install Java 8 on your Debian system.

$ sudo apt-get update
$ sudo apt-get install oracle-java8-installer
3. Verify Java Version

At this stage, you have successfully installed oracle Java on your Debian system. Let’s use the following command to verify installed version of Java on your system.

rahul@tecadmin:~$ java -version

java version "1.8.0_121"
Java(TM) SE Runtime Environment (build 1.8.0_121-b13)
Java HotSpot(TM) 64-Bit Server VM (build 25.121-b13, mixed mode, sharing)

4. Configure Java Environment

In Webupd8 PPA repository also providing a package to set environment variables, Install this package using the following command.

$ sudo apt-get install oracle-java8-set-default



# Install Neo4j


echo 'deb https://debian.neo4j.org/repo stable/' | sudo tee /etc/apt/sources.list.d/neo4j.list
deb https://debian.neo4j.org/repo stable/

wget -O - https://debian.neo4j.org/neotechnology.gpg.key | sudo apt-key add -

apt-get update

apt-get install neo4j

Connect to browser http://127.0.0.1:7474, create an account.



# Install Yarn

   54  curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | sudo apt-key add -
   55  echo "deb https://dl.yarnpkg.com/debian/ stable main" | sudo tee /etc/apt/sources.list.d/yarn.list
   56  sudo apt-get update && sudo apt-get install yarn



# Install Node with NVM

curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.31.1/install.sh | bash
source /home/neven/.bashrc
nvm install 6


# Install Duniter-Neo4j

apt-get install build-essential

git clone https://github.com/duniter/duniter-neo4j.git
cd duniter-neo4j/
yarn

neven@vps373665:~/duniter-neo4j$ yarn
yarn install v0.19.1
info No lockfile found.
warning duniter-neo4j@0.0.1: License should be a valid SPDX license expression
[1/4] Resolving packages...
warning duniter > duniter-prover > node-uuid@1.4.7: use uuid module instead
warning duniter > request > node-uuid@1.4.7: use uuid module instead
warning duniter > duniter-ui > request > node-uuid@1.4.7: use uuid module instead
warning duniter > duniter-ui > request > tough-cookie@0.9.15: ReDoS vulnerability parsing Set-Cookie https://nodesecurity.io/advisories/130
[2/4] Fetching packages...
warning fsevents@1.0.17: The platform "linux" is incompatible with this module.
info "fsevents@1.0.17" is an optional dependency and failed compatibility check. Excluding it from installation.
[3/4] Linking dependencies...
warning "bl@0.7.0" has unmet peer dependency "stream-browserify@*".
[4/4] Building fresh packages...
success Saved lockfile.
Done in 20.72s.

En cas de plantages de modules tels que :

neven@vps373665:~/duniter-neo4j$ node index.js config --autoconf
2017-02-09T11:48:30+01:00 - debug: Plugging file system...
2017-02-09T11:48:30+01:00 - error: Unhandled rejection: Error: Cannot find module '/home/neven/duniter-neo4j/node_modules/wotb/lib/binding/Release/node-v48-linux-x64/wo


Aller dans node_modules/<nom_du_module> et faire un yarn.

