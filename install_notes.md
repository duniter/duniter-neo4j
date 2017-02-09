
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



