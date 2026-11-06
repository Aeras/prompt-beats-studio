"""Synthetic local admission races only; never accepts a remote DB URL or production credentials."""
import concurrent.futures
import json
import os
import re
import subprocess
import sys
import uuid

name = sys.argv[1]
database = sys.argv[2] if len(sys.argv) > 2 else "postgres"
if not re.fullmatch(r"[a-zA-Z0-9_-]+", name) or not re.fullmatch(r"(?:postgres|football_compact_[0-9]+)", database):
    raise SystemExit("Invalid local test target")
host = os.environ.get("DOCKER_HOST", "")
if host and not host.startswith(("npipe://", "unix://")):
    raise SystemExit("Remote Docker forbidden")
context = json.loads(subprocess.check_output(["docker", "context", "inspect"], text=True))[0]
if not context["Endpoints"]["docker"]["Host"].startswith(("npipe://", "unix://")):
    raise SystemExit("Remote Docker context forbidden")
meta = json.loads(subprocess.check_output(["docker", "inspect", name], text=True))[0]
labels = meta["Config"].get("Labels") or {}
if meta["HostConfig"].get("NetworkMode") != "none" and not (
    name.startswith("supabase_db_") and labels.get("com.supabase.cli.project") == name.removeprefix("supabase_db_")
):
    raise SystemExit("Disposable isolated DB required")

def sql(statement):
    return subprocess.run(["docker", "exec", "-i", name, "psql", "-U", "postgres", "-d", database,
                           "-v", "ON_ERROR_STOP=1", "-tA", "-c", statement], capture_output=True, text=True)

def checked(statement):
    r = sql(statement)
    if r.returncode:
        raise RuntimeError("Synthetic SQL test failed: " + r.stderr)
    return r.stdout.strip()

user = str(uuid.uuid4())
request = str(uuid.uuid4())
checked(f"INSERT INTO auth.users(id,email) VALUES('{user}','football-race@example.invalid'); INSERT INTO public.user_roles(user_id,role,moderation_status) VALUES('{user}','super_admin','active') ON CONFLICT (user_id) DO UPDATE SET role=excluded.role,moderation_status=excluded.moderation_status;")
try:
    checked(f"INSERT INTO public.private_football_research_runs(user_id,request_key,fixture_id,league_id,home_team,away_team,kickoff_utc,model_id,status) SELECT '{user}',gen_random_uuid(),n,'IT-SA','Home','Away','2099-11-08T19:45:00Z','offline','failed' FROM generate_series(1,6)n;")
    def claim(key):
        return sql(f"SELECT public.claim_private_football_research_run_v2('{user}','{key}',999,'IT-SA','Home','Away','2099-11-08T19:45:00Z','offline','espn');")
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        responses = list(pool.map(claim, [request] * 8))
    assert all(r.returncode == 0 for r in responses)
    receipts = [json.loads(r.stdout) for r in responses]
    assert sum(r["status"] == "claimed" for r in receipts) == 1
    assert len({r["id"] for r in receipts}) == 1
    assert checked(f"SELECT count(*) FROM public.private_football_research_runs WHERE user_id='{user}' AND status='processing';") == "1"
    checked(f"UPDATE public.private_football_research_runs SET status='failed',completed_at=now(),error_code='offline_test' WHERE user_id='{user}' AND status='processing';")
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        responses = list(pool.map(claim, [str(uuid.uuid4()) for _ in range(8)]))
    assert sum(r.returncode == 0 for r in responses) == 1
    assert all(r.returncode == 0 or 'already processing' in r.stderr for r in responses)
    for signature in [
        "claim_private_football_research_run(uuid,uuid,bigint,text,text,text,timestamptz,text)",
        "claim_private_football_research_run_v2(uuid,uuid,bigint,text,text,text,timestamptz,text,text)",
        "claim_private_football_ai_research_run(uuid,uuid,bigint,text)",
    ]:
        assert checked(f"SELECT NOT has_function_privilege('anon','public.{signature}','EXECUTE') AND NOT has_function_privilege('authenticated','public.{signature}','EXECUTE') AND has_function_privilege('service_role','public.{signature}','EXECUTE');") == "t"
    print("PASS: uncapped admission after six historical attempts; 8 duplicate sessions claim once; 8 distinct sessions admit one active run; three RPC ACLs preserved")
finally:
    checked(f"DELETE FROM public.private_football_research_runs WHERE user_id='{user}'; DELETE FROM public.user_roles WHERE user_id='{user}'; DELETE FROM auth.users WHERE id='{user}';")
