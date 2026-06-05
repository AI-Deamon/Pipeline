# Quickstart: Containerized Jenkins

## Build the image

```bash
docker compose -f docker/docker-compose.jenkins.yml build
```

## Start Jenkins

```bash
docker compose -f docker/docker-compose.jenkins.yml up -d
```

Jenkins will be available at `http://localhost:8080`.

## Stop Jenkins

```bash
docker compose -f docker/docker-compose.jenkins.yml down
```

Data in `jenkins_home` volume is preserved.

## Full restart (keep data)

```bash
docker compose -f docker/docker-compose.jenkins.yml restart
```

## View logs

```bash
docker compose -f docker/docker-compose.jenkins.yml logs -f
```

## Check status

```bash
docker compose -f docker/docker-compose.jenkins.yml ps
```

## Migration from systemd Jenkins

### Prerequisites
- Docker and Docker Compose installed
- `docker/jenkins/` directory present with Dockerfile, plugins.txt, tools.sh
- `docker/docker-compose.jenkins.yml` present

### Migration Steps

1. **Back up and stop systemd Jenkins**:
   ```bash
   sudo systemctl stop jenkins
   sudo cp -a /var/lib/jenkins /tmp/jenkins-backup-$(date +%Y%m%d)
   ```

2. **Build the Docker image** (first time only):
   ```bash
   docker compose -f docker/docker-compose.jenkins.yml build
   ```

3. **Create the Docker volume and populate it**:
   ```bash
   # Remove old volume if exists (WARNING: destroys existing data)
   docker volume rm jenkins_home 2>/dev/null || true
   docker volume create jenkins_home
   # Copy data into the volume
   docker run --rm -v jenkins_home:/target -v /tmp/jenkins-backup-$(date +%Y%m%d):/source alpine \
     sh -c "cp -a /source/. /target/"
   ```

4. **Start the Docker Jenkins**:
   ```bash
   docker compose -f docker/docker-compose.jenkins.yml up -d
   ```

5. **Verify all data is intact**:
   - Open `http://localhost:8080`
   - Check all jobs, credentials, and build history are present
   - Run a test pipeline to verify tools (ZAP, Trivy, etc.) work

### Rollback

If migration fails, restore systemd Jenkins:
```bash
docker compose -f docker/docker-compose.jenkins.yml down
sudo systemctl start jenkins
```

### Automate with migration script

```bash
# From the repository root:
bash docker/jenkins/migrate.sh
```

## Deploy to a new server

1. Copy `docker/docker-compose.jenkins.yml` and `docker/jenkins/` to the new server
2. Copy the JENKINS_HOME volume data to the new server (or use `docker volume create` + `docker run --rm` to transfer)
3. Run `docker compose -f docker/docker-compose.jenkins.yml up -d`
4. Access at `http://<new-server>:8080`
