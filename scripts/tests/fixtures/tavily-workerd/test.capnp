using Workerd = import "/workerd/workerd.capnp";
const config :Workerd.Config = (
  services = [
    (name = "main", worker = (
      modules = [(name = "worker.mjs", esModule = embed "worker.mjs")],
      compatibilityDate = "2026-10-01",
      compatibilityFlags = ["nodejs_compat"],
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
