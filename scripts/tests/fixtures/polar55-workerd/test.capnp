using Workerd = import "/workerd/workerd.capnp";
const config :Workerd.Config = (
  services = [
    (name = "main", worker = (
      modules = [(name = "worker.mjs", esModule = embed "worker.mjs")],
      compatibilityDate = "2026-10-01",
      compatibilityFlags = ["nodejs_compat"],
      bindings = [(name = "KINO_POLAR55_ENABLED", text = "true"), (name = "KINO_POLAR55_READ_TOKEN", text = "offline_fixture_token_offline_fixture_token_offline_fixture_token_")],
      globalOutbound = "fixture"
    )),
    (name = "fixture", worker = (
      modules = [(name = "mock.mjs", esModule = embed "mock.mjs")],
      compatibilityDate = "2026-10-01",
      globalOutbound = "internet"
    )),
    (name = "internet", network = (allow = []))
  ]
);
