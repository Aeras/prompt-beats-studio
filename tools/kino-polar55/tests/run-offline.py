"""Disposable local Docker only. No host ports, production URL, credentials or OPAP."""
import json
import os
from pathlib import Path
import re
import subprocess
import time
import uuid

root = Path(__file__).resolve().parents[1]
def run(*args, capture=False):
    return subprocess.run(args, check=True, text=True, encoding="utf-8", capture_output=capture)

if os.environ.get("DOCKER_HOST") or os.environ.get("DOCKER_CONTEXT"):
    raise SystemExit("Use the verified default local Docker context")
context = json.loads(run("docker", "context", "inspect", capture=True).stdout)[0]
host = context["Endpoints"]["docker"]["Host"]
if not host.startswith(("unix://", "npipe://")):
    raise SystemExit("Local Docker endpoint required")
image = "php:8.3-cli@sha256:600bce7c7acf524756e5aac989f4a763aed709960d7326970bb670f46efee53a"
db_image = "mariadb:11.4@sha256:d1891ede5a559f1086f55053bb8cc1569b0298338c4d72d71725a7f74f6ba620"
mount = f"type=bind,source={root.as_posix()},target=/src,readonly"
for file in sorted(root.rglob("*.php")):
    run("docker", "run", "--rm", "--network", "none", "--mount", mount, image, "php", "-l", "/src/" + file.relative_to(root).as_posix())
for name in ["core-offline.php", "http-offline.php", "backfill-offline.php", "review-offline.php"]:
    run("docker", "run", "--rm", "--network", "none", "--memory", "128m", "--cpus", "1", "--mount", mount, image, "php", "-d", "memory_limit=64M", "/src/tests/" + name)
tag = "pb-kino-php-test:" + uuid.uuid4().hex[:12]
run("docker", "build", "-t", tag, str(root / "tests"))
network = container = volume = None
try:
    volume_name = "pb-kino-socket-" + uuid.uuid4().hex[:12]
    volume = run("docker", "volume", "create", volume_name, capture=True).stdout.strip()
    if volume != volume_name: raise RuntimeError("Unexpected fixture volume")
    network = run("docker", "network", "create", "--internal", "pb-kino-" + uuid.uuid4().hex[:12], capture=True).stdout.strip()
    if not re.fullmatch(r"[a-f0-9]{64}", network): raise RuntimeError("Unexpected network ID")
    container = run("docker", "run", "-d", "--network", network, "--tmpfs", "/var/lib/mysql:rw,size=512m", "--mount", "type=volume,source=" + volume + ",target=/run/mysqld", "-e", "MARIADB_ALLOW_EMPTY_ROOT_PASSWORD=1", db_image, capture=True).stdout.strip()
    if not re.fullmatch(r"[a-f0-9]{64}", container): raise RuntimeError("Unexpected container ID")
    for attempt in range(60):
        ready = subprocess.run(["docker", "exec", container, "healthcheck.sh", "--connect", "--innodb_initialized"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if ready.returncode == 0: break
        time.sleep(1)
    else: raise RuntimeError("Fixture MariaDB not ready")
    run("docker", "run", "--rm", "--network", "container:" + container, "--memory", "128m", "--cpus", "1", "-e", "KINO_DISPOSABLE_FIXTURE=1", "--mount", mount, "--mount", "type=volume,source=" + volume + ",target=/run/mysqld,readonly", tag, "php", "-d", "memory_limit=64M", "-d", "pdo_mysql.default_socket=/run/mysqld/mysqld.sock", "/src/tests/database-offline.php")
finally:
    if container and re.fullmatch(r"[a-f0-9]{64}", container): run("docker", "rm", "-f", container)
    if network and re.fullmatch(r"[a-f0-9]{64}", network): run("docker", "network", "rm", network)
    if volume and re.fullmatch(r"pb-kino-socket-[a-f0-9]{12}", volume): run("docker", "volume", "rm", volume)
print("POLAR55_OFFLINE_ACCEPTANCE_PASS")
