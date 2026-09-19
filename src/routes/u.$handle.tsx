import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/u/$handle")({
  beforeLoad: ({ params }) => {
    const clean = params.handle.replace(/^@/, "");
    throw redirect({
      to: "/$handle",
      params: { handle: `@${clean}` },
      replace: true,
    });
  },
});
