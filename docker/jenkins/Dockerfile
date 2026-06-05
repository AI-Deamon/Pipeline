FROM jenkins/jenkins:2.541.3

USER root

COPY tools.sh /usr/local/bin/tools.sh
RUN bash /usr/local/bin/tools.sh && rm /usr/local/bin/tools.sh

COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt

COPY mcp-server.hpi /usr/share/jenkins/ref/plugins/mcp-server.jpi

ENV JAVA_OPTS="-Djava.awt.headless=true -Xmx7g -Xms512m"

USER jenkins
