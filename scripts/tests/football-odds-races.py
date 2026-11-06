"""Independent-session races. Local network-isolated Docker or labelled Supabase CI only."""
import concurrent.futures,json,os,re,subprocess,sys
name=sys.argv[1]
if not re.fullmatch(r"[a-zA-Z0-9_-]+",name):raise SystemExit("Invalid container")
host=os.environ.get("DOCKER_HOST","")
if host and not (host.startswith("npipe://") or host.startswith("unix://")):raise SystemExit("Remote Docker forbidden")
context=json.loads(subprocess.check_output(["docker","context","inspect"],text=True))[0]
endpoint=context["Endpoints"]["docker"]["Host"]
if not endpoint.startswith(("unix://","npipe://")):raise SystemExit("Remote Docker context forbidden")
meta=json.loads(subprocess.check_output(["docker","inspect",name],text=True))[0]
labels=meta["Config"].get("Labels") or {}
if meta["HostConfig"].get("NetworkMode")!="none" and not (name.startswith("supabase_db_") and labels.get("com.supabase.cli.project")==name.removeprefix("supabase_db_")):raise SystemExit("Disposable isolated DB required")
def sql(s):return subprocess.check_output(["docker","exec","-i",name,"psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-tA","-c",s],text=True).strip()
# Only new private quota fixtures. This test never accepts a remote URL or production SQL connection.
sql("TRUNCATE public.private_football_odds_feed,public.private_football_odds_budget,public.private_football_odds_attempts;")
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
 statuses=list(pool.map(lambda _:json.loads(sql("SELECT public.claim_private_football_odds_feed();"))["status"],range(12)))
assert statuses.count("claimed")==1 and statuses.count("busy")==11,statuses
assert sql("SELECT requests FROM public.private_football_odds_budget;")=="1"
sql("TRUNCATE public.private_football_odds_feed,public.private_football_odds_budget,public.private_football_odds_attempts; INSERT INTO public.private_football_odds_budget VALUES(date_trunc('month',now() AT TIME ZONE 'UTC')::date,199);")
files=["site_pregame_stoiximan_soccer_leagues.json","site_pregame_stoiximan_soccer.json"]
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 statuses=list(pool.map(lambda f:json.loads(sql("SELECT public.claim_private_football_odds_feed('"+f+"');"))["status"],files))
assert sorted(statuses)==["claimed","quota_exhausted"],statuses
assert sql("SELECT requests FROM public.private_football_odds_budget;")=="200"
sql("TRUNCATE public.private_football_odds_feed,public.private_football_odds_budget,public.private_football_odds_attempts;")
print("PASS: 12 independent sessions reserve once; two feeds cannot race past the last quota slot")
