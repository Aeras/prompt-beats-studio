import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { polarRequest } from "./kino-polar55.shared";

export const queryPrivateKinoPolar55 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => polarRequest.parse(input))
  .handler(async ({ context, data }) => {
    const authorize = async () => {
      const { data: account, error } = await context.supabase.rpc("get_my_account_status");
      if (
        error ||
        !account ||
        typeof account !== "object" ||
        Array.isArray(account) ||
        account["status"] !== "active" ||
        account["is_banned"] !== false
      )
        throw Error("Not allowed");
      const role = await context.supabase.rpc("current_user_is_super_admin");
      if (role.error || role.data !== true) throw Error("Not allowed");
    };
    await authorize();
    const { readPolar55 } = await import("./kino-polar55.server");
    const result = await readPolar55(context.userId, data);
    await authorize();
    return result;
  });
